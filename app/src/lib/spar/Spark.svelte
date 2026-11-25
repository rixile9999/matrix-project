<script lang="ts">
	// Hairline trend of up to five values, oldest first. `lowerIsBetter` flips the axis so "better" is always higher on screen.
	let { values, lowerIsBetter = false, bestIndex = -1, label }: { values: number[]; lowerIsBetter?: boolean; bestIndex?: number; label: string } = $props();
	const W = 200, H = 34, PAD = 4;
	const pts = $derived.by(() => {
		if (!values.length) return [];
		const lo = Math.min(...values), hi = Math.max(...values);
		return values.map((v, i) => {
			const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
			const y = PAD + (lowerIsBetter ? t : 1 - t) * (H - 2 * PAD);
			const x = values.length === 1 ? W / 2 : PAD + (i / (values.length - 1)) * (W - 2 * PAD);
			return { x, y };
		});
	});
	const d = $derived(pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
</script>

{#if pts.length}
	<svg class="a-spark" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
		{#if pts.length > 1}<path {d} />{/if}
		{#each pts as p, i (i)}<circle cx={p.x} cy={p.y} r={i === bestIndex ? 3 : 2} class:best={i === bestIndex} />{/each}
	</svg>
{/if}
