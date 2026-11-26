// Debrief, server side: reads the log into core/debrief.ts shapes, builds the page data, records marks / self reports / deck / own lines /
// experiment choices, and writes coaching on request. Everything shown is recomputed from the records; only what the learner did is stored.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, accountId } from './db.ts';
import { findProblem } from './lang.ts';
import { askCoach } from './worker.ts';
import { listChecks } from './memo-content.ts';
import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
import type { JudgeResult } from '#lib/core/lang.ts';
import type { TraceCheck } from '#lib/core/memo.ts';
import {
	COACH_SYSTEM, EXPERIMENTS, IDLE_AFTER_SEC, activeDays, coachingFacts, coachingPrompt, dayView, examplesOf, experimentResult, focusFacts, isExperiment,
	observe, parseCoaching, patternStats, sessionStrip, unknownRepeats,
	type CoachFact, type DebriefLog, type Hit, type DebriefPattern, type DMark, type DRun, type DSession, type DSelf, type ExperimentId, type MarkKind, type PatternStat, type SelfState
} from '#lib/core/debrief.ts';
import type { DebriefData, DebriefNote, DebriefOk, DebriefReading, DebriefReadingResponse, DebriefSessionCard } from '#lib/types.ts';

const LANG = 'scala';
const nowSec = () => Math.floor(Date.now() / 1000);
export const DEFAULT_BACKEND: BackendId = 'codex';

// ---------- catalog ----------
const CATALOG = resolve(process.env.DEBRIEF_DIR ?? 'debrief', LANG, 'patterns.json');
/** The verified catalog; a missing or broken file means no patterns (the rest of Debrief still works). */
export function catalog(): DebriefPattern[] {
	try {
		if (!existsSync(CATALOG)) return [];
		const v = JSON.parse(readFileSync(CATALOG, 'utf8')) as unknown;
		return Array.isArray(v) ? (v as DebriefPattern[]).filter((p) => p && typeof p.id === 'string' && (p.on === 'compile' || p.on === 'failed')) : [];
	} catch {
		return [];
	}
}
function debriefChecks(): Map<string, TraceCheck> {
	try {
		return new Map(listChecks(LANG).flatMap((c) => (c.kind === 'trace' && c.debrief ? [[c.id, c] as const] : [])));
	} catch {
		return new Map();
	}
}

// ---------- the log ----------
type SessionRow = { id: number; problem_id: string; started_at: number; ended_at: number | null; outcome: 'passed' | 'revealed' | null; hints_used: number };
type RunRow = { id: number; session_id: number; at: number; status: DRun['status']; code: string; result: string };

export function loadLog(): DebriefLog {
	const meta = new Map<string, ReturnType<typeof findProblem>>();
	const problem = (id: string) => (meta.has(id) ? meta.get(id)! : (meta.set(id, findProblem(id)), meta.get(id)!));
	const sessions: DSession[] = (db().prepare('SELECT id, problem_id, started_at, ended_at, outcome, hints_used FROM lang_sessions WHERE lang = ? ORDER BY id').all(LANG) as SessionRow[]).flatMap((r) => {
		const p = problem(r.problem_id);
		return p ? [{ id: r.id, problemId: p.id, title: p.title, limitSec: p.limitSec, startedAt: r.started_at, endedAt: r.ended_at, outcome: r.outcome, hintsUsed: r.hints_used }] : [];
	});
	const runs: DRun[] = (db().prepare('SELECT id, session_id, at, status, code, result FROM lang_runs ORDER BY id').all() as RunRow[]).map((r) => {
		let output = '';
		let failing: string[] = [];
		try {
			const j = JSON.parse(r.result) as JudgeResult;
			output = j.output ?? '';
			failing = (j.cases ?? []).filter((c) => c.status !== 'ok').map((c) => c.name);
		} catch {
			// a broken row is kept as a run without details
		}
		return { id: r.id, sessionId: r.session_id, at: r.at, status: r.status, code: r.code, output, failing };
	});
	const lookups = (db().prepare('SELECT session_id AS sessionId, at FROM lang_lookups ORDER BY id').all() as { sessionId: number; at: number }[]).map((r) => ({ ...r }));
	const marks = (db().prepare('SELECT session_id AS sessionId, at, kind FROM lang_marks ORDER BY id').all() as DMark[]).map((r) => ({ ...r }));
	const questions = (db().prepare("SELECT session_id AS sessionId, at, text FROM coach_messages WHERE role = 'user' AND context_kind = 'lang' AND session_id IS NOT NULL ORDER BY id").all() as { sessionId: number; at: number; text: string }[]).map((r) => ({ ...r }));
	const selves = (db().prepare('SELECT session_id AS sessionId, at, state FROM lang_self ORDER BY id').all() as DSelf[]).map((r) => ({ ...r }));
	return { sessions, runs, lookups, marks, questions, selves };
}

