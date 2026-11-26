// Pure pieces of the ambience layer: easing, rhythm schedule, backdrop picker. No DOM, no Web Audio.
import type { Backdrop, Scene, SoundMode } from './types';

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

// ---------- backdrop ----------
export function pickBackdrop(setting: Backdrop | 'random', rng: () => number = Math.random): Backdrop {
	if (setting !== 'random') return setting;
	return BACKDROPS[Math.min(BACKDROPS.length - 1, Math.floor(rng() * BACKDROPS.length))];
}

// ---------- default stage per route ----------
/** How far the picture is dimmed on the calm screens (0..1; see Ambience `dim`). */
export const HOME_DIM = 0.7;
export const WORK_DIM = 0.4;

export type StageDefault = { scene?: Scene; dim: number; sound: SoundMode };
/**
 * What the ambience shows when a page says nothing. Sparring pages set their own scene (so: none here), full picture, full sound.
 * Work screens (a problem being solved, a memo review or check): frozen and dim, the score very quietly. Everything else: the slow home scene, dimmed, the background mix.
 */
export function stageDefault(path: string): StageDefault {
	if (path === '/spar' || path.startsWith('/spar/')) return { dim: 0, sound: 'full' };
	if (path === '/garden' || path.startsWith('/garden/')) return { scene: 'home', dim: 0.35, sound: 'bed' }; // a quiet room: always dark, picture softened
	const work = path.startsWith('/attempt/') || path === '/memo/review' || path === '/memo/check' || /^\/lang\/(?!book(\/|$)|cheatsheet(\/|$))[^/]+/.test(path);
	return work ? { scene: 'still', dim: WORK_DIM, sound: 'quiet' } : { scene: 'home', dim: HOME_DIM, sound: 'bed' };
}
