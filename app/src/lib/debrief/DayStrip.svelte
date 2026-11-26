<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	// One day of sessions on a clock: passed, revealed, never finished (dashed), long stretches without a run (hatched); rests labelled.
	import type { Day } from '#lib/types.ts';

	let { day }: { day: Day } = $props();
	const W = 1000;
	const uid = $props.id();
	const range = $derived.by(() => {
		if (!day.sessions.length) return { a: day.start + 9 * 3600, b: day.start + 18 * 3600 };
		const a = Math.min(...day.sessions.map((s) => s.from));
		const b = Math.max(...day.sessions.map((s) => s.to));
		return { a: Math.floor((a - 900) / 1800) * 1800, b: Math.ceil((b + 900) / 1800) * 1800 };
	});
	const X = (t: number) => ((t - range.a) / Math.max(1, range.b - range.a)) * W;
	const clock = (t: number) => {
		const d = new Date(t * 1000);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	};
	const hours = $derived.by(() => {
		const out: number[] = [];
		const span = range.b - range.a;
		const step = span > 10 * 3600 ? 7200 : 3600;
		for (let t = Math.ceil(range.a / step) * step; t <= range.b; t += step) out.push(t);
		return out;
	});
	const restText = (sec: number) => (sec >= 3600 ? `${t('쉼', 'Rest')} ${Math.floor(sec / 3600)}${t('시간', 'h')}${Math.round((sec % 3600) / 60) ? ` ${Math.round((sec % 3600) / 60)}${t('분', 'm')}` : ''}` : `${t('쉼', 'Rest')} ${Math.round(sec / 60)}${t('분', 'm')}`);
	const OUT = $derived({ passed: t('통과', 'Passed'), revealed: t('답 공개', 'Answer revealed'), open: t('끝내지 않음', 'Unfinished'), timeout: t('시간 초과', 'Time expired') } as const);
	const mins = (s: number) => Math.round(s / 60);
</script>

	<svg viewBox="0 0 {W} 150" role="img" aria-label={`${day.date} ${t('세션', 'sessions')} ${day.sessions.length}`}>
	<defs>
		<pattern id="d-{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch" stroke-width="2" /></pattern>
	</defs>
	{#each hours as h (h)}
		<line x1={X(h)} y1="30" x2={X(h)} y2="100" class="grid" />
		{#if X(h) > 24 && X(h) < W - 24}<text x={X(h)} y="120" text-anchor="middle">{clock(h)}</text>{/if}
	{/each}
	<line x1="0" y1="67" x2={W} y2="67" class="track" />
	{#each day.rests as r, i (i)}<text x={(X(r.from) + X(r.to)) / 2} y="22" text-anchor="middle">{restText(r.to - r.from)}</text>{/each}
	{#each day.sessions as s (s.id)}
		{@const x = X(s.from)}
		{@const w = Math.max(3, X(s.to) - x)}
		<rect {x} y="54" width={w} height="26" rx="3" class="s {s.outcome}" class:long={s.silentLong} fill={s.silentLong ? `url(#d-${uid})` : undefined}>
			<title>{clock(s.from)}–{clock(s.to)} · {s.title} · {OUT[s.outcome]} · {typeof s.id === 'string' ? t('제출', 'submissions') : t('실행', 'runs')} {s.runs}{s.silentLong ? ` · ${t('10분 넘게 실행 없음', 'no run for 10+ minutes')}` : ''}</title>
		</rect>
		{#if s.silentLong && w > 70}<text x={x + w / 2} y="98" text-anchor="middle" class="cool">{s.problemId.split('-')[0]} · {mins(s.to - s.from)}{t('분', 'm')} · {typeof s.id === 'string' ? t('제출', 'submissions') : t('실행', 'runs')} {s.runs}</text>{/if}
	{/each}
	<g class="legend">
		<rect x="0" y="136" width="12" height="10" rx="2" class="s passed" /><text x="18" y="145">{t('통과', 'Passed')}</text>
		<rect x="90" y="136" width="12" height="10" rx="2" class="s revealed" /><text x="108" y="145">{t('답 공개', 'Answer revealed')}</text>
		<rect x="190" y="136" width="12" height="10" rx="2" fill="url(#d-{uid})" class="s long" /><text x="208" y="145">{t('10분 넘게 실행 없음', 'No run for 10+ minutes')}</text>
		<rect x="360" y="136" width="12" height="10" rx="2" class="s open" /><text x="378" y="145">{t('끝내지 않음', 'Unfinished')}</text>
		{#if day.sessions.some((s) => s.outcome === 'timeout')}<rect x="490" y="136" width="12" height="10" rx="2" class="s timeout" /><text x="508" y="145">{t('시간 초과', 'Time expired')}</text>{/if}
	</g>
</svg>

<style>
	svg { display: block; width: 100%; height: auto; }
	text { font: 500 11px var(--f-mono); fill: var(--muted); }
	.grid { stroke: var(--line); stroke-opacity: .6; }
	.track { stroke: var(--line); }
	.hatch { stroke: var(--rk-blue); stroke-opacity: .5; }
	.s.passed { fill: var(--ok); fill-opacity: .8; }
	.s.revealed { fill: var(--bad); fill-opacity: .8; }
	.s.timeout { fill: var(--warn); stroke: var(--muted); }
	.s.open { fill: none; stroke: var(--muted); stroke-dasharray: 2 2; }
	.s.long { fill-opacity: 1; stroke: var(--rk-blue); stroke-opacity: .7; }
	.cool { fill: var(--rk-blue); }
</style>
