import { describe, expect, it } from 'vitest';
import { difficultyFor, expected, replay, update, deviation } from './rating.ts';
import { pick, ratingWindow, type Candidate } from './select.ts';

describe('rating', () => {
	it('expects 50% at equal rating', () => expect(expected(1500, 1500)).toBeCloseTo(0.5));
	it('inverts expected', () => expect(expected(1500, difficultyFor(1500, 0.7))).toBeCloseTo(0.7));
	it('moves up on a solve, down on a fail, and shrinks RD', () => {
		const p = { r: 1500, rd: 200 };
		const win = update(p, 1500, 1);
		const loss = update(p, 1500, 0);
		expect(win.r).toBeGreaterThan(1500);
		expect(loss.r).toBeLessThan(1500);
		expect(win.r - 1500).toBeCloseTo(1500 - loss.r);
		expect(win.rd).toBeLessThan(200);
	});
	it('converges toward the true level', () => {
		// deterministic: solves everything <= 1700, fails everything above
		const ds = Array.from({ length: 60 }, (_, i) => 1400 + (i % 7) * 100);
		const { rating } = replay({ r: 1000, rd: 350 }, ds.map((d) => ({ difficulty: d, tags: [], score: d <= 1700 ? 1 : 0 })));
		expect(rating.r).toBeGreaterThan(1600);
		expect(rating.r).toBeLessThan(1900);
	});
	it('tracks tag deviation', () => {
		const { tags } = replay({ r: 1500, rd: 100 }, [
			{ difficulty: 1500, tags: ['dp'], score: 0 },
			{ difficulty: 1500, tags: ['dp', 'math'], score: 0 },
			{ difficulty: 1500, tags: ['math'], score: 1 }
		]);
		expect(deviation(tags.get('dp')!)).toBeLessThan(-0.3);
		expect(tags.get('math')!.n).toBe(2);
	});
});

describe('select', () => {
	const c = (id: string, rating: number, tags: string[] = []): Candidate => ({ id, rating, tags, solvedCount: 1000 });
	const base = { userRating: 1500, tagStats: new Map(), exclude: new Set<string>(), rng: () => 0.5 };
	it('clamps the window to the CF minimum', () => expect(ratingWindow(900, 'speed')).toEqual([800, 1000]));
	it('respects window, exclusions and special tags', () => {
		const pool = [c('a', 1500), c('b', 2500), c('x', 1500), c('s', 1500, ['*special'])];
		const got = pick(pool, { ...base, mode: 'standard', exclude: new Set(['a']) });
		expect(got?.id).toBe('x');
		expect(pick([c('b', 2500)], { ...base, mode: 'standard' })).toBeNull();
	});
	it('favours weak tags', () => {
		const tagStats = new Map([['dp', { n: 10, actual: 1, expected: 6 }]]);
		const pool = [c('plain', 1500, ['math']), c('weak', 1500, ['dp'])];
		let hits = 0;
		for (let i = 0; i < 100; i++) if (pick(pool, { ...base, mode: 'standard', tagStats, rng: () => (i + 0.5) / 100 })?.id === 'weak') hits++;
		expect(hits).toBeGreaterThan(65);
	});
});
