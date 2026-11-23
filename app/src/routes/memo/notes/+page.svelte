<script lang="ts">
	import { renderInline } from '#lib/inline.ts';
	import type { MemoNotesData } from '#lib/types.ts';

	let { data }: { data: MemoNotesData } = $props();
	let onlyShaky = $state(false);

	const groups = $derived(
		data.groups.map((g) => ({ ...g, rows: onlyShaky ? g.rows.filter((r) => r.status === 'shaky') : g.rows })).filter((g) => g.rows.length > 0)
	);
	const dot = { stable: 'd-ok', shaky: 'd-warn', new: 'd-new' } as const;
</script>

<svelte:head><title>암기 노트 · Matrix</title></svelte:head>

<div class="memo">
	<div class="m-top"><a href="/memo" style="color:inherit">‹ 암기</a><span>암기 노트</span></div>
	<div class="m-legend"><span><i class="m-dot d-ok"></i>안정</span><span><i class="m-dot d-warn"></i>흔들림</span><span><i class="m-dot d-new"></i>아직 안 배움</span></div>
	<label class="m-filter"><input type="checkbox" bind:checked={onlyShaky} />흔들림만 ({data.shaky})</label>

	{#if groups.length === 0}
		<p class="m-empty">{onlyShaky ? '흔들리는 카드가 없습니다.' : '아직 노트가 없습니다.'}</p>
	{/if}
	{#each groups as g (g.key)}
		<div>
			<h3 class="m-note-h">{g.heading}</h3>
			{#if g.sub}<p class="m-note-sub">{@html renderInline(g.sub)}</p>{/if}
			{#if g.steps.length > 0}<ol class="m-note-steps">{#each g.steps as s, i (i)}<li>{@html renderInline(s)}</li>{/each}</ol>{/if}
			{#each g.rows as r (r.id)}
				<div class="m-nrow" class:locked={r.locked}>
					<i class="m-dot {dot[r.status]}"></i>
					<div>{r.title}<small>{#if r.summary !== null}{@html renderInline(r.summary)}{:else}문제를 풀면 열립니다{/if}</small></div>
				</div>
			{/each}
		</div>
	{/each}
</div>
