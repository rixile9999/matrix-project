import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	classifyRun, coachingFacts, dayView, focusFacts, measures, observe, parseCoaching, parseCompile, patternStats, retries, sessionStrip, unknownRepeats,
	type DebriefLog, type DebriefPattern, type DRun, type DSession
} from './debrief.ts';

const catalog = JSON.parse(readFileSync(resolve('debrief/scala/patterns.json'), 'utf8')) as DebriefPattern[];

// Real outputs of the judge (2026-11-25 runs)
const OUT = {
	sum: 'User.scala:2:3\nmissing argument for parameter num of method sum in trait IterableOnceOps: (implicit num: Numeric[Int]): Int\nThis code can be rewritten automatically under -rewrite -source 3.7-migration.\n  xs.filter(_ % 2 == 0).map(x => x*x).sum()\n  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
	sortBy: 'User.scala:2:19\nMissing parameter type\n\nI could not infer the type of the parameter _$1\nin expanded function:\n  _$1 => xs == xs.sortBy(_$1)\nExpected type for the whole anonymous function:\n  Boolean\n  xs == xs.sortBy(_)\n                  ^\nUser.scala:2:21\nAmbiguous given instances: both object Int in object Ordering and object DeprecatedFloatOrdering in object Ordering match type Ordering[B] of parameter ord of method sortBy in trait SeqOps\n  xs == xs.sortBy(_)\n                    ^',
	pairs: 'User.scala:2:21\nWrong number of parameters, expected: 1\n  xs.drop(1).forall((a, b) => a < b)\n                    ^^^^^^^^^^^^^^^',
	tuple: 'User.scala:2:38\nvalue _2 is not a member of Int\n  val diffs = xs.zip(xs.drop(1)).map(_._2 - _._1)\n                                     ^^^^',
	zipArgs: 'User.scala:2:22\nFound:    (List[Int], List[Int])\nRequired: IterableOnce[Any]\n  val diffs = xs.zip(xs, xs.drop(1)).map(_._2 - _._1)\n                     ^^^^^^^^^^^^^^'
};

const run = (id: number, sessionId: number, at: number, status: DRun['status'], output = '', failing: string[] = [], code = ''): DRun => ({ id, sessionId, at, status, code, output, failing });
const sess = (id: number, problemId: string, startedAt: number, endedAt: number | null, outcome: DSession['outcome'] = 'passed', hintsUsed = 0, limitSec = 400): DSession =>
	({ id, problemId, title: problemId, limitSec, startedAt, endedAt, outcome, hintsUsed });
const empty = (): DebriefLog => ({ sessions: [], runs: [], lookups: [], marks: [], questions: [], selves: [] });

describe('parseCompile', () => {
	it('splits errors and finds the code under the carets', () => {
		const e = parseCompile(OUT.sortBy);
		expect(e).toHaveLength(2);
		expect(e[0]).toMatchObject({ line: 2, col: 19, head: 'Missing parameter type', source: '  xs == xs.sortBy(_)', caret: '_' });
		expect(e[0].message).toContain('parameter _$1');
		expect(parseCompile(OUT.tuple)[0].caret).toBe('_._2');
		expect(parseCompile(OUT.pairs)[0].caret).toBe('(a, b) => a < b');
	});
	it('keeps an error without a source line', () => {
		expect(parseCompile('User.scala:1:1\nsomething odd')).toEqual([{ line: 1, col: 1, message: 'something odd', head: 'something odd', source: '', caret: '', from: 0, to: 0 }]);
	});
});

describe('classifyRun', () => {
	const ids = (r: DRun) => classifyRun(r, catalog).map((h) => h.pattern);
	it('recognises the real failures of 2026-11-25', () => {
		expect(ids(run(1, 1, 0, 'compile_error', OUT.sum))).toEqual(['empty-parens']);
		expect(ids(run(2, 1, 0, 'compile_error', OUT.sortBy))).toEqual(['placeholder']);
		expect(ids(run(3, 1, 0, 'compile_error', OUT.pairs))).toEqual(['pair-lambda']);
		expect(ids(run(4, 1, 0, 'compile_error', OUT.tuple))).toEqual(['placeholder']);
		expect(ids(run(5, 1, 0, 'compile_error', OUT.zipArgs))).toEqual([]); // a one-off: wrong arguments to zip
		expect(ids(run(6, 1, 0, 'failed', '', ['빈 리스트', '원소 하나']))).toEqual(['edge-empty']);
		expect(ids(run(7, 1, 0, 'failed', '', ['소수 한 자리'], 'def label(name: String, price: Double): String =\n  f"$name: $price.2f원"'))).toEqual(['f-format']);
		expect(ids(run(8, 1, 0, 'passed'))).toEqual([]);
	});
	it('marks the caret inside the trimmed line', () => {
		const [h] = classifyRun(run(4, 1, 0, 'compile_error', OUT.tuple), catalog);
		expect(h.evidence.kind).toBe('compile');
		if (h.evidence.kind === 'compile') expect(h.evidence.source.slice(h.evidence.caretFrom, h.evidence.caretTo)).toBe('_._2');
	});
});

