<script lang="ts">
	import DeskHorizon from '#lib/ambience/DeskHorizon.svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import Coach from '#lib/Coach.svelte';
	import LanguageSwitch from '#lib/LanguageSwitch.svelte';
	import { COACH_NAME } from '#lib/core/coach.ts';
	import { t } from '#lib/i18n.svelte.ts';
	import { mmss } from '#lib/rank.ts';
	import { actionErrors, modeNames, referenceUsage, statuses, topicNames } from '#lib/stats/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let now = $state(0);
	let expiredRun = 0;
	let ready = $state(false);
	let coachRun = $state<number | null>(null);
	let draft = $state<{ runId: number; values: Record<number, string> } | null>(null);
	let sheet: HTMLDialogElement;
	let lookup: HTMLButtonElement;
	const sections = [
		['formula', '공식', 'Formula'],
		['symbols', '기호', 'Notation'],
		['conditions', '적용 조건', 'When to use it'],
		['pitfall', '흔한 실수', 'Common mistake']
	] as const;

	function openSheet() {
		if (data.reference) sheet.showModal();
		else lookup.form?.requestSubmit(lookup);
	}

	const submit: SubmitFunction = ({ submitter }) => {
		const run = data.id;
		return async ({ result, update }) => {
			if (submitter === lookup && result.type === 'success') {
				// Refresh the recorded lookup without applying form values over an in-progress draft.
				await invalidateAll();
				await tick();
				if (run === data.id && data.reference && sheet?.isConnected) sheet.showModal();
			} else {
				await update({ reset: false });
			}
		};
	};
	const remaining = $derived(now ? Math.max(0, Math.ceil((data.deadline - now) / 1000)) : data.lesson.seconds);

	onMount(() => {
		ready = true;
		if (form?.showReference && data.reference) sheet.showModal();
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

	function updateDraft(index: number, value: string) {
		if (draft?.runId !== data.id) draft = { runId: data.id, values: {} };
		draft.values[index] = value;
	}
</script>

<svelte:head><title>{t(...data.lesson.title)} · Matrix</title></svelte:head>

{#if !data.outcome}<DeskHorizon />{/if}

<div class="body practice">
	<a class="back" href="/stats">← {t('확률과 통계', 'Probability & Statistics')}</a>

	<header>
		<div>
			<p class="label">{t(...topicNames[data.lesson.topic])} · {t(...modeNames[data.lesson.mode])}</p>
			<div class="title-row">
				<h1>{t(...data.lesson.title)}</h1>
				{#if ready}<button type="button" class="btn ghost small" aria-haspopup="dialog" onclick={openSheet}>{t('치트시트', 'Cheat sheet')}</button>{/if}
			</div>
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

	<form method="POST" action={action('check')} use:enhance={submit}>
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
							value={(draft?.runId === data.id ? draft.values[index] : undefined) ?? form?.values?.[index] ?? field.value}
							oninput={(event) => updateDraft(index, event.currentTarget.value)}
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
			</div>
		{:else}
			<div class="toolbar result">
				<strong class:passed={data.outcome === 'passed'}>{t(...statuses[data.outcome])}</strong>
				<button class="btn ghost" formaction={action('restart')}>{t('다시 풀기', 'Try Again')}</button>
				<a class="btn ghost" href="/stats">{t('다음 연습', 'Practice Next')}</a>
			</div>
		{/if}
		<button bind:this={lookup} hidden={ready} class="btn ghost lookup-fallback" formaction={action('reference')}>{t('치트시트', 'Cheat sheet')}</button>
	</form>

	{#snippet sheetBody()}
		{#if data.reference}
			<dl>
				{#each sections as [key, ko, en] (key)}
					<dt>{t(ko, en)}</dt>
					<dd class:formula={key === 'formula'}>{t(...data.reference[key])}</dd>
				{/each}
			</dl>
		{/if}
	{/snippet}

	<dialog bind:this={sheet} aria-labelledby="stats-sheet-title">
		<div class="sheet-tools">
			<LanguageSwitch />
			<form method="dialog"><button class="btn ghost small">{t('닫기', 'Close')}</button></form>
		</div>
		<h2 id="stats-sheet-title">{t('치트시트', 'Cheat sheet')}</h2>
		<p class="sheet-lesson">{t(...data.lesson.title)}</p>
		{@render sheetBody()}
	</dialog>

	{#if !ready && form?.showReference && data.reference}
		<details class="support" open>
			<summary>{t('치트시트', 'Cheat sheet')}</summary>
			{@render sheetBody()}
		</details>
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
			<p class="note">{t(...referenceUsage(data.review.usedReference))}</p>
		</section>
		{#key data.id}
			<details class="support stats-coach" ontoggle={(event) => { if (event.currentTarget.open) coachRun = data.id; }}>
				<summary>{t(`${COACH_NAME}에게 풀이 질문하기`, `Ask ${COACH_NAME} about this attempt`)}</summary>
				{#if coachRun === data.id}
					<div class="coach-panel">
						<Coach context={{ kind: 'stats', id: data.lesson.id, runId: data.id }} placeholder={t('이 연습에 대해 묻기', 'Ask about this practice run')} />
					</div>
				{/if}
			</details>
		{/key}
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
	.stats-coach > summary { cursor: pointer; font-weight: 700; }
	.coach-panel { height: min(32rem, 75dvh); margin-top: 10px; min-height: 20rem; }
	.title-row, .sheet-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
	.lookup-fallback[hidden] { display: none; }
	dialog { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(26rem, 100%); max-width: 100%; height: 100dvh; max-height: 100%; padding: clamp(18px, 3vw, 32px); border: 0; border-inline-start: 1px solid var(--line); background: var(--bg); color: var(--ink); overflow-y: auto; overscroll-behavior: contain; }
	dialog::backdrop { background: rgb(0 0 0 / .35); }
	.sheet-tools { justify-content: flex-end; }
	dialog h2 { font: 700 24px var(--f-display); margin: 22px 0 0; }
	.sheet-lesson { color: var(--muted); margin: 2px 0 18px; }
	dl { margin: 0; }
	dt { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--line); font-weight: 600; }
	dd { margin: 4px 0 0; overflow-wrap: anywhere; }
	.formula { font-family: var(--f-mono); }
	@media (max-width: 640px) {
		dialog { inset: auto 0 0; width: 100%; height: auto; max-height: 80dvh; border: 1px solid var(--line); border-radius: 16px 16px 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
	}
</style>
