<script lang="ts">
	import { stage } from '#lib/ambience/stage.svelte.ts';
	$effect(() => { stage.scene = 'still'; stage.progress = undefined; });
	import { fmtDate } from '#lib/spar/format.ts';
	import type { SparRecordsData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: SparRecordsData } = $props();
</script>

<svelte:head><title>Sparring {t('기록', 'records')} · Matrix</title></svelte:head>

<main class="a-page mid">
	<div class="a-top"><a href="/spar" style="color:inherit;text-decoration:none">‹ Sparring</a><span>{data.total} {t('회', 'records')}</span></div>
	<h1 class="a-h">{t('기록', 'Records')}</h1>

	{#if data.rows.length === 0}
		<p class="a-sub">{t('아직 기록이 없습니다. 한 번 해 보면 여기에 남습니다.', 'No records yet. Complete a round and it will appear here.')}</p>
		<div class="a-row"><a class="a-btn" href="/spar">{t('Sparring 홈', 'Sparring home')}</a></div>
	{:else}
		<div>
			{#each data.rows as r (r.id)}
				<a class="a-rec" href="/spar/run/{r.id}">
					<span class="a-small a-num">{fmtDate(r.startedAt)}</span>
					<span>{r.kind === 'sprint' ? 'Sprint' : 'Recall'}{#if r.best} <span class="a-warm" style="font-size:12.5px">· {t('최고 기록', 'best')}</span>{/if}</span>
					<span class="a-num" class:a-dim={r.status !== 'finished'}>{r.label}</span>
				</a>
			{/each}
			<hr class="a-line" />
		</div>
		{#if data.truncated}<p class="a-small">{t('가장 최근', 'Showing the latest')} {data.rows.length}</p>{/if}
	{/if}
</main>
