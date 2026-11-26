import { tr } from './locale.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { accountRoot } from './auth.ts';

const context = new AsyncLocalStorage<{ id: string; database: DatabaseSync }>();
const connections = new Map<string, DatabaseSync>();

export function withAccount<T>(id: string, fn: () => T): T {
	if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid account');
	let database = connections.get(id);
	if (!database) {
		const directory = join(accountRoot(), 'users', id);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		database = new DatabaseSync(join(directory, 'trainer.db'));
		initialize(database);
		connections.set(id, database);
	}
	return context.run({ id, database }, fn);
}

export function accountId() {
	const account = context.getStore();
	if (!account) throw new Error(tr('로그인이 필요합니다.', 'Please sign in.'));
	return account.id;
}

export function db() {
	const account = context.getStore();
	if (!account) throw new Error(tr('로그인이 필요합니다.', 'Please sign in.'));
	return account.database;
}

const coachMessages = `
CREATE TABLE IF NOT EXISTS coach_messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, context_kind TEXT NOT NULL CHECK (context_kind IN ('lang', 'memo', 'stats')), context_id TEXT NOT NULL,
	session_id INTEGER, backend TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('user', 'coach')), text TEXT NOT NULL, ms INTEGER,
	access TEXT NOT NULL CHECK (access IN ('limited', 'full')), error INTEGER NOT NULL DEFAULT 0
);`;
const coachMessagesIndex = 'CREATE INDEX IF NOT EXISTS coach_messages_ctx ON coach_messages(context_kind, context_id, id);';

