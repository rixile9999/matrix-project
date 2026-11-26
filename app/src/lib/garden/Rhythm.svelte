<script lang="ts">
	// "내 리듬": first-attempt success by hour of day, with the number of cases behind every hour.
	import type { GardenRhythm } from '#lib/types.ts';

	let { rhythm }: { rhythm: GardenRhythm } = $props();
	let picked = $state<number | null>(null);
	const sel = $derived(picked === null ? null : rhythm.hours[picked]);
	const summary = $derived(
		rhythm.total === 0 ? '아직 시간대별 기록이 없습니다.' : `시간대별 첫 시도 정답률 막대. 기록 ${rhythm.total}건. 기록이 ${rhythm.minPerHour}건보다 적은 시간대는 흐리게 그립니다.`
	);
</script>

<div class="hours" role="group" aria-label={summary}>
	{#each rhythm.hours as h (h.hour)}
		<button
			type="button" class="hr" class:faint={!h.enough} class:on={picked === h.hour} aria-pressed={picked === h.hour}
			aria-label={h.n ? `${h.hour}시, ${h.n}건 중 ${h.ok}건, ${Math.round(h.rate! * 100)}%${h.enough ? '' : ', 기록이 적음'}` : `${h.hour}시, 기록 없음`}
			onclick={() => (picked = picked === h.hour ? null : h.hour)}
		>
			<i style="height:{h.n ? Math.max(3, h.rate! * 100) : 2}%"></i>
		</button>
	{/each}
</div>
<div class="axis" aria-hidden="true"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
<p class="read" aria-live="polite">
	{#if sel}
		{#if sel.n}
			<b>{sel.hour}시</b> · {sel.n}건 중 {sel.ok}건 · {Math.round(sel.rate! * 100)}%{sel.enough ? '' : ` · ${rhythm.minPerHour}건 미만이라 이름 붙이지 않음`}
		{:else}
			<b>{sel.hour}시</b> · 기록 없음
		{/if}
	{:else}
		막대를 누르면 건수가 보입니다. 막대 높이는 정답률(0~100%)입니다.
	{/if}
</p>

<div class="facts">
	{#each rhythm.facts as f (f.key)}
		<div class="fact">
			<span>{f.label}</span>
			{#if f.value}<b>{f.value}</b>{:else}<b class="none">아직 기록이 부족합니다</b>{/if}
			{#if !f.value}<small>{f.need}</small>{/if}
		</div>
	{/each}
</div>
<p class="note">첫 시도만 셉니다. 암기 복습은 기억났는지, 언어 문제는 처음 푼 때 제한 시간 안에 힌트 없이 통과했는지입니다. 시각은 이 컴퓨터의 시간입니다. 기록이 {rhythm.minPerHour}건보다 적은 시간대는 흐리게 그리고, 가장 잘하거나 흔들리는 시간으로 꼽지 않습니다.</p>

<style>
	.hours { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 3px; height: 92px; }
	.hr { display: flex; align-items: flex-end; padding: 0; border: 0; background: none; cursor: pointer; min-width: 0; border-bottom: 1px solid var(--a-faint); }
	.hr i { display: block; width: 100%; background: var(--a-ink); border-radius: 2px 2px 0 0; opacity: .86; transition: opacity .4s; }
	.hr.faint i { opacity: .2; }
	.hr.on i, .hr:hover i { opacity: 1; background: var(--a-warm); }
	.hr:focus-visible { outline: 2px solid var(--a-warm); outline-offset: 2px; }
	.axis { display: flex; justify-content: space-between; font: 500 11px var(--a-mono); color: var(--a-dim); margin-top: 6px; }
	.read { margin: 10px 0 0; min-height: 22px; font-size: 13px; color: var(--a-dim); }
	.read b { font: 500 13px var(--a-mono); color: var(--a-ink); }
	.facts { margin-top: 12px; }
	.fact { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; padding: 10px 0; border-top: 1px solid var(--a-faint); font-size: 14px; color: var(--a-dim); }
	.fact b { font: 500 14px var(--a-mono); font-variant-numeric: tabular-nums; font-variant-ligatures: none; color: var(--a-ink); text-align: right; }
	.fact b.none { font: 400 13px var(--a-body); color: var(--a-dim); }
	.fact small { flex-basis: 100%; font-size: 12px; color: var(--a-dim); opacity: .8; }
	.note { margin: 12px 0 0; font-size: 12.5px; color: var(--a-dim); }
</style>
