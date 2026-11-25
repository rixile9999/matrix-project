import { describe, expect, it } from 'vitest';
import {
	RECALL_GRACE_MS, RECALL_MS, SPRINT_STALE_MS, bestRecall, bestSprint, fmtMs, orderRecall, pickSprint, recallLabel, recallSummary, runStatus, sprintExtremes, sprintLabel,
	sprintStruggles, sprintSummary, type RecallCandidate, type SparEvent
} from './spar.ts';

let n = 0;
const E = (type: SparEvent['type'], itemId: string | null, ms: number, payload: Record<string, unknown> = {}, at = 1000 + ms / 1000): SparEvent => ({ seq: ++n, at, ms, type, itemId, payload });
const items = ['a', 'b', 'c'];

describe('fmtMs', () => {
	it('formats m:ss', () => {
		expect(fmtMs(387_400)).toBe('6:27');
		expect(fmtMs(59_600)).toBe('1:00');
		expect(fmtMs(0)).toBe('0:00');
	});
});

describe('runStatus', () => {
	it('keeps a fresh run running', () => {
		expect(runStatus('sprint', [], 10_000)).toEqual({ status: 'running', settle: null });
		expect(runStatus('recall', [], RECALL_MS)).toEqual({ status: 'running', settle: null });
	});
	it('reads the terminal event', () => {
		expect(runStatus('sprint', [E('finish', null, 5)], 9e9).status).toBe('finished');
		expect(runStatus('recall', [E('abandon', null, 5)], 9e9).status).toBe('abandoned');
	});
	it('abandons a Sprint open for over two hours', () => {
		expect(runStatus('sprint', [], SPRINT_STALE_MS).status).toBe('running');
		expect(runStatus('sprint', [], SPRINT_STALE_MS + 1)).toMatchObject({ status: 'abandoned', settle: { type: 'abandon' } });
	});
	it('finishes a Recall past its deadline within the grace period, abandons it after', () => {
		expect(runStatus('recall', [], RECALL_MS + 1)).toEqual({ status: 'finished', settle: { type: 'finish', ms: RECALL_MS } });
		expect(runStatus('recall', [], RECALL_MS + RECALL_GRACE_MS).status).toBe('finished');
		expect(runStatus('recall', [], RECALL_MS + RECALL_GRACE_MS + 1).status).toBe('abandoned');
	});
});

describe('pickSprint', () => {
	const seq = (xs: number[]) => {
		let i = 0;
		return () => xs[i++ % xs.length];
	};
	const c = (id: string, topic: string) => ({ id, topic });
	it('returns distinct problems, at most n', () => {
		const out = pickSprint([c('a', 't'), c('b', 't'), c('c', 'u')], new Set(), seq([0.1, 0.2, 0.3]), 5);
		expect(out.sort()).toEqual(['a', 'b', 'c']);
	});
	it('mixes topics', () => {
		const cs = [c('a1', 'a'), c('a2', 'a'), c('a3', 'a'), c('b1', 'b'), c('c1', 'c'), c('d1', 'd'), c('e1', 'e')];
		const out = pickSprint(cs, new Set(), Math.random, 5);
		expect(new Set(out.map((id) => cs.find((x) => x.id === id)!.topic)).size).toBe(5);
	});
	it('avoids recent problems while there are enough others', () => {
		const cs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => c(id, 't'));
		for (let i = 0; i < 20; i++) expect(pickSprint(cs, new Set(['a', 'b']), Math.random, 5)).not.toContain('a');
	});
	it('uses recent problems when there is no choice', () => {
		const cs = ['a', 'b', 'c', 'd', 'e'].map((id) => c(id, id));
		expect(pickSprint(cs, new Set(cs.map((x) => x.id)), Math.random).length).toBe(5);
	});
	it('prefers a fresh problem of a repeated topic over a recent one of a new topic', () => {
		const out = pickSprint([c('a', 'x'), c('b', 'x'), c('r', 'y')], new Set(['r']), seq([0.5]), 2);
		expect(out).toHaveLength(2);
		expect(out).not.toContain('r');
	});
});

