<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	// One pattern note: my own code where it happened, the rule (with my own line), verified examples, one retrieval question, and the way into the deck.
	import { untrack } from 'svelte';
	import { renderInline } from '#lib/inline.ts';
	import type { DebriefNote } from '#lib/types.ts';

	let { note }: { note: DebriefNote } = $props();

	const date = (at: number) => {
		const d = new Date(at * 1000);
		return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	};
	const SHOWN = 3;
	let more = $state(false);
	const evidence = $derived(more ? note.evidence : note.evidence.slice(0, SHOWN));

	// my own line
	let mine = $state('');
	let mineSaved = $state('');
	let mineMsg = $state('');
	$effect(() => {
		const m = note.mine ?? '';
		void note.id;
		untrack(() => {
			mine = m;
			mineSaved = m;
			mineMsg = '';
			picked = null;
			deckMsg = '';
			more = false;
		});
	});
	async function saveMine() {
		if (mine.trim() === mineSaved.trim()) return;
		const r = await fetch('/debrief/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pattern: note.id, text: mine }) });
		const j = (await r.json()) as { ok?: true; error?: string };
		mineMsg = j.ok ? '' : (j.error ?? t('저장하지 못했습니다.', 'Could not save.'));
		if (j.ok) mineSaved = mine;
	}

	// the question: options in an order fixed by the note id (the file keeps the right one first)
	const order = $derived.by(() => {
		const n = note.check?.options.length ?? 0;
		let h = [...note.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
		const idx = [...Array(n).keys()];
		for (let i = n - 1; i > 0; i--) {
			h = (h * 1103515245 + 12345) >>> 0;
			const j = h % (i + 1);
			[idx[i], idx[j]] = [idx[j], idx[i]];
		}
		return idx;
	});
	let picked = $state<number | null>(null);

	let inDeck = $state(false);
	let deckMsg = $state('');
	$effect(() => {
		inDeck = note.inDeck;
	});
	async function addDeck() {
		const r = await fetch('/debrief/deck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pattern: note.id }) });
		const j = (await r.json()) as { ok?: true; error?: string };
		if (j.ok) inDeck = true;
		deckMsg = j.ok ? '' : (j.error ?? t('넣지 못했습니다.', 'Could not add.'));
	}
</script>

<article class="note" id="note-{note.id}" aria-labelledby="nt-{note.id}">
	<h3 id="nt-{note.id}">{@html renderInline(note.title)}</h3>
	<div class="meta mono">
		<span>{note.runs}×</span><span>{date(note.lastAt)}</span>
	</div>

	<div class="block">
		<div class="lab">{t('내 코드', 'My code')}</div>
		{#each evidence as e, i (i)}
			<div class="ev">
				<header><span>{e.title}</span><span>{date(e.at)}</span></header>
				{#if e.kind === 'compile'}
					<pre>{e.source.slice(0, e.caretFrom)}<mark>{e.source.slice(e.caretFrom, e.caretTo)}</mark>{e.source.slice(e.caretTo)}</pre>
					<div class="msg">{e.head}</div>
				{:else}
					<pre>{e.code}</pre>
					<div class="msg fail">{t('실패', 'Failed')}: {e.cases.join(', ')}</div>
				{/if}
			</div>
		{/each}
		{#if note.evidence.length > SHOWN && !more}<button class="more" type="button" onclick={() => (more = true)}>+{note.evidence.length - SHOWN}</button>{/if}
	</div>

	{#if note.questions.length}
		<div class="block">
			<div class="lab">{t('질문', 'Question')}</div>
			<ul class="qs">{#each note.questions as q, i (i)}<li><span class="mono">{q.problemId}</span>{q.text}</li>{/each}</ul>
		</div>
	{/if}

	<div class="block">
		<div class="lab">{t('규칙', 'Rule')}</div>
		<ul class="rule">{#each note.rule as r, i (i)}<li>{@html renderInline(r)}</li>{/each}</ul>
		<label class="mine">
			<span class="sr">{t('내 말로 한 줄', 'One line in my words')}</span>
			<input bind:value={mine} maxlength="200" placeholder={t('내 말로 한 줄', 'One line in my words')} autocomplete="off" onblur={saveMine} onkeydown={(e) => e.key === 'Enter' && saveMine()} />
		</label>
		{#if mineMsg}<small class="hint" aria-live="polite">{mineMsg}</small>{/if}
	</div>

	{#if note.examples.length}
		<div class="block">
		<div class="lab">{t('예', 'Example')}</div>
			<div class="ex">
				{#each note.examples as x, i (i)}<div class="e">{x.expr}</div><div class="v">{x.value}</div>{/each}
			</div>
		</div>
	{/if}

	{#if note.check}
		{@const c = note.check}
		<div class="block">
		<div class="lab">{t('한 문제', 'One check')}</div>
			<div class="check">
				<p>{@html renderInline(c.prompt)}</p>
				<pre>{c.code}</pre>
				<div class="opts">
					{#each order as i (i)}
						<button type="button" class="opt" class:right={picked !== null && i === c.answer} class:wrong={picked === i && i !== c.answer} disabled={picked !== null} onclick={() => (picked = i)}>{c.options[i].text}</button>
					{/each}
				</div>
				{#if picked !== null}
					<p class="why" aria-live="polite">{@html renderInline(picked === c.answer ? c.options[c.answer].why : `${c.options[picked].why} ${t('정답은', 'The answer is')} ${c.options[c.answer].text}.`)}</p>
				{/if}
				<div class="act">
					{#if inDeck}<span class="hint">{t('덱에 있음', 'In deck')}</span>
					{:else if note.note}<button class="btn small" type="button" onclick={addDeck}>{t('덱에 넣기', 'Add to deck')}</button>{#if deckMsg}<span class="hint">{deckMsg}</span>{/if}{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if note.practice.length}
		<div class="block">
			<div class="lab">{t('연습', 'Practice')}</div>
			<div class="prac">
				{#each note.practice as p (p.id)}
					<form method="POST" action="/lang?/start"><input type="hidden" name="problemId" value={p.id} /><button class="chip" type="submit">{p.title}</button></form>
				{/each}
			</div>
		</div>
	{/if}
</article>

<style>
	.note h3 { font: 400 clamp(22px, 3vw, 30px)/1.2 var(--f-display); letter-spacing: -.015em; margin: 0 0 8px; text-wrap: balance; }
	.meta { display: flex; gap: 6px 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
	.block { margin-top: 26px; }
	.lab { font: 500 12px var(--f-mono); letter-spacing: .08em; color: var(--muted); margin-bottom: 10px; display: flex; gap: 10px; align-items: center; }
	.ev { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; margin-bottom: 10px; }
	.ev header { display: flex; justify-content: space-between; gap: 12px; padding: 7px 14px; font: 500 12px var(--f-mono); color: var(--muted); background: color-mix(in srgb, var(--ink) 3%, transparent); flex-wrap: wrap; }
	.ev pre { margin: 0; padding: 11px 14px 4px; overflow-x: auto; font: 13.5px/1.6 var(--f-mono); font-variant-ligatures: none; }
	.ev mark { background: none; color: var(--bad); text-decoration: underline wavy color-mix(in srgb, var(--bad) 75%, transparent); text-underline-offset: 4px; }
	.msg { padding: 2px 14px 11px; font: 12.5px var(--f-mono); color: var(--bad); overflow-wrap: anywhere; }
	.msg.fail { color: var(--warn); }
	.more { font: 500 12px var(--f-mono); color: var(--muted); border: 0; background: none; padding: 4px 0; cursor: pointer; }
	.qs { margin: 0; padding: 0; list-style: none; }
	.qs li { border-top: 1px solid var(--line); padding: 8px 0; font-size: 14px; display: flex; gap: 10px; }
	.qs .mono { color: var(--muted); font-size: 12px; flex: none; padding-top: 2px; }
	.rule { margin: 0; padding-left: 20px; font-size: 16px; line-height: 1.7; max-width: 62ch; }
	.rule li { margin-bottom: 4px; }
	.mine { display: grid; gap: 4px; margin-top: 14px; max-width: 62ch; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.mine input { background: transparent; border: 0; border-bottom: 1px solid var(--line); color: var(--ink); font: 16px var(--f-body); padding: 8px 0; border-radius: 0; }
	.mine input:focus { outline: none; border-bottom-color: var(--accent); }
	.hint { font-size: 13px; color: var(--muted); }
	.ex { border: 1px solid var(--line); border-radius: 12px; display: grid; grid-template-columns: minmax(0, 1fr) auto; overflow-x: auto; }
	.ex div { padding: 7px 14px; font: 13.5px/1.6 var(--f-mono); font-variant-ligatures: none; white-space: pre; border-top: 1px solid var(--line); }
	.ex div:nth-child(-n + 2) { border-top: 0; }
	.ex .v { color: var(--ok); text-align: right; }
	.ex .v::before { content: '⟶  '; color: var(--muted); }
	.check { border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius: 16px; padding: 16px 18px; background: color-mix(in srgb, var(--accent) 4%, transparent); }
	.check p { margin: 0 0 10px; font-size: 15px; }
	.check pre { margin: 0 0 12px; font: 14px var(--f-mono); overflow-x: auto; white-space: pre; }
	.opts { display: flex; flex-wrap: wrap; gap: 8px; }
	.opt { border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 10px; padding: 8px 14px; font: 13.5px var(--f-mono); cursor: pointer; }
	.opt:disabled { cursor: default; }
	.opt.right { border-color: var(--ok); color: var(--ok); }
	.opt.wrong { border-color: var(--bad); color: var(--bad); }
	.why { margin-top: 12px !important; color: var(--muted); font-size: 14px !important; }
	.act { margin-top: 14px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
	.prac { display: flex; flex-wrap: wrap; gap: 8px; }
	.prac form { margin: 0; }
</style>
