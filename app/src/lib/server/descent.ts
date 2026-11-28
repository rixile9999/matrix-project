// Descent, server side: a coach chat and a code editor on one screen. The coach poses a problem from the verified pool; when the learner is
// stuck it may offer an easier sub-problem (depth <= MAX_DEPTH). The server owns the state (frames pointing at ordinary lang_sessions rows);
// the model only proposes one action per turn, which core/descent.ts checks against that state. Contract: notes/descent.md.
import { db, accountId, tx } from './db.ts';
import { english, label, tr, withLocale } from './locale.ts';
import { askCoach, connectedCoaches } from './worker.ts';
import { cheatEntries, coachBasis, findProblem, restartSession, sessionView, startSession, useHint } from './lang.ts';
import { listProblems } from './judge.ts';
import { DEFAULT_BACKEND, catalog, loadLog } from './debrief.ts';
import { BACKENDS, langAccess, type BackendId } from '#lib/core/coach.ts';
import { formatResult } from '#lib/core/coach-prompt.ts';
import { patternStats } from '#lib/core/debrief.ts';
import {
	DESCENT_SYSTEM, MAX_DEPTH, REVISIT_DAYS, allowed, parseReply, phase, reduce, turnPrompt, validate,
	type Event, type Frame, type FrameStatus, type Phase, type PoolItem, type Reply, type State, type TurnInput
} from '#lib/core/descent.ts';
import { TOPICS, type JudgeResult, type LangProblem } from '#lib/core/lang.ts';
import type { Locale } from '#lib/locale.ts';
import type { DescentData, DescentMessage, DescentOk } from '#lib/types.ts';

const LANG = 'scala';
const nowSec = () => Math.floor(Date.now() / 1000);
const ASK_TIMEOUT_MS = 150_000;
const TEXT_MAX = 1000;
const POSE_MAX = 16;
const OFFER_MAX = 6;
const HISTORY = 10;
const MAX_HINTS = 2;
const MEMORY_MAX = 12;

type Result = { status: number; body: DescentOk };
const fail = (status: number, error: string): Result => ({ status, body: { error } });
const done: Result = { status: 200, body: { ok: true } };

/** One model call (or choice) per account at a time. */
const busy = new Set<string>();

// ---------- rows ----------
type ThreadRow = { id: number; started_at: number; ended_at: number | null; backend: string; pending: string | null };
type FrameRow = {
	id: number; thread_id: number; parent_id: number | null; problem_id: string; depth: number; gap: string | null; session_id: number | null; opened_at: number;
	closed_at: number | null; status: FrameStatus; seen_run: number; seen_hints: number; seen_over: number; seen_end: number; notified: string | null; example: number;
};
type SessionRow = { id: number; problem_id: string; started_at: number; hints_used: number; ended_at: number | null; outcome: 'passed' | 'revealed' | null; elapsed_sec: number | null };
type MessageRow = { id: number; at: number; role: 'me' | 'coach' | 'event'; text: string; tone: 'good' | 'bad' | null; offer: string | null };

const openThread = () => db().prepare('SELECT * FROM descent_threads WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').get() as ThreadRow | undefined;
const frameRows = (threadId: number) => db().prepare('SELECT * FROM descent_frames WHERE thread_id = ? AND closed_at IS NULL ORDER BY depth, id').all(threadId) as FrameRow[];
const frameRow = (id: number) => db().prepare('SELECT * FROM descent_frames WHERE id = ?').get(id) as FrameRow;
const latestSession = (problemId: string) =>
	db().prepare('SELECT * FROM lang_sessions WHERE lang = ? AND problem_id = ? ORDER BY id DESC LIMIT 1').get(LANG, problemId) as SessionRow | undefined;
const maxRun = (sessionId: number) => ((db().prepare('SELECT MAX(id) AS id FROM lang_runs WHERE session_id = ?').get(sessionId) as { id: number | null }).id ?? 0);
const titleOf = (id: string) => findProblem(id)?.title ?? id;

const connected = async (): Promise<BackendId[]> => {
	try {
		return await connectedCoaches();
	} catch {
		return [];
	}
};

// ---------- state ----------
/** A frame as the state machine sees it. The top frame's status and overtime come straight from the problem's latest session (the records are the truth). */
function toFrame(f: FrameRow, top: boolean): Frame {
	let status = f.status;
	let overtime = false;
	if (top) {
		const p = findProblem(f.problem_id);
		const s = latestSession(f.problem_id);
		if (p && s) {
			if (s.ended_at !== null) status = s.outcome === 'passed' ? 'passed' : 'failed';
			else {
				status = 'solving';
				overtime = nowSec() > s.started_at + p.limitSec;
			}
		}
	}
	return { id: f.id, problemId: f.problem_id, depth: f.depth, status, overtime, gap: f.gap };
}

