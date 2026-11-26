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
	`);
	return database;
}

function expireRuns(now: number) {
	db().prepare(`
		UPDATE stats_runs SET outcome = 'timeout', ended_ms = deadline_ms
		WHERE outcome IS NULL AND deadline_ms <= ?
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
	const runs = database.prepare('SELECT * FROM stats_runs ORDER BY id DESC').all() as Run[];
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
	return { catalogue, recommendation };
}

export function startRun(lesson: Lesson, now = Date.now()) {
	const database = storage();
	return tx(() => {
		expireRuns(now);
		const active = database.prepare('SELECT id FROM stats_runs WHERE lesson_id = ? AND outcome IS NULL ORDER BY id DESC LIMIT 1')
			.get(lesson.id);
		if (active) return Number(active.id);
		const result = database.prepare('INSERT INTO stats_runs (lesson_id, started_ms, deadline_ms) VALUES (?, ?, ?)')
			.run(lesson.id, now, now + lesson.seconds * 1000);
		return Number(result.lastInsertRowid);
	});
}

export function runView(lesson: Lesson, id: number, now = Date.now()) {
	const database = storage();
	expireRuns(now);
	const run = database.prepare('SELECT * FROM stats_runs WHERE id = ? AND lesson_id = ?')
		.get(id, lesson.id) as Run | undefined;
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
		reference: run.looked_up ? lesson.reference : null,
		review: run.outcome ? { solution: lesson.solution, intent: lesson.intent } : null
	};
}

export function act(
	lesson: Lesson, id: number, operation: Operation, values: string[] = [], now = Date.now()
): 'unavailable' | 'hints' | 'invalid' | null {
	const database = storage();
	return tx(() => {
		expireRuns(now);
		const run = database.prepare('SELECT * FROM stats_runs WHERE id = ? AND lesson_id = ?')
			.get(id, lesson.id) as Run | undefined;
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
				const numbers = values.map(parseNumber);
				if (numbers.length !== lesson.fields.length || numbers.some((number) => !Number.isFinite(number))) return 'invalid';
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
	});
}
