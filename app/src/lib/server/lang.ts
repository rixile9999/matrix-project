import { db } from './db.ts';
import { judge, listProblems, loadProblem, loadSolution } from './judge.ts';
import { listCheatEntries, cheatIndex } from './cheatsheet.ts';
import { LEVELS, TOPICS, type CheatEntry, type JudgeResult, type LangProblem, type TopicId } from '#lib/core/lang.ts';
import { nextUnpassed, suggestWarmup, type StudyProblem, type StudySession } from '#lib/core/study.ts';
import type { LangCheatData, LangFinished, LangHomeData, LangListItem, LangSessionData, LangSuggestion, LangTopicRow } from '#lib/types.ts';

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

// ---------- cheat sheet ----------
/** Static content that may be half written: a missing or broken file means "nothing yet". */
function cheatEntries(): CheatEntry[] {
	try {
		return listCheatEntries(LANG);
	} catch {
		return [];
	}
}

function cheatIds(): Set<string> {
	try {
		return new Set(Object.values(cheatIndex(LANG)).flatMap((l) => l.map(([id]) => id)));
	} catch {
		return new Set();
	}
}

/** Records that the open session looked at an entry. Returns false (and writes nothing) for ended or missing sessions and unknown entries. */
export function recordLookup(problemId: string, entryId: unknown): boolean {
	requireProblem(problemId);
	if (typeof entryId !== 'string' || !cheatIds().has(entryId)) return false;
	const s = latestSession(problemId);
	if (!s || s.ended_at !== null) return false;
	db.prepare('INSERT INTO lang_lookups(session_id, entry_id, at) VALUES(?,?,?)').run(s.id, entryId, now());
	return true;
}

const lookedUp = (sessionId: number) =>
	(db.prepare('SELECT entry_id FROM lang_lookups WHERE session_id = ? GROUP BY entry_id ORDER BY MIN(id)').all(sessionId) as { entry_id: string }[]).map((r) => r.entry_id);

/** Entry ids of problems the user has passed, per entry: where the syntax was used. */
export function cheatView(): LangCheatData {
	const passed = new Set(passedTimes().keys());
	const passedBy: LangCheatData['passedBy'] = {};
	for (const p of listProblems(LANG).filter((p) => passed.has(p.id)))
		for (const ref of p.refs ?? []) (passedBy[ref] ??= []).push({ id: p.id, title: p.title });
	return { entries: cheatEntries(), passedBy };
}

// ---------- list ----------
type Row = Pick<SessionRow, 'problem_id' | 'hints_used' | 'ended_at' | 'outcome' | 'elapsed_sec' | 'avoided'>;
const allRows = () => db.prepare('SELECT problem_id, hints_used, ended_at, outcome, elapsed_sec, avoided FROM lang_sessions WHERE lang = ?').all(LANG) as Row[];

/** problem id -> time of its latest passing session */
const passedTimes = () =>
	new Map(
		(db.prepare("SELECT problem_id, MAX(ended_at) AS at FROM lang_sessions WHERE lang = ? AND outcome = 'passed' GROUP BY problem_id").all(LANG) as { problem_id: string; at: number }[]).map((r) => [r.problem_id, r.at])
	);

const LEVEL_KEYS = [1, 2, 3] as const;

