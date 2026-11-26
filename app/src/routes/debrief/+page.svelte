<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { renderInline } from '#lib/inline.ts';
	import SessionCard from '#lib/debrief/SessionCard.svelte';
	import NoteView from '#lib/debrief/NoteView.svelte';
	import DayStrip from '#lib/debrief/DayStrip.svelte';
	import Coaching from '#lib/debrief/Coaching.svelte';
	import type { PageProps } from './$types';
	import { referenceUsage } from '#lib/stats/labels.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let { data }: PageProps = $props();

	const notes = $derived(data.notes.filter((n) => n.note));
	const emerging = $derived(data.notes.filter((n) => !n.note));
	// the selected note follows the hash (#note-<id>, also used by the problem page's "노트 보기")
	let sel = $state('');
	$effect(() => {
		const h = page.url.hash.match(/^#note-([\w-]+)$/)?.[1];
		if (h && data.notes.some((n) => n.id === h)) sel = h;
	});
	const current = $derived(data.notes.find((n) => n.id === sel) ?? notes[0] ?? emerging[0] ?? null);
	const maxRuns = $derived(Math.max(1, ...data.notes.map((n) => n.runs)));
	function pick(id: string) {
		sel = id;
		history.replaceState(history.state, '', `#note-${id}`);
	}
	function keys(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		const list = [...notes, ...emerging];
		const i = list.findIndex((n) => n.id === current?.id);
		if (i < 0) return;
		e.preventDefault();
		const n = list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length];
		pick(n.id);
		document.getElementById(`tab-${n.id}`)?.focus();
	}
	const date = (at: number) => {
		const d = new Date(at * 1000);
		return `${d.getMonth() + 1}/${d.getDate()}`;
	};
	const dayLabel = (s: string) => {
		const [, m, d] = s.split('-').map(Number);
		const w = (page.data.locale === 'ko' ? '일월화수목금토' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[new Date(s + 'T12:00:00').getDay()];
		return `${m}${t('월', '/')} ${d}${t('일', '')} (${w})`;
	};
	let recentOpen = $state(0);
	const LABEL = $derived<Record<string, string>>({ sessions: t('세션', 'Sessions'), quick: t('즉시 재실행', 'Quick reruns'), reveal: t('맨손 공개', 'Answer reveal'), silent: t('긴 정적', 'Long silence'), away: t('이탈 / 정지', 'Away / paused'), fatigue: t('1시간 전후', 'Around one hour'), self: t('상태', 'State') });
</script>

<svelte:head><title>Debrief · Matrix</title></svelte:head>

<main class="db">
	<header class="top">
		<h1>Debrief</h1>
		<p class="lead">{t('지나간 세션을 다시 본다.', 'Look back at past sessions.')}</p>
	</header>

	<!-- 01 -->
	<section aria-labelledby="s1">
		<div class="sh"><span class="n">01</span><h2 id="s1">{t('최근 세션', 'Recent sessions')}</h2></div>
		{#if data.recent.length}
			<div class="tabs" role="tablist" aria-label={t('최근 세션', 'Recent sessions')}>
				{#each data.recent as c, i (c.id)}
					<button role="tab" type="button" aria-selected={recentOpen === i} onclick={() => (recentOpen = i)}>
						<b>{c.title}</b><span class="mono">{date(c.startedAt)} · {c.outcome === 'passed' ? t('통과', 'Passed') : t('답 공개', 'Answer revealed')}</span>
					</button>
				{/each}
			</div>
			<div class="panel">
				{#key data.recent[recentOpen]?.id}
					{#if data.recent[recentOpen]}<SessionCard card={data.recent[recentOpen]} askSelf />{/if}
				{/key}
			</div>
		{:else if !data.statsReviews.length}
			<p class="empty">{t('아직 없음.', 'Nothing yet.')}</p>
		{/if}
		{#if data.statsReviews.length}
			<h3>{t('확률과 통계', 'Probability & Statistics')}</h3>
			<ul class="stats-reviews">
				{#each data.statsReviews as run (run.id)}
					<li>
						<a href="/stats/{run.lessonId}?run={run.id}">{t(...run.title)}</a>
						<span>{date(run.endedAt)} · {t(...referenceUsage(run.usedReference))}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 02 -->
	<section aria-labelledby="s2" id="notes">
		<div class="sh"><span class="n">02</span><h2 id="s2">{t('패턴', 'Patterns')}</h2></div>
		{#if current}
			<div class="notes">
				<div class="index" role="tablist" aria-label={t('패턴', 'Patterns')} aria-orientation="vertical" tabindex="-1" onkeydown={keys}>
					{#each notes as n (n.id)}
						<button class="pick" role="tab" id="tab-{n.id}" type="button" aria-selected={current.id === n.id} tabindex={current.id === n.id ? 0 : -1} onclick={() => pick(n.id)}>
							<b>{@html renderInline(n.short.startsWith('_') ? '`_`' + n.short.slice(1) : n.short)}</b>
						<span class="mono">{n.runs}× · {n.problems.length} {t('문제', 'problems')} · {date(n.lastAt)}</span>
							<i class="bar"><i style="width:{(n.runs / maxRuns) * 100}%"></i></i>
						</button>
					{/each}
					{#if emerging.length}
						<p class="sub">{t('한 번', 'Once')}</p>
						{#each emerging as n (n.id)}
							<button class="pick dim" role="tab" id="tab-{n.id}" type="button" aria-selected={current.id === n.id} tabindex={current.id === n.id ? 0 : -1} onclick={() => pick(n.id)}>
								<b>{@html renderInline(n.short.startsWith('_') ? '`_`' + n.short.slice(1) : n.short)}</b>
								<span class="mono">{n.runs}× · {date(n.lastAt)}</span>
							</button>
						{/each}
					{/if}
				</div>
				<div class="panel" role="tabpanel" aria-labelledby="tab-{current.id}">
					{#key current.id}<NoteView note={current} />{/key}
				</div>
			</div>
		{:else}
			<p class="empty">{t('아직 없음.', 'Nothing yet.')}</p>
		{/if}
		{#if data.unknown.length}
			<details class="unknown">
				<summary>{t('미분류', 'Unsorted')} {data.unknown.length}</summary>
				<ul>{#each data.unknown as u, i (i)}<li><code>{u.head}</code><span class="mono">{u.example.problemId}</span></li>{/each}</ul>
			</details>
		{/if}
	</section>

	<!-- 03 -->
	<section aria-labelledby="s3">
		<div class="sh"><span class="n">03</span><h2 id="s3">{t('흔적', 'Traces')}</h2></div>
		<div class="panel">
			{#if data.day}
				<div class="dayhead">
					<b>{dayLabel(data.day.date)}</b>
					{#if data.days.length > 1}
						<label class="mono">{t('날짜', 'Date')}
							<select value={data.day.date} onchange={(e) => goto(`?day=${(e.currentTarget as HTMLSelectElement).value}`, { reset: false, replace: true })}>
								{#each data.days as d (d)}<option value={d}>{dayLabel(d)}</option>{/each}
							</select>
						</label>
					{/if}
				</div>
				<DayStrip day={data.day} />
			{/if}
			<h3 class="wk">{t('7일', '7 days')}</h3>
			<div class="facts">
				{#each data.focus as f (f.id)}
					<div class="fact">
						<span class="lab">{LABEL[f.id] ?? f.label}</span>
						<span class="big" class:none={f.value === null}>{f.value ?? '—'}</span>
						{#if f.before}<p class="before mono">{t('전', 'Before')} {f.before}</p>{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- 04 -->
	<section aria-labelledby="s4">
		<div class="sh"><span class="n">04</span><h2 id="s4">{t('코칭', 'Coaching')}</h2></div>
		<div class="panel"><Coaching {data} /></div>
	</section>
</main>

<style>
	.db { max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: 72px; padding-bottom: 80px; padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px)); }
	h1 { font: 400 clamp(40px, 7vw, 72px)/1 var(--f-display); letter-spacing: -.035em; margin: 8px 0 14px; }
	.lead { color: var(--muted); max-width: 62ch; margin: 0; text-wrap: pretty; }
	.sh { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 4px 18px; margin-bottom: 22px; }
	.sh .n { font: 400 14px var(--f-mono); color: var(--accent); padding-top: 9px; }
	.sh h2 { font: 400 clamp(24px, 3.2vw, 32px)/1.15 var(--f-display); letter-spacing: -.02em; margin: 0; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: clamp(16px, 3vw, 30px); min-width: 0; }
	.empty { color: var(--muted); }
	.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
	.tabs button { border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 12px; padding: 8px 14px; display: grid; gap: 2px; text-align: left; cursor: pointer; font: inherit; }
	.tabs button[aria-selected='true'] { border-color: var(--accent); }
	.tabs b { font-weight: 500; font-size: 14px; }
	.tabs span { font-size: 11.5px; color: var(--muted); }
	.notes { display: grid; grid-template-columns: minmax(0, 290px) minmax(0, 1fr); gap: 24px; align-items: start; }
	@media (max-width: 860px) { .notes { grid-template-columns: minmax(0, 1fr); } }
	.index { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
	@media (max-width: 860px) { .index { position: static; } }
	.pick { text-align: left; border: 0; border-left: 2px solid transparent; background: transparent; color: var(--ink); padding: 12px 14px; border-radius: 12px; display: grid; gap: 4px; cursor: pointer; font: inherit; }
	.pick:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
	.pick[aria-selected='true'] { background: color-mix(in srgb, var(--ink) 5%, transparent); border-left-color: var(--accent); }
	.pick b { font-weight: 500; font-size: 15px; }
	.pick span { font-size: 12px; color: var(--muted); }
	.pick.dim b { color: var(--muted); }
	.bar { display: block; height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; margin-top: 2px; }
	.bar i { display: block; height: 100%; background: var(--accent); opacity: .7; }
	.sub { margin: 14px 14px 2px; font: 500 11.5px var(--f-mono); letter-spacing: .08em; color: var(--muted); }
	.unknown { margin-top: 18px; }
	.unknown summary { cursor: pointer; color: var(--muted); font-size: 14px; }
	.unknown ul { list-style: none; padding: 0; margin: 8px 0 0; }
	.unknown li { border-top: 1px solid var(--line); padding: 8px 0; display: grid; gap: 2px; font-size: 13px; }
	.unknown li span { color: var(--muted); font-size: 12px; }
	.dayhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
	.dayhead b { font-weight: 500; }
	.dayhead select { margin-left: 6px; background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 3px 8px; font: inherit; }
	.dayhead label { font-size: 12px; color: var(--muted); }
	.wk { margin: 26px 0 0; font: 500 12px var(--f-mono); letter-spacing: .08em; color: var(--muted); }
	.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0 26px; margin-top: 8px; }
	.fact { border-top: 1px solid var(--line); padding: 12px 0; min-width: 0; }
	.fact .lab { display: block; font: 500 12px var(--f-mono); color: var(--muted); }
	.big { display: block; font: 400 28px/1.2 var(--f-display); letter-spacing: -.02em; margin-top: 4px; }
	.big.none { color: var(--muted); }
	.fact p { margin: 6px 0 0; font-size: 13.5px; color: var(--muted); text-wrap: pretty; }
	.before { font-size: 12px !important; }
	.stats-reviews { list-style: none; padding: 0; }
	.stats-reviews li { display: flex; align-items: baseline; justify-content: space-between; gap: 4px 16px; flex-wrap: wrap; border-top: 1px solid var(--line); padding: 8px 0; }
	.stats-reviews span { color: var(--muted); font-size: 13px; }
</style>
