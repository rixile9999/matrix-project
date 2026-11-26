<script lang="ts">
	import '#lib/ambience/arena.css';
	import Plant from '#lib/garden/Plant.svelte';
	import Rhythm from '#lib/garden/Rhythm.svelte';
	import Reading from '#lib/garden/Reading.svelte';
	import type { GardenData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: GardenData } = $props();

	const last = $derived(data.days.length - 1);
	let picked = $state(-1); // -1 = today
	const i = $derived(picked < 0 ? last : Math.min(picked, last));
	const cur = $derived(data.days[i]);
	const form = $derived(cur.form);
	const past = $derived(i < last);
	const dateText = $derived.by(() => {
		const [, m, d] = cur.date.split('-').map(Number);
		return `${m}${t('월', '/')} ${d}${t('일', '')}`;
	});
	const label = $derived(`${t('기록에서 자란 모양', 'A shape grown from your record')}. ${form.kindLabel}. ${t('통과한 코딩 문제', 'Coding problems passed')} ${form.numbers.langPassed}, ${t('복습', 'reviews')} ${form.numbers.memoReviews}, ${t('잎', 'leaves')} ${form.leafCount}.${form.numbers.statsRuns ? ` ${t('푼 확률·통계 세션', 'Statistics sessions solved')} ${form.numbers.statsPassed}.` : ''}`);
</script>

<svelte:head><title>Garden · Matrix</title></svelte:head>

<div class="arena g-room">
	<main class="a-page g-page">
		<header>
			<h1 class="a-title">Garden</h1>
			<p class="a-sub">{t('기록이 자라는 방.', 'A room where your record grows.')}</p>
		</header>

		<section class="room" aria-label={t('기록에서 자란 모양', 'A shape grown from your record')}>
			<div class="stage">
				<Plant {form} {label} />
				<div class="cap">
					<span class="a-num">{form.day ? `${form.day}${t('일째', 'th day')}` : t('기록 없음', 'No record')}</span>
					<span>{form.kindLabel}</span>
				</div>
			</div>
			<div class="side">
				<div class="time">
					<h2>{t('날짜 되돌리기', 'Revisit a date')}</h2>
					{#if last > 0}
						<label class="slide">
							<span class="sr">{t('날짜', 'Date')}</span>
							<input type="range" min="0" max={last} step="1" value={i} oninput={(e) => (picked = +e.currentTarget.value)} aria-valuetext={`${dateText}, ${form.day}${t('일째', 'th day')}`} />
						</label>
						<div class="when">
							<span class="a-num">{dateText} · {form.day}{t('일째', 'th day')}{past ? '' : ` (${t('오늘', 'today')})`}</span>
							{#if past}<button type="button" class="a-btn quiet" onclick={() => (picked = -1)}>{t('오늘로', 'Today')}</button>{/if}
						</div>
						<div class="ends a-num" aria-hidden="true"><span>{data.days[0].date.slice(5).replace('-', '.')}</span><span>{data.days[last].date.slice(5).replace('-', '.')}</span></div>
					{:else}
						<p class="a-small">{form.day ? t('오늘이 첫날.', 'Today is day one.') : t('아직 씨앗.', 'Still a seed.')}</p>
					{/if}
				</div>
				{#if form.numbers.statsRuns}
					<div class="statistics" id="statistics">
						<h2><a href="/stats">{t('확률과 통계', 'Probability & Statistics')}</a></h2>
						<dl>
							<div><dt>{t('세션', 'Sessions')}</dt><dd class="a-num">{form.numbers.statsRuns}</dd></div>
							<div><dt>{t('정답', 'Solved')}</dt><dd class="a-num">{form.numbers.statsPassed}</dd></div>
						</dl>
					</div>
				{/if}
			</div>
		</section>

		<section class="cols">
			<div aria-labelledby="g-rhythm">
				<h2 id="g-rhythm">{t('리듬', 'Rhythm')}</h2>
				<Rhythm rhythm={data.rhythm} />
			</div>
			<div aria-labelledby="g-read">
				<h2 id="g-read">{t('이번 주 풀이', 'This week')}</h2>
				<Reading week={data.week} reading={data.reading} backends={data.backends} defaultBackend={data.defaultBackend} />
			</div>
		</section>
	</main>
</div>

<style>
	.g-room { min-height: 100vh; background: var(--a-bg); }
	.g-page { gap: 40px; width: min(1120px, 100%); padding-top: 28px; }
	h2 { font: 500 12px var(--a-mono); letter-spacing: .08em; color: var(--a-dim); margin: 0 0 12px; }
	.room { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 28px; align-items: start; }
	.stage { position: relative; border: 1px solid var(--a-faint); border-radius: 18px; overflow: hidden; aspect-ratio: 4 / 5; max-height: 640px; width: 100%; background: var(--a-bg); }
	.cap { position: absolute; left: 18px; right: 18px; bottom: 14px; display: flex; justify-content: space-between; gap: 10px; font: 500 12px var(--a-mono); color: var(--a-dim); pointer-events: none; }
	.side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
	.slide { display: block; }
	.slide input { width: 100%; accent-color: var(--a-warm); margin: 6px 0 2px; min-height: 28px; }
	.when { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: var(--a-ink); min-height: 40px; }
	.ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--a-dim); }
	.statistics { padding-top: 12px; border-top: 1px solid var(--a-faint); }
	.statistics h2 a { color: inherit; }
	.statistics dl { display: flex; flex-wrap: wrap; gap: 16px 30px; margin: 0; }
	.statistics dl div { display: flex; align-items: baseline; gap: 8px; }
	.statistics dt { font-size: 13px; color: var(--a-dim); }
	.statistics dd { margin: 0; color: var(--a-ink); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 40px 36px; }
	.cols > div { min-width: 0; }
	@media (max-width: 820px) {
		.room { grid-template-columns: minmax(0, 1fr); }
		.g-page { gap: 32px; }
	}
	@media (max-width: 520px) {
		.cols { grid-template-columns: minmax(0, 1fr); }
	}
</style>
