<script lang="ts">
	import CheatSheet from '#lib/CheatSheet.svelte';
	import type { LangCheatData } from '#lib/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: { data: LangCheatData } = $props();
</script>

<svelte:head><title>{t('치트시트 · Matrix', 'Cheatsheet · Matrix')}</title></svelte:head>

<div class="body">
	<div class="lang-head">
		<h2 class="lang-h">{t('치트시트', 'Cheatsheet')}</h2>
		<a class="btn ghost" href="/lang">← {t('목록', 'List')}</a>
	</div>
	<p class="note" style="margin:-12px 0 0">{t('Scala 3 기준 문법 모음입니다. 항목을 누르면 예제가 열립니다.', 'A Scala 3 syntax reference. Open an entry to see its example.')}</p>
	<div class="cs-panel"><CheatSheet entries={data.entries} passedBy={data.passedBy} full /></div>
</div>
