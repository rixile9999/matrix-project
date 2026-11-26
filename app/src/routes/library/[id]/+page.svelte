<script lang="ts">
	import { enhance } from '$app/forms';
	import MemoClock from '#lib/MemoClock.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PdfQuestion } from '#lib/pdf-sets.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const question = $derived(data.question);
	const count = $derived(data.progress.length);
	const concept = $derived(data.concepts.find((entry) => entry.id === question?.conceptId));
	const conceptsById = $derived(new Map(data.concepts.map((entry) => [entry.id, entry])));
	const practiceNavigation = $derived(concept?.exercises ?? data.progress.map((answered, index) => ({ answered, index })));
	const next = $derived(question && question.index < count - 1 ? question.index + 1 : -1);
	const nextInConcept = $derived(concept?.exercises.find((exercise) => !exercise.answered));
	const questionName = (index: number) => t(`문항 ${index + 1}`, `Question ${index + 1}`);
	const baseUrl = $derived(`/library/${data.id}`);
	const questionUrl = (index: number) => `${baseUrl}?question=${index + 1}`;
	const conceptUrl = (id: string) => `${baseUrl}#concept-${encodeURIComponent(id)}`;
	function exerciseName(kind: PdfQuestion['kind'], index: number) {
		switch (kind) {
			case 'recall': return t('인출', 'Recall');
			case 'apply': return t('응용', 'Apply');
			case 'integrate': return t('종합', 'Integrate');
			default: return questionName(index);
		}
	}
</script>

<svelte:head><title>{data.title} · Matrix</title></svelte:head>

