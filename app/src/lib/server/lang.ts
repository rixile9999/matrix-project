import { displayJudge } from './content-language.ts';
import { tr, label } from './locale.ts';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db } from './db.ts';
import { autoDrills } from './drill.ts';
import { sprintStruggleSessions } from './spar-log.ts';
import { judge, loadBooks, loadGiven, loadProblem, loadSolution } from './judge.ts';
import { listCheatEntries, cheatIndex } from './cheatsheet.ts';
import { LEVELS, TOPICS, type BookMeta, type CheatEntry, type JudgeResult, type LangProblem, type TopicId } from '#lib/core/lang.ts';
import { nextUnpassed, suggestWarmup, type StudyProblem, type StudySession } from '#lib/core/study.ts';
import { bookOrder, byChapter, firstUnpassed, nextInBook } from '#lib/core/book.ts';
import type { LangBookCard, LangBookData, LangBookRef, LangCheatData, LangFinished, LangHomeData, LangListItem, LangSessionData, LangSuggestion, LangTopicRow } from '#lib/types.ts';

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
	db().prepare('SELECT * FROM lang_sessions WHERE lang = ? AND problem_id = ? ORDER BY id DESC LIMIT 1').get(LANG, problemId) as SessionRow | undefined;
const getSession = (id: number) => db().prepare('SELECT * FROM lang_sessions WHERE id = ?').get(id) as SessionRow | undefined;

// ---------- problems on disk ----------
// Authors add problems while the app runs, so a directory may be half written. Only complete ones
// (valid problem.json, Solution.scala, Tests.scala) exist as far as the app is concerned.
const PROBLEMS = resolve(process.env.PROBLEMS_DIR ?? 'problems', LANG);
const isStr = (v: unknown) => typeof v === 'string';
const strs = (v: unknown) => Array.isArray(v) && v.every(isStr);

function valid(p: LangProblem, dir: string): boolean {
	const b = p.book;
	return (
		p.id === dir && [1, 2, 3].includes(p.level) && Number.isFinite(p.order) && Number.isFinite(p.limitSec) && p.topic in TOPICS &&
		['write', 'fix', 'refactor', 'complete'].includes(p.kind) && isStr(p.title) && isStr(p.statement) && isStr(p.starter) && isStr(p.notes) &&
		Array.isArray(p.hints) && p.hints.length === 2 && strs(p.hints) && strs(p.targets) && strs(p.avoid) && (p.refs === undefined || strs(p.refs)) &&
		(p.intent === undefined || isStr(p.intent)) &&
		(b === undefined || (!!b && isStr(b.id) && Number.isInteger(b.chapter) && isStr(b.exercise))) &&
		existsSync(join(PROBLEMS, dir, 'Solution.scala')) && existsSync(join(PROBLEMS, dir, 'Tests.scala'))
	);
}

/** The complete problem `id`, or null (unknown, half written, unreadable). */
export function findProblem(id: string): LangProblem | null {
	try {
		const p = loadProblem(LANG, id);
		return p && valid(p, id) ? p : null;
	} catch {
		return null;
	}
}

/** All complete problems, level then order (curriculum order). */
function allProblems(): LangProblem[] {
	if (!existsSync(PROBLEMS)) return [];
	return readdirSync(PROBLEMS)
		.flatMap((d) => findProblem(d) ?? [])
		.sort((a, b) => a.level - b.level || a.order - b.order);
}
const curriculum = () => allProblems().filter((p) => !p.book);

function books(): Record<string, BookMeta> {
	try {
		const b = loadBooks(LANG);
		return b && typeof b === 'object' ? b : {};
	} catch {
		return {};
	}
}
const chapterTitles = (b: BookMeta | undefined): Record<string, string> => (b && b.chapters && typeof b.chapters === 'object' ? b.chapters : {});

/** Book problems of one book, in book order. */
const bookProblems = (bookId: string, problems = allProblems()) =>
	bookOrder(problems.flatMap((p) => (p.book?.id === bookId ? [{ ...p, id: p.id, chapter: p.book.chapter, exercise: p.book.exercise }] : [])));

function requireProblem(id: string): LangProblem {
	const p = findProblem(id);
	if (!p) throw new Error(tr('문제를 찾을 수 없습니다.', 'Problem not found.'));
	return p;
}

/** The session a run/hint/reveal applies to: the latest one, which must still be open. */
function openSession(problemId: string, message: string): SessionRow {
	const s = latestSession(problemId);
	if (!s) throw new Error(tr('진행 중인 세션이 없습니다. 먼저 문제를 시작하세요.', 'Start this problem to open a session.'));
	if (s.ended_at !== null) throw new Error(message);
	return s;
}

