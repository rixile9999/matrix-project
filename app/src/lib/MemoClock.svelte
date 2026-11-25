<script lang="ts">
	import { onMount } from 'svelte';
	import TimeGlyph from '#lib/TimeGlyph.svelte';

	// Countdown for one item, drawn as a waning moon (TimeGlyph). Past zero it becomes an empty warm ring; the item goes on.
	let { startedAt, limitSec, stoppedAt = null }: { startedAt: number; limitSec: number; stoppedAt?: number | null } = $props();

	let t = $state(Date.now());
	onMount(() => {
		const h = setInterval(() => (t = Date.now()), 250);
		return () => clearInterval(h);
	});
	const left = $derived(limitSec - Math.floor(((stoppedAt ?? t) - startedAt) / 1000));
</script>

<TimeGlyph remainingSec={left} {limitSec} size={18} />
