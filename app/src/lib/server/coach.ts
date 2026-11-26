import { english, tr, label } from './locale.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runScala, askCoach, connectedCoaches} from './worker.ts';
import { db, accountId } from './db.ts';
import { coachBasis } from './lang.ts';
import { coachCard } from './memo.ts';
import { findLesson, runView, statsCoachSubmissions } from './stats.ts';

import { scalaErrors } from './scala-run.ts';
import { BACKENDS, isCoachKind, isCoachRunId, langAccess, parseAnswer, type BackendId, type CoachAccess, type CoachContext } from '#lib/core/coach.ts';
import { CODE_MAX, QUESTION_MAX, buildPrompt, langContext, memoContext, statsContext, systemPrompt, type HistoryMessage } from '#lib/core/coach-prompt.ts';
import type { CoachEvent, CoachMessage, CoachThreadResponse, CoachVerifyResponse } from '#lib/types.ts';

const nowSec = () => Math.floor(Date.now() / 1000);

const MEMO_WINDOW_SEC = 24 * 3600;

// ---------- messages ----------
type Row = { id: number; at: number; role: 'user' | 'coach'; text: string; backend: BackendId; ms: number | null; error: number };
const toMessage = (r: Row): CoachMessage => ({ id: r.id, role: r.role, text: r.text, backend: r.role === 'coach' ? r.backend : null, ms: r.role === 'coach' ? r.ms : null, at: r.at, error: r.error === 1 });

function insert(m: { kind: CoachContext['kind']; id: string; sessionId: number | null; backend: BackendId; role: 'user' | 'coach'; text: string; ms: number | null; access: 'limited' | 'full'; error: boolean }): CoachMessage {
	const at = nowSec();
	const res = db()
		.prepare('INSERT INTO coach_messages(at, context_kind, context_id, session_id, backend, role, text, ms, access, error) VALUES(?,?,?,?,?,?,?,?,?,?)')
		.run(at, m.kind, m.id, m.sessionId, m.backend, m.role, m.text, m.ms, m.access, m.error ? 1 : 0);
	return toMessage({ id: Number(res.lastInsertRowid), at, role: m.role, text: m.text, backend: m.backend, ms: m.ms, error: m.error ? 1 : 0 });
}

/** Messages for a language session, a statistics run, or the last 24 hours of a memo card. Oldest first. */
function thread(c: Resolved): CoachMessage[] {
	const cols = 'id, at, role, text, backend, ms, error';
	const rows =
		c.kind === 'memo'
			? db().prepare(`SELECT ${cols} FROM coach_messages WHERE context_kind = 'memo' AND context_id = ? AND at >= ? ORDER BY id`).all(c.id, nowSec() - MEMO_WINDOW_SEC)
			: c.sessionId === null
				? []
				: db().prepare(`SELECT ${cols} FROM coach_messages WHERE context_kind = ? AND context_id = ? AND session_id = ? ORDER BY id`).all(c.kind, c.id, c.sessionId);
	return (rows as Row[]).map(toMessage);
}

// ---------- context and access ----------
type Resolved = {
	kind: CoachContext['kind'];
	id: string;
	access: CoachAccess;
	sessionId: number | null;
	opensAt: number | null;
	/** Reference material and its labels; null while locked. The solution etc. are only read from disk when access is 'full'. */
	material: (code?: string) => { text: string; gets: string[] } | null;
};

const SAFE_ID = /^[\w-]+$/;

