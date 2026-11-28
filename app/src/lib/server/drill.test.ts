import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, withAccount } from './db.ts';
import { catalog } from './debrief.ts';
import { autoDrills, deckDrillChecks, drillAuto, drillJobState, drillsFor, setDrillAuto, setDrillState, startDrills, verifyDrill, type RunScala } from './drill.ts';
import { withLocale } from './locale.ts';
import { askCoach, connectedCoaches, runScala } from './worker.ts';
import { DRILL_SYSTEM, PER_DAY, PER_NOTE, parseReview, type Drill } from '#lib/core/drill.ts';

vi.mock('./worker.ts', () => ({
	askCoach: vi.fn(),
	connectedCoaches: vi.fn(),
	runScala: vi.fn()
}));

const root = mkdtempSync(join(tmpdir(), 'matrix-drill-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

const bi = (ko: string, en = ko) => ({ ko, en });
const drill: Drill = {
	code: 'val xs = List(1, 2, 4, 3)\nxs.zip(xs.drop(1)).forall((a, b) => a <= b)',
	verify: 'val xs = List(1, 2, 4, 3)\nxs.zip(xs.drop(1)).forall((a, b) => a <= b) // => false',
	prompt: bi('이웃한 쌍이 모두 오름차순인가?', 'Are all neighbouring pairs ascending?'),
	options: [
		{ text: bi('false'), why: bi('4 다음에 3이 옵니다.', '3 follows 4.') },
		{ text: bi('true'), why: bi('마지막 쌍을 놓쳤습니다.', 'The last pair is missed.') },
		{ text: bi('컴파일 오류', 'Compile error'), why: bi('쌍이라 풀립니다.', 'Pairs unpack.') },
		{ text: bi('List(1, 2)'), why: bi('forall은 Boolean입니다.', 'forall returns a Boolean.') }
	],
	slip: 'val xs = List(1, 2, 4, 3)\nxs.drop(1).forall((a, b) => a <= b)'
};

const lines = (text: string) => text.split('\n').map((l) => '[error] ' + l).join('\n');
const compileError = (message: string, source: string, caret: string) =>
	lines(`./User.scala:3:5\n${message}\n${source}\n${' '.repeat(source.indexOf(caret))}${'^'.repeat(caret.length)}`);
const slipSource = '  xs.drop(1).forall((a, b) => a <= b)';
const pairError = compileError('Wrong number of parameters, expected: 1', slipSource, '(a, b) => a <= b');
const shows = (value: string) => `##SHOW|drill|2|${value}\n`;
const ok = (stdout = '', stderr = '', code = 0) => ({ stdout, stderr, code, timedOut: false });

/** A runner that plays Scala: the value run prints `value`, the slip run fails with `slipError`. */
const fake = (value: string, slipError: string | null): RunScala & { calls: Record<string, string>[] } => {
	const calls: Record<string, string>[] = [];
	const run = async (files: Record<string, string>) => {
		calls.push(files);
		if ('T.scala' in files) return ok(shows(value));
		return slipError === null ? ok() : ok('', slipError, 1);
	};
	return Object.assign(run, { calls });
};

const cat = () => catalog();
const pattern = (id: string) => cat().find((p) => p.id === id)!;

describe('verifyDrill', () => {
	it('passes a drill whose value and slip check out, and builds the harness files', async () => {
		const run = fake('false', pairError);
		expect(await verifyDrill(drill, pattern('pair-lambda'), cat(), run)).toEqual({ ok: true });
		expect(Object.keys(run.calls[0]).sort()).toEqual(['Cheat.scala', 'Main.scala', 'T.scala']);
		expect(run.calls[0]['T.scala']).toContain('Cheat.show("drill", 2,');
		expect(Object.keys(run.calls[1]).sort()).toEqual(['Main.scala', 'User.scala']);
		expect(run.calls[1]['User.scala']).toMatch(/^object Slip:\n {2}val xs/);
	});
	it('rejects a value that differs from the correct option', async () => {
		const r = await verifyDrill(drill, pattern('pair-lambda'), cat(), fake('true', pairError));
		expect(r).toMatchObject({ ok: false });
		expect('reason' in r && r.reason).toContain('verify shows "true"');
	});
	it('rejects a wrong option equal to the shown value', async () => {
		const clash = { ...drill, options: drill.options.map((o, i) => (i === 3 ? { ...o, text: bi('false', 'false') } : o)) };
		expect(await verifyDrill(clash, pattern('pair-lambda'), cat(), fake('false', pairError))).toMatchObject({ ok: false });
	});
	it('rejects a verify that does not run or times out', async () => {
		expect(await verifyDrill(drill, pattern('pair-lambda'), cat(), async () => ({ stdout: '', stderr: '', code: 0, timedOut: true }))).toMatchObject({ ok: false });
		expect(await verifyDrill(drill, pattern('pair-lambda'), cat(), async () => ok('', lines('./T.scala:1:1\nNot found: x'), 1))).toMatchObject({ ok: false });
	});
	it('rejects a slip that compiles', async () => {
		const r = await verifyDrill(drill, pattern('pair-lambda'), cat(), fake('false', null));
		expect(r).toEqual({ ok: false, reason: 'slip compiles' });
	});
	it('rejects a slip whose first matching pattern is another one', async () => {
		const r = await verifyDrill(drill, pattern('pair-lambda'), cat(), fake('false', compileError('Reassignment to val s', '  s = s + 1', 's = s + 1')));
		expect(r).toMatchObject({ ok: false });
		expect('reason' in r && r.reason).toContain('reassign-val');
	});
	it('rejects a compile pattern without a slip, and skips the slip step for a failed pattern', async () => {
		expect(await verifyDrill({ ...drill, slip: null }, pattern('pair-lambda'), cat(), fake('false', pairError))).toMatchObject({ ok: false });
		const run = fake('false', null);
		expect(await verifyDrill({ ...drill, slip: null }, pattern('edge-empty'), cat(), run)).toEqual({ ok: true });
		expect(run.calls).toHaveLength(1);
	});
	it('turns a runner failure into a reason', async () => {
		const r = await verifyDrill(drill, pattern('pair-lambda'), cat(), async () => { throw new Error('worker down'); });
		expect(r).toEqual({ ok: false, reason: 'runner: worker down' });
	});
});

const now = () => Math.floor(Date.now() / 1000);
const insertDrill = (patternId: string, n: number, createdAt = now(), state = 'ready') =>
	db().prepare('INSERT INTO debrief_drills(pattern_id, created_at, backend, reviewer, hash, body, state) VALUES(?,?,?,?,?,?,?)')
		.run(patternId, createdAt, 'codex', 'codex', `h${patternId}${n}${createdAt}${state}`, JSON.stringify({ ...drill, code: drill.code + ' '.repeat(n) }), state);

/** Two finished sessions on one problem, each with a run the pair-lambda pattern recognises: a note. */
function seedNote(problemId = 'b-06-is-sorted') {
	const t = now() - 7200;
	for (const i of [0, 1]) {
		const s = db().prepare("INSERT INTO lang_sessions(lang, problem_id, started_at, ended_at, outcome, elapsed_sec) VALUES('scala', ?, ?, ?, 'passed', 100)").run(problemId, t + i * 1000, t + i * 1000 + 100);
		db().prepare("INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)").run(
			Number(s.lastInsertRowid), t + i * 1000 + 50, 'compile_error', 'x',
			JSON.stringify({ status: 'compile_error', cases: [], output: `User.scala:3:20\nWrong number of parameters, expected: 1\n${slipSource}\n${' '.repeat(slipSource.indexOf('(a, b)'))}${'^'.repeat('(a, b) => a <= b'.length)}`, avoided: [] })
		);
	}
}
const account = <T>(fn: () => Promise<T>) => withAccount(randomUUID(), fn);
const jobs = () => db().prepare('SELECT * FROM debrief_drill_jobs ORDER BY id').all() as { id: number; pattern_id: string; status: string; asked: number; kept: number; error: string | null; auto: number; process_id: string }[];
const generatorReply = JSON.stringify({ drills: [drill] });

function fakeProviders() {
	vi.mocked(connectedCoaches).mockResolvedValue(['codex', 'claude']);
	vi.mocked(runScala).mockImplementation(fake('false', pairError));
	vi.mocked(askCoach).mockImplementation(async (backend, _prompt, system) => {
		if (system.startsWith(DRILL_SYSTEM)) return generatorReply;
		// the reviewer solves blind: find the answer position that maps back to option 0 for this job's seed
		const id = jobs().at(-1)!.id;
		for (let answer = 0; answer < 4; answer++) {
			const reply = JSON.stringify({ reviews: [{ index: 0, answer, ambiguous: false, reason: 'ok' }] });
			if (parseReview(reply, [drill], [`${id}:0`])[0].ok) return reply;
		}
		throw new Error('unreachable');
	});
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(connectedCoaches).mockResolvedValue([]);
});

describe('settings and state', () => {
	it('is on until the learner turns it off', () => account(async () => {
		expect(drillAuto()).toBe(true);
		expect(setDrillAuto(false)).toEqual({ ok: true });
		expect(drillAuto()).toBe(false);
		expect(setDrillAuto(true)).toEqual({ ok: true });
		expect(drillAuto()).toBe(true);
		expect(setDrillAuto('yes')).toHaveProperty('error');
	}));

	it('moves a drill from ready to added to dropped and feeds the deck as a memo check', () => account(async () => {
		const id = Number(insertDrill('pair-lambda', 0).lastInsertRowid);
		expect(drillsFor('pair-lambda', 'en')).toEqual([{ id, prompt: drill.prompt.en, code: drill.code + '', state: 'ready' }]);
		expect(deckDrillChecks('en')).toEqual([]);

		expect(setDrillState(id, undefined)).toEqual({ ok: true });
		expect(drillsFor('pair-lambda', 'ko')[0]).toMatchObject({ state: 'added', prompt: drill.prompt.ko });
		expect(db().prepare('SELECT COUNT(*) AS n FROM debrief_deck WHERE pattern_id = ?').get('pair-lambda')).toEqual({ n: 1 });
		const [check] = deckDrillChecks('en');
		expect(check).toMatchObject({ id: `drill-${id}`, kind: 'trace', answer: 0, debrief: 'pair-lambda', unlock: [], prompt: drill.prompt.en });
		expect(check.options[2].text).toBe('Compile error');
		expect(deckDrillChecks('ko')[0].options[2].text).toBe('컴파일 오류');
		expect(setDrillState(id, undefined)).toEqual({ ok: true }); // adding twice changes nothing
		expect(db().prepare('SELECT COUNT(*) AS n FROM debrief_deck').get()).toEqual({ n: 1 });

		expect(setDrillState(id, true)).toEqual({ ok: true });
		expect(drillsFor('pair-lambda', 'en')).toEqual([]);
		expect(deckDrillChecks('en')).toEqual([]);
		expect(setDrillState(id, undefined)).toHaveProperty('error');
		expect(setDrillState('x', undefined)).toHaveProperty('error');
	}));

	it('marks a running job of another process as failed', () => account(async () => {
		db().prepare("INSERT INTO debrief_drill_jobs(pattern_id, started_at, process_id, backend, status) VALUES('pair-lambda', ?, 'old-process', 'codex', 'running')").run(now());
		expect(drillJobState('pair-lambda')).toBe('failed');
		expect(drillJobState('placeholder')).toBeNull();
	}));
});

describe('startDrills', () => {
	it('refuses unknown patterns, patterns without a note, and the caps', () => account(async () => {
		expect(startDrills('nope').status).toBe(400);
		expect(startDrills('pair-lambda').status).toBe(400); // no records yet: not a note
		seedNote();
		for (let i = 0; i < PER_NOTE; i++) insertDrill('pair-lambda', i);
		expect(startDrills('pair-lambda').status).toBe(409);
		expect(jobs()).toHaveLength(0);
	}));

	it('refuses past the daily cap', () => account(async () => {
		seedNote();
		for (let i = 0; i < PER_DAY; i++) insertDrill(i % 2 ? 'placeholder' : 'edge-empty', i);
		expect(startDrills('pair-lambda').status).toBe(409);
		// yesterday does not count
		db().prepare('UPDATE debrief_drills SET created_at = ?').run(now() - 2 * 86400);
		fakeProviders();
		expect(startDrills('pair-lambda').status).toBe(202);
		await vi.waitFor(() => expect(drillJobState('pair-lambda')).toBeNull());
	}));

	it('generates, verifies, reviews with another backend and stores one drill; refuses a second job while running', () => account(async () => {
		seedNote();
		fakeProviders();
		const first = startDrills('pair-lambda', 'codex');
		expect(first).toEqual({ status: 202, body: { ok: true } });
		expect(drillJobState('pair-lambda')).toBe('running');
		expect(startDrills('pair-lambda', 'codex').status).toBe(409);
		await vi.waitFor(() => expect(drillJobState('pair-lambda')).toBeNull());
		expect(jobs()).toMatchObject([{ status: 'done', asked: 3, kept: 1, error: null, auto: 0 }]);
		expect(withLocale('en', () => drillsFor('pair-lambda', 'en'))).toHaveLength(1);
		const row = db().prepare('SELECT backend, reviewer, state FROM debrief_drills').get();
		expect(row).toEqual({ backend: 'codex', reviewer: 'claude', state: 'ready' });
		const generated = vi.mocked(askCoach).mock.calls[0];
		expect(generated[0]).toBe('codex');
		expect(JSON.parse(generated[1]).pattern.title.en).toBeTruthy();
		expect(JSON.parse(generated[1]).pattern.title.ko).not.toBe(JSON.parse(generated[1]).pattern.title.en);
	}));

	it('ends the job as failed when nothing parses, after one repair retry', () => account(async () => {
		seedNote();
		fakeProviders();
		vi.mocked(askCoach).mockResolvedValue('not json');
		expect(startDrills('pair-lambda').status).toBe(202);
		await vi.waitFor(() => expect(drillJobState('pair-lambda')).toBe('failed'));
		expect(vi.mocked(askCoach)).toHaveBeenCalledTimes(2);
		expect(jobs()).toMatchObject([{ status: 'failed', kept: 0, error: 'parse' }]);
	}));

	it('discards a drill that fails verification and records the reason in the job', () => account(async () => {
		seedNote();
		fakeProviders();
		vi.mocked(runScala).mockImplementation(fake('true', pairError));
		startDrills('pair-lambda');
		await vi.waitFor(() => expect(drillJobState('pair-lambda')).toBe('failed'));
		expect(jobs()[0]).toMatchObject({ error: 'verify', kept: 0 });
		expect(drillsFor('pair-lambda', 'en')).toEqual([]);
	}));

	it('records a provider failure without throwing', () => account(async () => {
		seedNote();
		fakeProviders();
		vi.mocked(askCoach).mockRejectedValue(new Error('down'));
		expect(startDrills('pair-lambda').status).toBe(202);
		await vi.waitFor(() => expect(jobs()[0].status).toBe('failed'));
		expect(jobs()[0].error).toBe('provider');
	}));
});

describe('autoDrills', () => {
	it('starts a job for the note the session showed, with the default backend, when nothing was switched off', () => account(async () => {
		seedNote();
		fakeProviders();
		autoDrills('b-06-is-sorted');
		await vi.waitFor(() => expect(jobs()).toHaveLength(1));
		expect(jobs()[0]).toMatchObject({ pattern_id: 'pair-lambda', auto: 1 });
		await vi.waitFor(() => expect(jobs()[0].status).toBe('done'));
		expect(jobs()[0].kept).toBe(1);
		expect(vi.mocked(askCoach).mock.calls[0][0]).toBe('codex');
	}));

	it('uses the first connected backend when the default is not connected', () => account(async () => {
		seedNote();
		fakeProviders();
		vi.mocked(connectedCoaches).mockResolvedValue(['qwen']);
		autoDrills('b-06-is-sorted');
		await vi.waitFor(() => expect(jobs()).toHaveLength(1));
		expect(vi.mocked(askCoach).mock.calls[0][0]).toBe('qwen');
		await vi.waitFor(() => expect(jobs()[0].status).not.toBe('running'));
	}));

	it('does nothing without a connected backend, when switched off, or for a session without a note', () => account(async () => {
		seedNote();
		fakeProviders();
		vi.mocked(connectedCoaches).mockResolvedValue([]);
		autoDrills('b-06-is-sorted');
		await new Promise((r) => setTimeout(r, 30));
		expect(jobs()).toHaveLength(0);

		vi.mocked(connectedCoaches).mockResolvedValue(['codex']);
		setDrillAuto(false);
		autoDrills('b-06-is-sorted');
		await new Promise((r) => setTimeout(r, 30));
		expect(jobs()).toHaveLength(0);

		setDrillAuto(true);
		autoDrills('001-unknown-problem');
		await new Promise((r) => setTimeout(r, 30));
		expect(jobs()).toHaveLength(0);
	}));

	it('skips a pattern whose last automatic job kept nothing within 24 hours, and tries again after', () => account(async () => {
		seedNote();
		fakeProviders();
		const failed = (endedAgo: number, error: string) =>
			db().prepare("INSERT INTO debrief_drill_jobs(pattern_id, started_at, ended_at, process_id, backend, status, asked, kept, error, auto) VALUES('pair-lambda', ?, ?, 'p', 'codex', 'failed', 3, 0, ?, 1)")
				.run(now() - endedAgo - 60, now() - endedAgo, error);
		failed(3600, 'parse');
		autoDrills('b-06-is-sorted');
		await new Promise((r) => setTimeout(r, 30));
		expect(jobs()).toHaveLength(1);

		// an interrupted job is not a reason to wait
		db().prepare('DELETE FROM debrief_drill_jobs').run();
		failed(3600, 'interrupted');
		autoDrills('b-06-is-sorted');
		await vi.waitFor(() => expect(jobs()).toHaveLength(2));
		await vi.waitFor(() => expect(jobs()[1].status).not.toBe('running'));

		db().prepare('DELETE FROM debrief_drill_jobs').run();
		db().prepare('DELETE FROM debrief_drills').run();
		failed(25 * 3600, 'parse');
		autoDrills('b-06-is-sorted');
		await vi.waitFor(() => expect(jobs()).toHaveLength(2));
		await vi.waitFor(() => expect(jobs()[1].status).not.toBe('running'));
	}));
});
