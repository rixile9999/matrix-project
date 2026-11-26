import { db, tx } from './db.ts';
import * as cf from './cf.ts';
import { replay, expected, type Rating, type Result, type TagStat, deviation } from '#lib/core/rating.ts';
import { MODES, pick, ratingWindow, type Candidate, type Mode } from '#lib/core/select.ts';
import type { Attempt, HistoryData, Offer, Outcome, Problem } from '#lib/types.ts';

const now = () => Math.floor(Date.now() / 1000);

// ---------- settings ----------
export function getSetting(key: string): string | null {
	const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value ?? null;
}
export function setSetting(key: string, value: string | number | null) {
	if (value === null) db().prepare('DELETE FROM settings WHERE key = ?').run(key);
	else db().prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
const numSetting = (key: string) => {
	const v = getSetting(key);
	return v === null ? null : Number(v);
};

// ---------- problems ----------
type ProblemRow = { id: string; contest_id: number; idx: string; name: string; rating: number; tags: string; solved_count: number };
const toProblem = (r: ProblemRow): Problem => ({
	id: r.id,
	contestId: r.contest_id,
	index: r.idx,
	name: r.name,
	rating: r.rating,
	tags: JSON.parse(r.tags),
	solvedCount: r.solved_count,
	url: `https://codeforces.com/problemset/problem/${r.contest_id}/${r.idx}`
});
export const getProblem = (id: string) => {
	const r = db().prepare('SELECT * FROM catalog.problems WHERE id = ?').get(id) as ProblemRow | undefined;
	return r ? toProblem(r) : null;
};
export const problemCount = () => (db().prepare('SELECT COUNT(*) AS n FROM catalog.problems').get() as { n: number }).n;

export async function syncProblems() {
	const list = await cf.fetchProblems();
	const stmt = db().prepare(
		`INSERT INTO catalog.problems(id, contest_id, idx, name, rating, tags, solved_count) VALUES(?,?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET name=excluded.name, rating=excluded.rating, tags=excluded.tags, solved_count=excluded.solved_count`
	);
	tx(() => {
		for (const p of list) stmt.run(`${p.contestId}${p.index}`, p.contestId, p.index, p.name, p.rating, JSON.stringify(p.tags), p.solvedCount);
	});
	return list.length;
}

function storeSubmissions(subs: cf.CfSubmission[]) {
	const stmt = db().prepare('INSERT OR REPLACE INTO cf_submissions(id, problem_id, verdict, created_at) VALUES(?,?,?,?)');
	tx(() => {
		for (const s of subs) {
			const cid = s.problem.contestId ?? s.contestId;
			if (cid == null) continue;
			stmt.run(s.id, `${cid}${s.problem.index}`, s.verdict ?? null, s.creationTimeSeconds);
		}
	});
}

export async function syncSubmissions() {
	const handle = getSetting('handle');
	if (!handle) throw new Error('핸들이 설정되지 않았습니다.');
	storeSubmissions(await cf.fetchSubmissions(handle));
}

export async function sync() {
	await syncProblems();
	if (getSetting('handle')) await syncSubmissions();
	setSetting('last_sync_at', now());
}

export async function setHandle(handle: string, initialRating?: number | null) {
	handle = handle.trim();
	if (!handle) throw new Error('핸들을 입력하세요.');
	const info = await cf.fetchUserInfo(handle); // throws on unknown handle
	setSetting('handle', info.handle);
	if (info.rating != null) setSetting('cf_rating', info.rating);
	else setSetting('cf_rating', null);
	const hasAttempts = (db().prepare('SELECT COUNT(*) AS n FROM attempts').get() as { n: number }).n > 0;
	let init: Rating | null = null;
	if (initialRating != null && Number.isFinite(initialRating)) init = { r: initialRating, rd: 200 };
	else if (!hasAttempts) init = info.rating != null ? { r: info.rating, rd: 150 } : { r: 1000, rd: 350 };
	if (init) {
		setSetting('init_rating', init.r);
		setSetting('init_rd', init.rd);
	}
	await sync();
}

// ---------- attempts & rating (derived) ----------
type AttemptRow = {
	id: number; problem_id: string; mode: Mode; started_at: number; limit_sec: number;
	ended_at: number | null; outcome: Outcome | null; elapsed_sec: number | null;
};
const initialRating = (): Rating => ({ r: numSetting('init_rating') ?? 1000, rd: numSetting('init_rd') ?? 350 });

function finishedRows() {
	return db().prepare('SELECT * FROM attempts WHERE ended_at IS NOT NULL ORDER BY ended_at, id').all() as AttemptRow[];
}

function derive() {
	const rows = finishedRows();
	const results: Result[] = [];
	const kept: AttemptRow[] = [];
	const problems = new Map<string, Problem>();
	for (const row of rows) {
		const p = getProblem(row.problem_id);
		if (!p) continue;
		problems.set(p.id, p);
		kept.push(row);
		results.push({ difficulty: p.rating, tags: p.tags, score: row.outcome === 'solved' ? 1 : 0 });
	}
	return { ...replay(initialRating(), results), rows: kept, problems };
}

export function ratingState() {
	const d = derive();
	return { rating: d.rating, tags: d.tags };
}

function buildAttempts(): Attempt[] {
	const d = derive();
	const out: Attempt[] = d.rows.map((row, i) => ({
		id: row.id,
		problem: d.problems.get(row.problem_id)!,
		mode: row.mode,
		startedAt: row.started_at,
		limitSec: row.limit_sec,
		endedAt: row.ended_at,
		outcome: row.outcome,
		elapsedSec: row.elapsed_sec,
		ratingBefore: d.history[i].r,
		ratingAfter: d.history[i + 1].r
	}));
	return out;
}

export function getActiveAttemptId(): number | null {
	const r = db().prepare('SELECT id FROM attempts WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
	return r?.id ?? null;
}

export function getAttempt(id: number): Attempt | null {
	const row = db().prepare('SELECT * FROM attempts WHERE id = ?').get(id) as AttemptRow | undefined;
	if (!row) return null;
	const problem = getProblem(row.problem_id);
	if (!problem) return null;
	if (row.ended_at === null) {
		return {
			id: row.id, problem, mode: row.mode, startedAt: row.started_at, limitSec: row.limit_sec,
			endedAt: null, outcome: null, elapsedSec: null, ratingBefore: derive().rating.r, ratingAfter: null
		};
	}
	return buildAttempts().find((a) => a.id === id) ?? null;
}

export function recentAttempts(n: number) {
	return buildAttempts().reverse().slice(0, n);
}

export function history(): HistoryData {
	const d = derive();
	const attempts = buildAttempts();
	const points = attempts.map((a, i) => ({ t: a.endedAt!, r: d.history[i + 1].r, rd: d.history[i + 1].rd }));
	const tags = [...d.tags].map(([tag, s]: [string, TagStat]) => ({ tag, n: s.n, actual: s.actual, expected: s.expected, deviation: deviation(s) }));
	tags.sort((a, b) => a.deviation - b.deviation);
	return { points, attempts: attempts.reverse(), tags };
}

// ---------- offers ----------
export function buildOffers(): Offer[] {
	if (!getSetting('handle') || problemCount() === 0) return [];
	const { rating, tags } = ratingState();
	const exclude = new Set<string>();
	for (const r of db().prepare("SELECT DISTINCT problem_id FROM cf_submissions WHERE verdict = 'OK'").all() as { problem_id: string }[]) exclude.add(r.problem_id);
	for (const r of db().prepare('SELECT DISTINCT problem_id FROM attempts').all() as { problem_id: string }[]) exclude.add(r.problem_id);
	const [minR, maxR] = [Math.min(...Object.keys(MODES).map((m) => ratingWindow(rating.r, m as Mode)[0])), Math.max(...Object.keys(MODES).map((m) => ratingWindow(rating.r, m as Mode)[1]))];
	const candidates: Candidate[] = (
		db().prepare('SELECT id, rating, tags, solved_count FROM catalog.problems WHERE rating BETWEEN ? AND ?').all(minR, maxR) as Pick<ProblemRow, 'id' | 'rating' | 'tags' | 'solved_count'>[]
	).map((r) => ({ id: r.id, rating: r.rating, tags: JSON.parse(r.tags), solvedCount: r.solved_count }));

	return (Object.keys(MODES) as Mode[]).map((mode) => {
		const c = pick(candidates, { userRating: rating.r, mode, tagStats: tags, exclude, rng: Math.random });
		exclude.add(c?.id ?? ''); // avoid offering the same problem in two modes
		return {
			mode,
			problem: c ? getProblem(c.id) : null,
			window: ratingWindow(rating.r, mode),
			limitSec: MODES[mode].limitSec,
			pSolve: c ? expected(rating.r, c.rating) : null
		};
	});
}

export function startAttempt(mode: string, problemId: string): number {
	if (!(mode in MODES)) throw new Error('알 수 없는 모드입니다.');
	if (getActiveAttemptId() !== null) throw new Error('이미 진행 중인 시도가 있습니다.');
	if (!getProblem(problemId)) throw new Error('문제를 찾을 수 없습니다.');
	const r = db()
		.prepare('INSERT INTO attempts(problem_id, mode, started_at, limit_sec) VALUES(?,?,?,?)')
		.run(problemId, mode, now(), MODES[mode as Mode].limitSec);
	return Number(r.lastInsertRowid);
}

function finish(id: number, outcome: Outcome, endedAt: number, elapsedSec: number | null) {
	// guarded so a concurrent resolve cannot finish twice
	return db()
		.prepare('UPDATE attempts SET ended_at = ?, outcome = ?, elapsed_sec = ? WHERE id = ? AND ended_at IS NULL')
		.run(endedAt, outcome, elapsedSec, id).changes > 0;
}

export function giveUp(id: number) {
	finish(id, 'gave_up', now(), null);
}

/** Resolves an active attempt against Codeforces. Throws if the CF call fails. */
export async function resolveAttempt(id: number): Promise<{ resolved: boolean; outcome: Outcome | null }> {
	const row = db().prepare('SELECT * FROM attempts WHERE id = ?').get(id) as AttemptRow | undefined;
	if (!row) throw new Error('시도를 찾을 수 없습니다.');
	if (row.ended_at !== null) return { resolved: true, outcome: row.outcome };
	const handle = getSetting('handle');
	if (!handle) throw new Error('핸들이 설정되지 않았습니다.');
	const subs = await cf.fetchSubmissions(handle, 50);
	storeSubmissions(subs);
	const deadline = row.started_at + row.limit_sec;
	const hit = subs
		.filter((s) => {
			const cid = s.problem.contestId ?? s.contestId;
			return s.verdict === 'OK' && `${cid}${s.problem.index}` === row.problem_id &&
				s.creationTimeSeconds >= row.started_at && s.creationTimeSeconds <= deadline;
		})
		.sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds)[0];
	if (hit) {
		finish(id, 'solved', hit.creationTimeSeconds, hit.creationTimeSeconds - row.started_at);
		return { resolved: true, outcome: 'solved' };
	}
	// A submission made in time but still being judged must not be turned into a timeout.
	const judging = subs.some((s) => {
		const cid = s.problem.contestId ?? s.contestId;
		return (!s.verdict || s.verdict === 'TESTING') && `${cid}${s.problem.index}` === row.problem_id &&
			s.creationTimeSeconds >= row.started_at && s.creationTimeSeconds <= deadline;
	});
	if (now() > deadline && !judging) {
		finish(id, 'timeout', deadline, null);
		return { resolved: true, outcome: 'timeout' };
	}
	return { resolved: false, outcome: null };
}

export { now };
