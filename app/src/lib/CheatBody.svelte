<script lang="ts">
	import { renderInline } from '#lib/inline.ts';
	import type { CheatEntry } from '#lib/core/lang.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { entry }: { entry: CheatEntry } = $props();

	// A line's checked result (`expr // => value`) goes on its own line under the expression,
	// so it stays visible in a narrow panel instead of scrolling off to the right.
	const lines = $derived(
		entry.code.split('\n').map((line) => {
			const m = line.match(/^(\s*)(.*?)\s*\/\/ => (.*)$/);
			return m ? { code: m[1] + m[2], indent: m[1], result: m[3] } : { code: line, indent: '', result: null };
		})
	);
</script>

<pre class="cs-code"><code>{#each lines as l, i (i)}{l.code}{'\n'}{#if l.result !== null}<span class="cs-result">{l.indent}→ {l.result}</span>{'\n'}{/if}{/each}</code></pre>
<p class="cs-text">{@html renderInline(entry.text)}</p>
{#if entry.scala2}<p class="cs-s2">{t('Scala 2에서는:', 'In Scala 2:')} {@html renderInline(entry.scala2)}</p>{/if}
