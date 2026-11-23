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
