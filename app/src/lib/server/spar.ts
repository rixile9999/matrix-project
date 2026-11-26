import { displayJudge } from './content-language.ts';
import { tr, label } from './locale.ts';
import { WorkerUnavailable } from './worker.ts';
// Sparring (Sprint and Recall): runs, events and the views built from them. Rules and arithmetic: core/spar.ts. Contract: the Sparring
// section of src/lib/types.ts. Everything stored is an append-only event; nothing derived is stored.
import { tx } from './db.ts';
import { judge } from './judge.ts';
import { cheatEntries, findProblem, isCheatEntry, passedBasics } from './lang.ts';
import { answerCheck, checkKey, recallPool, recallSeed, recallView } from './memo.ts';
import { allRuns, appendEvent, createRun, eventsOf, getRun, isOpen, settleAll, settleOne, type RunRow, type RunWithEvents } from './spar-log.ts';
import { activeStatsRound, createStatsRound, sparStatsPool, STATS_ROUND_SIZE, statsRecords } from './spar-stats.ts';
import {
	MIN_ITEMS, RECALL_MS, SPRINT_SIZE, bestRecall, bestSprint, orderRecall, pickSprint, recallLabel, recallSummary, sprintExtremes, sprintLabel, sprintSummary,
	type RecallSummary, type SparKind, type SparStatus, type SprintSummary
} from '#lib/core/spar.ts';
import { TOPICS, type JudgeResult } from '#lib/core/lang.ts';
import type {
	SparAbandonResponse, SparHomeData, SparKindHome, SparRecallAnswerResponse, SparRecallAnswerRow, SparRecallData, SparRecallDetail, SparRecordRow, SparRecordsData,
	SparMode, SparRunDetail, SparSprintData, SparSprintDetail, SparSprintDone, SparSprintResultRow, SparSprintRunResponse, SparSprintSkipResponse
} from '#lib/types.ts';

const LANG = 'scala';
const MAX_CODE = 20_000;
const MAX_ROWS = 100;
const TREND = 5;

/** A rejected request; `status` is the HTTP status, `over` says the run is no longer running (the page should go to its result). */
export class SparFail extends Error {
	constructor(public status: 400 | 409 | 503, message: string, public over = false, public runId?: number) {
		super(message);
	}
	get body() {
		return { error: this.message, ...(this.over ? { over: true, runUrl: this.runId ? `/spar/run/${this.runId}` : undefined } : {}) };
	}
}
export const failure = (e: unknown): SparFail => (e instanceof SparFail ? e : new SparFail(e instanceof WorkerUnavailable ? 503 : 400, e instanceof Error ? e.message : String(e)));

const runUrl = (id: number) => `/spar/run/${id}`;
const screenUrl = (r: { kind: SparMode; id: number }) => `/spar/${r.kind}/${r.id}`;

/** The run for a URL parameter if it exists and has that kind. */
export function findRun(param: string, kind: SparKind): RunRow | null {
	if (!/^\d{1,9}$/.test(param)) return null;
	const r = getRun(Number(param));
	return r && r.kind === kind ? r : null;
}
export function findAnyRun(param: string): RunRow | null {
	return /^\d{1,9}$/.test(param) ? getRun(Number(param)) : null;
}

// ---------- all runs, judged ----------
type Judged = RunWithEvents & { status: SparStatus; sprint: SprintSummary | null; recall: RecallSummary | null };

/** Settles what must be settled, then every run with its status and summary, oldest first. */
function judgedRuns(now = Date.now()): Judged[] {
	const st = settleAll(now);
	return allRuns().map((r) => ({
		...r,
		status: st.get(r.id) ?? 'running',
		sprint: r.kind === 'sprint' ? sprintSummary(r.items, r.events) : null,
		recall: r.kind === 'recall' ? recallSummary(r.events) : null
	}));
}