export function listView(): LangHomeData {
	const rows = allRows();
	const by = new Map<string, Row[]>();
	for (const r of rows) by.set(r.problem_id, [...(by.get(r.problem_id) ?? []), r]);
	const problems = listProblems(LANG);
	const at = passedTimes();

	const items = new Map<string, LangListItem>();
	for (const p of problems) {
		const mine = by.get(p.id) ?? [];
		const passes = mine.filter((r) => r.outcome === 'passed');
		items.set(p.id, {
			id: p.id,
			order: p.order,
			level: p.level,
			topic: p.topic,
			kind: p.kind,
			title: p.title,
			limitSec: p.limitSec,
			status: passes.length ? 'passed' : mine.length ? 'attempted' : 'new',
			bestSec: passes.length ? Math.min(...passes.map((r) => r.elapsed_sec ?? 0)) : null,
			clean: passes.some((r) => (JSON.parse(r.avoided ?? '[]') as string[]).length === 0)
		});
	}

	const topics: LangTopicRow[] = (Object.keys(TOPICS) as TopicId[])
		.map((topic) => ({
			topic,
			label: TOPICS[topic],
			levels: LEVEL_KEYS.map((lv) => problems.filter((p) => p.topic === topic && p.level === lv).map((p) => items.get(p.id)!)) as LangTopicRow['levels']
		}))
		.filter((t) => t.levels.some((l) => l.length));
	const levels = LEVEL_KEYS.map((level) => {
		const mine = problems.filter((p) => p.level === level);
		return { level, label: LEVELS[level], passed: mine.filter((p) => at.has(p.id)).length, total: mine.length };
	});

	const study: StudyProblem[] = problems.map((p) => ({ id: p.id, level: p.level, topic: p.topic, passedAt: at.get(p.id) ?? null }));
	const level = new Map(problems.map((p) => [p.id, p]));
	const sessions: StudySession[] = rows.flatMap((r) => {
		const p = level.get(r.problem_id);
		if (!p || p.level !== 2 || r.ended_at === null || !r.outcome) return [];
		return [{ level: p.level, topic: p.topic, endedAt: r.ended_at, hintsUsed: r.hints_used, outcome: r.outcome, overtime: r.outcome === 'passed' && (r.elapsed_sec ?? 0) > p.limitSec }];
	});
	const wanted: [LangSuggestion['key'], string, string | null][] = [
		['continue', '이어서', nextUnpassed(study, 2)],
		['warmup', '기본 워밍업', suggestWarmup(study, sessions)],
		['challenge', '복합 도전', nextUnpassed(study, 3)]
	];
	const suggestions = wanted.flatMap(([key, label, id]) => (id ? [{ key, label, problemId: id, title: items.get(id)!.title }] : []));
	return { topics, levels, suggestions };
}

const nextIdAfter = (p: LangProblem) => listProblems(LANG).find((q) => q.level === p.level && q.order > p.order)?.id ?? null;

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

/** Related entries are a hint: withheld until hint 1 is revealed or the session is over. */
const revealRefs = (p: LangProblem, hintsUsed: number, finished: boolean) => (hintsUsed > 0 || finished ? (p.refs ?? []) : []);

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
			targets: p.targets,
			lookedUp: lookedUp(s.id)
		};
	}
	return {
		problem: {
			id: p.id, order: p.order, level: p.level, topic: p.topic, kind: p.kind, title: p.title, limitSec: p.limitSec,
			statement: p.statement, starter: p.starter, avoid: p.kind === 'refactor' ? p.avoid : []
		},
		session: {
			id: s.id,
			startedAt: s.started_at,
			code: last?.code ?? p.starter,
			hints: p.hints.slice(0, s.hints_used),
			refs: revealRefs(p, s.hints_used, finished !== null),
			lastResult: last ? (JSON.parse(last.result) as JudgeResult) : null,
			finished
		},
		cheat: cheatEntries(),
		now: now(),
		nextId: nextIdAfter(p)
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

export function useHint(problemId: string): { hints: string[]; refs: string[] } {
	const p = requireProblem(problemId);
	const s = openSession(problemId, '이미 끝난 세션에서는 힌트를 볼 수 없습니다.');
	db.prepare('UPDATE lang_sessions SET hints_used = MIN(hints_used + 1, ?) WHERE id = ?').run(MAX_HINTS, s.id);
	const used = getSession(s.id)!.hints_used;
	return { hints: p.hints.slice(0, used), refs: revealRefs(p, used, false) };
}

/** Gives up on the open session. Revealing an already finished session changes nothing. */
export function revealSolution(problemId: string): void {
	requireProblem(problemId);
	const s = latestSession(problemId);
	if (!s) throw new Error('진행 중인 세션이 없습니다. 먼저 문제를 시작하세요.');
	if (s.ended_at === null) endSession(s.id, 'revealed', []);
}
