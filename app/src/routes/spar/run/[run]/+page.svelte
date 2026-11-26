<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { fireBloom, stage } from '#lib/ambience/stage.svelte.ts';
	$effect(() => { stage.scene = 'result'; stage.progress = undefined; });
	import { renderInline } from '#lib/inline.ts';
	import { fmtMs } from '#lib/core/spar.ts';
	import { fmtDateLong, fmtSpan } from '#lib/spar/format.ts';
	import type { SparRecallAnswerRow, SparRunData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: SparRunData } = $props();
	const d = $derived(data.detail);

	// Fresh from a finished run: one bloom, once. Opened later: the picture is simply settled.
	const fresh = untrack(() => page.url.searchParams.get('fresh') === '1');
	onMount(() => {
		if (!fresh) return;
		const t = setTimeout(() => {
			fireBloom();
			try { replaceState(page.url.pathname, {}); } catch { /* router not ready: harmless */ }
		}, 500);
		return () => clearTimeout(t);
	});

	const missed = $derived(d.kind === 'recall' ? d.answers.filter((a) => !a.correct) : []);
	const rights = $derived(d.kind === 'recall' ? d.answers.filter((a) => a.correct) : []);
	const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

	function vs(ms: number): { b: string; tail: string } {
		return { b: fmtSpan(ms), tail: ms < 0 ? t('빠름', 'faster') : ms > 0 ? t('느림', 'slower') : t('같음', 'same') };
	}
	const optText = (a: SparRecallAnswerRow) => (a.kind === 'bug' ? a.lines : a.options);
</script>

<svelte:head><title>{d.kind === 'sprint' ? 'Sprint' : 'Recall'} {t('결과', 'result')} · Matrix</title></svelte:head>

