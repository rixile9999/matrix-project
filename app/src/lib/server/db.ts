import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const path = process.env.DB_PATH ?? 'data/trainer.db';
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS problems (
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
-- Operator (question-answering panel): every question and answer, append-only. session_id = the lang session the thread belongs to.
CREATE TABLE IF NOT EXISTS coach_messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, context_kind TEXT NOT NULL CHECK (context_kind IN ('lang', 'memo')), context_id TEXT NOT NULL,
	session_id INTEGER, backend TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('user', 'coach')), text TEXT NOT NULL, ms INTEGER,
	access TEXT NOT NULL CHECK (access IN ('limited', 'full')), error INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS coach_messages_ctx ON coach_messages(context_kind, context_id, id);
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
`);

/** Runs fn inside a transaction. */
export function tx<T>(fn: () => T): T {
	db.exec('BEGIN');
	try {
		const out = fn();
		db.exec('COMMIT');
		return out;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
