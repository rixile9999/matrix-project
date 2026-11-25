<script lang="ts">
	// The background picture (video + scrim + canvas scene) and the sound scene, behind the page.
	import { onMount, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import './arena.css';
	import { enable, isReady, setScene as setSoundScene, setVolume } from './audio';
	import { createCanvasScene, type CanvasScene } from './canvasScene';
	import { VIDEO_RATE, VIDEO_SHOW } from './core';
	import { resolveBackdrop, saveSettings, settings } from './settings.svelte';
	import type { Scene } from './types';

	let { scene, progress, bloom }: { scene: Scene; progress?: number; bloom?: number } = $props();

	let layer: HTMLDivElement | undefined = $state();
	let cv: HTMLCanvasElement | undefined = $state();
	let video: HTMLVideoElement | undefined = $state();
	let sc: CanvasScene | undefined = $state.raw();
	let mounted = $state(false); // video is only ever rendered on the client
	let pageVisible = $state(true);
	let onScreen = $state(true);
	let fading = $state(false); // the earthrise does not loop cleanly: it fades out before its end and starts over

	const reduce = new MediaQuery('prefers-reduced-motion: reduce');
	const frozen = $derived(scene === 'still' || !settings.motion || reduce.current);
	const backdrop = $derived(mounted ? resolveBackdrop() : 'none');
	const videoOpacity = $derived(fading ? 0 : VIDEO_SHOW[scene]);

	let raf = 0, last = 0, restartTimer: ReturnType<typeof setTimeout> | undefined;

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}
	function frame(now: number) {
		raf = 0;
		if (!sc) return;
		sc.step((now - last) / 1000 || 0);
		last = now;
		sc.draw();
		if (!frozen && pageVisible && onScreen) raf = requestAnimationFrame(frame);
	}
	function kick() {
		if (!sc) return;
		if (frozen) { stop(); sc.settle(); sc.draw(); } // a settled picture instead of motion
		else if (pageVisible && onScreen) { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
		else stop();
	}

	onMount(() => {
		mounted = true;
		sc = createCanvasScene(cv!);
		sc.resize();
		const ro = new ResizeObserver(() => { sc?.resize(); if (!raf) sc?.draw(); });
		ro.observe(cv!);
		const io = new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; kick(); });
		io.observe(layer!);
		const onVis = () => { pageVisible = !document.hidden; kick(); };
		pageVisible = !document.hidden;
		document.addEventListener('visibilitychange', onVis);
		return () => {
			stop();
			ro.disconnect(); io.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			clearTimeout(restartTimer);
			video?.pause();
		};
	});

	// props -> canvas scene
	$effect(() => {
		if (!sc) return;
		sc.setScene(scene);
		sc.setProgress(progress);
		sc.setOverVideo(backdrop !== 'none');
		kick();
	});
	let lastBloom = untrack(() => bloom);
	$effect(() => {
		const b = bloom;
		if (b === lastBloom) return;
		lastBloom = b;
		if (sc && !frozen) { sc.fireBloom(); kick(); }
	});

	// video: play only when there is motion to show and someone to see it
	$effect(() => {
		const v = video;
		if (!v) return;
		if (!frozen && pageVisible && onScreen) v.play().catch(() => {});
		else v.pause();
	});
	function onMeta(e: Event) {
		const v = e.currentTarget as HTMLVideoElement;
		if (backdrop !== 'none') v.playbackRate = VIDEO_RATE[backdrop];
		fading = false;
		if (frozen) v.currentTime = 0.05; // show one frame
	}
	function onTime(e: Event) {
		const v = e.currentTarget as HTMLVideoElement;
		if (backdrop !== 'earthrise' || !v.duration || fading) return;
		if (v.duration - v.currentTime < 3.2 * v.playbackRate) fading = true;
	}
	function onEnded(e: Event) {
		const v = e.currentTarget as HTMLVideoElement;
		v.currentTime = 0;
		v.play().catch(() => {});
		clearTimeout(restartTimer);
		restartTimer = setTimeout(() => { fading = false; }, 400);
	}

	// sound: the engine is shared and outlives this component
	$effect(() => { setSoundScene(scene); });
	$effect(() => { setVolume(settings.volume); });
	$effect(() => {
		const on = settings.sound;
		if (isReady()) { enable(on); return; }
		if (!on) return;
		// saved as "on" but no gesture yet: browsers only allow audio after one
		const go = () => enable(true);
		const opts = { once: true, capture: true } as const;
		window.addEventListener('pointerdown', go, opts);
		window.addEventListener('keydown', go, opts);
		return () => { window.removeEventListener('pointerdown', go, opts); window.removeEventListener('keydown', go, opts); };
	});
	$effect(() => { saveSettings(); });
</script>

<div class="amb" class:calm={!settings.motion || reduce.current} bind:this={layer} aria-hidden="true">
	{#if backdrop !== 'none'}
		{#key backdrop}
			<video
				bind:this={video}
				src={`/video/${backdrop}.mp4`}
				muted playsinline preload="metadata"
				loop={backdrop !== 'earthrise'}
				style:opacity={videoOpacity}
				onloadedmetadata={onMeta}
				ontimeupdate={onTime}
				onended={onEnded}
			></video>
		{/key}
	{/if}
	<div class="scrim" class:on={backdrop !== 'none'}></div>
	<canvas bind:this={cv}></canvas>
</div>

<style>
	.amb { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: #06070b; pointer-events: none; }
	video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 3s ease; }
	.scrim { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 70% at 50% 50%, rgba(6, 7, 11, .62), rgba(6, 7, 11, 0)); opacity: 0; transition: opacity 3s ease; }
	.scrim.on { opacity: 1; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
	.calm video, .calm .scrim { transition: none; }
</style>
