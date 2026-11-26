<script lang="ts">
	// "읽는 법": what each part of the form means, with the learner's own numbers behind it.
	import type { GardenForm } from '#lib/types.ts';

	let { form }: { form: GardenForm } = $props();
	const n = $derived(form.numbers);
	const pct = (x: number) => `${Math.round(x * 100)}%`;

	const rows = $derived([
		{ name: '줄기의 높이', what: '전체 연습량. 통과한 언어 문제, 암기 복습, 끝낸 Sparring이 쌓인 만큼 자란다.', nums: `통과 ${n.langPassed} · 복습 ${n.memoReviews} · Sparring ${n.sparRuns}` },
		{
			name: '가지가 퍼진 정도', what: '여러 주제에 고르게 연습했으면 벌어지고, 한 곳에 몰렸으면 곧게 선다.',
			nums: n.topics ? `주제 ${n.topics}/${n.topicsTotal}개 · 고름 ${pct(form.breadth)}` : '아직 기록 없음'
		},
		{ name: '잎', what: '기억이 안정된 카드. 흔들리는 카드는 잎이 되지 못한다.', nums: `잎 ${n.stableCards} · 안정된 카드 ${n.stableCards}장` },
		{ name: '뿌리', what: '복합 문제와 책 문제의 통과, 제한 시간을 넘기고도 끝내 푼 시간. 겉으로 안 보이는 공부.', nums: `복합·책 ${n.deepPassed}개 · 넘긴 시간 ${n.overtimeMin}분` },
		{
			name: '선의 필치', what: '빠르게 푸는 편이면 마른 붓의 끊긴 선, 천천히 푸는 편이면 먹을 머금은 이어진 선.',
			nums: n.medianRatio === null ? '통과 3개부터 계산' : `제한 시간의 ${pct(n.medianRatio)}를 씀 (중앙값)`
		},
		{ name: '금으로 이은 자리', what: '포기했거나 시간을 넘긴 뒤 다시 풀어 통과한 문제.', nums: `${n.mended}개` },
		{ name: '꽃', what: '드문 순간. Sparring 최고 기록을 새로 쓴 때, 복합 문제를 처음 통과한 때.', nums: `최고 기록 ${n.bests} · 복합 첫 통과 ${n.firstLevel3}` }
	]);
</script>

<div class="legend">
	{#each rows as r (r.name)}
		<div>
			<b>{r.name}</b>
			<span class="what">{r.what}</span>
			<span class="nums">{r.nums}</span>
		</div>
	{/each}
</div>

<style>
	.legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 28px; }
	.legend > div { padding: 12px 0; border-top: 1px solid var(--a-faint); font-size: 14px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.legend b { font-weight: 500; }
	.what { color: var(--a-dim); font-size: 13px; }
	.nums { font: 500 12.5px var(--a-mono); font-variant-numeric: tabular-nums; font-variant-ligatures: none; color: var(--a-warm); margin-top: 2px; overflow-wrap: anywhere; }
</style>
