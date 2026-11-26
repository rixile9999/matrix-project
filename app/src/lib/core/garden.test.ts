import { describe, expect, it } from 'vitest';
import {
	GAP_NEED, MIN_PER_HOUR, activeDays, bestAndShaky, createGarden, dayNumber, dayStart, firstAttempts, gapFacts, hourly, kindOf, mendedProblems, median, normalisedEntropy, paceOf,
	parseReading, rhythmOf, sparBestMoments, speedSamples, weekKeyOf, weekStartOf, weeklyFacts, type GardenRecords, type LangRec, type MemoRec, type SparRec, type StatsRec
} from './garden.ts';
import { TOPICS } from './lang.ts';

const TOTAL = Object.keys(TOPICS).length;
// local time throughout, so the tests do not depend on the machine's zone
const at = (day: number, hour = 12, min = 0) => new Date(2026, 0, day, hour, min).getTime() / 1000;
let n = 0;
const L = (p: Partial<LangRec> & { day: number }): LangRec => {
	const { day, ...r } = p;
	const startedAt = r.startedAt ?? at(day, 10);
	const elapsed = r.elapsedSec ?? 60;
	return {
		id: ++n, problemId: 'p' + n, title: 't' + n, topic: 'collections', level: 1, book: false, limitSec: 120, startedAt, endedAt: startedAt + elapsed, outcome: 'passed', elapsedSec: elapsed,
		hintsUsed: 0, ...r
	};
};
const M = (day: number, hour: number, rating: 1 | 2 | 3 | 4 = 3, id = 'c' + (++n), topic: string | null = 'folds', itemType: 'card' | 'check' = 'card'): MemoRec => ({ itemType, itemId: id, at: at(day, hour), rating, topic });
const S = (endedAt: number, r: Partial<StatsRec> = {}): StatsRec => ({
	id: ++n, lessonId: 'sample-space', title: ['표본공간 세기', 'Counting Outcomes'], topic: 'probability', mode: 'speed',
	seconds: 100, startedAt: endedAt - 25, endedAt, outcome: 'passed',
	hints: 0, usedReference: false, submissions: 1, correctFields: 1, totalFields: 1, ...r
});
const rec = (p: Partial<GardenRecords> = {}): GardenRecords => ({ lang: [], memo: [], spar: [], sprintSpeeds: [], stats: [], cards: [], topicsTotal: TOTAL, statsTopicsTotal: 4, ...p });

describe('small maths', () => {
	it('median', () => {
		expect(median([])).toBeNull();
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 2, 3])).toBe(2.5);
	});
	it('normalised entropy: one place 0, even 1, uneven in between', () => {
		expect(normalisedEntropy([5], 13)).toBe(0);
		expect(normalisedEntropy([], 13)).toBe(0);
		expect(normalisedEntropy(Array(13).fill(2), 13)).toBeCloseTo(1, 10);
		const mid = normalisedEntropy([8, 1, 1], 13);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(0.4);
		expect(normalisedEntropy([4, 4, 4], 13)).toBeGreaterThan(normalisedEntropy([8, 2, 2], 13));
	});
	it('pace: fast is 1 (dry), slow is 0 (wet), unknown is 0.5', () => {
		expect(paceOf(0.1)).toBe(1);
		expect(paceOf(0.2)).toBe(1);
		expect(paceOf(1.1)).toBe(0);
		expect(paceOf(3)).toBe(0);
		expect(paceOf(null)).toBe(0.5);
		expect(paceOf(0.4)).toBeGreaterThan(paceOf(0.9));
	});
	it('kind label', () => {
		expect(kindOf(0.05, 0.9)).toBe('unknown');
		expect(kindOf(0.5, 0.8)).toBe('wide');
		expect(kindOf(0.5, 0.2)).toBe('straight');
		expect(kindOf(0.5, 0.5)).toBe('even');
	});
});

