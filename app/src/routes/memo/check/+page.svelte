<script lang="ts">
	import DeskHorizon from '#lib/ambience/DeskHorizon.svelte';
	import { page } from '$app/state';
	import MemoClock from '#lib/MemoClock.svelte';
	import { renderInline } from '#lib/inline.ts';
	import { mmss } from '#lib/rank.ts';
	import type { MemoCheckData, MemoCheckResponse, MemoSolutionResponse } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data: session }: { data: { queue: Record<'en' | 'ko', MemoCheckData['checks']> } } = $props();
	const data = $derived({ checks: session.queue[page.data.locale] });

	const sessionStart = Date.now();
	let i = $state(0);
	let startedAt = $state(Date.now());
	let stoppedAt = $state<number | null>(null);
	let picked = $state<number[]>([]); // order: displayed pool indexes, in the chosen order
	let answered = $state<Record<'en' | 'ko', MemoCheckResponse> | null>(null);
	const res = $derived(answered?.[page.data.locale] ?? null);
	let tapped = $state<number | null>(null); // choice checks: option or line tapped (first tap decides)
	let firstDone = $state(false); // the first submission has been recorded
	let solved = $state(false); // order: right answer reached or the solution was shown
	let running = $state(false);
	let error = $state('');
	let right = $state<boolean[]>([]); // first-submission verdicts
	let lateRight = $state(false); // the recorded answer was right but over the limit
	let done = $state(false);
	let doneAt = $state(0);

	const c = $derived(data.checks[i]);
	const last = $derived(i + 1 >= data.checks.length);
	const late = $derived(stoppedAt !== null && c ? stoppedAt - startedAt > c.limitSec * 1000 : false);
	const pool = $derived(c ? c.lines.map((text, k) => ({ text, k })).filter((l) => !picked.includes(l.k)) : []);

	async function post<T>(url: string, body: object): Promise<T> {
		const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		if (!r.ok) throw new Error(r.status === 404 ? t('이 점검은 지금 열 수 없습니다.', 'This check is unavailable.') : t('요청에 실패했습니다. 다시 눌러 보세요.', 'Request failed. Try again.'));
		return r.json();
	}

	async function submit(choice: number | number[]) {
		if (running) return;
		running = true;
		error = '';
		const first = !firstDone;
		if (first) stoppedAt = Date.now();
		try {
			const feedback = await post<Record<'en' | 'ko', MemoCheckResponse>>('/memo/check/answer', { id: c.id, choice, elapsedMs: (stoppedAt ?? Date.now()) - startedAt });
			answered = feedback;
			const r = feedback[page.data.locale];
			if (first) {
				firstDone = true;
				right = [...right, r.correct];
				lateRight = r.correct && r.recorded && late;
			}
			if (c.kind === 'order' && r.correct) solved = true;
		} catch (e) {
			if (first) stoppedAt = null;
			error = e instanceof Error ? e.message : String(e);
		}
		running = false;
	}

	function tap(k: number) {
		if (firstDone) {
			tapped = k; // read another option's reason, no new request
			return;
		}
		tapped = k;
		submit(k);
	}

	async function showSolution() {
		try {
			picked = (await post<MemoSolutionResponse>('/memo/check/solution', { id: c.id })).order;
			solved = true;
			answered = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function next() {
		if (last) {
			done = true;
			doneAt = Date.now();
			return;
		}
		i++;
		startedAt = Date.now();
		stoppedAt = null;
		picked = [];
		answered = null;
		tapped = null;
		firstDone = false;
		lateRight = false;
		solved = false;
		error = '';
	}

	const reset = () => {
		picked = [];
		answered = null;
	};
	const optClass = (k: number) => (!res || !firstDone ? '' : k === res.correctIndex ? 'right' : k === tapped ? 'wrong' : '');
	const lineClass = (k: number) => (!res || res.bugIndex === null ? '' : k === res.bugIndex ? 'right' : k === tapped ? 'wrong' : '');
	const score = $derived(right.filter(Boolean).length);
</script>

<svelte:head><title>{t('문제 점검 · Matrix', 'Problem checks · Matrix')}</title></svelte:head>

{#if data.checks.length > 0 && !done}<DeskHorizon />{/if}

<div class="memo">
	{#if data.checks.length === 0}
		<div class="m-top"><a href="/memo" style="color:inherit">‹ {t('암기', 'Memo')}</a><span>{t('문제 점검', 'Problem checks')}</span></div>
		<p class="m-empty">{t('지금 풀 수 있는 점검이 없습니다.', 'No checks available right now.')}</p>
		<a class="m-btn ghost" href="/memo">{t('돌아가기', 'Back')}</a>
	{:else if done}
		<div class="m-top"><span>{t('점검 끝', 'Checks complete')}</span><span>{t(`${data.checks.length}개`, `${data.checks.length}`)}</span></div>
		<p class="m-q">{t(`${data.checks.length}개 중 ${score}개를 처음 답에서 맞혔습니다.`, `${score} of ${data.checks.length} were correct on the first answer.`)} ({mmss((doneAt - sessionStart) / 1000)})</p>
		<div class="m-spacer"></div>
		<a class="m-btn" href="/memo/review">{t('복습 하기', 'Review cards')}</a>
		<a class="m-btn ghost" href="/memo">{t('암기 홈으로', 'Memo home')}</a>
	{:else}
		<div class="m-top">
			<span class="m-kind">{c.kindLabel}</span>
			<span>{#key i}<MemoClock {startedAt} limitSec={c.limitSec} {stoppedAt} />{/key} · {i + 1} / {data.checks.length}</span>
		</div>
		<div class="m-progress"><b style="width:{(i / data.checks.length) * 100}%"></b></div>
		<p class="m-q small">{@html renderInline(c.prompt)}</p>
		{#if c.code}<pre class="m-code">{c.code}</pre>{/if}
		{#if c.given}<pre class="m-code">{c.given}</pre>{/if}

		{#if c.kind === 'order'}
			<div class="m-slot">{t('내 답', 'My answer')}</div>
			<div class="m-lines m-ans">
				{#each picked as k (k)}
					<button class="m-line" type="button" disabled={solved || running} onclick={() => (picked = picked.filter((x) => x !== k))}>{c.lines[k]}</button>
				{:else}
					<div class="m-dash">{t('아래 줄을 순서대로 누르세요', 'Tap the lines below in order')}</div>
				{/each}
			</div>
			<div class="m-slot">{t('남은 줄', 'Remaining lines')}</div>
			<div class="m-lines">
				{#each pool as l (l.k)}
					<button class="m-line" type="button" disabled={solved || running} onclick={() => { picked = [...picked, l.k]; answered = null; }}>{l.text}</button>
				{/each}
			</div>
		{:else if c.kind === 'bug'}
			<div class="m-lines">
				{#each c.lines as text, k (k)}
					<button class="m-line {lineClass(k)}" type="button" disabled={firstDone || running} onclick={() => tap(k)}>{text}</button>
				{/each}
			</div>
		{:else}
			{#each c.options as text, k (k)}
				<button class="m-opt {optClass(k)}" type="button" disabled={running} aria-pressed={tapped === k} onclick={() => tap(k)}>{text}</button>
			{/each}
		{/if}

		<div class="m-spacer"></div>
		{#if running && c.kind === 'order'}
			<div class="m-msg" role="status">{t('채점 중입니다. 처음에는 1분쯤 걸릴 수 있습니다.', 'Grading. The first check can take about a minute.')}</div>
		{:else if res}
			{#if c.kind === 'order'}
				<div class="m-msg {res.correct ? 'ok' : 'bad'}" role="status">{res.correct ? t('맞습니다.', 'Correct.') : ''}{@html renderInline(res.correct ? '' : (res.message ?? t('통과하지 못했습니다.', 'Not passed.')))}</div>
			{:else if c.kind === 'bug'}
				<div class="m-msg {res.correct ? 'ok' : 'bad'}" role="status">{res.correct ? t('맞습니다. ', 'Correct. ') : t('아닙니다. ', 'Not quite. ')}{@html renderInline(res.why ?? '')}</div>
				{#if res.fixed}<pre class="m-code">{res.fixed}</pre>{/if}
			{:else if tapped !== null}
				<div class="m-msg {tapped === res.correctIndex ? 'ok' : 'bad'}" role="status">{tapped === res.correctIndex ? t('맞습니다. ', 'Correct. ') : t('아닙니다. ', 'Not quite. ')}{@html renderInline(res.whys[tapped] ?? '')}</div>
				{#if tapped !== res.correctIndex}<div class="m-msg">{t('정답:', 'Answer:')} {c.options[res.correctIndex ?? 0]}</div>{/if}
			{/if}
			{#if lateRight}<div class="m-msg" role="status">{t("제한 시간을 넘겨서 '흔들림'으로 기록했습니다. 더 일찍 다시 나옵니다.", "You went over the limit, so this is marked 'shaky' and will return sooner.")}</div>{/if}
		{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}

		{#if c.kind === 'order' && !solved}
			<div class="m-row">
				<button class="m-btn ghost" type="button" onclick={reset} disabled={running}>{t('처음부터', 'Reset')}</button>
				<button class="m-btn" type="button" onclick={() => submit(picked)} disabled={running || picked.length === 0}>{running ? t('채점 중…', 'Grading…') : t('확인', 'Check')}</button>
			</div>
			{#if firstDone}
				<div class="m-row">
					<button class="m-btn ghost" type="button" onclick={showSolution} disabled={running}>{t('정답 보기', 'View answer')}</button>
					<button class="m-btn ghost" type="button" onclick={next} disabled={running}>{last ? t('끝내기', 'Finish') : t('다음으로', 'Next')}</button>
				</div>
			{/if}
		{:else if firstDone || solved}
			<button class="m-btn" type="button" onclick={next}>{last ? t('끝내기', 'Finish') : t('다음 점검', 'Next check')}</button>
		{/if}
	{/if}
</div>