const latestSelf = (log: DebriefLog, sessionId: number): SelfState | null => {
	const rows = log.selves.filter((s) => s.sessionId === sessionId);
	const last = rows[rows.length - 1];
	return last && last.state !== 'none' ? last.state : null;
};

function card(log: DebriefLog, s: DSession, stats: PatternStat[], hitsByRun: Map<number, Hit[]>, cat: DebriefPattern[]): DebriefSessionCard {
	const strip = sessionStrip(s, log);
	const hits = log.runs.filter((r) => r.sessionId === s.id).flatMap((r) => hitsByRun.get(r.id) ?? []);
	return {
		id: s.id, problemId: s.problemId, title: s.title, startedAt: s.startedAt, outcome: s.outcome, elapsedSec: strip.elapsed, limitSec: s.limitSec,
		strip, observations: observe(s, strip, log.runs, log.lookups, hits, stats, cat), self: latestSelf(log, s.id)
	};
}

/** The strip and observations of one finished session (for the problem page). Null for an open or unknown session. */
export function sessionCard(sessionId: number): DebriefSessionCard | null {
	const log = loadLog();
	const s = log.sessions.find((x) => x.id === sessionId);
	if (!s || s.endedAt === null) return null;
	const cat = catalog();
	const { stats, hitsByRun } = patternStats(log, cat);
	return card(log, s, stats, hitsByRun, cat);
}

const passedIds = () =>
	new Set((db().prepare("SELECT DISTINCT problem_id FROM lang_sessions WHERE lang = ? AND outcome = 'passed'").all(LANG) as { problem_id: string }[]).map((r) => r.problem_id));
const lastPassed = (id: string) =>
	(db().prepare("SELECT MAX(ended_at) AS at FROM lang_sessions WHERE lang = ? AND problem_id = ? AND outcome = 'passed'").get(LANG, id) as { at: number | null }).at ?? 0;
const deck = () => new Set((db().prepare('SELECT DISTINCT pattern_id FROM debrief_deck').all() as { pattern_id: string }[]).map((r) => r.pattern_id));
function mineLines(): Map<string, string> {
	const out = new Map<string, string>();
	for (const r of db().prepare('SELECT pattern_id, text FROM debrief_mine ORDER BY id').all() as { pattern_id: string; text: string }[]) {
		if (r.text) out.set(r.pattern_id, r.text);
		else out.delete(r.pattern_id);
	}
	return out;
}

function notes(stats: PatternStat[], cat: DebriefPattern[]): DebriefNote[] {
	const checks = debriefChecks();
	const added = deck();
	const mine = mineLines();
	const passed = passedIds();
	const title = (id: string) => findProblem(id)?.title ?? id;
	return stats.map((st) => {
		const p = cat.find((c) => c.id === st.id)!;
		const c = checks.get(p.check);
		return {
			id: p.id, title: p.title, short: p.short, runs: st.runs, sessions: st.sessions, lastAt: st.lastAt, note: st.note,
			problems: st.problems.map((id) => ({ id, title: title(id) })),
			evidence: st.evidence.map((h) => ({ problemId: h.problemId, title: h.title, at: h.at, ...h.evidence })),
			rule: p.rule, examples: examplesOf(p.verify), mine: mine.get(p.id) ?? null,
			check: c && c.debrief === p.id ? { id: c.id, prompt: c.prompt, code: c.code, options: c.options, answer: c.answer } : null,
			inDeck: added.has(p.id),
			practice: p.practice.flatMap((id) => (findProblem(id) ? [{ id, title: title(id), passed: passed.has(id) }] : [])),
			questions: st.questions.slice(-4).map((q) => ({ problemId: q.problemId, at: q.at, text: q.text }))
		};
	});
}

/** One practice problem for the most frequent note: the first not yet passed, else the one passed longest ago. */
function warmupOf(ns: DebriefNote[]): DebriefData['warmup'] {
	const top = ns.find((n) => n.note && n.practice.length);
	if (!top) return null;
	const pick = top.practice.find((p) => !p.passed) ?? [...top.practice].sort((a, b) => lastPassed(a.id) - lastPassed(b.id))[0];
	return { patternId: top.id, short: top.short, problemId: pick.id, title: pick.title };
}

