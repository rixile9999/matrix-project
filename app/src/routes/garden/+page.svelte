<script lang="ts">
	import '#lib/ambience/arena.css';
	import Plant from '#lib/garden/Plant.svelte';
	import Legend from '#lib/garden/Legend.svelte';
	import Rhythm from '#lib/garden/Rhythm.svelte';
	import Reading from '#lib/garden/Reading.svelte';
	import type { GardenData } from '#lib/types.ts';

	let { data }: { data: GardenData } = $props();

	const last = $derived(data.days.length - 1);
	let picked = $state(-1); // -1 = today
	const i = $derived(picked < 0 ? last : Math.min(picked, last));
	const cur = $derived(data.days[i]);
	const form = $derived(cur.form);
	const past = $derived(i < last);
	const dateText = $derived.by(() => {
		const [, m, d] = cur.date.split('-').map(Number);
		return `${m}월 ${d}일`;
	});
	const label = $derived(`기록에서 자란 모양. ${form.kindLabel}. 통과한 문제 ${form.numbers.langPassed}개, 복습 ${form.numbers.memoReviews}회, 잎 ${form.leafCount}장.`);
</script>

<svelte:head><title>Garden · Matrix</title></svelte:head>

<div class="arena g-room">
	<main class="a-page g-page">
		<header>
			<h1 class="a-title">Garden</h1>
			<p class="a-sub">내 기록이 형태로 자라는 방입니다. 점수가 아니라 모양이 남습니다. 아래 모양은 기록한 행동에서만 그려지며, 나를 판단하지 않습니다.</p>
		</header>

		<section class="room" aria-label="기록에서 자란 모양">
			<div class="stage">
				<Plant {form} {label} />
				<div class="cap">
					<span class="a-num">{form.day ? `${form.day}일째` : '기록 없음'}</span>
					<span>{form.kindLabel}</span>
				</div>
			</div>
			<div class="side">
				<div class="time">
					<h2>날짜 되돌리기</h2>
					{#if last > 0}
						<label class="slide">
							<span class="sr">날짜</span>
							<input type="range" min="0" max={last} step="1" value={i} oninput={(e) => (picked = +e.currentTarget.value)} aria-valuetext="{dateText}, {form.day}일째" />
						</label>
						<div class="when">
							<span class="a-num">{dateText} · {form.day}일째{past ? '' : ' (오늘)'}</span>
							{#if past}<button type="button" class="a-btn quiet" onclick={() => (picked = -1)}>오늘로</button>{/if}
						</div>
						<div class="ends a-num" aria-hidden="true"><span>{data.days[0].date.slice(5).replace('-', '.')}</span><span>{data.days[last].date.slice(5).replace('-', '.')}</span></div>
					{:else}
						<p class="a-small">{form.day ? '기록이 오늘 하루뿐이라 되돌릴 날이 없습니다.' : '기록이 쌓이면 지난 모습을 볼 수 있습니다.'}</p>
					{/if}
				</div>
				<p class="a-small">쉬는 동안에는 시들지 않고 그대로 멈춰 있습니다. 같은 기록에서는 언제나 같은 모양이 나오므로, 날짜를 되돌려 그날까지의 모습을 볼 수 있습니다.</p>
				{#if past}<p class="a-small a-warm">{dateText}까지의 기록으로 그린 모양입니다.</p>{/if}
			</div>
		</section>

		<section aria-labelledby="g-legend">
			<h2 id="g-legend">읽는 법</h2>
			<Legend {form} />
		</section>

		<section class="cols">
			<div aria-labelledby="g-rhythm">
				<h2 id="g-rhythm">내 리듬 · 시간대별 정답률</h2>
				<Rhythm rhythm={data.rhythm} />
			</div>
			<div aria-labelledby="g-read">
				<h2 id="g-read">이번 주 풀이</h2>
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
