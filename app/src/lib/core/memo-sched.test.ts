import { describe, expect, it } from 'vitest';
import {
	buildMemories, daysThisWeek, failedTwice, humanInterval, interleave, itemKey, noteStatus, permutation, pickSession, plan, previewDue, replay, stateOf,
	type Item, type Rating, type Review
} from './memo-sched.ts';

const at = (y: number, m: number, d: number, h = 9) => Math.floor(new Date(y, m - 1, d, h).getTime() / 1000);
const NOW = new Date(2026, 5, 10, 10); // Wed 2026-06-10 10:00 local
const day = (n: number) => at(2026, 6, 10 + n, 9);
const rv = (id: string, when: number, rating: Rating, itemType: 'card' | 'check' = 'card'): Review => ({ itemType, itemId: id, at: when, rating });
const item = (id: string, unlocked = true, groups: string[] = []): Item => ({ key: itemKey('card', id), unlocked, groups });

describe('replay', () => {
	it('is null without reviews and deterministic', () => {
		expect(replay([])).toBeNull();
		const rs = [{ at: day(-10), rating: 3 as Rating }, { at: day(-6), rating: 3 as Rating }];
		expect(replay(rs)!.card.due.getTime()).toBe(replay([...rs].reverse())!.card.due.getTime());
	});
	it('grows the interval with good ratings and resets it with again', () => {
		const good = replay([{ at: day(-20), rating: 3 }, { at: day(-15), rating: 3 }, { at: day(-5), rating: 3 }])!;
		const lapse = replay([{ at: day(-20), rating: 3 }, { at: day(-15), rating: 3 }, { at: day(-5), rating: 1 }])!;
		expect(good.card.scheduled_days).toBeGreaterThan(lapse.card.scheduled_days);
		expect(lapse.lastRating).toBe(1);
		expect(good.reviews).toBe(3);
	});
	it('a first "again" is due tomorrow, not in a minute', () => {
		const m = replay([{ at: day(0), rating: 1 }])!;
		expect(humanInterval(m.card.due, NOW)).toBe('내일');
	});
});

describe('humanInterval', () => {
	it('names days, weeks and months', () => {
		const d = (n: number) => new Date(2026, 5, 10 + n, 23);
		expect([0, 1, 9, 21, 100].map((n) => humanInterval(d(n), NOW))).toEqual(['오늘', '내일', '9일 뒤', '3주 뒤', '3개월 뒤']);
		expect(humanInterval(new Date(2026, 5, 1), NOW)).toBe('오늘');
	});
});

describe('selection', () => {
	const items = [item('a'), item('b'), item('c'), item('d', false), item('e'), item('f'), item('g')];
	const log = [rv('a', day(-9), 3), rv('b', day(-3), 1), rv('c', day(0), 3), rv('d', day(-2), 1)];
	const mem = buildMemories(log);
	it('classifies items', () => {
		expect(items.map((i) => stateOf(i, mem, NOW))).toEqual(['due', 'due', 'later', 'locked', 'new', 'new', 'new']);
	});
	it('puts the most overdue first, then new ones, capped', () => {
		const p = plan(items, mem, NOW, 12, 2);
		expect(p.due).toEqual(['card:a', 'card:b']);
		expect(p.fresh).toEqual(['card:e', 'card:f']);
	});
	it('respects the total limit and never serves locked items', () => {
		expect(pickSession(items, mem, NOW, 3, 4)).toEqual(['card:a', 'card:b', 'card:e']);
		expect(pickSession(items, mem, NOW, 12, 4)).not.toContain('card:d');
		expect(pickSession(items, mem, NOW, 1, 4)).toEqual(['card:a']);
	});
	it('interleaves groups', () => {
		const x = [item('1', true, ['p']), item('2', true, ['p']), item('3', true, ['q']), item('4', true, ['p', 's'])];
		expect(interleave(x).map((i) => i.key)).toEqual(['card:1', 'card:3', 'card:2', 'card:4']);
		const same = [item('1', true, ['p']), item('2', true, ['p'])];
		expect(interleave(same).map((i) => i.key)).toEqual(['card:1', 'card:2']);
	});
	it('handles empty input', () => {
		expect(pickSession([], new Map(), NOW, 12, 4)).toEqual([]);
	});
});

describe('notes and redo', () => {
	it('derives status from the replay', () => {
		const stable = replay([{ at: day(-30), rating: 3 }, { at: day(-20), rating: 3 }, { at: day(-8), rating: 3 }]);
		expect(noteStatus(stable ?? undefined, true)).toBe('stable');
		expect(noteStatus(stable ?? undefined, false)).toBe('new');
		expect(noteStatus(replay([{ at: day(-1), rating: 3 }])!, true)).toBe('shaky');
		expect(noteStatus(replay([{ at: day(-30), rating: 3 }, { at: day(-1), rating: 1 }])!, true)).toBe('shaky');
		expect(noteStatus(undefined, true)).toBe('new');
	});
	it('flags two failures in a row until a 2+', () => {
		expect(failedTwice(replay([{ at: day(-3), rating: 1 }]) ?? undefined)).toBe(false);
		expect(failedTwice(replay([{ at: day(-3), rating: 1 }, { at: day(-1), rating: 1 }])!)).toBe(true);
		expect(failedTwice(replay([{ at: day(-5), rating: 1 }, { at: day(-3), rating: 1 }, { at: day(-1), rating: 2 }])!)).toBe(false);
		expect(failedTwice(replay([{ at: day(-5), rating: 3 }, { at: day(-3), rating: 1 }, { at: day(-1), rating: 1 }])!)).toBe(true);
	});
	it('previews the next due per rating', () => {
		const p = previewDue(null, NOW);
		expect(p[1].getTime()).toBeLessThan(p[3].getTime());
	});
});

describe('weekly goal', () => {
	it('counts distinct days in the current Monday-first week', () => {
		const ats = [at(2026, 6, 8, 8), at(2026, 6, 8, 22), at(2026, 6, 10, 9), at(2026, 6, 7, 23), at(2026, 6, 14, 12)];
		expect(daysThisWeek(ats, NOW)).toBe(3);
		expect(daysThisWeek([], NOW)).toBe(0);
		expect(daysThisWeek([at(2026, 6, 15, 0)], NOW)).toBe(0);
	});
});

describe('permutation', () => {
	it('is stable per seed, a real permutation, never identity', () => {
		const p = permutation(6, 'order-rle');
		expect(permutation(6, 'order-rle')).toEqual(p);
		expect([...p].sort()).toEqual([0, 1, 2, 3, 4, 5]);
		for (const s of ['a', 'b', 'c', 'd', 'e']) expect(permutation(2, s)).toEqual([1, 0]);
		expect(permutation(1, 'x')).toEqual([0]);
		expect(permutation(0, 'x')).toEqual([]);
	});
});
