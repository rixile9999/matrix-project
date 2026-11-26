// Memorisation scheduling: pure functions over the append-only review log.
// Nothing derived is stored; an item's FSRS state is recomputed by replaying its reviews.
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';

export type ItemType = 'card' | 'check';
export type Rating = 1 | 2 | 3 | 4;
/** One row of memo_reviews. `at` is unix seconds. */
export type Review = { itemType: ItemType; itemId: string; at: number; rating: Rating };

// Whole-day intervals (no learning steps): "again" comes back tomorrow, so a session never loops on one card.
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false }));

export const itemKey = (type: ItemType, id: string) => `${type}:${id}`;

/** Seconds allowed per item, by kind. Overtime is recorded, never enforced. */
export const LIMIT_SEC = {
	concept: 40, recognize: 40, steps: 60, line: 30, syntax: 30,
	trace: 45, approach: 45, bug: 60, order: 120
} as const;
export type LimitKind = keyof typeof LIMIT_SEC;

export type Memory = { card: Card; reviews: number; lastRating: Rating; tail: Rating[] /* last two ratings, oldest first */ };

/** Replays one item's reviews (any order; sorted by time, stable) through the scheduler. Null for no reviews. */
export function replay(reviews: { at: number; rating: Rating }[]): Memory | null {
	if (reviews.length === 0) return null;
	const sorted = reviews.map((r, i) => ({ ...r, i })).sort((a, b) => a.at - b.at || a.i - b.i);
	let card = createEmptyCard(new Date(sorted[0].at * 1000));
	let prev = sorted[0].at;
	for (const r of sorted) {
		prev = Math.max(prev, r.at);
		card = scheduler.next(card, new Date(prev * 1000), r.rating as Grade).card;
	}
	const ratings = sorted.map((r) => r.rating);
	return { card, reviews: sorted.length, lastRating: ratings[ratings.length - 1], tail: ratings.slice(-2) };
}

/** The memory after each review, in time order: replay(reviews.slice(0, k + 1)) for every k, computed in one pass. */
export function replayEach(reviews: { at: number; rating: Rating }[]): Memory[] {
	const sorted = reviews.map((r, i) => ({ ...r, i })).sort((a, b) => a.at - b.at || a.i - b.i);
	const out: Memory[] = [];
	if (sorted.length === 0) return out;
	let card = createEmptyCard(new Date(sorted[0].at * 1000));
	let prev = sorted[0].at;
	const ratings: Rating[] = [];
	for (const r of sorted) {
		prev = Math.max(prev, r.at);
		card = scheduler.next(card, new Date(prev * 1000), r.rating as Grade).card;
		ratings.push(r.rating);
		out.push({ card, reviews: ratings.length, lastRating: r.rating, tail: ratings.slice(-2) });
	}
	return out;
}

/** Log (oldest first or not) -> memory per item key. */
export function buildMemories(log: Review[]): Map<string, Memory> {
	const by = new Map<string, Review[]>();
	for (const r of log) {
		const k = itemKey(r.itemType, r.itemId);
		by.set(k, [...(by.get(k) ?? []), r]);
	}
	const out = new Map<string, Memory>();
	for (const [k, rs] of by) {
		const m = replay(rs);
		if (m) out.set(k, m);
	}
	return out;
}

/** When each rating would schedule the next review, for an item with `memory` (null = never reviewed). */
export function previewDue(memory: Memory | null, now: Date): Record<1 | 2 | 3, Date> {
	const r = scheduler.repeat(memory?.card ?? createEmptyCard(now), now);
	return { 1: r[1].card.due, 2: r[2].card.due, 3: r[3].card.due };
}

export const dueAfter = (memory: Memory | null, now: Date, rating: Rating): Date =>
	scheduler.next(memory?.card ?? createEmptyCard(now), now, rating as Grade).card.due;

const dayNumber = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** "오늘", "내일", "9일 뒤", "3주 뒤", "2개월 뒤": calendar days from `now` to `due`. */
export function humanInterval(due: Date, now: Date, locale = 'ko'): string {
	const days = dayNumber(due) - dayNumber(now);
	if (locale === 'en') {
		if (days <= 0) return 'Today';
		if (days === 1) return 'Tomorrow';
		if (days < 14) return `In ${days} days`;
		if (days < 60) return `In ${Math.round(days / 7)} weeks`;
		return `In ${Math.round(days / 30)} months`;
	}
	if (days <= 0) return '오늘';
	if (days === 1) return '내일';
	if (days < 14) return `${days}일 뒤`;
	if (days < 60) return `${Math.round(days / 7)}주 뒤`;
	return `${Math.round(days / 30)}개월 뒤`;
}

