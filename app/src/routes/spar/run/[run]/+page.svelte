<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { Ambience } from '#lib/ambience/index.ts';
	import { renderInline } from '#lib/inline.ts';
	import { fmtMs } from '#lib/core/spar.ts';
	import { fmtDateLong, fmtSpan } from '#lib/spar/format.ts';
	import type { SparRecallAnswerRow, SparRunData } from '#lib/types.ts';

	let { data }: { data: SparRunData } = $props();
	const d = $derived(data.detail);

	// Fresh from a finished run: one bloom, once. Opened later: the picture is simply settled.
	let bloom = $state(0);
	const fresh = untrack(() => page.url.searchParams.get('fresh') === '1');
	onMount(() => {
		if (!fresh) return;
		const t = setTimeout(() => {
			bloom = 1;
			try { replaceState(page.url.pathname, {}); } catch { /* router not ready: harmless */ }
		}, 500);
		return () => clearTimeout(t);
	});

	const missed = $derived(d.kind === 'recall' ? d.answers.filter((a) => !a.correct) : []);
	const rights = $derived(d.kind === 'recall' ? d.answers.filter((a) => a.correct) : []);
	const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

	function vs(ms: number): { b: string; tail: string } {
		return { b: fmtSpan(ms), tail: ms < 0 ? '빠름' : ms > 0 ? '느림' : '같음' };
	}
	const optText = (a: SparRecallAnswerRow) => (a.kind === 'bug' ? a.lines : a.options);
</script>

<svelte:head><title>{d.kind === 'sprint' ? 'Sprint' : 'Recall'} 결과 · Matrix</title></svelte:head>
<Ambience scene="result" {bloom} />

