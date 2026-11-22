<script lang="ts">
	import { renderInline } from '#lib/inline.ts';
	import type { CheatEntry } from '#lib/core/lang.ts';

	let { entry }: { entry: CheatEntry } = $props();
</script>

<pre class="cs-code"><code>{entry.code}</code></pre>
<p class="cs-text">{@html renderInline(entry.text)}</p>
{#if entry.scala2}<p class="cs-s2">Scala 2에서는: {@html renderInline(entry.scala2)}</p>{/if}
