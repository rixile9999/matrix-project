// Sparring: pure logic over a run's append-only events. Nothing derived is stored; totals, splits,
// "best" and labels are recomputed from the events here. I/O lives in src/lib/server/spar.ts.
import { interleave } from './memo-sched.ts';

export type SparKind = 'sprint' | 'recall';
export type SparStatus = 'running' | 'finished' | 'abandoned';
export type SparEventType = 'run' | 'pass' | 'skip' | 'lookup' | 'answer' | 'finish' | 'abandon';

/** One row of spar_events. `ms` = milliseconds since the run started, `at` = unix seconds. */
export type SparEvent = { seq: number; at: number; ms: number; type: SparEventType; itemId: string | null; payload: Record<string, unknown> };

export const SPRINT_SIZE = 5;
export const MIN_ITEMS = 5; // the least material that lets either kind start
export const RECALL_MS = 90_000;
export const RECALL_LIST = 40;
export const RECALL_GRACE_MS = 60_000;
export const SPRINT_STALE_MS = 2 * 3_600_000;
export const RECALL_BEST_ACCURACY = 0.8;

/** m:ss, rounded to whole seconds. */
export function fmtMs(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- lifecycle ----------
export type Settle = { type: 'finish' | 'abandon'; ms: number };

/**
 * Where a run stands. `settle` is the terminal event the server should append now (lazily) for a run that is open but no longer
 * can be: a Sprint open for 2 hours is abandoned; a Recall past its deadline is finished (its answers stand) within the grace period, abandoned after it.
 */
export function runStatus(kind: SparKind, events: SparEvent[], elapsedMs: number): { status: SparStatus; settle: Settle | null } {
	const end = events.find((e) => e.type === 'finish' || e.type === 'abandon');
	if (end) return { status: end.type === 'finish' ? 'finished' : 'abandoned', settle: null };
	if (kind === 'sprint') return elapsedMs > SPRINT_STALE_MS ? { status: 'abandoned', settle: { type: 'abandon', ms: elapsedMs } } : { status: 'running', settle: null };
	if (elapsedMs <= RECALL_MS) return { status: 'running', settle: null };
	return elapsedMs <= RECALL_MS + RECALL_GRACE_MS
		? { status: 'finished', settle: { type: 'finish', ms: RECALL_MS } }
		: { status: 'abandoned', settle: { type: 'abandon', ms: elapsedMs } };
}

// ---------- selection ----------
export type SprintCandidate = { id: string; topic: string };

/**
 * `n` distinct problems: a problem used in one of the last two sprints costs 2, a second problem of an already chosen topic costs 1;
 * the cheapest is taken each step (ties by `rnd`). So fresh problems come first, then a mix of topics, and the order is a topic mix.
 */
export function pickSprint(cands: SprintCandidate[], recent: Set<string>, rnd: () => number, n = SPRINT_SIZE): string[] {
	const left = cands.map((c) => ({ ...c, r: rnd() }));
	const topics = new Set<string>();
	const out: string[] = [];
	while (out.length < n && left.length) {
		const cost = (c: SprintCandidate) => (recent.has(c.id) ? 2 : 0) + (topics.has(c.topic) ? 1 : 0);
		let best = 0;
		for (let i = 1; i < left.length; i++) if (cost(left[i]) < cost(left[best]) || (cost(left[i]) === cost(left[best]) && left[i].r < left[best].r)) best = i;
		const [c] = left.splice(best, 1);
		topics.add(c.topic);
		out.push(c.id);
	}
	return out;
}

export type RecallCandidate = { id: string; kind: string; topic: string; urgent: boolean /* due or last answered wrong */; lastAt: number | null /* unix seconds of the last review */ };

/** Urgent (due / missed) first, then least recently answered (never = oldest); the first `limit` are interleaved so neighbours differ in kind and topic where possible. */
export function orderRecall(cands: RecallCandidate[], limit = RECALL_LIST): string[] {
	const sorted = [...cands].sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.lastAt ?? 0) - (b.lastAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return interleave(sorted.slice(0, limit).map((c) => ({ ...c, groups: [`k:${c.kind}`, `t:${c.topic}`] }))).map((c) => c.id);
}

// ---------- Sprint ----------
export type SprintRow = {
	id: string;
	outcome: 'passed' | 'skipped' | null; // null = not reached
	splitMs: number | null;
	cumMs: number | null;
	runs: number; // judged runs
	lookups: string[]; // cheat entry ids, deduplicated, first-opened order
};
export type SprintSummary = { rows: SprintRow[]; done: number; skipped: number; totalMs: number | null /* all items left behind: ms of the last pass/skip */ };

/** Rows in the run's fixed order. A split runs from the previous pass/skip (or the start) to its own. */
export function sprintSummary(items: string[], events: SparEvent[]): SprintSummary {
	const rows: SprintRow[] = items.map((id) => ({ id, outcome: null, splitMs: null, cumMs: null, runs: 0, lookups: [] }));
	const by = new Map(rows.map((r) => [r.id, r]));
	let prev = 0;
	for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
		const r = e.itemId ? by.get(e.itemId) : undefined;
		if (!r) continue;
		if (e.type === 'run') r.runs++;
		else if (e.type === 'lookup') {
			const id = e.payload.entryId;
			if (typeof id === 'string' && !r.lookups.includes(id)) r.lookups.push(id);
		} else if ((e.type === 'pass' || e.type === 'skip') && r.outcome === null) {
			r.outcome = e.type === 'pass' ? 'passed' : 'skipped';
			r.cumMs = Math.max(prev, e.ms);
			r.splitMs = r.cumMs - prev;
			prev = r.cumMs;
		}
	}
	const done = rows.filter((r) => r.outcome !== null).length;
	return { rows, done, skipped: rows.filter((r) => r.outcome === 'skipped').length, totalMs: done === rows.length && rows.length > 0 ? prev : null };
}

