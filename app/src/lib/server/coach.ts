// The Operator (question-answering side panel), server side. Rules and answer format: core/coach.ts;
// what the backend is told: core/coach-prompt.ts. Every question and answer goes to the append-only coach_messages table.
//
// Backends are agent CLIs (Claude Code, Codex, Qwen Code). The app has no login, so each one is started with every
// tool switched off or as restricted as the CLI allows, in an empty working directory, and the event stream is watched:
// any sign of tool use kills the process and the answer is recorded as failed.
import { spawn, execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { db } from './db.ts';
import { coachBasis } from './lang.ts';
import { coachCard } from './memo.ts';
import { SCALA_CLI, WORK_DIR, serialized } from './judge.ts';
import { scalaErrors } from './scala-run.ts';
import { BACKENDS, langAccess, parseAnswer, type BackendId, type CoachAccess, type CoachContext } from '#lib/core/coach.ts';
import { CODE_MAX, QUESTION_MAX, buildPrompt, langContext, memoContext, systemPrompt, type HistoryMessage } from '#lib/core/coach-prompt.ts';
import type { CoachEvent, CoachMessage, CoachThreadResponse, CoachVerifyResponse } from '#lib/types.ts';

const nowSec = () => Math.floor(Date.now() / 1000);
const TIMEOUT_MS = 120_000;
const MEMO_WINDOW_SEC = 24 * 3600;

// ---------- backends ----------

/** Called with each piece of answer text as it arrives; the returned promise resolves to the full answer. */
export type AskOptions = { signal?: AbortSignal };
export type Backend = {
	id: BackendId;
	ask(prompt: string, system: string, onDelta: (text: string) => void, opts?: AskOptions): Promise<string>;
};

/** An empty directory the CLIs run in, so that nothing of this project is lying around for a tool to find. Keep it outside any project tree: the CLIs also read CLAUDE.md / AGENTS.md files from parent directories. */
let coachDir: string | null = null;
function emptyCwd(): string {
	if (!coachDir) {
		coachDir = resolve(process.env.COACH_DIR ?? join(tmpdir(), 'matrix-coach'));
		mkdirSync(coachDir, { recursive: true });
	}
	return coachDir;
}

class Abort extends Error {}

/**
 * Runs a CLI without a shell. `onLine` sees each stdout line and may throw to stop the run (the process is killed).
 * Resolves with the exit code and stderr; rejects on timeout, abort, throw from onLine, or a failure to start.
 */
function run(cmd: string, args: string[], o: { stdin?: string; signal?: AbortSignal; onLine: (line: string) => void; timeoutMs?: number }): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolveRun, reject) => {
		if (o.signal?.aborted) return reject(new Abort('취소되었습니다.'));
		const child = spawn(cmd, args, { cwd: emptyCwd(), stdio: [o.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], detached: true });
		let stderr = '';
		let buf = '';
		let settled = false;
		const kill = () => {
			try {
				if (child.pid) process.kill(-child.pid, 'SIGKILL'); // the whole group: the CLI may have started helpers
			} catch {
				child.kill('SIGKILL');
			}
		};
		const finish = (err: Error | null, value?: { code: number | null; stderr: string }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			o.signal?.removeEventListener('abort', onAbort);
			if (err) {
				kill();
				reject(err);
			} else resolveRun(value!);
		};
		const timer = setTimeout(() => finish(new Error(`${Math.round((o.timeoutMs ?? TIMEOUT_MS) / 1000)}초 안에 답이 오지 않아 중단했습니다.` + (stderr.trim() ? '\n' + tail(stderr) : ''))), o.timeoutMs ?? TIMEOUT_MS);
		const onAbort = () => finish(new Abort('취소되었습니다.'));
		o.signal?.addEventListener('abort', onAbort);

		const feed = (line: string) => {
			if (!line.trim() || settled) return;
			try {
				o.onLine(line);
			} catch (e) {
				finish(e instanceof Error ? e : new Error(String(e)));
			}
		};
		child.stdout!.setEncoding('utf8');
		child.stdout!.on('data', (d: string) => {
			buf += d;
			let i: number;
			while ((i = buf.indexOf('\n')) >= 0) {
				feed(buf.slice(0, i));
				buf = buf.slice(i + 1);
			}
		});
		child.stderr!.setEncoding('utf8');
		child.stderr!.on('data', (d: string) => {
			stderr = (stderr + d).slice(-8000);
		});
		child.on('error', (e) => finish(new Error(`${cmd} 실행에 실패했습니다: ${e.message}`)));
		child.on('close', (code) => {
			feed(buf);
			buf = '';
			finish(null, { code, stderr });
		});
		if (o.stdin !== undefined) {
			child.stdin!.on('error', () => {}); // the CLI may exit before reading everything
			child.stdin!.end(o.stdin);
		}
	});
}