function loadState(t: ThreadRow): State {
	const rows = frameRows(t.id);
	let pending: State['pending'] = null;
	try {
		pending = t.pending ? (JSON.parse(t.pending) as State['pending']) : null;
	} catch {
		pending = null;
	}
	return { stack: rows.map((r, i) => toFrame(r, i === rows.length - 1)), pending };
}

/** Writes `next` over `prev`: frames that left the stack are closed, the others get their status, the pending offer is stored. */
function save(t: ThreadRow, prev: State, next: State): void {
	const keep = new Set(next.stack.map((f) => f.id));
	for (const f of prev.stack) if (!keep.has(f.id)) db().prepare('UPDATE descent_frames SET closed_at = ? WHERE id = ?').run(nowSec(), f.id);
	for (const f of next.stack) db().prepare('UPDATE descent_frames SET status = ? WHERE id = ?').run(f.status, f.id);
	db().prepare('UPDATE descent_threads SET pending = ? WHERE id = ?').run(next.pending ? JSON.stringify(next.pending) : null, t.id);
}

/** Applies one event; null (and nothing written) when it does not fit the state. */
function step(t: ThreadRow, state: State, e: Event): State | null {
	const next = reduce(state, e);
	if (JSON.stringify(next) === JSON.stringify(state)) return null;
	save(t, state, next);
	return next;
}

function insertFrame(t: ThreadRow, parentId: number | null, problemId: string, depth: number, gap: string | null): Frame {
	const s = latestSession(problemId);
	const p = findProblem(problemId);
	// Whatever the session already holds (a resumed one) is not news to sync.
	const over = !!s && !!p && s.ended_at === null && nowSec() > s.started_at + p.limitSec;
	const id = Number(db().prepare(`INSERT INTO descent_frames(thread_id, parent_id, problem_id, depth, gap, session_id, opened_at, status, seen_run, seen_hints, seen_over, seen_end)
		VALUES(?,?,?,?,?,?,?, 'solving', ?,?,?,?)`).run(t.id, parentId, problemId, depth, gap, s?.id ?? null, nowSec(), s ? maxRun(s.id) : 0, s?.hints_used ?? 0, over ? 1 : 0, s && s.ended_at !== null ? 1 : 0).lastInsertRowid);
	return { id, problemId, depth, status: 'solving', overtime: false, gap };
}

// ---------- messages ----------
// Events, hints, the worked example and the server's default lines are stored as codes and worded when they are read, so an English <-> Korean
// switch changes them. The coach's own words are stored as written.
const CODE = '\u0001';
const code = (kind: string, ...args: (string | number)[]) => CODE + [kind, ...args].join('|');

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;

function exampleText(problemId: string): string {
	const p = findProblem(problemId);
	if (!p) return '';
	const titles = (p.refs ?? []).flatMap((id) => cheatEntries().find((e) => e.id === id)?.title ?? []);
	return titles.length ? `${p.hints[1]} ${tr('치트시트', 'Cheat sheet')}: ${titles.map((x) => '`' + x + '`').join(', ')}` : p.hints[1];
}

function words(text: string): string {
	if (!text.startsWith(CODE)) return text;
	const [kind, a = '', b = ''] = text.slice(1).split('|');
	const late = b === '1' ? tr(' · 시간 끝', ' · time up') : '';
	switch (kind) {
		case 'pass': return tr('통과', 'Passed') + ' · ' + mmss(Number(a)) + late;
		case 'fail': {
			const n = Number(a);
			return (n > 1 ? tr(`오류 ${n}`, `${n} errors`) : n === 1 ? tr('오류 1', '1 error') : tr('실패', 'Failed')) + late;
		}
		case 'compile': return tr('컴파일 오류', 'Compile error') + late;
		case 'timeout': return tr('실행 시간 초과', 'Run timed out') + late;
		case 'late': return tr('시간 끝', 'Time up');
		case 'reveal': return tr('공개', 'Revealed');
		case 'hintev': return tr(`힌트 ${a}`, `Hint ${a}`);
		case 'down': return '↓ ' + titleOf(a);
		case 'up': return '↑ ' + titleOf(a);
		case 'stay': return tr('계속', 'Stay');
		case 'hint': return findProblem(a)?.hints[Number(b) - 1] ?? '';
		case 'ex': return exampleText(a);
		case 'd':
			return ({
				err: tr('답을 받지 못했어요.', 'No reply.'),
				ok: tr('계속해요.', 'Go on.'),
				pose: tr('이걸로 시작해요.', 'Start here.'),
				offer: tr('이 부분부터 풀어 볼래요?', 'Try this part first?'),
				ascend: tr('원래 문제로 올라갈까요?', 'Back to the original?')
			} as Record<string, string>)[a] ?? '';
		default: return '';
	}
}