const bestOf = (runs: Judged[], kind: SparKind): Judged | null =>
	kind === 'sprint'
		? bestSprint(runs.filter((r) => r.kind === 'sprint').map((r) => ({ ...r, summary: r.sprint! })))
		: bestRecall(runs.filter((r) => r.kind === 'recall').map((r) => ({ ...r, summary: r.recall! })));

function rowOf(r: Judged, best: boolean): SparRecordRow {
	const sp = r.sprint;
	const rc = r.recall;
	return {
		id: r.id,
		kind: r.kind,
		startedAt: r.startedAt,
		status: r.status,
		label: sp ? sprintLabel(r.status, sp, tr('ko', 'en')) : recallLabel(r.status, rc!, tr('ko', 'en')),
		totalMs: sp && r.status === 'finished' ? sp.totalMs : null,
		skipped: sp?.skipped ?? 0,
		answered: rc?.answered ?? 0,
		correct: rc?.correct ?? 0,
		accuracy: rc?.accuracy ?? null,
		best
	};
}

function rowsOf(runs: Judged[]): SparRecordRow[] {
	const best = new Set([bestOf(runs, 'sprint')?.id, bestOf(runs, 'recall')?.id]);
	return runs.map((r) => rowOf(r, best.has(r.id)));
}

// ---------- home and records ----------
export function homeData(): SparHomeData {
	const rows = [...rowsOf(judgedRuns()), ...statsRecords()];
	const kindHome = (kind: SparMode, eligible: number, needed = MIN_ITEMS): SparKindHome => {
		const mine = rows.filter((r) => r.kind === kind);
		const done = mine.filter((r) => r.status === 'finished');
		return { eligible, needed, startable: eligible >= needed, best: mine.find((r) => r.best) ?? null, last: done.at(-1) ?? null, trend: done.slice(-TREND) };
	};
	const active = rows.find((r) => r.status === 'running');
	return {
		sprint: kindHome('sprint', passedBasics().length),
		recall: kindHome('recall', recallPool().length),
		stats: kindHome('stats', sparStatsPool().length, STATS_ROUND_SIZE),
		active: active ? { id: active.id, kind: active.kind, startedAt: active.startedAt, url: screenUrl(active) } : null,
		runs: rows.length
	};
}

export function recordsData(): SparRecordsData {
	const rows = [...rowsOf(judgedRuns()), ...statsRecords()].sort((a, b) => b.startedAt - a.startedAt || b.id - a.id);
	return { rows: rows.slice(0, MAX_ROWS), total: rows.length, truncated: rows.length > MAX_ROWS };
}

// ---------- start ----------
/** Starts a run, or returns the active one (any kind). Throws SparFail(409) when there is not enough material. */
function start(kind: SparMode, now = Date.now()): { id: number; kind: SparMode } {
	return tx(() => {
		const active = activeStatsRound(now) ?? judgedRuns(now).find((r) => r.status === 'running');
		if (active) return { id: active.id, kind: active.kind };
		if (kind === 'stats') {
			const pool = sparStatsPool(now);
			if (pool.length < STATS_ROUND_SIZE) throw new SparFail(409, tr('풀 수 있는 통계 문제가 부족합니다.', 'There are not enough statistics problems.'));
			return { id: createStatsRound(pool, now), kind };
		}
		if (kind === 'sprint') {
			const pool = passedBasics();
			if (pool.length < MIN_ITEMS) throw new SparFail(409, tr(`통과한 기본 문제가 ${MIN_ITEMS}개 이상 있어야 합니다. 지금 ${pool.length}개입니다.`, `Pass at least ${MIN_ITEMS} basic problems to start. Currently ${pool.length}.`));
			const recent = new Set(allRuns('sprint').slice(-2).flatMap((r) => r.items));
			return { id: createRun('sprint', pickSprint(pool.map((p) => ({ id: p.id, topic: p.topic })), recent, Math.random, SPRINT_SIZE), now), kind };
		}
		const pool = recallPool();
		if (pool.length < MIN_ITEMS) throw new SparFail(409, tr(`열린 점검이 ${MIN_ITEMS}개 이상 있어야 합니다. 지금 ${pool.length}개입니다.`, `Unlock at least ${MIN_ITEMS} checks to start. Currently ${pool.length}.`));
		return { id: createRun('recall', orderRecall(pool), now), kind };
	});
}
export const startSprint = () => start('sprint');
export const startRecall = () => start('recall');
export const startStats = (now?: number) => start('stats', now);