describe('form', () => {
	it('no records: a bare seed on day 0', () => {
		const f = createGarden(rec()).formAt(at(5));
		expect(f.day).toBe(0);
		expect(f.volume).toBe(0);
		expect(f.kind).toBe('unknown');
		expect(f.pace).toBe(0.5);
	});

	it('a first day is a seedling; a month of steady use is clearly grown', () => {
		const first = createGarden(rec({ lang: [L({ day: 1 }), L({ day: 1 }), L({ day: 1 })], memo: Array.from({ length: 8 }, (_, i) => M(1, 10, 3, 'c' + i)) })).formAt(at(1, 23));
		expect(first.day).toBe(1);
		expect(first.volume).toBeLessThan(0.1);
		expect(first.kind).toBe('unknown');

		const topics = Object.keys(TOPICS);
		const lang: LangRec[] = [];
		const memo: MemoRec[] = [];
		for (let d = 1; d <= 28; d++) {
			if (d % 7 === 0 || d % 7 === 6) continue; // weekends off
			for (let k = 0; k < 3; k++) lang.push(L({ day: d, topic: topics[(d + k) % 9], elapsedSec: 50 }));
			for (let k = 0; k < 16; k++) memo.push(M(d, 9, 3, 'c' + ((d * 3 + k) % 40), topics[(d + k) % 9]));
		}
		const f = createGarden(rec({ lang, memo, cards: Array.from({ length: 40 }, (_, i) => 'c' + i) })).formAt(at(28, 23));
		expect(f.day).toBe(28);
		expect(f.volume).toBeGreaterThan(0.6);
		expect(f.breadth).toBeGreaterThan(0.62);
		expect(f.kind).toBe('wide');
		expect(f.pace).toBeGreaterThan(0.5);
		expect(f.numbers.topics).toBe(9);
		expect(f.leafCount).toBeGreaterThan(5);
		expect(f.leaves).toBeGreaterThan(0.1);
	});

	it('resting freezes the form; going back shows the past from the same records', () => {
		const g = createGarden(rec({ lang: [L({ day: 1 }), L({ day: 2 }), L({ day: 3 })], memo: [M(1, 9), M(2, 9)] }));
		const a = g.formAt(at(3, 23));
		const later = g.formAt(at(300, 23));
		expect({ ...later, day: 0 }).toEqual({ ...a, day: 0 });
		expect(later.day).toBeGreaterThan(a.day);
		const past = g.formAt(at(1, 23));
		expect(past.volume).toBeLessThan(a.volume);
		expect(past.numbers.langPassed).toBe(1);
		expect(g.formAt(at(1, 23))).toEqual(past); // pure
		expect(g.formAt(at(1, 11)).day).toBe(1);
		expect(g.formAt(at(1, 1)).day).toBe(0);
	});

	it('the seed is fixed by the first record, so the shape keeps its identity', () => {
		const a = createGarden(rec({ lang: [L({ day: 1 })] }));
		const b = createGarden(rec({ lang: [L({ day: 1 }), L({ day: 9 })] }));
		expect(a.formAt(at(9)).seed).toBe(b.formAt(at(9)).seed);
		expect(createGarden(rec({ lang: [L({ day: 2 })] })).formAt(at(9)).seed).not.toBe(a.formAt(at(9)).seed);
	});

	it('a session that ended after the date is not yet passed on that date', () => {
		const s = L({ day: 1, startedAt: at(1, 23, 50), elapsedSec: 1200 }); // ends the next day
		const g = createGarden(rec({ lang: [s] }));
		expect(g.formAt(at(1, 23, 55)).numbers.langPassed).toBe(0);
		expect(g.formAt(at(2, 12)).numbers.langPassed).toBe(1);
	});

	it('roots come from level-3 and book problems and from overtime on problems passed in the end', () => {
		const base = createGarden(rec({ lang: [L({ day: 1 })] })).formAt(at(2));
		expect(base.roots).toBe(0);
		const deep = createGarden(rec({ lang: [L({ day: 1, level: 3, limitSec: 900, elapsedSec: 700 }), L({ day: 1, book: true })] })).formAt(at(2));
		expect(deep.numbers.deepPassed).toBe(2);
		expect(deep.roots).toBeGreaterThan(0);
		// the same problem: revealed after 10 min over the limit, then passed
		const p = 'same';
		const over = createGarden(
			rec({ lang: [L({ day: 1, problemId: p, limitSec: 300, elapsedSec: 900, outcome: 'revealed' }), L({ day: 2, problemId: p, limitSec: 300, elapsedSec: 100 })] })
		).formAt(at(3));
		expect(over.numbers.overtimeMin).toBe(10);
		expect(over.roots).toBeGreaterThan(0);
		// overtime on a problem never passed does not count
		const never = createGarden(rec({ lang: [L({ day: 1, problemId: 'x', limitSec: 300, elapsedSec: 900, outcome: 'revealed' })] })).formAt(at(3));
		expect(never.numbers.overtimeMin).toBe(0);
	});

	it('pace needs three passed sessions', () => {
		const two = createGarden(rec({ lang: [L({ day: 1, elapsedSec: 20 }), L({ day: 1, elapsedSec: 20 })] })).formAt(at(2));
		expect(two.pace).toBe(0.5);
		const fast = createGarden(rec({ lang: [1, 2, 3].map((d) => L({ day: d, elapsedSec: 24 })) })).formAt(at(4));
		expect(fast.pace).toBeGreaterThan(0.9);
		expect(fast.numbers.medianRatio).toBeCloseTo(0.2);
		const slow = createGarden(rec({ lang: [1, 2, 3].map((d) => L({ day: d, elapsedSec: 140 })) })).formAt(at(4));
		expect(slow.pace).toBe(0);
	});

	it('leaves are the cards that are stable now, and only live cards', () => {
		// a card reviewed "good" over weeks becomes stable (interval >= 7 days); one reviewed once is not; one with a last rating of 1 is not
		const memo = [M(1, 9, 3, 'a'), M(2, 9, 3, 'a'), M(5, 9, 3, 'a'), M(14, 9, 3, 'a'), M(1, 9, 3, 'b'), M(1, 9, 3, 'gone'), M(2, 9, 3, 'gone'), M(5, 9, 3, 'gone'), M(14, 9, 3, 'gone')];
		const g = createGarden(rec({ memo, cards: ['a', 'b'] }));
		expect(g.formAt(at(14, 23)).leafCount).toBe(1);
		expect(g.formAt(at(1, 23)).leafCount).toBe(0);
		const bad = createGarden(rec({ memo: [...memo, M(20, 9, 1, 'a')], cards: ['a', 'b'] }));
		expect(bad.formAt(at(20, 23)).leafCount).toBe(0);
		expect(bad.formAt(at(19, 23)).leafCount).toBe(1); // as it was the day before
	});

	it('mended problems: revealed, abandoned or past the limit, then passed later', () => {
		const lang = [
			L({ day: 1, problemId: 'a', outcome: 'revealed', elapsedSec: 100 }), L({ day: 3, problemId: 'a' }),
			L({ day: 1, problemId: 'b', outcome: null, endedAt: null, elapsedSec: null }), L({ day: 2, problemId: 'b' }),
			L({ day: 1, problemId: 'c', limitSec: 100, elapsedSec: 150 }), L({ day: 4, problemId: 'c' }),
			L({ day: 1, problemId: 'd', outcome: 'revealed' }), // never passed
			L({ day: 1, problemId: 'e', limitSec: 100, elapsedSec: 150 }), // passed over the limit, not repeated: not mended
			L({ day: 1, problemId: 'f' }) // clean
		];
		const m = mendedProblems(lang.sort((x, y) => x.startedAt - y.startedAt || x.id - y.id));
		expect(m.map((x) => x.problemId).sort()).toEqual(['a', 'b', 'c']);
		expect(m.find((x) => x.problemId === 'a')!.how).toBe('revealed');
		expect(m.find((x) => x.problemId === 'b')!.how).toBe('abandoned');
		expect(m.find((x) => x.problemId === 'c')!.how).toBe('over');
		const g = createGarden(rec({ lang }));
		expect(g.formAt(at(1, 23)).mended).toBe(0);
		expect(g.formAt(at(10)).mended).toBe(3);
	});

	it('flowers: new Sparring bests (not the first), first level-3 passes', () => {
		const run = (id: number, day: number, p: Partial<SparRec>): SparRec => ({
			id, kind: 'sprint', startedAt: at(day, 9), endedAt: at(day, 9, 10), status: 'finished', totalMs: 300_000, skipped: 0, correct: 0, accuracy: null, ...p
		});
		const spar = [
			run(1, 1, { totalMs: 400_000 }), run(2, 2, { totalMs: 380_000 }), run(3, 3, { totalMs: 390_000 }), run(4, 4, { totalMs: 300_000, skipped: 1 }),
			run(5, 5, { totalMs: 350_000 }), run(6, 6, { kind: 'sprint', status: 'abandoned', totalMs: null }),
			run(7, 1, { kind: 'recall', totalMs: null, correct: 10, accuracy: 0.9 }), run(8, 2, { kind: 'recall', totalMs: null, correct: 9, accuracy: 0.95 }),
			run(9, 3, { kind: 'recall', totalMs: null, correct: 14, accuracy: 0.6 }), run(10, 4, { kind: 'recall', totalMs: null, correct: 12, accuracy: 0.85 })
		];
		const m = sparBestMoments(spar);
		expect(m.map((x) => x.kind).sort()).toEqual(['recall-best', 'sprint-best', 'sprint-best']);
		const g = createGarden(rec({ spar, lang: [L({ day: 2, level: 3, problemId: 'x3' }), L({ day: 3, level: 3, problemId: 'x3' }), L({ day: 3, level: 2 })] }));
		const f = g.formAt(at(7));
		expect(f.numbers.bests).toBe(3);
		expect(f.numbers.firstLevel3).toBe(1); // the second pass of the same problem is not a first
		expect(f.flowers).toBe(4);
		expect(g.formAt(at(2, 23)).flowers).toBe(2); // sprint best on day 2 + level-3 first pass, recall best is on day 4
	});

	it('days(): one form per day, the last as of now', () => {
		const g = createGarden(rec({ lang: [L({ day: 3 }), L({ day: 5 })] }));
		const ds = g.days(at(7, 8));
		expect(ds.map((d) => d.date)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07']);
		expect(ds[0].form.day).toBe(1);
		expect(ds[4].form.day).toBe(5);
		expect(ds[1].form.volume).toBe(ds[0].form.volume); // resting changes nothing
		expect(createGarden(rec()).days(at(7))).toHaveLength(1);
	});

	it('grows from solved statistics sessions as of their end, with distinct depth lessons feeding roots', () => {
		const depth = { lessonId: 'bayes-depth', topic: 'inference', mode: 'depth' } as const;
		const g = createGarden(rec({ stats: [
			S(at(2, 0) - 0.001),
			S(at(2), { outcome: 'timeout', submissions: 0, correctFields: 0 }),
			S(at(3), depth),
			S(at(4), depth)
		] }));
		expect(g.days(at(1))[0].form.numbers.statsRuns).toBe(0);
		const [first, second, third, fourth] = g.days(at(4));
		expect(first.form.numbers).toMatchObject({ statsRuns: 1, statsPassed: 1, langPassed: 0, topics: 1, topicsTotal: 4 });
		expect(first.form.volume).toBeGreaterThan(0);
		expect(second.form.numbers).toMatchObject({ statsRuns: 2, statsPassed: 1 });
		expect(second.form.volume).toBe(first.form.volume);
		expect(third.form.breadth).toBeGreaterThan(first.form.breadth);
		expect(third.form.roots).toBeGreaterThan(first.form.roots);
		expect(fourth.form.roots).toBe(third.form.roots);
		expect(fourth.form.numbers).toMatchObject({ statsDepthPassed: 1, statsPassed: 3 });
	});

	it('keeps the earlier coding form when a statistics pass is still in the future', () => {
		const lang = [L({ day: 1 }), L({ day: 2, topic: 'folds' })];
		const before = at(2, 23);
		const coding = createGarden(rec({ lang })).formAt(before);
		const mixed = createGarden(rec({ lang, stats: [S(at(3))] }));
		expect(mixed.formAt(before)).toEqual(coding);
		expect(mixed.formAt(at(3)).numbers).toMatchObject({ langPassed: 2, statsPassed: 1, topics: 3, topicsTotal: TOTAL + 4 });
	});
});

describe('rhythm', () => {
	it('first attempts: reviews by rating, language by first session within the limit without hints', () => {
		const out = firstAttempts({
			stats: [],
			memo: [M(1, 9, 1), M(1, 9, 2), M(1, 9, 3)],
			lang: [
				L({ day: 1, problemId: 'a' }), // ok
				L({ day: 1, problemId: 'b', elapsedSec: 500 }), // over the limit
				L({ day: 1, problemId: 'c', hintsUsed: 1 }), // hints
				L({ day: 1, problemId: 'd', outcome: 'revealed' }),
				L({ day: 1, problemId: 'e', outcome: null, endedAt: null, elapsedSec: null }), // still open: left out
				L({ day: 1, problemId: 'f', outcome: null, endedAt: null, elapsedSec: null }), L({ day: 2, problemId: 'f' }), // left open, replaced: not ok; the retry is not a first attempt
				L({ day: 1, problemId: 'a' }) // a later session of a: not a first attempt
			]
		});
		expect(out.filter((o) => o.ok)).toHaveLength(2 + 1);
		expect(out).toHaveLength(3 + 5);
	});

	it('counts the first ended statistics session by its starting hour, with success on its first unassisted submission', () => {
		const retry = S(at(2, 18), { lessonId: 'retried' });
		const timeout = S(at(1, 9, 1), { lessonId: 'retried', outcome: 'timeout', submissions: 0 });
		const records = rec({ stats: [
			retry,
			S(at(1, 9, 6), { lessonId: 'reference', usedReference: true }),
			S(at(1, 9, 5), { lessonId: 'hint', hints: 1 }),
			S(at(1, 9, 4), { lessonId: 'multiple-submissions', submissions: 2 }),
			S(at(1, 9, 3), { lessonId: 'depth', mode: 'depth' }),
			S(at(1, 9, 2), { lessonId: 'accuracy', mode: 'accuracy' }),
			timeout
		] });
		const rhythm = rhythmOf(records, 'en');
		expect(rhythm.total).toBe(6);
		expect(rhythm.hours[9]).toMatchObject({ n: 6, ok: 2, enough: true });
		expect(rhythm.hours[18].n).toBe(0);
	});

	it('uses only solved statistics speed lessons for pace against their own limit', () => {
		const records = rec({ stats: [
			S(at(1), { mode: 'depth' }),
			S(at(2), { mode: 'accuracy' }),
			S(at(3), { outcome: 'timeout' }),
			S(at(4)),
			S(at(5), { seconds: 50 }),
			S(at(6), { seconds: 200 })
		] });
		expect(speedSamples(records)).toEqual([
			{ at: at(4), ratio: 0.25 },
			{ at: at(5), ratio: 0.5 },
			{ at: at(6), ratio: 0.125 }
		]);
		const garden = createGarden(records);
		expect(garden.formAt(at(5)).numbers.medianRatio).toBeNull();
		expect(garden.formAt(at(6)).numbers.medianRatio).toBe(0.25);
	});

	it('hourly counts by local hour; hours under the threshold are not enough', () => {
		const outs = [...Array.from({ length: MIN_PER_HOUR }, () => ({ at: at(1, 9), ok: true })), { at: at(1, 22), ok: false }];
		const h = hourly(outs);
		expect(h).toHaveLength(24);
		expect(h[9]).toMatchObject({ n: MIN_PER_HOUR, ok: MIN_PER_HOUR, rate: 1, enough: true });
		expect(h[22]).toMatchObject({ n: 1, rate: 0, enough: false });
		expect(h[3]).toMatchObject({ n: 0, rate: null, enough: false });
	});

	it('best and shaky are named only from enough hours, and not when flat', () => {
		const mk = (hour: number, ok: number, bad: number) => [...Array(ok).fill(0).map(() => ({ at: at(1, hour), ok: true })), ...Array(bad).fill(0).map(() => ({ at: at(1, hour), ok: false }))];
		expect(bestAndShaky(hourly([...mk(9, 9, 1), ...mk(14, 6, 4)]))).toBe('few'); // two hours only
		const r = bestAndShaky(hourly([...mk(9, 9, 1), ...mk(14, 7, 3), ...mk(22, 4, 6), ...mk(3, 1, 0) /* 1 sample at 3: perfect but faint */]));
		expect(r).toMatchObject({ best: { hour: 9, rate: 0.9 }, shaky: { hour: 22, rate: 0.4 } });
		expect(bestAndShaky(hourly([...mk(9, 7, 3), ...mk(14, 7, 3), ...mk(22, 7, 3)]))).toBe('flat');
	});

	it('gap facts: slower after a gap, days to be back to normal; nothing without enough cases', () => {
		const days = [1, 2, 3, 4, 5, 10, 11, 12, 13, 20, 21, 22, 23, 24].map((d) => dayNumber(at(d)));
		const sp = (d: number, ratio: number) => ({ at: at(d, 10), ratio });
		const normal = [1, 2, 3, 4, 5, 11, 12, 13, 21, 22, 23, 24].flatMap((d) => [sp(d, 0.5), sp(d, 0.5)]);
		const back = [sp(10, 0.75), sp(10, 0.75), sp(10, 0.75), sp(20, 0.75), sp(20, 0.75), sp(20, 0.75)];
		const speeds = [...normal, ...back];
		expect(normal.length).toBeGreaterThanOrEqual(GAP_NEED.normal);
		const g = gapFacts(days, speeds);
		expect(g.slow).toBe('평소보다 50% 느림');
		expect(g.back).toBe('하루'); // day 11 is normal again, one day after the return day
		expect(gapFacts(days, speeds.slice(0, 10)).slow).toBeNull();
		expect(gapFacts(days.slice(0, 5), speeds).slow).toBeNull(); // no gap at all
		expect(gapFacts([], []).back).toBeNull();
	});

	it('rhythmOf says what is missing instead of guessing', () => {
		const r = rhythmOf(rec({ memo: [M(1, 9), M(1, 9)] }));
		expect(r.hours).toHaveLength(24);
		expect(r.total).toBe(2);
		expect(r.facts.map((f) => f.value)).toEqual([null, null, null, null]);
		expect(r.facts.every((f) => f.need.length > 0)).toBe(true);
	});

	it('activeDays unites every kind of record', () => {
		const midnight = at(4, 0);
		expect(activeDays(rec({ lang: [L({ day: 2 })], memo: [M(5, 9)], stats: [S(midnight)] })))
			.toEqual([2, 3, 4, 5].map((day) => dayNumber(at(day))));
	});
});

describe('week', () => {
	it('week start is Monday, key is its date', () => {
		const thu = at(8, 15); // 2026-01-08 is a Thursday
		expect(weekKeyOf(weekStartOf(thu))).toBe('2026-01-05');
		expect(weekStartOf(at(5, 0, 1))).toBe(dayStart(dayNumber(at(5))));
		expect(weekKeyOf(weekStartOf(at(11, 23)))).toBe('2026-01-05'); // Sunday
		expect(weekKeyOf(weekStartOf(at(12, 0, 1)))).toBe('2026-01-12');
	});

	it('no records this week: no facts', () => {
		const r = rec({ lang: [L({ day: 1 })] });
		expect(weeklyFacts(r, weekStartOf(at(8)), at(8, 15))).toEqual([]);
	});

	it('facts carry ids and plain sentences, including a mended problem of the week', () => {
		const lang = [
			L({ day: 3, problemId: 'a', title: '계산기', outcome: 'revealed' }), L({ day: 6, problemId: 'a', title: '계산기', topic: 'folds' }),
			L({ day: 6, topic: 'recursion', level: 3, elapsedSec: 600, limitSec: 900 }), L({ day: 7, topic: 'collections' })
		];
		const f = weeklyFacts(rec({ lang, memo: [M(6, 9, 3), M(6, 9, 1), M(7, 9, 3), M(7, 9, 3)] }), weekStartOf(at(8)), at(8, 15));
		const ids = f.map((x) => x.id);
		expect(ids).toContain('days');
		expect(ids).toContain('lang');
		expect(ids).toContain('mend1');
		expect(ids).toContain('deep');
		expect(ids).toContain('memo');
		expect(f.find((x) => x.id === 'mend1')!.text).toContain('계산기');
		expect(f.find((x) => x.id === 'memo')!.text).toContain('75%');
		expect(new Set(ids).size).toBe(ids.length);
		expect(f.every((x) => x.text.length > 0)).toBe(true);
	});

	it('summarizes a statistics-only week in both locales, counting unchecked outcomes without treating empty fields as wrong', () => {
		const stats = [
			S(at(4)),
			S(at(5)),
			S(at(6), { lessonId: 'standard-error', title: ['표준오차', 'Standard Error'], topic: 'inference', outcome: 'revealed', hints: 2, usedReference: true, correctFields: 1, totalFields: 3 }),
			S(at(6), { lessonId: 'standard-error', title: ['표준오차', 'Standard Error'], topic: 'inference', outcome: 'timeout', submissions: 0, correctFields: 0, totalFields: 2 }),
			S(at(8) + 0.5)
		];
		const records = rec({ stats });
		const start = weekStartOf(at(8));
		const en = Object.fromEntries(weeklyFacts(records, start, at(8), undefined, 'en').map(({ id, text }) => [id, text]));
		expect(en.days).toContain('2 of 4 days');
		expect(en.stats).toContain('3 sessions this week (1 solved, 1 solution viewed, 1 timed out)');
		expect(en['stats-topics']).toContain('Probability, Statistical Inference');
		expect(en['stats-lessons']).toContain('2 statistics lessons included Counting Outcomes, Standard Error');
		expect(en['stats-checks']).toContain('2 of 4 answer fields');
		expect(en['stats-help']).toContain('1 statistics session');
		const ko = Object.fromEntries(weeklyFacts(records, start, at(8)).map(({ id, text }) => [id, text]));
		expect(ko.stats).toContain('정답 1회, 답안 열람 1회, 시간 초과 1회');
		expect(ko['stats-topics']).toContain('확률, 통계적 추론');
		expect(ko['stats-lessons']).toContain('표본공간 세기, 표준오차');
	});
});

describe('reading', () => {
	const facts = [{ id: 'days', text: 'd' }, { id: 'lang', text: 'l' }];
	it('keeps valid sentences and drops the rest', () => {
		const text =
			'```json\n' +
			JSON.stringify({
				sentences: [
					{ text: '봄비가 뿌리 쪽으로 스몄다.', facts: ['lang'] },
					{ text: '근거가 없다.', facts: [] },
					{ text: '없는 근거를 댄다.', facts: ['nope'] },
					{ text: '가'.repeat(81), facts: ['days'] },
					{ text: '가'.repeat(80), facts: ['days', 'days', 'zzz'] },
					{ text: '당신은 꾸준한 사람이다.', facts: ['days'] },
					{ text: '', facts: ['days'] },
					{ text: 5, facts: ['days'] }
				]
			}) +
			'\n```';
		const r = parseReading(text, facts)!;
		expect(r.sentences.map((s) => s.text.length)).toEqual([15, 80]);
		expect(r.sentences[1].factIds).toEqual(['days']);
		expect(r.dropped).toBe(6);
	});
	it('caps at five and rejects non-JSON', () => {
		const many = JSON.stringify({ sentences: Array.from({ length: 8 }, (_, i) => ({ text: '문장 ' + i, facts: ['days'] })) });
		expect(parseReading(many, facts)!.sentences).toHaveLength(5);
		expect(parseReading('죄송합니다', facts)).toBeNull();
		expect(parseReading('{"sentences": 3}', facts)).toBeNull();
		expect(parseReading('{broken', facts)).toBeNull();
	});
});