<div class="body practice" data-sveltekit-preload-data="off">
	<a class="back" href="/library">← {t('PDF 문제집', 'PDF sets')}</a>

	<header>
		<h1>{data.title}</h1>
		{#if data.sourceName}<p class="source">{data.sourceName}</p>{/if}
		{#if !question && data.source && data.source.textPages < data.source.pages}
			<p class="source">{t(`전체 ${data.source.pages}쪽 중 텍스트가 있는 ${data.source.textPages}쪽을 읽었습니다.`, `Text was available on ${data.source.textPages} of ${data.source.pages} pages.`)}</p>
		{/if}
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

	{#if count > 0 && (question || data.concepts.length === 0)}
		<nav class="questions" aria-label={t('문항 탐색', 'Question navigation')}>
			{#each practiceNavigation as { answered, index } (index)}
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
				{#if concept}
					<a class="concept-back" href={conceptUrl(concept.id)}>← {concept.title}</a>
				{/if}
				<div class="question-meta">
					<span>
						{questionName(question.index)}
						{#if question.kind} · {exerciseName(question.kind, question.index)}{/if}
						· {t(`PDF ${question.page}쪽`, `PDF page ${question.page}`)}
					</span>
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
						{#if feedback.intent}<p class="source">{feedback.intent}</p>{/if}
					</div>
					<div class="practice-actions">
						{#if data.resume < 0}
							<a class="btn" href={baseUrl}>{t('결과 보기', 'View results')}</a>
						{:else if nextInConcept}
							<a class="btn" href={questionUrl(nextInConcept.index)}>{t('다음 연습', 'Next exercise')} · {exerciseName(nextInConcept.kind, nextInConcept.index)}</a>
						{:else if concept}
							<a class="btn" href={baseUrl}>{t('개념 지도', 'Concept map')}</a>
						{:else if next >= 0 && !data.progress[next]}
							<a class="btn" href={questionUrl(next)}>{t('다음 문항', 'Next question')}</a>
						{:else}
							<a class="btn" href={questionUrl(data.resume)}>{t('계속 풀기', 'Continue practice')}</a>
						{/if}
					</div>
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
	{:else}
		{#if count > 0 && data.resume < 0}
			<div class="card">
				<h2>{t('문제집 완료', 'Practice complete')}</h2>
				<p>{t(`${count}문항 중 ${data.correct}문항을 맞혔습니다.`, `${data.correct} of ${count} correct.`)}</p>
				<a class="btn" href={questionUrl(0)}>{t('답안 검토', 'Review answers')}</a>
			</div>
		{/if}

		{#if data.concepts.length > 0}
			<section aria-labelledby="concepts-title">
				<div class="concept-heading">
					<h2 id="concepts-title">{t('개념 지도', 'Concept map')}</h2>
					{#if data.resume >= 0}
						<a class="btn ghost" href={questionUrl(data.resume)}>
							{data.answered ? t('계속 풀기', 'Continue practice') : t('연습 시작', 'Start practice')}
						</a>
					{/if}
				</div>
				{#if data.concepts.length > 1}
					<details class="index">
						<summary>{t('개념 목차', 'Concept index')}</summary>
						<nav aria-label={t('개념 탐색', 'Concept navigation')}>
							<ul>
								{#each data.concepts as entry (entry.id)}
									<li><a href={conceptUrl(entry.id)}>{entry.title}</a></li>
								{/each}
							</ul>
						</nav>
					</details>
				{/if}
				<ol class="concepts">
					{#each data.concepts as entry (entry.id)}
						{@const completed = entry.exercises.filter((exercise) => exercise.answered).length}
						<li class="card concept" id="concept-{entry.id}">
							<div class="concept-head">
								<h3>{entry.title}</h3>
								<span class="concept-page">{t(`PDF ${entry.page}쪽`, `PDF page ${entry.page}`)}</span>
							</div>
							<p class="objective">{entry.objective}</p>
							{#if entry.prerequisites.length}
								<div class="prerequisites">
									<span>{t('선행 개념', 'Prerequisites')}</span>
									<ul>
										{#each entry.prerequisites as id (id)}
											{@const prerequisite = conceptsById.get(id)}
											{#if prerequisite}
												<li><a href={conceptUrl(id)}>{prerequisite.title}</a></li>
											{/if}
										{/each}
									</ul>
								</div>
							{/if}
							<div class="concept-practice">
								<p class="concept-progress">{t(`${entry.exercises.length}개 중 ${completed}개 완료`, `${completed} of ${entry.exercises.length} answered`)}</p>
								{#if entry.exercises.length}
									<ul class="exercises" aria-label={t(`${entry.title} 연습`, `${entry.title} exercises`)}>
										{#each entry.exercises as exercise (exercise.index)}
											{@const label = exerciseName(exercise.kind, exercise.index)}
											{@const accessibleLabel = exercise.kind ? `${label}, ${questionName(exercise.index)}` : label}
											<li>
												<a href={questionUrl(exercise.index)} class:answered={exercise.answered}
													aria-label={exercise.answered ? t(`${accessibleLabel}, 응답 완료`, `${accessibleLabel}, answered`) : accessibleLabel}
												>
													{label}{#if exercise.answered}<span aria-hidden="true">✓</span>{/if}
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{:else if count === 0}
			<p>{t('문제집에 문항이 없습니다.', 'This set has no questions.')}</p>
		{/if}
	{/if}
</div>

<style>
	.practice { width: 100%; max-width: 720px; margin-inline: auto; gap: 16px; }
	.back { align-self: start; color: var(--muted); font-size: 13px; }
	h1, h2, h3, p { margin: 0; }
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
	.index { margin-top: 8px; font-size: 14px; }
	.index summary { cursor: pointer; color: var(--muted); }
	.index ul { columns: 2 13rem; padding-inline-start: 20px; }
	.index a { color: var(--accent); text-underline-offset: 3px; overflow-wrap: anywhere; }
	.concepts, .exercises, .prerequisites ul { list-style: none; padding: 0; margin: 0; }
	.concepts { display: grid; gap: 12px; margin-top: 12px; }
	.concept { scroll-margin-top: 20px; }
	.concept:target { border-color: var(--accent); }
	.concept-heading, .concept-head, .prerequisites, .concept-practice, .practice-actions {
		display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px;
	}
	.concept-heading { justify-content: space-between; align-items: center; }
	.concept-head { justify-content: space-between; }
	.concept-head h3 { font: 600 18px/1.4 var(--f-body); overflow-wrap: anywhere; }
	.concept-page, .concept-progress, .prerequisites > span { color: var(--muted); font-size: 13px; }
	.concept .objective { margin: 6px 0 12px; overflow-wrap: anywhere; }
	.prerequisites ul, .exercises { display: flex; flex-wrap: wrap; gap: 6px 10px; }
	.prerequisites a, .concept-back { color: var(--accent); text-underline-offset: 3px; }
	.concept-practice { margin-top: 12px; }
	.exercises a {
		display: flex; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px;
		color: var(--ink); text-decoration: none;
	}
	.exercises a:hover { border-color: var(--accent); }
	.exercises a.answered span { color: var(--ok); }
	.concept-back { display: inline-block; margin-bottom: 12px; font-size: 14px; }
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
