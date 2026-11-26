<script lang="ts">
	import type { TraceBlock } from '#lib/core/coach.ts';
	import type { CoachVerifyResponse } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { block, messageId = null, blockIndex }: { block: TraceBlock; messageId?: number | null; blockIndex: number } = $props();

	let i = $state(0);
	const n = $derived(block.steps.length);
	const step = $derived(block.steps[Math.min(i, n - 1)]);

	let status = $state<'idle' | 'checking' | 'done' | 'failed'>('idle');
	let result = $state<CoachVerifyResponse | null>(null);
	let verified = '';
	$effect(() => {
		const id = messageId;
		const key = `${id}:${blockIndex}`;
		if (id === null || verified === key) return;
		verified = key;
		status = 'checking';
		result = null;
		fetch('/coach/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ messageId: id, block: blockIndex })
		})
			.then((r) => (r.ok ? (r.json() as Promise<CoachVerifyResponse>) : Promise.reject(new Error(String(r.status)))))
			.then((j) => {
				if (verified !== key) return;
				result = j;
				status = j.error ? 'failed' : 'done';
			})
			.catch(() => {
				if (verified === key) status = 'failed';
			});
	});

	const actual = $derived(status === 'done' ? (result?.steps[i] ?? null) : null);
	const wrong = $derived(actual !== null && !actual.ok);
	const badSteps = $derived(status === 'done' ? (result?.steps ?? []).flatMap((s, k) => (s.ok ? [] : [k + 1])) : []);
</script>

<div class="co-viz">
	<div class="co-viz-head">
		<span>{block.title}</span>
		{#if status === 'checking'}<span class="co-quiet">{t('실행해서 확인하는 중…', 'Checking by running…')}</span>
		{:else if status === 'done' && result?.ok}<span class="co-badge">{t('실행 확인됨', 'Verified by running')}</span>
		{:else if status === 'failed'}<span class="co-quiet">{t('실행으로 확인하지 못했습니다', 'Could not verify by running')}</span>{/if}
	</div>
	{#if block.cells?.length}
		<div class="co-cells">
			{#each block.cells as c, k (k)}
				<div class="co-cell" class:now={k === step.at} class:seen={step.at !== undefined && k < step.at}>{c}</div>
			{/each}
		</div>
	{/if}
	<div class="co-step-note">{step.note}</div>
	<div class="co-step-line">
		<code>{step.expr}</code>
		<span aria-hidden="true">→</span>
		{#if wrong}
			<code class="co-claimed">{step.value}</code>
			<code class="co-actual">{t('실제 값', 'Actual value')}: {actual?.actual ?? t('평가하지 못함', 'Not evaluated')}</code>
		{:else}
			<code class="co-value">{step.value}</code>
		{/if}
	</div>
	{#if status === 'done' && !result?.ok && badSteps.length}
		<p class="co-warn">{t('값이 다른 단계가 있습니다', 'Some steps have different values')} ({badSteps.join(', ')}).</p>
	{/if}
	<div class="co-slide">
		<button class="co-step-btn" type="button" aria-label={t('이전 단계', 'Previous step')} disabled={i <= 0} onclick={() => i--}>‹</button>
		<input type="range" min="0" max={n - 1} step="1" bind:value={i} aria-label={t('단계', 'Step')} />
		<button class="co-step-btn" type="button" aria-label={t('다음 단계', 'Next step')} disabled={i >= n - 1} onclick={() => i++}>›</button>
		<span class="co-count">{i + 1} / {n}</span>
	</div>
</div>
