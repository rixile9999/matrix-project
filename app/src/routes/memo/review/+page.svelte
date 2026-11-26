<script lang="ts">
	import { page } from '$app/state';
	import MemoClock from '#lib/MemoClock.svelte';
	import CheatBody from '#lib/CheatBody.svelte';
	import Coach from '#lib/Coach.svelte';
	import { COACH_NAME } from '#lib/core/coach.ts';
	import { renderInline } from '#lib/inline.ts';
	import { capOvertime, gradeFromChecklist } from '#lib/core/memo.ts';
	import { VERDICT } from '#lib/core/memo-sched.ts';
	import { mmss } from '#lib/rank.ts';
	import type { MemoAnswerResponse, MemoReviewData, MemoRevealResponse } from '#lib/types.ts';
	import { t, label as localizeLabel } from '#lib/i18n.svelte.ts';

	let { data: session }: { data: { queue: Record<'en' | 'ko', MemoReviewData['cards']> } } = $props();
	const data = $derived({ cards: session.queue[page.data.locale] });

	const sessionStart = Date.now();
	let i = $state(0);
	let revealed = $state<Record<'en' | 'ko', MemoRevealResponse> | null>(null);
	const reveal = $derived(revealed?.[page.data.locale] ?? null);
	let ticks = $state<boolean[]>([]);
	let startedAt = $state(Date.now());
	let stoppedAt = $state<number | null>(null);
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);
	let doneAt = $state(0);
	let tally = $state<Record<1 | 2 | 3, number>>({ 1: 0, 2: 0, 3: 0 });

	// Operator bottom sheet: only after the reveal; hidden when the card has no thread (synthetic cards)
	let askOpen = $state(false);
	let askOk = $state(false);
	$effect(() => {
		const id = card?.id;
		if (!reveal || !id) {
			askOk = false;
			return;
		}
		let live = true;
		fetch(`/coach/thread?kind=memo&id=${encodeURIComponent(id)}`)
			.then((r) => live && (askOk = r.ok))
			.catch(() => live && (askOk = false));
		return () => (live = false);
	});

	const card = $derived(data.cards[i]);
	const n = $derived(ticks.filter(Boolean).length);
	const over = $derived(stoppedAt !== null && card ? stoppedAt - startedAt > card.limitSec * 1000 : false);
	const grade = $derived(reveal ? capOvertime(gradeFromChecklist(n, reveal.points.length), over) : 1);
	const label = (kind: string, p: string) => {
		const at = p.indexOf(':');
		return kind === 'steps' && at > 0 && at < 20 ? `<b>${renderInline(p.slice(0, at))}</b>${renderInline(p.slice(at))}` : renderInline(p);
	};

	async function post<T>(url: string, body: object): Promise<T> {
		const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) throw new Error(res.status === 404 ? t('이 카드는 지금 열 수 없습니다.', 'This card is unavailable.') : t('요청에 실패했습니다. 다시 눌러 보세요.', 'Request failed. Try again.'));
		return res.json();
	}

	async function show() {
		busy = true;
		error = '';
		try {
			stoppedAt = Date.now();
			revealed = await post<Record<'en' | 'ko', MemoRevealResponse>>('/memo/review/reveal', { id: card.id, elapsedMs: stoppedAt - startedAt });
			ticks = revealed[page.data.locale].points.map(() => false);
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
				askOpen = false;
				revealed = null;
				stoppedAt = null;
				startedAt = Date.now();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
</script>

<svelte:head><title>{t('복습 · Matrix', 'Review · Matrix')}</title></svelte:head>

<svelte:window onkeydown={(e) => e.key === 'Escape' && askOpen && (askOpen = false)} />

<div class="memo">
	{#if data.cards.length === 0}
		<div class="m-top"><a href="/memo" style="color:inherit">‹ {t('암기', 'Memo')}</a><span>{t('복습', 'Review')}</span></div>
		<p class="m-empty">{t('지금 복습할 카드가 없습니다.', 'No cards to review right now.')}</p>
		<a class="m-btn ghost" href="/memo">{t('돌아가기', 'Back')}</a>
	{:else if done}
		<div class="m-top"><span>{t('복습 끝', 'Review complete')}</span><span>{t(`${data.cards.length}장`, `${data.cards.length} cards`)}</span></div>
		<p class="m-q">{t(`${data.cards.length}장을 ${mmss((doneAt - sessionStart) / 1000)} 동안 복습했습니다.`, `Reviewed ${data.cards.length} cards in ${mmss((doneAt - sessionStart) / 1000)}.`)}</p>
		<div class="m-sum"><div><b>{tally[3]}</b>{localizeLabel(VERDICT[3])}</div><div><b>{tally[2]}</b>{localizeLabel(VERDICT[2])}</div><div><b>{tally[1]}</b>{localizeLabel(VERDICT[1])}</div></div>
		<div class="m-spacer"></div>
		<a class="m-btn" href="/memo/check">{t('문제 점검 하기', 'Check problems')}</a>
		<a class="m-btn ghost" href="/memo">{t('암기 홈으로', 'Memo home')}</a>
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
				<span class="label">{card.kind === 'steps' ? t('떠올린 단계를 체크하세요', 'Check the steps you recalled') : card.kind === 'syntax' ? t('떠올렸으면 체크하세요', 'Check what you recalled') : t('말한 답에 들어 있던 것을 체크하세요', 'Check what your answer included')}</span>
				{#if reveal.patternTitle}<div class="m-pat">{t('유형:', 'Pattern:')} <b>{reveal.patternTitle}</b></div>{/if}
				{#each reveal.points as p, k (k)}
					<label class="m-check"><input type="checkbox" bind:checked={ticks[k]} /><span>{@html label(card.kind, p)}</span></label>
				{/each}
				{#if reveal.entry}<CheatBody entry={reveal.entry} />{/if}
				{#if reveal.answerCode}<pre class="m-code">{reveal.answerCode}</pre>{/if}
			</div>
		{/if}
		<div class="m-spacer"></div>
		{#if reveal}
			<div class="m-verdict" role="status">{t(`${reveal.points.length}개 중 ${n}개`, `${n} of ${reveal.points.length}`)} · <b>{localizeLabel(VERDICT[grade])}</b>{#if over && n >= reveal.points.length} ({t('시간 초과', 'time expired')}){/if} · {t('다음 복습', 'Next review')} {reveal.next[n]}</div>
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		{#if reveal && askOk}
			<button class="m-btn ghost" type="button" onclick={() => (askOpen = true)}>{t(`${COACH_NAME}에게 묻기`, `Ask ${COACH_NAME}`)}</button>
		{/if}
		{#if reveal}
			<button class="m-btn" type="button" onclick={next} disabled={busy}>{i + 1 >= data.cards.length ? t('끝내기', 'Finish') : t('다음 카드', 'Next card')}</button>
		{:else}
			<button class="m-btn" type="button" onclick={show} disabled={busy}>{card.kind === 'steps' ? t('단계를 떠올린 뒤 누르기', 'Recall the steps, then tap') : t('머릿속으로 답한 뒤 누르기', 'Answer mentally, then tap')}</button>
		{/if}
	{/if}
</div>

{#if askOpen && reveal && card}
	<button class="co-scrim" type="button" tabindex="-1" aria-label={t('닫기', 'Close')} onclick={() => (askOpen = false)}></button>
	<div class="co-sheet" role="dialog" aria-label={t(`${COACH_NAME}에게 묻기`, `Ask ${COACH_NAME}`)}>
		<div class="co-sheet-bar">
			<b>{COACH_NAME}</b>
			<button class="btn ghost small" type="button" onclick={() => (askOpen = false)}>{t('닫기', 'Close')}</button>
		</div>
		<div class="co-sheet-body">
			{#key card.id}<Coach context={{ kind: 'memo', id: card.id }} placeholder={t('이 카드에 대해 묻기', 'Ask about this card')} />{/key}
		</div>
	</div>
{/if}