function migrateCoachMessages(database: DatabaseSync) {
	const current = () => database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'coach_messages'").get()?.sql;
	if (String(current()).includes("'stats'")) return;
	database.exec('BEGIN IMMEDIATE');
	try {
		if (!String(current()).includes("'stats'")) {
			database.exec(`
				ALTER TABLE coach_messages RENAME TO coach_messages_previous;
				${coachMessages}
				INSERT INTO coach_messages (id, at, context_kind, context_id, session_id, backend, role, text, ms, access, error)
				SELECT id, at, context_kind, context_id, session_id, backend, role, text, ms, access, error
				FROM coach_messages_previous;
				DROP TABLE coach_messages_previous;
				${coachMessagesIndex}
			`);
		}
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

function initialize(database: DatabaseSync) {
	database.prepare('ATTACH DATABASE ? AS catalog').run(join(accountRoot(), 'catalog.db'));
	database.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS catalog.problems (
	id TEXT PRIMARY KEY, contest_id INTEGER NOT NULL, idx TEXT NOT NULL, name TEXT NOT NULL,
	rating INTEGER NOT NULL, tags TEXT NOT NULL, solved_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cf_submissions (
	id INTEGER PRIMARY KEY, problem_id TEXT NOT NULL, verdict TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL, mode TEXT NOT NULL,
	started_at INTEGER NOT NULL, limit_sec INTEGER NOT NULL,
	ended_at INTEGER, outcome TEXT, elapsed_sec INTEGER
);
CREATE TABLE IF NOT EXISTS lang_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT NOT NULL, problem_id TEXT NOT NULL,
	started_at INTEGER NOT NULL, hints_used INTEGER NOT NULL DEFAULT 0,
	ended_at INTEGER, outcome TEXT CHECK (outcome IN ('passed', 'revealed')), elapsed_sec INTEGER, avoided TEXT
);
CREATE INDEX IF NOT EXISTS lang_sessions_problem ON lang_sessions(lang, problem_id);
CREATE TABLE IF NOT EXISTS lang_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, at INTEGER NOT NULL,
	status TEXT NOT NULL, code TEXT NOT NULL, result TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lang_runs_session ON lang_runs(session_id);
CREATE TABLE IF NOT EXISTS lang_lookups (
	id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, entry_id TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lang_lookups_session ON lang_lookups(session_id);
CREATE TABLE IF NOT EXISTS memo_reviews (
	id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL CHECK (item_type IN ('card', 'check')), item_id TEXT NOT NULL,
	at INTEGER NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4), elapsed_ms INTEGER NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memo_reviews_item ON memo_reviews(item_type, item_id);
-- Server-issued attempt ids for standalone memo checks so option order rotates per new attempt while staying stable across reload, locale switch, grading and solution lookup.
CREATE TABLE IF NOT EXISTS memo_check_attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT, check_id TEXT NOT NULL, started_at INTEGER NOT NULL, answered_at INTEGER
);
CREATE INDEX IF NOT EXISTS memo_check_attempts_open ON memo_check_attempts(check_id, answered_at, id);
-- Operator: every question and answer, append-only. session_id refers to a language session or a statistics run.
${coachMessages}
${coachMessagesIndex}
-- Sparring: append-only. A run fixes its item ids at the start; everything else (totals, splits, best, labels) is recomputed from the events.
CREATE TABLE IF NOT EXISTS spar_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('sprint', 'recall')),
	started_at INTEGER NOT NULL, started_ms INTEGER NOT NULL, items TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spar_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL, ms INTEGER NOT NULL,
	type TEXT NOT NULL CHECK (type IN ('run', 'pass', 'skip', 'lookup', 'answer', 'finish', 'abandon')), item_id TEXT, payload TEXT NOT NULL,
	UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS spar_events_run ON spar_events(run_id, seq);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pdf_sets (
	id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, source_name TEXT NOT NULL, content TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pdf_question_attempts (
	set_id TEXT NOT NULL REFERENCES pdf_sets(id) ON DELETE CASCADE,
	question_index INTEGER NOT NULL CHECK (question_index >= 0),
	started_at INTEGER NOT NULL, answered_at INTEGER, selected INTEGER,
	CHECK ((answered_at IS NULL) = (selected IS NULL)),
	PRIMARY KEY (set_id, question_index)
);
-- Garden: weekly readings written on request (append-only). body = JSON { sentences: [{ text, facts: [{ id, text }] }] }, the cited facts as they were when written.
CREATE TABLE IF NOT EXISTS garden_readings (
	id INTEGER PRIMARY KEY AUTOINCREMENT, week_key TEXT NOT NULL, created_at INTEGER NOT NULL, backend TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS garden_readings_week ON garden_readings(week_key, id);
-- Debrief (all append-only). lang_marks: what the problem page saw while a session was open (hint taken, tab hidden/shown, no input for a minute / input again).
CREATE TABLE IF NOT EXISTS lang_marks (
	id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, at INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('hint', 'away', 'back', 'idle', 'active'))
);
CREATE INDEX IF NOT EXISTS lang_marks_session ON lang_marks(session_id, id);
-- One tap after a session (optional); the latest row per session counts, 'none' takes it back.
CREATE TABLE IF NOT EXISTS lang_self (
	id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, at INTEGER NOT NULL,
	state TEXT NOT NULL CHECK (state IN ('clear', 'fair', 'foggy', 'none'))
);
-- Pattern notes added to the review deck; the note's check becomes a memo check from then on.
CREATE TABLE IF NOT EXISTS debrief_deck (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, at INTEGER NOT NULL);
-- The learner's own one-line version of a rule; the latest per pattern counts.
CREATE TABLE IF NOT EXISTS debrief_mine (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL);
-- The experiment chosen under the coaching; the latest row counts, '' = none.
CREATE TABLE IF NOT EXISTS debrief_choices (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, choice TEXT NOT NULL);
-- Coaching written on request. body = JSON { sentences: [{ text, facts: [{ id, text }] }] }, the cited facts as they were when written.
CREATE TABLE IF NOT EXISTS debrief_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, backend TEXT NOT NULL, body TEXT NOT NULL);
`);
	migrateCoachMessages(database);
	// Seed the shared public catalogue from the old single-user file when present.
	if (database.prepare("SELECT 1 FROM main.sqlite_schema WHERE type='table' AND name='problems'").get()) {
		database.exec('INSERT OR IGNORE INTO catalog.problems SELECT * FROM main.problems');
	}
}

/** Runs fn inside a transaction. */
export function tx<T>(fn: () => T): T {
	db().exec('BEGIN');
	try {
		const out = fn();
		db().exec('COMMIT');
		return out;
	} catch (e) {
		db().exec('ROLLBACK');
		throw e;
	}
}
