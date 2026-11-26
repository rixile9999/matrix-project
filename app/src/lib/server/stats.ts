import { db, tx } from './db.ts';
import { lessons } from './stats-content.ts';
import type { Lesson, Outcome } from '#lib/stats/types.ts';

type Run = {
	id: number;
	lesson_id: string;
	started_ms: number;
	deadline_ms: number;
	ended_ms: number | null;
	outcome: Outcome | null;
	hints: number;
	looked_up: number;
};

type Submission = {
	values_json: string;
	checks_json: string;
};

type Operation = 'check' | 'hint' | 'reference' | 'reveal';

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function parseNumber(value: string): number {
	const input = value.trim().replaceAll('−', '-');
	const [numerator, denominator, extra] = input.split('/').map((part) => part.trim());
	if (extra !== undefined || numerator === undefined) return NaN;
	if (input.endsWith('%')) {
		const percent = input.slice(0, -1).trim();
		return numberPattern.test(percent) ? Number(percent) / 100 : NaN;
	}
	if (!numberPattern.test(numerator)) return NaN;
	if (denominator === undefined) return Number(numerator);
	if (!numberPattern.test(denominator)) return NaN;
	return Number(numerator) / Number(denominator);
}

function storage() {
	const database = db();
	database.exec(`
		CREATE TABLE IF NOT EXISTS stats_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT NOT NULL,
			started_ms INTEGER NOT NULL, deadline_ms INTEGER NOT NULL,
			ended_ms INTEGER, outcome TEXT CHECK (outcome IN ('passed', 'revealed', 'timeout')),
			hints INTEGER NOT NULL DEFAULT 0 CHECK (hints BETWEEN 0 AND 2),
			looked_up INTEGER NOT NULL DEFAULT 0 CHECK (looked_up IN (0, 1))
		);
		CREATE INDEX IF NOT EXISTS stats_runs_lesson ON stats_runs(lesson_id, id);
		CREATE TABLE IF NOT EXISTS stats_submissions (
			id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES stats_runs(id),
			submitted_ms INTEGER NOT NULL, values_json TEXT NOT NULL, checks_json TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS stats_submissions_run ON stats_submissions(run_id, id);
		CREATE TABLE IF NOT EXISTS stats_spar_items (
			round_id INTEGER NOT NULL, position INTEGER NOT NULL,
			run_id INTEGER NOT NULL UNIQUE REFERENCES stats_runs(id), abandoned_ms INTEGER,
			PRIMARY KEY (round_id, position)
		);
	`);
	return database;
}

function expireRuns(now: number) {
	db().prepare(`
		UPDATE stats_runs SET outcome = 'timeout', ended_ms = deadline_ms
		WHERE outcome IS NULL AND deadline_ms <= ?
			AND NOT EXISTS (SELECT 1 FROM stats_spar_items WHERE run_id = stats_runs.id AND abandoned_ms IS NOT NULL)
	`).run(now);
}

function finish(id: number, outcome: Outcome, now: number) {
	db().prepare(`UPDATE stats_runs SET outcome = ?, ended_ms = ? WHERE id = ?`).run(outcome, now, id);
}

export function findLesson(id: string) {
	return lessons.find((lesson) => lesson.id === id);
}

function publicLesson(lesson: Lesson) {
	const { id, topic, mode, seconds, title, targets } = lesson;
	return { id, topic, mode, seconds, title, targets };
}

