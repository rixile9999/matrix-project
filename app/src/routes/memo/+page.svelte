<script lang="ts">
	import type { MemoHomeData } from '#lib/types.ts';

	let { data }: { data: MemoHomeData } = $props();
</script>

<svelte:head><title>암기 · Matrix</title></svelte:head>

<div class="memo">
	<div class="m-top"><span>암기</span><span>이번 주 {data.weekDays} / {data.weekGoal}일</span></div>

	{#if data.total > 0}
		<div>
			<div class="m-src">오늘 복습</div>
			<div class="m-big">{data.total}<small> 장 · 약 {data.minutes}분</small></div>
		</div>
		<div class="m-split">
			<div><b>{data.split.concept}</b>개념</div>
			<div><b>{data.split.process}</b>풀이 과정</div>
			<div><b>{data.split.syntax}</b>문법</div>
		</div>
		<a class="m-btn" href="/memo/review">복습 시작</a>
		{#if data.total > data.sessionSize}<p class="note" style="margin:-6px 0 0">한 번에 {data.sessionSize}장씩 풀고, 나머지는 다음 복습에서 이어집니다.</p>{/if}
	{:else if data.openItems === 0}
		<p class="m-empty">아직 열린 카드가 없습니다. 데스크톱에서 문제를 풀면 관련 카드가 여기에 나타납니다.</p>
	{:else}
		<p class="m-empty">오늘 복습할 카드가 없습니다.</p>
	{/if}
	{#if data.checks > 0}<a class="m-btn ghost" href="/memo/check">문제 점검 {data.checks}개</a>{/if}

	<div class="m-spacer"></div>
	<div>
		<a class="m-link" href="/memo/notes"><span>암기 노트</span><span>흔들림 {data.shaky} ›</span></a>
		{#if data.redo.length > 0}
			<div class="m-link" style="border-bottom:0"><span>데스크톱에서 다시 풀기</span><span>{data.redo.length}문제</span></div>
			<div class="m-redo">
				{#each data.redo as r (r.problemId)}
					<a href="/lang/{r.problemId}">{r.title}<small>{r.cardTitle}</small></a>
				{/each}
			</div>
		{/if}
	</div>
</div>
