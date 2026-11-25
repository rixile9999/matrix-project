<script lang="ts">
	import type { FlowBlock } from '#lib/core/coach.ts';
	let { block }: { block: FlowBlock } = $props();
</script>

<div class="co-viz">
	<div class="co-viz-head"><span>{block.title}</span></div>
	<div class="co-flow">
		{#each block.steps as st, i (i)}
			{#if i > 0}<div class="co-arrow">↓ {block.steps[i - 1].note ?? ''}</div>{/if}
			<div class="co-box">{st.code}</div>
		{/each}
	</div>
</div>