export const VERDICT: Record<1 | 2 | 3, string> = { 1: '모름', 2: '흔들림', 3: '기억남' };

// ---------- selection ----------
export type Item = { key: string; unlocked: boolean; groups: string[] /* pattern / source problems: neighbours must not share one */ };
export type ItemState = 'locked' | 'due' | 'new' | 'later';

/** Due = the next review falls on today or earlier (calendar day, local time). */
export function isDue(m: Memory, now: Date): boolean {
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return m.card.due < tomorrow;
}

export function stateOf(item: Item, memories: Map<string, Memory>, now: Date): ItemState {
	if (!item.unlocked) return 'locked';
	const m = memories.get(item.key);
	return !m ? 'new' : isDue(m, now) ? 'due' : 'later';
}

/** Reorders so neighbours share no group where possible; otherwise keeps the earliest item. */
export function interleave<T extends { groups: string[] }>(items: T[]): T[] {
	const rest = [...items];
	const out: T[] = [];
	while (rest.length) {
		const prev = out[out.length - 1];
		const at = prev ? rest.findIndex((x) => !x.groups.some((g) => prev.groups.includes(g))) : 0;
		out.push(...rest.splice(at < 0 ? 0 : at, 1));
	}
	return out;
}

export type Plan = { due: string[]; fresh: string[] };

/** Available items: due ones (most overdue first), then never-reviewed ones (at most `maxNew`), at most `limit` in all. */
export function plan(items: Item[], memories: Map<string, Memory>, now: Date, limit: number, maxNew: number): Plan {
	const due = items
		.filter((i) => stateOf(i, memories, now) === 'due')
		.sort((a, b) => memories.get(a.key)!.card.due.getTime() - memories.get(b.key)!.card.due.getTime())
		.slice(0, limit);
	const fresh = items.filter((i) => stateOf(i, memories, now) === 'new').slice(0, Math.min(maxNew, Math.max(0, limit - due.length)));
	return { due: due.map((i) => i.key), fresh: fresh.map((i) => i.key) };
}

/** The session order: the plan, interleaved. */
export function pickSession(items: Item[], memories: Map<string, Memory>, now: Date, limit: number, maxNew: number): string[] {
	const p = plan(items, memories, now, limit, maxNew);
	const by = new Map(items.map((i) => [i.key, i]));
	return interleave([...p.due, ...p.fresh].map((k) => by.get(k)!)).map((i) => i.key);
}

// ---------- notes ----------
export type NoteStatus = 'stable' | 'shaky' | 'new';
/** 안정: last rating 3+ and interval >= 7 days. 흔들림: reviewed but not stable, or last rating 1. Never reviewed or locked: new. */
export function noteStatus(m: Memory | undefined, unlocked: boolean): NoteStatus {
	if (!unlocked || !m) return 'new';
	return m.lastRating >= 3 && m.card.scheduled_days >= 7 ? 'stable' : 'shaky';
}

/** True when the item's two most recent reviews were both "again". */
export const failedTwice = (m: Memory | undefined) => !!m && m.tail.length === 2 && m.tail.every((r) => r === 1);

// ---------- weekly goal ----------
export const WEEK_GOAL = 5;
/** Distinct local days in the current week (Monday first) with at least one review. */
export function daysThisWeek(ats: number[], now: Date): number {
	const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
	const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
	const days = new Set<string>();
	for (const at of ats) {
		const d = new Date(at * 1000);
		if (d >= monday && d < next) days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
	}
	return days.size;
}

/** Rough time for a session: about 20 seconds a card, at least a minute. */
export const estimateMinutes = (n: number) => (n === 0 ? 0 : Math.max(1, Math.round((n * 20) / 60)));

// ---------- deterministic shuffling ----------
function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}
function rng(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A permutation of 0..n-1 fixed by `seed`; never the identity when n > 1. permutation[i] = original index shown at position i. */
export function permutation(n: number, seed: string): number[] {
	const idx = Array.from({ length: n }, (_, i) => i);
	if (n < 2) return idx;
	for (let salt = 0; salt < 20; salt++) {
		const r = rng(hash(`${seed}#${salt}`));
		const p = [...idx];
		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[p[i], p[j]] = [p[j], p[i]];
		}
		if (p.some((v, i) => v !== i)) return p;
	}
	return idx.reverse();
}
