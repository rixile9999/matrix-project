<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Ambience, AmbienceControls } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';
	import { stageDefault } from '#lib/ambience/core.ts';
	import LookSwitch from '#lib/LookSwitch.svelte';
	import { look, syncLook } from '#lib/look.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const path = $derived(page.url.pathname);
	const focus = $derived(path.startsWith('/attempt'));
	const spar = $derived(['/spar', '/garden'].some((r) => path === r || path.startsWith(r + '/'))); // Sparring and Garden are always dark: their own wrapper, no card, no light bar
	const demo = $derived(path.startsWith('/ambience-demo')); // the demo mounts its own layer

	onMount(syncLook);

	// One ambience layer for the whole app (the video and the sound keep running across navigation). Light look: none, except under Sparring.
	const layer = $derived(!demo && (look.value === 'arena' || spar));

	// Default stage per route. `pre`: runs before the new page mounts, so a page that sets the stage itself wins.
	function applyDefault(p: string) {
		const d = stageDefault(p);
		if (d.scene) { stage.scene = d.scene; stage.progress = undefined; }
		stage.dim = d.dim;
		stage.sound = d.sound;
	}
	applyDefault(untrack(() => path)); // also during server rendering, so the first paint is already dimmed (no bright flash while the veil fades in)
	$effect.pre(() => applyDefault(path));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if spar}{@html '<style>html { background: #06070b; color-scheme: dark; } html body { background: transparent; }</style>'}{/if}
</svelte:head>

{#snippet bar()}
	<header class="bar">
		<span class="brand">Matrix</span>
		<nav aria-label="메뉴">
			<a href="/" class:on={path === '/'} aria-current={path === '/' ? 'page' : undefined}>훈련</a>
			<a href="/history" class:on={path.startsWith('/history')}>기록</a>
			<a href="/lang" class:on={path === '/lang' || path.startsWith('/lang/')}>언어</a>
			<a href="/memo" class:on={path.startsWith('/memo')}>암기</a>
			<a href="/spar" class:on={path.startsWith('/spar')} aria-current={path.startsWith('/spar') ? 'page' : undefined}>Sparring</a>
			<a href="/debrief" class:on={path.startsWith('/debrief')} aria-current={path.startsWith('/debrief') ? 'page' : undefined}>Debrief</a>
			<a href="/garden" class:on={path.startsWith('/garden')} aria-current={path.startsWith('/garden') ? 'page' : undefined}>Garden</a>
		</nav>
		<div class="bar-tools">
			<a href="/settings/coach">코치 설정</a>
			<form method="POST" action="/logout" data-sveltekit-reload><button class="btn ghost small" title={data.accountName ?? undefined}>{data.accountName} · 로그아웃</button></form>
			<LookSwitch />
			{#if look.value === 'arena' && !spar}<AmbienceControls />{/if}
		</div>
	</header>
{/snippet}

{#if layer}
	<Ambience scene={stage.scene} progress={stage.progress} bloom={stage.bloom} dim={stage.dim} sound={stage.sound} />
{/if}

{#if spar}
	<div class="arena a-app">
		{@render bar()}
		{@render children()}
	</div>
{:else}
	<div class="screen" class:wide={path.startsWith('/lang/')}>
		{#if !focus && path !== '/login' && path !== '/signup'}{@render bar()}{/if}
		{@render children()}
	</div>
{/if}