describe('orderRecall', () => {
	const R = (id: string, kind: string, topic: string, urgent: boolean, lastAt: number | null): RecallCandidate => ({ id, kind, topic, urgent, lastAt });
	it('puts urgent first, then the least recently answered, never answered first', () => {
		const out = orderRecall([R('old', 'trace', 't1', false, 5), R('new', 'trace', 't2', false, null), R('due', 'bug', 't3', true, 100), R('mid', 'bug', 't4', false, 50)], 10);
		expect(out[0]).toBe('due');
		expect(out.slice(1)).toEqual(expect.arrayContaining(['new', 'old', 'mid']));
	});
	it('takes the most pressing `limit`, then interleaves kinds and topics', () => {
		const cs = [R('a', 'trace', 'x', true, 1), R('b', 'trace', 'x', true, 2), R('c', 'bug', 'y', true, 3), R('d', 'approach', 'z', false, 4)];
		expect(orderRecall(cs, 3)).toEqual(['a', 'c', 'b']);
		expect(orderRecall(cs, 3)).not.toContain('d');
	});
	it('handles an empty pool', () => expect(orderRecall([])).toEqual([]));
});

describe('sprintSummary', () => {
	it('computes splits from pass/skip events and counts runs and lookups', () => {
		const ev = [
			E('run', 'a', 20_000, { status: 'failed' }), E('lookup', 'a', 25_000, { entryId: 'map' }), E('lookup', 'a', 26_000, { entryId: 'map' }), E('run', 'a', 50_000), E('pass', 'a', 50_000),
			E('skip', 'b', 80_000), E('run', 'c', 100_000), E('pass', 'c', 100_000), E('finish', null, 100_000)
		];
		const s = sprintSummary(items, ev);
		expect(s.rows.map((r) => [r.outcome, r.splitMs, r.cumMs, r.runs])).toEqual([['passed', 50_000, 50_000, 2], ['skipped', 30_000, 80_000, 0], ['passed', 20_000, 100_000, 1]]);
		expect(s.rows[0].lookups).toEqual(['map']);
		expect(s.skipped).toBe(1);
		expect(s.totalMs).toBe(100_000);
	});
	it('has no total for a run that stopped halfway', () => {
		const s = sprintSummary(items, [E('pass', 'a', 10_000), E('abandon', null, 20_000)]);
		expect(s.done).toBe(1);
		expect(s.totalMs).toBeNull();
		expect(s.rows[1].splitMs).toBeNull();
	});
	it('ignores events of unknown items and repeated passes', () => {
		const s = sprintSummary(items, [E('pass', 'zzz', 5), E('pass', 'a', 10_000), E('pass', 'a', 20_000)]);
		expect(s.rows[0].cumMs).toBe(10_000);
		expect(s.done).toBe(1);
	});
});

describe('bestSprint and labels', () => {
	const run = (id: number, status: 'running' | 'finished' | 'abandoned', evs: SparEvent[]) => ({ id, status, summary: sprintSummary(items, evs) });
	const clean = (total: number) => [E('pass', 'a', total / 3), E('pass', 'b', (2 * total) / 3), E('pass', 'c', total)];
	it('picks the fastest finished run without skips; the earlier one on a tie', () => {
		const runs = [run(1, 'finished', clean(300_000)), run(2, 'finished', clean(200_000)), run(3, 'finished', clean(200_000))];
		expect(bestSprint(runs)!.id).toBe(2);
	});
	it('never picks a run with a skip or an abandon, however fast', () => {
		const skipped = run(2, 'finished', [E('pass', 'a', 1000), E('skip', 'b', 2000), E('pass', 'c', 3000)]);
		const abandoned = run(3, 'abandoned', [E('pass', 'a', 1000)]);
		expect(bestSprint([skipped, abandoned])).toBeNull();
		expect(bestSprint([skipped, run(1, 'finished', clean(900_000))])!.id).toBe(1);
	});
	it('labels', () => {
		expect(sprintLabel('finished', run(1, 'finished', clean(387_000)).summary)).toBe('6:27');
		expect(sprintLabel('finished', run(1, 'finished', [E('skip', 'a', 1), E('skip', 'b', 2), E('pass', 'c', 3)]).summary)).toBe('건너뜀 2');
		expect(sprintLabel('abandoned', run(1, 'abandoned', []).summary)).toBe('중단');
		expect(sprintLabel('running', run(1, 'running', []).summary)).toBe('진행 중');
	});
});

