<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const path = $derived(page.url.pathname);
	const focus = $derived(path.startsWith('/attempt'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="screen" class:wide={path.startsWith('/lang/')}>
	{#if !focus}
		<div class="bar">
			<span class="brand">Matrix</span>
			<nav>
				<a href="/" class:on={path === '/'}>훈련</a>
				<a href="/history" class:on={path.startsWith('/history')}>기록</a>
				<a href="/lang" class:on={path === '/lang' || path.startsWith('/lang/')}>언어</a>
			</nav>
		</div>
	{/if}
	{@render children()}
</div>