// ---------- Sprint ----------
const bestSprintRun = (runs: Judged[], before?: number) => {
	const b = bestSprint(runs.filter((r) => r.kind === 'sprint' && (before === undefined || r.id < before)).map((r) => ({ ...r, summary: r.sprint! })));
	return b ? { run: b, id: b.id, totalMs: b.sprint!.totalMs!, cumMs: b.sprint!.rows.map((x) => x.cumMs!) } : null;
};

/** The whole Sprint screen state for a run (any status). */
export function sprintView(runId: number): SparSprintData {
	const settled = settleOne(runId);
	if (!settled) throw new SparFail(409, tr('기록을 찾을 수 없습니다.', 'Record not found.'));
	let { status } = settled;
	const run = settled.run;
	const events = eventsOf(runId);
	const summary = sprintSummary(run.items, events);
	const best = bestSprintRun(judgedRuns(), runId); // races against the best run from before this one
	const total = run.items.length;
	const index = summary.done;
	let problem: SparSprintData['problem'] = null;
	let code = '';
	let lastResult: JudgeResult | null = null;
	let runs = 0;

	if (status === 'running' && index >= total) {
		appendEvent(runId, 'finish', summary.totalMs ?? Date.now() - run.startedMs);
		status = 'finished';
	}
	if (status === 'running') {
		const p = findProblem(run.items[index]);
		if (!p) {
			appendEvent(runId, 'abandon', Date.now() - run.startedMs); // the problem vanished from disk: nothing sensible to do but end the run
			status = 'abandoned';
		} else {
			const mine = events.filter((e) => e.type === 'run' && e.itemId === p.id);
			const last = mine.at(-1)?.payload as { code?: string; result?: JudgeResult } | undefined;
			code = last?.code ?? p.starter;
			lastResult = last?.result ? displayJudge(last.result) : null;
			runs = mine.length;
			problem = {
				id: p.id, topic: p.topic, topicLabel: label(TOPICS[p.topic]), kind: p.kind, title: p.title, limitSec: p.limitSec, statement: p.statement, starter: p.starter,
				avoid: p.kind === 'refactor' ? p.avoid : [], bestCumMs: best?.cumMs[index] ?? null
			};
		}
	}
	const done: SparSprintDone[] = summary.rows.flatMap((r, i) => {
		if (r.outcome === null) return [];
		const bc = best?.cumMs[i] ?? null;
		return [{ problemId: r.id, title: findProblem(r.id)?.title ?? r.id, outcome: r.outcome, splitMs: r.splitMs!, cumMs: r.cumMs!, runs: r.runs, bestCumMs: bc, deltaMs: bc === null ? null : r.cumMs! - bc }];
	});
	return {
		run: { id: runId, startedAt: run.startedAt },
		status,
		runUrl: status === 'running' ? null : runUrl(runId),
		total,
		index: status === 'finished' ? total : index,
		problem,
		code,
		lastResult,
		runs,
		done,
		best: best ? { id: best.id, totalMs: best.totalMs, cumMs: best.cumMs } : null,
		elapsedMs: Date.now() - run.startedMs,
		cheat: cheatEntries()
	};
}