function addMessage(threadId: number, role: MessageRow['role'], text: string, tone: MessageRow['tone'] = null, offer: object | null = null, at = nowSec()): number {
	return Number(db().prepare('INSERT INTO descent_messages(thread_id, at, role, text, tone, offer) VALUES(?,?,?,?,?,?)').run(threadId, at, role, text, tone, offer ? JSON.stringify(offer) : null).lastInsertRowid);
}

const messageRows = (threadId: number) => db().prepare('SELECT id, at, role, text, tone, offer FROM descent_messages WHERE thread_id = ? ORDER BY id').all(threadId) as MessageRow[];

function messageViews(t: ThreadRow, rows: MessageRow[]): DescentMessage[] {
	let open: number | null = null;
	if (t.pending) {
		const kind = (JSON.parse(t.pending) as { kind: string }).kind;
		for (const r of rows) if (r.offer && (JSON.parse(r.offer) as { kind: string }).kind === kind) open = r.id;
	}
	return rows.map((r) => {
		const o = r.offer ? (JSON.parse(r.offer) as { kind: 'descend' | 'ascend' }) : null;
		return { id: r.id, at: r.at, role: r.role, text: words(r.text), tone: r.role === 'event' ? r.tone : null, offer: o ? { kind: o.kind, open: r.id === open } : null };
	});
}

// ---------- the pool ----------
const pool = (): LangProblem[] => listProblems(LANG).flatMap((p) => (!p.book ? (findProblem(p.id) ?? []) : []));
const passedIds = () => new Set((db().prepare("SELECT DISTINCT problem_id FROM lang_sessions WHERE lang = ? AND outcome = 'passed'").all(LANG) as { problem_id: string }[]).map((r) => r.problem_id));
const shared = (a: LangProblem, b: LangProblem) => (a.refs ?? []).filter((r) => (b.refs ?? []).includes(r)).length;

const item = (p: LangProblem): PoolItem => ({ id: p.id, title: p.title, topic: label(TOPICS[p.topic]), level: p.level, targets: p.targets });

// ---------- revisits ----------
/** A revisit is done once a session of that problem that started after the due date passes. Settled lazily whenever the thread is read. */
function settleRevisits(): void {
	const open = db().prepare('SELECT id, problem_id, due_at FROM descent_revisits WHERE done_at IS NULL').all() as { id: number; problem_id: string; due_at: number }[];
	for (const r of open) {
		const s = db().prepare("SELECT MIN(ended_at) AS at FROM lang_sessions WHERE lang = ? AND problem_id = ? AND outcome = 'passed' AND started_at >= ?").get(LANG, r.problem_id, r.due_at) as { at: number | null };
		if (s.at !== null) db().prepare('UPDATE descent_revisits SET done_at = ? WHERE id = ?').run(s.at, r.id);
	}
}
/** Problem ids whose revisit is due now, the longest overdue first. */
const dueRevisits = (): string[] => {
	settleRevisits();
	return (db().prepare('SELECT DISTINCT problem_id FROM descent_revisits WHERE done_at IS NULL AND due_at <= ? ORDER BY due_at').all(nowSec()) as { problem_id: string }[]).map((r) => r.problem_id);
};

// ---------- candidates ----------
const unpassedFirst = (list: LangProblem[], passed: Set<string>) => [...list.filter((p) => !passed.has(p.id)), ...list.filter((p) => passed.has(p.id))];

/**
 * pose: problems with a due revisit first, then for every topic the next unpassed curriculum problem at level 1 and at level 2 (no book problems).
 * offer (for the top frame, while it may still descend): the shared links for its problem (most accepted first), lower-level problems of the
 * same topic or sharing a cheat-sheet entry, and for a level 1 parent the earlier level 1 problems sharing an entry. Unpassed first within each
 * group; never a problem already on the stack.
 */
