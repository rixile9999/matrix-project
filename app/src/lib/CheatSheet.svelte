<script lang="ts">
	import { tick, untrack } from 'svelte';
	import CheatBody from '#lib/CheatBody.svelte';
	import { TOPICS, type CheatEntry, type TopicId } from '#lib/core/lang.ts';
	import { t, label } from '#lib/i18n.svelte.ts';

	type Link = { id: string; title: string };
	let {
		entries,
		full = false,
		passedBy = {},
		reveal = null,
		onopen
	}: {
		entries: CheatEntry[];
		full?: boolean; // full page: every topic starts expanded
		passedBy?: Record<string, Link[]>; // entry id -> passed problems that use it
		reveal?: { id: string; n: number } | null; // open and scroll to this entry (n changes to re-trigger)
		onopen?: (entryId: string) => void; // an entry was expanded by the user
	} = $props();

	let query = $state('');
	let search: HTMLInputElement | undefined;
	let openTopics = $state(new Set<string>(untrack(() => (full ? Object.keys(TOPICS) : []))));
	let openEntries = $state(new Set<string>());

	export async function focusSearch() {
		await tick();
		search?.focus();
		search?.select();
	}

	const q = $derived(query.trim().toLowerCase());
	const matches = (e: CheatEntry) => !q || [e.id, e.title, e.text, e.code].some((t) => t.toLowerCase().includes(q));
	// only topics that have written entries; searching shows matches only
	const groups = $derived(
		(Object.keys(TOPICS) as TopicId[])
			.map((topic) => ({ topic, items: entries.filter((e) => e.topic === topic && matches(e)) }))
			.filter((g) => g.items.length)
	);
	const firstLine = (code: string) => code.split('\n').find((l) => l.trim()) ?? '';

	function toggle(set: Set<string>, key: string) {
		const next = new Set(set);
		if (!next.delete(key)) next.add(key);
		return next;
	}
	function toggleEntry(e: CheatEntry) {
		if (!openEntries.has(e.id)) onopen?.(e.id);
		openEntries = toggle(openEntries, e.id);
	}

	let seen = 0;
	$effect(() => {
		const r = reveal;
		if (!r || r.n === seen) return;
		seen = r.n;
		const e = untrack(() => entries.find((x) => x.id === r.id));
		if (!e) return;
		untrack(() => {
			query = '';
			openTopics = new Set(openTopics).add(e.topic);
			if (!openEntries.has(e.id)) onopen?.(e.id);
			openEntries = new Set(openEntries).add(e.id);
		});
		tick().then(() => document.getElementById(`ce-${e.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
	});
</script>

<div class="cs">
	<input class="cs-search" type="search" placeholder={t('치트시트 검색', 'Search cheatsheet')} aria-label={t('치트시트 검색', 'Search cheatsheet')} bind:value={query} bind:this={search} />
	{#if entries.length === 0}
		<p class="empty">{t('아직 작성된 항목이 없습니다.', 'No entries yet.')}</p>
	{:else if groups.length === 0}
		<p class="empty">{t('검색 결과가 없습니다.', 'No results found.')}</p>
	{/if}
	{#each groups as g (g.topic)}
		{@const open = q !== '' || openTopics.has(g.topic)}
		<section class="cs-group">
			<button class="cs-topic" type="button" aria-expanded={open} onclick={() => (openTopics = toggle(openTopics, g.topic))}>
				<span class="cs-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>{label(TOPICS[g.topic])}<span class="note">{g.items.length}</span>
			</button>
			{#if open}
				{#each g.items as e (e.id)}
					{@const isOpen = openEntries.has(e.id)}
					<div class="cs-entry" id="ce-{e.id}">
						<button class="cs-head" type="button" aria-expanded={isOpen} onclick={() => toggleEntry(e)}>
							<span class="cs-title">{e.title}</span>
							{#if !isOpen}<code class="cs-peek">{firstLine(e.code)}</code>{/if}
						</button>
						{#if isOpen}
							<CheatBody entry={e} />
							{#if passedBy[e.id]?.length}
								<p class="cs-used note">{t('이 문법을 쓰는 문제:', 'Problems using this syntax:')} {#each passedBy[e.id] as p, i (p.id)}{i ? ', ' : ''}<a href="/lang/{p.id}">{p.title}</a>{/each}</p>
							{/if}
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	{/each}
</div>
