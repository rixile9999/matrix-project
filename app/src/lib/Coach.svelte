<script lang="ts">
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { COACH_NAME, type BackendId, type CoachContext } from '#lib/core/coach.ts';
	import type { CoachMessage, CoachThreadResponse } from '#lib/types.ts';
	import Answer from '#lib/coach/Answer.svelte';
	import { readEvents } from '#lib/coach/stream.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let {
		context,
		getCode,
		placeholder = t('질문 입력', 'Ask a question'),
		refreshKey = 0
	}: {
		context: CoachContext;
		getCode?: () => string;
		placeholder?: string;
		refreshKey?: unknown; // change it to re-fetch the thread (e.g. the session finished, so access changed)
	} = $props();

	const LS = 'coach.backend';
	let thread = $state<CoachThreadResponse | null>(null);
	let loading = $state(true);
	let missing = $state(false);
	let loadError = $state(false);
	let messages = $state<CoachMessage[]>([]);
	let backend = $state<BackendId | null>(null);
	let draft = $state('');
	let busy = $state(false);
	let live = $state<string | null>(null); // answer text so far, null = not answering
	let liveBackend = $state<string>('');
	let notice = $state('');
	let box: HTMLElement | undefined = $state();
	let input: HTMLTextAreaElement | undefined = $state();
	let stick = true;
	let loadSeq = 0;

	function storedBackend(): string | null {
		try {
			return localStorage.getItem(LS);
		} catch {
			return null;
		}
	}
	function chooseBackend(id: BackendId) {
		backend = id;
		try {
			localStorage.setItem(LS, id);
		} catch {
			// private mode etc.
		}
	}

	async function load(kind: string, id: string, keep = false) {
		const seq = ++loadSeq;
		if (!keep) {
			loading = true;
			thread = null;
			messages = [];
		}
		missing = loadError = false;
		try {
			const res = await fetch(`/coach/thread?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
			if (seq !== loadSeq) return;
			if (res.status === 404) {
				missing = true;
			} else if (!res.ok) {
				loadError = true;
			} else {
				const j = (await res.json()) as CoachThreadResponse;
				if (seq !== loadSeq) return;
				thread = j;
				if (!busy) messages = j.messages;
				const want = backend ?? storedBackend();
				backend = j.backends.find((b) => b.id === want)?.id ?? j.backends[0]?.id ?? null;
			}
		} catch {
			if (seq === loadSeq) loadError = true;
		}
		if (seq === loadSeq) loading = false;
	}

	let lastKind = '';
	let lastId = '';
	$effect(() => {
		const { kind, id } = context;
		void refreshKey;
		void page.data.locale;
		untrack(() => {
			live = null;
			notice = '';
			load(kind, id, kind === lastKind && id === lastId);
			lastKind = kind;
			lastId = id;
		});
	});

	// locked with an open session: unlock by itself when the limit passes
	$effect(() => {
		const at = thread?.access === 'locked' ? thread.opensAt : null;
		if (at == null) return;
		const ms = Math.min(Math.max(at * 1000 - Date.now(), 0) + 700, 2 ** 31 - 1);
		const h = setTimeout(() => load(context.kind, context.id, true), ms);
		return () => clearTimeout(h);
	});

	// follow the newest message unless the user scrolled up
	function onScroll() {
		if (box) stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
	}
	$effect(() => {
		void messages.length;
		void live;
		if (!stick) return;
		tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	function grow() {
		if (!input) return;
		input.style.height = 'auto';
		input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
	}
	$effect(() => {
		void draft;
		tick().then(grow);
	});

	const backendLabel = (id: BackendId | null) => thread?.backends.find((b) => b.id === id)?.label ?? id ?? '';

	async function ask(question: string, id: BackendId | null = backend) {
		question = question.trim();
		if (!question || busy || !id || !thread) return;
		busy = true;
		notice = '';
		stick = true;
		const mine: CoachMessage = { id: -1, role: 'user', text: question, backend: null, ms: null, at: Math.floor(Date.now() / 1000), error: false };
		messages = [...messages, mine];
		live = '';
		liveBackend = backendLabel(id);
		const fail = (msg: string) => {
			messages = messages.filter((m) => m.id !== -1);
			notice = msg;
			if (draft === '') draft = question;
		};
		try {
			const res = await fetch('/coach/ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ context, backend: id, question, code: getCode?.() })
			});
			if (!res.ok) {
				if (res.status === 403) {
					fail(t('지금은 묻을 수 없습니다. 제한 시간이 끝나면 열립니다.', 'You cannot ask yet. It opens when the time limit ends.'));
					load(context.kind, context.id, true);
				} else if (res.status === 409) fail(t('아직 앞의 질문에 답하는 중입니다. 잠시 뒤에 다시 묻어 보세요.', 'The previous question is still being answered. Try again shortly.'));
				else if (res.status === 404) fail(t('이 항목에는 물을 수 없습니다.', 'You cannot ask about this item.'));
				else fail(`${t('질문을 보내지 못했습니다', 'Could not send the question')} (${res.status}).`);
				return;
			}
			let finished = false;
			for await (const ev of readEvents(res)) {
				if (ev.type === 'start') messages = messages.map((m) => (m.id === -1 ? { ...m, id: ev.userMessageId } : m));
				else if (ev.type === 'delta') live = (live ?? '') + ev.text;
				else {
					finished = true;
					messages = [...messages, ev.message];
					live = null;
				}
			}
			if (!finished) {
				notice = t('답이 중간에 끊겼습니다. 기록을 다시 불러옵니다.', 'The answer stopped midway. Reloading the record.');
				live = null;
				await load(context.kind, context.id, true);
				messages = thread?.messages ?? messages;
			}
		} catch {
			fail(t('연결에 실패했습니다. 잠시 뒤 다시 시도하세요.', 'Connection failed. Try again shortly.'));
		} finally {
			live = null;
			busy = false;
		}
	}

	function send() {
		const q = draft.trim();
		if (!q || busy) return;
		draft = '';
		ask(q);
	}
	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}
	// the question that came before coach message k
	function reask(k: number) {
		const q = messages.slice(0, k).findLast((m) => m.role === 'user');
		const list = thread?.backends ?? [];
		if (!q || list.length === 0) return;
		const cur = list.findIndex((b) => b.id === messages[k].backend);
		const next = list[(cur + 1) % list.length];
		chooseBackend(next.id);
		ask(q.text, next.id);
	}
	const nextLabel = (m: CoachMessage) => {
		const list = thread?.backends ?? [];
		if (list.length < 2) return '';
		return list[(list.findIndex((b) => b.id === m.backend) + 1) % list.length].label;
	};
	const QUICK = $derived(
		context.kind === 'lang' ? [t('단계별로 보여 줘', 'Show step by step'), t('모범답안과 비교', 'Compare with the model answer'), t('비슷한 문제는?', 'Anything similar?')] : [t('단계별로 보여 줘', 'Show step by step')]
	);
	const secs = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)}${t('초', 's')}`);
</script>

<div class="co">
	{#if loading && !thread}
		<p class="co-empty">{t('불러오는 중…', 'Loading…')}</p>
	{:else if missing}
		<div class="co-locked"><b>{COACH_NAME}</b>{t('이 항목에는 질문을 받지 않습니다.', ' does not accept questions for this item.')}</div>
	{:else if loadError || !thread}
		<div class="co-locked">
			<b>{t('불러오지 못했습니다', 'Could not load')}</b>
			<button class="co-again" type="button" onclick={() => load(context.kind, context.id)}>{t('다시 시도', 'Try again')}</button>
		</div>
	{:else if thread.access === 'locked'}
		<div class="co-locked">
			<b>{COACH_NAME} offline</b>
			{#if context.kind === 'lang'}{t('제한 시간이 끝나거나 문제를 마치면 열립니다. 그동안은 치트시트와 힌트를 쓸 수 있습니다.', 'It opens when the time limit ends or you finish the problem. Until then, use the cheat sheet and hints.')}{:else}{t('지금은 열 수 없습니다.', 'It is not available yet.')}{/if}
		</div>
	{:else}
		<div class="co-top">
			<p class="note">{t('질문과 현재 풀이 자료를 선택한 모델 제공자에게 보냅니다.', 'Your question and current work are sent to the selected model provider.')}</p>
			<a href="/settings/coach">{t('코치 연결 설정', 'Coach settings')}</a>
			<div class="co-chips" role="group" aria-label={`${COACH_NAME} ${t('선택', 'selection')}`}>
				{#each thread.backends as b (b.id)}
					<button class="co-chip" type="button" aria-pressed={backend === b.id} onclick={() => chooseBackend(b.id)}>{b.label}</button>
				{/each}
			</div>
			<div class="co-gets">{t('전달 정보', 'Sent information')}: {thread.gets.join(', ')}. {t('질문은 기록됩니다.', 'Questions are recorded.')}</div>
		</div>
		<div class="co-msgs" bind:this={box} onscroll={onScroll}>
			{#each messages as m, k (m.id < 0 ? `t${k}` : m.id)}
				{#if m.role === 'user'}
					<div class="co-me">{m.text}</div>
				{:else}
					<div class="co-bot" class:bad={m.error}>
						<div class="co-who"><span>{backendLabel(m.backend)}</span><span>{secs(m.ms)}</span></div>
						{#if m.error}
							<p class="co-errtext">{backendLabel(m.backend)} {t('가 답하지 못했습니다.', 'could not answer.')} {m.text}</p>
						{:else}
							<Answer text={m.text} messageId={m.id} />
						{/if}
						{#if nextLabel(m)}
							<button class="co-again" type="button" disabled={busy} onclick={() => reask(k)}>{t('다른', 'Ask another')} {COACH_NAME} ({nextLabel(m)})</button>
						{/if}
					</div>
				{/if}
			{/each}
			{#if live !== null}
				<div class="co-bot" aria-live="polite">
					<div class="co-who"><span>{liveBackend}</span><span></span></div>
					{#if live}<Answer text={live} streaming />{:else}<p class="co-drawing"><span class="pulse"></span>{t('답을 기다리고 있습니다…', 'Waiting for an answer…')}</p>{/if}
				</div>
			{/if}
			{#if messages.length === 0 && live === null}
				<p class="co-empty">{t('아직 질문이 없습니다.', 'No questions yet.')}</p>
			{/if}
		</div>
		<div class="co-bottom">
			{#if notice}<p class="err" role="alert">{notice}</p>{/if}
			{#if thread.access === 'full' && backend}
				<div class="co-quick">
					{#each QUICK as q (q)}<button type="button" disabled={busy} onclick={() => ask(q)}>{q}</button>{/each}
				</div>
			{/if}
			{#if !backend}<p class="note">{t('연결된 코치가 없습니다. 코치 연결 설정을 확인하세요.', 'No coach is connected. Check coach settings.')}</p>{:else}
			<div class="co-ask">
				<textarea bind:this={input} bind:value={draft} rows="1" {placeholder} aria-label={t('질문', 'Question')} onkeydown={keydown}></textarea>
				<button type="button" disabled={busy || !draft.trim()} onclick={send}>{t('묻기', 'Ask')}</button>
			</div>{/if}
		</div>
	{/if}
</div>
