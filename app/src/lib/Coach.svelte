<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { COACH_NAME, type BackendId, type CoachContext } from '#lib/core/coach.ts';
	import type { CoachMessage, CoachThreadResponse } from '#lib/types.ts';
	import Answer from '#lib/coach/Answer.svelte';
	import { readEvents } from '#lib/coach/stream.ts';

	let {
		context,
		getCode,
		placeholder = '질문 입력',
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
					fail('지금은 묻을 수 없습니다. 제한 시간이 끝나면 열립니다.');
					load(context.kind, context.id, true);
				} else if (res.status === 409) fail('아직 앞의 질문에 답하는 중입니다. 잠시 뒤에 다시 묻어 보세요.');
				else if (res.status === 404) fail('이 항목에는 물을 수 없습니다.');
				else fail(`질문을 보내지 못했습니다 (${res.status}).`);
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
				notice = '답이 중간에 끊겼습니다. 기록을 다시 불러옵니다.';
				live = null;
				await load(context.kind, context.id, true);
				messages = thread?.messages ?? messages;
			}
		} catch {
			fail('연결에 실패했습니다. 잠시 뒤 다시 시도하세요.');
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
		context.kind === 'lang' ? ['단계별로 보여 줘', '모범답안과 비교', '비슷한 문제는?'] : ['단계별로 보여 줘']
	);
	const secs = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)}초`);
</script>

<div class="co">
	{#if loading && !thread}
		<p class="co-empty">불러오는 중…</p>
	{:else if missing}
		<div class="co-locked"><b>{COACH_NAME}</b>이 항목에는 질문을 받지 않습니다.</div>
	{:else if loadError || !thread}
		<div class="co-locked">
			<b>불러오지 못했습니다</b>
			<button class="co-again" type="button" onclick={() => load(context.kind, context.id)}>다시 시도</button>
		</div>
	{:else if thread.access === 'locked'}
		<div class="co-locked">
			<b>{COACH_NAME} offline</b>
			{#if context.kind === 'lang'}제한 시간이 끝나거나 문제를 마치면 열립니다. 그동안은 치트시트와 힌트를 쓸 수 있습니다.{:else}지금은 열 수 없습니다.{/if}
		</div>
	{:else}
		<div class="co-top">
			<div class="co-chips" role="group" aria-label="{COACH_NAME} 선택">
				{#each thread.backends as b (b.id)}
					<button class="co-chip" type="button" aria-pressed={backend === b.id} onclick={() => chooseBackend(b.id)}>{b.label}</button>
				{/each}
			</div>
			<div class="co-gets">{COACH_NAME}에게 넘어가는 정보: {thread.gets.join(', ')}. 질문은 기록됩니다.</div>
		</div>
		<div class="co-msgs" bind:this={box} onscroll={onScroll}>
			{#each messages as m, k (m.id < 0 ? `t${k}` : m.id)}
				{#if m.role === 'user'}
					<div class="co-me">{m.text}</div>
				{:else}
					<div class="co-bot" class:bad={m.error}>
						<div class="co-who"><span>{backendLabel(m.backend)}</span><span>{secs(m.ms)}</span></div>
						{#if m.error}
							<p class="co-errtext">{backendLabel(m.backend)}가 답하지 못했습니다. {m.text}</p>
						{:else}
							<Answer text={m.text} messageId={m.id} />
						{/if}
						{#if nextLabel(m)}
							<button class="co-again" type="button" disabled={busy} onclick={() => reask(k)}>다른 {COACH_NAME}({nextLabel(m)})에게 다시 묻기</button>
						{/if}
					</div>
				{/if}
			{/each}
			{#if live !== null}
				<div class="co-bot" aria-live="polite">
					<div class="co-who"><span>{liveBackend}</span><span></span></div>
					{#if live}<Answer text={live} streaming />{:else}<p class="co-drawing"><span class="pulse"></span>답을 기다리고 있습니다…</p>{/if}
				</div>
			{/if}
			{#if messages.length === 0 && live === null}
				<p class="co-empty">아직 질문이 없습니다.</p>
			{/if}
		</div>
		<div class="co-bottom">
			{#if notice}<p class="err" role="alert">{notice}</p>{/if}
			{#if thread.access === 'full'}
				<div class="co-quick">
					{#each QUICK as q (q)}<button type="button" disabled={busy} onclick={() => ask(q)}>{q}</button>{/each}
				</div>
			{/if}
			<div class="co-ask">
				<textarea bind:this={input} bind:value={draft} rows="1" {placeholder} aria-label="질문" onkeydown={keydown}></textarea>
				<button type="button" disabled={busy || !draft.trim()} onclick={send}>묻기</button>
			</div>
		</div>
	{/if}
</div>
