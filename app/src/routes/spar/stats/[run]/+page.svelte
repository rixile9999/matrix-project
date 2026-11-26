<script lang="ts">
	import Calculator from '#lib/stats/Calculator.svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { AmbienceControls } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';
	import DeskHorizon from '#lib/ambience/DeskHorizon.svelte';
	import { fmtMs } from '#lib/core/spar.ts';
	import { t } from '#lib/i18n.svelte.ts';
	import TimeGlyph from '#lib/TimeGlyph.svelte';
	import { actionErrors, modeNames, referenceUsage, statuses, topicNames } from '#lib/stats/labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	let confirmQuit = $state(false);
	let tick = $state(0);
	let receivedAt = $state(0);
	let expiredId = 0;
	let retry = $state(false);
	const question = $derived(data.phase === 'question' ? data : null);
	const initialValues = (current: NonNullable<typeof question>) => current.fields.map((field, index) =>
		form?.runId === current.runId ? (form.values[index] ?? field.value) : field.value);
	let draftRunId = untrack(() => question?.runId);
	let draft = $state(untrack(() => question ? initialValues(question) : []));
	const remaining = $derived(question ? Math.max(0, question.remainingMs - Math.max(0, tick - receivedAt)) : 0);
	const progress = $derived(data.phase === 'result' ? 1 : (data.position + (question ? 1 - remaining / (question.lesson.seconds * 1000) : 1)) / data.total);
	const message = $derived(form?.code === 'moved'
		? t('이미 다른 단계로 이동했습니다.', 'The round has already moved on.')
		: form?.code ? t(...actionErrors[form.code]) : '');
	const sections = [
		['formula', '공식', 'Formula'],
		['symbols', '기호', 'Notation'],
		['conditions', '적용 조건', 'When to use it'],
		['pitfall', '흔한 실수', 'Common mistake']
	] as const;

	onMount(() => {
		const timer = setInterval(() => { tick = performance.now(); }, 200);
		return () => clearInterval(timer);
	});
	$effect(() => {
		if (question) receivedAt = performance.now();
	});
	$effect(() => {
		if (question && question.runId !== draftRunId) {
			draftRunId = question.runId;
			draft = initialValues(question);
		}
	});
	$effect(() => {
		stage.scene = data.phase === 'result' ? 'result' : 'run';
		stage.progress = progress;
	});
	$effect(() => {
		if (question && remaining === 0 && !busy && expiredId !== question.runId) {
			expiredId = question.runId;
			void refresh();
		}
	});

	async function refresh() {
		retry = false;
		try { await invalidateAll(); } catch { retry = true; }
	}

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ update, result }) => {
			try {
				await update({ reset: false });
				if (result.type === 'failure' && result.status === 409) await refresh();
			} finally {
				busy = false;
				confirmQuit = false;
			}
		};
	};
</script>

<svelte:head><title>{t('확률·통계', 'Statistics')} · Sparring · Matrix</title></svelte:head>

