<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { Ambience, AmbienceControls, audio } from '#lib/ambience/index.ts';
	import TimeGlyph from '#lib/TimeGlyph.svelte';
	import { renderInline } from '#lib/inline.ts';
	import type { MemoCheckView, SparAbandonResponse, SparError, SparRecallAnswerResponse, SparRecallData } from '#lib/types.ts';

	let { data }: { data: SparRecallData } = $props();

	let current = $state.raw<MemoCheckView | null>(untrack(() => data.current));
	let answered = $state(untrack(() => data.answered));
	let correctCount = $state(untrack(() => data.correct));
	const base = untrack(() => data.elapsedMs);
	const receivedAt = performance.now();
	let elapsed = $state(untrack(() => data.elapsedMs));
	let flash = $state<{ tapped: number; highlight: number | null; correct: boolean } | null>(null);
	let inFlight = $state(false);
	let leaving = false;
	let confirmQuit = $state(false);
	let error = $state('');
	let shownAt = $state(0); // index of the check on screen, to animate each new one

	const left = $derived(Math.max(0, data.durationMs - elapsed));
	const progress = $derived(Math.min(1, elapsed / data.durationMs));
	const go = (url: string) => {
		if (leaving) return;
		leaving = true;
		return goto(`${url}?fresh=1`);
	};

	onMount(() => {
		const t = setInterval(() => {
			elapsed = base + (performance.now() - receivedAt);
			if (elapsed >= data.durationMs && !inFlight) go(`/spar/run/${data.run.id}`);
		}, 200);
		return () => clearInterval(t);
	});

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function tap(k: number) {
		const c = current;
		if (!c || inFlight || flash || leaving) return;
		inFlight = true;
		error = '';
		try {
			const r = await fetch(`/spar/recall/${data.run.id}/answer`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: c.id, choice: k })
			});
			const j = (await r.json().catch(() => ({}))) as Partial<SparRecallAnswerResponse> & Partial<SparError>;
			if (!r.ok) {
				error = j.error ?? `요청에 실패했습니다 (${r.status}). 다시 눌러 보세요.`;
				return;
			}
			if (j.accepted) {
				const ok = !!j.correct;
				audio.sfx(ok ? 'ok' : 'bad');
				answered = j.answered ?? answered;
				correctCount = j.correctCount ?? correctCount;
				flash = { tapped: k, highlight: j.highlight ?? null, correct: ok };
				await wait(500);
			}
			if (j.over) {
				await go(j.runUrl ?? `/spar/run/${data.run.id}`);
				return;
			}
			if (j.next) {
				current = j.next;
				shownAt++;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			flash = null;
			inFlight = false;
		}
	}

	async function quit() {
		inFlight = true;
		try {
			const r = await fetch(`/spar/recall/${data.run.id}/abandon`, { method: 'POST' });
			const j = (await r.json()) as SparAbandonResponse;
			await goto(j.runUrl ?? `/spar/run/${data.run.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			inFlight = false;
		}
	}

	function cls(k: number): string {
		if (!flash) return '';
		if (k === flash.highlight) return 'right';
		if (k === flash.tapped) return 'miss'; // tapped and not the right one
		return 'fade';
	}
	const options = $derived(current ? (current.kind === 'bug' ? current.lines : current.options) : []);
</script>

<svelte:head><title>Recall · Matrix</title></svelte:head>
<Ambience scene="run" {progress} />

<main class="a-page narrow">
	<div class="a-top">
		<span>Recall · {answered}개 답함{answered ? ` · 맞힘 ${correctCount}` : ''}</span>
		<TimeGlyph remainingSec={Math.ceil(left / 1000)} limitSec={data.durationMs / 1000} size={24} />
	</div>
	<div class="a-thin" aria-hidden="true"><b style="width:{progress * 100}%"></b></div>

	{#if current}
		{#key shownAt}
			<div class="a-col" style="animation: a-in .5s ease both">
				<p class="a-small">{current.kindLabel}</p>
				<p class="a-p" style="font-size:16px">{@html renderInline(current.prompt)}</p>
				{#if current.code}<div class="a-glass edit" style="padding:14px 16px;background:rgba(8,9,13,.94)"><pre class="a-code">{current.code}</pre></div>{/if}
				{#if current.given}<div class="a-glass edit" style="padding:14px 16px"><pre class="a-code">{current.given}</pre></div>{/if}
				<div class="a-opts">
					{#each options as text, k (k)}
						<button class="a-opt {cls(k)}" type="button" disabled={!!flash || inFlight} onclick={() => tap(k)}>
							{#if current.kind === 'bug'}<span class="a-no a-num">{k + 1}</span>{/if}{text}
						</button>
					{/each}
				</div>
			</div>
		{/key}
	{:else}
		<p class="a-p">더 풀 점검이 없습니다.</p>
	{/if}
	{#if error}<p class="a-err" role="alert">{error}</p>{/if}

	<div class="a-corner">
		{#if !confirmQuit}
			<button class="a-btn quiet" type="button" onclick={() => (confirmQuit = true)}>그만두기</button>
		{:else}
			<span class="a-confirm">이 도전을 중단으로 기록합니다.
				<button class="a-btn ghost small" type="button" onclick={quit}>중단</button>
				<button class="a-btn quiet" type="button" onclick={() => (confirmQuit = false)}>계속하기</button>
			</span>
		{/if}
		<AmbienceControls />
	</div>
</main>
