<script lang="ts">
	import {BACKENDS,type BackendId} from '#lib/core/coach.ts';
	import type {PageProps} from './$types';
	import { t } from '#lib/i18n.svelte.ts';
	let { data, form }:PageProps=$props();
	const ids=Object.keys(BACKENDS) as BackendId[];
</script>
	<svelte:head><title>{t('코치 연결 · Matrix', 'Coach connection · Matrix')}</title></svelte:head>
<main class="body">
	<h1>{t('코치 연결', 'Coach connection')}</h1>
	<p>{t('질문과 풀이 자료가 선택한 제공자에게 전송됩니다. API 사용료는 등록한 키의 계정에 청구됩니다.', 'Questions and solution materials are sent to the selected provider. API usage is billed to the account linked to your key.')}</p>
	{#if form?.error}<p role="alert">{form.error}</p>{:else if form?.message}<p role="status">{form.message}</p>{/if}
	{#if data.status}
		{#if data.status.allowCli}<p>{t('소유자 계정은 CLI 로그인을 우선 사용합니다. Mac 터미널에서', 'Owner accounts prefer CLI login. In a Mac terminal, run')} <code>DOCKER_CONTEXT=lima-matrix-workers python3 app/scripts/admin.py cli-login codex</code>{t('를 실행하세요. 제공자 이름은 claude, codex, qwen 중에서 고를 수 있습니다.', '. Provider names: claude, codex, or qwen.')}</p>{/if}
		{#each ids as id}
			<form method="POST" class="setup">
				<h2>{BACKENDS[id]}</h2>
				<p>{data.status.providers[id].cli ? t('CLI 로그인 연결됨', 'CLI login connected') : data.status.providers[id].api ? t('API 키 등록됨', 'API key saved') : t('연결 필요', 'Connection needed')}</p>
				<input type="hidden" name="backend" value={id}/>
				<label class="field">{id==='qwen'?t('DashScope 국제 API 키', 'DashScope international API key'):t('API 키', 'API key')}<input name="key" type="password" autocomplete="off" required maxlength="4096"/></label>
				<button class="btn" name="action" value="save">{t('키 저장', 'Save key')}</button>
				{#if data.status.providers[id].api}<button class="btn ghost" name="action" value="remove" formnovalidate>{t('저장된 키 삭제', 'Remove saved key')}</button>{/if}
			</form>
		{/each}
	{:else}<p role="alert">{t('코칭 워커에 연결할 수 없습니다. 잠시 후 새로고침하세요.', 'The coaching worker is unavailable. Refresh shortly.')}</p>{/if}
</main>