describe('patternStats', () => {
	it('becomes a note at two sessions or three runs, not before', () => {
		const log = empty();
		log.sessions = [sess(1, 'b-06-is-sorted', 0, 100), sess(2, 'b-08-running-total', 200, 300)];
		log.runs = [run(1, 1, 10, 'compile_error', OUT.pairs), run(2, 1, 20, 'compile_error', OUT.sortBy)];
		let st = patternStats(log, catalog).stats;
		expect(st.find((s) => s.id === 'pair-lambda')).toMatchObject({ runs: 1, sessions: 1, note: false });
		log.runs.push(run(3, 2, 210, 'compile_error', OUT.tuple));
		st = patternStats(log, catalog).stats;
		expect(st.find((s) => s.id === 'placeholder')).toMatchObject({ runs: 2, sessions: 2, note: true, problems: ['b-08-running-total', 'b-06-is-sorted'] });
		expect(st[0].id).toBe('placeholder'); // notes first
		log.runs.push(run(4, 1, 30, 'compile_error', OUT.pairs), run(5, 1, 40, 'compile_error', OUT.pairs));
		expect(patternStats(log, catalog).stats.find((s) => s.id === 'pair-lambda')).toMatchObject({ runs: 3, sessions: 1, note: true });
	});
	it('keeps one piece of evidence per line of code and attaches questions of those sessions', () => {
		const log = empty();
		log.sessions = [sess(1, 'b-06-is-sorted', 0, 100)];
		log.runs = [run(1, 1, 10, 'compile_error', OUT.pairs), run(2, 1, 20, 'compile_error', OUT.pairs), run(3, 1, 30, 'compile_error', OUT.pairs)];
		log.questions = [{ sessionId: 1, at: 50, text: '왜 인자가 하나라고 하나요?' }];
		const st = patternStats(log, catalog).stats[0];
		expect(st.evidence).toHaveLength(1);
		expect(st.questions.map((q) => q.text)).toEqual(['왜 인자가 하나라고 하나요?']);
	});
	it('sessions of unknown problems are left out', () => {
		const log = empty();
		log.runs = [run(1, 99, 10, 'compile_error', OUT.pairs)];
		expect(patternStats(log, catalog).stats).toEqual([]);
	});
});

describe('unknownRepeats', () => {
	it('groups unknown errors that came back in two sessions', () => {
		const log = empty();
		log.sessions = [sess(1, 'a', 0, 10), sess(2, 'b', 20, 30)];
		log.runs = [run(1, 1, 5, 'compile_error', OUT.zipArgs), run(2, 2, 25, 'compile_error', OUT.zipArgs.replace('List[Int]', 'List[String]'))];
		const u = unknownRepeats(log, catalog);
		expect(u).toHaveLength(1);
		expect(u[0]).toMatchObject({ runs: 2, sessions: 2 });
	});
});

describe('sessionStrip and observe', () => {
	// session #31 of 2026-11-25: start 23:04:43, runs at +62 (zip args), +172 (typo), +180 (_._2), +236 (passed)
	const t0 = 1_000_000;
	const s = sess(31, '006-arithmetic-progression', t0, t0 + 236);
	const typo = 'User.scala:2:16\nvalue xip is not a member of List[Int] - did you mean xs.zip?\n  val diffs = xs.xip(xs.drop(1))\n                ^^^^^^';
	const runs = [run(1, 31, t0 + 62, 'compile_error', OUT.zipArgs), run(2, 31, t0 + 172, 'compile_error', typo), run(3, 31, t0 + 180, 'compile_error', OUT.tuple), run(4, 31, t0 + 236, 'passed')];
	it('draws runs on the session clock and finds the longest silence', () => {
		const st = sessionStrip(s, { runs, lookups: [], marks: [] });
		expect(st.marks.map((m) => m.t)).toEqual([62, 172, 180, 236]);
		expect(st.silent).toEqual({ from: 62, to: 172 });
		expect(st.recorded).toBe(false);
		expect(st.length).toBe(400);
	});
	it('says what happened, and what the record cannot tell', () => {
		const st = sessionStrip(s, { runs, lookups: [], marks: [] });
		const { stats, hitsByRun } = patternStats({ ...empty(), sessions: [s], runs }, catalog);
		const obs = observe(s, st, runs, [], runs.flatMap((r) => hitsByRun.get(r.id) ?? []), stats, catalog);
		expect(obs[0].text).toBe('4번 · 오류 3 · 통과 1 · 10초 내 재실행 1');
		expect(obs.find((o) => o.key === 'pattern:placeholder')?.label).toBe('처음');
		expect(obs.find((o) => o.key === 'silent')?.text).toBe('1:02부터 1분 50초');
	});
	it('splits a silence into away and idle time when the page recorded them', () => {
		const marks = [
			{ sessionId: 31, at: t0 + 70, kind: 'away' as const }, { sessionId: 31, at: t0 + 100, kind: 'back' as const },
			{ sessionId: 31, at: t0 + 110, kind: 'idle' as const }, { sessionId: 31, at: t0 + 150, kind: 'active' as const }
		];
		const st = sessionStrip(s, { runs, lookups: [], marks });
		expect(st.away).toEqual([{ from: 70, to: 100 }]);
		expect(st.idle).toEqual([{ from: 110, to: 150 }]);
		const obs = observe(s, st, runs, [], [], [], catalog);
		expect(obs.find((o) => o.key === 'silent')?.text).toBe('1:02부터 1분 50초 · 이탈 30초 · 정지 40초');
	});
	it('notes a reveal without any lookup', () => {
		const r = sess(30, '006-arithmetic-progression', t0, t0 + 3019, 'revealed', 2);
		const obs = observe(r, sessionStrip(r, { runs: [], lookups: [], marks: [] }), [], [], [], [], catalog);
		expect(obs.map((o) => o.key)).toEqual(['runs', 'silent', 'reveal']);
		expect(obs[2].text).toBe('치트시트 없이 · 힌트 2');
	});
});

