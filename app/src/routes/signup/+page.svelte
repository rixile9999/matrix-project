<script lang="ts">
	import type { PageProps } from './$types';
	let {form}: PageProps = $props();
</script>
<svelte:head><title>회원가입 · Matrix</title></svelte:head>
<main class="body">
	<form method="POST" class="setup">
		<h1>회원가입</h1>
		<label class="field">아이디<input name="name" autocomplete="username" required maxlength="64" value={form?.name ?? ''} /><small>영문, 숫자, 점, 밑줄, 하이픈을 사용할 수 있습니다.</small></label>
		<label class="field">비밀번호<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="512" required /><small>12자 이상 입력하세요.</small></label>
		<label class="field">비밀번호 확인<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="512" required /></label>
		{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
		<button class="btn">가입하기</button>
		<a href="/login">로그인으로 돌아가기</a>
	</form>
</main>
