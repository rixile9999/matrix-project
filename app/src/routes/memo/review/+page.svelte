<script lang="ts">
	import MemoClock from '#lib/MemoClock.svelte';
	import CheatBody from '#lib/CheatBody.svelte';
	import { renderInline } from '#lib/inline.ts';
	import { gradeFromChecklist } from '#lib/core/memo.ts';
	import { VERDICT } from '#lib/core/memo-sched.ts';
	import { mmss } from '#lib/rank.ts';
	import type { MemoAnswerResponse, MemoReviewData, MemoRevealResponse } from '#lib/types.ts';

	let { data }: { data: MemoReviewData } = $props();

	const sessionStart = Date.now();
	let i = $state(0);
	let reveal = $state<MemoRevealResponse | null>(null);
	let ticks = $state<boolean[]>([]);
	let startedAt = $state(Date.now());
	let stoppedAt = $state<number | null>(null);
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);
	let doneAt = $state(0);
	let tally = $state<Record<1 | 2 | 3, number>>({ 1: 0, 2: 0, 3: 0 });

	const card = $derived(data.cards[i]);
	const n = $derived(ticks.filter(Boolean).length);
	const grade = $derived(reveal ? gradeFromChecklist(n, reveal.points.length) : 1);
	const label = (kind: string, p: string) => {
		const at = p.indexOf(':');
		return kind === 'steps' && at > 0 && at < 20 ? `<b>${renderInline(p.slice(0, at))}</b>${renderInline(p.slice(at))}` : renderInline(p);
	};

	async function post<T>(url: string, body: object): Promise<T> {
		const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) throw new Error(res.status === 404 ? '이 카드는 지금 열 수 없습니다.' : '요청에 실패했습니다. 다시 눌러 보세요.');
		return res.json();
	}

	async function show() {
		busy = true;
		error = '';
		try {
			stoppedAt = Date.now();
			reveal = await post<MemoRevealResponse>('/memo/review/reveal', { id: card.id });
			ticks = reveal.points.map(() => false);
		} catch (e) {
			stoppedAt = null;
			error = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}

	async function next() {
		busy = true;
		error = '';
		try {
			const r = await post<MemoAnswerResponse>('/memo/review/answer', {
				id: card.id,
				ticked: ticks.flatMap((t, k) => (t ? [k] : [])),
				elapsedMs: (stoppedAt ?? Date.now()) - startedAt
			});
			tally[r.rating]++;
			if (i + 1 >= data.cards.length) {
				done = true;
				doneAt = Date.now();
			} else {
				i++;
				reveal = null;
				stoppedAt = null;
				startedAt = Date.now();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
</script>

<svelte:head><title>복습 · Matrix</title></svelte:head>

<div class="memo">
	{#if data.cards.length === 0}
		<div class="m-top"><a href="/memo" style="color:inherit">‹ 암기</a><span>복습</span></div>
		<p class="m-empty">지금 복습할 카드가 없습니다.</p>
		<a class="m-btn ghost" href="/memo">돌아가기</a>
	{:else if done}
		<div class="m-top"><span>복습 끝</span><span>{data.cards.length}장</span></div>
		<p class="m-q">{data.cards.length}장을 {mmss((doneAt - sessionStart) / 1000)} 동안 복습했습니다.</p>
		<div class="m-sum"><div><b>{tally[3]}</b>{VERDICT[3]}</div><div><b>{tally[2]}</b>{VERDICT[2]}</div><div><b>{tally[1]}</b>{VERDICT[1]}</div></div>
		<div class="m-spacer"></div>
		<a class="m-btn" href="/memo/check">문제 점검 하기</a>
		<a class="m-btn ghost" href="/memo">암기 홈으로</a>
	{:else}
		<div class="m-top">
			<span class="m-kind">{card.kindLabel}</span>
			<span>{#key i}<MemoClock {startedAt} limitSec={card.limitSec} {stoppedAt} />{/key} · {i + 1} / {data.cards.length}</span>
		</div>
		<div class="m-progress"><b style="width:{(i / data.cards.length) * 100}%"></b></div>
		<p class="m-q">{@html renderInline(card.prompt)}</p>
		{#if card.promptCode}<pre class="m-code">{card.promptCode}</pre>{/if}
		{#if card.source}<div class="m-src">{card.source}</div>{/if}

		{#if reveal}
			<div class="m-sheet">
				<span class="label">{card.kind === 'steps' ? '떠올린 단계를 체크하세요' : card.kind === 'syntax' ? '떠올렸으면 체크하세요' : '말한 답에 들어 있던 것을 체크하세요'}</span>
				{#if reveal.patternTitle}<div class="m-pat">유형: <b>{reveal.patternTitle}</b></div>{/if}
				{#each reveal.points as p, k (k)}
					<label class="m-check"><input type="checkbox" bind:checked={ticks[k]} /><span>{@html label(card.kind, p)}</span></label>
				{/each}
				{#if reveal.entry}<CheatBody entry={reveal.entry} />{/if}
				{#if reveal.answerCode}<pre class="m-code">{reveal.answerCode}</pre>{/if}
			</div>
		{/if}
		<div class="m-spacer"></div>
		{#if reveal}
			<div class="m-verdict" role="status">{reveal.points.length}개 중 {n}개 · <b>{VERDICT[grade]}</b> · 다음 복습 {reveal.next[n]}</div>
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		{#if reveal}
			<button class="m-btn" type="button" onclick={next} disabled={busy}>{i + 1 >= data.cards.length ? '끝내기' : '다음 카드'}</button>
		{:else}
			<button class="m-btn" type="button" onclick={show} disabled={busy}>{card.kind === 'steps' ? '단계를 떠올린 뒤 누르기' : '머릿속으로 답한 뒤 누르기'}</button>
		{/if}
	{/if}
</div>
