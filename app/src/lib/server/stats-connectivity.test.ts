import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createGarden, weeklyFacts, weekStartOf } from '#lib/core/garden.ts';
import { resolveContext } from './coach.ts';
import { withAccount } from './db.ts';
import { debriefData } from './debrief.ts';
import { loadRecords } from './garden.ts';
import { withLocale } from './locale.ts';
import { STATS_ROUND_SIZE, actOnStatsRound, sparStatsPool, statsRoundView } from './spar-stats.ts';
import { startStats } from './spar.ts';
import { lessons } from './stats-content.ts';
import { act, courseView, startRun } from './stats.ts';

const root = mkdtempSync(join(tmpdir(), 'matrix-content-contract-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

it('exposes each published lesson exactly once in the course and the statistics round pool', () => withAccount(randomUUID(), () => {
	const published = lessons.map((lesson) => lesson.id).sort();
	expect(new Set(published).size).toBe(published.length);
	expect(courseView().catalogue.map((lesson) => lesson.id).sort()).toEqual(published);
	expect(sparStatsPool().map((lesson) => lesson.id).sort()).toEqual(published);
}));

it.each(lessons)('connects $id to post-session coaching, debrief patterns and Garden in both languages', (lesson) => withAccount(randomUUID(), () => {
	const now = Date.now();
	// Two independent attempts with a miss followed by a correction produce a verifiable recurring pattern.
	const wrong = lesson.fields.map((field) => String(field.answer === 0 ? 1 : -field.answer));
	const correct = lesson.fields.map((field) => String(field.answer));
	let id = 0;
	for (const start of [now - 5000, now - 3000]) {
		id = startRun(lesson, start);
		expect(resolveContext('stats', lesson.id, id)?.access).toBe('locked');
		expect(resolveContext('stats', lesson.id, id)?.material()).toBeNull();
		act(lesson, id, 'hint', [], start + 10);
		act(lesson, id, 'reference', [], start + 20);
		expect(act(lesson, id, 'check', wrong, start + 30)).toBeNull();
		expect(act(lesson, id, 'check', correct, start + 50)).toBeNull();
	}
	for (const locale of ['en', 'ko'] as const) withLocale(locale, () => {
		const title = lesson.title[locale === 'en' ? 1 : 0];
		const coach = resolveContext('stats', lesson.id, id);
		expect(coach?.access).toBe('full');
		expect(coach?.material()?.text).toContain(title);

		const debrief = debriefData(null);
		expect(debrief.statsReviews[0]).toMatchObject({ lessonId: lesson.id, id, outcome: 'passed', submissions: 2, usedReference: true, hints: 1 });
		expect(debrief.statsPatterns).toContainEqual(expect.objectContaining({ lessonId: lesson.id, latestId: id, count: 2 }));
		expect(debrief.day?.sessions).toContainEqual(expect.objectContaining({ title, outcome: 'passed', runs: 2 }));
		expect(debrief.statsWeek).toMatchObject({ total: 2, passed: 2, references: 2 });

		const records = loadRecords();
		const garden = createGarden(records, locale);
		expect(garden.formAt(now / 1000).numbers).toMatchObject({ statsRuns: 2, statsPassed: 2 });
		// Use the practice date's week, including when the test runs at midnight on a week boundary.
		const sampleTime = records.stats[0].endedAt;
		const facts = weeklyFacts(records, weekStartOf(sampleTime), now / 1000, garden, locale);
		expect(facts.find((fact) => fact.id === 'stats-lessons')?.text).toContain(title);
	});
	withAccount(randomUUID(), () => {
		expect(resolveContext('stats', lesson.id, id)).toBeNull();
		expect(debriefData(null).statsReviews).toEqual([]);
		expect(loadRecords().stats).toEqual([]);
	});
}));

it('can actually deal every catalogue lesson across completed statistics rounds', () => withAccount(randomUUID(), () => {
	const dealt = new Set<string>();
	let now = Date.now();
	for (let round = 0; round < lessons.length && dealt.size < lessons.length; round++) {
		const { id } = startStats(now);
		let view = statsRoundView(id, now);
		for (let step = 0; view && view.phase !== 'result' && step < 2 * STATS_ROUND_SIZE; step++) {
			if (view.phase === 'question') {
				dealt.add(view.lesson.id);
				const lessonId = view.lesson.id;
				const lesson = lessons.find((item) => item.id === lessonId)!;
				expect(actOnStatsRound(id, view.runId, 'check', lesson.fields.map((field) => String(field.answer)), ++now)).toBeNull();
			} else {
				expect(actOnStatsRound(id, view.runId, 'next', [], ++now)).toBeNull();
			}
			view = statsRoundView(id, now);
		}
		expect(view?.phase).toBe('result');
	}
	expect([...dealt].sort()).toEqual(lessons.map((lesson) => lesson.id).sort());
}));
