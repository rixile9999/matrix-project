<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { MODES } from '#lib/core/select.ts';
	import { rankColor, mmss, signed } from '#lib/rank.ts';
	import type { HomeData } from '#lib/types.ts';

	let { data, form }: { data: HomeData; form: { error?: string } | null } = $props();

	const MIN = 800;
	const MAX = 2400;
	const bands = [
		[1200, 'var(--rk-gray)'],
		[1400, 'var(--rk-green)'],
		[1600, 'var(--rk-cyan)'],
		[1900, 'var(--rk-blue)'],
		[2100, 'var(--rk-violet)'],
		[2400, 'var(--rk-orange)']
	] as const;
	const pct = (v: number) => ((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100;

	const r = $derived(data.rating.r);
	const lo = $derived(Math.max(MIN, r - data.rating.rd));
	const hi = $derived(Math.min(MAX, r + data.rating.rd));
	const diff = $derived(data.cfRating === null ? null : Math.round(r) - data.cfRating);

	let settingUp = $state(false);
	let syncing = $state(false);

	const pending = (set: (v: boolean) => void) => () => {
		set(true);
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			set(false);
		};
	};

	const syncTime = (t: number) => new Date(t * 1000).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<div class="body">
	{#if data.memoDue > 0}<a class="memo-top" href="/memo"><span>오늘 복습 {data.memoDue}장</span><span aria-hidden="true">→</span></a>{/if}
	{#if !data.handle}
		<form class="setup" method="POST" action="?/setHandle" use:enhance={pending((v) => (settingUp = v))}>
			<h2>시작하기</h2>
			<p>Codeforces 핸들을 입력하면 푼 문제를 가져와 레이팅을 계산하고, 맞는 문제를 골라 드립니다.</p>
			<label class="field"><span class="label">핸들</span><input name="handle" required autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
			<label class="field"><span class="label">시작 레이팅 (선택)</span><input name="initialRating" type="number" inputmode="numeric" placeholder="비우면 자동" /></label>
			{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
			<button class="btn" disabled={settingUp}>{settingUp ? '가져오는 중… 몇 초 걸립니다' : '저장하고 동기화'}</button>
		</form>
	{:else}
		<div class="rating">
			<span class="label">연습 레이팅 (CF 척도)</span>
			<div class="rating-row">
				<span class="rating-num" style="color:{rankColor(r)}">{Math.round(r)}</span>
				<span class="rating-rd">± {Math.round(data.rating.rd)}</span>
				{#if data.cfRating !== null && diff !== null}
					<div class="rating-side">
						CF 실전 <b>{data.cfRating}</b><br />
						{#if diff === 0}연습과 같음{:else}연습이 <b>{signed(diff)}</b> {diff > 0 ? '높음' : '낮음'}{/if}
					</div>
				{/if}
			</div>
			<div class="ribbon" role="img" aria-label="레이팅 {Math.round(r)}, 구간 {Math.round(lo)}에서 {Math.round(hi)}">
				{#each bands as [top, color], i (top)}
					<i style="width:{pct(top) - pct(i === 0 ? MIN : bands[i - 1][0])}%;background:{color}"></i>
				{/each}
				<span class="ci" style="left:{pct(lo)}%;width:{pct(hi) - pct(lo)}%"></span>
				<span class="me" style="left:{pct(r)}%"></span>
			</div>
			<div class="ticks"><span>800</span><span>1200</span><span>1600</span><span>2000</span><span>2400</span></div>
		</div>

		<div>
			<h3>오늘의 세션</h3>
			{#if data.offers.length === 0}
				<p class="empty">추천할 문제가 없습니다. 아래에서 동기화해 보세요.</p>
			{:else}
				<div class="offers">
					{#each data.offers as o (o.mode)}
						{@const m = MODES[o.mode]}
						<div class="offer">
							<div class="offer-head"><span class="offer-mode">{m.label}</span><span class="offer-time">{mmss(o.limitSec)}</span></div>
							<span class="offer-desc">{m.desc}</span>
							{#if o.problem}
								<span class="prob">{o.problem.id} · {o.problem.name}</span>
								<div class="meta">
									<span class="rk" style="color:{rankColor(o.problem.rating)}">{o.problem.rating}</span>
									{#if o.pSolve !== null}<span>예상 성공 {Math.round(o.pSolve * 100)}%</span>{/if}
								</div>
								<form method="POST" action="?/start" use:enhance>
									<input type="hidden" name="mode" value={o.mode} />
									<input type="hidden" name="problemId" value={o.problem.id} />
									<button class="btn">시작</button>
								</form>
							{:else}
								<span class="empty">이 구간에 맞는 문제가 없습니다.</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
			<p class="note" style="margin:10px 0 0">
				새로고침하면 다른 문제가 나옵니다. 약점 태그의 문제가 더 자주 뽑힙니다.
				<button class="btn ghost small" type="button" onclick={() => invalidateAll()}>다시 뽑기</button>
			</p>
		</div>

		<div>
			<h3>최근 시도</h3>
			{#if data.recent.length === 0}
				<p class="empty">아직 끝낸 시도가 없습니다. 위에서 세션을 하나 골라 시작하세요.</p>
			{:else}
				<div class="rows">
					{#each data.recent as a (a.id)}
						{@const d = a.ratingAfter === null ? null : a.ratingAfter - a.ratingBefore}
						<a class="row" href="/attempt/{a.id}" style="color:inherit;text-decoration:none">
							<span class="dot" class:fail={a.outcome !== 'solved'}></span>
							<span class="prob">{a.problem.id} · {a.problem.name}</span>
							<span class="mono">{a.outcome === 'solved' ? mmss(a.elapsedSec ?? 0) : a.outcome === 'timeout' ? '시간 초과' : '포기'}</span>
							{#if d !== null}<span class="mono" class:delta-up={d >= 0} class:delta-down={d < 0}>{signed(d)}</span>{:else}<span></span>{/if}
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<form class="sync-line" method="POST" action="?/sync" use:enhance={pending((v) => (syncing = v))}>
			<button class="btn ghost small" disabled={syncing}>{syncing ? '동기화 중…' : '동기화'}</button>
			<span>문제 {data.problemCount.toLocaleString('ko-KR')}개{data.lastSyncAt ? ` · 마지막 ${syncTime(data.lastSyncAt)}` : ' · 아직 동기화 전'}</span>
			<span class="handle">@{data.handle}</span>
		</form>
	{/if}
	<a class="lang-entry memo-entry" href="/memo"><span>암기{data.memoDue > 0 ? ` · 오늘 ${data.memoDue}장` : ''}</span><span class="note">카드로 복습하고 점검하기</span><span aria-hidden="true">→</span></a>
	<a class="lang-entry" href="/lang"><span>언어 5분 · Scala</span><span class="note">짧은 문제로 문법 익히기</span><span aria-hidden="true">→</span></a>
</div>