export function candidates(state: State): { pose: PoolItem[]; offer: PoolItem[] } {
	const all = pool();
	const passed = passedIds();
	const onStack = new Set(state.stack.map((f) => f.problemId));
	const byId = new Map(all.map((p) => [p.id, p]));

	const due = dueRevisits().flatMap((id) => byId.get(id) ?? []);
	const next: LangProblem[] = [];
	for (const topic of Object.keys(TOPICS)) {
		for (const level of [1, 2]) {
			const p = all.find((q) => q.topic === topic && q.level === level && !passed.has(q.id));
			if (p) next.push(p);
		}
	}
	const dedupe = (list: LangProblem[]) => [...new Map(list.map((p) => [p.id, p])).values()];
	const pose = dedupe([...due, ...next]).filter((p) => !onStack.has(p.id)).slice(0, POSE_MAX).map(item);

	const top = state.stack[state.stack.length - 1];
	const parent = top && top.depth < MAX_DEPTH ? (byId.get(top.problemId) ?? findProblem(top.problemId)) : null;
	if (!parent) return { pose, offer: [] };
	const links = (db().prepare('SELECT sub_id FROM catalog.descent_links WHERE parent_id = ? ORDER BY accepted DESC, offered DESC, sub_id').all(parent.id) as { sub_id: string }[]).flatMap((r) => findProblem(r.sub_id) ?? []);
	const lower = all
		.filter((p) => p.level < parent.level && (p.topic === parent.topic || shared(p, parent) > 0))
		.sort((a, b) => shared(b, parent) - shared(a, parent) || b.level - a.level || a.order - b.order);
	const same = parent.level === 1 ? all.filter((p) => p.level === 1 && p.order < parent.order && shared(p, parent) > 0).sort((a, b) => b.order - a.order) : [];
	const offer = dedupe([...unpassedFirst(links, passed), ...unpassedFirst(lower, passed), ...unpassedFirst(same, passed)])
		.filter((p) => !onStack.has(p.id) && p.id !== parent.id)
		.slice(0, OFFER_MAX)
		.map(item);
	return { pose, offer };
}

// ---------- memory ----------
/** Up to MEMORY_MAX short facts: what the learner was missing, Debrief notes, revisits due, recent results. Computed from the records. */
export function memoryFacts(locale: Locale): string[] {
	return withLocale(locale, () => {
		const out: string[] = [];
		const gaps = db().prepare('SELECT gap, COUNT(*) AS n FROM descent_frames WHERE gap IS NOT NULL GROUP BY gap ORDER BY MAX(id) DESC LIMIT 4').all() as { gap: string; n: number }[];
		for (const g of gaps) out.push(tr(`빈틈: ${g.gap} (${g.n}회)`, `Gap: ${g.gap} (${g.n}x)`));

		try {
			const cat = catalog();
			const notes = patternStats(loadLog(), cat).stats.filter((s) => s.note).sort((a, b) => b.runs - a.runs).slice(0, 4);
			for (const n of notes) {
				const title = cat.find((p) => p.id === n.id)?.title;
				if (title) out.push(tr(`노트: ${title} (${n.runs}회)`, `Note: ${title} (${n.runs} runs)`));
			}
		} catch {
			// Debrief is optional context
		}

		for (const id of dueRevisits().slice(0, 3)) out.push(tr(`다시 풀 때: ${titleOf(id)}`, `Revisit due: ${titleOf(id)}`));

		const recent = db().prepare("SELECT problem_id, outcome, elapsed_sec FROM lang_sessions WHERE lang = ? AND outcome IS NOT NULL ORDER BY id DESC LIMIT 4").all(LANG) as { problem_id: string; outcome: string; elapsed_sec: number | null }[];
		for (const r of recent) {
			const p = findProblem(r.problem_id);
			if (!p) continue;
			if (r.outcome === 'passed') out.push(tr(`통과: ${p.title} · ${mmss(r.elapsed_sec ?? 0)}${(r.elapsed_sec ?? 0) > p.limitSec ? ' · 시간 초과' : ''}`, `Passed: ${p.title} · ${mmss(r.elapsed_sec ?? 0)}${(r.elapsed_sec ?? 0) > p.limitSec ? ' · over time' : ''}`));
			else out.push(tr(`공개: ${p.title}`, `Revealed: ${p.title}`));
		}
		return out.slice(0, MEMORY_MAX);
	});
}

// ---------- the thread as the page sees it ----------
export async function descentData(): Promise<DescentData> {
	const have = (await connected()).length > 0;
	const t = openThread();
	const isBusy = busy.has(accountId());
	if (!t) return { messages: [], stack: [], session: null, busy: isBusy, connected: have };
	settleRevisits();
	const state = loadState(t);
	const top = state.stack[state.stack.length - 1];
	return {
		messages: messageViews(t, messageRows(t.id)),
		stack: state.stack.map((f) => ({ problemId: f.problemId, title: titleOf(f.problemId), depth: f.depth, status: f.status })),
		session: top ? sessionView(top.problemId) : null,
		busy: isBusy,
		connected: have
	};
}