<main class="a-page mid">
	<div class="a-top">
		<span>{d.kind === 'sprint' ? 'Sprint' : 'Recall'} · {fmtDateLong(d.startedAt)}</span>
		<span class:a-warm={d.isBest}>{d.isBest ? t('최고 기록', 'Best') : ''}</span>
	</div>

	{#if d.kind === 'sprint'}
		{#if d.status === 'abandoned'}
			<div class="a-big sm">{t('중단', 'Abandoned')}</div>
					<p class="a-sub">{d.problems.filter((p) => p.outcome).length} {t('개까지 진행했습니다. 이 기록은 최고 기록에 들어가지 않습니다.', 'completed. This does not count as a best.')}</p>
		{:else}
			<div class="a-big" class:a-warm={d.isBest}>{d.totalMs !== null ? fmtMs(d.totalMs) : '—'}</div>
			<p class="a-sub">
				{#if d.skipped > 0}
					{t('건너뛴 문제가', 'You skipped')} {d.skipped} {t('개 있어 최고 기록으로 치지 않습니다.', 'problems, so this is not a best.')}
				{:else if d.previousBest && d.deltaMs !== null}
					{@const v = vs(d.deltaMs)}{t('지난 최고', 'Previous best')} {fmtMs(d.previousBest.totalMs)} {t('보다', '·')} <b>{v.b} {v.tail}</b>
				{:else}
					{t('첫 기록입니다.', 'This is your first record.')}
				{/if}
			</p>
		{/if}

		<div class="a-veil">
		<table class="a-tbl">
			<thead><tr><th>{t('문제', 'Problem')}</th><th class="r">{t('이번', 'This')}</th><th class="r">{t('비교', 'Best')}</th><th class="r">{t('실행', 'Runs')}</th></tr></thead>
			<tbody>
				{#each d.problems as p (p.problemId)}
					<tr>
						<td>
							{p.title}
							<span class="sub">{p.topicLabel}{p.outcome === 'skipped' ? ` · ${t('건너뜀', 'Skipped')}` : p.outcome === null ? ` · ${t('도달하지 못함', 'Not reached')}` : ''}{p.overLimit ? ` · ${t('기준 시간 초과', 'Over the limit')}` : ''}</span>
							{#if p.lookups.length}<span class="sub">{t('찾아본 문법', 'Looked up')}: {p.lookups.map((l) => l.title).join(', ')}</span>{/if}
							{#if p.outcome}
								<form method="POST" action="/lang?/start" style="margin-top:2px">
									<input type="hidden" name="problemId" value={p.problemId} />
									<button class="a-btn quiet" style="padding:6px 0;min-height:32px;font-size:12.5px">{t('다시 풀기', 'Try again')}</button>
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
			<div class="a-kv"><span>{t('찾아본 문법', 'Looked up')}</span><b>{d.lookupCount}</b></div>
			{#if d.slowest}
				{@const s = d.slowest}
				<div class="a-kv"><span>{t('가장 느려진 곳', 'Slowest')}</span><span style="text-align:right">{s.title} · {s.basis === 'best' ? t('비교 기록보다', 'than best') : t('기준 시간보다', 'than limit')} <b class="a-warm">{fmtSpan(s.deltaMs)} {t('느림', 'slower')}</b></span></div>
			{/if}
			{#if d.fastest}
				{@const f = d.fastest}
				<div class="a-kv"><span>{t('가장 빨라진 곳', 'Fastest')}</span><span style="text-align:right">{f.title} · {f.basis === 'best' ? t('비교 기록보다', 'than best') : t('기준 시간보다', 'than limit')} <b>{fmtSpan(f.deltaMs)} {t('빠름', 'faster')}</b></span></div>
			{/if}
		</div>
		</div>
	{:else}
		{#if d.status === 'abandoned' && d.answered === 0}
			<div class="a-big sm">{t('중단', 'Abandoned')}</div>
			<p class="a-sub">{t('답한 점검이 없습니다.', 'No checks answered.')}</p>
		{:else}
			<div class="a-big" class:a-warm={d.isBest}>{d.correct}<span class="a-dim" style="font-size:.45em"> / {d.answered}</span></div>
			<p class="a-sub">
				{#if d.status === 'abandoned'}{t('중단한 기록입니다. 답한', 'Abandoned. You got')} {d.answered} {t('개 중', 'of')} {d.correct} {t('개를 맞혔습니다.', 'correct.')}
				{:else}{t('정확도', 'Accuracy')} <b>{pct(d.accuracy)}</b>{/if}
				{#if d.status === 'finished'}
					{#if d.previousBest}
						· {t('지난 최고', 'Previous best')} {d.previousBest.correct} ({pct(d.previousBest.accuracy)}){d.correct > d.previousBest.correct ? ` ${t('보다', 'more')}` : ''}{#if d.correct > d.previousBest.correct}<b>{d.correct - d.previousBest.correct} {t('개 더', 'more')}</b>{:else if d.correct < d.previousBest.correct}{t('보다', 'fewer than')} {d.previousBest.correct - d.correct}{:else}{t('와 같음', 'same')}{/if}
					{:else}
						· {t('첫 기록입니다.', 'This is your first record.')}
					{/if}
				{/if}
			</p>
		{/if}

		{#if missed.length}
			<h2 class="a-h2">{t('틀린 점검', 'Missed checks')} {missed.length}</h2>
			{#each missed as a (a.checkId)}
				{@render answerCard(a)}
			{/each}
		{:else if d.answered > 0}
			<p class="a-p">{t('틀린 점검이 없습니다.', 'No missed checks.')}</p>
		{/if}

		{#if rights.length}
			<details class="a-fold">
				<summary>{t('맞힌 점검 보기', 'Show passed checks')} ({rights.length})</summary>
				{#each rights as a (a.checkId)}
					{@render answerCard(a)}
				{/each}
			</details>
		{/if}
	{/if}

	<div class="a-row" style="margin-top:8px">
		<form method="POST" action={d.kind === 'sprint' ? '/spar?/startSprint' : '/spar?/startRecall'}><button class="a-btn">{t('다시 하기', 'Try again')}</button></form>
		<a class="a-btn ghost" href="/spar">{t('Sparring 홈', 'Sparring home')}</a>
		<a class="a-btn quiet" href="/spar/records">{t('기록', 'Records')}</a>
	</div>
</main>

{#snippet answerCard(a: SparRecallAnswerRow)}
	<div class="a-miss">
		<span class="a-small">{a.kindLabel} · {fmtMs(a.ms)}{a.recorded ? '' : ` · ${t('한 시간 안에 이미 답해 복습 기록은 남기지 않았습니다', 'Already answered within an hour; not counted as review')}`}</span>
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
							{k === a.choice ? t('내 답', 'My answer') : ''}{k === a.choice && k === a.correctIndex ? ' · ' : ''}{k === a.correctIndex ? (a.kind === 'bug' ? t('버그가 있는 줄', 'Buggy line') : t('정답', 'Correct')) : ''}
						</p>
					{/if}
					{#if a.kind !== 'bug' && a.whys[k] && (k === a.correctIndex || k === a.choice)}<p class="a-why" style="margin-top:6px">{@html renderInline(a.whys[k])}</p>{/if}
				</div>
			{/each}
		</div>
		{#if a.kind === 'bug'}
			{#if a.why}<p class="a-why">{@html renderInline(a.why)}</p>{/if}
			{#if a.fixed}<div class="a-glass" style="background:rgba(8,9,13,.9)"><span>{t('고친 줄', 'Fixed line')}</span><pre class="a-code">{a.fixed}</pre></div>{/if}
		{/if}
	</div>
{/snippet}
