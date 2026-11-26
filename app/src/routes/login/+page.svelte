<script lang="ts">
	import type { PageProps } from './$types';
	import { t } from '#lib/i18n.svelte.ts';
	let {form}: PageProps = $props();
</script>
<svelte:head><title>{t('로그인 · Matrix', 'Log in · Matrix')}</title></svelte:head>
<main class="body">
	<form method="POST" class="setup">
		<h1>{t('Matrix 로그인', 'Matrix login')}</h1>
		<label class="field">{t('아이디', 'Username')}<input name="name" autocomplete="username" required maxlength="64" /></label>
		<label class="field">{t('비밀번호', 'Password')}<input name="password" type="password" autocomplete="current-password" required maxlength="512" /></label>
		{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
		<button class="btn">{t('로그인', 'Log in')}</button>
		<a href="/signup">{t('회원가입', 'Sign up')}</a>
	</form>
</main>
