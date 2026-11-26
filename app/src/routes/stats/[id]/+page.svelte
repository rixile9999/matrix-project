<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import { mmss } from '#lib/rank.ts';
	import { actionErrors, modeNames, statuses, topicNames } from '#lib/stats/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let now = $state(0);
	let expiredRun = 0;
	const remaining = $derived(now ? Math.max(0, Math.ceil((data.deadline - now) / 1000)) : data.lesson.seconds);

	onMount(() => {
		now = Date.now();
		const timer = setInterval(() => { now = Date.now(); }, 250);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (remaining === 0 && !data.outcome && expiredRun !== data.id) {
			expiredRun = data.id;
			void invalidateAll();
		}
	});

	function action(name: string) {
		return `?run=${data.id}&/${name}`;
	}
</script>

<svelte:head><title>{t(...data.lesson.title)} · Matrix</title></svelte:head>

<div class="body practice">
	<a class="back" href="/stats">← {t('확률과 통계', 'Probability & Statistics')}</a>

	<header>
		<div>
			<p class="label">{t(...topicNames[data.lesson.topic])} · {t(...modeNames[data.lesson.mode])}</p>
			<h1>{t(...data.lesson.title)}</h1>
		</div>
		<div class="clock">
			<span class="label">{data.outcome ? t('걸린 시간', 'Elapsed') : t('남은 시간', 'Time left')}</span>
			<strong class="mono">{mmss(data.elapsed ?? remaining)}</strong>
		</div>
	</header>

	<section class="prompt">
		<p>{t(...data.lesson.prompt)}</p>
		<small>{t(...data.lesson.targets)}</small>
	</section>

	{#if form?.error}<p class="err" role="alert">{t(...actionErrors[form.error])}</p>{/if}

	<form method="POST" action={action('check')} use:enhance={() => ({ update }) => update({ reset: false })}>
		{#if !data.outcome}
			<p class="label answer-format" id="stats-answer-format">{t('소수, 분수, 백분율, 과학적 표기 사용 가능', 'Decimals, fractions, percentages, and scientific notation are accepted.')}</p>
			<div class="answers">
				{#each data.fields as field, index (index)}
					<div class="field">
						<label for="stats-answer-{index}">{t(...field.label)}</label>
						<input
							id="stats-answer-{index}"
							name="answer{index}"
							type="text"
							autocomplete="off"
							maxlength="80"
							value={form?.values?.[index] ?? field.value}
							aria-describedby={field.correct !== null ? `stats-feedback-${index}` : 'stats-answer-format'}
						/>
						{#if field.correct !== null}
							<span id="stats-feedback-{index}" class:incorrect={!field.correct} class="feedback">
								{field.feedback ? t(...field.feedback) : t('정답', 'Correct')}
							</span>
						{/if}
					</div>
				{/each}
			</div>
			<div class="toolbar">
				<button class="btn">{t('확인', 'Check')}</button>
				{#if data.hints.length < 2}
					<button class="btn ghost" formaction={action('hint')}>{t(`힌트 ${data.hints.length + 1}`, `Hint ${data.hints.length + 1}`)}</button>
				{:else}
					<button class="btn ghost" formaction={action('reveal')}>{t('모범답안', 'Show Solution')}</button>
				{/if}
				{#if !data.reference}
					<button class="btn ghost" formaction={action('reference')}>{t('공식 참고', 'Reference')}</button>
				{/if}
			</div>
		{:else}
			<div class="toolbar result">
				<strong class:passed={data.outcome === 'passed'}>{t(...statuses[data.outcome])}</strong>
				<button class="btn ghost" formaction={action('restart')}>{t('다시 풀기', 'Try Again')}</button>
				<a class="btn ghost" href="/stats">{t('다음 연습', 'Practice Next')}</a>
			</div>
		{/if}
	</form>

	{#if data.reference}
		<section class="support">
			<h2>{t('공식 참고', 'Reference')}</h2>
			<p>{t(...data.reference)}</p>
		</section>
	{/if}

	{#if data.hints.length}
		<section class="support" aria-live="polite">
			<h2>{t('힌트', 'Hints')}</h2>
			<ol>{#each data.hints as hint, index (index)}<li>{t(...hint)}</li>{/each}</ol>
		</section>
	{/if}

	{#if data.review}
		<section class="support review">
			<h2>{t('모범답안', 'Worked Solution')}</h2>
			<p>{t(...data.review.solution)}</p>
			<p>{t(...data.review.intent)}</p>
		</section>
	{/if}
</div>

<style>
	.practice { padding-inline: clamp(16px, 4vw, 46px); gap: 20px; }
	.back { width: fit-content; color: var(--muted); text-underline-offset: 2px; font-size: 13px; }
	header { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
	header p { margin: 0 0 4px; }
	h1 { margin: 0; font: 700 clamp(24px, 5vw, 38px)/1.08 var(--f-display); letter-spacing: -.025em; }
	.clock { display: grid; gap: 4px; flex-shrink: 0; text-align: end; }
	.clock strong { font-size: clamp(16px, 3vw, 24px); line-height: 1; }
	.prompt { border-block: 1px solid var(--line); padding-block: 16px; }
	.prompt p, .support p { margin: 0; }
	.prompt p { font-size: 17px; }
	.prompt small { display: block; margin-top: 10px; color: var(--muted); }
	.answer-format { margin: 0 0 9px; }
	.answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px; }
	.field input { width: 100%; }
	.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
	.toolbar.result { margin-top: 0; }
	.result strong { margin-inline-end: 5px; }
	.passed, .feedback { color: var(--ok); }
	.feedback { font-size: 12px; }
	.incorrect { color: var(--bad); }
	.support { padding: 13px 15px; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); }
	.support h2 { margin: 0 0 6px; font: 700 15px var(--f-display); }
	.support ol { margin: 0; padding-inline-start: 22px; }
	.support li + li, .support p + p { margin-top: 7px; }
	.review { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
</style>
