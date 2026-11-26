<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { renderInline } from '#lib/inline.ts';
	import SessionCard from '#lib/debrief/SessionCard.svelte';
	import NoteView from '#lib/debrief/NoteView.svelte';
	import DayStrip from '#lib/debrief/DayStrip.svelte';
	import Coaching from '#lib/debrief/Coaching.svelte';
	import type { DebriefData } from '#lib/types.ts';

	let { data }: { data: DebriefData } = $props();

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
		const w = '일월화수목금토'[new Date(s + 'T12:00:00').getDay()];
		return `${m}월 ${d}일 (${w})`;
	};
	let recentOpen = $state(0);
</script>

<svelte:head><title>Debrief · Matrix</title></svelte:head>

<main class="db">
	<header class="top">
		<h1>Debrief</h1>
		<p class="lead">풀이 기록을 다시 읽는 방입니다. 틀린 코드에서 반복되는 실수를 노트로 묶고, 시간 기록에서 집중의 흔적을 보여 줍니다. 점수는 매기지 않습니다. 모든 문장은 어느 기록에서 나왔는지 따라가 볼 수 있습니다.</p>
	</header>

	<!-- 01 -->
	<section aria-labelledby="s1">
		<div class="sh"><span class="n">01</span><h2 id="s1">최근 세션</h2><p>문제를 끝낸 직후 결과 화면에도 같은 줄이 나옵니다. 실행·조회·힌트가 시간 위에 찍히고, 눈여겨볼 점만 남깁니다.</p></div>
		{#if data.recent.length}
			<div class="tabs" role="tablist" aria-label="최근 세션">
				{#each data.recent as c, i (c.id)}
					<button role="tab" type="button" aria-selected={recentOpen === i} onclick={() => (recentOpen = i)}>
						<b>{c.title}</b><span class="mono">{date(c.startedAt)} · {c.outcome === 'passed' ? '통과' : '답 공개'}</span>
					</button>
				{/each}
			</div>
			<div class="panel">
				{#key data.recent[recentOpen]?.id}
					{#if data.recent[recentOpen]}<SessionCard card={data.recent[recentOpen]} askSelf />{/if}
				{/key}
			</div>
		{:else}
			<p class="empty">끝낸 세션이 아직 없습니다. 언어 탭에서 문제를 하나 풀면 여기에 나타납니다.</p>
		{/if}
	</section>

	<!-- 02 -->
	<section aria-labelledby="s2" id="notes">
		<div class="sh"><span class="n">02</span><h2 id="s2">패턴 노트</h2><p>컴파일 오류와 실패한 테스트를 검증된 규칙표로 분류해, 두 세션 이상(또는 한 세션에서 세 번 이상) 반복된 것만 노트로 만듭니다. 규칙의 예제 값은 실제로 실행해 확인한 것이고, 노트는 인출 한 문제로 끝납니다.</p></div>
		{#if current}
			<div class="notes">
				<div class="index" role="tablist" aria-label="패턴" aria-orientation="vertical" tabindex="-1" onkeydown={keys}>
					{#each notes as n (n.id)}
						<button class="pick" role="tab" id="tab-{n.id}" type="button" aria-selected={current.id === n.id} tabindex={current.id === n.id ? 0 : -1} onclick={() => pick(n.id)}>
							<b>{@html renderInline(n.short.startsWith('_') ? '`_`' + n.short.slice(1) : n.short)}</b>
							<span class="mono">{n.runs}번 · {n.problems.length}문제 · {date(n.lastAt)}</span>
							<i class="bar"><i style="width:{(n.runs / maxRuns) * 100}%"></i></i>
						</button>
					{/each}
					{#if emerging.length}
						<p class="sub">아직 한 번뿐</p>
						{#each emerging as n (n.id)}
							<button class="pick dim" role="tab" id="tab-{n.id}" type="button" aria-selected={current.id === n.id} tabindex={current.id === n.id ? 0 : -1} onclick={() => pick(n.id)}>
								<b>{@html renderInline(n.short.startsWith('_') ? '`_`' + n.short.slice(1) : n.short)}</b>
								<span class="mono">{n.runs}번 · {date(n.lastAt)}</span>
							</button>
						{/each}
					{/if}
					<p class="foot">한 번뿐인 실수(오타 등)는 노트가 되지 않습니다.</p>
				</div>
				<div class="panel" role="tabpanel" aria-labelledby="tab-{current.id}">
					{#key current.id}<NoteView note={current} />{/key}
				</div>
			</div>
		{:else}
			<p class="empty">아직 규칙표에 걸린 실수가 없습니다. 실수가 반복되면 여기에 노트가 생깁니다.</p>
		{/if}
		{#if data.unknown.length}
			<details class="unknown">
				<summary>규칙표에 없는 반복 오류 {data.unknown.length}개</summary>
				<p class="note">두 세션 이상 나왔지만 아직 분류 규칙이 없는 컴파일 오류입니다. 규칙은 검증을 거쳐 추가합니다.</p>
				<ul>{#each data.unknown as u, i (i)}<li><code>{u.head}</code><span class="mono">{u.runs}번 · 세션 {u.sessions}개 · 예: {u.example.problemId}</span></li>{/each}</ul>
			</details>
		{/if}
	</section>

	<!-- 03 -->
	<section aria-labelledby="s3">
		<div class="sh"><span class="n">03</span><h2 id="s3">집중의 흔적</h2><p>집중력 자체는 잴 수 없습니다. 대신 흔적이 남습니다. 숫자 하나로 합치지 않고 그대로 보여 주며, 비교 대상은 지난주의 나입니다.</p></div>
		<div class="panel">
			{#if data.day}
				<div class="dayhead">
					<b>{dayLabel(data.day.date)}</b>
					{#if data.days.length > 1}
						<label class="mono">날짜
							<select value={data.day.date} onchange={(e) => goto(`?day=${(e.currentTarget as HTMLSelectElement).value}`, { reset: false, replace: true })}>
								{#each data.days as d (d)}<option value={d}>{dayLabel(d)}</option>{/each}
							</select>
						</label>
					{/if}
				</div>
				<DayStrip day={data.day} />
			{/if}
			<h3 class="wk">최근 7일</h3>
			<div class="facts">
				{#each data.focus as f (f.id)}
					<div class="fact">
						<span class="lab">{f.label}</span>
						{#if f.value !== null}
							<span class="big">{f.value}</span>
							{#if f.detail}<p>{f.detail}</p>{/if}
							{#if f.before}<p class="before mono">그 전 7일 {f.before}</p>{/if}
						{:else}
							<span class="big none">—</span>
							<p>{f.need}</p>
						{/if}
					</div>
				{/each}
			</div>
			<div class="two">
				<div class="list">
					<h4>기록하는 것</h4>
					<ul>
						<li>탭을 떠난 시간<span>문제 화면이 가려진 구간의 시작과 끝.</span></li>
						<li>입력이 멈춘 시간<span>타이머가 도는 동안 60초 넘게 키·클릭·스크롤이 없던 구간. 무엇을 입력했는지는 남기지 않습니다.</span></li>
						<li>세션 직후 자기 보고<span>또렷·보통·흐림 한 번 누르기. 선택 사항입니다.</span></li>
					</ul>
				</div>
				<div class="list no">
					<h4>하지 않는 것</h4>
					<ul><li>집중력 점수, 등급, 연속 기록</li><li>카메라, 마이크, 다른 앱 감시</li><li>남과 비교</li><li>“집중을 못 했다” 같은 판정</li></ul>
				</div>
			</div>
		</div>
	</section>

	<!-- 04 -->
	<section aria-labelledby="s4">
		<div class="sh"><span class="n">04</span><h2 id="s4">코칭</h2><p>요청할 때만 씁니다. Operator는 위의 사실만 받고, 문장마다 근거를 달아야 저장됩니다. 다음에 해 볼 일은 고르지 않아도 됩니다.</p></div>
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
	.sh p { grid-column: 2; margin: 0; color: var(--muted); max-width: 64ch; text-wrap: pretty; }
	@media (max-width: 640px) { .sh { grid-template-columns: minmax(0, 1fr); } .sh p { grid-column: 1; } }
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
	.foot { font-size: 12.5px; color: var(--muted); padding: 10px 14px; margin: 0; }
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
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-top: 24px; }
	.list h4 { font: 500 14px var(--f-body); margin: 0 0 8px; }
	.list ul { list-style: none; margin: 0; padding: 0; }
	.list li { border-top: 1px solid var(--line); padding: 9px 0; font-size: 14px; display: grid; gap: 2px; }
	.list li span { color: var(--muted); font-size: 13px; }
	.list.no li { display: block; }
	.list.no li::before { content: '—  '; color: var(--muted); }
</style>