/** Decides access from the server's own state. Null for an unknown item. */
export function resolveContext(kind: unknown, id: unknown, runId?: unknown): Resolved | null {
	if (!isCoachKind(kind) || typeof id !== 'string' || !SAFE_ID.test(id)) return null;
	if (kind === 'stats') {
		if (!isCoachRunId(runId)) return null;
		const lesson = findLesson(id);
		if (!lesson) return null;
		const run = runView(lesson, runId);
		if (!run) return null;
		const { outcome, elapsed, review } = run;
		if (!outcome || elapsed === null || !review) {
			return { kind, id, access: 'locked', sessionId: null, opensAt: null, material: () => null };
		}
		return {
			kind, id, access: 'full', sessionId: runId, opensAt: null,
			material: () => statsContext({
				lesson, outcome, elapsed, usedHints: run.hints, usedReference: review.usedReference,
				submissions: statsCoachSubmissions(runId)
			}, english() ? 'en' : 'ko')
		};
	}
	if (kind === 'memo') {
		const card = coachCard(id);
		if (!card) return null;
		return { kind, id, access: 'full', sessionId: null, opensAt: null, material: () => memoContext(card) };
	}
	const b = coachBasis(id);
	if (!b) return null;
	const access = langAccess(b.session, b.problem.limitSec, nowSec());
	const opensAt = access === 'locked' && b.session && b.session.endedAt === null ? b.session.startedAt + b.problem.limitSec + 1 : null;
	return {
		kind, id, access, sessionId: b.session?.id ?? null, opensAt,
		material(code) {
			if (access === 'locked') return null;
			const current = code ?? b.lastRun?.code ?? b.problem.starter;
			return langContext(access, {
				problem: b.problem,
				given: b.given,
				code: current,
				lastResult: b.lastRun?.result ?? null,
				stale: !!b.lastRun && b.lastRun.code !== current,
				full:
					access === 'full'
						? {
								solution: b.solution(), notes: b.problem.notes, targets: b.problem.targets, hints: b.problem.hints, intent: b.problem.intent ?? null,
								outcome: b.session?.outcome ?? null, elapsedSec: b.session?.elapsedSec ?? null
							}
						: null
			});
		}
	};
}

export async function threadView(kind: unknown, id: unknown, runId?: unknown): Promise<CoachThreadResponse | null> {
	const c = resolveContext(kind, id, runId);
	if (!c) return null;
	if (c.kind === 'stats' && c.access === 'locked') {
		return { access: 'locked', opensAt: null, gets: [], backends: [], messages: [] };
	}
	const gets = c.material()?.gets ?? [];
	return {
		access: c.access,
		opensAt: c.opensAt,
		gets: c.kind === 'stats' ? gets : gets.map(label),
		backends: (await connectedCoaches()).map((b) => ({ id: b, label: BACKENDS[b] })),
		messages: thread(c)
	};
}

// ---------- ask ----------
const running = new Set<string>();
export type AskFailure = { status: 400 | 403 | 404 | 409 | 503; error: string };

/**
 * Validates and starts a question. Returns a failure (nothing stored) or the NDJSON body to stream.
 * The stream is a sequence of CoachEvent lines. When `signal` aborts (client gone) the CLI process is killed.
 */