// ---------- readings and choices ----------
type ReadingRow = { id: number; created_at: number; backend: string; body: string };
const backendName = (id: string) => (id in BACKENDS ? BACKENDS[id as BackendId] : id);
function toReading(r: ReadingRow): DebriefReading | null {
	try {
		const body = JSON.parse(r.body) as { sentences?: DebriefReading['sentences'] };
		return Array.isArray(body.sentences) ? { id: r.id, createdAt: r.created_at, backend: r.backend, backendName: backendName(r.backend), sentences: body.sentences } : null;
	} catch {
		return null;
	}
}
const latestReading = () => {
	const r = db().prepare('SELECT * FROM debrief_readings ORDER BY id DESC LIMIT 1').get() as ReadingRow | undefined;
	return r ? toReading(r) : null;
};
const latestChoice = () => {
	const r = db().prepare('SELECT at, choice FROM debrief_choices ORDER BY id DESC LIMIT 1').get() as { at: number; choice: string } | undefined;
	return r && isExperiment(r.choice) ? { id: r.choice, at: r.at } : null;
};
const experimentList = () => (Object.keys(EXPERIMENTS) as ExperimentId[]).map((id) => ({ id, title: EXPERIMENTS[id].title, detail: EXPERIMENTS[id].detail }));

const RECENT = 4;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function debriefData(date: string | null): DebriefData {
	const log = loadLog();
	const cat = catalog();
	const now = nowSec();
	const { stats, hitsByRun } = patternStats(log, cat);
	const ns = notes(stats, cat);
	const days = activeDays(log);
	const pick = date && DATE.test(date) && days.includes(date) ? date : (days[0] ?? null);
	const recent = log.sessions.filter((s) => s.endedAt !== null).sort((a, b) => b.endedAt! - a.endedAt! || b.id - a.id).slice(0, RECENT).map((s) => card(log, s, stats, hitsByRun, cat));
	const ch = latestChoice();
	return {
		notes: ns,
		unknown: unknownRepeats(log, cat).slice(0, 6),
		recent,
		days,
		day: pick ? dayView(log, pick) : null,
		focus: focusFacts(log, now),
		reading: latestReading(),
		factCount: coachingFacts(log, stats, cat, now).length,
		backends: (Object.keys(BACKENDS) as BackendId[]).map((id) => ({ id, name: BACKENDS[id] })),
		defaultBackend: DEFAULT_BACKEND,
		experiments: experimentList(),
		choice: ch ? { id: ch.id, title: EXPERIMENTS[ch.id].title, detail: EXPERIMENTS[ch.id].detail, at: ch.at, result: experimentResult(log, ch.id, ch.at, now) } : null,
		warmup: warmupOf(ns)
	};
}

// ---------- writes ----------
const MARKS: MarkKind[] = ['away', 'back', 'idle', 'active'];
type LatestSession = { id: number; ended_at: number | null };

/** A mark from the problem page, only while the latest session of that problem is open. A repeat of the last mark is ignored. */
export function recordMark(problemId: string, kind: unknown): boolean {
	if (typeof kind !== 'string' || !MARKS.includes(kind as MarkKind) || !findProblem(problemId)) return false;
	const s = db().prepare('SELECT id, ended_at FROM lang_sessions WHERE lang = ? AND problem_id = ? ORDER BY id DESC LIMIT 1').get(LANG, problemId) as LatestSession | undefined;
	if (!s || s.ended_at !== null) return false;
	const last = db().prepare("SELECT kind, at FROM lang_marks WHERE session_id = ? AND kind != 'hint' ORDER BY id DESC LIMIT 1").get(s.id) as { kind: MarkKind; at: number } | undefined;
	if (last?.kind === kind) return false;
	if (!last && (kind === 'back' || kind === 'active')) return false; // nothing to close
	// the page reports idle a minute after the last input; never before the previous mark or the session start
	const at = kind === 'idle' ? Math.max(nowSec() - IDLE_AFTER_SEC, last?.at ?? 0, (db().prepare('SELECT started_at FROM lang_sessions WHERE id = ?').get(s.id) as { started_at: number }).started_at) : nowSec();
	db().prepare('INSERT INTO lang_marks(session_id, at, kind) VALUES(?,?,?)').run(s.id, at, kind);
	return true;
}

