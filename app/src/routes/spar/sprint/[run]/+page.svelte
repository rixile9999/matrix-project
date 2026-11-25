<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { AmbienceControls, audio } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';
	import CheatSheet from '#lib/CheatSheet.svelte';
	import CodeEditor from '#lib/CodeEditor.svelte';
	import TimeGlyph from '#lib/TimeGlyph.svelte';
	import { renderInline } from '#lib/inline.ts';
	import type { JudgeResult } from '#lib/core/lang.ts';
	import { fmtMs } from '#lib/core/spar.ts';
	import { fmtSpan } from '#lib/spar/format.ts';
	import Judge from '#lib/spar/Judge.svelte';
	import type { SparAbandonResponse, SparError, SparSprintData, SparSprintRunResponse, SparSprintSkipResponse } from '#lib/types.ts';

	let { data }: { data: SparSprintData } = $props();

	// The server's state; replaced by each endpoint response.
	let sp = $state.raw<SparSprintData>(untrack(() => data));
	let base = untrack(() => data.elapsedMs); // server ms at `receivedAt`
	let receivedAt = performance.now();
	let nowMs = $state(untrack(() => data.elapsedMs));
	let seenRun = -1;
	$effect(() => {
		// a new load (navigation, reload) resets everything
		const d = data;
		untrack(() => {
			if (d.run.id === seenRun && d.index === sp.index) return;
			seenRun = d.run.id;
			adopt(d);
			runResult = undefined;
		});
	});
	function adopt(s: SparSprintData) {
		sp = s;
		base = s.elapsedMs;
		receivedAt = performance.now();
		nowMs = s.elapsedMs;
		code = s.code;
		runResult = s.lastResult ?? undefined;
		confirmSkip = false;
		error = '';
	}
	onMount(() => {
		const t = setInterval(() => (nowMs = base + (performance.now() - receivedAt)), 250);
		return () => clearInterval(t);
	});

	let code = $state(untrack(() => data.code));
	let runResult = $state<JudgeResult | undefined>(untrack(() => data.lastResult ?? undefined));
	let running = $state(false);
	let leaving = $state(false); // short fade between problems
	let error = $state('');
	let confirmSkip = $state(false);
	let confirmQuit = $state(false);
	let busy = $state(false);

	const p = $derived(sp.problem);
	const lastDone = $derived(sp.done.at(-1) ?? null);
	const lastCum = $derived(lastDone?.cumMs ?? 0);
	const frac = $derived(p ? Math.min(0.9, Math.max(0, (nowMs - lastCum) / (p.limitSec * 1000))) * 0.85 : 0);
	const progress = $derived(Math.min(1, (sp.done.length + frac) / sp.total));
	$effect(() => { stage.scene = 'run'; stage.progress = progress; });
	const pace = $derived(lastDone && lastDone.deltaMs !== null ? lastDone.deltaMs : null);

	function paceText(ms: number): { pre: string; b: string } {
		const s = Math.round(Math.abs(ms) / 1000);
		if (s === 0) return { pre: '여기까지 최고 기록과', b: '같음' };
		return { pre: '여기까지 최고 기록보다', b: `${fmtSpan(ms)} ${ms < 0 ? '빠름' : '느림'}` };
	}

	async function post<T>(path: string, body?: object): Promise<{ ok: boolean; status: number; j: T & Partial<SparError> }> {
		const r = await fetch(`/spar/sprint/${sp.run.id}/${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		});
		const j = (await r.json().catch(() => ({}))) as T & Partial<SparError>;
		return { ok: r.ok, status: r.status, j };
	}
	const toRun = (url: string, fresh = true) => goto(fresh ? `${url}?fresh=1` : url);
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function advance(next: SparSprintData) {
		if (next.status !== 'running') {
			sp = next;
			await toRun(next.runUrl ?? `/spar/run/${next.run.id}`);
			return;
		}
		leaving = true;
		await wait(650);
		adopt(next);
		await wait(30);
		leaving = false;
	}

	async function run() {
		if (running || busy || !p || leaving) return;
		running = true;
		error = '';
		confirmSkip = false;
		try {
			const { ok, status, j } = await post<SparSprintRunResponse>('run', { problemId: p.id, code });
			if (!ok) return await fail(status, j);
			runResult = j.result;
			if (j.passed) {
				audio.sfx('ok');
				await advance(j.sprint);
			} else {
				sp = { ...sp, runs: j.sprint.runs };
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}
	async function fail(status: number, j: Partial<SparError>) {
		if (j.over && j.runUrl) return void (await toRun(j.runUrl));
		error = status === 409 ? '다른 화면에서 진행되어 이 문제가 아닙니다. 새로 불러옵니다.' : (j.error ?? `요청에 실패했습니다 (${status}).`);
		if (status === 409) setTimeout(() => location.reload(), 1200);
	}

	async function skip() {
		if (!p || busy || running) return;
		if (!confirmSkip) { confirmSkip = true; return; }
		busy = true;
		try {
			const { ok, status, j } = await post<SparSprintSkipResponse>('skip', { problemId: p.id });
			if (!ok) return await fail(status, j);
			await advance(j.sprint);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
			confirmSkip = false;
		}
	}
	async function quit() {
		if (busy) return;
		busy = true;
		try {
			const { j } = await post<SparAbandonResponse>('abandon');
			await toRun(j.runUrl ?? `/spar/run/${sp.run.id}`, false);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			busy = false;
		}
	}

	// cheat sheet
	let panelOpen = $state(false);
	let reveal: { id: string; n: number } | null = null;
	let sheet: { focusSearch: () => void } | undefined;
	const sent = new Set<string>();
	function lookup(entryId: string) {
		const key = `${p?.id}:${entryId}`;
		if (sent.has(key)) return;
		sent.add(key);
		post('lookup', { entryId }).catch(() => {});
	}
	function keys(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			e.stopPropagation();
			panelOpen = !panelOpen;
			if (panelOpen) sheet?.focusSearch();
		} else if (e.key === 'Escape' && panelOpen) panelOpen = false;
	}
	const KIND = { write: '', fix: '고치기', refactor: '다시 쓰기', complete: '완성하기' } as const;
	const marks = $derived(Array.from({ length: sp.total }, (_, i) => (sp.done[i] ? (sp.done[i].outcome === 'skipped' ? 'skip' : 'done') : i === sp.index ? 'now' : '')));
</script>

<svelte:head><title>Sprint · Matrix</title></svelte:head>
<svelte:window onkeydowncapture={keys} />

<main class="a-page">
	<div class="a-top">
		<span>Sprint · {String(Math.min(sp.index + 1, sp.total)).padStart(2, '0')} / {String(sp.total).padStart(2, '0')}</span>
		{#if p}<TimeGlyph remainingSec={p.limitSec - Math.floor((nowMs - lastCum) / 1000)} limitSec={p.limitSec} size={24} />{/if}
	</div>
	<div class="a-marks" aria-hidden="true">{#each marks as m, i (i)}<span class="a-mark {m}"></span>{/each}</div>
	<p class="a-sub a-pace" aria-live="polite">
		{#if pace !== null}{@const t = paceText(pace)}{t.pre} <b>{t.b}</b>{:else}&nbsp;{/if}
	</p>

	{#if p}
		<div class="a-run a-trans" class:out={leaving}>
			<div class="a-col">
				<div class="a-glass pad">
					<span>{p.topicLabel}{KIND[p.kind] ? ` · ${KIND[p.kind]}` : ''} · 기준 {fmtMs(p.limitSec * 1000)}</span>
					<b>{p.title}</b>
					<p class="a-p">{@html renderInline(p.statement)}</p>
					{#if p.kind === 'refactor' && p.avoid.length}
						<span>{@html renderInline(p.avoid.map((w) => `\`${w}\``).join(' · '))} 없이 다시 쓰세요.</span>
					{/if}
					{#if p.kind === 'fix'}<span>코드에 버그가 있습니다. 고쳐서 통과시키세요.</span>{/if}
				</div>
				{#if runResult}
					<div class="a-glass pad"><Judge result={runResult} /></div>
				{/if}
				{#if error}<p class="a-err" role="alert">{error}</p>{/if}
			</div>

			<div class="a-col">
				{#key p.id}
					<div class="a-glass edit"><div class="a-ed"><CodeEditor doc={sp.code} label="Scala 코드" onchange={(c) => (code = c)} onrun={run} /></div></div>
				{/key}
				<div class="a-row" style="align-items:center">
					<button class="a-btn" type="button" onclick={run} disabled={running || busy || leaving}>{running ? '실행 중…' : '실행'}</button>
					{#if !confirmSkip}
						<button class="a-btn ghost" type="button" onclick={skip} disabled={running || busy || leaving}>건너뛰기</button>
					{:else}
						<span class="a-confirm">건너뛰면 이 기록은 최고 기록이 될 수 없습니다.
							<button class="a-btn ghost small" type="button" onclick={skip} disabled={busy}>건너뜀</button>
							<button class="a-btn quiet" type="button" onclick={() => (confirmSkip = false)}>계속 풀기</button>
						</span>
					{/if}
					<span class="a-small">⌘/Ctrl + Enter</span>
					<span style="flex:1"></span>
					<button class="a-btn quiet" type="button" onclick={() => { panelOpen = true; sheet?.focusSearch(); }} aria-expanded={panelOpen}>치트시트</button>
				</div>
				{#if running}<p class="a-small" aria-live="polite">실행하고 있습니다. 처음에는 컴파일에 시간이 걸릴 수 있습니다.</p>{/if}
			</div>
		</div>
	{/if}

	<div class="a-corner">
		{#if !confirmQuit}
			<button class="a-btn quiet" type="button" onclick={() => (confirmQuit = true)}>그만두기</button>
		{:else}
			<span class="a-confirm">이 도전을 중단으로 기록합니다.
				<button class="a-btn ghost small" type="button" onclick={quit} disabled={busy}>중단</button>
				<button class="a-btn quiet" type="button" onclick={() => (confirmQuit = false)}>계속하기</button>
			</span>
		{/if}
		<AmbienceControls />
	</div>
</main>

<button class="a-scrim" class:open={panelOpen} type="button" tabindex="-1" aria-label="패널 닫기" onclick={() => (panelOpen = false)}></button>
<aside class="arena a-drawer" class:open={panelOpen} aria-label="치트시트" aria-hidden={!panelOpen}>
	<div class="a-page" style="padding:0;width:auto;animation:none;gap:0;flex:1;min-height:0">
		<div class="a-dh"><span>치트시트 · ⌘/Ctrl + K</span><button class="a-btn quiet" type="button" onclick={() => (panelOpen = false)}>닫기</button></div>
		<div class="a-ds"><CheatSheet bind:this={sheet} entries={sp.cheat} {reveal} onopen={lookup} /></div>
	</div>
</aside>