// ---------- sync: records -> events ----------
type Observed = { frame: FrameRow; phase: Phase; state: State };

/**
 * Reports what happened in the top problem's session since the last look: new runs, hints, the clock passing the limit, a reveal. What has been
 * reported is kept on the frame (last run id, hints taken, time-up and ending flags, and the session id they belong to), so looking twice adds nothing.
 * Returns the frame's phase when it just became one the coach should react to (stuck / floor / passed) and has not been told about yet.
 */
function observe(t: ThreadRow): Observed | null {
	let f = frameRows(t.id).at(-1);
	if (!f) return null;
	const p = findProblem(f.problem_id);
	const s = latestSession(f.problem_id);
	if (p && s) {
		if (f.session_id !== s.id) {
			// the session was restarted elsewhere (the problem page): its records start from zero
			db().prepare('UPDATE descent_frames SET session_id = ?, seen_run = 0, seen_hints = 0, seen_over = 0, seen_end = 0, notified = NULL, example = 0 WHERE id = ?').run(s.id, f.id);
			f = frameRow(f.id);
		}
		const limitEnd = s.started_at + p.limitSec;
		type Seen = { at: number; text: string; tone: 'good' | 'bad' | null };
		const seen: Seen[] = [];
		let over = f.seen_over === 1;
		const runs = db().prepare('SELECT id, at, status, result FROM lang_runs WHERE session_id = ? AND id > ? ORDER BY id').all(s.id, f.seen_run) as { id: number; at: number; status: JudgeResult['status']; result: string }[];
		for (const r of runs) {
			const late = r.at > limitEnd ? 1 : 0;
			if (late) over = true;
			if (r.status === 'passed') seen.push({ at: r.at, text: code('pass', r.at - s.started_at, late), tone: 'good' });
			else {
				let failing = 0;
				try {
					failing = ((JSON.parse(r.result) as JudgeResult).cases ?? []).filter((c) => c.status !== 'ok').length;
				} catch {
					// a broken row is reported without a count
				}
				seen.push({ at: r.at, text: r.status === 'compile_error' ? code('compile', 0, late) : r.status === 'timeout' ? code('timeout', 0, late) : code('fail', failing, late), tone: 'bad' });
			}
		}
		if (s.hints_used > f.seen_hints) {
			const marks = db().prepare("SELECT at FROM lang_marks WHERE session_id = ? AND kind = 'hint' ORDER BY id").all(s.id) as { at: number }[];
			for (let n = f.seen_hints + 1; n <= s.hints_used; n++) seen.push({ at: marks[n - 1]?.at ?? nowSec(), text: code('hintev', n), tone: null });
		}
		seen.sort((a, b) => a.at - b.at);
		let end = f.seen_end === 1;
		if (s.ended_at !== null) {
			if (!end && s.outcome === 'revealed') seen.push({ at: s.ended_at, text: code('reveal'), tone: 'bad' });
			end = true;
		} else if (!over && nowSec() > limitEnd) {
			seen.push({ at: nowSec(), text: code('late'), tone: 'bad' });
			over = true;
		}
		for (const e of seen) addMessage(t.id, 'event', e.text, e.tone, null, e.at);
		db().prepare('UPDATE descent_frames SET seen_run = ?, seen_hints = ?, seen_over = ?, seen_end = ? WHERE id = ?').run(
			Math.max(f.seen_run, runs.at(-1)?.id ?? 0), Math.max(f.seen_hints, s.hints_used), over ? 1 : 0, end ? 1 : 0, f.id
		);
	}
	const state = loadState(t);
	const top = state.stack[state.stack.length - 1];
	if (top) db().prepare('UPDATE descent_frames SET status = ? WHERE id = ?').run(top.status, top.id);
	const ph = phase(state);
	f = frameRow(f.id);
	if (state.pending || !['stuck', 'floor', 'passed'].includes(ph) || f.notified === ph) return null;
	return { frame: f, phase: ph, state };
}

/** Observes the records after a run, hint, reveal or the clock passing the limit; may start a coach turn. Idempotent. */
export async function sync(): Promise<Result> {
	const key = accountId();
	try {
		const t = openThread();
		if (!t) return done;
		const seen = tx(() => observe(t));
		if (!seen || busy.has(key)) return done;
		busy.add(key);
		try {
			const have = await connected();
			const live = openThread();
			if (!have.length || !live || live.id !== t.id) return done;
			const frame = frameRow(seen.frame.id);
			if (frame.closed_at !== null || frame.notified === seen.phase) return done;
			db().prepare('UPDATE descent_frames SET notified = ? WHERE id = ?').run(seen.phase, frame.id);
			await coachTurn(live, pickBackend(live, have), seen.phase === 'passed' ? 'passed' : 'stuck', null, null);
		} finally {
			busy.delete(key);
		}
		return done;
	} catch {
		return fail(500, tr('기록을 읽지 못했습니다.', 'Could not read the records.'));
	}
}

