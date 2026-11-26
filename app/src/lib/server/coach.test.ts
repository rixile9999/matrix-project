import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { resolveContext, startAsk, threadView } from './coach.ts';
import { db, withAccount } from './db.ts';
import { withLocale } from './locale.ts';
import { act, findLesson, startRun } from './stats.ts';
import { askCoach, connectedCoaches } from './worker.ts';

vi.mock('./worker.ts', () => ({
	askCoach: vi.fn(),
	connectedCoaches: vi.fn(),
	runScala: vi.fn()
}));

const root = mkdtempSync(join(tmpdir(), 'matrix-coach-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;

afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(connectedCoaches).mockResolvedValue(['codex']);
	vi.mocked(askCoach).mockImplementation(async (_backend, _prompt, _system, onDelta) => {
		const reply = 'Mock reply';
		onDelta(reply);
		return reply;
	});
});

it('rejects a statistics question without a valid completed lesson run', () => withAccount(randomUUID(), async () => {
	const lesson = findLesson('sample-space')!;
	const other = findLesson('base-rates')!;
	const id = startRun(lesson);
	const body = { backend: 'codex', question: 'Why?' };

	expect(await threadView('stats', lesson.id, id)).toEqual({
		access: 'locked', opensAt: null, gets: [], backends: [], messages: []
	});
	expect(await startAsk({ ...body, context: { kind: 'stats', id: lesson.id, runId: id } })).toMatchObject({ status: 403 });
	expect(await startAsk({ ...body, context: { kind: 'stats', id: lesson.id, runId: String(id) } })).toMatchObject({ status: 400 });
	expect(await startAsk({ ...body, context: { kind: 'stats', id: other.id, runId: id } })).toMatchObject({ status: 404 });
	expect(await withAccount(randomUUID(), () => threadView('stats', lesson.id, id))).toBeNull();
	expect(connectedCoaches).not.toHaveBeenCalled();
	expect(askCoach).not.toHaveBeenCalled();
}));

it('streams and persists statistics coaching only on the exact run, grounded in localized records', () => withAccount(randomUUID(), async () => {
	const lesson = findLesson('sample-space')!;
	const now = Date.now();
	const id = startRun(lesson, now - 2000);
	act(lesson, id, 'hint', [], now - 1000);
	act(lesson, id, 'reference', [], now - 1000);
	act(lesson, id, 'check', ['1/4'], now - 1000);
	act(lesson, id, 'check', ['87.50%'], now);

	const question = 'Why was my first answer wrong?';
	const result = await withLocale('en', () => startAsk({
		context: { kind: 'stats', id: lesson.id, runId: id },
		backend: 'codex',
		question,
		code: 'untrusted code'
	}));
	if ('error' in result) throw new Error(result.error);
	const events = (await new Response(result.stream).text()).trim().split('\n').map((line) => JSON.parse(line));
	expect(events).toMatchObject([
		{ type: 'start' },
		{ type: 'delta', text: 'Mock reply' },
		{ type: 'done', message: { role: 'coach', text: 'Mock reply' } }
	]);

	const [backend, prompt, system] = vi.mocked(askCoach).mock.calls[0]!;
	expect(backend).toBe('codex');
	expect(system).toContain('Reply in concise English');
	for (const text of [
		lesson.prompt[1], question, '"1/4" → Incorrect', lesson.fields[0]!.feedback[1], '"87.50%" → Correct',
		'Cheat sheet used during practice', lesson.reference.formula[1], 'Hints used: 1/2', lesson.hints[0][1],
		'Solved · 2/90s', lesson.solution[1], lesson.intent[1]
	]) expect(prompt).toContain(text);
	expect(prompt).not.toContain(lesson.hints[1][1]);
	expect(prompt).not.toContain('untrusted code');

	const thread = await withLocale('en', () => threadView('stats', lesson.id, id));
	expect(thread).toMatchObject({ access: 'full', gets: ['Lesson', 'Submitted answers and results', 'Hint and cheat sheet use', 'Worked solution and learning goal'] });
	expect(thread?.messages).toMatchObject([
		{ id: events[0].userMessageId, role: 'user', text: question },
		{ id: events[2].message.id, role: 'coach', text: 'Mock reply' }
	]);
	const korean = await withLocale('ko', () => threadView('stats', lesson.id, id));
	expect(korean?.gets).toContain('모범답안·출제 취지');
	expect(korean?.messages).toEqual(thread?.messages);
	const koreanMaterial = withLocale('ko', () => resolveContext('stats', lesson.id, id)?.material()?.text);
	expect(koreanMaterial).toContain(lesson.solution[0]);
	expect(koreanMaterial).toContain('"87.50%" → 정답');

	const next = startRun(lesson, now - lesson.seconds * 1000);
	expect(next).not.toBe(id);
	expect(await threadView('stats', lesson.id, next)).toMatchObject({ access: 'full', messages: [] });
	const expiredMaterial = withLocale('en', () => resolveContext('stats', lesson.id, next)?.material()?.text);
	expect(expiredMaterial).toContain('Time expired');
	expect(expiredMaterial).toContain('No answers submitted.');
	expect(expiredMaterial).not.toContain('87.50%');
}));

it('preserves existing language and memo Coach rows when the per-account database first supports stats', () => {
	const account = randomUUID();
	const directory = join(root, 'users', account);
	mkdirSync(directory, { recursive: true });
	const legacy = new DatabaseSync(join(directory, 'trainer.db'));
	legacy.exec(`
		CREATE TABLE coach_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, context_kind TEXT NOT NULL CHECK (context_kind IN ('lang', 'memo')), context_id TEXT NOT NULL,
			session_id INTEGER, backend TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('user', 'coach')), text TEXT NOT NULL, ms INTEGER,
			access TEXT NOT NULL CHECK (access IN ('limited', 'full')), error INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX coach_messages_ctx ON coach_messages(context_kind, context_id, id);
		INSERT INTO coach_messages VALUES (3, 12, 'lang', 'old-problem', 42, 'claude', 'user', 'Old question', NULL, 'limited', 0);
		INSERT INTO coach_messages VALUES (4, 13, 'memo', 'old-card', NULL, 'qwen', 'coach', 'Old answer', 22, 'full', 1);
	`);
	const history = legacy.prepare('SELECT * FROM coach_messages ORDER BY id').all();
	legacy.close();

	withAccount(account, () => {
		const database = db();
		expect(database.prepare('SELECT * FROM coach_messages ORDER BY id').all()).toEqual(history);
		const row = database.prepare(`
			INSERT INTO coach_messages (at, context_kind, context_id, session_id, backend, role, text, access)
			VALUES (14, 'stats', 'sample-space', 1, 'codex', 'user', 'New question', 'full')
		`).run();
		expect(row.lastInsertRowid).toBe(5);
		expect(database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = 'coach_messages_ctx'").get()).toBeDefined();
	});
});
