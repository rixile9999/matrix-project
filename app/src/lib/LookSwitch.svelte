<script lang="ts">
	// Switch between the two looks. The label names the look you get by pressing it.
	import { t } from './i18n.svelte.ts';
	import { look, setLook } from '#lib/look.svelte.ts';
	const to = $derived(look.value === 'arena' ? 'light' : 'arena');
</script>

<button class="look-switch" type="button" onclick={() => setLook(to)}>{to === 'light' ? t('밝은 화면', 'Light theme') : t('어두운 화면', 'Dark theme')}</button>
