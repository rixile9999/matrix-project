<script lang="ts">
	import type { PageProps } from './$types';
	import { t } from '#lib/i18n.svelte.ts';
	let {form}: PageProps = $props();
</script>
<svelte:head><title>{t('회원가입 · Matrix', 'Sign up · Matrix')}</title></svelte:head>
<main class="body">
	<form method="POST" class="setup">
		<h1>{t('회원가입', 'Sign up')}</h1>
		<label class="field">{t('아이디', 'Username')}<input name="name" autocomplete="username" required maxlength="64" value={form?.name ?? ''} /><small>{t('영문, 숫자, 점, 밑줄, 하이픈을 사용할 수 있습니다.', 'Letters, numbers, dots, underscores, and hyphens are allowed.')}</small></label>
		<label class="field">{t('비밀번호', 'Password')}<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="512" required /><small>{t('12자 이상 입력하세요.', 'Use at least 12 characters.')}</small></label>
		<label class="field">{t('비밀번호 확인', 'Confirm password')}<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="512" required /></label>
		{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
		<button class="btn">{t('가입하기', 'Create account')}</button>
		<a href="/login">{t('로그인으로 돌아가기', 'Back to login')}</a>
	</form>
</main>
