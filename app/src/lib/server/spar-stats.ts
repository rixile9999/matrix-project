import { fmtMs } from '#lib/core/spar.ts';
import type { Outcome } from '#lib/stats/types.ts';
import type { SparRecordRow } from '#lib/types.ts';
import { db, tx } from './db.ts';
import { tr } from './locale.ts';
import { actOnRun, courseView, findLesson, runView, startSparLesson } from './stats.ts';

export const STATS_ROUND_SIZE = 3;

type Round = {
	id: number;
	started_ms: number;
	ended_ms: number | null;
	abandoned: number;
	lesson_ids: string;
};

type Item = {
	position: number;
	run_id: number;
	lesson_id: string;
	started_ms: number;
	deadline_ms: number;
	ended_ms: number | null;
	outcome: Outcome | null;
	hints: number;
	looked_up: number;
	abandoned_ms: number | null;
};

function storage() {
	const database = db();
	database.exec(`
		CREATE TABLE IF NOT EXISTS stats_spar_rounds (
			id INTEGER PRIMARY KEY AUTOINCREMENT, started_ms INTEGER NOT NULL,
			ended_ms INTEGER, abandoned INTEGER NOT NULL DEFAULT 0, lesson_ids TEXT NOT NULL
		);
		CREATE UNIQUE INDEX IF NOT EXISTS stats_spar_rounds_active ON stats_spar_rounds((1)) WHERE ended_ms IS NULL;
	`);
	return database;
}

function currentItems(id: number) {
	return db().prepare(`
		SELECT position, run_id, lesson_id, started_ms, deadline_ms, ended_ms, outcome, hints, looked_up, abandoned_ms
		FROM stats_spar_items JOIN stats_runs ON id = run_id
		WHERE round_id = ? ORDER BY position
	`).all(id) as Item[];
}

const lessonIds = (round: Pick<Round, 'lesson_ids'>) => JSON.parse(round.lesson_ids) as string[];
export const sparStatsPool = (now = Date.now()) => courseView(now).catalogue;

function selectLessons(pool: ReturnType<typeof sparStatsPool>, recent: Set<string>): string[] {
	const weakness = (status: (typeof pool)[number]['status']) => status === 'timeout' || status === 'revealed';
	const remaining = [...pool].sort((a, b) =>
		Number(recent.has(a.id)) - Number(recent.has(b.id))
		|| Number(weakness(b.status)) - Number(weakness(a.status))
		|| (a.latestId ?? 0) - (b.latestId ?? 0)
		|| a.seconds - b.seconds);
	const selected: typeof pool = [];
	while (remaining.length && selected.length < STATS_ROUND_SIZE) {
		const nextTopic = remaining.findIndex((lesson) => selected.every((item) => item.topic !== lesson.topic));
		const [next] = remaining.splice(Math.max(0, nextTopic), 1);
		selected.push(next);
	}
	return selected.sort((a, b) => a.seconds - b.seconds).map(({ id }) => id);
}

function endRound(round: Round, at: number, abandoned: boolean) {
	db().prepare('UPDATE stats_spar_rounds SET ended_ms = ?, abandoned = ? WHERE id = ?')
		.run(at, Number(abandoned), round.id);
	round.ended_ms = at;
	round.abandoned = Number(abandoned);
}

/** Background settlement can expire only a question the learner has already started. */
function settleRound(round: Round, now: number) {
	const items = currentItems(round.id);
	if (round.ended_ms !== null) return items;
	const item = items.at(-1)!;
	const lesson = findLesson(item.lesson_id);
	if (!lesson) {
		abandonRound(round, item, now);
		return items;
	}
	if (item.outcome === null && item.deadline_ms <= now) {
		const view = runView(lesson, item.run_id, now, round.id)!;
		item.outcome = view.outcome;
		item.ended_ms = item.deadline_ms;
	}
	if (item.ended_ms !== null && items.length === lessonIds(round).length) endRound(round, item.ended_ms, false);
	return items;
}

function abandonRound(round: Round, item: Item, at: number) {
	if (item.outcome === null) {
		db().prepare('UPDATE stats_spar_items SET abandoned_ms = ? WHERE run_id = ?').run(at, item.run_id);
		item.abandoned_ms = at;
	}
	endRound(round, at, true);
}

const itemElapsed = (item: Item) => (item.ended_ms ?? item.abandoned_ms ?? item.started_ms) - item.started_ms;
const elapsed = (items: Item[]) => items.reduce((total, item) => total + itemElapsed(item), 0);

/** May settle an expired round. Call inside a transaction. */
export function activeStatsRound(now: number) {
	const round = storage().prepare('SELECT * FROM stats_spar_rounds WHERE ended_ms IS NULL').get() as Round | undefined;
	if (!round) return null;
	settleRound(round, now);
	return round.ended_ms === null ? { id: round.id, kind: 'stats' as const } : null;
}