export function courseView(now = Date.now()) {
	const database = storage();
	expireRuns(now);
	const runs = database.prepare(`
		SELECT stats_runs.* FROM stats_runs LEFT JOIN stats_spar_items ON run_id = stats_runs.id
		WHERE run_id IS NULL OR outcome IS NOT NULL
		ORDER BY (outcome IS NULL) DESC, stats_runs.id DESC
	`).all() as Run[];
	const catalogue = lessons.map((lesson) => {
		const attempts = runs.filter((run) => run.lesson_id === lesson.id);
		const latest = attempts[0];
		const best = attempts.reduce<number | null>((best, run) => {
			if (run.outcome !== 'passed' || run.ended_ms === null) return best;
			const elapsed = Math.floor((run.ended_ms - run.started_ms) / 1000);
			return best === null ? elapsed : Math.min(best, elapsed);
		}, null);
		const status: Outcome | 'active' | 'new' = latest ? latest.outcome ?? 'active' : 'new';
		return { ...publicLesson(lesson), status, latestId: latest?.id ?? null, best };
	});
	const unfinished = catalogue.filter((lesson) => lesson.best === null || lesson.status === 'active');
	const selected = new Set<string>();
	const recommendation = [
		unfinished.find((lesson) => lesson.status === 'active'),
		unfinished.find((lesson) => lesson.status === 'timeout' || lesson.status === 'revealed'),
		unfinished.find((lesson) => lesson.topic === 'probability' && lesson.status === 'new'),
		unfinished.find((lesson) => lesson.topic === 'inference' && lesson.status === 'new'),
		...unfinished,
		...catalogue
	].filter((lesson): lesson is typeof catalogue[number] => {
		if (!lesson || selected.has(lesson.id)) return false;
		selected.add(lesson.id);
		return true;
	}).slice(0, 3);
	return { catalogue, recommendation, hasReviews: runs.some((run) => run.outcome !== null) };
}

/** Account-local, completed attempts. Accuracy describes the last submitted answers. */
export function statsHistory(now = Date.now()) {
	const database = storage();
	expireRuns(now);
	const rows = database.prepare(`
		SELECT r.*,
			(SELECT COUNT(*) FROM stats_submissions WHERE run_id = r.id) AS submissions,
			(SELECT checks_json FROM stats_submissions WHERE run_id = r.id ORDER BY id DESC LIMIT 1) AS last_checks,
			(SELECT json_group_array(DISTINCT j.key) FROM stats_submissions s, json_each(s.checks_json) j
			 WHERE s.run_id = r.id AND j.value = 0) AS missed
		FROM stats_runs r WHERE r.outcome IS NOT NULL ORDER BY r.ended_ms DESC, r.id DESC
	`).all() as (Run & { submissions: number; last_checks: string | null; missed: string })[];
	return rows.flatMap((row) => {
		const lesson = findLesson(row.lesson_id);
		if (!lesson || row.ended_ms === null || !row.outcome) return [];
		const checks: boolean[] = JSON.parse(row.last_checks ?? '[]');
		const missedFields: number[] = JSON.parse(row.missed);
		return [{
			id: row.id, lessonId: lesson.id, title: lesson.title, topic: lesson.topic, mode: lesson.mode,
			seconds: (row.deadline_ms - row.started_ms) / 1000,
			startedAt: row.started_ms / 1000, endedAt: row.ended_ms / 1000, outcome: row.outcome,
			hints: row.hints, usedReference: Boolean(row.looked_up),
			submissions: row.submissions, correctFields: checks.filter(Boolean).length, totalFields: lesson.fields.length,
			missedFields
		}];
	});
}

export function startRun(lesson: Lesson, now = Date.now()) {
	const database = storage();
	return tx(() => {
		expireRuns(now);
		const active = database.prepare(`
			SELECT id FROM stats_runs WHERE lesson_id = ? AND outcome IS NULL
				AND NOT EXISTS (SELECT 1 FROM stats_spar_items WHERE run_id = stats_runs.id)
			ORDER BY id DESC LIMIT 1
		`).get(lesson.id);
		if (active) return Number(active.id);
		return insertRun(lesson, now);
	});
}

function insertRun(lesson: Lesson, now: number) {
	const result = db().prepare('INSERT INTO stats_runs (lesson_id, started_ms, deadline_ms) VALUES (?, ?, ?)')
		.run(lesson.id, now, now + lesson.seconds * 1000);
	return Number(result.lastInsertRowid);
}

/** Starts a lesson for the given round slot inside the caller's transaction. */
export function startSparLesson(lesson: Lesson, roundId: number, position: number, now: number) {
	const id = insertRun(lesson, now);
	db().prepare('INSERT INTO stats_spar_items (round_id, position, run_id) VALUES (?, ?, ?)').run(roundId, position, id);
	return id;
}