<main class="a-page mid">
	<div class="a-top">
		<span>{d.kind === 'sprint' ? 'Sprint' : 'Recall'} · {fmtDateLong(d.startedAt)}</span>
		<span class:a-warm={d.isBest}>{d.isBest ? '최고 기록' : ''}</span>
	</div>

	{#if d.kind === 'sprint'}
		{#if d.status === 'abandoned'}
			<div class="a-big sm">중단</div>
			<p class="a-sub">{d.problems.filter((p) => p.outcome).length}개까지 진행했습니다. 이 기록은 최고 기록에 들어가지 않습니다.</p>
		{:else}
			<div class="a-big" class:a-warm={d.isBest}>{d.totalMs !== null ? fmtMs(d.totalMs) : '—'}</div>
			<p class="a-sub">
				{#if d.skipped > 0}
					건너뛴 문제가 {d.skipped}개 있어 최고 기록으로 치지 않습니다.
				{:else if d.previousBest && d.deltaMs !== null}
					{@const v = vs(d.deltaMs)}지난 최고 {fmtMs(d.previousBest.totalMs)}보다 <b>{v.b} {v.tail}</b>
				{:else}
					첫 기록입니다.
				{/if}
			</p>
		{/if}

		<div class="a-veil">
		<table class="a-tbl">
			<thead><tr><th>문제</th><th class="r">이번</th><th class="r">비교</th><th class="r">실행</th></tr></thead>
			<tbody>
				{#each d.problems as p (p.problemId)}
					<tr>
						<td>
							{p.title}
							<span class="sub">{p.topicLabel}{p.outcome === 'skipped' ? ' · 건너뜀' : p.outcome === null ? ' · 도달하지 못함' : ''}{p.overLimit ? ' · 기준 시간 초과' : ''}</span>
							{#if p.lookups.length}<span class="sub">찾아본 문법: {p.lookups.map((l) => l.title).join(', ')}</span>{/if}
							{#if p.outcome}
								<form method="POST" action="/lang?/start" style="margin-top:2px">
									<input type="hidden" name="problemId" value={p.problemId} />
									<button class="a-btn quiet" style="padding:6px 0;min-height:32px;font-size:12.5px">다시 풀기</button>
								</form>
							{/if}
						</td>
						<td class="r a-num">{p.splitMs !== null ? fmtMs(p.splitMs) : '—'}</td>
						<td class="r a-num a-dim">{p.bestSplitMs !== null ? fmtMs(p.bestSplitMs) : '—'}</td>
						<td class="r a-num">{p.outcome ? p.runs : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="a-rows">
			<div class="a-kv"><span>찾아본 문법</span><b>{d.lookupCount}번</b></div>
			{#if d.slowest}
				{@const s = d.slowest}
				<div class="a-kv"><span>가장 느려진 곳</span><span style="text-align:right">{s.title} · {s.basis === 'best' ? '비교 기록보다' : '기준 시간보다'} <b class="a-warm">{fmtSpan(s.deltaMs)} 느림</b></span></div>
			{/if}
			{#if d.fastest}
				{@const f = d.fastest}
				<div class="a-kv"><span>가장 빨라진 곳</span><span style="text-align:right">{f.title} · {f.basis === 'best' ? '비교 기록보다' : '기준 시간보다'} <b>{fmtSpan(f.deltaMs)} 빠름</b></span></div>
			{/if}
		</div>
		</div>
	{:else}
		{#if d.status === 'abandoned' && d.answered === 0}
			<div class="a-big sm">중단</div>
			<p class="a-sub">답한 점검이 없습니다.</p>
		{:else}
			<div class="a-big" class:a-warm={d.isBest}>{d.correct}<span class="a-dim" style="font-size:.45em"> / {d.answered}</span></div>
			<p class="a-sub">
				{#if d.status === 'abandoned'}중단한 기록입니다. 답한 {d.answered}개 중 {d.correct}개를 맞혔습니다.
				{:else}정확도 <b>{pct(d.accuracy)}</b>{/if}
				{#if d.status === 'finished'}
					{#if d.previousBest}
						· 지난 최고 {d.previousBest.correct}개 ({pct(d.previousBest.accuracy)}){d.correct > d.previousBest.correct ? '보다 ' : ''}{#if d.correct > d.previousBest.correct}<b>{d.correct - d.previousBest.correct}개 더</b>{:else if d.correct < d.previousBest.correct}보다 {d.previousBest.correct - d.correct}개 적음{:else}와 같음{/if}
					{:else}
						· 첫 기록입니다.
					{/if}
				{/if}
			</p>
		{/if}

		{#if missed.length}
			<h2 class="a-h2">틀린 점검 {missed.length}개</h2>
			{#each missed as a (a.checkId)}
				{@render answerCard(a)}
			{/each}
		{:else if d.answered > 0}
			<p class="a-p">틀린 점검이 없습니다.</p>
		{/if}

		{#if rights.length}
			<details class="a-fold">
				<summary>맞힌 점검 {rights.length}개 보기</summary>
				{#each rights as a (a.checkId)}
					{@render answerCard(a)}
				{/each}
			</details>
		{/if}
	{/if}

	<div class="a-row" style="margin-top:8px">
		<form method="POST" action={d.kind === 'sprint' ? '/spar?/startSprint' : '/spar?/startRecall'}><button class="a-btn">다시 하기</button></form>
		<a class="a-btn ghost" href="/spar">Sparring 홈</a>
		<a class="a-btn quiet" href="/spar/records">기록</a>
	</div>
</main>

{#snippet answerCard(a: SparRecallAnswerRow)}
	<div class="a-miss">
		<span class="a-small">{a.kindLabel} · {fmtMs(a.ms)}{a.recorded ? '' : ' · 한 시간 안에 이미 답해 복습 기록은 남기지 않았습니다'}</span>
		<p class="a-p">{@html renderInline(a.prompt)}</p>
		{#if a.code}<div class="a-glass" style="background:rgba(8,9,13,.9)"><pre class="a-code">{a.code}</pre></div>{/if}
		<div class="a-opts">
			{#each optText(a) as text, k (k)}
				<div>
					<div class="a-opt" class:right={k === a.correctIndex} class:miss={k === a.choice && !a.correct} style="cursor:default">
						<span class="a-no a-num">{a.kind === 'bug' ? k + 1 : ''}</span>{text}
					</div>
					{#if k === a.correctIndex || k === a.choice}
						<p class="a-small" style="margin:4px 0 0 4px">
							{k === a.choice ? '내 답' : ''}{k === a.choice && k === a.correctIndex ? ' · ' : ''}{k === a.correctIndex ? (a.kind === 'bug' ? '버그가 있는 줄' : '정답') : ''}
						</p>
					{/if}
					{#if a.kind !== 'bug' && a.whys[k] && (k === a.correctIndex || k === a.choice)}<p class="a-why" style="margin-top:6px">{@html renderInline(a.whys[k])}</p>{/if}
				</div>
			{/each}
		</div>
		{#if a.kind === 'bug'}
			{#if a.why}<p class="a-why">{@html renderInline(a.why)}</p>{/if}
			{#if a.fixed}<div class="a-glass" style="background:rgba(8,9,13,.9)"><span>고친 줄</span><pre class="a-code">{a.fixed}</pre></div>{/if}
		{/if}
	</div>
{/snippet}
