import { db } from './db.ts';
import { judge, listProblems, loadProblem, loadSolution } from './judge.ts';
import type { JudgeResult, LangProblem } from '#lib/core/lang.ts';
import type { LangFinished, LangHomeData, LangListItem, LangSessionData } from '#lib/types.ts';

const LANG = 'scala';
const MAX_CODE = 20_000;
const MAX_HINTS = 2;
const now = () => Math.floor(Date.now() / 1000);

type SessionRow = {
	id: number;
	problem_id: string;
	started_at: number;
	hints_used: number;
	ended_at: number | null;
	outcome: 'passed' | 'revealed' | null;
	elapsed_sec: number | null;
	avoided: string | null;
};

const latestSession = (problemId: string) =>
	db.prepare('SELECT * FROM lang_sessions WHERE lang = ? AND problem_id = ? ORDER BY id DESC LIMIT 1').get(LANG, problemId) as SessionRow | undefined;
const getSession = (id: number) => db.prepare('SELECT * FROM lang_sessions WHERE id = ?').get(id) as SessionRow | undefined;

function requireProblem(id: string): LangProblem {
	const p = loadProblem(LANG, id);
	if (!p) throw new Error('문제를 찾을 수 없습니다.');
	return p;
}

/** The session a run/hint/reveal applies to: the latest one, which must still be open. */
function openSession(problemId: string, message: string): SessionRow {
	const s = latestSession(problemId);
	if (!s) throw new Error('진행 중인 세션이 없습니다. 먼저 문제를 시작하세요.');
	if (s.ended_at !== null) throw new Error(message);
	return s;
}

// ---------- list ----------
export function listView(): LangHomeData {
	const rows = db.prepare('SELECT problem_id, outcome, elapsed_sec, avoided FROM lang_sessions WHERE lang = ?').all(LANG) as Pick<SessionRow, 'problem_id' | 'outcome' | 'elapsed_sec' | 'avoided'>[];
	const by = new Map<string, typeof rows>();
	for (const r of rows) by.set(r.problem_id, [...(by.get(r.problem_id) ?? []), r]);

	const problems: LangListItem[] = listProblems(LANG).map((p) => {
		const mine = by.get(p.id) ?? [];
		const passes = mine.filter((r) => r.outcome === 'passed');
		const passed = passes.length > 0;
		return {
			id: p.id,
			order: p.order,
			title: p.title,
			limitSec: p.limitSec,
			status: passed ? 'passed' : mine.length ? 'attempted' : 'new',
			bestSec: passed ? Math.min(...passes.map((r) => r.elapsed_sec ?? 0)) : null,
			clean: passes.some((r) => (JSON.parse(r.avoided ?? '[]') as string[]).length === 0),
			targets: passed ? p.targets : null
		};
	});
	return {
		problems,
		nextId: problems.find((p) => p.status !== 'passed')?.id ?? null,
		passedCount: problems.filter((p) => p.status === 'passed').length
	};
}

const nextIdAfter = (order: number) => listProblems(LANG).find((p) => p.order > order)?.id ?? null;

// ---------- sessions ----------
const insertSession = (problemId: string) =>
	Number(db.prepare('INSERT INTO lang_sessions(lang, problem_id, started_at) VALUES(?,?,?)').run(LANG, problemId, now()).lastInsertRowid);

/** Starts a session; an unfinished one for the same problem is resumed instead of duplicated. */
export function startSession(problemId: string): void {
	requireProblem(problemId);
	const s = latestSession(problemId);
	if (!s || s.ended_at !== null) insertSession(problemId);
}

export function restartSession(problemId: string): void {
	requireProblem(problemId);
	insertSession(problemId);
}

/** Null when the problem is unknown or has no session. */
export function sessionView(problemId: string): LangSessionData | null {
	const p = loadProblem(LANG, problemId);
	if (!p) return null;
	const s = latestSession(problemId);
	if (!s) return null;
	const last = db.prepare('SELECT code, result FROM lang_runs WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(s.id) as { code: string; result: string } | undefined;

	let finished: LangFinished | null = null;
	if (s.ended_at !== null && s.outcome) {
		const elapsed = s.elapsed_sec ?? 0;
		finished = {
			outcome: s.outcome,
			elapsedSec: elapsed,
			overtime: s.outcome === 'passed' && elapsed > p.limitSec,
			avoided: JSON.parse(s.avoided ?? '[]'),
			solution: loadSolution(LANG, p.id),
			notes: p.notes,
			targets: p.targets
		};
	}
	return {
		problem: { id: p.id, order: p.order, title: p.title, limitSec: p.limitSec, statement: p.statement, starter: p.starter },
		session: {
			id: s.id,
			startedAt: s.started_at,
			code: last?.code ?? p.starter,
			hints: p.hints.slice(0, s.hints_used),
			lastResult: last ? (JSON.parse(last.result) as JudgeResult) : null,
			finished
		},
		now: now(),
		nextId: nextIdAfter(p.order)
	};
}

const endSession = (id: number, outcome: 'passed' | 'revealed', avoided: string[]) =>
	db
		.prepare(
			`UPDATE lang_sessions SET ended_at = ?, outcome = ?, avoided = ?, elapsed_sec = ? - started_at
			 WHERE id = ? AND ended_at IS NULL`
		)
		.run(now(), outcome, JSON.stringify(avoided), now(), id);

export async function runCode(problemId: string, code: unknown): Promise<{ result: JudgeResult; finished: boolean }> {
	const p = requireProblem(problemId);
	if (typeof code !== 'string' || code.trim() === '') throw new Error('코드를 입력하세요.');
	if (code.length > MAX_CODE) throw new Error(`코드가 너무 깁니다. (최대 ${MAX_CODE.toLocaleString('en-US')}자)`);
	const s = openSession(problemId, '이미 끝난 세션입니다. 다시 풀려면 다시 시작하세요.');

	const result = await judge(LANG, p, code);
	// The session may have been ended (reveal, double submit) while the judge was running.
	const open = getSession(s.id)?.ended_at === null;
	db.prepare('INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)').run(s.id, now(), result.status, code, JSON.stringify(result));
	let finished = false;
	if (open && result.status === 'passed') finished = endSession(s.id, 'passed', result.avoided).changes > 0;
	return { result, finished };
}

export function useHint(problemId: string): string[] {
	const p = requireProblem(problemId);
	const s = openSession(problemId, '이미 끝난 세션에서는 힌트를 볼 수 없습니다.');
	db.prepare('UPDATE lang_sessions SET hints_used = MIN(hints_used + 1, ?) WHERE id = ?').run(MAX_HINTS, s.id);
	return p.hints.slice(0, getSession(s.id)!.hints_used);
}

/** Gives up on the open session. Revealing an already finished session changes nothing. */
export function revealSolution(problemId: string): void {
	requireProblem(problemId);
	const s = latestSession(problemId);
	if (!s) throw new Error('진행 중인 세션이 없습니다. 먼저 문제를 시작하세요.');
	if (s.ended_at === null) endSession(s.id, 'revealed', []);
}
