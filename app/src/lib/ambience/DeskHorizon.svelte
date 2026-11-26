<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { settings } from './settings.svelte';
	import { stage } from './stage.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import './desk.css';

	let { active = true, preview = false }: { active?: boolean; preview?: boolean } = $props();
	const reduce = new MediaQuery('prefers-reduced-motion: reduce');
	let movie = $state<HTMLVideoElement>();
	let visible = $state(true);

	onMount(() => {
		if (preview) return;
		stage.desk = true;
		return () => { stage.desk = false; };
	});

	$effect(() => {
		if (!movie) return;
		if (active || reduce.current || !settings.motion || !visible) movie.pause();
		else void movie.play().catch(() => {});
	});
</script>

<svelte:document onvisibilitychange={() => (visible = !document.hidden)} />
<div class:training-horizon={!preview} class:motion-off={!settings.motion}>
	<div class="window" class:active>
		<!-- The still is from this exact shot. Defer the movie until the sky is opened. -->
		{#if preview && (!active || movie)}
			<video bind:this={movie} muted playsinline loop preload="metadata" poster="/video/earthrise-desk.jpg"
				onloadedmetadata={(e) => { e.currentTarget.currentTime = 18; }}>
				<source src="/video/full/earthrise.mp4" type="video/mp4" />
			</video>
		{/if}
		<div class="caption"><span>{t('달 지평선에서 본 지구', 'Earth from the lunar horizon')}</span><small>NASA / GSFC / SVS</small></div>
	</div>
	<div class="lip" aria-hidden="true"><i></i></div>
</div>

<style>
	.window { position: relative; overflow: hidden; height: max(56svh, calc(100svh - 156px)); flex: none; background: #06080a url('/video/earthrise-desk.jpg') center 42% / cover no-repeat; transition: height 420ms cubic-bezier(.22,.7,.2,1); }
	.active.window { height: clamp(132px, 23svh, 220px); }
	video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }
	.window::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 -20px 25px -21px #000; background: linear-gradient(0deg, #070d12a8, transparent 48%); }
	.caption { position: absolute; z-index: 1; bottom: 14px; left: clamp(20px, 5vw, 90px); right: clamp(20px, 5vw, 90px); display: flex; align-items: baseline; justify-content: space-between; gap: 10px; color: #faf8ed; text-shadow: 0 1px 4px #000; font-size: 13px; }
	.caption small { font: 12px var(--f-mono); }
	.lip { position: relative; height: 13px; border-top: 1px solid #abb1a7; border-bottom: 1px solid #070b0e; background: linear-gradient(#5b6665, #3d484a 20%, #354044 68%, #253036 70%); display: grid; place-items: center; }
	.lip::before, .lip::after { content: ''; position: absolute; inset-block: 2px; width: 28px; background: repeating-linear-gradient(110deg, transparent 0 5px, #848d87 6px, #253034 7px); opacity: .6; }
	.lip::before { left: 20px; }
	.lip::after { right: 20px; }
	.lip i { width: 68px; height: 3px; background: #1c2526; border-radius: 3px; box-shadow: 0 1px #737d7a; }
	@media (max-width: 720px) {
		.active.window { height: clamp(110px, 15svh, 145px); }
		.caption { bottom: 8px; }
	}
	@media (prefers-reduced-motion: no-preference) {
		.training-horizon:not(.motion-off) .window { animation: settle 420ms cubic-bezier(.22,.7,.2,1); }
		@keyframes settle { from { height: clamp(170px, 32svh, 320px); } }
	}
	.motion-off .window { transition: none; }
	@media (prefers-reduced-motion: reduce) { .window { transition: none; } }
</style>
