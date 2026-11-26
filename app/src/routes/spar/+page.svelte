<script lang="ts">
	import { enhance } from '$app/forms';
	import { AmbienceControls, audio, settings } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';
	$effect(() => { stage.scene = 'home'; stage.progress = undefined; });
	import Spark from '#lib/spar/Spark.svelte';
	import { fmtMs } from '#lib/core/spar.ts';
	import type { SparHomeData, SparKindHome, SparMode } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data, form }: { data: SparHomeData; form: { error?: string } | null } = $props();

	let which = $state<SparMode | null>(null);
	let busy = $state(false);

	const chal = $derived([
		{ kind: 'sprint' as const, name: 'Sprint', about: t('통과한 기본 문제 다섯 개를 이어서 풉니다. 시계는 하나입니다.', 'Solve five passed basics in a row. One clock.'), k: data.sprint, action: '?/startSprint' },
		{ kind: 'recall' as const, name: 'Recall', about: t('90초 동안 코드 점검을 최대한 많이 맞힙니다.', 'Answer as many code checks as possible in 90 seconds.'), k: data.recall, action: '?/startRecall' },
		{ kind: 'stats' as const, name: t('확률·통계', 'Statistics'), about: t('제한 시간 안에 확률·통계 문제 세 개를 풉니다.', 'Solve three timed probability and statistics problems.'), k: data.stats, action: '?/startStats' }
	]);

	const reason = (kind: SparMode, k: SparKindHome) =>
		kind === 'sprint'
			? `${t('통과한 기본 문제가', 'You need at least')} ${k.needed} ${t('개 이상 있어야 합니다. 지금', 'passed basics. You have')} ${k.eligible}.`
			: kind === 'recall'
				? `${t('열린 점검이', 'You need at least')} ${k.needed} ${t('개 이상 있어야 합니다. 지금', 'open checks. You have')} ${k.eligible}.`
				: t('풀 수 있는 통계 문제가 부족합니다.', 'There are not enough statistics problems.');
	const trendValues = (kind: SparMode, k: SparKindHome) => k.trend.map((r) => (kind === 'sprint' ? (r.totalMs ?? 0) : r.correct));
	const trendBest = (k: SparKindHome) => k.trend.findIndex((r) => r.best);
	const mark = (r: { label: string } | null) => (r ? r.label : t('없음', 'None'));
</script>

<svelte:head><title>Sparring · Matrix</title></svelte:head>

<main class="a-page mid">
	<div class="a-top"><span>Sparring</span><a class="a-small" href="/spar/records" style="color:var(--a-dim)">{t('기록', 'Records')} {data.runs}</a></div>
	<h1 class="a-title">Sparring</h1>
	<p class="a-sub">{t('이미 아는 것을 얼마나 빠르고 정확하게 꺼내는지 잽니다. 비교 대상은 지난 나의 기록뿐입니다.', 'Measure how quickly and accurately you retrieve what you know. Compare only with your past self.')}</p>

	{#if data.active}
		<div class="a-chal">
			<p class="a-p">{chal.find((c) => c.kind === data.active?.kind)?.name} {t('진행 중입니다.', 'is in progress.')}</p>
			<div class="a-row"><a class="a-btn" href={data.active.url}>{t('이어서 하기', 'Continue')}</a></div>
		</div>
	{/if}

	{#each chal as c (c.kind)}
		<section class="a-chal" aria-labelledby="h-{c.kind}">
			<h2 class="a-h2" id="h-{c.kind}">{c.name}</h2>
			<p class="a-sub">{c.about}</p>
			<div class="a-cols">
				<div class="a-rows">
					<div class="a-kv"><span>{t('최고 기록', 'Best')}</span><b class:a-warm={c.k.best}>{mark(c.k.best)}</b></div>
					<div class="a-kv"><span>{t('지난 기록', 'Previous')}</span><b>{mark(c.k.last)}</b></div>
				</div>
				<div class="a-trend">
					<span class="a-small">{t('최근', 'Last')} {c.k.trend.length}</span>
					{#if c.k.trend.length}
						<Spark values={trendValues(c.kind, c.k)} lowerIsBetter={c.kind === 'sprint'} bestIndex={trendBest(c.k)} label={t(`${c.name} 최근 기록 추이`, `Recent ${c.name} results`)} />
					{:else}
						<span class="a-small">{t('아직 기록이 없습니다.', 'No records yet.')}</span>
					{/if}
				</div>
			</div>
			{#if !data.active}
				<form
					method="POST" action={c.action} class="a-row" style="align-items:center"
					use:enhance={() => {
						which = c.kind; busy = true;
						if (settings.sound) audio.enable(true); // a click: the browser allows audio to start here
						return async ({ update }) => { await update(); busy = false; };
					}}
				>
					<button class="a-btn" disabled={!c.k.startable || busy}>{t('시작', 'Start')}</button>
					{#if !c.k.startable}<span class="a-small">{reason(c.kind, c.k)}</span>{/if}
				</form>
				{#if form?.error && which === c.kind}<p class="a-err" role="alert">{form.error}</p>{/if}
			{/if}
		</section>
	{/each}

	<div class="a-corner"><a class="a-small" href="/ambience-demo/desk">{t('관측 데스크 시안', 'Observation desk preview')}</a><AmbienceControls /></div>
</main>
