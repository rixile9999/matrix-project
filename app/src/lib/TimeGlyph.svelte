<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	// Remaining time as a waning moon instead of digits: full at the start, a thin crescent near the end,
	// an empty warm ring once the limit has passed. Digits pull the eye every second; a phase can be read at a glance
	// and otherwise left alone. Pressing the glyph shows the digits (remembered), for when the exact time matters.
	let { remainingSec, limitSec, size = 22 }: { remainingSec: number; limitSec: number; size?: number } = $props();

	const KEY = 'timer-digits';
	let digits = $state(false);
	$effect(() => {
		try {
			digits = localStorage.getItem(KEY) === '1';
		} catch {
			// storage unavailable: stay with the glyph
		}
	});
	function toggle() {
		digits = !digits;
		try {
			localStorage.setItem(KEY, digits ? '1' : '0');
		} catch {
			// not remembered, still toggled for this page
		}
	}

	const over = $derived(remainingSec < 0);
	const f = $derived(limitSec > 0 ? Math.max(0, Math.min(1, remainingSec / limitSec)) : 0); // lit fraction
	const abs = $derived(Math.abs(Math.trunc(remainingSec)));
	const text = $derived(`${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`);
	const spoken = $derived(
		over ? t(`제한 시간을 ${Math.floor(abs / 60)}분 ${abs % 60}초 넘겼습니다`, `Over the limit by ${Math.floor(abs / 60)}m ${abs % 60}s`) : t(`남은 시간 ${Math.floor(abs / 60)}분 ${abs % 60}초`, `${Math.floor(abs / 60)}m ${abs % 60}s remaining`)
	);

	// The lit part: the left half-disc, plus (gibbous) or minus (crescent) a half-ellipse whose width follows f.
	const R = 9;
	const lit = $derived.by(() => {
		if (f <= 0.004) return '';
		if (f >= 0.996) return `M 12 ${12 - R} A ${R} ${R} 0 1 0 12 ${12 + R} A ${R} ${R} 0 1 0 12 ${12 - R} Z`;
		const rx = (R * Math.abs(2 * f - 1)).toFixed(2);
		return `M 12 ${12 - R} A ${R} ${R} 0 0 0 12 ${12 + R} A ${rx} ${R} 0 0 ${f > 0.5 ? 0 : 1} 12 ${12 - R} Z`;
	});
</script>

	<button class="tg" class:over type="button" onclick={toggle} aria-pressed={digits} title={digits ? t('숫자 숨기기', 'Hide digits') : t('숫자로 보기', 'Show digits')}>
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r={R} class="rim" />
		{#if lit}<path d={lit} class="lit" />{/if}
	</svg>
	{#if digits}<span class="num">{text}</span>{/if}
	<span class="sr" role="timer" aria-live="off">{spoken}</span>
</button>

<style>
	.tg { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 4px; margin: -4px; color: inherit; cursor: pointer; border-radius: 999px; }
	.tg:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
	.rim { fill: none; stroke: currentColor; stroke-opacity: .28; stroke-width: 1.2; }
	.lit { fill: currentColor; fill-opacity: .9; transition: d .9s linear; }
	.over .rim { stroke: var(--a-warm, var(--warn)); stroke-opacity: .9; }
	.num { font: 500 14px var(--f-mono); font-variant-numeric: tabular-nums; font-variant-ligatures: none; opacity: .75; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	@media (prefers-reduced-motion: reduce) { .lit { transition: none; } }
</style>
