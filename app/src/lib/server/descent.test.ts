import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, withAccount } from './db.ts';
import { candidates, closeThread, descentData, memoryFacts, sync, turn } from './descent.ts';
import { loadSolution } from './judge.ts';
import { judge } from './judge.ts';
import { findProblem, runCode, sessionView } from './lang.ts';
import { withLocale } from './locale.ts';
import { askCoach, connectedCoaches } from './worker.ts';
import type { TurnInput } from '#lib/core/descent.ts';

vi.mock('./worker.ts', () => ({ askCoach: vi.fn(), connectedCoaches: vi.fn(), runScala: vi.fn() }));
vi.mock('./judge.ts', async (original) => ({ ...(await original<typeof import('./judge.ts')>()), judge: vi.fn() }));

const root = mkdtempSync(join(tmpdir(), 'matrix-descent-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

// A chain of real, verified problems: ROOT (level 2) -> A -> B -> C (level 1), linked by the shared catalogue.
const ROOT = '001-sum-of-squares';
const A = 'b-04-keep-positives';
const B = 'b-02-price-label';
const C = 'b-01-countdown-by-two';
const now = () => Math.floor(Date.now() / 1000);
const account = <T>(fn: () => Promise<T>) => withAccount(randomUUID(), fn);

// ---------- fakes ----------
type Script = (input: TurnInput) => unknown;
let script: Script[] = [];
let inputs: TurnInput[] = [];
const coach = (...s: Script[]) => void script.push(...s);
const reply = (say: string, action: object = { type: 'say' }): Script => () => ({ say, action });
const calls = () => vi.mocked(askCoach).mock.calls.length;

beforeEach(() => {
	vi.resetAllMocks();
	script = [];
	inputs = [];
	vi.mocked(connectedCoaches).mockResolvedValue(['codex']);
	vi.mocked(askCoach).mockImplementation(async (_b, prompt) => {
		const input = JSON.parse(prompt) as TurnInput;
		inputs.push(input);
		const next = script.shift();
		if (!next) throw new Error('unexpected coach call');
		const out = next(input);
		return typeof out === 'string' ? out : JSON.stringify(out);
	});
	vi.mocked(judge).mockImplementation(async (_l, _p, code) =>
		code.includes('PASS')
			? { status: 'passed', cases: [{ name: 'a', status: 'ok', detail: '' }], output: '', avoided: [] }
			: { status: 'failed', cases: ['a', 'b', 'c'].map((name) => ({ name, status: 'fail' as const, detail: 'x' })), output: '', avoided: [] }
	);
	// the shared catalogue lives in one file for all accounts of this test file
	withAccount(randomUUID(), () => {
		db().prepare('DELETE FROM catalog.descent_links').run();
		db().prepare('INSERT INTO catalog.descent_links(parent_id, sub_id, gap) VALUES(?,?,?), (?,?,?), (?,?,?)').run(ROOT, A, 'filter', A, B, 'string-interp', B, C, 'range');
	});
});

const latest = (problemId: string) => db().prepare('SELECT * FROM lang_sessions WHERE problem_id = ? ORDER BY id DESC LIMIT 1').get(problemId) as { id: number; started_at: number; ended_at: number | null; hints_used: number };
const pass = (id: string) => runCode(id, 'PASS');
const miss = (id: string) => runCode(id, 'nope');
/** The clock passes the problem's limit. */
const overtime = (id: string) => db().prepare('UPDATE lang_sessions SET started_at = started_at - ? WHERE id = ?').run(findProblem(id)!.limitSec + 60, latest(id).id);
const links = () => db().prepare('SELECT parent_id, sub_id, offered, accepted FROM catalog.descent_links ORDER BY parent_id').all() as { parent_id: string; sub_id: string; offered: number; accepted: number }[];
const last = async () => (await descentData()).messages.at(-1)!;

/** Opens a thread with ROOT in the editor. */
async function pose(problem = ROOT) {
	coach((i) => ({ say: 'Start with this one.', action: { type: 'pose', problemId: i.candidates.pose.find((c) => c.id === problem)?.id ?? 'missing' } }));
	expect(await turn({ text: 'give me a problem' })).toEqual({ status: 200, body: { ok: true } });
}
/** The top problem runs out of time, sync notices, the coach offers `sub`, the learner accepts. */
async function descend(from: string, sub: string, gap = 'gap') {
	overtime(from);
	coach((i) => ({ say: 'Try this part?', action: { type: 'offer', problemId: i.candidates.offer.find((c) => c.id === sub)?.id ?? 'missing', gap } }));
	await sync();
	expect((await last()).offer).toEqual({ kind: 'descend', open: true });
	expect(await turn({ choice: 'accept' })).toEqual({ status: 200, body: { ok: true } });
}

describe('the full detour', () => {
	it('poses, offers a sub-problem when stuck, descends, passes, and ascends to a fresh session', () => account(async () => {
		await pose();
		let d = await descentData();
		expect(d.connected).toBe(true);
		expect(d.stack).toEqual([{ problemId: ROOT, title: findProblem(ROOT)!.title, depth: 0, status: 'solving' }]);
		expect(d.session!.problem.id).toBe(ROOT);
		expect(d.messages.map((m) => m.role)).toEqual(['me', 'coach']);
		expect(inputs[0]).toMatchObject({ phase: 'idle', trigger: 'message', problem: null, said: 'give me a problem' });

		// a failing run before the limit: reported, but the coach is not asked
		await miss(ROOT);
		await sync();
		expect(calls()).toBe(1);
		await expect(withLocale('en', () => descentData().then((x) => x.messages.at(-1)))).resolves.toMatchObject({ role: 'event', text: '3 errors', tone: 'bad' });

		// past the limit: stuck, the coach offers, the offer is open
		overtime(ROOT);
		coach((i) => ({ say: 'filter first?', action: { type: 'offer', problemId: i.candidates.offer[0].id, gap: 'filter' } }));
		await sync();
		expect(inputs[1]).toMatchObject({ phase: 'stuck', trigger: 'stuck' });
		expect(inputs[1].allowed).toContain('offer');
		expect(inputs[1].candidates.offer.map((c) => c.id)[0]).toBe(A); // the shared link comes first
		d = await descentData();
		expect(d.messages.at(-1)).toMatchObject({ role: 'coach', text: 'filter first?', offer: { kind: 'descend', open: true } });
		expect(links().find((l) => l.parent_id === ROOT)).toMatchObject({ sub_id: A, offered: 1, accepted: 0 });

		// accept: the sub-problem is on top, the parent is held, nothing of the parent's session was ended
		const rootSession = latest(ROOT);
		expect(await turn({ choice: 'accept' })).toEqual({ status: 200, body: { ok: true } });
		d = await descentData();
		expect(d.stack.map((f) => [f.problemId, f.depth, f.status])).toEqual([[ROOT, 0, 'held'], [A, 1, 'solving']]);
		expect(d.session!.problem.id).toBe(A);
		expect(d.messages.at(-1)).toMatchObject({ role: 'event', offer: null });
		expect(latest(ROOT)).toEqual(rootSession);
		expect(latest(ROOT).ended_at).toBeNull();
		expect(links().find((l) => l.parent_id === ROOT)).toMatchObject({ offered: 1, accepted: 1 });
		const revisit = db().prepare('SELECT * FROM descent_revisits').all() as { problem_id: string; due_at: number; done_at: number | null }[];
		expect(revisit).toHaveLength(1);
		expect(revisit[0]).toMatchObject({ problem_id: ROOT, done_at: null });
		expect(Math.abs(revisit[0].due_at - (now() + 3 * 86400))).toBeLessThan(5);
		expect(await turn({ choice: 'accept' })).toMatchObject({ status: 409 }); // nothing left to answer

		// the sub-problem passes: reported, the coach offers to go back up
		await pass(A);
		coach(() => ({ say: 'Back up?', action: { type: 'ascend' } }));
		await sync();
		expect(inputs.at(-1)).toMatchObject({ phase: 'passed', trigger: 'passed' });
		expect(inputs.at(-1)!.allowed).toEqual(['say', 'ascend']);
		expect(inputs.at(-1)!.problem!.solution).not.toBeNull(); // the session is over
		d = await descentData();
		expect(d.messages.at(-2)).toMatchObject({ role: 'event', tone: 'good' });
		expect(d.messages.at(-1)).toMatchObject({ text: 'Back up?', offer: { kind: 'ascend', open: true } });

		// up: the parent gets a fresh, clean session; its old one stays open in the log
		expect(await turn({ choice: 'accept' })).toEqual({ status: 200, body: { ok: true } });
		d = await descentData();
		expect(d.stack.map((f) => [f.problemId, f.status])).toEqual([[ROOT, 'solving']]);
		expect(d.session!.session.id).toBeGreaterThan(rootSession.id);
		expect(d.session!.session.code).toBe(findProblem(ROOT)!.starter);
		expect(d.session!.session.finished).toBeNull();
		expect(db().prepare('SELECT ended_at FROM lang_sessions WHERE id = ?').get(rootSession.id)).toEqual({ ended_at: null });
		expect(db().prepare('SELECT COUNT(*) AS n FROM lang_sessions WHERE problem_id = ?').get(ROOT)).toEqual({ n: 2 });
		// the revisit stays open: only a later pass closes it
		expect(db().prepare('SELECT done_at FROM descent_revisits').get()).toEqual({ done_at: null });
		expect(d.messages.at(-1)!.offer).toBeNull();
	}));

	it('closes a revisit only by a pass after its due date', () => account(async () => {
		await pose();
		await descend(ROOT, A);
		await pass(A);
		const due = () => (db().prepare('SELECT due_at, done_at FROM descent_revisits').get() as { due_at: number; done_at: number | null });
		// a pass before the due date does not count (the descent just happened)
		await pass(ROOT).catch(() => {}); // the held parent still has its open session: passing it records a pass...
		await descentData();
		expect(due().done_at).toBeNull();
		// ...and one that starts after the due date does
		db().prepare('UPDATE descent_revisits SET due_at = ?').run(now() - 5);
		await descentData();
		expect(due().done_at).toBeNull(); // the pass above started before the due date
		db().prepare('INSERT INTO lang_sessions(lang, problem_id, started_at, ended_at, outcome, elapsed_sec) VALUES(?,?,?,?,?,?)').run('scala', ROOT, now() - 2, now() - 1, 'passed', 1);
		await descentData();
		expect(due().done_at).toBe(now() - 1);
		expect(memoryFacts('en').some((f) => f.startsWith('Revisit due'))).toBe(false);
	}));
});

describe('the rules', () => {
	it('keeps the solution and every hint from the coach while the clock runs, and posts only staged hints', () => account(async () => {
		await pose();
		coach(reply('Which method keeps some elements?', { type: 'hint' }));
		await turn({ text: 'help' });
		const asked = inputs[1];
		expect(asked.problem).toMatchObject({ title: findProblem(ROOT)!.title, solution: null, hintsLeft: 2 });
		const raw = JSON.stringify(asked);
		const body = loadSolution('scala', ROOT).split('\n').filter((l) => l.trim().length > 10 && !findProblem(ROOT)!.starter.includes(l.trim()));
		expect(body.length).toBeGreaterThan(0);
		for (const secret of [...findProblem(ROOT)!.hints, ...body.map((l) => l.trim())]) expect(raw).not.toContain(secret);
		expect((await last()).text).toBe(findProblem(ROOT)!.hints[0]);
		expect(latest(ROOT).hints_used).toBe(1);
		expect(sessionView(ROOT)!.session.hints).toHaveLength(1);
		// sync does not report the coach's hint a second time
		await sync();
		expect((await descentData()).messages.filter((m) => m.role === 'event')).toEqual([]);

		coach(reply('', { type: 'hint' }));
		await turn({ text: 'more' });
		expect((await last()).text).toBe(findProblem(ROOT)!.hints[1]);
		coach(reply('No more.', { type: 'hint' })); // none left: the words stay, no third hint
		await turn({ text: 'again' });
		expect(await last()).toMatchObject({ role: 'coach', text: 'No more.' });
		expect(latest(ROOT).hints_used).toBe(2);
		expect(inputs.at(-1)!.problem!.hintsLeft).toBe(0);
	}));

	it('drops an offer before the limit and keeps the words, and does not let the solution through', () => account(async () => {
		await pose();
		coach((i) => ({ say: 'Easier one?', action: { type: 'offer', problemId: i.candidates.offer[0]?.id ?? A, gap: 'filter' } }));
		await turn({ text: 'stuck' });
		expect(inputs[1].allowed).not.toContain('offer');
		let d = await descentData();
		expect(d.messages.at(-1)).toMatchObject({ role: 'coach', text: 'Easier one?', offer: null });
		expect(d.stack).toHaveLength(1);
		expect(db().prepare('SELECT pending FROM descent_threads').get()).toEqual({ pending: null });
		expect(links().find((l) => l.parent_id === ROOT)!.offered).toBe(0);

		const line = loadSolution('scala', ROOT).split('\n').find((l) => l.trim().length > 20)!.trim();
		coach(reply(`Write ${line} there.`));
		await turn({ text: 'tell me' });
		d = await descentData();
		expect(d.messages.at(-1)!.text).not.toContain(line);
		expect(d.messages.at(-1)!.text).toBe('계속해요.');

		// after the session ends as revealed the solution reaches the coach, and the offer is legal
		db().prepare("UPDATE lang_sessions SET ended_at = ?, outcome = 'revealed', avoided = '[]', elapsed_sec = 1 WHERE id = ?").run(now(), latest(ROOT).id);
		coach(reply('Here.'));
		await turn({ text: 'explain' });
		expect(inputs.at(-1)).toMatchObject({ phase: 'stuck', problem: { hintsLeft: 0 } });
		expect(inputs.at(-1)!.problem!.solution).toBe(loadSolution('scala', ROOT));
	}));

	it('drops an offer whose problem is not a candidate, and a pose that is not', () => account(async () => {
		coach(reply('Here.', { type: 'pose', problemId: 'nope' }));
		await turn({ text: 'go' });
		expect((await descentData()).stack).toEqual([]);
		await pose();
		overtime(ROOT);
		coach(reply('Try?', { type: 'offer', problemId: ROOT, gap: 'self' })); // the problem on the stack is never a candidate
		await sync();
		expect((await descentData()).messages.at(-1)).toMatchObject({ text: 'Try?', offer: null });
	}));

	it('at the floor offers nothing, shows the worked example once, and records it as hint use', () => account(async () => {
		await pose();
		await descend(ROOT, A);
		await descend(A, B);
		await descend(B, C);
		expect((await descentData()).stack.map((f) => f.depth)).toEqual([0, 1, 2, 3]);

		overtime(C);
		coach(reply('Try more?', { type: 'offer', problemId: A, gap: 'deeper' })); // illegal at depth 3
		await sync();
		expect(inputs.at(-1)).toMatchObject({ phase: 'floor', trigger: 'stuck' });
		expect(inputs.at(-1)!.allowed).toEqual(['say', 'hint', 'example']);
		expect(inputs.at(-1)!.candidates.offer).toEqual([]);
		expect(await last()).toMatchObject({ text: 'Try more?', offer: null });

		coach(reply('Look.', { type: 'example' }));
		await turn({ text: 'show me' });
		const p = findProblem(C)!;
		const msgs = (await descentData()).messages;
		expect(msgs.at(-1)!.text.startsWith(p.hints[1])).toBe(true);
		expect(msgs.at(-2)!.text).toBe('Look.');
		expect(latest(C).hints_used).toBe(2);
		expect(db().prepare('SELECT COUNT(*) AS n FROM lang_marks WHERE session_id = ? AND kind = ?').get(latest(C).id, 'hint')).toEqual({ n: 2 });

		coach(reply('Again.', { type: 'example' }));
		await turn({ text: 'again' });
		const after = (await descentData()).messages;
		expect(after.filter((m) => m.text.startsWith(p.hints[1]))).toHaveLength(1);
		expect(after.at(-1)!.text).toBe('Again.');
		await sync();
		expect((await descentData()).messages.filter((m) => m.text === 'Hint 2')).toHaveLength(0);
	}));
});

describe('sync', () => {
	it('does nothing without an open thread', () => account(async () => {
		expect(await sync()).toEqual({ status: 200, body: { ok: true } });
		expect(await descentData()).toEqual({ messages: [], stack: [], session: null, busy: false, connected: true });
		expect(calls()).toBe(0);
	}));

	it('reports each run, hint, time-up and reveal once, and asks the coach once per phase', () => account(async () => {
		await pose();
		await miss(ROOT);
		db().prepare('UPDATE lang_runs SET at = at - 1000').run(); // before the limit
		useHintFor(ROOT);
		overtime(ROOT);
		await miss(ROOT);
		coach(reply('Hm.'));
		await sync();
		const texts = async () => (await descentData()).messages.filter((m) => m.role === 'event').map((m) => m.text);
		const first = await texts();
		expect(first).toEqual(['오류 3', '힌트 1', '오류 3 · 시간 끝']);
		for (let i = 0; i < 3; i++) await sync();
		expect(await texts()).toEqual(first);
		expect(calls()).toBe(2); // pose + the one stuck turn
		await expect(withLocale('en', () => descentData().then((d) => d.messages.filter((m) => m.role === 'event').map((m) => m.text)))).resolves.toEqual(['3 errors', 'Hint 1', '3 errors · time up']);

		// a reveal is reported once and does not start another turn (the phase is still stuck)
		const { revealSolution } = await import('./lang.ts');
		revealSolution(ROOT);
		await sync();
		await sync();
		expect((await texts()).filter((t) => t === '공개')).toHaveLength(1);
		expect(calls()).toBe(2);
	}));

	it('announces the clock on its own, once', () => account(async () => {
		await pose();
		overtime(ROOT);
		coach(reply('Slow.'));
		await sync();
		await sync();
		expect((await descentData()).messages.map((m) => m.text).filter((t) => t === '시간 끝')).toHaveLength(1);
	}));

	it('picks up a session restarted elsewhere without repeating old runs', () => account(async () => {
		await pose();
		await miss(ROOT);
		await sync();
		const { restartSession } = await import('./lang.ts');
		restartSession(ROOT);
		await miss(ROOT);
		await sync();
		expect((await descentData()).messages.filter((m) => m.role === 'event').map((m) => m.text)).toEqual(['오류 3', '오류 3']);
		await sync();
		expect((await descentData()).messages.filter((m) => m.role === 'event')).toHaveLength(2);
	}));

	it('without a coach it still records the events, but asks nobody', () => account(async () => {
		await pose();
		vi.mocked(connectedCoaches).mockResolvedValue([]);
		await miss(ROOT);
		overtime(ROOT);
		await sync();
		const d = await descentData();
		expect(d.connected).toBe(false);
		expect(d.messages.filter((m) => m.role === 'event').map((m) => m.text)).toEqual(['오류 3 · 시간 끝']);
		expect(calls()).toBe(1);
		// once a coach is back the pending reaction is not lost
		vi.mocked(connectedCoaches).mockResolvedValue(['qwen']);
		coach(reply('Back.'));
		await sync();
		expect(calls()).toBe(2);
		expect(vi.mocked(askCoach).mock.calls[1][0]).toBe('qwen');
	}));
});

function useHintFor(id: string) {
	db().prepare('UPDATE lang_sessions SET hints_used = hints_used + 1 WHERE id = ?').run(latest(id).id);
	db().prepare("INSERT INTO lang_marks(session_id, at, kind) VALUES(?,?, 'hint')").run(latest(id).id, now() - 500);
}

describe('turn', () => {
	it('answers 409 with a short bilingual error when no coach is connected, and creates nothing', () => account(async () => {
		vi.mocked(connectedCoaches).mockResolvedValue([]);
		const r = await turn({ text: 'hi' });
		expect(r.status).toBe(409);
		expect(r.body).toHaveProperty('error');
		const en = await withLocale('en', () => turn({ text: 'hi' }));
		expect(en.body).not.toEqual(r.body);
		expect(db().prepare('SELECT COUNT(*) AS n FROM descent_threads').get()).toEqual({ n: 0 });
		expect(calls()).toBe(0);
	}));

	it('refuses an empty, a long or a malformed message and an answer with nothing open', () => account(async () => {
		expect((await turn({ text: '   ' })).status).toBe(400);
		expect((await turn({ text: 5 })).status).toBe(400);
		expect((await turn({ text: 'x'.repeat(1001) })).status).toBe(400);
		expect((await turn({ choice: 'maybe' })).status).toBe(400);
		expect((await turn({ choice: 'accept' })).status).toBe(409);
		await pose();
		expect((await turn({ choice: 'accept' })).status).toBe(409);
		expect((await turn({})).status).toBe(400); // already under way: no second start
	}));

	it('starts with an empty body and the start trigger', () => account(async () => {
		coach((i) => ({ say: 'Begin.', action: { type: 'pose', problemId: i.candidates.pose[0].id } }));
		expect((await turn({})).status).toBe(200);
		expect(inputs[0]).toMatchObject({ trigger: 'start', said: null });
		expect((await descentData()).stack).toHaveLength(1);
	}));

	it('allows one model call at a time per account', () => account(async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		vi.mocked(askCoach).mockImplementationOnce(async () => {
			await gate;
			return JSON.stringify({ say: 'Late.', action: { type: 'say' } });
		});
		const first = turn({ text: 'one' });
		await vi.waitFor(async () => expect((await descentData()).busy).toBe(true));
		expect((await turn({ text: 'two' })).status).toBe(409);
		expect((await turn({ choice: 'accept' })).status).toBe(409);
		release();
		expect((await first).status).toBe(200);
		expect((await descentData()).busy).toBe(false);
		expect((await descentData()).messages.map((m) => m.text)).toEqual(['one', 'Late.']);
	}));

	it('turns a provider failure and an unusable reply into a short coach line without touching the state', () => account(async () => {
		await pose();
		vi.mocked(askCoach).mockRejectedValueOnce(new Error('down'));
		expect((await turn({ text: 'hello' })).status).toBe(200);
		expect(await last()).toMatchObject({ role: 'coach', text: '답을 받지 못했어요.' });
		expect(await withLocale('en', last)).toMatchObject({ text: 'No reply.' });

		const before = calls();
		coach(() => 'not json', () => 'still not json');
		await turn({ text: 'again' });
		expect(calls() - before).toBe(2); // one repair retry
		expect(await last()).toMatchObject({ text: '답을 받지 못했어요.' });
		expect((await descentData()).stack).toHaveLength(1);

		coach(() => 'Sure: {"say":"Fine.","action":{"type":"say"}}');
		await turn({ text: 'ok' });
		expect(await last()).toMatchObject({ text: 'Fine.' });
	}));

	it('declining an offer goes on with the original problem', () => account(async () => {
		await pose();
		overtime(ROOT);
		coach((i) => ({ say: 'Easier?', action: { type: 'offer', problemId: i.candidates.offer[0].id, gap: 'filter' } }));
		await sync();
		expect(await turn({ choice: 'decline' })).toEqual({ status: 200, body: { ok: true } });
		const d = await descentData();
		expect(d.stack.map((f) => [f.problemId, f.status])).toEqual([[ROOT, 'solving']]);
		expect(d.messages.find((m) => m.offer)!.offer).toEqual({ kind: 'descend', open: false });
		expect(db().prepare('SELECT COUNT(*) AS n FROM descent_revisits').get()).toEqual({ n: 0 });
		expect(links().find((l) => l.parent_id === ROOT)).toMatchObject({ offered: 1, accepted: 0 });
		// the same phase does not ask the coach again
		await sync();
		expect(calls()).toBe(2);
	}));

	it('stays on the sub-problem when the learner declines to go up', () => account(async () => {
		await pose();
		await descend(ROOT, A);
		await pass(A);
		coach(reply('Up?', { type: 'ascend' }));
		await sync();
		expect(await turn({ choice: 'decline' })).toEqual({ status: 200, body: { ok: true } });
		const d = await descentData();
		expect(d.stack.map((f) => f.problemId)).toEqual([ROOT, A]);
		expect(d.messages.filter((m) => m.offer).at(-1)!.offer).toEqual({ kind: 'ascend', open: false });
	}));

	it('replaces a passed root with the next problem', () => account(async () => {
		await pose();
		await pass(ROOT);
		coach(reply('Next?'));
		await sync();
		expect(inputs.at(-1)).toMatchObject({ phase: 'passed' });
		expect(inputs.at(-1)!.allowed).toEqual(['say', 'pose']);
		coach((i) => ({ say: 'This.', action: { type: 'pose', problemId: i.candidates.pose[0].id } }));
		await turn({ text: 'next' });
		const d = await descentData();
		expect(d.stack).toHaveLength(1);
		expect(d.stack[0].problemId).not.toBe(ROOT);
		expect(db().prepare('SELECT COUNT(*) AS n FROM descent_frames WHERE closed_at IS NULL').get()).toEqual({ n: 1 });
	}));
});

describe('candidates and memory', () => {
	it('lists next unpassed problems per topic, due revisits first, and never the stack', () => account(async () => {
		const empty = { stack: [], pending: null };
		const base = candidates(empty);
		expect(base.offer).toEqual([]);
		expect(base.pose.length).toBeGreaterThan(3);
		expect(base.pose.length).toBeLessThanOrEqual(16);
		expect(base.pose.every((p) => p.level < 3)).toBe(true);
		expect(base.pose.some((p) => p.id.startsWith('b-0') && findProblem(p.id)!.book)).toBe(false);
		// a due revisit for a problem the learner already passed comes first
		(await import('./lang.ts')).startSession(ROOT);
		await pass(ROOT);
		db().prepare('UPDATE lang_sessions SET started_at = started_at - 1000, ended_at = ended_at - 1000').run(); // long before the revisit
		db().prepare('INSERT INTO descent_revisits(problem_id, frame_id, due_at) VALUES(?,?,?)').run(ROOT, 1, now() - 10);
		expect(candidates(empty).pose[0].id).toBe(ROOT);
		expect(candidates({ stack: [{ id: 1, problemId: ROOT, depth: 0, status: 'solving', overtime: true, gap: null }], pending: null }).pose.map((p) => p.id)).not.toContain(ROOT);
	}));

	it('offers links first (most accepted first), then lower levels of the topic, and not a problem on the stack', () => account(async () => {
		db().prepare('INSERT INTO catalog.descent_links(parent_id, sub_id, gap, offered, accepted) VALUES(?,?,?,?,?)').run(ROOT, C, 'range', 5, 4);
		const frame = (id: string, depth: number) => ({ id: depth + 1, problemId: id, depth, status: 'solving' as const, overtime: true, gap: null });
		const offer = candidates({ stack: [frame(ROOT, 0)], pending: null }).offer.map((p) => p.id);
		expect(offer.slice(0, 2)).toEqual([C, A]); // accepted 4 before accepted 0
		expect(offer.length).toBeLessThanOrEqual(6);
		expect(new Set(offer).size).toBe(offer.length);
		expect(offer.every((id) => id === C || id === A || findProblem(id)!.level < findProblem(ROOT)!.level)).toBe(true);
		expect(candidates({ stack: [frame(ROOT, 0), frame(C, 1)], pending: null }).offer.map((p) => p.id)).not.toContain(C);
		expect(candidates({ stack: [frame(ROOT, 0), frame(A, 1), frame(B, 2), frame(C, 3)], pending: null }).offer).toEqual([]);
		// a level 1 parent may descend to an earlier level 1 problem that shares a cheat-sheet entry
		const pairs = candidates({ stack: [frame('b-03-pairs-sum-to', 0)], pending: null }).offer.map((p) => findProblem(p.id)!);
		expect(pairs.every((p) => p.level === 1 && p.order < 3)).toBe(true);
	}));

	it('states what is missing, from the records, in either language and at most twelve lines', () => account(async () => {
		expect(memoryFacts('en')).toEqual([]);
		await pose();
		await descend(ROOT, A, 'filter');
		const en = memoryFacts('en');
		const ko = memoryFacts('ko');
		expect(en).toContain('Gap: filter (1x)');
		expect(ko).toContain('빈틈: filter (1회)');
		expect(en.length).toBeLessThanOrEqual(12);
		await pass(A);
		const titleEn = withLocale('en', () => findProblem(A)!.title);
		expect(memoryFacts('en').some((f) => f.startsWith('Passed: ') && f.includes(titleEn))).toBe(true);
	}));
});

describe('the thread', () => {
	it('words events, hints and the example in the learner\'s language when they are read', () => account(async () => {
		await pose();
		coach(reply('', { type: 'hint' }));
		await turn({ text: 'help' });
		await miss(ROOT);
		await sync();
		const view = async (l: 'en' | 'ko') => withLocale(l, async () => (await descentData()).messages.slice(-2).map((m) => m.text));
		const [hintEn, eventEn] = await view('en');
		const [hintKo, eventKo] = await view('ko');
		expect(hintEn).toBe(withLocale('en', () => findProblem(ROOT)!.hints[0]));
		expect(hintKo).toBe(withLocale('ko', () => findProblem(ROOT)!.hints[0]));
		expect(hintEn).not.toBe(hintKo);
		expect([eventEn, eventKo]).toEqual(['3 errors', '오류 3']);
		const stack = await withLocale('en', async () => (await descentData()).stack[0].title);
		expect(stack).toBe(withLocale('en', () => findProblem(ROOT)!.title));
	}));

	it('closes: the stack is cleared, the sessions are left alone, and closing twice is fine', () => account(async () => {
		expect(closeThread()).toEqual({ ok: true });
		await pose();
		await descend(ROOT, A);
		const open = db().prepare('SELECT COUNT(*) AS n FROM lang_sessions WHERE ended_at IS NULL').get();
		expect(closeThread()).toEqual({ ok: true });
		expect(closeThread()).toEqual({ ok: true });
		expect(await descentData()).toMatchObject({ messages: [], stack: [], session: null });
		expect(db().prepare('SELECT COUNT(*) AS n FROM lang_sessions WHERE ended_at IS NULL').get()).toEqual(open);
		expect(db().prepare('SELECT COUNT(*) AS n FROM descent_frames WHERE closed_at IS NULL').get()).toEqual({ n: 0 });
		expect(await sync()).toEqual({ status: 200, body: { ok: true } });
		// the next turn opens a new thread
		coach(reply('Again.'));
		await turn({ text: 'hello' });
		expect((await descentData()).messages.map((m) => m.text)).toEqual(['hello', 'Again.']);
		expect(db().prepare('SELECT COUNT(*) AS n FROM descent_threads').get()).toEqual({ n: 2 });
	}));

	it('keeps accounts apart, and shares only ids, labels and counters', () => account(async () => {
		await pose();
		await descend(ROOT, A, 'filter');
		const other = await withAccount(randomUUID(), async () => ({
			data: await descentData(),
			shared: db().prepare('SELECT * FROM catalog.descent_links WHERE parent_id = ?').all(ROOT)
		}));
		expect(other.data.messages).toEqual([]);
		expect(other.shared).toEqual([{ parent_id: ROOT, sub_id: A, gap: 'filter', offered: 1, accepted: 1 }]);
	}));
});
