<script lang="ts">
	// "내 리듬": a day's wave, drawn like a biorhythm. Hours with enough first attempts set the wave; the rest is carried
	// smoothly between them (around the clock). Peak and trough are marked; no counts, no footnotes.
	import type { GardenRhythm } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { rhythm }: { rhythm: GardenRhythm } = $props();

	const W = 480, H = 120, TOP = 18, BOT = 98;
	const known = $derived(rhythm.hours.filter((h) => h.enough && h.rate !== null));
	const ready = $derived(known.length >= 2);

	/** 24 values on the clock: known hours as they are, the others interpolated around the circle. */
	const wave = $derived.by(() => {
		if (!ready) return Array.from({ length: 24 }, (_, h) => 0.5 + 0.08 * Math.sin(((h - 6) / 24) * 2 * Math.PI));
		const pts = known.map((h) => ({ h: h.hour, v: h.rate! }));
		return Array.from({ length: 24 }, (_, h) => {
			const hit = pts.find((p) => p.h === h);
			if (hit) return hit.v;
			const after = pts.find((p) => p.h > h) ?? { h: pts[0].h + 24, v: pts[0].v };
			const before = [...pts].reverse().find((p) => p.h < h) ?? { h: pts[pts.length - 1].h - 24, v: pts[pts.length - 1].v };
			const t = (h - before.h) / (after.h - before.h);
			return before.v + (after.v - before.v) * (0.5 - Math.cos(t * Math.PI) / 2);
		});
	});
	const lo = $derived(Math.min(...wave)), hi = $derived(Math.max(...wave));
	const X = (h: number) => (h / 24) * W;
	const Y = $derived((v: number) => (hi - lo < 0.02 ? (TOP + BOT) / 2 : BOT - ((v - lo) / (hi - lo)) * (BOT - TOP)));

	/** A closed Catmull-Rom curve through the hourly points (one extra point closes the day at 24h). */
	const path = $derived.by(() => {
		const p = [...wave, wave[0]].map((v, h) => [X(h), Y(v)] as const);
		const at = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))];
		let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
		for (let i = 0; i < p.length - 1; i++) {
			const [p0, p1, p2, p3] = [at(i - 1), p[i], p[i + 1], at(i + 2)];
			const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
			const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
			d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
		}
		return d;
	});
	const peak = $derived(ready ? wave.indexOf(hi) : null);
	const trough = $derived(ready ? wave.indexOf(lo) : null);
	const mid = $derived(Y((hi + lo) / 2));
	const now = new Date().getHours();

	const LABEL = $derived<Record<string, string>>({ best: t('고조', 'Peak'), shaky: t('저조', 'Low'), gapSlow: t('휴지기 뒤', 'After a pause'), gapReturn: t('회복 주기', 'Recovery') });
</script>

<svg viewBox="0 0 {W} {H + 16}" role="img" aria-label={ready ? `${t('하루의 리듬', 'Daily rhythm')}. ${t('고조', 'Peak')} ${peak}, ${t('저조', 'low')} ${trough}.` : t('하루의 리듬. 아직 잡히지 않음.', 'Daily rhythm. Not enough data yet.')}>
	<line x1="0" y1={mid} x2={W} y2={mid} class="mid" />
	<path d={path} class="wave" class:unset={!ready} />
	{#if ready && peak !== null && trough !== null}
		<circle cx={X(peak)} cy={Y(hi)} r="4" class="peak" />
		<text x={X(peak)} y={Y(hi) - 9} text-anchor="middle" class="tag">{t('고조', 'Peak')}</text>
		<circle cx={X(trough)} cy={Y(lo)} r="4" class="trough" />
		<text x={X(trough)} y={Y(lo) + 17} text-anchor="middle" class="tag">{t('저조', 'Low')}</text>
	{/if}
	<line x1={X(now)} y1={TOP - 8} x2={X(now)} y2={BOT + 8} class="now" />
	{#each [0, 6, 12, 18, 24] as h (h)}<text x={Math.min(W - 10, Math.max(10, X(h)))} y={H + 12} text-anchor="middle" class="ax">{h}{t('시', 'h')}</text>{/each}
</svg>

<div class="facts">
	{#each rhythm.facts as f (f.key)}
		<div class="fact"><span>{LABEL[f.key] ?? f.label}</span><b class:none={!f.value}>{f.value ? (f.key === 'best' || f.key === 'shaky' ? f.value.split(' · ')[0] : f.value.replace(/\s*\(\d+건\)/, '')) : '—'}</b></div>
	{/each}
</div>

<style>
	svg { display: block; width: 100%; height: auto; overflow: visible; }
	.mid { stroke: var(--a-faint); stroke-dasharray: 2 4; }
	.wave { fill: none; stroke: var(--a-warm); stroke-width: 2; stroke-linecap: round; }
	.wave.unset { stroke: var(--a-dim); stroke-dasharray: 3 5; opacity: .6; }
	.peak { fill: var(--a-warm); }
	.trough { fill: none; stroke: var(--a-warm); stroke-width: 1.5; }
	.now { stroke: var(--a-ink); stroke-opacity: .25; }
	.tag { font: 500 11px var(--a-mono); fill: var(--a-ink); }
	.ax { font: 500 11px var(--a-mono); fill: var(--a-dim); }
	.facts { margin-top: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
	.fact { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--a-faint); font-size: 14px; color: var(--a-dim); }
	.fact b { font: 500 14px var(--a-mono); font-variant-numeric: tabular-nums; color: var(--a-ink); text-align: right; }
	.fact b.none { color: var(--a-dim); }
</style>