export type RunInfo = { id: number; status: SparStatus };

/** The best Sprint: finished, nothing skipped, all problems passed, smallest total (tie: the earlier run). */
export function bestSprint<T extends RunInfo & { summary: SprintSummary }>(runs: T[]): T | null {
	let best: T | null = null;
	for (const r of runs) {
		if (r.status !== 'finished' || r.summary.skipped > 0 || r.summary.totalMs === null) continue;
		if (!best || r.summary.totalMs < best.summary.totalMs! || (r.summary.totalMs === best.summary.totalMs && r.id < best.id)) best = r;
	}
	return best;
}

/** Skipped problems and ones whose split exceeded the problem's own limit: sprint struggles, as (item, time of the event). */
export function sprintStruggles(rows: SprintRow[], events: SparEvent[], limitSec: (id: string) => number | undefined): { id: string; at: number }[] {
	return rows.flatMap((r) => {
		if (r.outcome === null) return [];
		const lim = limitSec(r.id);
		if (r.outcome === 'passed' && (lim === undefined || r.splitMs! <= lim * 1000)) return [];
		const e = events.find((x) => (x.type === 'pass' || x.type === 'skip') && x.itemId === r.id);
		return e ? [{ id: r.id, at: e.at }] : [];
	});
}

export type SprintExtreme = { id: string; deltaMs: number; basis: 'best' | 'limit' };

/**
 * Slowest (largest positive delta) and fastest (largest negative) problem. Baseline = the comparison run's split of that problem; if
 * no row has one, the problem's own limit. `bestSplit(id)` / `limitSec(id)` give them.
 */
export function sprintExtremes(rows: SprintRow[], bestSplit: (id: string) => number | null, limitSec: (id: string) => number): { slowest: SprintExtreme | null; fastest: SprintExtreme | null } {
	const reached = rows.filter((r) => r.outcome === 'passed' && r.splitMs !== null); // a skip is quick but says nothing about speed
	const basis = reached.some((r) => bestSplit(r.id) !== null) ? 'best' : 'limit';
	const deltas = reached.flatMap((r) => {
		const base = basis === 'best' ? bestSplit(r.id) : limitSec(r.id) * 1000;
		return base === null ? [] : [{ id: r.id, deltaMs: r.splitMs! - base, basis } as SprintExtreme];
	});
	const slowest = deltas.reduce<SprintExtreme | null>((a, d) => (d.deltaMs > 0 && (!a || d.deltaMs > a.deltaMs) ? d : a), null);
	const fastest = deltas.reduce<SprintExtreme | null>((a, d) => (d.deltaMs < 0 && (!a || d.deltaMs < a.deltaMs) ? d : a), null);
	return { slowest, fastest };
}

export const sprintLabel = (status: SparStatus, s: SprintSummary): string =>
	status === 'running' ? '진행 중' : status === 'abandoned' ? '중단' : s.skipped > 0 ? `건너뜀 ${s.skipped}` : fmtMs(s.totalMs ?? 0);

// ---------- Recall ----------
export type RecallSummary = { answered: number; correct: number; accuracy: number | null };

export function recallSummary(events: SparEvent[]): RecallSummary {
	const answers = events.filter((e) => e.type === 'answer');
	const correct = answers.filter((e) => e.payload.correct === true).length;
	return { answered: answers.length, correct, accuracy: answers.length ? correct / answers.length : null };
}

/** The best Recall: finished, accuracy >= 0.8, most right answers (tie: higher accuracy, then the earlier run). */
export function bestRecall<T extends RunInfo & { summary: RecallSummary }>(runs: T[]): T | null {
	let best: T | null = null;
	for (const r of runs) {
		const s = r.summary;
		if (r.status !== 'finished' || s.accuracy === null || s.accuracy < RECALL_BEST_ACCURACY) continue;
		if (!best || s.correct > best.summary.correct || (s.correct === best.summary.correct && s.accuracy > best.summary.accuracy!) || (s.correct === best.summary.correct && s.accuracy === best.summary.accuracy && r.id < best.id)) best = r;
	}
	return best;
}

export const recallLabel = (status: SparStatus, s: RecallSummary): string =>
	status === 'running' ? '진행 중' : status === 'abandoned' ? '중단' : s.accuracy === null ? '0개' : `${s.correct} · ${Math.round(s.accuracy * 100)}%`;