const tail = (s: string, n = 600) => {
	const t = s.replace(/\x1b\[[0-9;]*m/g, '').trim();
	return t.length > n ? '…' + t.slice(-n) : t;
};
const parse = (line: string): any => {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
};
const noTools = (what: string, listed = false) => new Error(`${what}: ${listed ? '도구가 꺼져 있지 않아' : '도구 사용이 감지되어'} 중단했습니다.`);

// --- Claude Code: `--tools ""` removes every tool; MCP, settings and session files are off too. The prompt goes in on stdin.
const claude: Backend = {
	id: 'claude',
	async ask(prompt, system, onDelta, opts) {
		const args = [
			'-p', '--tools', '', '--system-prompt', system, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
			'--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--model', process.env.COACH_CLAUDE_MODEL ?? 'sonnet'
		];
		if (process.env.COACH_CLAUDE_EFFORT) args.push('--effort', process.env.COACH_CLAUDE_EFFORT);
		let streamed = '';
		const st: { final: { text: string; error: boolean } | null } = { final: null };
		const r = await run('claude', args, {
			stdin: prompt,
			signal: opts?.signal,
			onLine(line) {
				const ev = parse(line);
				if (!ev) return;
				if (ev.type === 'system' && ev.subtype === 'init' && ((ev.tools?.length ?? 0) > 0 || (ev.mcp_servers?.length ?? 0) > 0)) throw noTools('Claude Code', true);
				if (ev.type === 'assistant' && ev.message?.content?.some((c: any) => c.type === 'tool_use')) throw noTools('Claude Code');
				if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
					streamed += ev.event.delta.text;
					onDelta(ev.event.delta.text);
				} else if (ev.type === 'result') st.final = { text: String(ev.result ?? ''), error: !!ev.is_error };
			}
		});
		if (st.final?.error) throw new Error(st.final.text || 'Claude Code가 오류를 돌려줬습니다.');
		const text = st.final?.text || streamed;
		if (!text.trim()) throw new Error(`Claude Code가 답을 주지 않았습니다 (종료 코드 ${r.code}).` + (r.stderr.trim() ? '\n' + tail(r.stderr) : ''));
		return text;
	}
};

// --- Codex: no flag removes every tool, so the shell and the other tool families are disabled as features, the sandbox is
// read-only, nothing from the user's config or rules is loaded (auth still comes from CODEX_HOME) and the cwd is empty.
// There is no system-prompt flag: the system text is put in front of the prompt. The prompt goes in on stdin ("-").
const CODEX_OFF = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use', 'computer_use', 'multi_agent', 'view_image', 'hooks', 'image_generation', 'code_mode_host', 'goals', 'sleep_tool', 'tool_suggest', 'skill_search'];
const CODEX_ALLOWED = new Set(['agent_message', 'reasoning', 'error']); // any other item type is a tool call
const codex: Backend = {
	id: 'codex',
	async ask(prompt, system, onDelta, opts) {
		const args = ['exec', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--json', '-C', emptyCwd(), '--ignore-user-config', '--ignore-rules'];
		for (const f of CODEX_OFF) args.push('--disable', f);
		args.push('-c', 'web_search=disabled');
		if (process.env.COACH_CODEX_MODEL) args.push('-m', process.env.COACH_CODEX_MODEL);
		args.push('-');
		const parts: string[] = [];
		let failure = '';
		const r = await run('codex', args, {
			stdin: `${system}\n\n---\n\n${prompt}`,
			signal: opts?.signal,
			onLine(line) {
				const ev = parse(line);
				if (!ev) return;
				if ((ev.type === 'item.started' || ev.type === 'item.completed') && !CODEX_ALLOWED.has(ev.item?.type)) throw noTools('Codex');
				if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && typeof ev.item.text === 'string') {
					onDelta((parts.length ? '\n\n' : '') + ev.item.text);
					parts.push(ev.item.text);
				} else if (ev.type === 'turn.failed') failure = String(ev.error?.message ?? 'Codex가 실패했습니다.');
				else if (ev.type === 'error') failure = String(ev.message ?? failure);
			}
		});
		if (!parts.length) throw new Error((failure || `Codex가 답을 주지 않았습니다 (종료 코드 ${r.code}).`) + (r.stderr.trim() && !failure ? '\n' + tail(r.stderr) : ''));
		return parts.join('\n\n');
	}
};

