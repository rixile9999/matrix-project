<script lang="ts">
	// Calm judge feedback: which case failed and why, compiler output. No traffic-light colours: the warm accent marks what failed.
	import { renderInline } from '#lib/inline.ts';
	import { groupStages, type StageGroup } from '#lib/core/study.ts';
	import type { JudgeResult } from '#lib/core/lang.ts';

	let { result }: { result: JudgeResult } = $props();
	const stages: StageGroup[] = $derived(groupStages(result.cases));
	const total = $derived(result.cases.length);
	const okCount = $derived(result.cases.filter((c) => c.status === 'ok').length);
	const head = $derived(
		result.status === 'passed' ? '통과했습니다.' :
		result.status === 'compile_error' ? '컴파일되지 않았습니다.' :
		result.status === 'timeout' ? '실행이 너무 오래 걸려 멈췄습니다.' :
		total ? `${total}개 중 ${okCount}개 통과했습니다.` : '통과하지 못했습니다.'
	);
	const reason = $derived(result.status === 'failed' && total > 0 && result.cases.every((c) => c.status === 'ok') && result.output ? result.output : '');
	const MARK = { ok: '·', fail: '×', error: '!' } as const;
</script>

<div class="a-col" style="gap:6px" aria-live="polite">
	<p class="a-p" class:a-warm={result.status !== 'passed'}>{head}</p>
	{#if result.avoided.length}
		<p class="a-small">{@html renderInline(result.avoided.map((w) => `\`${w}\``).join(', '))} 없이 다시 써야 합니다.</p>
	{/if}
	{#if result.status !== 'compile_error'}
		{#each stages as g, gi (gi)}
			{#if g.stage !== null}<p class="a-small" style="margin-top:6px">{g.stage} {g.ok}/{g.cases.length}</p>{/if}
			<div>
				{#each g.cases as c, i (i)}
					<div class="a-case" class:bad={c.status !== 'ok'}>
						<span class="m" aria-label={c.status === 'ok' ? '통과' : c.status === 'fail' ? '실패' : '오류'}>{MARK[c.status]}</span>
						<div><span class="t">{c.name}</span>{#if c.detail}<div class="d">{c.detail}</div>{/if}</div>
					</div>
				{/each}
			</div>
		{/each}
	{/if}
	{#if reason}
		<p class="a-small" style="margin-top:6px">실패 이유</p>
		<p class="a-p">{@html renderInline(reason)}</p>
	{:else if result.output}
		<p class="a-small" style="margin-top:6px">{result.status === 'compile_error' ? '컴파일러 출력' : '프로그램 출력'}</p>
		<pre class="a-out">{result.output}</pre>
	{/if}
</div>