/** The run if it is a running Sprint and `problemId` is its current problem; otherwise throws SparFail(409). */
function currentSprint(runId: number, problemId: unknown): { run: RunRow; index: number } {
	const s = settleOne(runId);
	if (!s || s.run.kind !== 'sprint') throw new SparFail(409, tr('기록을 찾을 수 없습니다.', 'Record not found.'));
	if (s.status !== 'running') throw new SparFail(409, tr('이미 끝난 도전입니다.', 'This challenge has ended.'), true, runId);
	const index = sprintSummary(s.run.items, eventsOf(runId, true)).done;
	if (typeof problemId !== 'string' || s.run.items[index] !== problemId) throw new SparFail(409, tr('이미 지나간 문제입니다. 화면을 새로 불러오세요.', 'This problem is no longer active. Refresh the page.'));
	return { run: s.run, index };
}

export async function sprintRun(runId: number, problemId: unknown, code: unknown): Promise<SparSprintRunResponse> {
	if (typeof code !== 'string' || code.trim() === '') throw new SparFail(400, tr('코드를 입력하세요.', 'Enter your code.'));
	if (code.length > MAX_CODE) throw new SparFail(400, tr(`코드가 너무 깁니다. (최대 ${MAX_CODE.toLocaleString('en-US')}자)`, `Code exceeds ${MAX_CODE.toLocaleString('en-US')} characters.`));
	const { run, index } = currentSprint(runId, problemId);
	const p = findProblem(run.items[index]);
	if (!p) throw new SparFail(409, tr('문제를 찾을 수 없습니다.', 'Problem not found.'));
	const ms = Date.now() - run.startedMs; // the moment of submission: judge latency is not charged to the learner

	const result = await judge(LANG, p, code);

	let passed = false;
	tx(() => {
		// While the judge ran, the run may have been abandoned or the problem skipped (another tab): then nothing is recorded.
		const s = settleOne(runId);
		if (!s || s.status !== 'running' || !isOpen(runId)) throw new SparFail(409, tr('이미 끝난 도전입니다.', 'This challenge has ended.'), true, runId);
		if (sprintSummary(run.items, eventsOf(runId, true)).done !== index) throw new SparFail(409, tr('이미 지나간 문제입니다. 화면을 새로 불러오세요.', 'This problem is no longer active. Refresh the page.'));
		appendEvent(runId, 'run', ms, p.id, { code, status: result.status, result });
		if (result.status === 'passed') {
			passed = true;
			appendEvent(runId, 'pass', ms, p.id);
			if (index + 1 >= run.items.length) appendEvent(runId, 'finish', ms);
		}
	});
	return { result: displayJudge(result), passed, sprint: sprintView(runId) };
}

export function sprintSkip(runId: number, problemId: unknown): SparSprintSkipResponse {
	const { run, index } = currentSprint(runId, problemId);
	const ms = Date.now() - run.startedMs;
	tx(() => {
		appendEvent(runId, 'skip', ms, run.items[index]);
		if (index + 1 >= run.items.length) appendEvent(runId, 'finish', ms);
	});
	return { sprint: sprintView(runId) };
}

/** Records a cheat sheet opening on the current problem. False (nothing written) for unknown entries or a run that is not running. */
export function sprintLookup(runId: number, entryId: unknown): boolean {
	if (!isCheatEntry(entryId)) return false;
	const s = settleOne(runId);
	if (!s || s.run.kind !== 'sprint' || s.status !== 'running') return false;
	const index = sprintSummary(s.run.items, eventsOf(runId, true)).done;
	const item = s.run.items[index];
	if (!item) return false;
	appendEvent(runId, 'lookup', Date.now() - s.run.startedMs, item, { entryId });
	return true;
}

/** Marks a running run abandoned; a run that is already over is left as it is. */
export function abandon(runId: number): SparAbandonResponse {
	const s = settleOne(runId);
	if (s && s.status === 'running' && isOpen(runId)) appendEvent(runId, 'abandon', Date.now() - s.run.startedMs);
	return { runUrl: runUrl(runId) };
}

