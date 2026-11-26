<script lang="ts">
	import type { PageProps } from './$types';
	let {form}: PageProps = $props();
</script>
<svelte:head><title>로그인 · Matrix</title></svelte:head>
<main class="body">
	<form method="POST" class="setup">
		<h1>Matrix 로그인</h1>
		<label class="field">아이디<input name="name" autocomplete="username" required maxlength="64" /></label>
		<label class="field">비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="512" /></label>
		{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
		<button class="btn">로그인</button>
		<a href="/signup">회원가입</a>
	</form>
</main>
