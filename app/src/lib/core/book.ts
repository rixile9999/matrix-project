// Pure helpers for book problems: reading order, "continue" target, next problem.

export type BookPos = { id: string; chapter: number; exercise: string; order: number };

/** "3.10" > "3.7": compares the dot-separated parts as numbers, falling back to text for non-numeric parts. */
export function compareExercise(a: string, b: string): number {
	const pa = a.split('.');
	const pb = b.split('.');
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const x = pa[i] ?? '';
		const y = pb[i] ?? '';
		const nx = /^\d+$/.test(x) ? Number(x) : NaN;
		const ny = /^\d+$/.test(y) ? Number(y) : NaN;
		const d = Number.isNaN(nx) || Number.isNaN(ny) ? (x < y ? -1 : x > y ? 1 : 0) : nx - ny;
		if (d) return d;
	}
	return 0;
}

/** Book order: chapter, then exercise label, then `order`, then id. Returns a new array. */
export const bookOrder = <T extends BookPos>(items: T[]): T[] =>
	[...items].sort((a, b) => a.chapter - b.chapter || compareExercise(a.exercise, b.exercise) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The problem after `id` in `ordered` (already in book order), crossing chapters; null at the end or for an unknown id. */
export const nextInBook = <T extends { id: string }>(ordered: T[], id: string): string | null => {
	const i = ordered.findIndex((p) => p.id === id);
	return i < 0 ? null : (ordered[i + 1]?.id ?? null);
};

/** First problem of `ordered` that is not passed. */
export const firstUnpassed = <T extends { id: string }>(ordered: T[], passed: Set<string>): string | null => ordered.find((p) => !passed.has(p.id))?.id ?? null;

export type Chapter<T> = { chapter: number; items: T[] };

/** Groups book-ordered items by chapter, and adds an empty group for each of `known` chapters that has none. Ascending. */
export function byChapter<T extends BookPos>(ordered: T[], known: number[]): Chapter<T>[] {
	const map = new Map<number, T[]>(known.map((c) => [c, []]));
	for (const p of ordered) map.set(p.chapter, [...(map.get(p.chapter) ?? []), p]);
	return [...map].sort((a, b) => a[0] - b[0]).map(([chapter, items]) => ({ chapter, items }));
}
