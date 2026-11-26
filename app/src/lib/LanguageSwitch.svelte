<script lang="ts">
	import { page } from '$app/state';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { t } from './i18n.svelte.ts';

	let busy = $state(false);
	let failed = $state(false);
	async function change(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
		event.preventDefault();
		if (busy) return;
		const form = event.currentTarget;
		const body = new FormData(form);
		busy = true;
		failed = false;
		try {
			const response = await fetch(form.action, { method: 'POST', body, headers: { accept: 'application/json' } });
			if (!response.ok) throw new Error();
			// These sessions carry both versions of their fixed queue; replanning would skip a card.
			if (page.url.pathname === '/memo/review' || page.url.pathname === '/memo/check') await invalidate('matrix:locale');
			else await invalidateAll();
			document.documentElement.lang = String(body.get('locale'));
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<form action="/locale" method="POST" onsubmit={change} class="language-switch">
	<input type="hidden" name="locale" value={page.data.locale === 'ko' ? 'en' : 'ko'} />
	<input type="hidden" name="next" value={page.url.pathname + page.url.search} />
	<button type="submit" class="btn ghost small" disabled={busy} lang={t('en', 'ko')}
		aria-label={t('Switch to English', '한국어로 전환')}>{t('English', '한국어')}</button>
	{#if failed}<span role="alert">{t('언어를 바꾸지 못했습니다. 다시 눌러 주세요.', 'Could not switch languages. Try again.')}</span>{/if}
</form>
