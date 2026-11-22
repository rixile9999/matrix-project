import { describe, expect, it } from 'vitest';
import { bookOrder, byChapter, compareExercise, firstUnpassed, nextInBook } from './book.ts';

const p = (id: string, chapter: number, exercise: string, order = 0) => ({ id, chapter, exercise, order });

describe('book order', () => {
	it('compares exercise labels numerically', () => {
		expect(compareExercise('3.7', '3.10')).toBeLessThan(0);
		expect(compareExercise('3.2', '3.2')).toBe(0);
		expect(compareExercise('4.1', '3.20')).toBeGreaterThan(0);
		expect(compareExercise('3', '3.1')).toBeLessThan(0);
		expect(compareExercise('3.a', '3.b')).toBeLessThan(0);
	});
	const items = [p('c', 4, '4.1'), p('b', 3, '3.10'), p('a', 3, '3.7'), p('d', 3, '3.7', 5), p('e', 2, '2.1')];
	it('sorts by chapter, exercise, order, id', () => {
		expect(bookOrder(items).map((x) => x.id)).toEqual(['e', 'a', 'd', 'b', 'c']);
		expect(items[0].id).toBe('c'); // input untouched
	});
	it('finds the next problem across chapters', () => {
		const o = bookOrder(items);
		expect(nextInBook(o, 'e')).toBe('a');
		expect(nextInBook(o, 'b')).toBe('c');
		expect(nextInBook(o, 'c')).toBeNull();
		expect(nextInBook(o, 'zzz')).toBeNull();
		expect(nextInBook([], 'a')).toBeNull();
	});
	it('picks the first unpassed in book order', () => {
		const o = bookOrder(items);
		expect(firstUnpassed(o, new Set())).toBe('e');
		expect(firstUnpassed(o, new Set(['e', 'a']))).toBe('d');
		expect(firstUnpassed(o, new Set(o.map((x) => x.id)))).toBeNull();
	});
	it('groups by chapter and keeps empty known chapters', () => {
		const g = byChapter(bookOrder(items), [2, 3, 4, 5, 6]);
		expect(g.map((c) => [c.chapter, c.items.length])).toEqual([[2, 1], [3, 3], [4, 1], [5, 0], [6, 0]]);
		expect(byChapter(bookOrder(items), []).map((c) => c.chapter)).toEqual([2, 3, 4]);
	});
});