// ---------- cheat sheet ----------
/** Static content that may be half written: a missing or broken file means "nothing yet". */
export function cheatEntries(): CheatEntry[] {
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

/** True for an id that exists in the cheat sheet. */
export const isCheatEntry = (entryId: unknown): entryId is string => typeof entryId === 'string' && cheatIds().has(entryId);

/** Records that the open session looked at an entry. Returns false (and writes nothing) for ended or missing sessions and unknown entries. */
export function recordLookup(problemId: string, entryId: unknown): boolean {
	requireProblem(problemId);
	if (typeof entryId !== 'string' || !cheatIds().has(entryId)) return false;
	const s = latestSession(problemId);
	if (!s || s.ended_at !== null) return false;
	db().prepare('INSERT INTO lang_lookups(session_id, entry_id, at) VALUES(?,?,?)').run(s.id, entryId, now());
	return true;
}

const lookedUp = (sessionId: number) =>
	(db().prepare('SELECT entry_id FROM lang_lookups WHERE session_id = ? GROUP BY entry_id ORDER BY MIN(id)').all(sessionId) as { entry_id: string }[]).map((r) => r.entry_id);

/** Entry ids of problems the user has passed, per entry: where the syntax was used. */
export function cheatView(): LangCheatData {
	const passed = new Set(passedTimes().keys());
	const passedBy: LangCheatData['passedBy'] = {};
	for (const p of allProblems().filter((p) => passed.has(p.id)))
		for (const ref of p.refs ?? []) (passedBy[ref] ??= []).push({ id: p.id, title: p.title });
	return { entries: cheatEntries(), passedBy };
}

// ---------- list ----------
type Row = Pick<SessionRow, 'problem_id' | 'hints_used' | 'ended_at' | 'outcome' | 'elapsed_sec' | 'avoided'>;
const allRows = () => db().prepare('SELECT problem_id, hints_used, ended_at, outcome, elapsed_sec, avoided FROM lang_sessions WHERE lang = ?').all(LANG) as Row[];

/** problem id -> time of its latest passing session */
const passedTimes = () =>
	new Map(
		(db().prepare("SELECT problem_id, MAX(ended_at) AS at FROM lang_sessions WHERE lang = ? AND outcome = 'passed' GROUP BY problem_id").all(LANG) as { problem_id: string; at: number }[]).map((r) => [r.problem_id, r.at])
	);

/** Complete, non-book level-1 problems passed at least once, in curriculum order: what a Sparring Sprint may draw from. */
export function passedBasics(): LangProblem[] {
	const at = passedTimes();
	return curriculum().filter((p) => p.level === 1 && at.has(p.id));
}

const LEVEL_KEYS = [1, 2, 3] as const;

function listItems(problems: LangProblem[]): Map<string, LangListItem> {
	const by = new Map<string, Row[]>();
	for (const r of allRows()) by.set(r.problem_id, [...(by.get(r.problem_id) ?? []), r]);
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
			clean: passes.some((r) => (JSON.parse(r.avoided ?? '[]') as string[]).length === 0),
			book: p.book ? { id: p.book.id, chapter: p.book.chapter, exercise: p.book.exercise } : null
		});
	}
	return items;
}

export function listView(): LangHomeData {
	const rows = allRows();
	const problems = allProblems();
	const base = problems.filter((p) => !p.book); // suggestions and level progress ignore book problems
	const at = passedTimes();
	const items = listItems(problems);

	const topics: LangTopicRow[] = (Object.keys(TOPICS) as TopicId[])
		.map((topic) => ({
			topic,
			label: label(TOPICS[topic]),
			levels: LEVEL_KEYS.map((lv) => problems.filter((p) => p.topic === topic && p.level === lv).map((p) => items.get(p.id)!)) as LangTopicRow['levels']
		}))
		.filter((t) => t.levels.some((l) => l.length));
	const levels = LEVEL_KEYS.map((level) => {
		const mine = base.filter((p) => p.level === level);
		return { level, label: label(LEVELS[level]), passed: mine.filter((p) => at.has(p.id)).length, total: mine.length };
	});

	const study: StudyProblem[] = base.map((p) => ({ id: p.id, level: p.level, topic: p.topic, passedAt: at.get(p.id) ?? null }));
	const level = new Map(base.map((p) => [p.id, p]));
	const sessions: StudySession[] = rows.flatMap((r) => {
		const p = level.get(r.problem_id);
		if (!p || p.level !== 2 || r.ended_at === null || !r.outcome) return [];
		return [{ level: p.level, topic: p.topic, endedAt: r.ended_at, hintsUsed: r.hints_used, outcome: r.outcome, overtime: r.outcome === 'passed' && (r.elapsed_sec ?? 0) > p.limitSec }];
	});
	const wanted: [LangSuggestion['key'], string, string | null][] = [
		['continue', tr('이어서', 'Continue'), nextUnpassed(study, 2)],
		['warmup', tr('기본 워밍업', 'Warm-up'), suggestWarmup(study, sessions, sprintStruggleSessions((id) => (level.get(id)?.level === 1 ? level.get(id) : undefined)))],
		['challenge', tr('복합 도전', 'Advanced challenge'), nextUnpassed(study, 3)]
	];
	const suggestions = wanted.flatMap(([key, label, id]) => (id ? [{ key, label, problemId: id, title: items.get(id)!.title }] : []));
	const cards: LangBookCard[] = Object.entries(books()).map(([id, meta]) => {
		const mine = bookProblems(id, problems);
		return { id, title: String(meta?.title ?? id), passed: mine.filter((p) => at.has(p.id)).length, total: mine.length };
	});
	return { books: cards, topics, levels, suggestions };
}

