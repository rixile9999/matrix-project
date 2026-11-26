<script lang="ts">
	import { renderInline } from '#lib/inline.ts';
	import type { MemoNotesData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: MemoNotesData } = $props();
	let onlyShaky = $state(false);

	const groups = $derived(
		data.groups.map((g) => ({ ...g, rows: onlyShaky ? g.rows.filter((r) => r.status === 'shaky') : g.rows })).filter((g) => g.rows.length > 0)
	);
	const dot = { stable: 'd-ok', shaky: 'd-warn', new: 'd-new' } as const;
</script>

<svelte:head><title>{t('암기 노트 · Matrix', 'Memo notes · Matrix')}</title></svelte:head>

<div class="memo">
	<div class="m-top"><a href="/memo" style="color:inherit">‹ {t('암기', 'Memo')}</a><span>{t('암기 노트', 'Memo notes')}</span></div>
	<div class="m-legend"><span><i class="m-dot d-ok"></i>{t('안정', 'Stable')}</span><span><i class="m-dot d-warn"></i>{t('흔들림', 'Shaky')}</span><span><i class="m-dot d-new"></i>{t('아직 안 배움', 'Not learned')}</span></div>
	<label class="m-filter"><input type="checkbox" bind:checked={onlyShaky} />{t(`흔들림만 (${data.shaky})`, `Shaky only (${data.shaky})`)}</label>

	{#if groups.length === 0}
		<p class="m-empty">{onlyShaky ? t('흔들리는 카드가 없습니다.', 'No shaky cards.') : t('아직 노트가 없습니다.', 'No notes yet.')}</p>
	{/if}
	{#each groups as g (g.key)}
		<div>
			<h3 class="m-note-h">{g.heading}</h3>
			{#if g.sub}<p class="m-note-sub">{@html renderInline(g.sub)}</p>{/if}
			{#if g.steps.length > 0}<ol class="m-note-steps">{#each g.steps as s, i (i)}<li>{@html renderInline(s)}</li>{/each}</ol>{/if}
			{#each g.rows as r (r.id)}
				<div class="m-nrow" class:locked={r.locked}>
					<i class="m-dot {dot[r.status]}"></i>
					<div>{r.title}<small>{#if r.summary !== null}{@html renderInline(r.summary)}{:else}{t('문제를 풀면 열립니다', 'Solve the problem to unlock')}{/if}</small></div>
				</div>
			{/each}
		</div>
	{/each}
</div>
