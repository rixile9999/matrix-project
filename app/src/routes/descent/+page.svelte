<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, tick, untrack } from 'svelte';
	import CheatSheet from '#lib/CheatSheet.svelte';
	import CodeEditor from '#lib/CodeEditor.svelte';
	import TimeGlyph from '#lib/TimeGlyph.svelte';
	import { renderInline } from '#lib/inline.ts';
	import { mmss } from '#lib/rank.ts';
	import type { JudgeResult } from '#lib/core/lang.ts';
	import { groupStages } from '#lib/core/study.ts';
	import type { DescentData, DescentOk, LangHintResponse, LangKind, LangLookupResponse, LangRunResponse } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: DescentData } = $props();

	const MAX_DEPTH = 3;
	const messages = $derived(data.messages);
	const top = $derived(data.stack.at(-1) ?? null);
	const sess = $derived(data.session);
	const p = $derived(sess?.problem ?? null);
	const s = $derived(sess?.session ?? null);
	const fin = $derived(s?.finished ?? null);

	// ---------- trail + depth ----------
	const trail = $derived.by(() => {
		const titles = data.stack.map((f) => f.title);
		return titles.length > 3 ? [titles[0], '…', titles[titles.length - 1]] : titles;
	});
	const depth = $derived(Math.min(MAX_DEPTH, Math.max(0, top?.depth ?? 0)));

	// ---------- requests ----------
	let sending = $state(false);
	let syncing = $state(false);
	let syncAgain = false;
	let chatError = $state('');
	let draft = $state('');
	const busy = $derived(sending || syncing || data.busy);

	async function post(url: string, body: unknown): Promise<boolean> {
		try {
			const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const j = (await res.json().catch(() => ({}))) as Partial<DescentOk> & { error?: string };
			if (j.error || !res.ok) {
				chatError = j.error ?? t(`요청 실패 (${res.status})`, `Request failed (${res.status})`);
				return false;
			}
			chatError = '';
			return true;
		} catch (e) {
			chatError = e instanceof Error ? e.message : String(e);
			return false;
		}
	}

	async function send(body: { text: string } | { choice: 'accept' | 'decline' } | Record<string, never>, url = '/descent/turn') {
		if (sending || syncing || data.busy) return;
		sending = true;
		try {
			const ok = await post(url, body);
			if (ok && 'text' in body) draft = '';
		} finally {
			sending = false;
			await invalidateAll();
		}
	}

	async function sync() {
		if (syncing) {
			syncAgain = true;
			return;
		}
		syncing = true;
		try {
			do {
				syncAgain = false;
				await post('/descent/sync', {});
				await invalidateAll();
			} while (syncAgain);
		} finally {
			syncing = false;
		}
	}

	function submit() {
		const text = draft.trim();
		if (text && !busy) void send({ text });
	}
	function enter(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		submit();
	}
	function close() {
		void send({}, '/descent/close');
	}

	// a turn started elsewhere (reload, other tab): poll until it ends
	$effect(() => {
		if (!data.busy || sending || syncing) return;
		const id = setInterval(() => void invalidateAll(), 2000);
		return () => clearInterval(id);
	});

	// ---------- conversation scroll ----------
	let log: HTMLDivElement | undefined;
	$effect(() => {
		void messages.length;
		void busy;
		void tick().then(() => {
			if (log) log.scrollTop = log.scrollHeight;
		});
	});
	const openOffer = $derived(messages.findLast((m) => m.offer?.open) ?? null);
	const offerLabels = $derived(
		openOffer?.offer?.kind === 'ascend'
			? { yes: t('올라가기', 'Up'), no: t('하나 더', 'Stay') }
			: { yes: t('내려가기', 'Descend'), no: t('계속', 'Stay') }
	);

	// ---------- clock (server time = Date.now() + skew) ----------
	let skew = 0;
	let nowSec = $state(untrack(() => Math.floor(data.session?.now ?? Date.now() / 1000)));
	let wall = $state(Date.now());
	$effect(() => {
		if (!sess) return;
		skew = sess.now - Date.now() / 1000;
		nowSec = Math.floor(sess.now);
	});
	const remaining = $derived(p && s ? p.limitSec - Math.max(0, nowSec - s.startedAt) : 0); // < 0 = overtime
	const over = $derived(!!p && !!s && remaining < 0);

	let timer: ReturnType<typeof setInterval> | undefined;
	function clear() {
		clearInterval(timer);
		timer = undefined;
	}
	$effect(() => {
		if (!s || fin) return;
		timer = setInterval(() => {
			nowSec = Math.floor(Date.now() / 1000 + skew);
			wall = Date.now();
		}, 500);
		return clear;
	});
	onDestroy(clear);

	// the limit passed: tell the server once per session
	let overSynced = -1;
	$effect(() => {
		if (!s || fin || !over || overSynced === s.id) return;
		overSynced = s.id;
		untrack(() => void sync());
	});

	// ---------- per-session editor state; reset when the top problem changes ----------
	let code = $state('');
	let runResult = $state<JudgeResult | undefined>(undefined);
	let hintsLocal = $state<string[]>([]);
	let refsLocal = $state<string[]>([]);
	let intentLocal = $state<string | null>(null);
	let error = $state('');
	let running = $state(false);
	let runStart = 0;
	let hinting = $state(false);
	let givenOpen = $state(false);
	let sent = new Set<string>();
	let lastId = -1;
	let lastLocale: string | undefined;
	const GIVEN_OPEN_MAX = 25;
	const givenLines = $derived(p?.given ? p.given.replace(/\n$/, '').split('\n').length : 0);
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
		const id = s?.id ?? -1;
		if (id === lastId) return;
		lastId = id;
		untrack(() => {
			code = s?.code ?? '';
			runResult = undefined;
			hintsLocal = [];
			refsLocal = [];
			intentLocal = null;
			givenOpen = givenLines <= GIVEN_OPEN_MAX;
			sent = new Set();
			error = '';
			running = false;
		});
	});

	const result = $derived(runResult ?? s?.lastResult ?? null);
	const intentText = $derived(intentLocal ?? s?.intent ?? null);
	const hints = $derived(s ? (hintsLocal.length > s.hints.length ? hintsLocal : s.hints) : []);
	const refs = $derived(refsLocal.length ? refsLocal : (s?.refs ?? []));
	const slow = $derived(running && wall - runStart > 4000);

	async function run() {
		if (running || fin || !p || !s) return;
		running = true;
		runStart = Date.now();
		wall = runStart;
		if (!timer) timer = setInterval(() => (wall = Date.now()), 500);
		const id = s.id;
		const locale = page.data.locale;
		let ok = false;
		try {
			const res = await fetch(`/lang/${p.id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
			const j = (await res.json()) as LangRunResponse;
			if (id !== s?.id) return;
			if (locale !== page.data.locale) {
				await invalidateAll();
				return;
			}
			error = j.error ?? (res.ok ? '' : t(`실행 실패 (${res.status})`, `Run failed (${res.status})`));
			if (j.result && !j.error) {
				runResult = j.result;
				ok = true;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
		if (ok) await sync();
	}

	async function hint() {
		if (hinting || hints.length >= 2 || !p || !s) return;
		hinting = true;
		const id = s.id;
		const locale = page.data.locale;
		let ok = false;
		try {
			const res = await fetch(`/lang/${p.id}/hint`, { method: 'POST' });
			const j = (await res.json()) as Partial<LangHintResponse>;
			if (id !== s?.id) return;
			if (locale !== page.data.locale) {
				await invalidateAll();
				return;
			}
			if (j.hints) hintsLocal = j.hints;
			if (j.refs) refsLocal = j.refs;
			if (j.intent) intentLocal = j.intent;
			error = j.error ?? (res.ok ? '' : t(`힌트 실패 (${res.status})`, `Hint failed (${res.status})`));
			ok = !!j.hints && !j.error;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			hinting = false;
		}
		if (ok) await sync();
	}

	// ---------- attention marks: only times, never what was typed ----------
	const IDLE_MS = 60_000;
	$effect(() => {
		if (!p || !s || fin) return;
		const pid = p.id;
		const mark = (kind: 'away' | 'back' | 'idle' | 'active') =>
			fetch(`/lang/${pid}/mark`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
		let last = Date.now();
		let idle = false;
		const input = () => {
			last = Date.now();
			if (idle) {
				idle = false;
				mark('active');
			}
		};
		const visibility = () => {
			if (document.hidden) mark('away');
			else {
				mark('back');
				idle = false;
				last = Date.now();
			}
		};
		const tickId = setInterval(() => {
			if (!document.hidden && !idle && Date.now() - last >= IDLE_MS) {
				idle = true;
				mark('idle');
			}
		}, 5000);
		const opts = { capture: true, passive: true };
		window.addEventListener('keydown', input, opts);
		window.addEventListener('pointerdown', input, opts);
		window.addEventListener('wheel', input, opts);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			clearInterval(tickId);
			window.removeEventListener('keydown', input, opts);
			window.removeEventListener('pointerdown', input, opts);
			window.removeEventListener('wheel', input, opts);
			document.removeEventListener('visibilitychange', visibility);
		};
	});

	// ---------- cheat sheet ----------
	const byId = $derived(new Map((sess?.cheat ?? []).map((e) => [e.id, e])));
	const related = $derived(refs.flatMap((id) => byId.get(id) ?? []));
	let panelOpen = $state(false);
	let reveal = $state<{ id: string; n: number } | null>(null);
	let sheet: { focusSearch: () => void } | undefined;
	function openPanel() {
		panelOpen = true;
	}
	function openRef(id: string) {
		panelOpen = true;
		reveal = { id, n: (reveal?.n ?? 0) + 1 };
	}
	function lookup(entryId: string) {
		if (!p || fin || sent.has(entryId)) return;
		sent.add(entryId);
		fetch(`/lang/${p.id}/lookup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entryId }) })
			.then((r) => r.json() as Promise<LangLookupResponse>)
			.catch(() => {});
	}
	function keys(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' && s) {
			e.preventDefault();
			e.stopPropagation();
			if (panelOpen) panelOpen = false;
			else {
				openPanel();
				sheet?.focusSearch();
			}
		} else if (e.key === 'Escape' && panelOpen) {
			panelOpen = false;
		}
	}

	// ---------- result view ----------
	const kindLabel = (kind: LangKind) => (kind === 'fix' ? t('버그 수정', 'Fix bug') : kind === 'refactor' ? t('리팩터링', 'Refactor') : kind === 'complete' ? t('완성', 'Complete') : '');
	const reason = $derived(result && result.status === 'failed' && result.cases.length > 0 && result.cases.every((c) => c.status === 'ok') && result.output ? result.output : '');
	const stages = $derived(result ? groupStages(result.cases) : []);
	const statusLabel = (status: JudgeResult['status']) =>
		status === 'passed' ? t('통과', 'Passed') : status === 'failed' ? t('실패', 'Failed') : status === 'compile_error' ? t('컴파일 오류', 'Compile error') : t('시간 초과', 'Time expired');
	const MARK = { ok: '✓', fail: '✗', error: '!' } as const;
	const outcome = $derived(fin ? (fin.outcome === 'passed' ? `${t('통과', 'Passed')} · ${mmss(fin.elapsedSec)}` : t('답을 확인함', 'Solution viewed')) : '');
