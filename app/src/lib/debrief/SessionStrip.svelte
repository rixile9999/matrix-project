<script lang="ts">
	// One session on its own clock: runs (✕ failed, ● passed), lookups (◆), hints (▲), and the stretches the page saw
	// (other tab: hatched, no input: dotted). The longest silence is labelled. Marks show their detail on hover, focus or tap.
	import type { Strip } from '#lib/types.ts';

	let { strip }: { strip: Strip } = $props();

	const W = 800, Y = 46, PAD = 14;
	const X = $derived((t: number) => PAD + (Math.min(t, strip.length) / Math.max(1, strip.length)) * (W - 2 * PAD));
	const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
	const minSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분${Math.round(s % 60) ? ` ${Math.round(s % 60)}초` : ''}` : `${Math.round(s)}초`);
	const uid = $props.id();

	type Tip = { x: number; head: string; body: string };
	let tip = $state<Tip | null>(null);
	let wrap: HTMLDivElement | undefined = $state();
	let svg: SVGSVGElement | undefined = $state();
	let tipStyle = $state('');
	function show(t: Tip) {
		tip = t;
		if (!wrap || !svg) return;
		const b = svg.getBoundingClientRect();
		const w = wrap.getBoundingClientRect();
		tipStyle = `left:${b.left - w.left + (t.x / W) * b.width}px;top:${b.top - w.top + ((Y - 14) / 96) * b.height}px`;
	}
	const label = (m: Strip['marks'][number]) =>
		m.kind === 'run' ? { head: `${mmss(m.t)} · ${m.status === 'passed' ? '통과' : m.status === 'compile_error' ? '컴파일 오류' : m.status === 'failed' ? '실패' : '시간 초과'}`, body: m.status === 'passed' ? '' : m.head }
			: m.kind === 'lookup' ? { head: `${mmss(m.t)} · 치트시트 조회`, body: '' } : { head: `${mmss(m.t)} · 힌트`, body: '' };
	const spoken = $derived(
		strip.marks.map((m) => { const l = label(m); return l.head + (l.body ? ` ${l.body}` : ''); }).join(', ') || '실행 없음'
	);
	const silentText = $derived(strip.silent ? `${minSec(strip.silent.to - strip.silent.from)} · 실행 없음` : '');
	const ticks = $derived.by(() => {
		const step = strip.length > 1800 ? 600 : strip.length > 600 ? 300 : 120;
		const out: number[] = [];
		for (let t = step; t < strip.length - step * 0.4; t += step) out.push(t);
		return out;
	});
</script>

<div class="ss" bind:this={wrap}>
	<svg bind:this={svg} viewBox="0 0 {W} 96" role="img" aria-label="세션 타임라인: {spoken}">
		<defs>
			<pattern id="h-{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<line x1="0" y1="0" x2="0" y2="6" class="hatch" stroke-width="2" />
			</pattern>
		</defs>
		<line x1={PAD} y1={Y} x2={W - PAD} y2={Y} class="track" />
		<line x1={PAD} y1={Y} x2={X(strip.elapsed)} y2={Y} class="done" />
		{#if strip.limitSec < strip.length}
			<line x1={X(strip.limitSec)} y1={Y - 12} x2={X(strip.limitSec)} y2={Y + 12} class="limit" />
		{/if}
		{#each strip.away as a, i (i)}<rect x={X(a.from)} y={Y - 13} width={Math.max(2, X(a.to) - X(a.from))} height="26" rx="4" fill="url(#h-{uid})" class="away"><title>다른 탭 {mmss(a.from)}–{mmss(a.to)}</title></rect>{/each}
		{#each strip.idle as a, i (i)}<rect x={X(a.from)} y={Y - 11} width={Math.max(2, X(a.to) - X(a.from))} height="22" rx="4" class="idle"><title>입력 없음 {mmss(a.from)}–{mmss(a.to)}</title></rect>{/each}
		{#if strip.silent && !strip.recorded}
			<rect x={X(strip.silent.from) + 10} y={Y - 13} width={Math.max(0, X(strip.silent.to) - X(strip.silent.from) - 20)} height="26" rx="4" fill="url(#h-{uid})" />
		{/if}
		{#if strip.silent}
			<text x={(X(strip.silent.from) + X(strip.silent.to)) / 2} y={Y - 22} text-anchor="middle" class="cool">{silentText}</text>
		{/if}
		{#each strip.marks as m, i (i)}
			{@const x = X(m.t)}
			{@const l = label(m)}
			<g class="mark" role="button" tabindex="0" aria-label={l.head + (l.body ? ` ${l.body}` : '')}
				onmouseenter={() => show({ x, ...l })} onfocus={() => show({ x, ...l })} onclick={() => show({ x, ...l })}
				onmouseleave={() => (tip = null)} onblur={() => (tip = null)} onkeydown={(e) => e.key === 'Escape' && (tip = null)}>
				{#if m.kind === 'run'}
					<circle class="hit" cx={x} cy={Y} r="11" />
					{#if m.status === 'passed'}<circle cx={x} cy={Y} r="5" class="ok" />
					{:else}<path d="M{x - 4} {Y - 4} l8 8 M{x + 4} {Y - 4} l-8 8" class="bad" />{/if}
				{:else if m.kind === 'lookup'}
					<rect x={x - 4} y={Y + 16} width="8" height="8" transform="rotate(45 {x} {Y + 20})" class="lk" />
				{:else}
					<path d="M{x} {Y + 15} l5 9 h-10 z" class="hint" />
				{/if}
			</g>
		{/each}
		<g class="axis">
			<text x={PAD} y="90">0:00</text>
			{#each ticks as t (t)}<text x={X(t)} y="90" text-anchor="middle">{mmss(t)}</text>{/each}
			<text x={W - PAD} y="90" text-anchor="end">{strip.limitSec >= strip.length ? `${mmss(strip.limitSec)} 제한` : mmss(strip.length)}</text>
		</g>
	</svg>
	{#if tip}<div class="tip" style={tipStyle}><b>{tip.head}</b>{#if tip.body}<code>{tip.body}</code>{/if}</div>{/if}
</div>

<style>
	.ss { position: relative; }
	svg { display: block; width: 100%; height: auto; overflow: visible; }
	.track { stroke: var(--line); stroke-width: 1; }
	.done { stroke: var(--muted); stroke-width: 2; }
	.limit { stroke: var(--muted); stroke-dasharray: 2 3; }
	.hatch { stroke: var(--rk-blue); stroke-opacity: .45; }
	.away { stroke: var(--rk-blue); stroke-opacity: .5; }
	.idle { fill: none; stroke: var(--rk-blue); stroke-opacity: .55; stroke-dasharray: 2 3; }
	.cool { fill: var(--rk-blue); font: 500 12px var(--f-mono); }
	.hit { fill: var(--bg); stroke: var(--line); }
	.mark { cursor: pointer; outline: none; }
	.mark:hover .hit, .mark:focus-visible .hit { stroke: var(--accent); stroke-width: 1.5; }
	.ok { fill: var(--ok); }
	.bad { stroke: var(--bad); stroke-width: 1.6; stroke-linecap: round; fill: none; }
	.lk { fill: var(--muted); }
	.hint { fill: var(--accent); }
	.axis text { font: 500 11px var(--f-mono); fill: var(--muted); }
	.tip { position: absolute; transform: translate(-50%, calc(-100% - 6px)); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 7px 11px; font-size: 13px; pointer-events: none; width: max-content; max-width: min(340px, 80vw); box-shadow: 0 10px 30px rgba(0, 0, 0, .35); z-index: 5; }
	.tip b { display: block; font: 500 12px var(--f-mono); color: var(--muted); }
	.tip code { font-size: 12.5px; white-space: normal; overflow-wrap: anywhere; }
</style>
