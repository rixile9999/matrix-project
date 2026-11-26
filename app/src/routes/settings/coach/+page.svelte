<script lang="ts">
	import {BACKENDS,type BackendId} from '#lib/core/coach.ts';
	import type {PageProps} from './$types';
	let { data, form }:PageProps=$props();
	const ids=Object.keys(BACKENDS) as BackendId[];
</script>
<svelte:head><title>코치 연결 · Matrix</title></svelte:head>
<main class="body">
	<h1>코치 연결</h1>
	<p>질문과 풀이 자료가 선택한 제공자에게 전송됩니다. API 사용료는 등록한 키의 계정에 청구됩니다.</p>
	{#if form?.error}<p role="alert">{form.error}</p>{:else if form?.message}<p role="status">{form.message}</p>{/if}
	{#if data.status}
		{#if data.status.allowCli}<p>소유자 계정은 CLI 로그인을 우선 사용합니다. Mac 터미널에서 <code>DOCKER_CONTEXT=lima-matrix-workers python3 app/scripts/admin.py cli-login codex</code>를 실행하세요. 제공자 이름은 claude, codex, qwen 중에서 고를 수 있습니다.</p>{/if}
		{#each ids as id}
			<form method="POST" class="setup">
				<h2>{BACKENDS[id]}</h2>
				<p>{data.status.providers[id].cli ? 'CLI 로그인 연결됨' : data.status.providers[id].api ? 'API 키 등록됨' : '연결 필요'}</p>
				<input type="hidden" name="backend" value={id}/>
				<label class="field">{id==='qwen'?'DashScope 국제 API 키':'API 키'}<input name="key" type="password" autocomplete="off" required maxlength="4096"/></label>
				<button class="btn" name="action" value="save">키 저장</button>
				{#if data.status.providers[id].api}<button class="btn ghost" name="action" value="remove" formnovalidate>저장된 키 삭제</button>{/if}
			</form>
		{/each}
	{:else}<p role="alert">코칭 워커에 연결할 수 없습니다. 잠시 후 새로고침하세요.</p>{/if}
</main>