// ---------- Recall ----------
/** The screen state of a running Recall; null when it is not running (the caller redirects to the result). */
export function recallScreen(runId: number): SparRecallData | null {
	const t = Date.now();
	const s = settleOne(runId, t);
	if (!s || s.status !== 'running') return null;
	const events = eventsOf(runId);
	const sum = recallSummary(events);
	const id = s.run.items[sum.answered];
	const current = id ? recallView(id, runId) : null;
	if (!current) {
		appendEvent(runId, 'finish', t - s.run.startedMs); // list exhausted (or a check vanished from disk)
		return null;
	}
	return { run: { id: runId, startedAt: s.run.startedAt }, durationMs: RECALL_MS, elapsedMs: t - s.run.startedMs, listSize: s.run.items.length, answered: sum.answered, correct: sum.correct, current };
}

export async function recallAnswer(runId: number, id: unknown, choice: unknown): Promise<SparRecallAnswerResponse> {
	const t = Date.now();
	const s = settleOne(runId, t);
	if (!s || s.run.kind !== 'recall') throw new SparFail(409, tr('기록을 찾을 수 없습니다.', 'Record not found.'));
	const events = eventsOf(runId);
	const sum = recallSummary(events);
	const over = (accepted: boolean, correct: boolean | null, highlight: number | null, answered = sum.answered, right = sum.correct): SparRecallAnswerResponse =>
		({ accepted, over: true, correct, highlight, answered, correctCount: right, next: null, runUrl: runUrl(runId) });
	// Not running any more (deadline passed, abandoned, finished): the answer does not count.
	if (s.status !== 'running') return over(false, null, null);

	const current = s.run.items[sum.answered];
	if (typeof id !== 'string' || id !== current) {
		return { accepted: false, over: false, correct: null, highlight: null, answered: sum.answered, correctCount: sum.correct, next: current ? recallView(current, runId) : null, runUrl: null };
	}
	const seed = recallSeed(id, runId);
	const ms = t - s.run.startedMs;
	const lastMs = events.filter((e) => e.type === 'answer').at(-1)?.ms ?? 0;
	let r;
	try {
		r = await answerCheck(id, choice, Math.max(0, ms - lastMs), { seed }); // the existing check path: first answer within the hour is recorded as a memo review
	} catch (e) {
		throw new SparFail(e instanceof WorkerUnavailable ? 503 : 400, e instanceof Error ? e.message : String(e));
	}
	if (!r) throw new SparFail(409, tr('점검을 찾을 수 없습니다.', 'Check not found.'));
	const highlight = r.correctIndex ?? r.bugIndex;

	let last = false;
	tx(() => {
		if (!isOpen(runId) || recallSummary(eventsOf(runId, true)).answered !== sum.answered) throw new SparFail(409, tr('이미 처리된 답입니다.', 'This answer has already been recorded.'));
		appendEvent(runId, 'answer', ms, id, { choice, correct: r.correct, recorded: r.recorded, seed });
		last = sum.answered + 1 >= s.run.items.length;
		if (last) appendEvent(runId, 'finish', ms);
	});
	const answered = sum.answered + 1;
	const right = sum.correct + (r.correct ? 1 : 0);
	if (last) return over(true, r.correct, highlight, answered, right);
	const next = recallView(s.run.items[answered], runId);
	if (!next) {
		appendEvent(runId, 'finish', ms);
		return over(true, r.correct, highlight, answered, right);
	}
	return { accepted: true, over: false, correct: r.correct, highlight, answered, correctCount: right, next, runUrl: null };
}

// ---------- run detail ----------
/** 'running' for a run that is still going (the caller redirects), null for an unknown run. */
export function runDetail(runId: number): SparRunDetail | 'running' | null {
	const settled = settleOne(runId);
	if (!settled) return null;
	if (settled.status === 'running') return 'running';
	const runs = judgedRuns();
	const me = runs.find((r) => r.id === runId)!;
	const status = me.status as 'finished' | 'abandoned';
	const isBest = bestOf(runs, me.kind)?.id === runId;
	const base = { id: runId, startedAt: me.startedAt, status, label: rowOf(me, isBest).label, isBest };
	const events = eventsOf(runId);
	return me.kind === 'sprint' ? sprintDetail(me, base, events, runs) : recallDetail(me, base, events, runs);
}

