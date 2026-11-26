// Behavioural connectivity contract for the Scala track (mirroring stats-connectivity.test.ts):
// Published catalogue -> Course & Sparring dealing -> Completion log -> Debrief & Garden ->
// Post-session Coach unlock -> Bilingual parity -> Account isolation.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createGarden, weeklyFacts, weekStartOf } from '#lib/core/garden.ts';
import { resolveContext } from './coach.ts';
import { db, withAccount } from './db.ts';
import { catalog, debriefData, sessionCard, addToDeck } from './debrief.ts';
import { loadRecords } from './garden.ts';
import { listProblems } from './judge.ts';
import { bookView, listView, passedBasics, recordLookup, revealSolution, sessionView, startSession, useHint } from './lang.ts';
import { withLocale } from './locale.ts';
import { recallPool, reviewSession } from './memo.ts';
import { abandon, sprintView, startRecall, startSprint } from './spar.ts';

const root = mkdtempSync(join(tmpdir(), 'matrix-scala-contract-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

it('exposes every published Scala problem once in the course matrix and book views', () => withAccount(randomUUID(), () => {
	const published = listProblems('scala');
	expect(published.length).toBeGreaterThan(0);
	const view = listView();
	const matrixIds = view.topics.flatMap((t) => t.levels.flat()).map((p) => p.id).sort();
	expect(new Set(matrixIds).size).toBe(matrixIds.length);
	expect(matrixIds).toEqual(published.map((p) => p.id).sort());

	for (const book of view.books) {
		const bv = bookView(book.id);
		expect(bv).not.toBeNull();
		const expectedBookIds = published.filter((p) => p.book?.id === book.id).map((p) => p.id).sort();
		const actualBookIds = bv!.chapters.flatMap((c) => c.problems).map((p) => p.id).sort();
		expect(actualBookIds).toEqual(expectedBookIds);
	}
}));

it('connects a completed Scala session to Coach, Debrief, Memo, Sparring, and Garden in both languages with account isolation', () => withAccount(randomUUID(), () => {
	const patterns = catalog();
	const compilePattern = patterns.find((p) => p.on === 'compile' && p.samples.length > 0 && p.practice.length > 0)!;
	expect(compilePattern).toBeDefined();

	const published = listProblems('scala');
	// Pick 5 level-1 curriculum problems so we can also deal a real Sparring Sprint (MIN_ITEMS = 5).
	const level1 = published.filter((p) => !p.book && p.level === 1).slice(0, 5);
	expect(level1.length).toBe(5);
	const primary = level1[0];
	const sample = compilePattern.samples[0];

	// 1. Active session: Coach must be locked and material withheld.
	startSession(primary.id);
	const activeView = sessionView(primary.id)!;
	expect(activeView.session.finished).toBeNull();
	expect(resolveContext('lang', primary.id)?.access).toBe('locked');
	expect(resolveContext('lang', primary.id)?.material()).toBeNull();

	// 2. Hint + cheat lookup during the session.
	const hint = useHint(primary.id);
	expect(hint.hints.length).toBe(1);
	const refId = primary.refs[0];
	expect(refId).toBeTruthy();
	expect(recordLookup(primary.id, refId)).toBe(true);

	// 3. Record a compile-error run matching a Debrief pattern across 2 sessions (threshold for a pattern note), then pass & close sessions.
	const sid = activeView.session.id;
	const nowSec = Math.floor(Date.now() / 1000);
	const src = sample.source ?? 'val broken = ???';
	const caretText = sample.caret ?? src.trim();
	const pos = Math.max(0, src.indexOf(caretText));
	const caretLine = ' '.repeat(pos) + '^'.repeat(Math.max(1, caretText.length));
	const compileOutput = `User.scala:1:${pos + 1}\n${sample.message ?? 'type mismatch'}\n${src}\n${caretLine}`;
	db().prepare('INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)').run(
		sid, nowSec, 'compile_error', src,
		JSON.stringify({ status: 'compile_error', cases: [], output: compileOutput, avoided: [] })
	);
	db().prepare('INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)').run(
		sid, nowSec + 5, 'passed', 'def ok = 1',
		JSON.stringify({ status: 'passed', cases: [{ name: 'basic', status: 'ok', detail: '' }], output: '', avoided: [] })
	);
	db().prepare("UPDATE lang_sessions SET ended_at = ?, outcome = 'passed', elapsed_sec = 42, avoided = '[]' WHERE id = ?").run(nowSec + 5, sid);

	// Also pass the remaining 4 level-1 problems (with a 2nd compile hit on level1[1] so the Debrief pattern reaches NOTE_MIN_SESSIONS = 2).
	for (const [idx, p] of level1.slice(1).entries()) {
		startSession(p.id);
		const s = sessionView(p.id)!.session;
		if (idx === 0) {
			db().prepare('INSERT INTO lang_runs(session_id, at, status, code, result) VALUES(?,?,?,?,?)').run(
				s.id, nowSec + 6, 'compile_error', src,
				JSON.stringify({ status: 'compile_error', cases: [], output: compileOutput, avoided: [] })
			);
		}
		db().prepare("UPDATE lang_sessions SET ended_at = ?, outcome = 'passed', elapsed_sec = 30, avoided = '[]' WHERE id = ?").run(nowSec + 7, s.id);
	}
	expect(passedBasics().map((p) => p.id)).toEqual(expect.arrayContaining(level1.map((p) => p.id)));

	// 4. Verify Debrief deck integration unlocks the pattern's memo check.
	expect(addToDeck(compilePattern.id)).toEqual({ ok: true });
	expect(recallPool().some((item) => item.id === compilePattern.check)).toBe(true);

	// 5. Verify synthetic syntax card unlocked by lookup appears in Memo.
	expect(reviewSession().length).toBeGreaterThan(0);

	// 6. Verify Sparring Sprint and Recall can deal real runs from the completed Scala progress.
	const sprint = startSprint();
	const sView = sprintView(sprint.id);
	expect(sView.status).toBe('running');
	expect(sView.problem).not.toBeNull();
	expect(level1.map((p) => p.id)).toContain(sView.problem!.id);
	abandon(sprint.id);

	const recall = startRecall();
	expect(recall.kind).toBe('recall');
	abandon(recall.id);

	// 7. Verify Coach, Debrief, and Garden in both English and Korean.
	for (const locale of ['en', 'ko'] as const) withLocale(locale, () => {
		const coach = resolveContext('lang', primary.id);
		expect(coach?.access).toBe('full');
		expect(coach?.material()?.text).toBeTruthy();

		const card = sessionCard(sid);
		expect(card).not.toBeNull();
		expect(card?.outcome).toBe('passed');

		const debrief = debriefData(null);
		expect(debrief.notes.some((n) => n.id === compilePattern.id && n.inDeck)).toBe(true);
		expect(debrief.day?.sessions.some((s) => s.id === sid && s.outcome === 'passed')).toBe(true);

		const records = loadRecords();
		const garden = createGarden(records, locale);
		expect(garden.formAt(nowSec + 10).numbers.langPassed).toBeGreaterThanOrEqual(5);
		const facts = weeklyFacts(records, weekStartOf(nowSec), nowSec + 10, garden, locale);
		expect(facts.some((f) => f.id === 'lang')).toBe(true);
	});

	// 8. Verify revealSolution path also unlocks Coach to 'full' without leaking across accounts.
	const revealedProblem = published.find((p) => !p.book && p.level === 2)!;
	startSession(revealedProblem.id);
	expect(resolveContext('lang', revealedProblem.id)?.access).toBe('locked');
	revealSolution(revealedProblem.id);
	expect(resolveContext('lang', revealedProblem.id)?.access).toBe('full');

	// 9. Account isolation: another account sees none of this learner's state.
	withAccount(randomUUID(), () => {
		expect(resolveContext('lang', primary.id)?.access).toBe('locked');
		expect(resolveContext('lang', revealedProblem.id)?.access).toBe('locked');
		expect(passedBasics()).toEqual([]);
		expect(debriefData(null).day).toBeNull();
		expect(loadRecords().lang).toEqual([]);
	});
}));
