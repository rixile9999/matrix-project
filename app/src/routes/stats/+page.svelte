<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.svelte.ts';
	import { mmss } from '#lib/rank.ts';
	import { actionErrors, modeNames, statuses, topicNames } from '#lib/stats/labels.ts';
	import type { Topic } from '#lib/stats/types.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let topics: Topic[] = ['probability', 'inference', 'ml', 'bio'];
</script>

<svelte:head><title>{t('확률과 통계', 'Probability & Statistics')} · Matrix</title></svelte:head>

<div class="body course">
	<header class="course-header">
		<h1>{t('확률과 통계', 'Probability & Statistics')}</h1>
		<p>{t('확률 모형부터 통계적 추론까지', 'From probability models to statistical inference')}</p>
		<nav class="track-links" aria-label={t('확률·통계 활동', 'Statistics activities')}>
			<a href="/spar#h-stats">{t('통계 스파링', 'Statistics sparring')}</a>
			{#if data.hasReviews}
				<a href="/debrief#stats-reviews">{t('풀이 복기', 'Review attempts')}</a>
				<a href="/garden#statistics">{t('정원에서 보기', 'View in Garden')}</a>
			{/if}
		</nav>
	</header>

	{#if form?.error}<p class="err" role="alert">{t(...actionErrors[form.error])}</p>{/if}

	<section aria-labelledby="stats-recommendation">
		<h2 id="stats-recommendation">{t('다음 연습', 'Practice Next')}</h2>
		<div class="suggestions">
			{#each data.recommendation as lesson (lesson.id)}
				<form method="POST" action="?/start" use:enhance>
					<input type="hidden" name="lessonId" value={lesson.id} />
					<button class="suggestion">
						<span>{t(...topicNames[lesson.topic])}</span>
						<strong>{t(...lesson.title)}</strong>
						<small>{t(...modeNames[lesson.mode])} · <span class="mono">{mmss(lesson.seconds)}</span></small>
					</button>
				</form>
			{/each}
		</div>
	</section>

	<div class="curriculum">
		{#each topics as topic (topic)}
			{@const lessons = data.catalogue.filter((lesson) => lesson.topic === topic)}
			{@const solved = lessons.filter((lesson) => lesson.best !== null).length}
			<section aria-labelledby={'stats-' + topic}>
				<div class="topic-header">
					<h2 id={'stats-' + topic}>{t(...topicNames[topic])}</h2>
					<span class="mono" aria-label={t(`${lessons.length}개 중 ${solved}개 완료`, `${solved} of ${lessons.length} solved`)}>{solved} / {lessons.length}</span>
				</div>
				<ul class="lessons">
					{#each lessons as lesson (lesson.id)}
						<li>
							<div class="lesson-name">
								<strong>{t(...lesson.title)}</strong>
								<span>{t(...lesson.targets)}</span>
							</div>
							<div class="lesson-meta">
								<span>{t(...modeNames[lesson.mode])} · <span class="mono">{mmss(lesson.seconds)}</span></span>
								{#if lesson.latestId !== null}
									<a class:solved={lesson.status === 'passed'} href="/stats/{lesson.id}?run={lesson.latestId}">{t(...statuses[lesson.status])}</a>
								{/if}
								{#if lesson.best !== null}
									<span>{t('최고', 'Best')} <span class="mono">{mmss(lesson.best)}</span></span>
								{/if}
							</div>
							<form method="POST" action="?/start" use:enhance>
								<input type="hidden" name="lessonId" value={lesson.id} />
								<button class="btn ghost small" aria-label={t(`${t(...lesson.title)} ${lesson.status === 'active' ? '이어서 풀기' : '시작'}`, `${lesson.status === 'active' ? 'Resume' : 'Start'} ${t(...lesson.title)}`)}>
									{lesson.status === 'active' ? t('계속', 'Resume') : t('시작', 'Start')}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>

<style>
	.course { padding-inline: clamp(16px, 4vw, 46px); }
	.course-header { border-bottom: 1px solid var(--line); padding-block: 10px 22px; }
	h1 { margin: 0; font: 700 clamp(28px, 5vw, 46px)/1.1 var(--f-display); letter-spacing: -.035em; }
	h2 { margin: 0 0 9px; font: 700 17px var(--f-display); }
	p { margin: 8px 0 0; color: var(--muted); }
	.suggestions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
	.suggestions form { display: flex; }
	.suggestion { display: grid; align-content: start; gap: 5px; width: 100%; padding: 13px; text-align: start; background: var(--surface); color: var(--ink); font: inherit; border: 1px solid var(--line); border-radius: var(--r); cursor: pointer; }
	.suggestion:hover, .suggestion:focus-visible { border-color: var(--accent); }
	.suggestion > span, .suggestion small, .topic-header > span, .lesson-meta, .lesson-name span { color: var(--muted); font-size: 12px; }
	.suggestion strong { font: 700 16px var(--f-display); }
	.curriculum { display: grid; gap: 22px; }
	.topic-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
	.lessons { margin: 0; padding: 0; list-style: none; border-bottom: 1px solid var(--line); }
	.lessons li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 9px 0; border-top: 1px solid var(--line); }
	.lesson-name, .lesson-meta { display: grid; gap: 1px; }
	.lesson-meta { text-align: end; }
	.lesson-meta a { color: inherit; text-underline-offset: 2px; }
	.lesson-meta a.solved { color: var(--ok); }
	@media (max-width: 530px) {
		.suggestions { grid-template-columns: 1fr; }
		.suggestion { grid-template-columns: 1fr auto; align-items: baseline; }
		.suggestion strong { grid-column: 1; }
		.suggestion small { grid-area: 2 / 2; }
		.lessons li { gap: 10px; }
	}
	.track-links { display: flex; gap: 8px 16px; flex-wrap: wrap; margin-top: 12px; font-size: 14px; }
	.track-links a { color: var(--accent); text-underline-offset: 3px; }
</style>
