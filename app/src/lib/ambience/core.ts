// Pure pieces of the ambience layer: easing, rhythm schedule, backdrop picker. No DOM, no Web Audio.
import type { Backdrop, Scene } from './types';

export const BACKDROPS: readonly Backdrop[] = ['none', 'earthrise', 'blackhole', 'earth'];

/** Per scene: dust drift, pull toward the horizon, light behind the limb, dust brightness. */
export type Params = [drift: number, pull: number, light: number, dust: number];
export const SCENE_PARAMS: Record<Scene, Params> = {
	home: [0.9, 0, 0.34, 0.9],
	run: [0.4, 0.5, 0.14, 0.55],
	result: [1, 0, 0.5, 1],
	still: [0.4, 0.5, 0.14, 0.55], // frozen anyway; same settled look as 'run'
};

/** How visible the video is per scene (it fades over 3 s in CSS). */
export const VIDEO_SHOW: Record<Scene, number> = { home: 0.8, run: 0.26, result: 1, still: 0.26 };
export const VIDEO_RATE: Record<Exclude<Backdrop, 'none'>, number> = { earthrise: 0.6, blackhole: 0.3, earth: 0.5 };

/** Scenes settle over a few seconds. */
export function easeParams(cur: Params, target: Params, dt: number): Params {
	const k = Math.min(1, dt * 0.7);
	return cur.map((v, i) => v + (target[i] - v) * k) as Params;
}

export type Bloom = { value: number; target: number };
/** Rises in about a second, falls over several; turns itself off near the peak. */
export function bloomStep(b: Bloom, dt: number): Bloom {
	const value = b.value + (b.target - b.value) * Math.min(1, dt * (b.target > b.value ? 1.1 : 0.28));
	return { value, target: value > 0.92 ? 0 : b.target };
}
/** The wave: 0..1 while travelling, -1 when idle. */
export function rippleStep(r: number, dt: number): number {
	if (r < 0) return r;
	const n = r + dt / 4.5;
	return n > 1 ? -1 : n;
}

/** Progress on the orbit: at rest (undefined) the body sits at the start, or at the end for a result. */
export function orbitProgress(scene: Scene, progress: number | undefined): number {
	if (progress !== undefined) return Math.min(1, Math.max(0, progress));
	return scene === 'result' ? 1 : 0;
}
/** Follow the target smoothly; a big step backwards (a reset) snaps. */
export function easeProgress(cur: number, target: number, dt: number): number {
	if (target < cur - 0.3) return target;
	return cur + (target - cur) * Math.min(1, dt * 2);
}

// ---------- rhythm ----------
export const BREATH = 11; // seconds; one breath every 11 s
export const BEAT = BREATH / 16; // sixteen beats to a breath, about 87 a minute

export const MOTIF_ROOT = 146.83; // D
export const MOTIF_SCALE = [1, 1.2, 1.5, 1.78, 2.25, 3]; // D, F, A, C, E, A: open above the bed's D-A-E
export const MOTIF_SEQ = [0, 2, 4, 3, 2, 5, 4, 1];
export const MOTIF_HITS = [0, 3, 6, 8, 11, 14]; // in sixteenths: 3+3+2, 3+3+2
export const MOTIF_LEVELS = [0.45, 1, 1, 0.5]; // rises, holds, falls away
export const MOTIF_THUMPS = [0, 2.5, 4, 6.5]; // in beats within a bar (from the second bar on)
export const MOTIF_BEATS = 32;

export type MotifEvent =
	| { kind: 'pluck'; t: number; freq: number; dur: number; peak: number }
	| { kind: 'thump'; t: number; peak: number };

/** The rhythm that surfaces now and then: four bars of 8 beats in a 3+3+2 grouping. `start` is in seconds. */
export function motifEvents(start: number, beat = BEAT): MotifEvent[] {
	const out: MotifEvent[] = [];
	for (let bar = 0; bar < 4; bar++) {
		const level = MOTIF_LEVELS[bar];
		for (let h = 0; h < MOTIF_HITS.length; h++) {
			const t = start + (bar * 8 + MOTIF_HITS[h] / 2) * beat;
			const n = MOTIF_SEQ[(bar * 3 + h) % MOTIF_SEQ.length];
			out.push({
				kind: 'pluck', t,
				freq: MOTIF_ROOT * MOTIF_SCALE[n] * (h === 5 && bar % 2 ? 2 : 1),
				dur: beat * 0.9,
				peak: 0.11 * level * (h % 3 === 0 ? 1 : 0.7),
			});
		}
		if (bar > 0) for (const b of MOTIF_THUMPS) out.push({ kind: 'thump', t: start + (bar * 8 + b) * beat, peak: 0.2 * level });
	}
	return out;
}

/** Next breath boundary (relative to t0) at or after `now + lead`. */
export function nextBreath(t0: number, now: number, lead = 0.1): number {
	return t0 + Math.ceil((now - t0 + lead) / BREATH) * BREATH;
}

// ---------- backdrop ----------
export function pickBackdrop(setting: Backdrop | 'random', rng: () => number = Math.random): Backdrop {
	if (setting !== 'random') return setting;
	return BACKDROPS[Math.min(BACKDROPS.length - 1, Math.floor(rng() * BACKDROPS.length))];
}
