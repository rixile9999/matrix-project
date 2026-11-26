import {spawn} from 'node:child_process';
import net from 'node:net';
import {mkdirSync} from 'node:fs';
type BackendId = 'claude'|'codex'|'qwen';
const TIMEOUT_MS=120000;
// ---------- backends ----------

/** Called with each piece of answer text as it arrives; the returned promise resolves to the full answer. */
export type AskOptions = { signal?: AbortSignal };
export type Backend = {
	id: BackendId;
	ask(prompt: string, system: string, onDelta: (text: string) => void, opts?: AskOptions): Promise<string>;
};

const emptyCwd = () => '/tmp/job';
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
const QWEN_BASE = ['--auth-type','openai','-o', 'stream-json', '--include-partial-messages', '--safe-mode'];
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


mkdirSync('/tmp/job',{recursive:true});
mkdirSync('/tmp/home',{recursive:true,mode:0o700});
// The agent has only loopback. Its local HTTP proxy forwards to the provider's
// dedicated Unix socket. Other jobs, the broker and the host have no network route.
const proxy = net.createServer(client => {
	const tunnel=net.connect('/relay/connect.sock');
	client.on('error',()=>tunnel.destroy()); tunnel.on('error',()=>client.destroy());
	client.on('close',()=>tunnel.destroy()); tunnel.on('close',()=>client.destroy());
	client.pipe(tunnel).pipe(client);
});
await new Promise<void>((ok,fail)=>{proxy.once('error',fail);proxy.listen(8080,'127.0.0.1',ok);});
let request = '';
for await (const chunk of process.stdin) {
	request += chunk;
	if (request.length > 1024*1024) throw Error('request too large');
}
const {backend,prompt,system} = JSON.parse(request);
if (!Object.hasOwn(backends,backend)) throw Error('invalid backend');
try {
	const text = await backends[backend as BackendId].ask(prompt,system,delta => console.log(JSON.stringify({delta})));
	console.log(JSON.stringify({text}));
} catch {
	console.log(JSON.stringify({error:'코칭 워커가 답변을 생성하지 못했습니다. 제공자 인증 또는 연결을 확인하세요.'}));
	process.exitCode = 1;
} finally { proxy.close(); }
