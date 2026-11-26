<script lang="ts">
	import { createOrganism } from './organism.ts';
	import type { GardenForm } from '#lib/types.ts';

	let { form, label }: { form: GardenForm; label: string } = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let organism: ReturnType<typeof createOrganism> | undefined;

	$effect(() => {
		if (!canvas) return;
		const o = createOrganism(canvas);
		organism = o;
		return () => { o.destroy(); if (organism === o) organism = undefined; };
	});

	$effect(() => {
		const f = form;
		canvas; // re-run once the organism exists
		organism?.set(f);
	});
</script>

<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
<canvas bind:this={canvas} role="img" aria-label={label}></canvas>

<style>
	canvas { display: block; width: 100%; height: 100%; }
</style>
