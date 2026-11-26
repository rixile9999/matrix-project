<script lang="ts">
	import { MODES } from '#lib/core/select.ts';
	import { mmss, signed, dateTime } from '#lib/rank.ts';
	import type { HistoryData } from '#lib/types.ts';
	import { t, label } from '#lib/i18n.svelte.ts';

	let { data }: { data: HistoryData } = $props();

	const W = 640, H = 220, L = 44, R = 12, T = 12, B = 24;
	const pts = $derived(data.points);

	const scale = $derived.by(() => {
		if (pts.length === 0) return null;
		const mn = Math.min(...pts.map((p) => p.r - p.rd));
		const mx = Math.max(...pts.map((p) => p.r + p.rd));
		const span = Math.max(mx - mn, 100);
		const step = span > 800 ? 200 : span > 400 ? 100 : span > 200 ? 50 : 25;
		const lo = Math.floor((mn - span * 0.04) / step) * step;
		const hi = Math.ceil((mx + span * 0.04) / step) * step;
		const grid: number[] = [];
		for (let v = lo; v <= hi; v += step) grid.push(v);
		return { lo, hi, grid };
	});

	const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (pts.length - 1));
	const y = (v: number) => (scale ? T + (H - T - B) * (1 - (v - scale.lo) / (scale.hi - scale.lo)) : 0);

	const band = $derived(
		pts.map((p, i) => `${x(i)},${y(p.r + p.rd)}`).concat(pts.map((p, i) => `${x(i)},${y(p.r - p.rd)}`).reverse()).join(' ')
	);
	const line = $derived(pts.map((p, i) => `${x(i)},${y(p.r)}`).join(' '));

	const tags = $derived(data.tags.filter((t) => t.n >= 3));
	const pp = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(Math.round(d * 100))}%p`;
	const barW = (d: number) => Math.min(50, Math.abs(d) * 100);
</script>

<div class="body">
	<div>
		<h3>{t('레이팅 추이', 'Rating history')}</h3>
		{#if pts.length === 0}
			<p class="empty">{t('끝낸 시도가 아직 없습니다. 하나 풀고 나면 추이가 여기에 그려집니다.', 'No completed attempts yet. Solve one to see your trend here.')}</p>
		{:else if scale}
			<div class="chart">
					<svg viewBox="0 0 {W} {H}" role="img" aria-label={t(`레이팅 추이, 최근 ${Math.round(pts[pts.length - 1].r)}`, `Rating history, latest ${Math.round(pts[pts.length - 1].r)}`)}>
					{#each scale.grid as v (v)}
						<line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
						<text x={L - 8} y={y(v) + 4} text-anchor="end" font-size="11" font-family="var(--f-mono)" fill="var(--muted)">{v}</text>
					{/each}
					{#if pts.length > 1}
						<polygon points={band} fill="var(--accent)" opacity=".13" />
						<polyline points={line} fill="none" stroke="var(--accent)" stroke-width="2" />
					{:else}
						<line x1={x(0)} x2={x(0)} y1={y(pts[0].r + pts[0].rd)} y2={y(pts[0].r - pts[0].rd)} stroke="var(--accent)" stroke-width="6" opacity=".2" stroke-linecap="round" />
					{/if}
					<circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].r)} r="4" fill="var(--accent)" />
					<text x={L} y={H - 6} font-size="11" font-family="var(--f-mono)" fill="var(--muted)">{t('첫 시도', 'First')}</text>
					<text x={W - R} y={H - 6} text-anchor="end" font-size="11" font-family="var(--f-mono)" fill="var(--muted)">{t('최근', 'Recent')}</text>
				</svg>
			</div>
			{#if pts.length === 1}<p class="note" style="margin:10px 0 0">{t('시도가 둘 이상이면 선으로 이어집니다.', 'The line appears after more than one attempt.')}</p>{/if}
		{/if}
	</div>

	<div>
		<h3>{t('태그별 편차', 'Tag deviation')}</h3>
		{#if tags.length === 0}
			<p class="empty">{t('3문제 이상 푼 태그가 아직 없습니다.', 'No tags have three or more solved problems yet.')}</p>
		{:else}
			<div class="devs">
				{#each tags as tag (tag.tag)}
					<div class="dev">
						<span>{tag.tag}</span>
						<div class="dev-bar"><b class={tag.deviation < 0 ? 'neg' : 'pos'} style="width:{barW(tag.deviation)}%"></b></div>
						<span class="mono">{pp(tag.deviation)} · {t(`${tag.n}문제`, `${tag.n} problems`)}</span>
					</div>
				{/each}
			</div>
			<p class="note" style="margin:10px 0 0">{t('기대 정답률 대비 실제입니다. 왼쪽(빨강)이 약점이고, 3문제 미만인 태그는 표시하지 않습니다.', 'Actual versus expected solve rate. Left (red) is weaker; tags with fewer than three problems are hidden.')}</p>
		{/if}
	</div>

	<div>
		<h3>{t('끝낸 시도', 'Completed attempts')}</h3>
		{#if data.attempts.length === 0}
			<p class="empty">{t('기록할 시도가 없습니다.', 'No attempts recorded.')}</p>
		{:else}
			<div class="rows">
				{#each data.attempts as a (a.id)}
					{@const d = a.ratingAfter === null ? null : a.ratingAfter - a.ratingBefore}
					<a class="row" href="/attempt/{a.id}" style="color:inherit;text-decoration:none">
						<span class="dot" class:fail={a.outcome !== 'solved'}></span>
						<span class="prob">{a.problem.id} · {a.problem.name}
							<span class="note">{label(MODES[a.mode].label)} · {dateTime(a.startedAt)}</span></span>
						<span class="mono">{a.outcome === 'solved' ? mmss(a.elapsedSec ?? 0) : a.outcome === 'timeout' ? t('시간 초과', 'Time expired') : t('포기', 'Gave up')}</span>
						{#if d !== null}<span class="mono" class:delta-up={d >= 0} class:delta-down={d < 0}>{signed(d)}</span>{:else}<span></span>{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
