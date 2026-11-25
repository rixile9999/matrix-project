<script lang="ts">
	import { BLOCK_KINDS, parseAnswer } from '#lib/core/coach.ts';
	import { renderMarkdown } from './markdown.ts';
	import Trace from './Trace.svelte';
	import Flow from './Flow.svelte';
	import Compare from './Compare.svelte';
	import SvgFrame from './SvgFrame.svelte';

	// messageId set = the answer is stored (trace blocks may be verified); streaming = text is still arriving.
	let { text, messageId = null, streaming = false }: { text: string; messageId?: number | null; streaming?: boolean } = $props();

	const segs = $derived.by(() => {
		let t = 0;
		return parseAnswer(text).map((s) => ({ s, trace: s.type === 'trace' ? t++ : -1 }));
	});
	const pending = (lang: string) => streaming && (BLOCK_KINDS as readonly string[]).includes(lang);
</script>

<div class="co-answer">
	{#each segs as { s, trace }, i (i)}
		{#if s.type === 'text'}
			<div class="co-md">{@html renderMarkdown(s.text)}</div>
		{:else if s.type === 'code'}
			{#if pending(s.lang)}
				<p class="co-drawing"><span class="pulse"></span>그림을 그리는 중…</p>
			{:else}
				<pre class="co-code">{s.code}</pre>
			{/if}
		{:else if s.type === 'trace'}
			<Trace block={s.block} {messageId} blockIndex={trace} />
		{:else if s.type === 'flow'}
			<Flow block={s.block} />
		{:else if s.type === 'compare'}
			<Compare block={s.block} />
		{:else if s.type === 'svg'}
			<SvgFrame svg={s.svg} />
		{/if}
	{/each}
</div>
