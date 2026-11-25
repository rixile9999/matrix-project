<script lang="ts">
	import { onMount } from 'svelte';
	// Model-made SVG never enters the page DOM: it is shown in a sandboxed iframe (no scripts, no network, no same-origin).
	let { svg }: { svg: string } = $props();

	let dark = $state(false);
	onMount(() => {
		const t = document.documentElement.dataset.theme;
		dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
	});
	// Height follows the drawing's own proportions (viewBox) so a wide, short figure does not sit in a tall empty box.
	const ratio = $derived.by(() => {
		const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
		const w = m ? Number(m[1]) : 0;
		const h = m ? Number(m[2]) : 0;
		return w > 0 && h > 0 ? `${w} / ${h}` : null;
	});
	const doc = $derived(
		`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
			`<style>html,body{margin:0;height:100%}body{background:${dark ? '#171d27' : '#fff'};display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%;height:auto}</style>${svg}`
	);
</script>

<div class="co-viz">
	<iframe class="co-svg" style:aspect-ratio={ratio} style:height={ratio ? 'auto' : null} sandbox="" srcdoc={doc} title="설명 그림" loading="lazy"></iframe>
</div>
