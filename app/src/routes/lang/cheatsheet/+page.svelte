<script lang="ts">
	import CheatSheet from '#lib/CheatSheet.svelte';
	import type { LangCheatData } from '#lib/types.ts';

	let { data }: { data: LangCheatData } = $props();
</script>

<svelte:head><title>치트시트 · Matrix</title></svelte:head>

<div class="body">
	<div class="lang-head">
		<h2 class="lang-h">치트시트</h2>
		<a class="btn ghost" href="/lang">← 목록</a>
	</div>
	<p class="note" style="margin:-12px 0 0">Scala 3 기준 문법 모음입니다. 항목을 누르면 예제가 열립니다.</p>
	<div class="cs-panel"><CheatSheet entries={data.entries} passedBy={data.passedBy} full /></div>
</div>
