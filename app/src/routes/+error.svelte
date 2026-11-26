<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n.svelte.ts';

	const title = $derived(page.status === 404 ? t('페이지를 찾을 수 없습니다', 'Page not found') : t('요청 오류', 'Request error'));
</script>

<svelte:head><title>{title} · Matrix</title></svelte:head>

<main class="body">
	<h1>{page.status} · {title}</h1>
	{#if page.error?.message && page.status !== 404}<p>{page.error.message}</p>{/if}
	<a href="/">{t('훈련으로 돌아가기', 'Back to training')}</a>
</main>
