<script lang="ts">
	import { settings } from './settings.svelte';
	import { t } from '#lib/i18n.svelte.ts';
</script>

<select aria-label={t('배경음악', 'Background music')} bind:value={settings.track}>
	<option value="patterns">{t('반복과 변주', 'Patterns and variation')}</option>
	<option value="space">{t('긴 쉼', 'Long rest')}</option>
</select>

<style>
	select {
		font: 500 12px var(--f-body, system-ui);
		color: #ecebe6; background: #0b0c11;
		border: 1px solid rgba(236, 235, 230, .22); border-radius: 999px;
		padding: 5px 6px 5px 10px; cursor: pointer;
	}
	select:focus-visible { outline: 2px solid var(--a-warm, #f0cfa6); outline-offset: 2px; }
</style>
