<script lang="ts">
	// Calm judge feedback: which case failed and why, compiler output. No traffic-light colours: the warm accent marks what failed.
	import { renderInline } from '#lib/inline.ts';
	import { groupStages, type StageGroup } from '#lib/core/study.ts';
	import type { JudgeResult } from '#lib/core/lang.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { result }: { result: JudgeResult } = $props();
	const stages: StageGroup[] = $derived(groupStages(result.cases));
	const total = $derived(result.cases.length);
	const okCount = $derived(result.cases.filter((c) => c.status === 'ok').length);
	const head = $derived(
		result.status === 'passed' ? t('통과했습니다.', 'Passed.') :
		result.status === 'compile_error' ? t('컴파일되지 않았습니다.', 'Did not compile.') :
		result.status === 'timeout' ? t('실행이 너무 오래 걸려 멈췄습니다.', 'Stopped because execution took too long.') :
		total ? `${okCount}/${total} ${t('통과', 'passed')}.` : t('통과하지 못했습니다.', 'Did not pass.')
	);
	const reason = $derived(result.status === 'failed' && total > 0 && result.cases.every((c) => c.status === 'ok') && result.output ? result.output : '');
	const MARK = { ok: '·', fail: '×', error: '!' } as const;
</script>

<div class="a-col" style="gap:6px" aria-live="polite">
	<p class="a-p" class:a-warm={result.status !== 'passed'}>{head}</p>
	{#if result.avoided.length}
		<p class="a-small">{@html renderInline(result.avoided.map((w) => `\`${w}\``).join(', '))} {t('없이 다시 써야 합니다.', 'must be rewritten without these.')}</p>
	{/if}
	{#if result.status !== 'compile_error'}
		{#each stages as g, gi (gi)}
			{#if g.stage !== null}<p class="a-small" style="margin-top:6px">{g.stage} {g.ok}/{g.cases.length}</p>{/if}
			<div>
				{#each g.cases as c, i (i)}
					<div class="a-case" class:bad={c.status !== 'ok'}>
						<span class="m" aria-label={c.status === 'ok' ? t('통과', 'Passed') : c.status === 'fail' ? t('실패', 'Failed') : t('오류', 'Error')}>{MARK[c.status]}</span>
						<div><span class="t">{c.name}</span>{#if c.detail}<div class="d">{c.detail}</div>{/if}</div>
					</div>
				{/each}
			</div>
		{/each}
	{/if}
	{#if reason}
		<p class="a-small" style="margin-top:6px">{t('실패 이유', 'Why it failed')}</p>
		<p class="a-p">{@html renderInline(reason)}</p>
	{:else if result.output}
		<p class="a-small" style="margin-top:6px">{result.status === 'compile_error' ? t('컴파일러 출력', 'Compiler output') : t('프로그램 출력', 'Program output')}</p>
		<pre class="a-out">{result.output}</pre>
	{/if}
</div>