export async function startAsk(body: Record<string, unknown>, signal?: AbortSignal): Promise<AskFailure | { stream: ReadableStream<Uint8Array> }> {
	const ctx = body.context as Record<string, unknown> | undefined;
	const backendId = body.backend;
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	const code = body.code;
	if (!ctx || typeof ctx !== 'object') return { status: 400, error: tr('질문할 대상이 올바르지 않습니다.', 'Invalid coaching context.') };
	if (typeof backendId !== 'string' || !Object.hasOwn(BACKENDS, backendId)) return { status: 400, error: tr('알 수 없는 백엔드입니다.', 'Unknown provider.') };
	if (!question) return { status: 400, error: tr('질문을 입력하세요.', 'Enter a question.') };
	if (question.length > QUESTION_MAX) return { status: 400, error: tr(`질문이 너무 깁니다. (최대 ${QUESTION_MAX.toLocaleString('en-US')}자)`, `Question exceeds ${QUESTION_MAX.toLocaleString('en-US')} characters.`) };
	if (code !== undefined && (typeof code !== 'string' || code.length > CODE_MAX)) return { status: 400, error: tr('코드가 올바르지 않거나 너무 깁니다.', 'Invalid code or length limit exceeded.') };
	if (!isCoachKind(ctx.kind) || (ctx.kind === 'stats' && !isCoachRunId(ctx.runId))) return { status: 400, error: tr('질문할 대상이 올바르지 않습니다.', 'Invalid coaching context.') };

	const c = resolveContext(ctx.kind, ctx.id, ctx.runId);
	if (!c) return { status: 404, error: tr('질문할 대상을 찾을 수 없습니다.', 'Coaching context not found.') };
	if (c.access === 'locked') return {
		status: 403,
		error: c.kind === 'stats'
			? tr('연습이 끝나면 질문할 수 있습니다.', 'Questions open when the practice run ends.')
			: tr('지금은 질문할 수 없습니다. 제한시간이 지나거나 세션이 끝나면 열립니다.', 'Questions open when the timer expires or the session ends.')
	};
	const access = c.access;
	if (!(await connectedCoaches()).includes(backendId as BackendId)) return {status:503,error:tr('코치 연결 설정에서 이 제공자를 먼저 연결하세요.', 'Connect this provider in Coach settings first.')};
	const key = accountId();
	if (running.has(key)) return { status: 409, error: tr('이미 답을 기다리는 질문이 있습니다.', 'A question is already awaiting an answer.') };


	const material = c.material(c.kind === 'lang' ? (code as string | undefined) : undefined)!;
	const history: HistoryMessage[] = thread(c).filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
	const system = systemPrompt(c.kind, access, tr('ko', 'en'));
	const prompt = buildPrompt(material.text, history, question);

	running.add(key);
	const user = insert({ kind: c.kind, id: c.id, sessionId: c.sessionId, backend: backendId as BackendId, role: 'user', text: question, ms: null, access, error: false });
	const t0 = Date.now();
	const ac = new AbortController();
	const stop = () => ac.abort();
	signal?.addEventListener('abort', stop);
	const enc = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (ev: CoachEvent) => {
				try {
					controller.enqueue(enc.encode(JSON.stringify(ev) + '\n'));
				} catch {
					// the client is gone; the answer is still recorded below
				}
			};
			send({ type: 'start', userMessageId: user.id });
			let text = '';
			let failure: string | null = null;
			try {
				text = await askCoach(backendId as BackendId, prompt, system, (t) => send({ type: 'delta', text: t }), ac.signal);
			} catch (e) {
				failure = e instanceof Error ? e.message : String(e);
			}
			const ms = Date.now() - t0;
			const reply = insert({
				kind: c.kind, id: c.id, sessionId: c.sessionId, backend: backendId as BackendId, role: 'coach', text: failure ?? text, ms, access, error: failure !== null
			});
			running.delete(key);
			signal?.removeEventListener('abort', stop);
			send({ type: failure !== null ? 'error' : 'done', message: reply });
			try {
				controller.close();
			} catch {}
		},
		cancel() {
			ac.abort(); // the client disconnected: kill the CLI; start() then records the cancelled attempt
		}
	});
	return { stream };
}

// ---------- verify (trace blocks) ----------
const verified = new Map<string, CoachVerifyResponse>();

type Step = { expr: string; value: string };

/** The Scala to run: setup and one `def s<i>` per step in T.scala, a Main that shows each step and survives exceptions. */
function traceSources(setup: string, steps: { i: number; expr: string }[]): { t: string; main: string; ranges: { i: number; from: number; to: number }[]; setupEnd: number } {
	const lines = ['object T:'];
	for (const l of setup.split('\n')) lines.push('  ' + l);
	const setupEnd = lines.length;
	const ranges: { i: number; from: number; to: number }[] = [];
	for (const s of steps) {
		const from = lines.length + 1;
		lines.push(`  def s${s.i} = (`);
		for (const l of s.expr.split('\n')) lines.push('    ' + l);
		lines.push('  )');
		ranges.push({ i: s.i, from, to: lines.length });
	}
	const main = [
		'@main def run(): Unit =',
		'  def err(i: Int, e0: Throwable) =',
		'    val e = if e0.getCause != null then e0.getCause else e0',
		'    println(s"##ERR|$i|${e.getClass.getName}: ${String.valueOf(e.getMessage)}".replace("\\n", "\\\\n"))',
		'  try Cheat.touch(T) catch case e: Throwable => err(-1, e)',
		...steps.map((s) => `  try Cheat.show("t", ${s.i}, T.s${s.i}) catch case e: Throwable => err(${s.i}, e)`)
	];
	return { t: lines.join('\n') + '\n', main: main.join('\n') + '\n', ranges, setupEnd };
}