describe('retries and measures', () => {
	it('pairs a failed run with the next one in its session', () => {
		const r = retries([run(1, 1, 0, 'compile_error', OUT.pairs), run(2, 1, 6, 'compile_error', OUT.pairs), run(3, 1, 60, 'passed'), run(4, 2, 61, 'passed')]);
		expect(r).toEqual([{ gap: 6, same: true, sessionId: 1, at: 6 }, { gap: 54, same: false, sessionId: 1, at: 60 }]);
	});
	it('counts reveals without lookups and splits sittings at 20 minutes', () => {
		const log = empty();
		log.sessions = [sess(1, 'a', 0, 100, 'revealed', 2), sess(2, 'b', 200, 300, 'revealed'), sess(3, 'c', 5000, 5100, 'passed')];
		log.lookups = [{ sessionId: 2, at: 250 }];
		const m = measures(log, { from: 0, to: 10_000 });
		expect(m).toMatchObject({ sessions: 3, revealed: 2, revealNoLookup: 1, revealHints2: 1, sittings: 2, revealNoLookupRate: null });
	});
});

describe('focusFacts', () => {
	it('shows no number where the records are too few, and says what is needed', () => {
		const now = 10 * 86_400;
		const log = empty();
		log.sessions = [sess(1, 'a', now - 3600, now - 3500)];
		const f = focusFacts(log, now);
		expect(f.find((x) => x.id === 'sessions')?.value).toBe('1');
		expect(f.find((x) => x.id === 'quick')).toMatchObject({ value: null, need: '실패 뒤 다시 실행 4번' });
		expect(f.find((x) => x.id === 'away')?.value).toBeNull();
		expect(f.every((x) => x.before === undefined || x.before === null)).toBe(true); // no previous week
	});
});

describe('dayView', () => {
	it('puts the sessions of a local day on one axis with the rests between them', () => {
		const start = new Date(2026, 10, 25, 17, 43).getTime() / 1000;
		const log = empty();
		log.sessions = [sess(1, 'a', start, start + 200), sess(2, 'b', start + 300, start + 400), sess(3, 'c', start + 3000, start + 3100)];
		const d = dayView(log, '2026-11-25');
		expect(d.sessions.map((s) => s.id)).toEqual([1, 2, 3]);
		expect(d.rests).toEqual([{ from: start + 400, to: start + 3000 }]);
	});
});

describe('coaching', () => {
	const facts = [{ id: 'pattern:placeholder', text: '…' }, { id: 'focus:quick', text: '…' }];
	it('keeps only sentences that cite known facts and judge no one', () => {
		const text = JSON.stringify({
			sentences: [
				{ text: '막힌 곳의 절반은 `_` 하나였습니다.', facts: ['pattern:placeholder'] },
				{ text: '근거 없는 문장입니다.', facts: ['nope'] },
				{ text: '집중을 못 했습니다.', facts: ['focus:quick'] },
				{ text: '당신은 게으릅니다.', facts: ['focus:quick'] }
			]
		});
		const r = parseCoaching('앞말 ' + text + ' 뒷말', facts)!;
		expect(r.sentences).toEqual([{ text: '막힌 곳의 절반은 `_` 하나였습니다.', factIds: ['pattern:placeholder'] }]);
		expect(r.dropped).toBe(3);
		expect(parseCoaching('not json', facts)).toBeNull();
	});
	it('builds facts from notes and the week', () => {
		const now = 10 * 86_400;
		const log = empty();
		log.sessions = [sess(1, 'b-06-is-sorted', now - 900, now - 800), sess(2, 'b-08-running-total', now - 700, now - 600)];
		log.runs = [run(1, 1, now - 850, 'compile_error', OUT.sortBy), run(2, 2, now - 650, 'compile_error', OUT.tuple)];
		const { stats } = patternStats(log, catalog);
		const ids = coachingFacts(log, stats, catalog, now).map((f) => f.id);
		expect(ids).toContain('pattern:placeholder');
		expect(ids).toContain('focus:sessions');
	});
});
