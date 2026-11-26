<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { mmss } from '#lib/rank.ts';
	import { LEVELS } from '#lib/core/lang.ts';
	import type { LangHomeData, LangKind, MemoRedo } from '#lib/types.ts';
	import { t, label } from '#lib/i18n.svelte.ts';

	let { data, form }: { data: LangHomeData & { redo: MemoRedo[] }; form: { error?: string } | null } = $props();

	const total = $derived(data.levels.reduce((n, l) => n + l.total, 0));

		// Book problems are off by default and remembered in localStorage.
	const KEY = 'lang.showBook';
	let showBook = $state(false);
	onMount(() => {
		try {
			showBook = localStorage.getItem(KEY) === '1';
		} catch {}
	});
	function toggleBook(on: boolean) {
		showBook = on;
		try {
			localStorage.setItem(KEY, on ? '1' : '0');
		} catch {}
	}
	const hasBookItems = $derived(data.topics.some((t) => t.levels.some((l) => l.some((p) => p.book))));
	const shown = $derived(
		data.topics
			.map((t) => ({ ...t, levels: t.levels.map((l) => l.filter((p) => showBook || !p.book)) }))
			.filter((t) => t.levels.some((l) => l.length))
	);
	const statusLabel = (status: 'new' | 'attempted' | 'passed') => status === 'new' ? t('새 문제', 'New') : status === 'attempted' ? t('푸는 중', 'In progress') : t('통과', 'Passed');
	const kindLabel = (kind: LangKind) => kind === 'write' ? '' : kind === 'fix' ? t('버그 수정', 'Fix bug') : kind === 'refactor' ? t('리팩터링', 'Refactor') : t('완성', 'Complete');
</script>

<svelte:head><title>{t('언어 · Matrix', 'Language · Matrix')}</title></svelte:head>

<div class="body">
	<div class="lang-head">
		<h2 class="lang-h">Scala</h2>
		<span class="grow"></span>
		<a class="btn ghost" href="/lang/cheatsheet">{t('치트시트', 'Cheatsheet')}</a>
	</div>
	{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
	{#if data.redo.length > 0}
		<div>
			<h3>{t('다시 풀기', 'Try again')} <a class="note" href="/memo">{t('암기', 'Memo')}</a></h3>
			<div class="m-redo compact">
				{#each data.redo as r (r.problemId)}<a href="/lang/{r.problemId}">{r.title}<small>{t(`${r.cardTitle} 카드를 두 번 연속 놓쳤습니다`, `Missed the ${r.cardTitle} card twice in a row`)}</small></a>{/each}
			</div>
		</div>
	{/if}

	{#if total === 0 && data.topics.length === 0 && data.books.length === 0}
		<p class="empty">{t('문제가 없습니다.', 'No problems yet.')}</p>
	{:else}
		{#if total > 0}
		<div class="lang-levels">
			{#each data.levels as l (l.level)}
				<div class="lang-progress">
					<span class="label">{l.label}</span>
					<span><b>{l.passed}</b> <span class="mono" style="color:var(--muted)">/ {l.total}</span></span>
					<div class="track" role="img" aria-label={t(`${l.label} ${l.total}문제 중 ${l.passed}문제 통과`, `${l.passed} of ${l.total} ${l.label} problems passed`)}><b style="width:{l.total ? (l.passed / l.total) * 100 : 0}%"></b></div>
				</div>
			{/each}
		</div>

		{/if}

		{#if data.suggestions.length}
			<div class="lang-sug">
				{#each data.suggestions as s (s.key)}
					<form method="POST" action="?/start" use:enhance>
						<input type="hidden" name="problemId" value={s.problemId} />
						<button class="sug" class:main={s.key === 'continue'}>
							<span class="label">{s.label}</span>
							<span class="sug-t">{s.title}</span>
						</button>
					</form>
				{/each}
			</div>
		{/if}

		{#if data.books.length}
			<div class="lang-col" style="gap:10px">
				<h3 style="margin:0">{t('책', 'Books')}</h3>
				<div class="lang-books">
					{#each data.books as b (b.id)}
						<a class="bk-card" href="/lang/book/{b.id}">
							<b class="bk-name">{b.title}</b>
							<span>{#if b.total}<b>{b.passed}</b> <span class="mono" style="color:var(--muted)">/ {b.total}</span>{:else}<span class="note">{t('준비 중', 'Coming soon')}</span>{/if}</span>
						<div class="track" role="img" aria-label={t(`${b.title} ${b.total}문제 중 ${b.passed}문제 통과`, `${b.passed} of ${b.total} ${b.title} problems passed`)}><b style="width:{b.total ? (b.passed / b.total) * 100 : 0}%"></b></div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if hasBookItems}
			<label class="lt-filter"><input type="checkbox" checked={showBook} onchange={(e) => toggleBook(e.currentTarget.checked)} /> {t('책 문제 포함', 'Include book problems')}</label>
		{/if}

		<div class="lt">
			<div class="lt-row lt-top" aria-hidden="true">
				<span></span>{#each [1, 2, 3] as lv (lv)}<span class="label">{label(LEVELS[lv as 1 | 2 | 3])}</span>{/each}
			</div>
			{#each shown as topic (topic.topic)}
				<div class="lt-row">
					<h3 class="lt-topic">{topic.label}</h3>
					{#each topic.levels as items, i (i)}
						<div class="lt-cell" class:none={items.length === 0} data-level={label(LEVELS[(i + 1) as 1 | 2 | 3])}>
							{#each items as p (p.id)}
								<form method="POST" action="?/start" use:enhance>
									<input type="hidden" name="problemId" value={p.id} />
									<button class="li" aria-label={t(`${p.title} 시작`, `Start ${p.title}`)}>
										<span class="li-t">{p.title}</span>
										<span class="li-m">
											<span class="mono st">{mmss(p.limitSec)}</span>
									{#if p.book}<span class="kind book">{t(`책 ${p.book.exercise}`, `Book ${p.book.exercise}`)}</span>{/if}
										{#if kindLabel(p.kind)}<span class="kind">{kindLabel(p.kind)}</span>{/if}
										<span class="st" class:passed={p.status === 'passed'}>{statusLabel(p.status)}{#if p.bestSec !== null}<span class="mono"> · {mmss(p.bestSec)}</span>{/if}</span>
											{#if p.status === 'passed' && p.clean}<span class="clean">clean</span>{/if}
										</span>
									</button>
								</form>
							{/each}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