const SELF = ['clear', 'fair', 'foggy', 'none'];
export function recordSelf(problemId: string, sessionId: unknown, state: unknown): boolean {
	if (!Number.isInteger(sessionId) || typeof state !== 'string' || !SELF.includes(state)) return false;
	const s = db().prepare('SELECT id, ended_at FROM lang_sessions WHERE id = ? AND lang = ? AND problem_id = ?').get(sessionId as number, LANG, problemId) as LatestSession | undefined;
	if (!s || s.ended_at === null) return false;
	db().prepare('INSERT INTO lang_self(session_id, at, state) VALUES(?,?,?)').run(s.id, nowSec(), state);
	return true;
}

const knownPattern = (id: unknown): id is string => typeof id === 'string' && catalog().some((p) => p.id === id);

export function addToDeck(pattern: unknown): DebriefOk {
	if (!knownPattern(pattern)) return { error: '알 수 없는 노트입니다.' };
	const st = patternStats(loadLog(), catalog()).stats.find((s) => s.id === pattern);
	if (!st?.note) return { error: '아직 노트가 되지 않은 패턴입니다.' };
	if (!debriefChecks().size) return { error: '이 노트의 문제를 찾을 수 없습니다.' };
	if (!deck().has(pattern)) db().prepare('INSERT INTO debrief_deck(pattern_id, at) VALUES(?,?)').run(pattern, nowSec());
	return { ok: true };
}

export const MINE_MAX = 200;
export function saveMine(pattern: unknown, text: unknown): DebriefOk {
	if (!knownPattern(pattern)) return { error: '알 수 없는 노트입니다.' };
	if (typeof text !== 'string' || text.length > MINE_MAX) return { error: `한 줄은 ${MINE_MAX}자까지입니다.` };
	db().prepare('INSERT INTO debrief_mine(pattern_id, at, text) VALUES(?,?,?)').run(pattern, nowSec(), text.trim());
	return { ok: true };
}

export function choose(choice: unknown): DebriefOk {
	if (choice !== '' && !isExperiment(choice)) return { error: '알 수 없는 선택입니다.' };
	db().prepare('INSERT INTO debrief_choices(at, choice) VALUES(?,?)').run(nowSec(), choice);
	return { ok: true };
}

const busy = new Set<string>();
const ASK_TIMEOUT_MS = 150_000;

/** Asks one backend for coaching from the current facts; stores only the validated sentences. Nothing is stored on failure. */
export async function createReading(backendId: unknown): Promise<{ status: number; body: DebriefReadingResponse }> {
	const id = (typeof backendId === 'string' && backendId in BACKENDS ? backendId : DEFAULT_BACKEND) as BackendId;
	const key = accountId();
	if (busy.has(key)) return { status: 409, body: { error: '이미 코칭을 쓰는 중입니다. 잠시 기다려 주세요.' } };
	const log = loadLog();
	const cat = catalog();
	const now = nowSec();
	const facts: CoachFact[] = coachingFacts(log, patternStats(log, cat).stats, cat, now);
	if (!facts.length) return { status: 409, body: { error: '읽을 기록이 아직 없습니다.' } };
	busy.add(key);
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), ASK_TIMEOUT_MS);
		let text: string;
		try {
			text = await askCoach(id, coachingPrompt(facts), COACH_SYSTEM, () => {}, ctl.signal);
		} finally {
			clearTimeout(timer);
		}
		const parsed = parseCoaching(text, facts);
		if (!parsed || !parsed.sentences.length) return { status: 502, body: { error: '답을 받았지만 근거를 지킨 문장이 없었습니다. 다시 시도해 주세요.' } };
		const byId = new Map(facts.map((f) => [f.id, f]));
		const sentences = parsed.sentences.map((s) => ({ text: s.text, facts: s.factIds.map((i) => byId.get(i)!) }));
		const at = nowSec();
		const row = db().prepare('INSERT INTO debrief_readings(created_at, backend, body) VALUES(?,?,?)').run(at, id, JSON.stringify({ sentences }));
		return { status: 200, body: { reading: { id: Number(row.lastInsertRowid), createdAt: at, backend: id, backendName: backendName(id), sentences } } };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { status: 502, body: { error: `코칭을 받지 못했습니다. ${msg}`.slice(0, 600) } };
	} finally {
		busy.delete(key);
	}
}