type Base = Pick<SparSprintDetail, 'id' | 'startedAt' | 'status' | 'label' | 'isBest'>;

function sprintDetail(me: Judged, base: Base, events: ReturnType<typeof eventsOf>, runs: Judged[]): SparSprintDetail {
	const summary = sprintSummary(me.items, events);
	const prev = bestSprintRun(runs, me.id);
	const titles = new Map(cheatEntries().map((e) => [e.id, e.title]));
	const bestSplit = (id: string) => prev?.run.sprint!.rows.find((r) => r.id === id)?.splitMs ?? null;
	const problems: SparSprintResultRow[] = summary.rows.map((r) => {
		const p = findProblem(r.id);
		return {
			problemId: r.id,
			title: p?.title ?? r.id,
			topicLabel: p ? label(TOPICS[p.topic]) : '',
			kind: p?.kind ?? 'write',
			limitSec: p?.limitSec ?? 0,
			outcome: r.outcome,
			splitMs: r.splitMs,
			cumMs: r.cumMs,
			overLimit: !!p && r.splitMs !== null && r.splitMs > p.limitSec * 1000,
			runs: r.runs,
			bestSplitMs: bestSplit(r.id),
			lookups: r.lookups.map((entryId) => ({ entryId, title: titles.get(entryId) ?? entryId }))
		};
	});
	const x = sprintExtremes(summary.rows, bestSplit, (id) => findProblem(id)?.limitSec ?? 0);
	const ext = (e: typeof x.slowest) => (e ? { problemId: e.id, title: findProblem(e.id)?.title ?? e.id, deltaMs: e.deltaMs, basis: e.basis } : null);
	const total = base.status === 'finished' ? summary.totalMs : null;
	return {
		...base,
		kind: 'sprint',
		totalMs: total,
		skipped: summary.skipped,
		previousBest: prev ? { id: prev.id, totalMs: prev.totalMs } : null,
		deltaMs: prev && total !== null && summary.skipped === 0 ? total - prev.totalMs : null,
		problems,
		slowest: ext(x.slowest),
		fastest: ext(x.fastest),
		lookupCount: events.filter((e) => e.type === 'lookup').length
	};
}

function recallDetail(me: Judged, base: Base, events: ReturnType<typeof eventsOf>, runs: Judged[]): SparRecallDetail {
	const sum = recallSummary(events);
	const earlier = bestRecall(runs.filter((r) => r.kind === 'recall' && r.id < me.id).map((r) => ({ ...r, summary: r.recall! })));
	let lastMs = 0;
	const answers: SparRecallAnswerRow[] = events
		.filter((e) => e.type === 'answer' && e.itemId)
		.flatMap((e) => {
			const ms = Math.max(0, e.ms - lastMs);
			lastMs = e.ms;
			const seed = typeof e.payload.seed === 'string' ? e.payload.seed : undefined;
			const k = checkKey(e.itemId!, seed);
			if (!k) return [];
			const v = k.view;
			return [{
				checkId: v.id, kind: v.kind as 'trace' | 'approach' | 'bug', kindLabel: v.kindLabel, prompt: v.prompt, code: v.code, lines: v.kind === 'bug' ? v.lines : [], options: v.options,
				choice: Number(e.payload.choice), correctIndex: k.correctIndex, correct: e.payload.correct === true, whys: k.whys, why: k.why, fixed: k.fixed, ms, recorded: e.payload.recorded === true
			}];
		});
	return {
		...base,
		kind: 'recall',
		answered: sum.answered,
		correct: sum.correct,
		accuracy: sum.accuracy,
		listSize: me.items.length,
		previousBest: earlier ? { id: earlier.id, correct: earlier.recall!.correct, accuracy: earlier.recall!.accuracy! } : null,
		answers
	};
}
