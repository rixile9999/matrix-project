<script lang="ts">
	import { onMount } from 'svelte';

	// Countdown for one item. Past zero it turns into a muted "+m:ss" overtime display; the item goes on.
	let { startedAt, limitSec, stoppedAt = null }: { startedAt: number; limitSec: number; stoppedAt?: number | null } = $props();

	let t = $state(Date.now());
	onMount(() => {
		const h = setInterval(() => (t = Date.now()), 250);
		return () => clearInterval(h);
	});
	const left = $derived(limitSec - Math.floor(((stoppedAt ?? t) - startedAt) / 1000));
	const text = $derived(`${left < 0 ? '+' : ''}${Math.floor(Math.abs(left) / 60)}:${String(Math.abs(left) % 60).padStart(2, '0')}`);
</script>

<span class="m-clock" class:over={left < 0} role="timer" aria-label={left < 0 ? '제한 시간 초과' : '남은 시간'}>{text}</span>
