import { deviation, type TagStat } from './rating.ts';

export type Mode = 'speed' | 'standard' | 'depth';

export const MODES: Record<Mode, { label: string; desc: string; lo: number; hi: number; limitSec: number }> = {
	speed: { label: '스피드', desc: '쉬운 문제를 빠르게', lo: -400, hi: -200, limitSec: 15 * 60 },
	standard: { label: '표준', desc: '내 레이팅 근처', lo: -150, hi: 50, limitSec: 40 * 60 },
	depth: { label: '깊이', desc: '레이팅보다 어려운 문제를 길게', lo: 0, hi: 200, limitSec: 75 * 60 }
};

export type Candidate = { id: string; rating: number; tags: string[]; solvedCount: number };

const CF_MIN = 800;
const MIN_TAG_SAMPLES = 3;

export function ratingWindow(userRating: number, mode: Mode): [number, number] {
	const m = MODES[mode];
	const shift = Math.max(0, CF_MIN - (userRating + m.lo));
	return [userRating + m.lo + shift, userRating + m.hi + shift];
}

/** Weak tags (solving less often than the rating predicts) get up to 2.5x weight. */
export function weight(c: Candidate, tagStats: Map<string, TagStat>): number {
	let weakness = 0;
	for (const t of c.tags) {
		const s = tagStats.get(t);
		if (s && s.n >= MIN_TAG_SAMPLES) weakness = Math.max(weakness, -deviation(s));
	}
	return 1 + 3 * Math.min(0.5, Math.max(0, weakness));
}

export function pick(
	candidates: Candidate[],
	opts: { userRating: number; mode: Mode; tagStats: Map<string, TagStat>; exclude: Set<string>; rng: () => number }
): Candidate | null {
	const [lo, hi] = ratingWindow(opts.userRating, opts.mode);
	const pool = candidates.filter(
		(c) =>
			c.rating >= lo &&
			c.rating <= hi &&
			c.solvedCount >= 100 &&
			!opts.exclude.has(c.id) &&
			!c.tags.some((t) => t.startsWith('*'))
	);
	if (pool.length === 0) return null;
	const weights = pool.map((c) => weight(c, opts.tagStats));
	let x = opts.rng() * weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < pool.length; i++) {
		x -= weights[i];
		if (x <= 0) return pool[i];
	}
	return pool[pool.length - 1];
}
