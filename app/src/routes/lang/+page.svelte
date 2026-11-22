<script lang="ts">
	import { enhance } from '$app/forms';
	import { mmss } from '#lib/rank.ts';
	import { LEVELS } from '#lib/core/lang.ts';
	import type { LangHomeData, LangKind } from '#lib/types.ts';

	let { data, form }: { data: LangHomeData; form: { error?: string } | null } = $props();

	const total = $derived(data.levels.reduce((n, l) => n + l.total, 0));
	const label = { new: '새 문제', attempted: '푸는 중', passed: '통과' } as const;
	const KIND: Record<LangKind, string> = { write: '', fix: '버그 수정', refactor: '리팩터링', complete: '완성' };
</script>

<svelte:head><title>언어 · Matrix</title></svelte:head>

<div class="body">
	<div class="lang-head">
		<h2 class="lang-h">Scala</h2>
		<span class="grow"></span>
		<a class="btn ghost" href="/lang/cheatsheet">치트시트</a>
	</div>
	{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}

	{#if total === 0}
		<p class="empty">문제가 없습니다.</p>
	{:else}
		<div class="lang-levels">
			{#each data.levels as l (l.level)}
				<div class="lang-progress">
					<span class="label">{l.label}</span>
					<span><b>{l.passed}</b> <span class="mono" style="color:var(--muted)">/ {l.total}</span></span>
					<div class="track" role="img" aria-label="{l.label} {l.total}문제 중 {l.passed}문제 통과"><b style="width:{l.total ? (l.passed / l.total) * 100 : 0}%"></b></div>
				</div>
			{/each}
		</div>

		{#if data.suggestions.length}
			<div class="lang-sug">
				{#each data.suggestions as s (s.key)}
					<form method="POST" action="?/start" use:enhance>
						<input type="hidden" name="problemId" value={s.problemId} />
						<button class="sug" class:main={s.key === 'continue'}>
							<span class="label">{s.label}</span>
							<span class="sug-t">{s.title}</span>
						</button>
					</form>
				{/each}
			</div>
		{/if}

		<div class="lt">
			<div class="lt-row lt-top" aria-hidden="true">
				<span></span>{#each [1, 2, 3] as lv (lv)}<span class="label">{LEVELS[lv as 1 | 2 | 3]}</span>{/each}
			</div>
			{#each data.topics as t (t.topic)}
				<div class="lt-row">
					<h3 class="lt-topic">{t.label}</h3>
					{#each t.levels as items, i (i)}
						<div class="lt-cell" class:none={items.length === 0} data-level={LEVELS[(i + 1) as 1 | 2 | 3]}>
							{#each items as p (p.id)}
								<form method="POST" action="?/start" use:enhance>
									<input type="hidden" name="problemId" value={p.id} />
									<button class="li" aria-label="{p.title} 시작">
										<span class="li-t">{p.title}</span>
										<span class="li-m">
											<span class="mono st">{mmss(p.limitSec)}</span>
											{#if KIND[p.kind]}<span class="kind">{KIND[p.kind]}</span>{/if}
											<span class="st" class:passed={p.status === 'passed'}>{label[p.status]}{#if p.bestSec !== null}<span class="mono"> · {mmss(p.bestSec)}</span>{/if}</span>
											{#if p.status === 'passed' && p.clean}<span class="clean">clean</span>{/if}
										</span>
									</button>
								</form>
							{/each}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
