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

const pdfQuestionAttempts = `
CREATE TABLE IF NOT EXISTS main.pdf_question_attempts (
	set_id TEXT NOT NULL,
	question_index INTEGER NOT NULL CHECK (question_index >= 0),
	started_at INTEGER NOT NULL, answered_at INTEGER, selected INTEGER,
	CHECK ((answered_at IS NULL) = (selected IS NULL)),
	PRIMARY KEY (set_id, question_index)
);`;

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

function migratePdfQuestionAttempts(database: DatabaseSync) {
	// Attempts stay in the account database and can refer to sets in either database.
	const hasLocalForeignKey = () => database.prepare('PRAGMA main.foreign_key_list(pdf_question_attempts)').get();
	if (!hasLocalForeignKey()) return;
	database.exec('BEGIN IMMEDIATE');
	try {
		if (hasLocalForeignKey()) {
			database.exec(`
				ALTER TABLE main.pdf_question_attempts RENAME TO pdf_question_attempts_previous;
				${pdfQuestionAttempts}
				INSERT INTO main.pdf_question_attempts (set_id, question_index, started_at, answered_at, selected)
				SELECT set_id, question_index, started_at, answered_at, selected
				FROM main.pdf_question_attempts_previous;
				DROP TABLE main.pdf_question_attempts_previous;
			`);
		}
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

function initialize(database: DatabaseSync) {
	database.exec('PRAGMA busy_timeout = 5000');
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
CREATE TABLE IF NOT EXISTS main.pdf_generation_jobs (
	request_id TEXT PRIMARY KEY, source_name TEXT NOT NULL, started_at INTEGER NOT NULL, process_id TEXT NOT NULL,
	stage TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 1, error TEXT
);
CREATE TABLE IF NOT EXISTS main.pdf_sets (
	id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, source_name TEXT NOT NULL, content TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog.pdf_sets (
	id TEXT PRIMARY KEY, account_id TEXT NOT NULL, request_id TEXT NOT NULL, source_name TEXT NOT NULL, content TEXT NOT NULL,
	UNIQUE (account_id, request_id)
);
-- Descent: sub-problem links shared by all members. Only problem ids, the gap label and counters; never a learner's code or words.
CREATE TABLE IF NOT EXISTS catalog.descent_links (
	parent_id TEXT NOT NULL, sub_id TEXT NOT NULL, gap TEXT NOT NULL, offered INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (parent_id, sub_id)
);
${pdfQuestionAttempts}
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
-- Generated, machine-verified trace exercises per note pattern. body = JSON Drill; state: ready | added | dropped.
CREATE TABLE IF NOT EXISTS debrief_drills (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, created_at INTEGER NOT NULL,
	backend TEXT NOT NULL, reviewer TEXT NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready', state_at INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS debrief_drills_hash ON debrief_drills(pattern_id, hash);
-- One row per generation job (running | done | failed); error is a short code. auto = started by a finished session, not by the learner.
CREATE TABLE IF NOT EXISTS debrief_drill_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
	process_id TEXT NOT NULL, backend TEXT NOT NULL, status TEXT NOT NULL, asked INTEGER NOT NULL DEFAULT 0, kept INTEGER NOT NULL DEFAULT 0, error TEXT,
	auto INTEGER NOT NULL DEFAULT 0);
-- The learner's switch for background generation; the latest row counts, no row = on.
CREATE TABLE IF NOT EXISTS debrief_drill_auto (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, enabled INTEGER NOT NULL);
-- Descent (coach chat + editor). A thread is one conversation; its open frames are the stack of problems (root first), each pointing at an ordinary lang_sessions row.
-- pending = JSON { kind, problemId?, gap? } while the learner has an offer to answer. Event / hint / example messages are stored as codes and worded when read.
CREATE TABLE IF NOT EXISTS descent_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, ended_at INTEGER, backend TEXT NOT NULL, pending TEXT);
-- seen_*: what sync has already reported for session_id (last run id, hints taken, time-up and ending announced); notified: the phase the coach was last asked about; example: worked example posted.
CREATE TABLE IF NOT EXISTS descent_frames (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, parent_id INTEGER, problem_id TEXT NOT NULL,
	depth INTEGER NOT NULL, gap TEXT, session_id INTEGER, opened_at INTEGER NOT NULL, closed_at INTEGER, status TEXT NOT NULL,
	seen_run INTEGER NOT NULL DEFAULT 0, seen_hints INTEGER NOT NULL DEFAULT 0, seen_over INTEGER NOT NULL DEFAULT 0, seen_end INTEGER NOT NULL DEFAULT 0,
	notified TEXT, example INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS descent_frames_thread ON descent_frames(thread_id, closed_at);
CREATE TABLE IF NOT EXISTS descent_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, at INTEGER NOT NULL, role TEXT NOT NULL,
	text TEXT NOT NULL, tone TEXT, offer TEXT);
CREATE INDEX IF NOT EXISTS descent_messages_thread ON descent_messages(thread_id, id);
-- A revisit of the parent problem 3 days after the learner accepted a descent; done when a later session passes it.
CREATE TABLE IF NOT EXISTS descent_revisits (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL, frame_id INTEGER NOT NULL, due_at INTEGER NOT NULL, done_at INTEGER);
`);
	migrateCoachMessages(database);
	migratePdfQuestionAttempts(database);
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
