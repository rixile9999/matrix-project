import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { db, withAccount } from './db.ts';
import { createRun } from './spar-log.ts';
import { actOnStatsRound, statsRecords, statsRoundView } from './spar-stats.ts';
import { homeData, startRecall, startStats } from './spar.ts';
import { act, courseView, findLesson, runView, startRun, statsHistory } from './stats.ts';

const root = mkdtempSync(join(tmpdir(), 'matrix-spar-stats-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;

afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

it('shares feedback and ended reviews while keeping ordinary and sparring attempts independent', () => withAccount(randomUUID(), () => {
	const now = Date.now();
	const { id } = startStats(now);
	expect(startRecall()).toEqual({ id, kind: 'stats' });
	expect(homeData().active).toMatchObject({ id, kind: 'stats', url: `/spar/stats/${id}` });
	const first = statsRoundView(id, now);
	if (first?.phase !== 'question') throw new Error('Expected the first question');
	const lesson = findLesson(first.lesson.id)!;
	const ordinary = startRun(lesson, now);
	expect(ordinary).not.toBe(first.runId);
	expect(runView(lesson, first.runId, now)).toBeNull();
	expect(act(lesson, first.runId, 'hint', [], now)).toBe('unavailable');
	expect(actOnStatsRound(id, ordinary, 'hint', [], now)).toBe('moved');
	expect(first.reference).toBeNull();
	expect(first).not.toHaveProperty('review');
	expect(statsHistory(now)).toEqual([]);

	expect(actOnStatsRound(id, first.runId, 'check', ['invalid'], now + 10)).toBe('invalid');
	const wrong = lesson.fields.map(({ answer }) => String(answer === 0 ? 1 : -answer));
	expect(actOnStatsRound(id, first.runId, 'check', wrong, now + 20)).toBeNull();
	expect(statsRoundView(id, now + 20)).toMatchObject({ phase: 'question', fields: wrong.map((value) => ({ value, correct: false })) });
	expect(actOnStatsRound(id, first.runId, 'hint', [], now + 30)).toBeNull();
	expect(actOnStatsRound(id, first.runId, 'reference', [], now + 40)).toBeNull();
	expect(statsRoundView(id, now + 40)).toMatchObject({ hints: [lesson.hints[0]], reference: lesson.reference });
	expect(actOnStatsRound(id, first.runId, 'check', lesson.fields.map(({ answer }) => String(answer)), now + 50)).toBeNull();

	expect(statsRoundView(id, now + 50)).toMatchObject({ phase: 'next', position: 0, outcome: 'passed' });
	expect(runView(lesson, first.runId, now + 50)).toMatchObject({ outcome: 'passed', review: { solution: lesson.solution } });
	expect(statsHistory(now + 50)).toMatchObject([{ id: first.runId, outcome: 'passed', usedReference: true, hints: 1, submissions: 2 }]);
	expect(courseView(now + 50).catalogue.find(({ id }) => id === lesson.id)).toMatchObject({ latestId: ordinary, status: 'active', best: 0 });
	expect(startRun(lesson, now + 50)).toBe(ordinary);
	expect(runView(lesson, ordinary, now + 50)).toMatchObject({ outcome: null, hints: [], reference: null });
	withAccount(randomUUID(), () => expect(statsRoundView(id, now + 50)).toBeNull());
}));

it('expires only served questions and measures time only while a question is active', () => withAccount(randomUUID(), () => {
	let now = Date.now();
	const { id } = startStats(now);
	const first = statsRoundView(id, now);
	if (first?.phase !== 'question') throw new Error('Expected the first question');
	now += 60 * 60 * 1000;
	expect(statsRecords(now)).toMatchObject([{ id, kind: 'stats', status: 'running' }]);
	expect(statsHistory(now)).toMatchObject([{ id: first.runId, outcome: 'timeout' }]);
	expect(db().prepare('SELECT COUNT(*) AS n FROM stats_spar_items WHERE round_id = ?').get(id)?.n).toBe(1);
	expect(statsRoundView(id, now)).toMatchObject({ phase: 'next', position: 0, outcome: 'timeout' });
	expect(actOnStatsRound(id, first.runId, 'check', ['0'], now)).toBe('moved');
	expect(actOnStatsRound(id, first.runId, 'next', [], now)).toBeNull();
	expect(actOnStatsRound(id, first.runId, 'next', [], now + 1)).toBe('moved');
	expect(db().prepare('SELECT COUNT(*) AS n FROM stats_spar_items WHERE round_id = ?').get(id)?.n).toBe(2);

	let previousId = first.runId;
	for (const position of [1, 2]) {
		const question = statsRoundView(id, now);
		if (question?.phase !== 'question') throw new Error('Expected a fresh question');
		expect(question.position).toBe(position);
		expect(question.remainingMs).toBe(question.lesson.seconds * 1000);
		expect(question.runId).not.toBe(previousId);
		const lesson = findLesson(question.lesson.id)!;
		now += 1000;
		expect(actOnStatsRound(id, question.runId, 'check', lesson.fields.map(({ answer }) => String(answer)), now)).toBeNull();
		previousId = question.runId;
		if (position === 1) {
			now += 30_000;
			expect(actOnStatsRound(id, previousId, 'next', [], now)).toBeNull();
		}
	}
	const elapsedMs = first.remainingMs + 2000;
	expect(statsRoundView(id, now)).toMatchObject({
		phase: 'result', abandoned: false, solved: 2, elapsedMs,
		items: [{ outcome: 'timeout' }, { outcome: 'passed' }, { outcome: 'passed' }]
	});
	expect(statsRecords(now)).toMatchObject([{ id, status: 'finished', correct: 2, totalMs: elapsedMs, best: true }]);
}));

it('resumes a coding round and records abandonment without inventing a timed-out stats practice attempt', () => withAccount(randomUUID(), () => {
	const now = Date.now();
	const recallId = createRun('recall', ['example'], now);
	expect(startStats(now)).toEqual({ id: recallId, kind: 'recall' });
	const { id } = startStats(now + 10 * 60 * 1000);
	const start = now + 10 * 60 * 1000;
	const first = statsRoundView(id, start);
	if (first?.phase !== 'question') throw new Error('Expected the first question');
	expect(actOnStatsRound(id, first.runId, 'abandon', [], start + 100)).toBeNull();
	const later = start + first.remainingMs * 2;
	expect(statsHistory(later)).toEqual([]);
	expect(statsRoundView(id, later)).toMatchObject({ phase: 'result', abandoned: true, elapsedMs: 100, items: [{ outcome: null, review: null }] });
	expect(statsRecords(later)).toMatchObject([{ id, status: 'abandoned', best: false }]);
	expect(startStats(later)).toMatchObject({ kind: 'stats' });
}));
