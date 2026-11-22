<script lang="ts">
	import { enhance } from '$app/forms';
	import { mmss } from '#lib/rank.ts';
	import { LEVELS } from '#lib/core/lang.ts';
	import type { LangBookData } from '#lib/types.ts';

	let { data, form }: { data: LangBookData; form: { error?: string } | null } = $props();

	const label = { new: '새 문제', attempted: '푸는 중', passed: '통과' } as const;
	const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
</script>

<svelte:head><title>{data.title} · Matrix</title></svelte:head>

<div class="body">
	<div>
		<a class="note" href="/lang">← 언어</a>
		<h2 class="lang-h" style="margin-top:6px">{data.title}</h2>
	</div>
	{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}

	<div class="lang-progress">
		<span class="label">전체 진행</span>
		<span><b>{data.passed}</b> <span class="mono" style="color:var(--muted)">/ {data.total}</span></span>
		<div class="track" role="img" aria-label="{data.total}문제 중 {data.passed}문제 통과"><b style="width:{pct(data.passed, data.total)}%"></b></div>
	</div>

	{#if data.resume}
		<form method="POST" action="?/start" use:enhance>
			<input type="hidden" name="problemId" value={data.resume.problemId} />
			<button class="sug main bk-resume">
				<span class="label">이어서 풀기</span>
				<span class="sug-t">{data.resume.exercise} {data.resume.title}</span>
			</button>
		</form>
	{:else if data.total > 0}
		<p class="note">준비된 문제를 모두 풀었습니다.</p>
	{/if}

	{#each data.chapters as c (c.chapter)}
		<section class="bk-ch">
			<div class="bk-ch-head">
				<h3>{c.chapter}장{c.title ? ` ${c.title}` : ''}</h3>
				{#if c.total}<span class="mono st">{c.passed}/{c.total}</span>{/if}
			</div>
			{#if c.total === 0}
				<p class="note" style="margin:0">준비 중</p>
			{:else}
				<div class="rows">
					{#each c.problems as p (p.id)}
						<form method="POST" action="?/start" use:enhance>
							<input type="hidden" name="problemId" value={p.id} />
							<button class="bk-row" aria-label="{p.book?.exercise} {p.title} 시작">
								<span class="mono bk-ex">{p.book?.exercise}</span>
								<span class="bk-t">{p.title}</span>
								<span class="st bk-st" class:passed={p.status === 'passed'}>{label[p.status]}{#if p.bestSec !== null}<span class="mono"> · {mmss(p.bestSec)}</span>{/if}</span>
								<span class="bk-m st">
									{LEVELS[p.level]} · <span class="mono">{mmss(p.limitSec)}</span>
									{#if p.status === 'passed' && p.clean}<span class="clean">clean</span>{/if}
								</span>
							</button>
						</form>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