</script>

<svelte:head><title>Descent · Matrix</title></svelte:head>

<svelte:window onkeydowncapture={keys} />

<div class="dc">
	<header class="dc-top">
		<h1>Descent</h1>
		{#if data.stack.length}
			<div class="dc-trail mono">
				<span class="dc-crumbs">
					{#each trail as name, i (i)}
						{#if i > 0}<span aria-hidden="true"> › </span>{/if}
						{#if i === trail.length - 1}<b aria-current="step">{name}</b>{:else}<span>{name}</span>{/if}
					{/each}
				</span>
				<span class="dc-dots" role="img" aria-label={t(`깊이 ${depth}/${MAX_DEPTH}`, `Depth ${depth} of ${MAX_DEPTH}`)}>
					{#each Array.from({ length: MAX_DEPTH }, (_, i) => i) as i (i)}<i class:on={i < depth}></i>{/each}
				</span>
			</div>
		{/if}
		{#if messages.length}
			<button class="dc-end" type="button" onclick={close} disabled={busy}>{t('끝내기', 'End')}</button>
		{/if}
	</header>

	<div class="dc-desk">
		<section class="dc-chat" aria-label={t('대화', 'Conversation')}>
			<div class="dc-log" bind:this={log} role="log" aria-live="polite">
				{#each messages as m (m.id)}
					{#if m.role === 'event'}
						<div class="dc-event mono" class:good={m.tone === 'good'} class:bad={m.tone === 'bad'}>{m.text}</div>
					{:else}
						<div class="dc-msg {m.role}">
							{#if m.role === 'coach'}<p>{@html renderInline(m.text)}</p>{:else}<p>{m.text}</p>{/if}
							{#if openOffer && m.id === openOffer.id}
								<div class="dc-offer">
									<button class="btn small" type="button" onclick={() => send({ choice: 'accept' })} disabled={busy}>{offerLabels.yes}</button>
									<button class="btn ghost small" type="button" onclick={() => send({ choice: 'decline' })} disabled={busy}>{offerLabels.no}</button>
								</div>
							{/if}
						</div>
					{/if}
				{/each}
				{#if busy}<span class="status dc-wait" aria-live="polite"><span class="pulse"></span></span>{/if}
			</div>
			{#if chatError}<p class="err" role="alert">{chatError}</p>{/if}
			{#if data.connected}
				<form class="dc-ask" onsubmit={(e) => { e.preventDefault(); submit(); }}>
					<textarea
						bind:value={draft}
						onkeydown={enter}
						rows="1"
						disabled={busy}
						placeholder={messages.length ? t('코치에게', 'To the coach') : t('무엇을 연습할까요', 'What do you want to practise')}
						aria-label={t('코치에게', 'To the coach')}
					></textarea>
					<button class="btn small" type="submit" disabled={busy || !draft.trim()}>{t('보내기', 'Send')}</button>
				</form>
			{:else}
				<p class="dc-ask dc-connect"><a href="/settings/coach">{t('코치 연결', 'Connect a coach')}</a></p>
			{/if}
		</section>

		<section class="dc-work" aria-label={t('문제', 'Problem')}>
			{#if p && s}
				<div class="dc-head">
					<div class="lang-title">
						<h2>{p.title}</h2>
						{#if fin}
							<span class="lang-clock mono" style="font-size:15px;color:var(--muted)">{mmss(fin.elapsedSec)}</span>
						{:else}
							<TimeGlyph remainingSec={remaining} limitSec={p.limitSec} size={26} />
						{/if}
					</div>
					{#if kindLabel(p.kind)}<span class="label">{kindLabel(p.kind)}</span>{/if}
					{#if p.kind === 'refactor' && p.avoid.length}<span class="note">{t('없이', 'Without')} {@html renderInline(p.avoid.map((w) => `\`${w}\``).join('·'))}</span>{/if}
				</div>

				<p class="lang-stmt">{@html renderInline(p.statement)}</p>

				{#if !fin && hints.length}
					<div class="dc-stack">
						{#each hints as h, i (i)}<div class="lang-hint"><span class="label">{t(`힌트 ${i + 1}`, `Hint ${i + 1}`)}</span><br />{@html renderInline(h)}</div>{/each}
						{#if related.length}
							<div class="lang-refs">{#each related as e (e.id)}<button class="chip" type="button" onclick={() => openRef(e.id)}>{e.title}</button>{/each}</div>
						{/if}
						{#if intentText}<div class="lang-hint lang-intent">{@html renderInline(intentText)}</div>{/if}
					</div>
				{/if}

				{#if p.given}
					<details class="lang-box lang-given" bind:open={givenOpen}>
						<summary>{t(`주어진 코드 · ${givenLines}줄`, `Given code · ${givenLines} lines`)}</summary>
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
						<span class="grow"></span>
						<button class="btn ghost" type="button" onclick={hint} disabled={hinting || hints.length >= 2}>{t('힌트', 'Hint')} {hints.length}/2</button>
						<button class="btn ghost" type="button" onclick={openPanel} aria-expanded={panelOpen}>{t('치트시트', 'Cheatsheet')}</button>
					</div>
					{#if running}
						<span class="status" aria-live="polite"><span class="pulse"></span>{slow ? t('컴파일하고 있습니다. 처음 실행은 최대 1분 걸립니다.', 'Compiling. The first run can take up to a minute.') : t('실행 중…', 'Running…')}</span>
					{/if}
				{:else}
					<div class="lang-bar">
						<span class="lang-sum" class:ok={fin.outcome === 'passed'}>{outcome}</span>
						<span class="grow"></span>
						<button class="btn ghost" type="button" onclick={openPanel} aria-expanded={panelOpen}>{t('치트시트', 'Cheatsheet')}</button>
					</div>
				{/if}

				{#if result}
					<div class="dc-stack" aria-live="polite">
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
							<p class="err" style="margin:0">{@html renderInline(reason)}</p>
						{:else if result.output}
							<pre class="lang-out">{result.output}</pre>
						{/if}
					</div>
				{/if}
				{#if error}<p class="err" role="alert">{error}</p>{/if}
			{:else}
				<div class="dc-blank" aria-hidden="true"></div>
			{/if}
		</section>
	</div>

	<button class="cheat-scrim" class:open={panelOpen} type="button" tabindex="-1" aria-label={t('패널 닫기', 'Close panel')} onclick={() => (panelOpen = false)}></button>
	<aside class="cheat-panel" class:open={panelOpen} aria-label={t('치트시트', 'Cheatsheet')} aria-hidden={!panelOpen}>
		<div class="cheat-bar">
			<span class="label">{t('치트시트', 'Cheatsheet')}</span>
			<span class="note cheat-key">⌘/Ctrl + K</span>
			<span class="grow"></span>
			<button class="btn ghost small" type="button" onclick={() => (panelOpen = false)}>{t('닫기', 'Close')}</button>
		</div>
		<div class="cheat-scroll">
			<CheatSheet bind:this={sheet} entries={sess?.cheat ?? []} {reveal} onopen={lookup} />
		</div>
	</aside>
</div>

<style>
	.dc { padding: 20px 16px 28px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
	.dc-top { display: flex; align-items: baseline; gap: 10px 16px; flex-wrap: wrap; }
	h1 { font: 700 22px/1.2 var(--f-display); letter-spacing: -.01em; margin: 0; }
	.dc-trail { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-left: auto; font-size: 12px; color: var(--muted); min-width: 0; }
	.dc-crumbs { overflow-wrap: anywhere; }
	.dc-crumbs b { color: var(--ink); font-weight: 600; }
	.dc-dots { display: inline-flex; gap: 5px; }
	.dc-dots i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--muted); }
	.dc-dots i.on { background: var(--accent); border-color: var(--accent); }
	.dc-end { font: 12px var(--f-body); color: var(--muted); background: transparent; border: 0; padding: 4px 6px; cursor: pointer; border-radius: 6px; }
	.dc-end:hover:not(:disabled) { color: var(--ink); }
	.dc-end:disabled { opacity: .5; cursor: default; }
	.dc-end:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.dc-top:not(:has(.dc-trail)) .dc-end { margin-left: auto; }

	.dc-desk { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 24px; align-items: start; }
	@media (max-width: 760px) { .dc-desk { grid-template-columns: minmax(0, 1fr); } }

	.dc-chat { display: flex; flex-direction: column; gap: 12px; min-width: 0; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); padding: 16px; height: clamp(340px, 72vh, 680px); }
	.dc-log { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 2px; overscroll-behavior: contain; }
	.dc-msg { display: grid; gap: 8px; max-width: 44ch; min-width: 0; }
	.dc-msg p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
	.dc-msg.me { align-self: flex-end; text-align: right; color: var(--muted); }
	.dc-msg.coach { align-self: flex-start; }
	.dc-msg.coach p { font: 400 17px/1.55 var(--f-display); }
	.dc-event { align-self: center; font-size: 11.5px; letter-spacing: .06em; color: var(--muted); text-align: center; overflow-wrap: anywhere; }
	.dc-event.good { color: var(--ok); }
	.dc-event.bad { color: var(--bad); }
	.dc-offer { display: flex; gap: 8px; flex-wrap: wrap; }
	.dc-wait { align-self: flex-start; }
	.dc-ask { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid var(--line); padding-top: 12px; margin: 0; }
	.dc-ask textarea { flex: 1; min-width: 0; resize: none; font: 14px/1.5 var(--f-body); color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 18px; padding: 8px 14px; field-sizing: content; max-height: 8em; }
	.dc-ask textarea::placeholder { color: var(--muted); }
	.dc-ask textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
	.dc-ask textarea:disabled { opacity: .6; }
	.dc-ask .btn { border-radius: 999px; }
	.dc-connect { font-size: 13px; justify-content: flex-start; }
	.dc-connect a { color: var(--accent); }
	.dc-connect a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

	.dc-work { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.dc-head { display: flex; flex-direction: column; gap: 4px; }
	.dc-stack { display: flex; flex-direction: column; gap: 8px; }
	.dc-blank { min-height: 240px; border: 1px dashed var(--line); border-radius: var(--r); opacity: .5; }
	.lang-refs { display: flex; gap: 6px; flex-wrap: wrap; }

	/* cheat sheet: always a drawer here, at any width */
	.dc :global(.cheat-panel.open) { position: fixed; z-index: 30; top: 0; right: 0; bottom: 0; width: min(440px, 100vw); max-height: none; border: 0; border-left: 1px solid var(--line); border-radius: 0; background: var(--bg); box-shadow: -8px 0 24px rgb(0 0 0 / .18); overflow: visible; }
	.dc :global(.cheat-scrim.open) { display: block; }
</style>
