<script lang="ts">
	import DeskHorizon from '#lib/ambience/DeskHorizon.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import CheatBody from '#lib/CheatBody.svelte';
	import CheatSheet from '#lib/CheatSheet.svelte';
	import Coach from '#lib/Coach.svelte';
	import CodeEditor from '#lib/CodeEditor.svelte';
	import TimeGlyph from '#lib/TimeGlyph.svelte';
	import SessionCard from '#lib/debrief/SessionCard.svelte';
	import { renderInline } from '#lib/inline.ts';
	import { mmss } from '#lib/rank.ts';
	import { COACH_NAME } from '#lib/core/coach.ts';
	import { LEVELS, TOPICS, type JudgeResult } from '#lib/core/lang.ts';
	import { groupStages } from '#lib/core/study.ts';
	import type { LangHintResponse, LangKind, LangLookupResponse, LangRunResponse, LangSessionData } from '#lib/types.ts';
	import { t, label } from '#lib/i18n.svelte.ts';

	let { data }: { data: LangSessionData } = $props();

	const p = $derived(data.problem);
	const s = $derived(data.session);
	const fin = $derived(s.finished);

	// server time = Date.now() + skew, measured when this data was loaded
	let skew = 0;
	let nowSec = $state(untrack(() => Math.floor(data.now)));
	let wall = $state(Date.now());
	$effect(() => {
		skew = data.now - Date.now() / 1000;
		nowSec = Math.floor(data.now);
	});
	const remaining = $derived(p.limitSec - Math.max(0, nowSec - s.startedAt)); // < 0 = overtime
	const over = $derived(remaining < 0);

	let timer: ReturnType<typeof setInterval> | undefined;
	function clear() {
		clearInterval(timer);
		timer = undefined;
	}
	$effect(() => {
		if (fin) return;
		timer = setInterval(() => {
			nowSec = Math.floor(Date.now() / 1000 + skew);
			wall = Date.now();
		}, 500);
		return clear;
	});
	onDestroy(clear);

	// per-session UI state; reset when the session changes (navigation, restart)
	let code = $state('');
	let runResult = $state<JudgeResult | undefined>(undefined);
	let hintsLocal = $state<string[]>([]);
	let error = $state('');
	let running = $state(false);
	let runStart = 0;
	let hinting = $state(false);
	let confirming = $state(false);
	let refsLocal = $state<string[]>([]);
	let intentLocal = $state<string | null>(null);
	let givenOpen = $state(false);
	let sent = new Set<string>(); // entry ids already reported as looked up in this session
	let lastId = -1;
	let lastLocale: string | undefined;
	$effect(() => {
		const locale = page.data.locale;
		if (locale !== lastLocale) {
			lastLocale = locale;
			runResult = undefined;
			hintsLocal = [];
			intentLocal = null;
			error = '';
		}
	});
	$effect(() => {
		const id = s.id;
		if (id === lastId) return;
		lastId = id;
		untrack(() => {
			code = s.code;
			runResult = undefined;
			hintsLocal = [];
			refsLocal = [];
			intentLocal = null;
			givenOpen = givenLines <= GIVEN_OPEN_MAX;
			sent = new Set();
			error = '';
			running = false;
			confirming = false;
		});
	});

	const result = $derived(runResult ?? s.lastResult);
	const intent = $derived(intentLocal ?? s.intent);
	const GIVEN_OPEN_MAX = 25;
	const givenLines = $derived(p.given ? p.given.replace(/\n$/, '').split('\n').length : 0);
	const hints = $derived(hintsLocal.length > s.hints.length ? hintsLocal : s.hints);
	const refs = $derived(refsLocal.length ? refsLocal : s.refs);
	const slow = $derived(running && wall - runStart > 4000);

	async function run() {
		if (running || fin) return;
		running = true;
		runStart = Date.now();
		wall = runStart;
		if (!timer) timer = setInterval(() => (wall = Date.now()), 500);
		const id = s.id;
		const locale = page.data.locale;
		try {
			const res = await fetch(`/lang/${p.id}/run`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code })
			});
			const j = (await res.json()) as LangRunResponse;
			if (id !== s.id) return;
			if (locale !== page.data.locale) {
				await invalidateAll();
				return;
			}
			error = j.error ?? (res.ok ? '' : t(`실행 실패 (${res.status})`, `Run failed (${res.status})`));
			if (j.result && !j.error) runResult = j.result;
			if (j.finished) await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
			if (fin && timer) clear();
		}
	}

	async function hint() {
		if (hinting || hints.length >= 2) return;
		hinting = true;
		const id = s.id;
		const locale = page.data.locale;
		try {
			const res = await fetch(`/lang/${p.id}/hint`, { method: 'POST' });
			const j = (await res.json()) as Partial<LangHintResponse>;
			if (id !== s.id) return;
			if (locale !== page.data.locale) {
				await invalidateAll();
				return;
			}
			if (j.hints) hintsLocal = j.hints;
			if (j.refs) refsLocal = j.refs;
			if (j.intent) intentLocal = j.intent;
			error = j.error ?? (res.ok ? '' : t(`힌트 실패 (${res.status})`, `Hint failed (${res.status})`));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			hinting = false;
		}
	}

	// ---- Debrief marks: while the session is open, the page notes when it is hidden/shown and when input stops for a minute / resumes.
	// Only times are sent, never what was typed.
	const IDLE_MS = 60_000;
	$effect(() => {
		if (fin) return;
		const pid = p.id;
		const send = (kind: 'away' | 'back' | 'idle' | 'active') =>
			fetch(`/lang/${pid}/mark`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
		let last = Date.now();
		let idle = false;
		const input = () => {
			last = Date.now();
			if (idle) {
				idle = false;
				send('active');
			}
		};
		const visibility = () => {
			if (document.hidden) send('away');
			else {
				send('back');
				idle = false;
				last = Date.now();
			}
		};
		const tick = setInterval(() => {
			if (!document.hidden && !idle && Date.now() - last >= IDLE_MS) {
				idle = true;
				send('idle');
			}
		}, 5000);
		const opts = { capture: true, passive: true };
		window.addEventListener('keydown', input, opts);
		window.addEventListener('pointerdown', input, opts);
		window.addEventListener('wheel', input, opts);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			clearInterval(tick);
			window.removeEventListener('keydown', input, opts);
			window.removeEventListener('pointerdown', input, opts);
			window.removeEventListener('wheel', input, opts);
			document.removeEventListener('visibilitychange', visibility);
		};
	});

	// ---- cheat sheet panel ----
	const byId = $derived(new Map(data.cheat.map((e) => [e.id, e])));
	const related = $derived(refs.flatMap((id) => byId.get(id) ?? []));
	const looked = $derived((fin?.lookedUp ?? []).flatMap((id) => byId.get(id)?.title ?? []));
	let panelOpen = $state(false);
	let tab = $state<'cheat' | 'coach'>('cheat');
	let coachSeen = $state(false); // mount the Operator panel on first use, then keep it
	$effect(() => {
		if (panelOpen && tab === 'coach') coachSeen = true;
	});
	// access changes when the session finishes or restarts: re-fetch the thread
	const coachKey = $derived(`${s.id}:${fin ? 1 : 0}`);
	let reveal = $state<{ id: string; n: number } | null>(null);
	let sheet: { focusSearch: () => void } | undefined;

	function openPanel() {
		tab = 'cheat';
		panelOpen = true;
	}
	function openCoach() {
		tab = 'coach';
		panelOpen = true;
	}
	function openRef(id: string) {
		tab = 'cheat';
		panelOpen = true;
		reveal = { id, n: (reveal?.n ?? 0) + 1 };
	}
	function lookup(entryId: string) {
		if (fin || sent.has(entryId)) return;
		sent.add(entryId);
		fetch(`/lang/${p.id}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entryId }) })
			.then((r) => r.json() as Promise<LangLookupResponse>)
			.catch(() => {});
	}
	function keys(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			e.stopPropagation(); // keep the editor's own Ctrl-K binding out of it
			if (panelOpen && tab === 'cheat') panelOpen = false;
			else {
				openPanel();
				sheet?.focusSearch();
			}
		} else if (e.key === 'Escape' && panelOpen) {
			panelOpen = false;
		}
	}

	const kindLabel = (kind: LangKind) => kind === 'write' ? '' : kind === 'fix' ? t('버그 수정', 'Fix bug') : kind === 'refactor' ? t('리팩터링', 'Refactor') : t('완성', 'Complete');
	const reason = $derived(result && result.status === 'failed' && result.cases.length > 0 && result.cases.every((c) => c.status === 'ok') && result.output ? result.output : '');
	const stages = $derived(result ? groupStages(result.cases) : []);
	const statusLabel = (status: JudgeResult['status']) => status === 'passed' ? t('통과', 'Passed') : status === 'failed' ? t('실패', 'Failed') : status === 'compile_error' ? t('컴파일 오류', 'Compile error') : t('시간 초과: 실행이 너무 오래 걸렸습니다', 'Time expired: execution took too long');
	const MARK = { ok: '✓', fail: '✗', error: '!' } as const;
	const outcomeText = $derived(
		!fin ? '' : fin.outcome === 'passed' ? `${t('통과', 'Passed')} · ${mmss(fin.elapsedSec)}${fin.overtime ? ` (${t('제한시간 초과', 'over time')})` : ''}` : t('답을 확인함', 'Solution viewed')
	);
</script>

<svelte:head><title>{p.title} · Matrix</title></svelte:head>

<svelte:window onkeydowncapture={keys} />

{#if !fin}<DeskHorizon />{/if}

<div class="lang-split" class:with-cheat={panelOpen}>
	<div class="lang-col">
		<div>
			<a class="note" href="/lang">← {t('목록', 'List')}</a>
			{#if p.book}
				<nav class="lang-crumb" aria-label={t('책 위치', 'Book location')}>
					<a href="/lang/book/{p.book.id}">{p.book.title}</a> ›
					<a href="/lang/book/{p.book.id}">{t(`${p.book.chapter}장`, `Chapter ${p.book.chapter}`)}{p.book.chapterTitle ? ` ${p.book.chapterTitle}` : ''}</a> ›
					<span>{t(`연습 ${p.book.exercise}`, `Exercise ${p.book.exercise}`)}</span>
				</nav>
			{/if}
			<div class="lang-meta">
				<span class="label">{label(LEVELS[p.level])} · {label(TOPICS[p.topic])}</span>
				{#if kindLabel(p.kind)}<span class="kind">{kindLabel(p.kind)}</span>{/if}
			</div>
			<div class="lang-title">
				<h2>{p.book ? p.book.exercise : String(p.order).padStart(2, '0')}. {p.title}</h2>
				{#if fin}
					<span class="lang-clock mono" style="font-size:15px;color:var(--muted)">{mmss(fin.elapsedSec)}</span>
				{:else}
					<TimeGlyph remainingSec={remaining} limitSec={p.limitSec} size={26} />
				{/if}
			</div>
			{#if !fin}<span class="note">{t(`제한 ${mmss(p.limitSec)}`, `Limit ${mmss(p.limitSec)}`)}{over ? ` · ${t('시간이 지났지만 계속 풀 수 있습니다', 'you may continue after the limit')}` : ''}</span>{/if}
		</div>

		{#if p.kind === 'fix'}
			<p class="note lang-kindnote">{t('코드에 버그가 있습니다. 고쳐서 테스트를 통과시키세요.', 'The code has a bug. Fix it to pass the tests.')}</p>
		{:else if p.kind === 'refactor'}
			<p class="note lang-kindnote">{t('동작은 맞습니다.', 'The behavior is correct.')} {@html renderInline(p.avoid.map((w) => `\`${w}\``).join('·'))} {t('없이 다시 쓰세요.', 'Rewrite it without these.')}</p>
		{/if}

		<p class="lang-stmt">{@html renderInline(p.statement)}</p>

		{#if !fin}
			{#if hints.length}
				<div class="lang-col" style="gap:8px">
					{#each hints as h, i (i)}<div class="lang-hint"><span class="label">{t(`힌트 ${i + 1}`, `Hint ${i + 1}`)}</span><br />{@html renderInline(h)}</div>{/each}
					{#if related.length}
						<div class="lang-refs"><span class="label">{t('관련 문법', 'Related syntax')}</span>{#each related as e (e.id)}<button class="chip" type="button" onclick={() => openRef(e.id)}>{e.title}</button>{/each}</div>
					{/if}
					{#if intent}<div class="lang-hint lang-intent"><span class="label">{t('출제 취지', 'Problem intent')}</span><br />{@html renderInline(intent)}</div>{/if}
				</div>
			{/if}
		{/if}

		{#if result}
			<div class="lang-col" style="gap:8px" aria-live="polite">
				<span class="lang-sum" class:ok={result.status === 'passed'} class:no={result.status !== 'passed'}>{statusLabel(result.status)}</span>
				{#each stages as g, gi (gi)}
					{#if g.stage !== null}
						<div class="stage" class:ok={g.ok === g.cases.length} class:no={g.ok < g.cases.length}>{g.stage} {g.ok}/{g.cases.length}</div>
					{/if}
					<div>
						{#each g.cases as c, i (i)}
							<div class="case">
								<span class="mk {c.status}" aria-label={c.status}>{MARK[c.status]}</span>
								<div>{c.name}{#if c.detail}<div class="detail">{c.detail}</div>{/if}</div>
							</div>
						{/each}
					</div>
				{/each}
				{#if reason}
					<span class="label">{t('실패 이유', 'Failure reason')}</span>
					<p class="err" style="margin:0">{@html renderInline(reason)}</p>
				{:else if result.output}
					<span class="label">{result.status === 'compile_error' ? t('컴파일러 출력', 'Compiler output') : t('프로그램 출력', 'Program output')}</span>
					<pre class="lang-out">{result.output}</pre>
				{/if}
			</div>
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}

		{#if fin}
			<div class="lang-done">
				<span class="lang-sum" class:ok={fin.outcome === 'passed'}>{outcomeText}</span>
				{#if fin.targets.length}<div class="tags">{#each fin.targets as t (t)}<span class="tag">{t}</span>{/each}</div>{/if}
				{#if intent}<div class="lang-hint lang-intent big"><span class="label">{t('출제 취지', 'Problem intent')}</span><br />{@html renderInline(intent)}</div>{/if}
				{#if fin.notes}<p class="insight" style="max-width:none;margin:0">{@html renderInline(fin.notes)}</p>{/if}
				{#if fin.avoided.length}
					<p class="note" style="margin:0">{@html renderInline(fin.avoided.map((w) => `\`${w}\``).join(', '))} {t('사용함. 모범 답안은 쓰지 않습니다.', 'used. The reference solution does not use them.')}</p>
				{/if}
				{#if related.length}
					<div class="lang-col" style="gap:8px">
						<span class="label">{t('관련 문법', 'Related syntax')}</span>
						{#each related as e (e.id)}
							<div class="cs-entry"><div class="cs-title">{e.title}</div><CheatBody entry={e} /></div>
						{/each}
					</div>
				{/if}
				<p class="note" style="margin:0">{t('찾아본 문법:', 'Looked up:')} {looked.length ? looked.join(', ') : t('없음', 'none')}</p>
				{#if data.debrief}
					<div class="lang-debrief">{#key data.debrief.id}<SessionCard card={data.debrief} askSelf heading={t('이번 세션 · Debrief', 'This session · Debrief')} />{/key}</div>
				{/if}
				{#if hints.length}
					<details><summary class="note">{t('힌트 다시 보기', 'Review hints')}</summary>
						{#each hints as h, i (i)}<div class="lang-hint" style="margin-top:6px">{@html renderInline(h)}</div>{/each}
					</details>
				{/if}
				<div class="lang-bar">
					<form method="POST" action="?/restart" use:enhance><button class="btn">{t('다시 풀기', 'Try again')}</button></form>
					{#if data.nextId}
						<form method="POST" action="/lang?/start" use:enhance>
							<input type="hidden" name="problemId" value={data.nextId} />
							<button class="btn ghost">{t('다음 문제', 'Next problem')}</button>
						</form>
					{/if}
					{#if p.book}<a class="btn ghost" href="/lang/book/{p.book.id}">{t('책으로', 'Book')}</a>{:else}<a class="btn ghost" href="/lang">{t('목록', 'List')}</a>{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="lang-col">
		{#if p.given}
			<details class="lang-box lang-given" bind:open={givenOpen}>
				<summary>{t(`주어진 코드 · ${givenLines}줄 — 이미 정의되어 있어 그대로 쓸 수 있습니다`, `Given code · ${givenLines} lines — already defined and ready to use`)}</summary>
				{#if givenOpen}
					<div class="lang-ed short">{#key p.id}<CodeEditor doc={p.given} readonly label={t('주어진 코드', 'Given code')} />{/key}</div>
				{/if}
			</details>
		{/if}
		{#key s.id}
			<div class="lang-box lang-ed">
				<CodeEditor doc={s.code} readonly={!!fin} label={t('Scala 코드', 'Scala code')} onchange={(c) => (code = c)} onrun={run} />
			</div>
		{/key}
		{#if !fin}
			<div class="lang-bar">
				<button class="btn" type="button" onclick={run} disabled={running}>{running ? t('실행 중…', 'Running…') : t('실행', 'Run')}</button>
				<span class="note">⌘/Ctrl + Enter</span>
				<span class="grow"></span>
				<button class="btn ghost" type="button" onclick={openPanel} aria-expanded={panelOpen && tab === 'cheat'}>{t('치트시트', 'Cheatsheet')}</button>
				<button class="btn ghost" type="button" onclick={openCoach} aria-expanded={panelOpen && tab === 'coach'}>{COACH_NAME}{#if !fin && !over}<svg class="co-lock" viewBox="0 0 16 16" width="12" height="12" aria-label={t('잠김', 'Locked')} role="img"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>{/if}</button>
				<button class="btn ghost" type="button" onclick={hint} disabled={hinting || hints.length >= 2}>{t('힌트 보기', 'Show hints')} ({hints.length}/2)</button>
				{#if !confirming}
					<button class="btn ghost" type="button" onclick={() => (confirming = true)}>{t('답 보기', 'View solution')}</button>
				{/if}
			</div>
			{#if running}
					<span class="status" aria-live="polite"><span class="pulse"></span>{slow ? t('컴파일하고 있습니다. 처음 실행은 최대 1분 걸립니다.', 'Compiling. The first run can take up to a minute.') : t('실행 중…', 'Running…')}</span>
			{/if}
			{#if confirming}
				<div class="confirm" style="justify-content:flex-start">
					<span>{t('답을 보면 풀이로 기록되지 않습니다.', 'Viewing the solution is not recorded as a solve.')}</span>
					<form method="POST" action="?/reveal" use:enhance><button class="btn danger small">{t('답 보기', 'View solution')}</button></form>
					<button class="btn ghost small" type="button" onclick={() => (confirming = false)}>{t('계속 풀기', 'Keep solving')}</button>
				</div>
			{/if}
		{:else}
			<div class="lang-bar">
				<button class="btn ghost" type="button" onclick={openPanel} aria-expanded={panelOpen && tab === 'cheat'}>{t('치트시트', 'Cheatsheet')}</button>
				<button class="btn ghost" type="button" onclick={openCoach} aria-expanded={panelOpen && tab === 'coach'}>{COACH_NAME}</button>
			</div>
			<div class="lang-box lang-sol">
				<div class="lang-cap">{t('모범 답안', 'Reference solution')}</div>
				<div class="lang-ed short">
					{#key s.id}<CodeEditor doc={fin.solution} readonly label={t('모범 답안', 'Reference solution')} />{/key}
				</div>
			</div>
		{/if}
	</div>

	<button class="cheat-scrim" class:open={panelOpen} type="button" tabindex="-1" aria-label={t('패널 닫기', 'Close panel')} onclick={() => (panelOpen = false)}></button>
	<aside class="cheat-panel" class:open={panelOpen} class:tab-coach={tab === 'coach'} aria-label={tab === 'coach' ? COACH_NAME : t('치트시트', 'Cheatsheet')} aria-hidden={!panelOpen}>
		<div class="cheat-bar">
			<div class="cheat-tabs" role="tablist">
				<button class="cheat-tab" type="button" role="tab" aria-selected={tab === 'cheat'} onclick={() => (tab = 'cheat')}>{t('치트시트', 'Cheatsheet')}</button>
				<button class="cheat-tab" type="button" role="tab" aria-selected={tab === 'coach'} onclick={() => (tab = 'coach')}>{COACH_NAME}</button>
			</div>
			{#if tab === 'cheat'}<span class="note cheat-key">⌘/Ctrl + K</span>{/if}
			<span class="grow"></span>
			<button class="btn ghost small" type="button" onclick={() => (panelOpen = false)}>{t('닫기', 'Close')}</button>
		</div>
		<div class="cheat-scroll" hidden={tab !== 'cheat'}>
			<CheatSheet bind:this={sheet} entries={data.cheat} {reveal} onopen={lookup} />
		</div>
		{#if coachSeen}
			<div class="cheat-coach" hidden={tab !== 'coach'}>
				<Coach context={{ kind: 'lang', id: p.id }} getCode={() => code} refreshKey={coachKey} />
			</div>
		{/if}
	</aside>
</div>