// --- Qwen Code: every tool is named in --exclude-tools. The names are read from the init event of a throw-away probe
// (cached), and the init event of the real call is checked again: anything listed there stops the run.
// The CLI reports an API failure (expired key ...) as ordinary answer text "[API Error: ...]", which is turned into an error here.
let qwenTools: Promise<string[]> | null = null;
const QWEN_BASE = ['-o', 'stream-json', '--include-partial-messages', '--safe-mode'];
const QWEN_ALLOWED_TOOLS: string[] = [];

function probeQwenTools(): Promise<string[]> {
	return (qwenTools ??= (async () => {
		const found: { tools: string[] | null } = { tools: null };
		await run('qwen', ['-p', '.', '-o', 'stream-json', '--safe-mode'], {
			timeoutMs: 30_000,
			onLine(line) {
				const ev = parse(line);
				if (ev?.type === 'system' && ev.subtype === 'init' && Array.isArray(ev.tools)) {
					found.tools = ev.tools.filter((t: unknown) => typeof t === 'string');
					throw new Abort('probe done'); // only the tool list was wanted
				}
			}
		}).catch((e) => {
			if (!(e instanceof Abort) || !found.tools) throw e;
		});
		if (!found.tools) throw new Error('Qwen Code의 도구 목록을 읽지 못했습니다.');
		return found.tools;
	})().catch((e) => {
		qwenTools = null; // try again next time
		throw e;
	}));
}

const API_ERROR = /^\s*\[API Error/;
const qwen: Backend = {
	id: 'qwen',
	async ask(prompt, system, onDelta, opts) {
		const names = await probeQwenTools();
		const args = ['-p', `${system}\n\n---\n\n${prompt}`, ...QWEN_BASE, '--approval-mode', 'default', '--exclude-tools', names.join(',')];
		if (process.env.COACH_QWEN_MODEL) args.push('-m', process.env.COACH_QWEN_MODEL);
		let streamed = '';
		let sent = 0; // chars of `streamed` already forwarded; an "[API Error" opening is never forwarded
		const st: { final: { text: string; error: boolean } | null } = { final: null };
		const flush = (all: boolean) => {
			if (!all && streamed.length < 12) return;
			if (API_ERROR.test(streamed)) return;
			if (streamed.length > sent) onDelta(streamed.slice(sent));
			sent = streamed.length;
		};
		const r = await run('qwen', args, {
			signal: opts?.signal,
			onLine(line) {
				const ev = parse(line);
				if (!ev) return;
				if (ev.type === 'system' && ev.subtype === 'init' && (ev.tools ?? []).some((t: string) => !QWEN_ALLOWED_TOOLS.includes(t))) throw noTools('Qwen Code', true);
				if (ev.type === 'assistant' && ev.message?.content?.some((c: any) => c.type === 'tool_use')) throw noTools('Qwen Code');
				if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
					streamed += ev.event.delta.text;
					flush(false);
				} else if (ev.type === 'result') st.final = { text: String(ev.result ?? ''), error: !!ev.is_error };
			}
		});
		const text = st.final?.text || streamed;
		if (API_ERROR.test(text) || st.final?.error) throw new Error(text.trim() || 'Qwen Code가 오류를 돌려줬습니다.');
		flush(true);
		if (!text.trim()) throw new Error(`Qwen Code가 답을 주지 않았습니다 (종료 코드 ${r.code}).` + (r.stderr.trim() ? '\n' + tail(r.stderr) : ''));
		return text;
	}
};