// ---------- the coach ----------
const REPAIR = '\nThe previous reply could not be used. Return only the JSON object {"say":"...","action":{...}} as described.';

function pickBackend(t: ThreadRow | undefined, have: BackendId[], requested?: unknown): BackendId {
	if (typeof requested === 'string' && Object.hasOwn(BACKENDS, requested) && have.includes(requested as BackendId)) return requested as BackendId;
	if (t && have.includes(t.backend as BackendId)) return t.backend as BackendId;
	return have.includes(DEFAULT_BACKEND) ? DEFAULT_BACKEND : have[0];
}

/** Lines of the model solution (long enough to mean something) that appear in `say`, whitespace aside. */
function leaks(say: string, solution: string): boolean {
	const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
	const text = flat(say);
	return solution.split('\n').map((l) => l.trim()).some((l) => l.length >= 14 && !l.startsWith('//') && text.includes(flat(l)));
}

function buildInput(t: ThreadRow, state: State, trigger: TurnInput['trigger'], said: string | null, exclude: number | null): { input: TurnInput; ids: { pose: string[]; offer: string[] } } {
	const cands = candidates(state);
	const ids = { pose: cands.pose.map((c) => c.id), offer: cands.offer.map((c) => c.id) };
	const top = state.stack[state.stack.length - 1];
	const basis = top ? coachBasis(top.problemId) : null;
	let problem: TurnInput['problem'] = null;
	if (top && basis) {
		// The same access the Operator panel uses: no solution before the session is over (while locked, nothing but the learner's own code and results).
		const access = langAccess(basis.session, basis.problem.limitSec, nowSec());
		const s = latestSession(top.problemId);
		problem = {
			title: basis.problem.title,
			statement: basis.problem.statement,
			code: basis.lastRun?.code ?? basis.problem.starter,
			lastResult: basis.lastRun ? formatResult(basis.lastRun.result) : null,
			solution: access === 'full' ? basis.solution() : null,
			hintsLeft: s && s.ended_at === null ? Math.max(0, MAX_HINTS - s.hints_used) : 0
		};
	}
	const history = messageRows(t.id)
		.filter((m) => m.id !== exclude && m.text !== code('d', 'err'))
		.slice(-HISTORY)
		.map((m) => ({ role: m.role, text: words(m.text) }));
	const input: TurnInput = {
		phase: phase(state),
		allowed: allowed(state, ids),
		trail: state.stack.map((f) => ({ title: titleOf(f.problemId), depth: f.depth, status: f.status })),
		memory: memoryFacts(english() ? 'en' : 'ko'),
		candidates: cands,
		problem, history, said, trigger
	};
	return { input, ids };
}

/** Asks the model once (twice when the first reply is not usable) and applies the validated reply. A failure becomes a short coach line; the state is never touched by it. */
async function coachTurn(t: ThreadRow, backend: BackendId, trigger: TurnInput['trigger'], said: string | null, exclude: number | null): Promise<void> {
	const { input } = tx(() => buildInput(t, loadState(t), trigger, said, exclude));
	const system = DESCENT_SYSTEM(english() ? 'en' : 'ko');
	let reply: Reply | null = null;
	for (const repair of [false, true]) {
		try {
			reply = parseReply(await askCoach(backend, turnPrompt(input), repair ? system + REPAIR : system, () => {}, AbortSignal.timeout(ASK_TIMEOUT_MS), true));
		} catch {
			break;
		}
		if (reply) break;
	}
	const live = openThread();
	if (!live || live.id !== t.id) return; // closed while the model was thinking
	try {
		tx(() => {
			if (reply) applyReply(live, reply);
			else addMessage(live.id, 'coach', code('d', 'err'));
		});
	} catch {
		addMessage(live.id, 'coach', code('d', 'err'));
	}
}

/** The clean text of a reply: no control characters (the code marker among them). */
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f]/g, '');

