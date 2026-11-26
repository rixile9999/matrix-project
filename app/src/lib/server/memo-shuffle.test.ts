// Verifies attempt-scoped option permutation for standalone memo checks and Sparring Recall:
// - Stable across reload, English/Korean switch, grading, and post-run review for the same attempt/run
// - Rotates across new attempts / new Recall runs (no memorized fixed slot)
// - Backward-compatible with legacy Recall events that have no stored `seed`
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { permutation } from '#lib/core/memo-sched.ts';
import { db, withAccount } from './db.ts';
import { bothLanguages } from './locale.ts';
import { answerCheck, attemptSeed, checkKey, checkSession, recallPool, recallSeed, recallView } from './memo.ts';
import { listChecks } from './memo-content.ts';
import { abandon, recallAnswer, recallScreen, runDetail, startRecall } from './spar.ts';
import { appendEvent, createRun } from './spar-log.ts';

const root = mkdtempSync(join(tmpdir(), 'matrix-memo-shuffle-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = root;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(root, { recursive: true, force: true });
});

it('keeps standalone memo check option order stable across reload and EN/KO switch, then rotates on a new attempt', async () => {
	await withAccount(randomUUID(), async () => {
		// Load queue in both languages (same flow as /memo/check/+page.server.ts).
		const firstLoad = bothLanguages(checkSession);
		const secondLoad = bothLanguages(checkSession); // reload before answering

		const choiceIdx = firstLoad.ko.findIndex((c) => c.kind === 'trace' || c.kind === 'approach');
		expect(choiceIdx).toBeGreaterThanOrEqual(0);
		const ko1 = firstLoad.ko[choiceIdx];
		const en1 = firstLoad.en[choiceIdx];
		const koReload = secondLoad.ko[choiceIdx];

		expect(ko1.attemptId).toBeTypeOf('number');
		expect(en1.attemptId).toBe(ko1.attemptId);
		expect(koReload.attemptId).toBe(ko1.attemptId);
		expect(koReload.options).toEqual(ko1.options);

		// Verify grading uses the exact attempt-scoped permutation.
		const raw = listChecks('scala').find((c) => c.id === ko1.id)!;
		expect(raw.kind === 'trace' || raw.kind === 'approach').toBe(true);
		if (raw.kind !== 'trace' && raw.kind !== 'approach') return;
		const perm = permutation(4, attemptSeed(ko1.id, ko1.attemptId!));
		const rightDisplayIdx = perm.indexOf(raw.answer);
		expect(ko1.options[rightDisplayIdx]).toBe(raw.options[raw.answer].text);

		const res = await answerCheck(ko1.id, rightDisplayIdx, 1200, { attemptId: ko1.attemptId });
		expect(res?.correct).toBe(true);
		expect(res?.correctIndex).toBe(rightDisplayIdx);

		// Confirm different server-issued attempt IDs produce distinct permutations (not stuck in one slot).
		const orders = new Set<string>();
		for (let aid = 1; aid <= 12; aid++) {
			orders.add(permutation(4, attemptSeed(ko1.id, aid)).join(','));
		}
		expect(orders.size).toBeGreaterThan(1);
	});
});

it('keeps Sparring Recall option order stable within a run (reload, EN/KO, grading, review) and rotates across runs while decoding legacy events', async () => {
	await withAccount(randomUUID(), async () => {
		expect(recallPool().length).toBeGreaterThanOrEqual(5);
		const { id: runId } = startRecall();

		const screen1 = recallScreen(runId)!;
		const screenReload = bothLanguages(() => recallScreen(runId)!);
		expect(screen1.current).not.toBeNull();
		const cur = screen1.current!;
		expect(screenReload.ko.current?.id).toBe(cur.id);
		expect(screenReload.en.current?.id).toBe(cur.id);
		expect(screenReload.ko.current?.options).toEqual(cur.options);

		// Compute the exact right index for this runId.
		const raw = listChecks('scala').find((c) => c.id === cur.id)!;
		let rightIdx = 0;
		if (raw.kind === 'bug') rightIdx = raw.bugIndex;
		else if (raw.kind === 'trace' || raw.kind === 'approach') {
			rightIdx = permutation(4, recallSeed(cur.id, runId)).indexOf(raw.answer);
		}
		const ans = await recallAnswer(runId, cur.id, rightIdx);
		expect(ans.accepted).toBe(true);
		expect(ans.correct).toBe(true);
		expect(ans.highlight).toBe(rightIdx);

		abandon(runId);
		const detail = runDetail(runId);
		expect(detail && detail !== 'running' && detail.kind === 'recall').toBe(true);
		if (detail && detail !== 'running' && detail.kind === 'recall') {
			expect(detail.answers[0].checkId).toBe(cur.id);
			expect(detail.answers[0].correct).toBe(true);
			expect(detail.answers[0].correctIndex).toBe(rightIdx);
			expect(detail.answers[0].options).toEqual(cur.options);
		}

		// Verify different run IDs rotate the option order for choice checks.
		const openChoice = recallPool().find((p) => p.kind === 'trace' || p.kind === 'approach')!;
		const traceCheck = listChecks('scala').find((c) => c.id === openChoice.id)!;
		const seenOrders = new Set<string>();
		for (let r = 1; r <= 12; r++) {
			seenOrders.add(recallView(traceCheck.id, r)!.options.join('|'));
		}
		expect(seenOrders.size).toBeGreaterThan(1);

		// Backward compatibility: a legacy recall event without `seed` still decodes via legacy seed `check.id`.
		const legacyRunId = createRun('recall', [traceCheck.id]);
		const legacyKey = checkKey(traceCheck.id)!;
		appendEvent(legacyRunId, 'answer', 1500, traceCheck.id, { choice: legacyKey.correctIndex, correct: true, recorded: false });
		appendEvent(legacyRunId, 'finish', 1500);
		const legacyDetail = runDetail(legacyRunId);
		expect(legacyDetail && legacyDetail !== 'running' && legacyDetail.kind === 'recall').toBe(true);
		if (legacyDetail && legacyDetail !== 'running' && legacyDetail.kind === 'recall') {
			expect(legacyDetail.answers[0].correctIndex).toBe(legacyKey.correctIndex);
			expect(legacyDetail.answers[0].options).toEqual(legacyKey.view.options);
		}
		// Keep db() touched cleanly for sqlite WAL check.
		expect(db().prepare('SELECT COUNT(*) AS n FROM spar_runs').get()).toBeTruthy();
	});
});