const norm = (s: string) => s.replace(/\r?\n/g, '\\n').trim();

/** Runs a trace block's setup and steps; a step that does not compile only loses itself (one recompile without it). */
export async function verifyTrace(setup: string, steps: Step[]): Promise<CoachVerifyResponse> {
	const dir = '/tmp/job';
	const result: { ok: boolean; actual: string | null }[] = steps.map(() => ({ ok: false, actual: null }));
	const fail = (error: string): CoachVerifyResponse => ({ ok: false, steps: result.map(() => ({ ok: false, actual: null })), error });


	let live = steps.map((s, i) => ({ i, expr: s.expr }));
	for (let attempt = 0; attempt < 2; attempt++) {
		const src = traceSources(setup, live);
		const r = await runScala({
			'Cheat.scala': readFileSync(resolve('cheatsheet/_harness/Cheat.scala'),'utf8'),
			'T.scala':src.t, 'Main.scala':src.main
		});
		if (r.timedOut) return fail(tr('시간 안에 끝나지 않았습니다. ', 'Time limit exceeded.'));
		const errors = scalaErrors(r.stderr, dir);
		if (errors) {
			// compile error: which steps do the error positions fall in?
			const at = [...errors.matchAll(/(T|Main)\.scala:(\d+):\d+/g)].map((m) => ({ file: m[1], line: Number(m[2]) }));
			const bad = new Set<number>();
			let outside = at.length === 0;
			for (const p of at) {
				const hit = p.file === 'T' ? src.ranges.find((x) => p.line >= x.from && p.line <= x.to) : undefined;
				if (hit) bad.add(hit.i);
				else outside = true;
			}
			const text = errors.length > 1500 ? errors.slice(0, 1500) + '…' : errors;
			if (outside || attempt === 1 || bad.size === live.length) return fail(text);
			live = live.filter((s) => !bad.has(s.i)); // the others still run
			continue;
		}
		const setupErr = r.stdout.split('\n').find((l) => l.startsWith('##ERR|-1|'));
		if (setupErr) return fail(tr('setup 실행 중 예외: ', 'Exception in setup: ') + setupErr.split('|').slice(2).join('|'));
		for (const line of r.stdout.split('\n')) {
			if (line.startsWith('##SHOW|t|')) {
				const [, , n, ...rest] = line.split('|');
				const i = Number(n);
				if (steps[i]) {
					const actual = rest.join('|').trim();
					result[i] = { ok: actual === norm(steps[i].value), actual };
				}
			}
		}
		break;
	}
	return { ok: result.every((s) => s.ok), steps: result, error: null };
}

/** Verifies the `block`-th trace segment of a stored coach answer. Null for an unknown message or block. Results are cached in memory. */
export async function verifyMessage(messageId: unknown, block: unknown): Promise<CoachVerifyResponse | null> {
	if (!Number.isInteger(messageId) || !Number.isInteger(block) || (block as number) < 0) return null;
	const row = db().prepare("SELECT text FROM coach_messages WHERE id = ? AND context_kind <> 'stats' AND role = 'coach' AND error = 0").get(messageId as number) as { text: string } | undefined;
	if (!row) return null;
	const traces = parseAnswer(row.text).flatMap((s) => (s.type === 'trace' ? [s.block] : []));
	const t = traces[block as number];
	if (!t) return null;
	const key = `${accountId()}:${messageId}:${block}:${tr('ko', 'en')}`;
	const hit = verified.get(key);
	if (hit) return hit;
	const out = await verifyTrace(t.setup, t.steps);
	if (!out.error?.startsWith(tr('시간 안에', 'Time limit exceeded.'))) verified.set(key, out);
	return out;
}