/** Opens a round after the caller checks for an active round of any kind. */
export function createStatsRound(pool: ReturnType<typeof sparStatsPool>, now: number) {
	const database = storage();
	const recent = new Set((database.prepare('SELECT lesson_ids FROM stats_spar_rounds ORDER BY id DESC LIMIT 2')
		.all() as Pick<Round, 'lesson_ids'>[]).flatMap(lessonIds));
	const ids = selectLessons(pool, recent);
	const first = findLesson(ids[0])!;
	const id = Number(database.prepare('INSERT INTO stats_spar_rounds (started_ms, lesson_ids) VALUES (?, ?)').
		run(now, JSON.stringify(ids)).lastInsertRowid);
	startSparLesson(first, id, 0, now);
	return id;
}

export function statsRoundView(id: number, now = Date.now()) {
	return tx(() => {
		const round = storage().prepare('SELECT * FROM stats_spar_rounds WHERE id = ?').get(id) as Round | undefined;
		if (!round) return null;
		const items = settleRound(round, now);
		const total = lessonIds(round).length;
		if (round.ended_ms !== null) {
			return {
				id, total, phase: 'result' as const, abandoned: Boolean(round.abandoned),
				elapsedMs: elapsed(items),
				solved: items.filter((item) => item.outcome === 'passed').length,
				items: items.flatMap((item) => {
					const lesson = findLesson(item.lesson_id);
					if (!lesson) return [];
					const view = runView(lesson, item.run_id, now, id)!;
					return [{
						runId: item.run_id, lesson: view.lesson, outcome: item.outcome, review: view.review,
						elapsedMs: itemElapsed(item), fields: view.fields,
						usedReference: Boolean(item.looked_up), hints: item.hints
					}];
				})
			};
		}
		const item = items.at(-1)!;
		const view = runView(findLesson(item.lesson_id)!, item.run_id, now, id)!;
		if (item.outcome) {
			return { id, total, phase: 'next' as const, position: item.position, runId: item.run_id, lesson: view.lesson, outcome: item.outcome };
		}
		return {
			id, total, phase: 'question' as const, position: item.position,
			runId: item.run_id, remainingMs: Math.max(0, item.deadline_ms - now),
			lesson: view.lesson, fields: view.fields, hints: view.hints, reference: view.reference
		};
	});
}

export type RoundOperation = 'check' | 'hint' | 'reference' | 'next' | 'abandon';
type RoundError = Exclude<ReturnType<typeof actOnRun>, null> | 'moved';

export function actOnStatsRound(
	id: number, itemId: number, operation: RoundOperation, values: string[], now = Date.now()
): RoundError | null {
	return tx(() => {
		const round = storage().prepare('SELECT * FROM stats_spar_rounds WHERE id = ?').get(id) as Round | undefined;
		if (!round) return 'unavailable';
		const items = settleRound(round, now);
		if (round.ended_ms !== null) return null;
		const item = items.at(-1)!;
		if (item.run_id !== itemId) return 'moved';
		if (operation === 'abandon') {
			abandonRound(round, item, now);
			return null;
		}
		if (operation === 'next' && item.outcome) {
			const next = findLesson(lessonIds(round)[items.length]);
			if (next) startSparLesson(next, round.id, items.length, now);
			else endRound(round, now, true);
			return null;
		}
		if (item.outcome || operation === 'next') return 'moved';
		const result = actOnRun(findLesson(item.lesson_id)!, item.run_id, operation, values, now, id);
		if (!result && operation === 'check') settleRound(round, now);
		return result;
	});
}

export function statsRecords(now = Date.now()): SparRecordRow[] {
	return tx(() => {
		const database = storage();
		activeStatsRound(now);
		const rounds = database.prepare('SELECT * FROM stats_spar_rounds ORDER BY id').all() as Round[];
		const rows = rounds.map((r): SparRecordRow => {
			const items = currentItems(r.id);
			const total = lessonIds(r).length;
			const correct = items.filter((item) => item.outcome === 'passed').length;
			const status = r.ended_ms === null ? 'running' : r.abandoned ? 'abandoned' : 'finished';
			const totalMs = r.ended_ms === null ? null : elapsed(items);
			return {
				id: r.id, kind: 'stats', startedAt: Math.floor(r.started_ms / 1000), status,
				label: status === 'running' ? tr('진행 중', 'In progress')
					: status === 'abandoned' ? tr('중단', 'Abandoned')
						: `${correct}/${total} · ${fmtMs(totalMs!)}`,
				totalMs, skipped: 0, answered: items.filter((item) => item.outcome !== null).length,
				correct, accuracy: correct / total, best: false
			};
		});
		// Rounds use different questions; compare solved counts across them without breaking ties by speed.
		let best: SparRecordRow | undefined;
		for (const row of rows) {
			if (row.status === 'finished' && row.correct > (best?.correct ?? 0)) best = row;
		}
		if (best) best.best = true;
		return rows;
	});
}
