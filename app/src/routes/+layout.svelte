<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const path = $derived(page.url.pathname);
	const focus = $derived(path.startsWith('/attempt'));
	const arena = $derived(path === '/spar' || path.startsWith('/spar/')); // dark Sparring look: no card, no light bar
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if arena}{@html '<style>html { background: #06070b; color-scheme: dark; } html body { background: transparent; }</style>'}{/if}
</svelte:head>

{#if arena}
	<div class="arena a-app">
		<header class="a-nav">
			<span class="a-brand">Matrix</span>
			<nav aria-label="메뉴">
				<a href="/">훈련</a>
				<a href="/history">기록</a>
				<a href="/lang">언어</a>
				<a href="/memo">암기</a>
				<a href="/spar" class="on" aria-current="page">Sparring</a>
			</nav>
		</header>
		{@render children()}
	</div>
{:else}
<div class="screen" class:wide={path.startsWith('/lang/')}>
	{#if !focus}
		<div class="bar">
			<span class="brand">Matrix</span>
			<nav>
				<a href="/" class:on={path === '/'}>훈련</a>
				<a href="/history" class:on={path.startsWith('/history')}>기록</a>
				<a href="/lang" class:on={path === '/lang' || path.startsWith('/lang/')}>언어</a>
				<a href="/memo" class:on={path.startsWith('/memo')}>암기</a>
				<a href="/spar">Sparring</a>
			</nav>
		</div>
	{/if}
	{@render children()}
</div>
{/if}
