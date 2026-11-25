<script lang="ts">
	import { Ambience } from '#lib/ambience/index.ts';
	import { fmtDate } from '#lib/spar/format.ts';
	import type { SparRecordsData } from '#lib/types.ts';

	let { data }: { data: SparRecordsData } = $props();
</script>

<svelte:head><title>Sparring 기록 · Matrix</title></svelte:head>
<Ambience scene="still" />

<main class="a-page mid">
	<div class="a-top"><a href="/spar" style="color:inherit;text-decoration:none">‹ Sparring</a><span>{data.total}회</span></div>
	<h1 class="a-h">기록</h1>

	{#if data.rows.length === 0}
		<p class="a-sub">아직 기록이 없습니다. 한 번 해 보면 여기에 남습니다.</p>
		<div class="a-row"><a class="a-btn" href="/spar">Sparring 홈</a></div>
	{:else}
		<div>
			{#each data.rows as r (r.id)}
				<a class="a-rec" href="/spar/run/{r.id}">
					<span class="a-small a-num">{fmtDate(r.startedAt)}</span>
					<span>{r.kind === 'sprint' ? 'Sprint' : 'Recall'}{#if r.best} <span class="a-warm" style="font-size:12.5px">· 최고 기록</span>{/if}</span>
					<span class="a-num" class:a-dim={r.status !== 'finished'}>{r.label}</span>
				</a>
			{/each}
			<hr class="a-line" />
		</div>
		{#if data.truncated}<p class="a-small">가장 최근 {data.rows.length}회만 보입니다.</p>{/if}
	{/if}
</main>