export const backends: Record<BackendId, Backend> = { claude, codex, qwen };

// ---------- messages ----------
type Row = { id: number; at: number; role: 'user' | 'coach'; text: string; backend: BackendId; ms: number | null; error: number };
const toMessage = (r: Row): CoachMessage => ({ id: r.id, role: r.role, text: r.text, backend: r.role === 'coach' ? r.backend : null, ms: r.role === 'coach' ? r.ms : null, at: r.at, error: r.error === 1 });

function insert(m: { kind: CoachContext['kind']; id: string; sessionId: number | null; backend: BackendId; role: 'user' | 'coach'; text: string; ms: number | null; access: 'limited' | 'full'; error: boolean }): CoachMessage {
	const at = nowSec();
	const res = db
		.prepare('INSERT INTO coach_messages(at, context_kind, context_id, session_id, backend, role, text, ms, access, error) VALUES(?,?,?,?,?,?,?,?,?,?)')
		.run(at, m.kind, m.id, m.sessionId, m.backend, m.role, m.text, m.ms, m.access, m.error ? 1 : 0);
	return toMessage({ id: Number(res.lastInsertRowid), at, role: m.role, text: m.text, backend: m.backend, ms: m.ms, error: m.error ? 1 : 0 });
}

/** The thread of a context: a lang session's messages, or a memo card's messages of the last 24 hours. Oldest first. */
function thread(c: Resolved): CoachMessage[] {
	const cols = 'id, at, role, text, backend, ms, error';
	const rows =
		c.kind === 'lang'
			? c.sessionId === null
				? []
				: db.prepare(`SELECT ${cols} FROM coach_messages WHERE context_kind = 'lang' AND context_id = ? AND session_id = ? ORDER BY id`).all(c.id, c.sessionId)
			: db.prepare(`SELECT ${cols} FROM coach_messages WHERE context_kind = 'memo' AND context_id = ? AND at >= ? ORDER BY id`).all(c.id, nowSec() - MEMO_WINDOW_SEC);
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

/** Decides access from the server's own state. Null = unknown item. */
export function resolveContext(kind: unknown, id: unknown): Resolved | null {
	if ((kind !== 'lang' && kind !== 'memo') || typeof id !== 'string' || !SAFE_ID.test(id)) return null;
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

export function threadView(kind: unknown, id: unknown): CoachThreadResponse | null {
	const c = resolveContext(kind, id);
	if (!c) return null;
	return {
		access: c.access,
		opensAt: c.opensAt,
		gets: c.material()?.gets ?? [],
		backends: (Object.keys(BACKENDS) as BackendId[]).map((b) => ({ id: b, label: BACKENDS[b] })),
		messages: thread(c)
	};
}

// ---------- ask ----------
const running = new Set<string>();
export type AskFailure = { status: 400 | 403 | 404 | 409; error: string };

/**
 * Validates and starts a question. Returns a failure (nothing stored) or the NDJSON body to stream.
 * The stream is a sequence of CoachEvent lines. When `signal` aborts (client gone) the CLI process is killed.
 */
export function startAsk(body: Record<string, unknown>, signal?: AbortSignal): AskFailure | { stream: ReadableStream<Uint8Array> } {
	const ctx = body.context as Record<string, unknown> | undefined;
	const backendId = body.backend;
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	const code = body.code;
	if (!ctx || typeof ctx !== 'object') return { status: 400, error: '질문할 대상이 올바르지 않습니다.' };
	if (typeof backendId !== 'string' || !Object.hasOwn(BACKENDS, backendId)) return { status: 400, error: '알 수 없는 백엔드입니다.' };
	if (!question) return { status: 400, error: '질문을 입력하세요.' };
	if (question.length > QUESTION_MAX) return { status: 400, error: `질문이 너무 깁니다. (최대 ${QUESTION_MAX.toLocaleString('en-US')}자)` };
	if (code !== undefined && (typeof code !== 'string' || code.length > CODE_MAX)) return { status: 400, error: '코드가 올바르지 않거나 너무 깁니다.' };
	if (ctx.kind !== 'lang' && ctx.kind !== 'memo') return { status: 400, error: '질문할 대상이 올바르지 않습니다.' };

	const c = resolveContext(ctx.kind, ctx.id);
	if (!c) return { status: 404, error: '질문할 대상을 찾을 수 없습니다.' };
	if (c.access === 'locked') return { status: 403, error: '지금은 질문할 수 없습니다. 제한시간이 지나거나 세션이 끝나면 열립니다.' };
	const access = c.access;
	const key = `${c.kind}:${c.id}`;
	if (running.has(key)) return { status: 409, error: '이미 답을 기다리는 질문이 있습니다.' };

	const backend = backends[backendId as BackendId];
	const material = c.material(c.kind === 'lang' ? (code as string | undefined) : undefined)!;
	const history: HistoryMessage[] = thread(c).filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
	const system = systemPrompt(c.kind, access);
	const prompt = buildPrompt(material.text, history, question);
	if (process.env.COACH_DEBUG) console.log('[coach] ' + JSON.stringify({ backend: backendId, access, system, prompt }));

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
				text = await backend.ask(prompt, system, (t) => send({ type: 'delta', text: t }), { signal: ac.signal });
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
const VERIFY_TIMEOUT_MS = 60_000;
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

function runScala(dir: string): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
	return new Promise((done) => {
		execFile(SCALA_CLI, ['run', dir, '-q'], { timeout: VERIFY_TIMEOUT_MS, maxBuffer: 1 << 20, killSignal: 'SIGKILL' }, (err, stdout, stderr) =>
			done({ stdout, stderr, timedOut: !!err && !!(err as { killed?: boolean }).killed })
		);
	});
}

const norm = (s: string) => s.replace(/\r?\n/g, '\\n').trim();

/** Runs a trace block's setup and steps; a step that does not compile only loses itself (one recompile without it). */
export async function verifyTrace(setup: string, steps: Step[]): Promise<CoachVerifyResponse> {
	const dir = join(WORK_DIR, 'coach-verify');
	const result: { ok: boolean; actual: string | null }[] = steps.map(() => ({ ok: false, actual: null }));
	const fail = (error: string): CoachVerifyResponse => ({ ok: false, steps: result.map(() => ({ ok: false, actual: null })), error });
	mkdirSync(dir, { recursive: true });

	let live = steps.map((s, i) => ({ i, expr: s.expr }));
	for (let attempt = 0; attempt < 2; attempt++) {
		const src = traceSources(setup, live);
		// The directory is shared, so writing the sources and running them is one serialized step:
		// several trace blocks are verified at once when a thread is opened.
		const r = await serialized(() => {
			copyFileSync(resolve('cheatsheet/_harness/Cheat.scala'), join(dir, 'Cheat.scala'));
			writeFileSync(join(dir, 'T.scala'), src.t);
			writeFileSync(join(dir, 'Main.scala'), src.main);
			return runScala(dir);
		});
		if (r.timedOut) return fail('시간 안에 끝나지 않았습니다. (60초)');
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
		if (setupErr) return fail('setup 실행 중 예외: ' + setupErr.split('|').slice(2).join('|'));
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
	const row = db.prepare("SELECT text FROM coach_messages WHERE id = ? AND role = 'coach' AND error = 0").get(messageId as number) as { text: string } | undefined;
	if (!row) return null;
	const traces = parseAnswer(row.text).flatMap((s) => (s.type === 'trace' ? [s.block] : []));
	const t = traces[block as number];
	if (!t) return null;
	const key = `${messageId}:${block}`;
	const hit = verified.get(key);
	if (hit) return hit;
	const out = await verifyTrace(t.setup, t.steps);
	if (!(out.error ?? '').includes('시간 안에')) verified.set(key, out);
	return out;
}
