<script lang="ts">
	import '../app.css';
	import LanguageSwitch from '#lib/LanguageSwitch.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Ambience, AmbienceControls } from '#lib/ambience/index.ts';
	import { stage } from '#lib/ambience/stage.svelte.ts';
	import ViewMode from '#lib/ambience/ViewMode.svelte';
	import { afterNavigate } from '$app/navigation';
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
	afterNavigate(() => {
		stage.view = false; // view mode belongs to the page it was opened on
		stage.viewBackdrop = null;
	});
	$effect(() => {
		if (!layer) stage.view = false;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if spar}{@html '<style>html { background: #06070b; color-scheme: dark; } html body { background: transparent; }</style>'}{/if}
</svelte:head>

{#snippet bar()}
	<header class="bar">
		<span class="brand">Matrix</span>
		<nav aria-label={t('메뉴', 'Menu')}>
			<a href="/" class:on={path === '/'} aria-current={path === '/' ? 'page' : undefined}>{t('훈련', 'Training')}</a>
			<a href="/history" class:on={path.startsWith('/history')}>{t('기록', 'History')}</a>
			<a href="/lang" class:on={path === '/lang' || path.startsWith('/lang/')}>{t('언어', 'Scala')}</a>
			<a href="/memo" class:on={path.startsWith('/memo')}>{t('암기', 'Memo')}</a>
			<a href="/stats" class:on={path.startsWith('/stats')}>{t('확률·통계', 'Statistics')}</a>
			<a href="/spar" class:on={path.startsWith('/spar')} aria-current={path.startsWith('/spar') ? 'page' : undefined}>{t('스파링', 'Sparring')}</a>
			<a href="/debrief" class:on={path.startsWith('/debrief')} aria-current={path.startsWith('/debrief') ? 'page' : undefined}>{t('복기', 'Debrief')}</a>
			<a href="/garden" class:on={path.startsWith('/garden')} aria-current={path.startsWith('/garden') ? 'page' : undefined}>{t('정원', 'Garden')}</a>
		</nav>
		<div class="bar-tools">
			<LanguageSwitch />
			<a href="/settings/coach">{t('코치 설정', 'Coach settings')}</a>
			<form method="POST" action="/logout" data-sveltekit-reload><button class="btn ghost small" title={data.accountName ?? undefined}>{data.accountName} · {t('로그아웃', 'Sign out')}</button></form>
			<LookSwitch />
			{#if layer}<button class="view-open" type="button" onclick={() => (stage.view = true)} title={t('배경만 보기', 'View background')}>{t('감상', 'View')}</button>{/if}
			{#if look.value === 'arena' && !spar}<AmbienceControls />{/if}
		</div>
	</header>
{/snippet}

{#if layer}
	<Ambience scene={stage.view ? 'home' : stage.scene} progress={stage.view ? undefined : stage.progress} bloom={stage.bloom} dim={stage.dim} sound={stage.view ? 'full' : stage.sound}
		view={stage.view} viewBackdrop={stage.viewBackdrop} fit={stage.viewFit} />
	{#if stage.view}<ViewMode />{/if}
{/if}

{#if path === '/ambience-demo/desk'}
	{@render children()}
{:else if spar}
	<div class="arena a-app" class:viewing={stage.view} inert={stage.view}>
		{@render bar()}
		{@render children()}
	</div>
{:else}
	<div class="screen" class:wide={path.startsWith('/lang/')} class:viewing={stage.view} inert={stage.view}>
		{#if !focus && path !== '/login' && path !== '/signup'}{@render bar()}{:else}<div class="focus-language"><LanguageSwitch /></div>{/if}
		{@render children()}
	</div>
{/if}

<style>
	.focus-language { display: flex; justify-content: flex-end; padding: .4rem 1rem; }
</style>