// ---------- book ----------
/** Null for an unknown book. */
export function bookView(bookId: string): LangBookData | null {
	const meta = Object.hasOwn(books(), bookId) ? books()[bookId] : undefined;
	if (!meta) return null;
	const problems = allProblems();
	const mine = bookProblems(bookId, problems);
	const items = listItems(mine);
	const titles = chapterTitles(meta);
	const known = Object.keys(titles).map(Number).filter(Number.isInteger);
	const chapters = byChapter(mine, known).map(({ chapter, items: ps }) => {
		const list = ps.map((p) => items.get(p.id)!);
		return { chapter, title: titles[chapter] ?? '', passed: list.filter((i) => i.status === 'passed').length, total: list.length, problems: list };
	});
	const next = firstUnpassed(mine, new Set(mine.filter((p) => items.get(p.id)!.status === 'passed').map((p) => p.id)));
	const target = next ? mine.find((p) => p.id === next) : undefined;
	return {
		id: bookId,
		title: String(meta.title ?? bookId),
		passed: chapters.reduce((n, c) => n + c.passed, 0),
		total: mine.length,
		resume: target ? { problemId: target.id, title: target.title, chapter: target.chapter, exercise: target.exercise } : null,
		chapters
	};
}

function bookRef(p: LangProblem): LangBookRef | null {
	if (!p.book) return null;
	const meta = books()[p.book.id];
	if (!meta) return null;
	return { id: p.book.id, title: String(meta.title ?? p.book.id), chapter: p.book.chapter, chapterTitle: chapterTitles(meta)[p.book.chapter] ?? '', exercise: p.book.exercise };
}

const nextIdAfter = (p: LangProblem) =>
	p.book ? nextInBook(bookProblems(p.book.id), p.id) : (curriculum().find((q) => q.level === p.level && q.order > p.order)?.id ?? null);

function givenCode(id: string): string | null {
	try {
		return loadGiven(LANG, id);
	} catch {
		return null;
	}
}

// ---------- sessions ----------
const insertSession = (problemId: string) =>
	Number(db().prepare('INSERT INTO lang_sessions(lang, problem_id, started_at) VALUES(?,?,?)').run(LANG, problemId, now()).lastInsertRowid);

const IDLE_SEC = 600;
/** An open session is abandoned once its limit has passed and nothing (run, lookup) happened for IDLE_SEC. */
function abandoned(s: SessionRow, limitSec: number): boolean {
	const last = (table: string) => (db().prepare(`SELECT MAX(at) AS at FROM ${table} WHERE session_id = ?`).get(s.id) as { at: number | null }).at ?? 0;
	const active = Math.max(s.started_at, last('lang_runs'), last('lang_lookups'));
	return now() > s.started_at + limitSec && now() - active > IDLE_SEC;
}

/**
 * Starts a session; an unfinished one for the same problem is resumed instead of duplicated, so leaving and
 * coming back does not reset the clock. An abandoned one stays in the log (open, superseded) and a fresh one starts.
 */
export function startSession(problemId: string): void {
	const p = requireProblem(problemId);
	const s = latestSession(problemId);
	if (!s || s.ended_at !== null || abandoned(s, p.limitSec)) insertSession(problemId);
}

export function restartSession(problemId: string): void {
	requireProblem(problemId);
	insertSession(problemId);
}

/** Related entries and the 출제 취지 are a hint: withheld until hint 1 is revealed or the session is over. */
const revealExtras = (p: LangProblem, hintsUsed: number, finished: boolean) =>
	hintsUsed > 0 || finished ? { refs: p.refs ?? [], intent: p.intent ?? null } : { refs: [], intent: null };