{#if data.phase !== 'result'}<DeskHorizon />{/if}

<main class="a-page narrow">
	<div class="a-top">
		<a href="/spar">‹ Sparring</a>
		{#if question}
			<TimeGlyph remainingSec={Math.ceil(remaining / 1000)} limitSec={question.lesson.seconds} size={24} />
		{/if}
	</div>
	{#if data.phase !== 'result'}
		<div class="a-thin" aria-hidden="true"><b style:width={`${progress * 100}%`}></b></div>
		<p class="a-small a-num">{t('문제', 'Question')} {data.position + 1} / {data.total}</p>
		{#if message}<p class="a-err" role="alert">{message}</p>{/if}
		{#if retry}<button class="a-btn ghost small" type="button" onclick={refresh}>{t('다시 불러오기', 'Refresh')}</button>{/if}
	{/if}

	{#if question}
		{#key question.runId}
			<div class="a-col">
				<header>
					<p class="a-small">{t(...topicNames[question.lesson.topic])} · {t(...modeNames[question.lesson.mode])}</p>
					<h1 class="a-h">{t(...question.lesson.title)}</h1>
					<Calculator fields={question.fields} insertAnswer={(index, value) => { draft[index] = value; }} />
				</header>
				<p class="a-p prompt">{t(...question.lesson.prompt)}</p>

				<form method="POST" action="?/check" class="a-col" use:enhance={submit}>
					<input type="hidden" name="runId" value={question.runId} />
					<p id="stats-round-answer-format" class="a-small">{t('소수, 분수, 백분율, 과학적 표기 사용 가능', 'Decimals, fractions, percentages, and scientific notation accepted.')}</p>
					{#each question.fields as field, index (index)}
						<div class="answer">
							<label for="stats-round-answer-{index}">{t(...field.label)}</label>
							<input id="stats-round-answer-{index}" type="text" name="answer" maxlength="80" autocomplete="off"
								bind:value={draft[index]}
								aria-describedby={field.correct !== null ? `stats-round-feedback-${index}` : 'stats-round-answer-format'} />
							{#if field.correct !== null}
								<p id="stats-round-feedback-{index}" class="a-small" class:a-warm={field.correct}>{field.feedback ? t(...field.feedback) : t('정답', 'Correct')}</p>
							{/if}
						</div>
					{/each}
					<div class="a-row">
						<button class="a-btn" disabled={busy || remaining === 0}>{t('확인', 'Check')}</button>
						{#if question.hints.length < 2}
							<button class="a-btn ghost" formaction="?/hint" disabled={busy || remaining === 0}>{t(`힌트 ${question.hints.length + 1}`, `Hint ${question.hints.length + 1}`)}</button>
						{/if}
						{#if !question.reference}
							<button class="a-btn ghost" formaction="?/reference" disabled={busy || remaining === 0}>{t('치트시트', 'Cheat sheet')}</button>
						{/if}
					</div>
				</form>

				{#if question.hints.length}
					<section class="a-glass" aria-live="polite">
						<h2 class="a-h2">{t('힌트', 'Hints')}</h2>
						<ol>{#each question.hints as hint, index (index)}<li>{t(...hint)}</li>{/each}</ol>
					</section>
				{/if}
				{#if question.reference}
					<details class="a-fold" open>
						<summary>{t('치트시트', 'Cheat sheet')}</summary>
						<dl>
							{#each sections as [key, ko, en] (key)}
								<dt>{t(ko, en)}</dt>
								<dd class:a-num={key === 'formula'}>{t(...question.reference[key])}</dd>
							{/each}
						</dl>
					</details>
				{/if}
			</div>
		{/key}
	{:else if data.phase === 'next'}
		<h1 class="a-h">{t(...data.lesson.title)}</h1>
		<p class="a-p" role="status">{t(...statuses[data.outcome])}</p>
		<form method="POST" action="?/next" use:enhance={submit}>
			<input type="hidden" name="runId" value={data.runId} />
			<button class="a-btn" disabled={busy}>{t('다음 문제', 'Next question')}</button>
		</form>
	{:else if data.phase === 'result'}
		<header>
			<h1 class="a-h">{t('확률·통계', 'Statistics')}</h1>
			{#if data.abandoned}<p class="a-small">{t('중단', 'Abandoned')}</p>{/if}
		</header>
		<div class="a-row overview">
			<strong class="a-big sm">{data.solved} / {data.total}</strong>
			<span class="a-small">{t('정답', 'Solved')} · <span class="a-num">{fmtMs(data.elapsedMs)}</span></span>
		</div>
		<div>
			{#each data.items as item (item.runId)}
				<details class="a-fold">
					<summary class="result-item">
						<span>{t(...item.lesson.title)}</span>
						<span class="a-small">{item.outcome ? t(...statuses[item.outcome]) : t('중단', 'Abandoned')} · <span class="a-num">{fmtMs(item.elapsedMs)}</span></span>
					</summary>
					<div class="a-col review">
						<p class="a-p">{t(...item.lesson.prompt)}</p>
						{#each item.fields as field, index (index)}
							{#if field.value}
								<p class="a-small">{t(...field.label)} <strong class="a-num">{field.value}</strong> · {field.feedback ? t(...field.feedback) : t('정답', 'Correct')}</p>
							{/if}
						{/each}
						{#if item.review}
							<p class="a-p">{t(...item.review.solution)}</p>
							<p class="a-small">{t(...item.review.intent)}</p>
							<a href="/stats/{item.lesson.id}?run={item.runId}">{t('풀이 복기', 'Review attempt')}</a>
						{/if}
						<p class="a-small">{t(...referenceUsage(item.usedReference))} · {t('힌트', 'Hints')} {item.hints}</p>
					</div>
				</details>
			{/each}
		</div>
		<div class="a-row">
			<form method="POST" action="/spar?/startStats"><button class="a-btn">{t('다시 하기', 'Try again')}</button></form>
			<a class="a-btn ghost" href="/spar/records">{t('기록', 'Records')}</a>
		</div>
	{/if}

	<div class="a-corner">
		{#if data.phase !== 'result'}
			{#if confirmQuit}
				<form method="POST" action="?/abandon" class="a-row" use:enhance={submit}>
					<input type="hidden" name="runId" value={data.runId} />
					<button class="a-btn ghost small" disabled={busy}>{t('중단', 'Abandon')}</button>
					<button type="button" class="a-btn quiet" onclick={() => { confirmQuit = false; }}>{t('계속하기', 'Continue')}</button>
				</form>
			{:else}
				<button type="button" class="a-btn quiet" onclick={() => { confirmQuit = true; }}>{t('그만두기', 'Quit')}</button>
			{/if}
		{/if}
		<AmbienceControls />
	</div>
</main>

<style>
	a { color: inherit; }
	header > p { margin-bottom: 6px; }
	.prompt { padding-block: 14px; border-block: 1px solid var(--a-faint); font-size: 16px; }
	.answer { display: grid; gap: 5px; }
	.answer label { color: var(--a-ink); font-size: 14px; }
	.answer input { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; min-height: 42px; padding: 8px 10px; font: 15px var(--a-mono); width: min(100%, 18rem); }
	dl, ol { margin: 0 0 12px; }
	dt { color: var(--a-ink); margin-block: 10px 2px; font-weight: 600; }
	dd { margin: 0; overflow-wrap: anywhere; }
	.overview, .a-corner form { align-items: center; }
	.result-item { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
	.review { padding-bottom: 15px; }
	.review a { width: fit-content; font-size: 13px; }
</style>
