<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import CodeEditor from '#lib/CodeEditor.svelte';
	import { renderInline } from '#lib/inline.ts';
	import { mmss } from '#lib/rank.ts';
	import type { JudgeResult } from '#lib/core/lang.ts';
	import type { LangSessionData, LangRunResponse } from '#lib/types.ts';

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
	let lastId = -1;
	$effect(() => {
		const id = s.id;
		if (id === lastId) return;
		lastId = id;
		untrack(() => {
			code = s.code;
			runResult = undefined;
			hintsLocal = [];
			error = '';
			running = false;
			confirming = false;
		});
	});

	const result = $derived(runResult ?? s.lastResult);
	const hints = $derived(hintsLocal.length > s.hints.length ? hintsLocal : s.hints);
	const slow = $derived(running && wall - runStart > 4000);

	async function run() {
		if (running || fin) return;
		running = true;
		runStart = Date.now();
		wall = runStart;
		if (!timer) timer = setInterval(() => (wall = Date.now()), 500);
		const id = s.id;
		try {
			const res = await fetch(`/lang/${p.id}/run`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code })
			});
			const j = (await res.json()) as LangRunResponse;
			if (id !== s.id) return;
			error = j.error ?? (res.ok ? '' : `실행 실패 (${res.status})`);
			if (j.result) runResult = j.result;
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
		try {
			const res = await fetch(`/lang/${p.id}/hint`, { method: 'POST' });
			const j = (await res.json()) as { hints?: string[]; error?: string };
			if (j.hints) hintsLocal = j.hints;
			error = j.error ?? (res.ok ? '' : `힌트 실패 (${res.status})`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			hinting = false;
		}
	}

	const STATUS = { passed: '통과', failed: '실패', compile_error: '컴파일 오류', timeout: '시간 초과: 실행이 너무 오래 걸렸습니다' } as const;
	const MARK = { ok: '✓', fail: '✗', error: '!' } as const;
	const outcomeText = $derived(
		!fin ? '' : fin.outcome === 'passed' ? `통과 · ${mmss(fin.elapsedSec)}${fin.overtime ? ' (제한시간 초과)' : ''}` : '답을 확인함'
	);
</script>

<svelte:head><title>{fin ? '' : `${over ? '+' : ''}${mmss(Math.abs(remaining))} · `}{p.title} · Matrix</title></svelte:head>

<div class="lang-split">
	<div class="lang-col">
		<div>
			<a class="note" href="/lang">← 목록</a>
			<div class="lang-title">
				<h2>{String(p.order).padStart(2, '0')}. {p.title}</h2>
				{#if fin}
					<span class="lang-clock mono" style="font-size:15px;color:var(--muted)">{mmss(fin.elapsedSec)}</span>
				{:else}
					<span class="lang-clock" class:over role="timer" aria-label={over ? '초과 시간' : '남은 시간'}>{mmss(Math.abs(remaining))}</span>
				{/if}
			</div>
			{#if !fin}<span class="note">제한 {mmss(p.limitSec)}{over ? ' · 시간이 지났지만 계속 풀 수 있습니다' : ''}</span>{/if}
		</div>

		<p class="lang-stmt">{@html renderInline(p.statement)}</p>

		{#if !fin}
			{#if hints.length}
				<div class="lang-col" style="gap:8px">
					{#each hints as h, i (i)}<div class="lang-hint"><span class="label">힌트 {i + 1}</span><br />{@html renderInline(h)}</div>{/each}
				</div>
			{/if}
		{/if}

		{#if result}
			<div class="lang-col" style="gap:8px" aria-live="polite">
				<span class="lang-sum" class:ok={result.status === 'passed'} class:no={result.status !== 'passed'}>{STATUS[result.status]}</span>
				{#if result.cases.length}
					<div>
						{#each result.cases as c, i (i)}
							<div class="case">
								<span class="mk {c.status}" aria-label={c.status}>{MARK[c.status]}</span>
								<div>{c.name}{#if c.detail}<div class="detail">{c.detail}</div>{/if}</div>
							</div>
						{/each}
					</div>
				{/if}
				{#if result.output}
					<span class="label">{result.status === 'compile_error' ? '컴파일러 출력' : '프로그램 출력'}</span>
					<pre class="lang-out">{result.output}</pre>
				{/if}
			</div>
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}

		{#if fin}
			<div class="lang-done">
				<span class="lang-sum" class:ok={fin.outcome === 'passed'}>{outcomeText}</span>
				{#if fin.targets.length}<div class="tags">{#each fin.targets as t (t)}<span class="tag">{t}</span>{/each}</div>{/if}
				{#if fin.notes}<p class="insight" style="max-width:none;margin:0">{@html renderInline(fin.notes)}</p>{/if}
				{#if fin.avoided.length}
					<p class="note" style="margin:0">{@html renderInline(fin.avoided.map((w) => `\`${w}\``).join(', '))} 사용함. 모범 답안은 쓰지 않습니다.</p>
				{/if}
				{#if hints.length}
					<details><summary class="note">힌트 다시 보기</summary>
						{#each hints as h, i (i)}<div class="lang-hint" style="margin-top:6px">{@html renderInline(h)}</div>{/each}
					</details>
				{/if}
				<div class="lang-bar">
					<form method="POST" action="?/restart" use:enhance><button class="btn">다시 풀기</button></form>
					{#if data.nextId}
						<form method="POST" action="/lang?/start" use:enhance>
							<input type="hidden" name="problemId" value={data.nextId} />
							<button class="btn ghost">다음 문제</button>
						</form>
					{/if}
					<a class="btn ghost" href="/lang">목록</a>
				</div>
			</div>
		{/if}
	</div>

	<div class="lang-col">
		{#key s.id}
			<div class="lang-box lang-ed">
				<CodeEditor doc={s.code} readonly={!!fin} label="Scala 코드" onchange={(c) => (code = c)} onrun={run} />
			</div>
		{/key}
		{#if !fin}
			<div class="lang-bar">
				<button class="btn" type="button" onclick={run} disabled={running}>{running ? '실행 중…' : '실행'}</button>
				<span class="note">⌘/Ctrl + Enter</span>
				<span class="grow"></span>
				<button class="btn ghost" type="button" onclick={hint} disabled={hinting || hints.length >= 2}>힌트 보기 ({hints.length}/2)</button>
				{#if !confirming}
					<button class="btn ghost" type="button" onclick={() => (confirming = true)}>답 보기</button>
				{/if}
			</div>
			{#if running}
				<span class="status" aria-live="polite"><span class="pulse"></span>{slow ? '컴파일하고 있습니다. 처음 실행은 최대 1분 걸립니다.' : '실행 중…'}</span>
			{/if}
			{#if confirming}
				<div class="confirm" style="justify-content:flex-start">
					<span>답을 보면 풀이로 기록되지 않습니다.</span>
					<form method="POST" action="?/reveal" use:enhance><button class="btn danger small">답 보기</button></form>
					<button class="btn ghost small" type="button" onclick={() => (confirming = false)}>계속 풀기</button>
				</div>
			{/if}
		{:else}
			<div class="lang-box lang-sol">
				<div class="lang-cap">모범 답안</div>
				<div class="lang-ed short">
					{#key s.id}<CodeEditor doc={fin.solution} readonly label="모범 답안" />{/key}
				</div>
			</div>
		{/if}
	</div>
</div>
