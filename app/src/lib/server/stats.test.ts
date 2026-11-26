import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { db, withAccount } from './db.ts';
import { act, courseView, findLesson, parseNumber, recentStatsReviews, runView, startRun } from './stats.ts';

const root = mkdtempSync(join(tmpdir(), 'matrix-stats-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;

afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

it('opens support step by step, retains partial feedback, and records timeouts', () => withAccount(randomUUID(), () => {
	const lesson = findLesson('base-rates')!;
	const id = startRun(lesson, 10_000);
	expect(startRun(lesson, 11_000)).toBe(id);
	expect(runView(lesson, id, 11_000)).toMatchObject({ hints: [], reference: null, review: null });
	expect(act(lesson, id, 'reveal', [], 11_000)).toBe('hints');
	expect(act(lesson, id, 'hint', [], 12_000)).toBeNull();
	expect(runView(lesson, id, 12_000)?.hints).toHaveLength(1);
	expect(act(lesson, id, 'reference', [], 13_000)).toBeNull();
	expect(runView(lesson, id, 13_000)?.reference).toEqual(lesson.reference);
	expect(act(lesson, id, 'check', ['6.8%', '0.95'], 14_000)).toBeNull();
	const partial = runView(lesson, id, 14_000)!;
	expect(partial.fields.map(({ correct }) => correct)).toEqual([true, false]);
	expect(partial.review).toBeNull();
	expect(act(lesson, id, 'check', ['.068', '19/68'], 15_000)).toBeNull();
	expect(runView(lesson, id, 15_000)).toMatchObject({ outcome: 'passed', elapsed: 5, review: { solution: lesson.solution } });
	expect(db().prepare('SELECT count(*) AS n FROM stats_submissions WHERE run_id = ?').get(id)?.n).toBe(2);
	const next = startRun(lesson, 20_000);
	expect(next).not.toBe(id);
	const expires = 20_000 + lesson.seconds * 1000;
	expect(act(lesson, next, 'check', ['6.8%', '19/68'], expires)).toBeNull();
	expect(runView(lesson, next, expires)).toMatchObject({ outcome: 'timeout', elapsed: lesson.seconds });
	expect(recentStatsReviews(expires)).toMatchObject([
		{ id: next, usedReference: false }, { id, usedReference: true }
	]);
	expect(courseView(expires).catalogue.find(({ id }) => id === lesson.id)).toMatchObject({ best: 5, status: 'timeout' });
}));

it('keeps attempts account-specific and releases solutions after both hints', () => {
	const lesson = findLesson('sample-space')!;
	const id = withAccount(randomUUID(), () => startRun(lesson, 1000));
	withAccount(randomUUID(), () => {
		expect(runView(lesson, id, 1100)).toBeNull();
		const ownId = startRun(lesson, 2000);
		act(lesson, ownId, 'hint', [], 3000);
		act(lesson, ownId, 'hint', [], 4000);
		act(lesson, ownId, 'reveal', [], 5000);
		expect(runView(lesson, ownId, 5000)).toMatchObject({ hints: lesson.hints, outcome: 'revealed', review: { solution: lesson.solution } });
		expect(courseView(5000).recommendation[0]?.id).toBe(lesson.id);
	});
});

it('checks all published solutions against numerical responses and rejects a blank response', () => withAccount(randomUUID(), () => {
	const responses: Record<string, string[]> = {
		'sample-space': ['7/8'],
		'base-rates': ['0.068', '.2794'],
		expectation: ['1', '1.5'],
		'shared-coin': ['1/2', '5/16', '1/16'],
		'standard-error': ['2'],
		'confidence-interval': ['46.08', '53.92'],
		likelihood: ['70%', '1.8346'],
		'testing-and-power': ['.0228', '.9123'],
		classifier: ['60%', '75%', '1'],
		'multiple-testing': ['50', '5e-5']
	};
	const now = 10_000;
	const course = courseView(now);
	expect(course.catalogue.map(({ id }) => id).sort()).toEqual(Object.keys(responses).sort());
	for (const [lessonId, answers] of Object.entries(responses)) {
		const lesson = findLesson(lessonId)!;
		const id = startRun(lesson, now);
		expect(act(lesson, id, 'check', answers.map(() => ''), now)).toBe('invalid');
		expect(act(lesson, id, 'check', answers, now)).toBeNull();
		expect(runView(lesson, id, now)?.outcome).toBe('passed');
	}
	expect(parseNumber('1 / 0')).toBe(Infinity);
	expect(parseNumber('0x2')).toBeNaN();
}));

it('supplies a bilingual sheet for every lesson and preserves the lookup history when reviewing', () => withAccount(randomUUID(), () => {
	const start = 1000;
	for (const { id: lessonId } of courseView(start).catalogue) {
		const lesson = findLesson(lessonId)!;
		const run = startRun(lesson, start);
		const deadline = start + lesson.seconds * 1000;
		expect(runView(lesson, run, start)?.reference).toBeNull();
		for (const key of ['formula', 'symbols', 'conditions', 'pitfall'] as const) {
			const [korean, english] = lesson.reference[key];
			expect(korean.trim()).not.toBe('');
			expect(english.trim()).not.toBe('');
		}
		act(lesson, run, 'reference', [], start + 1);
		act(lesson, run, 'reference', [], start + 2);
		expect(runView(lesson, run, start + 2)).toMatchObject({
			deadline, hints: [], reference: lesson.reference, review: null
		});
		expect(runView(lesson, run, deadline)?.review?.usedReference).toBe(true);
		const next = startRun(lesson, deadline);
		const end = deadline + lesson.seconds * 1000;
		act(lesson, next, 'reference', [], end);
		expect(runView(lesson, next, end)).toMatchObject({
			outcome: 'timeout', reference: lesson.reference, review: { usedReference: false }
		});
	}
}));
