<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import { MODES } from '#lib/core/select.ts';
	import { rankColor, mmss, signed } from '#lib/rank.ts';
	import type { AttemptData, CheckResponse } from '#lib/types.ts';
	import { t, label } from '#lib/i18n.svelte.ts';

	let { data }: { data: AttemptData } = $props();

	const a = $derived(data.attempt);
	const active = $derived(a.endedAt === null);
	const deadline = $derived(a.startedAt + a.limitSec);

	// server time = Date.now() + skew, skew measured when this data was loaded
	let skew = 0;
	let nowSec = $state(untrack(() => Math.floor(data.now)));
	$effect(() => {
		skew = data.now - Date.now() / 1000;
		nowSec = Math.floor(data.now);
	});
	const remaining = $derived(Math.max(0, deadline - nowSec));
	const progress = $derived(Math.min(100, Math.max(0, ((a.limitSec - remaining) / a.limitSec) * 100)));

	let checkError = $state('');
	let checking = $state(false);
	let confirming = $state(false);
	let zeroChecked = false;
	let timers: ReturnType<typeof setInterval>[] = [];

	async function check() {
		if (checking) return;
		checking = true;
		try {
			const res = await fetch(`/attempt/${a.id}/check`, { method: 'POST' });
			const j = (await res.json()) as CheckResponse;
		checkError = j.error ?? (res.ok ? '' : t(`확인 실패 (${res.status})`, `Check failed (${res.status})`));
			if (j.resolved) await invalidateAll();
		} catch (e) {
			checkError = e instanceof Error ? e.message : String(e);
		} finally {
			checking = false;
		}
	}

	function clear() {
		timers.forEach(clearInterval);
		timers = [];
	}

	$effect(() => {
		if (!active) return;
		zeroChecked = false;
		timers.push(
			setInterval(() => {
				nowSec = Math.floor(Date.now() / 1000 + skew);
				if (!zeroChecked && nowSec >= deadline) {
					zeroChecked = true;
					check();
				}
			}, 250),
			setInterval(check, 20000)
		);
		return clear;
	});
	onDestroy(clear);

	const delta = $derived(a.ratingAfter === null ? 0 : a.ratingAfter - a.ratingBefore);
	const outcomeText = $derived(
		a.outcome === 'solved' ? `${t('해결', 'Solved')} · ${mmss(a.elapsedSec ?? 0)}` : a.outcome === 'timeout' ? t('시간 초과', 'Time expired') : t('포기', 'Gave up')
	);
</script>

<svelte:head><title>{active ? `${mmss(remaining)} · ` : ''}{a.problem.id} · Matrix</title></svelte:head>

<div class="body focus">
	{#if active}
		<span class="label">{label(MODES[a.mode].label)} · <span class="mono rk" style="color:{rankColor(a.problem.rating)}">{a.problem.rating}</span></span>
		<span class="prob" style="font-size:17px">{a.problem.id} · {a.problem.name}</span>
		<span class="timer" role="timer" aria-label={t('남은 시간', 'Time remaining')}>{mmss(remaining)}</span>
		<div class="track"><b style="width:{progress}%"></b></div>
		<div class="actions"><a class="btn" href={a.problem.url} target="_blank" rel="noopener">{t('Codeforces에서 열기', 'Open on Codeforces')} ↗</a></div>
		<span class="status" aria-live="polite">
			<span class="pulse"></span>
			{#if checkError}<span style="color:var(--bad)">{checkError}</span>{:else if checking}{t('확인 중…', 'Checking…')}{:else}{t('제출 확인 중 · 20초마다', 'Checking submission · every 20s')}{/if}
		</span>
		<div class="actions">
			<button class="btn ghost" type="button" onclick={check} disabled={checking}>{t('지금 확인', 'Check now')}</button>
			{#if !confirming}
				<button class="btn ghost" type="button" onclick={() => (confirming = true)}>{t('포기', 'Give up')}</button>
			{/if}
		</div>
		{#if confirming}
			<div class="confirm">
				<span>{t('정말 포기할까요? 실패로 기록됩니다.', 'Give up? This will be recorded as a failure.')}</span>
				<form method="POST" action="?/giveUp" use:enhance>
					<button class="btn danger small">{t('포기하기', 'Give up')}</button>
				</form>
				<button class="btn ghost small" type="button" onclick={() => (confirming = false)}>{t('계속 풀기', 'Keep solving')}</button>
			</div>
		{/if}
	{:else}
		<span class="label">{label(MODES[a.mode].label)} · <span class="mono rk" style="color:{rankColor(a.problem.rating)}">{a.problem.rating}</span></span>
		<span class="prob" style="font-size:17px">{a.problem.id} · {a.problem.name}</span>
		<span class="result-line" style="color:{a.outcome === 'solved' ? 'var(--ok)' : 'var(--bad)'}">{outcomeText}</span>
		{#if a.ratingAfter !== null}
			<span class="shift">
				{Math.round(a.ratingBefore)} → {Math.round(a.ratingAfter)}
				<span class:delta-up={delta >= 0} class:delta-down={delta < 0}>{signed(delta)}</span>
			</span>
		{/if}
		<div class="tags">
				{#each a.problem.tags as tag (tag)}<span class="tag">{tag}</span>{:else}<span class="note">{t('태그 없음', 'No tags')}</span>{/each}
		</div>
		<div class="actions">
			<a class="btn" href="/">{t('다음 세션 고르기', 'Choose next session')}</a>
			<a class="btn ghost" href={a.problem.url} target="_blank" rel="noopener">{t('문제 다시 보기', 'View problem again')} ↗</a>
		</div>
	{/if}
</div>
