<script lang="ts">
	import { enhance } from '$app/forms';
	import { mmss } from '#lib/rank.ts';
	import type { LangHomeData } from '#lib/types.ts';

	let { data, form }: { data: LangHomeData; form: { error?: string } | null } = $props();

	const total = $derived(data.problems.length);
	const pct = $derived(total === 0 ? 0 : (data.passedCount / total) * 100);
	const next = $derived(data.problems.find((p) => p.id === data.nextId));
	const label = { new: '새 문제', attempted: '푸는 중', passed: '통과' } as const;
</script>

<svelte:head><title>언어 · Matrix</title></svelte:head>

<div class="body">
	<div class="lang-head">
		<div class="lang-progress">
			<span class="label">Scala 진도</span>
			<span><b>{data.passedCount}</b> <span class="mono" style="color:var(--muted)">/ {total}</span></span>
			<div class="track" role="img" aria-label="{total}문제 중 {data.passedCount}문제 통과"><b style="width:{pct}%"></b></div>
		</div>
		{#if data.nextId}
			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="problemId" value={data.nextId} />
				<button class="btn big">다음 문제{next ? ` · ${next.title}` : ''}</button>
			</form>
		{:else if total > 0}
			<span class="lang-sum ok">모두 통과했습니다</span>
		{/if}
	</div>
	{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}

	<div>
		<h3>커리큘럼</h3>
		{#if total === 0}
			<p class="empty">문제가 없습니다.</p>
		{:else}
			<div class="rows">
				{#each data.problems as p (p.id)}
					<div class="lang-row">
						<form method="POST" action="?/start" use:enhance>
							<input type="hidden" name="problemId" value={p.id} />
							<button aria-label="{p.title} 시작">
								<span class="cell ord">{String(p.order).padStart(2, '0')}</span>
								<span class="cell prob">{p.title}</span>
								<span class="cell mono st">{mmss(p.limitSec)}</span>
								<span class="cell st" class:passed={p.status === 'passed'}>
									{label[p.status]}{#if p.bestSec !== null}<span class="mono"> · {mmss(p.bestSec)}</span>{/if}{#if p.status === 'passed' && p.clean}<span class="clean">clean</span>{/if}
								</span>
							</button>
						</form>
						{#if p.targets && p.targets.length}
							<div class="sub">{#each p.targets as t (t)}<span class="tag">{t}</span>{/each}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
