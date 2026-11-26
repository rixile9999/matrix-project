<script lang="ts">
	import type { MemoHomeData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: MemoHomeData } = $props();
</script>

<svelte:head><title>{t('암기 · Matrix', 'Memo · Matrix')}</title></svelte:head>

<div class="memo">
	<div class="m-top"><span>{t('암기', 'Memo')}</span><span>{t(`이번 주 ${data.weekDays} / ${data.weekGoal}일`, `${data.weekDays} / ${data.weekGoal} days this week`)}</span></div>

	{#if data.total > 0}
		<div>
			<div class="m-src">{t('오늘 복습', 'Review today')}</div>
			<div class="m-big">{data.total}<small>{t(` 장 · 약 ${data.minutes}분`, ` cards · about ${data.minutes} min`)}</small></div>
		</div>
		<div class="m-split">
			<div><b>{data.split.concept}</b>{t('개념', 'concepts')}</div>
			<div><b>{data.split.process}</b>{t('풀이 과정', 'solutions')}</div>
			<div><b>{data.split.syntax}</b>{t('문법', 'syntax')}</div>
		</div>
		<a class="m-btn" href="/memo/review">{t('복습 시작', 'Start review')}</a>
		{#if data.total > data.sessionSize}<p class="note" style="margin:-6px 0 0">{t(`한 번에 ${data.sessionSize}장씩 풀고, 나머지는 다음 복습에서 이어집니다.`, `Review ${data.sessionSize} cards at a time; the rest continue next time.`)}</p>{/if}
	{:else if data.openItems === 0}
		<p class="m-empty">{t('아직 열린 카드가 없습니다. 데스크톱에서 문제를 풀면 관련 카드가 여기에 나타납니다.', 'No cards are open yet. Solve problems on desktop to create related cards here.')}</p>
	{:else}
		<p class="m-empty">{t('오늘 복습할 카드가 없습니다.', 'No cards to review today.')}</p>
	{/if}
	{#if data.checks > 0}<a class="m-btn ghost" href="/memo/check">{t(`문제 점검 ${data.checks}개`, `Check ${data.checks} problems`)}</a>{/if}

	<div class="m-spacer"></div>
	<div>
		<a class="m-link" href="/memo/notes"><span>{t('암기 노트', 'Memo notes')}</span><span>{t(`흔들림 ${data.shaky}`, `${data.shaky} shaky`)} ›</span></a>
		{#if data.redo.length > 0}
			<div class="m-link" style="border-bottom:0"><span>{t('데스크톱에서 다시 풀기', 'Try again on desktop')}</span><span>{t(`${data.redo.length}문제`, `${data.redo.length} problems`)}</span></div>
			<div class="m-redo">
				{#each data.redo as r (r.problemId)}
					<a href="/lang/{r.problemId}">{r.title}<small>{r.cardTitle}</small></a>
				{/each}
			</div>
		{/if}
	</div>
</div>