/** Null when the problem is unknown or has no session. */
export function sessionView(problemId: string): Omit<LangSessionData, 'debrief'> | null {
	const p = findProblem(problemId);
	if (!p) return null;
	const s = latestSession(problemId);
	if (!s) return null;
	const last = db().prepare('SELECT code, result FROM lang_runs WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(s.id) as { code: string; result: string } | undefined;

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
			statement: p.statement, starter: p.starter, avoid: p.kind === 'refactor' ? p.avoid : [],
			book: bookRef(p), given: p.book ? givenCode(p.id) : null
		},
		session: {
			id: s.id,
			startedAt: s.started_at,
			code: last?.code ?? p.starter,
			hints: p.hints.slice(0, s.hints_used),
			...revealExtras(p, s.hints_used, finished !== null),
			lastResult: last ? displayJudge(JSON.parse(last.result) as JudgeResult) : null,
			finished
		},
		cheat: cheatEntries(),
		now: now(),
		nextId: nextIdAfter(p)
	};
}

const endSession = (id: number, outcome: 'passed' | 'revealed', avoided: string[]) =>
	db()
		.prepare(
			`UPDATE lang_sessions SET ended_at = ?, outcome = ?, avoided = ?, elapsed_sec = ? - started_at
			 WHERE id = ? AND ended_at IS NULL`
		)
		.run(now(), outcome, JSON.stringify(avoided), now(), id);

/** Debrief drills for the notes this session showed; in the background and never a reason for a run to fail. */
function afterSession(problemId: string) {
	try {
		autoDrills(problemId);
	} catch {
		// a failed background start must never break a run
	}
}

export async function runCode(problemId: string, code: unknown): Promise<{ result: JudgeResult; finished: boolean }> {
	const p = requireProblem(problemId);
	if (typeof code !== 'string' || code.trim() === '') throw new Error(tr('코드를 입력하세요.', 'Enter your code.'));
	if (code.length > MAX_CODE) throw new Error(tr(`코드가 너무 깁니다. (최대 ${MAX_CODE.toLocaleString('en-US')}자)`, `Code exceeds ${MAX_CODE.toLocaleString('en-US')} characters.`));
	const s = openSession(problemId, tr('이미 끝난 세션입니다. 다시 풀려면 다시 시작하세요.', 'This session has ended. Restart to try again.'));

	const result = await judge(LANG, p, code);
	// The session may have been ended (reveal, double submit) while the judge was running.
	const open = getSession(s.id)?.ended_at === null;
	db().prepare('INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)').run(s.id, now(), result.status, code, JSON.stringify(result));
	let finished = false;
	if (open && result.status === 'passed') finished = endSession(s.id, 'passed', result.avoided).changes > 0;
	if (finished) afterSession(problemId);
	return { result: displayJudge(result), finished };
}

export function useHint(problemId: string): { hints: string[]; refs: string[]; intent: string | null } {
	const p = requireProblem(problemId);
	const s = openSession(problemId, tr('이미 끝난 세션에서는 힌트를 볼 수 없습니다.', 'Hints are closed for this session.'));
	db().prepare('UPDATE lang_sessions SET hints_used = MIN(hints_used + 1, ?) WHERE id = ?').run(MAX_HINTS, s.id);
	const used = getSession(s.id)!.hints_used;
	if (used > s.hints_used) db().prepare("INSERT INTO lang_marks(session_id, at, kind) VALUES(?,?, 'hint')").run(s.id, now()); // Debrief: when the hint was taken
	return { hints: p.hints.slice(0, used), ...revealExtras(p, used, false) };
}

/** Gives up on the open session. Revealing an already finished session changes nothing. */
export function revealSolution(problemId: string): void {
	requireProblem(problemId);
	const s = latestSession(problemId);
	if (!s) throw new Error(tr('진행 중인 세션이 없습니다. 먼저 문제를 시작하세요.', 'Start this problem to open a session.'));
	if (s.ended_at === null && endSession(s.id, 'revealed', []).changes > 0) afterSession(problemId);
}

/** What the Operator needs about a problem: its latest session, that session's last run, and (lazily) the solution. Null for an unknown problem. */
export function coachBasis(problemId: string) {
	const problem = findProblem(problemId);
	if (!problem) return null;
	const s = latestSession(problemId);
	const last = s ? (db().prepare('SELECT code, result FROM lang_runs WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(s.id) as { code: string; result: string } | undefined) : undefined;
	return {
		problem,
		session: s ? { id: s.id, startedAt: s.started_at, endedAt: s.ended_at, outcome: s.outcome, elapsedSec: s.elapsed_sec } : null,
		lastRun: last ? { code: last.code, result: JSON.parse(last.result) as JudgeResult } : null,
		given: problem.book ? givenCode(problem.id) : null,
		solution: () => loadSolution(LANG, problem.id)
	};
}
