// Sparring storage: the append-only run / event tables. No rules here (see core/spar.ts) and no dependency on the language pack,
// so lang.ts can read sprint struggles without an import cycle.
import { db } from './db.ts';
import { runStatus, sprintStruggles as struggles, sprintSummary, type SparEvent, type SparKind, type SparStatus } from '#lib/core/spar.ts';
import type { SprintStruggle } from '#lib/core/study.ts';
import type { LangProblem, TopicId } from '#lib/core/lang.ts';

export type RunRow = { id: number; kind: SparKind; startedAt: number; startedMs: number; items: string[] };
type RawRun = { id: number; kind: SparKind; started_at: number; started_ms: number; items: string };
type RawEvent = { run_id: number; seq: number; at: number; ms: number; type: SparEvent['type']; item_id: string | null; payload: string };

const row = (r: RawRun): RunRow => ({ id: r.id, kind: r.kind, startedAt: r.started_at, startedMs: r.started_ms, items: JSON.parse(r.items) as string[] });
const event = (e: RawEvent): SparEvent => ({ seq: e.seq, at: e.at, ms: e.ms, type: e.type, itemId: e.item_id, payload: JSON.parse(e.payload) as Record<string, unknown> });

export const getRun = (id: number): RunRow | null => {
	const r = db().prepare('SELECT * FROM spar_runs WHERE id = ?').get(id) as RawRun | undefined;
	return r ? row(r) : null;
};

/** Events of one run in order. `light` replaces the (large) payload of judged runs by {}: enough to count them. */
export function eventsOf(runId: number, light = false): SparEvent[] {
	const sql = light ? "SELECT run_id, seq, at, ms, type, item_id, CASE WHEN type = 'run' THEN '{}' ELSE payload END AS payload" : 'SELECT run_id, seq, at, ms, type, item_id, payload';
	return (db().prepare(`${sql} FROM spar_events WHERE run_id = ? ORDER BY seq`).all(runId) as RawEvent[]).map(event);
}

export type RunWithEvents = RunRow & { events: SparEvent[] };

/** Every run (optionally of one kind), oldest first, with light events. */
export function allRuns(kind?: SparKind): RunWithEvents[] {
	const runs = (db().prepare(kind ? 'SELECT * FROM spar_runs WHERE kind = ? ORDER BY id' : 'SELECT * FROM spar_runs ORDER BY id').all(...(kind ? [kind] : [])) as RawRun[]).map(row);
	const by = new Map<number, SparEvent[]>();
	const evs = db()
		.prepare("SELECT run_id, seq, at, ms, type, item_id, CASE WHEN type = 'run' THEN '{}' ELSE payload END AS payload FROM spar_events ORDER BY run_id, seq")
		.all() as RawEvent[];
	for (const e of evs) by.set(e.run_id, [...(by.get(e.run_id) ?? []), event(e)]);
	return runs.map((r) => ({ ...r, events: by.get(r.id) ?? [] }));
}

export function createRun(kind: SparKind, items: string[], startedMs = Date.now()): number {
	return Number(db().prepare('INSERT INTO spar_runs(kind, started_at, started_ms, items) VALUES(?,?,?,?)').run(kind, Math.floor(startedMs / 1000), startedMs, JSON.stringify(items)).lastInsertRowid);
}

/** Appends the next event of a run (seq = last + 1). Not atomic by itself: call inside tx() when the decision depends on earlier events. */
export function appendEvent(runId: number, type: SparEvent['type'], ms: number, itemId: string | null = null, payload: object = {}): void {
	const next = (db().prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM spar_events WHERE run_id = ?').get(runId) as { n: number }).n;
	db().prepare('INSERT INTO spar_events(run_id, seq, at, ms, type, item_id, payload) VALUES(?,?,?,?,?,?,?)').run(runId, next, Math.floor(Date.now() / 1000), ms, type, itemId, JSON.stringify(payload));
}

export const isOpen = (runId: number) => !db().prepare("SELECT 1 FROM spar_events WHERE run_id = ? AND type IN ('finish', 'abandon') LIMIT 1").get(runId);

/** Appends the lazy terminal event for every open run that cannot go on (see runStatus). Returns the runs' statuses. */
export function settleAll(now = Date.now()): Map<number, SparStatus> {
	const out = new Map<number, SparStatus>();
	for (const r of allRuns()) {
		const s = runStatus(r.kind, r.events, now - r.startedMs);
		if (s.settle && isOpen(r.id)) appendEvent(r.id, s.settle.type, s.settle.ms);
		out.set(r.id, s.status);
	}
	return out;
}

/** Settles one run and returns it with its status. */
export function settleOne(id: number, now = Date.now()): { run: RunRow; status: SparStatus } | null {
	const run = getRun(id);
	if (!run) return null;
	const s = runStatus(run.kind, eventsOf(id, true), now - run.startedMs);
	if (s.settle && isOpen(id)) appendEvent(id, s.settle.type, s.settle.ms);
	return { run, status: s.status };
}

/**
 * Sprint problems the learner struggled with (skipped, or a split over the problem's own limit), as struggled level-1 sessions of their topic.
 * `problemOf` looks a level-1 problem up (unknown ones are ignored). Used by the warm-up suggestion on /lang.
 */
export function sprintStruggleSessions(problemOf: (id: string) => Pick<LangProblem, 'topic' | 'limitSec'> | undefined): SprintStruggle[] {
	return allRuns('sprint').flatMap((r) => {
		const rows = sprintSummary(r.items, r.events).rows;
		return struggles(rows, r.events, (id) => problemOf(id)?.limitSec).flatMap((s) => {
			const p = problemOf(s.id);
			return p ? [{ topic: p.topic as TopicId, endedAt: s.at }] : [];
		});
	});
}
