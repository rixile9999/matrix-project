<script lang="ts">
	import { enhance } from '$app/forms';
	import MemoClock from '#lib/MemoClock.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const question = $derived(data.question);
	const count = $derived(data.progress.length);
	const next = $derived(question && question.index < count - 1 ? question.index + 1 : -1);
	const questionName = (index: number) => t(`문항 ${index + 1}`, `Question ${index + 1}`);
	const questionUrl = (index: number) => `/library/${data.id}?question=${index + 1}`;
</script>

<svelte:head><title>{data.title} · Matrix</title></svelte:head>

<div class="body practice" data-sveltekit-preload-data="off">
	<a class="back" href="/library">← {t('PDF 문제집', 'PDF sets')}</a>

	<header>
		<h1>{data.title}</h1>
		{#if data.sourceName}<p class="source">{data.sourceName}</p>{/if}
		{#if !data.isShared}
			<form class="publish" method="POST" action={question ? `${questionUrl(question.index)}&/publish` : '?/publish'} use:enhance>
				<p class="source" id="publish-help">
					<strong>{t('비공개', 'Private')}</strong> · {t('공개하면 로그인한 모든 회원이 문제집을 풀 수 있습니다. 풀이 기록은 비공개입니다.', 'Sharing lets all signed-in members practice this set. Your progress stays private.')}
				</p>
				<button class="btn ghost" type="submit" aria-describedby="publish-help">{t('회원에게 공개', 'Share with members')}</button>
			</form>
		{/if}
	</header>

	<div class="tracker">
		<progress value={data.answered} max={count || 1} aria-label={t('문제집 진행률', 'Set progress')}></progress>
		<span>{t(`${count}문항 중 ${data.answered}문항 완료`, `${data.answered} of ${count} answered`)}</span>
	</div>

	{#if count > 0}
		<nav class="questions" aria-label={t('문항 탐색', 'Question navigation')}>
			{#each data.progress as answered, index (index)}
				<a href={questionUrl(index)}
					aria-current={question?.index === index ? 'step' : undefined}
					aria-label={answered ? t(`문항 ${index + 1}, 응답 완료`, `Question ${index + 1}, answered`) : questionName(index)}
					class:answered
				>{index + 1}</a>
			{/each}
		</nav>
	{/if}

	{#if question}
		{#key `${data.id}:${question.index}`}
			<div class="card">
				<div class="question-meta">
					<span>{questionName(question.index)} · {t(`PDF ${question.page}쪽`, `PDF page ${question.page}`)}</span>
					{#if !question.feedback}
						<MemoClock startedAt={question.startedAt} limitSec={question.limitSec} />
					{/if}
				</div>

				{#if question.feedback}
					{@const feedback = question.feedback}
					<h2>{question.prompt}</h2>
					<div class="feedback" role="status">
						<strong class:right={feedback.selected === feedback.correct} class:wrong={feedback.selected !== feedback.correct}>
							{feedback.selected === feedback.correct ? t('정답입니다.', 'Correct.') : t('틀렸습니다.', 'Incorrect.')}
						</strong>
						{#if feedback.late}<p>{t('제한 시간 이후에 답했습니다.', 'Answered after the time limit.')}</p>{/if}
						<dl>
							<dt>{t('내 답', 'Your answer')}</dt>
							<dd>{question.choices[feedback.selected]}</dd>
							{#if feedback.selected !== feedback.correct}
								<dt>{t('정답', 'Correct answer')}</dt>
								<dd>{question.choices[feedback.correct]}</dd>
							{/if}
						</dl>
						<p>{feedback.explanation}</p>
					</div>
					{#if data.resume < 0}
						<a class="btn" href="/library/{data.id}">{t('결과 보기', 'View results')}</a>
					{:else if next >= 0 && !data.progress[next]}
						<a class="btn" href={questionUrl(next)}>{t('다음 문항', 'Next question')}</a>
					{:else}
						<a class="btn" href={questionUrl(data.resume)}>{t('계속 풀기', 'Continue practice')}</a>
					{/if}
				{:else}
					<form method="POST" action="?question={question.index + 1}&/answer" use:enhance>
						<fieldset>
							<legend>{question.prompt}</legend>
							{#each question.choices as choice, index (index)}
								<label class="option">
									<input type="radio" name="answer" value={index} required />
									<span>{choice}</span>
								</label>
							{/each}
						</fieldset>
						{#if form?.error}
							<p class="wrong" role="alert">{form.error === 'invalid' ? t('답을 선택해 주세요.', 'Choose an answer.') : t('문항을 다시 열고 답해 주세요.', 'Reopen the question and try again.')}</p>
						{/if}
						<button class="btn">{t('정답 확인', 'Check answer')}</button>
					</form>
				{/if}
			</div>
		{/key}
	{:else if count > 0}
		<div class="card">
			<h2>{t('문제집 완료', 'Practice complete')}</h2>
			<p>{t(`${count}문항 중 ${data.correct}문항을 맞혔습니다.`, `${data.correct} of ${count} correct.`)}</p>
			<a class="btn" href={questionUrl(0)}>{t('답안 검토', 'Review answers')}</a>
		</div>
	{:else}
		<p>{t('문제집에 문항이 없습니다.', 'This set has no questions.')}</p>
	{/if}
</div>

<style>
	.practice { width: 100%; max-width: 720px; margin-inline: auto; gap: 16px; }
	.back { align-self: start; color: var(--muted); font-size: 13px; }
	h1, h2, p { margin: 0; }
	h1 { font: 700 clamp(26px, 5vw, 38px)/1.15 var(--f-display); overflow-wrap: anywhere; }
	.source, .question-meta, .tracker { color: var(--muted); font-size: 13px; }
	.source { margin-top: 6px; overflow-wrap: anywhere; }
	.tracker { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
	progress { min-width: 100px; flex: 1; height: 7px; accent-color: var(--accent); }
	.questions { display: flex; flex-wrap: wrap; gap: 8px; }
	.questions a {
		display: grid; place-items: center; min-width: 36px; min-height: 36px; padding: 4px;
		border-radius: 8px; border: 1px solid var(--line); color: var(--muted); text-decoration: none;
	}
	.questions a.answered { color: var(--ink); background: var(--surface); }
	.questions a[aria-current] { color: var(--accent); border-color: var(--accent); }
	.card { padding: clamp(16px, 4vw, 28px); border: 1px solid var(--line); background: var(--surface); border-radius: var(--r); }
	.card > p { margin-block: 12px 18px; }
	.question-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
	form { display: grid; justify-items: start; gap: 16px; }
	.publish { gap: 8px; margin-top: 10px; }
	fieldset { width: 100%; min-width: 0; border: 0; padding: 0; margin: 0; }
	legend, h2 { font: 600 19px/1.4 var(--f-body); white-space: pre-wrap; overflow-wrap: anywhere; }
	legend { padding: 0 0 14px; }
	.option {
		display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px;
		padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 8px;
		white-space: pre-wrap; overflow-wrap: anywhere; cursor: pointer;
	}
	.option:has(input:checked) { border-color: var(--accent); }
	.option:last-child { margin-bottom: 0; }
	.option input { margin: .3em 0 0; accent-color: var(--accent); }
	.feedback { margin-block: 16px 20px; display: grid; gap: 8px; }
	.feedback p, dd { white-space: pre-wrap; overflow-wrap: anywhere; }
	.right { color: var(--ok); }
	.wrong { color: var(--bad); }
	dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; }
	dt { color: var(--muted); }
	dd { margin: 0; }
</style>
