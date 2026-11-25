<script lang="ts">
	import type { CompareBlock } from '#lib/core/coach.ts';
	let { block }: { block: CompareBlock } = $props();

	// a line is highlighted when it does not appear (ignoring indentation) on the other side
	const lines = (c: string) => c.replace(/\n$/, '').split('\n');
	const set = (c: string) => new Set(lines(c).map((l) => l.trim()).filter(Boolean));
	const rows = (mine: string, other: string) => {
		const o = set(other);
		return lines(mine).map((l) => ({ l, hl: l.trim() !== '' && !o.has(l.trim()) }));
	};
	const left = $derived(rows(block.left.code, block.right.code));
	const right = $derived(rows(block.right.code, block.left.code));
</script>

<div class="co-viz">
	<div class="co-diff">
		<div>
			<small>{block.left.title}</small>
			<pre class="co-pre">{#each left as r, i (i)}<span class:hl={r.hl}>{r.l}</span>{'\n'}{/each}</pre>
		</div>
		<div>
			<small>{block.right.title}</small>
			<pre class="co-pre">{#each right as r, i (i)}<span class:hl={r.hl}>{r.l}</span>{'\n'}{/each}</pre>
		</div>
	</div>
	<p class="co-hint">달라진 줄만 강조합니다.</p>
</div>