describe('sprintStruggles', () => {
	it('counts skips and passes over the problem limit', () => {
		const ev = [E('pass', 'a', 50_000, {}, 11), E('skip', 'b', 150_000, {}, 22), E('pass', 'c', 200_000, {}, 33)];
		const s = sprintSummary(items, ev);
		// limits: a 60 s (50 s split: fine), b 90 s (skipped), c 30 s (50 s split: over)
		const lim: Record<string, number> = { a: 60, b: 90, c: 30 };
		expect(sprintStruggles(s.rows, ev, (id) => lim[id])).toEqual([{ id: 'b', at: 22 }, { id: 'c', at: 33 }]);
	});
	it('ignores a pass whose problem is unknown', () => {
		const ev = [E('pass', 'a', 5000)];
		expect(sprintStruggles(sprintSummary(items, ev).rows, ev, () => undefined)).toEqual([]);
	});
});

describe('sprintExtremes', () => {
	const rows = (splits: number[]) => sprintSummary(['a', 'b', 'c'], splits.map((s, i) => E('pass', 'abc'[i], splits.slice(0, i + 1).reduce((x, y) => x + y, 0)))).rows;
	it('compares with the best run when it has the problems', () => {
		const best: Record<string, number> = { a: 50_000, b: 60_000 };
		const x = sprintExtremes(rows([40_000, 96_000, 30_000]), (id) => best[id] ?? null, () => 90);
		expect(x.fastest).toEqual({ id: 'a', deltaMs: -10_000, basis: 'best' });
		expect(x.slowest).toEqual({ id: 'b', deltaMs: 36_000, basis: 'best' });
	});
	it('falls back to the problem limits when no row has a best split', () => {
		const lim: Record<string, number> = { a: 40, b: 60, c: 60 };
		const x = sprintExtremes(rows([40_000, 30_000, 70_000]), () => null, (id) => lim[id]);
		expect(x.slowest).toEqual({ id: 'c', deltaMs: 10_000, basis: 'limit' });
		expect(x.fastest).toEqual({ id: 'b', deltaMs: -30_000, basis: 'limit' });
	});
	it('has no slowest when nothing is over', () => expect(sprintExtremes(rows([10_000, 10_000, 10_000]), () => null, () => 60).slowest).toBeNull());
});

describe('recall', () => {
	const ans = (ok: boolean) => E('answer', 'c' + n, 1000, { correct: ok });
	const run = (id: number, status: 'finished' | 'abandoned', oks: boolean[]) => ({ id, status, summary: recallSummary(oks.map(ans)) });
	it('summarises', () => expect(recallSummary([ans(true), ans(false), ans(true), ans(true), E('finish', null, 90_000)])).toEqual({ answered: 4, correct: 3, accuracy: 0.75 }));
	it('has no accuracy without answers', () => expect(recallSummary([]).accuracy).toBeNull());
	it('picks the most correct among runs with accuracy >= 80%, then accuracy, then the earlier', () => {
		const yes = (k: number) => Array<boolean>(k).fill(true);
		expect(bestRecall([run(1, 'finished', [...yes(9), false]), run(2, 'finished', [...yes(11), false, false, false]), run(3, 'finished', yes(10))])!.id).toBe(3);
		expect(bestRecall([run(1, 'finished', yes(10)), run(2, 'finished', yes(10))])!.id).toBe(1);
	});
	it('ignores abandoned runs and guessers', () => {
		expect(bestRecall([run(1, 'abandoned', Array<boolean>(10).fill(true)), run(2, 'finished', [true, false, false, false])])).toBeNull();
	});
	it('labels', () => {
		expect(recallLabel('finished', run(1, 'finished', [true, true, true, true, true, true, true, true, true, false]).summary)).toBe('9 · 90%');
		expect(recallLabel('finished', run(1, 'finished', []).summary)).toBe('0개');
		expect(recallLabel('abandoned', run(1, 'abandoned', [true]).summary)).toBe('중단');
	});
});
