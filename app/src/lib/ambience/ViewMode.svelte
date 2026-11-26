<script lang="ts">
	// View mode: the page steps aside and the backdrop is shown whole. A thin bar (name, credit, pick, fit, sound, leave)
	// fades after a few still seconds and comes back on any movement. Esc leaves; ← → change the picture.
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import TrackSelect from './TrackSelect.svelte';
	import { enable } from './audio';
	import { resolveBackdrop, saveSettings, settings } from './settings.svelte';
	import { stage } from './stage.svelte';
	import type { Backdrop } from './types';
	import { t } from '#lib/i18n.svelte.ts';

	const LIST: { id: Backdrop; name: string; credit: string }[] = [
		{ id: 'earthrise', name: t('달 지평선', 'Earthrise'), credit: 'NASA/Goddard Space Flight Center Scientific Visualization Studio' },
		{ id: 'blackhole', name: t('블랙홀', 'Black hole'), credit: "NASA's Goddard Space Flight Center/Jeremy Schnittman" },
		{ id: 'earth', name: t('지구', 'Earth'), credit: "NASA's Scientific Visualization Studio" },
		{ id: 'none', name: t('실시간 그림', 'Live drawing'), credit: 'Matrix' }
	];
	const reduce = new MediaQuery('prefers-reduced-motion: reduce');

	let shown = $state(true);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let bar: HTMLDivElement | undefined = $state();
	const current = $derived(LIST.find((x) => x.id === (stage.viewBackdrop ?? resolveBackdrop())) ?? LIST[0]);

	function wake() {
		shown = true;
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (!bar?.matches(':hover, :has(:focus-visible)')) shown = false; // keyboard users keep the bar; a programmatic focus does not
		}, 2600);
	}
	function step(d: number) {
		const i = LIST.findIndex((x) => x.id === current.id);
		stage.viewBackdrop = LIST[(i + d + LIST.length) % LIST.length].id;
		wake();
	}
	function leave() {
		stage.view = false;
		stage.viewBackdrop = null;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	}
	function toggleSound() {
		const on = !settings.sound;
		if (on) enable(true);
		settings.sound = on;
		saveSettings();
	}
	let full = $state(false);
	function toggleFull() {
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}
	function keys(e: KeyboardEvent) {
		if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); leave(); }
		else if (e.target instanceof HTMLSelectElement) wake();
		else if (e.key === 'ArrowRight') step(1);
		else if (e.key === 'ArrowLeft') step(-1);
		else wake();
	}

	onMount(() => {
		wake();
		const fs = () => (full = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', fs);
		bar?.querySelector<HTMLButtonElement>('.leave')?.focus({ preventScroll: true });
		return () => {
			clearTimeout(timer);
			document.removeEventListener('fullscreenchange', fs);
		};
	});
</script>

<svelte:window onkeydown={keys} onpointermove={wake} onpointerdown={wake} />

<div class="vm" class:hide={!shown} role="dialog" aria-modal="true" aria-label={t('배경 감상', 'Backdrop viewer')}>
	<div class="bar" bind:this={bar}>
		<div class="title">
			<b>{current.name}</b>
			<span>{current.credit}</span>
			{#if reduce.current}<span class="note">{t('시스템의 ‘동작 줄이기’ 설정 때문에 멈춘 화면입니다.', 'Paused because your system prefers reduced motion.')}</span>{/if}
		</div>
		<div class="ctl">
			<button type="button" onclick={() => step(-1)} aria-label={t('이전 배경', 'Previous backdrop')}>←</button>
			<button type="button" onclick={() => step(1)} aria-label={t('다음 배경', 'Next backdrop')}>→</button>
			<button type="button" aria-pressed={stage.viewFit === 'cover'} onclick={() => (stage.viewFit = stage.viewFit === 'cover' ? 'contain' : 'cover')}>{stage.viewFit === 'cover' ? t('꽉 채움', 'Fill') : t('전체 보기', 'Fit')}</button>
			<button type="button" aria-pressed={settings.sound} onclick={toggleSound}>{t('소리', 'Sound')} {settings.sound ? t('켬', 'On') : t('끔', 'Off')}</button>
			<TrackSelect />
			<button type="button" aria-pressed={full} onclick={toggleFull}>{t('전체 화면', 'Fullscreen')}</button>
			<button type="button" class="leave" onclick={leave}>{t('돌아가기', 'Back')} <kbd>Esc</kbd></button>
		</div>
	</div>
</div>

<style>
	.vm { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
	.vm.hide { cursor: none; pointer-events: auto; }
	.bar {
		position: absolute; left: 0; right: 0; bottom: 0; pointer-events: auto;
		display: flex; justify-content: space-between; align-items: flex-end; gap: 12px 20px; flex-wrap: wrap;
		padding: 48px max(20px, env(safe-area-inset-right, 0px)) max(18px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px));
		background: linear-gradient(to top, rgba(0, 0, 0, .62), rgba(0, 0, 0, 0));
		color: #ecebe6; transition: opacity .8s ease;
	}
	.hide .bar { opacity: 0; }
	.title { display: grid; gap: 2px; min-width: 0; }
	.title b { font: 400 22px/1.2 var(--f-display, system-ui); letter-spacing: -.01em; }
	.title span { font: 500 11.5px var(--f-mono, monospace); color: rgba(236, 235, 230, .62); }
	.title .note { color: #f0cfa6; }
	.ctl { display: flex; gap: 6px; flex-wrap: wrap; }
	button {
		font: 500 12.5px var(--f-body, system-ui); color: #ecebe6; background: rgba(6, 7, 11, .35); backdrop-filter: blur(6px);
		border: 1px solid rgba(236, 235, 230, .22); border-radius: 999px; padding: 6px 13px; cursor: pointer;
	}
	button[aria-pressed='true'] { border-color: #f0cfa6; color: #f0cfa6; }
	button:focus-visible { outline: 2px solid #f0cfa6; outline-offset: 2px; }
	kbd { font: 500 10.5px var(--f-mono, monospace); opacity: .6; margin-left: 4px; }
	@media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