/** Checks the reply against the state as it is now and does what is allowed. Side effects come first, so a failing one leaves only the text. */
function applyReply(t: ThreadRow, proposed: Reply): void {
	const state = loadState(t);
	const cands = candidates(state);
	const ids = { pose: cands.pose.map((c) => c.id), offer: cands.offer.map((c) => c.id) };
	const reply = validate(proposed, state, ids);
	let say = clean(reply.say);
	let action = reply.action;
	const topFrame = state.stack[state.stack.length - 1];
	const row = topFrame ? frameRow(topFrame.id) : null;
	const s = topFrame ? latestSession(topFrame.problemId) : undefined;
	const basis = topFrame ? coachBasis(topFrame.problemId) : null;

	// Until the session has ended the coach may not say the solution, whatever it was told.
	if (basis && !(s && s.ended_at !== null) && leaks(say, basis.solution())) say = '';
	if (action.type === 'hint' && !(s && s.ended_at === null && s.hints_used < MAX_HINTS)) action = { type: 'say' };
	if (action.type === 'example' && (!row || row.example === 1)) action = { type: 'say' };

	switch (action.type) {
		case 'pose': {
			try {
				startSession(action.problemId);
				const frame = insertFrame(t, null, action.problemId, 0, null);
				if (step(t, state, { type: 'posed', frame })) { // a passed root that is replaced leaves the stack (save closes it)
					addMessage(t.id, 'coach', say || code('d', 'pose'));
					return;
				}
				db().prepare('UPDATE descent_frames SET closed_at = ? WHERE id = ?').run(nowSec(), frame.id);
			} catch {
				// the problem cannot be opened: only the words stay
			}
			break;
		}
		case 'offer': {
			const next = step(t, state, { type: 'offered', problemId: action.problemId, gap: action.gap });
			if (next) {
				db().prepare('INSERT INTO catalog.descent_links(parent_id, sub_id, gap, offered, accepted) VALUES(?,?,?,1,0) ON CONFLICT(parent_id, sub_id) DO UPDATE SET offered = offered + 1').run(topFrame!.problemId, action.problemId, action.gap);
				addMessage(t.id, 'coach', say || code('d', 'offer'), null, { kind: 'descend', problemId: action.problemId, gap: action.gap });
				return;
			}
			break;
		}
		case 'ascend': {
			const next = step(t, state, { type: 'ascendOffered' });
			if (next) {
				addMessage(t.id, 'coach', say || code('d', 'ascend'), null, { kind: 'ascend' });
				return;
			}
			break;
		}
		case 'hint': {
			const r = useHint(topFrame!.problemId);
			if (say) addMessage(t.id, 'coach', say);
			addMessage(t.id, 'coach', code('hint', topFrame!.problemId, r.hints.length));
			db().prepare('UPDATE descent_frames SET seen_hints = ? WHERE id = ?').run(r.hints.length, topFrame!.id); // the hint line is the report; sync need not repeat it
			return;
		}
		case 'example': {
			// The worked example is hint 2: taking it is recorded like taking the hints.
			if (s && s.ended_at === null) while ((latestSession(topFrame!.problemId)?.hints_used ?? MAX_HINTS) < MAX_HINTS) useHint(topFrame!.problemId);
			if (say) addMessage(t.id, 'coach', say);
			addMessage(t.id, 'coach', code('ex', topFrame!.problemId));
			db().prepare('UPDATE descent_frames SET example = 1, seen_hints = ? WHERE id = ?').run(latestSession(topFrame!.problemId)?.hints_used ?? 0, topFrame!.id);
			return;
		}
	}
	addMessage(t.id, 'coach', say || code('d', 'ok'));
}

// ---------- the learner's turn ----------
export async function turn(body: { text?: unknown; choice?: unknown; backend?: unknown }): Promise<Result> {
	const key = accountId();
	if (busy.has(key)) return fail(409, tr('이미 답을 기다리는 중입니다.', 'Already waiting for a reply.'));
	busy.add(key);
	try {
		if (body.choice !== undefined) {
			if (body.choice !== 'accept' && body.choice !== 'decline') return fail(400, tr('알 수 없는 선택입니다.', 'Unknown choice.'));
			const t = openThread();
			if (!t) return fail(409, tr('답할 제안이 없습니다.', 'Nothing to answer.'));
			return tx(() => choose(t, body.choice as 'accept' | 'decline'));
		}
		const start = body.text === undefined;
		const said = typeof body.text === 'string' ? body.text.trim() : '';
		if (!start && !said) return fail(400, tr('메시지를 입력하세요.', 'Write a message.'));
		if (said.length > TEXT_MAX) return fail(400, tr(`메시지가 너무 깁니다. (최대 ${TEXT_MAX.toLocaleString('en-US')}자)`, `Message exceeds ${TEXT_MAX.toLocaleString('en-US')} characters.`));
		const have = await connected();
		if (!have.length) return fail(409, tr('코치가 연결되어 있지 않습니다.', 'No coach connected.'));

		let t = openThread();
		const backend = pickBackend(t, have, body.backend);
		if (start && t && (frameRows(t.id).length || messageRows(t.id).length)) return fail(400, tr('이미 진행 중입니다.', 'Already under way.'));
		if (!t) {
			const id = Number(db().prepare('INSERT INTO descent_threads(started_at, backend) VALUES(?,?)').run(nowSec(), backend).lastInsertRowid);
			t = db().prepare('SELECT * FROM descent_threads WHERE id = ?').get(id) as ThreadRow;
		} else if (t.backend !== backend) {
			db().prepare('UPDATE descent_threads SET backend = ? WHERE id = ?').run(backend, t.id);
		}
		const live = t;
		const mine = start ? null : addMessage(live.id, 'me', said);
		const seen = tx(() => observe(live)); // the model sees the records as they are now
		if (seen) db().prepare('UPDATE descent_frames SET notified = ? WHERE id = ?').run(seen.phase, seen.frame.id); // it is being asked anyway
		await coachTurn(live, backend, start ? 'start' : 'message', start ? null : said, mine);
		return done;
	} catch {
		return fail(500, tr('코치 차례를 처리하지 못했습니다.', 'Could not take the turn.'));
	} finally {
		busy.delete(key);
	}
}