export function runView(lesson: Lesson, id: number, now = Date.now(), roundId: number | null = null) {
	const database = storage();
	expireRuns(now);
	const run = database.prepare(`
		SELECT stats_runs.* FROM stats_runs LEFT JOIN stats_spar_items ON run_id = id
		WHERE id = ? AND lesson_id = ?
			AND (round_id = ? OR (? IS NULL AND (round_id IS NULL OR outcome IS NOT NULL)))
	`).get(id, lesson.id, roundId, roundId) as Run | undefined;
	if (!run) return null;
	const last = database.prepare('SELECT values_json, checks_json FROM stats_submissions WHERE run_id = ? ORDER BY id DESC LIMIT 1')
		.get(id) as Submission | undefined;
	const checks = last ? JSON.parse(last.checks_json) as boolean[] : [];
	const values = last ? JSON.parse(last.values_json) as string[] : [];
	return {
		lesson: { ...publicLesson(lesson), prompt: lesson.prompt },
		id,
		deadline: run.deadline_ms,
		elapsed: run.ended_ms === null ? null : Math.floor((run.ended_ms - run.started_ms) / 1000),
		outcome: run.outcome,
		fields: lesson.fields.map((field, index) => ({
			label: field.label,
			value: values[index] ?? '',
			correct: checks[index] ?? null,
			feedback: checks[index] === false ? field.feedback : null
		})),
		hints: lesson.hints.slice(0, run.hints),
		reference: run.looked_up || run.outcome ? lesson.reference : null,
		review: run.outcome ? { solution: lesson.solution, intent: lesson.intent, usedReference: Boolean(run.looked_up) } : null
	};
}

export function act(
	lesson: Lesson, id: number, operation: Operation, values: string[] = [], now = Date.now()
): 'unavailable' | 'hints' | 'invalid' | null {
	storage();
	return tx(() => actOnRun(lesson, id, operation, values, now, null));
}

/** Applies the same grading and support rules to a lesson inside its round transaction. */
export function actOnRun(
	lesson: Lesson, id: number, operation: Operation, values: string[], now: number, roundId: number | null
): 'unavailable' | 'hints' | 'invalid' | null {
	expireRuns(now);
	const database = db();
	const run = database.prepare(`
		SELECT stats_runs.* FROM stats_runs LEFT JOIN stats_spar_items ON run_id = id
		WHERE id = ? AND lesson_id = ? AND round_id IS ? AND abandoned_ms IS NULL
	`).get(id, lesson.id, roundId) as Run | undefined;
	if (!run) return 'unavailable';
	if (run.outcome) return null;
	switch (operation) {
		case 'hint':
			database.prepare('UPDATE stats_runs SET hints = MIN(hints + 1, 2) WHERE id = ?').run(id);
			break;
		case 'reference':
			database.prepare('UPDATE stats_runs SET looked_up = 1 WHERE id = ?').run(id);
			break;
		case 'reveal':
			if (run.hints < 2) return 'hints';
			finish(id, 'revealed', now);
			break;
		case 'check': {
			if (values.length !== lesson.fields.length) return 'invalid';
			const numbers = values.map(parseNumber);
			if (numbers.some((number) => !Number.isFinite(number))) return 'invalid';
			const checks = lesson.fields.map(({ answer }, index) => {
				const number = numbers[index];
				if (number === undefined) return false;
				const tolerance = Math.min(0.00005, Math.abs(answer) / 1000);
				return Math.abs(number - answer) <= Math.max(1e-12, tolerance);
			});
			database.prepare('INSERT INTO stats_submissions (run_id, submitted_ms, values_json, checks_json) VALUES (?, ?, ?, ?)')
				.run(id, now, JSON.stringify(values), JSON.stringify(checks));
			if (checks.every(Boolean)) finish(id, 'passed', now);
		}
	}
	return null;
}

/** Recent accepted submissions for a completed run in the signed-in account. Oldest first. */
export function statsCoachSubmissions(id: number) {
	const rows = db().prepare(`
		SELECT values_json, checks_json
		FROM stats_submissions
		JOIN stats_runs ON stats_runs.id = stats_submissions.run_id
		WHERE stats_runs.id = ? AND stats_runs.ended_ms IS NOT NULL
		ORDER BY stats_submissions.id DESC LIMIT 8
	`).all(id) as Submission[];
	return rows.reverse().map(({ values_json, checks_json }) => ({
		values: JSON.parse(values_json) as string[],
		checks: JSON.parse(checks_json) as boolean[]
	}));
}