/** The learner's answer to the open offer. The model is not asked; the state moves by itself. */
function choose(t: ThreadRow, choice: 'accept' | 'decline'): Result {
	const state = loadState(t);
	const pending = state.pending;
	if (!pending) return fail(409, tr('답할 제안이 없습니다.', 'Nothing to answer.'));
	const top = state.stack[state.stack.length - 1];

	if (pending.kind === 'descend') {
		if (choice === 'decline') {
			step(t, state, { type: 'declined' });
			addMessage(t.id, 'event', code('stay'));
			return done;
		}
		const sub = findProblem(pending.problemId);
		if (!sub || top.depth >= MAX_DEPTH) return fail(409, tr('이 문제는 지금 열 수 없습니다.', 'This problem cannot be opened now.'));
		// The parent's session is left exactly as it is: not ended, not counted as a detour.
		startSession(sub.id);
		const frame = insertFrame(t, top.id, sub.id, top.depth + 1, pending.gap);
		if (!step(t, state, { type: 'accepted', frame })) throw new Error('descent: accepted does not fit the state');
		addMessage(t.id, 'event', code('down', sub.id));
		if (!db().prepare('SELECT 1 FROM descent_revisits WHERE problem_id = ? AND done_at IS NULL').get(top.problemId)) {
			db().prepare('INSERT INTO descent_revisits(problem_id, frame_id, due_at) VALUES(?,?,?)').run(top.problemId, top.id, nowSec() + REVISIT_DAYS * 86400);
		}
		db().prepare('INSERT INTO catalog.descent_links(parent_id, sub_id, gap, offered, accepted) VALUES(?,?,?,0,1) ON CONFLICT(parent_id, sub_id) DO UPDATE SET accepted = accepted + 1').run(top.problemId, sub.id, pending.gap);
		return done;
	}

	if (choice === 'decline') {
		step(t, state, { type: 'stay' });
		addMessage(t.id, 'event', code('stay'));
		return done;
	}
	const parent = state.stack[state.stack.length - 2];
	if (!parent) return fail(409, tr('올라갈 문제가 없습니다.', 'Nothing above.'));
	// A fresh, clean session for the parent. Its old session row, if still open, stays in the log as it is (superseded by the new one).
	try {
		restartSession(parent.problemId);
	} catch {
		return fail(409, tr('이 문제는 지금 열 수 없습니다.', 'This problem cannot be opened now.'));
	}
	const fresh = latestSession(parent.problemId);
	step(t, state, { type: 'ascended' });
	db().prepare("UPDATE descent_frames SET session_id = ?, seen_run = 0, seen_hints = 0, seen_over = 0, seen_end = 0, notified = NULL, example = 0, status = 'solving' WHERE id = ?").run(fresh?.id ?? null, parent.id);
	addMessage(t.id, 'event', code('up', parent.problemId));
	return done;
}

// ---------- close ----------
/** Ends the open thread: the stack is cleared, the problems' sessions are left as they are. Closing with nothing open does nothing. */
export function closeThread(): DescentOk {
	const t = openThread();
	if (!t) return { ok: true };
	tx(() => {
		const state = loadState(t);
		save(t, state, reduce(state, { type: 'closed' }));
		db().prepare('UPDATE descent_threads SET ended_at = ? WHERE id = ?').run(nowSec(), t.id);
	});
	return { ok: true };
}
