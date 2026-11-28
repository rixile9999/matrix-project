import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRILL_SYSTEM, REVIEW_SYSTEM, drillCheck, drillHash, drillPrompt, parseDrills, parseReview, reviewPrompt, type Drill, type DrillInput } from './drill.ts';
import type { TraceCheck } from './memo.ts';

const exemplarCheck = (JSON.parse(readFileSync(resolve('memo/scala/checks/debrief.json'), 'utf8')) as TraceCheck[]).find((c) => c.kind === 'trace')!;

const input = (over: Partial<DrillInput> = {}, on: 'compile' | 'failed' = 'failed'): DrillInput => ({
	pattern: { id: 'placeholder', title: { ko: '`_`는 쓸 때마다 새 인자다', en: 'Each `_` is a new parameter' }, rule: { ko: ['a'], en: ['b'] }, on },
	exemplar: { code: exemplarCheck.code, verify: exemplarCheck.verify, prompt: exemplarCheck.prompt, options: exemplarCheck.options },
	evidence: [{ code: 'xs.map(_ * _)', message: 'Wrong number of parameters' }],
	existing: [],
	count: 3,
	...over
});

const opts = (values: string[]) => values.map((v, i) => ({ text: { ko: v, en: v }, why: { ko: `이유 ${i}입니다.`, en: `Reason ${i}.` } }));

const good = (over: Record<string, unknown> = {}) => ({
	code: 'val xs = List(1, 2, 3)\nxs.map(_ + 1).reduce(_ * _)',
	verify: 'val xs = List(1, 2, 3)\nxs.map(_ + 1).reduce(_ * _) // => 24',
	prompt: { ko: '결과는?', en: 'What is the result?' },
	options: opts(['24', '컴파일 오류', 'List(2, 3, 4)', '6']),
	slip: null,
	...over
});
const reply = (...drills: unknown[]) => JSON.stringify({ drills });

describe('drillHash', () => {
	it('is 16 hex digits and ignores whitespace layout', () => {
		const h = drillHash('xs.map(_ + 1)');
		expect(h).toMatch(/^[0-9a-f]{16}$/);
		expect(drillHash('  xs.map(_ + 1)\n')).toBe(h);
		expect(drillHash('xs.map(\n  _ + 1)')).not.toBe(h);
		expect(drillHash('xs.map(_ + 2)')).not.toBe(h);
	});
	it('matches the FNV-1a 64 reference value', () => {
		expect(drillHash('a')).toBe('af63dc4c8601ec8c');
		expect(drillHash('')).toBe('cbf29ce484222325');
	});
});

describe('prompts', () => {
	it('drillPrompt is the input as JSON', () => {
		const i = input();
		expect(JSON.parse(drillPrompt(i))).toEqual(i);
	});
	it('system prompts name the output shape', () => {
		expect(DRILL_SYSTEM).toContain('{"drills":[');
		expect(DRILL_SYSTEM).toContain('Scala 3');
		expect(REVIEW_SYSTEM).toContain('{"reviews":[');
	});
});

describe('parseDrills', () => {
	it('accepts the catalog exemplar shape (happy path)', () => {
		const ex = exemplarCheck;
		const r = JSON.stringify({
			drills: [{
				code: 'List(1, 2).map(_ + 1).reduce(_ * _)',
				verify: 'List(1, 2).map(_ + 1).reduce(_ * _) // => 6',
				prompt: { ko: ex.prompt, en: 'Result? Count the `_`.' },
				options: opts(['6', '컴파일 오류', 'List(2, 3)', '3']),
				slip: null
			}]
		});
		const d = parseDrills(r, input());
		expect(d).toHaveLength(1);
		expect(d[0].options[0].text).toEqual({ ko: '6', en: '6' });
		expect(d[0].slip).toBeNull();
	});
	it('reads fenced and prose-wrapped replies, and a bare array', () => {
		const body = reply(good());
		expect(parseDrills('```json\n' + body + '\n```', input())).toHaveLength(1);
		expect(parseDrills('Here you go:\n' + body + '\nHope it helps.', input())).toHaveLength(1);
		expect(parseDrills('Sure!\n```\n' + body + '\n```\nDone', input())).toHaveLength(1);
		expect(parseDrills(JSON.stringify([good()]), input())).toHaveLength(1);
	});
	it('returns [] for nonsense', () => {
		expect(parseDrills('no json', input())).toEqual([]);
		expect(parseDrills('{"drills": 3}', input())).toEqual([]);
		expect(parseDrills('{"drills": []}', input())).toEqual([]);
		expect(parseDrills('{"drills": [1, null, "x"]}', input())).toEqual([]);
	});
	it('keeps valid items next to invalid ones and caps at count', () => {
		const a = good();
		const b = good({ code: 'val ys = List(2, 3)\nys.map(_ + 1).reduce(_ * _)', verify: 'val ys = List(2, 3)\nys.map(_ + 1).reduce(_ * _) // => 12', options: opts(['12', '컴파일 오류', 'List(3, 4)', '7']) });
		const c = good({ code: 'val zs = List(1, 1)\nzs.map(_ + 1).reduce(_ * _)', verify: 'val zs = List(1, 1)\nzs.map(_ + 1).reduce(_ * _) // => 4', options: opts(['4', '컴파일 오류', 'List(2, 2)', '2']) });
		expect(parseDrills(reply(a, { nope: 1 }, b), input())).toHaveLength(2);
		expect(parseDrills(reply(a, b, c), input({ count: 2 }))).toHaveLength(2);
	});
	it('trims strings and normalises the drill', () => {
		const [d] = parseDrills(reply(good({ code: '\n' + good().code + '\n\n' })), input());
		expect(d.code).toBe(good().code);
	});

	const rejects: [string, Record<string, unknown>][] = [
		['code with a comment', { code: 'val xs = List(1)\nxs.sum // total', verify: 'val xs = List(1)\nxs.sum // => 1', options: opts(['1', '2', '3', '4']) }],
		['code over 8 lines', { code: Array.from({ length: 9 }, (_, i) => `val a${i} = ${i}`).join('\n'), verify: Array.from({ length: 9 }, (_, i) => `val a${i} = ${i}`).join('\n') + '\na0 // => 24' }],
		['code over 400 chars', { code: `val s = "${'x'.repeat(400)}"\ns.length`, verify: `val s = "${'x'.repeat(400)}"\ns.length // => 24` }],
		['empty code', { code: '  ' }],
		['missing prompt locale', { prompt: { ko: '결과는?', en: '' } }],
		['multi-line prompt', { prompt: { ko: '결과는?\n둘째', en: 'What?' } }],
		['three options', { options: opts(['24', '1', '2']) }],
		['five options', { options: opts(['24', '1', '2', '3', '4']) }],
		['empty why', { options: [{ text: { ko: '24', en: '24' }, why: { ko: '', en: 'x' } }, ...opts(['1', '2', '3']).map((o) => o)] }],
		['duplicate option text', { options: opts(['24', '1', '1', '2']) }],
		['verify without arrow', { verify: 'val xs = List(1, 2, 3)\nxs.map(_ + 1).reduce(_ * _)' }],
		['verify with two arrows', { verify: 'val xs = List(1, 2, 3) // => List(1, 2, 3)\nxs.map(_ + 1).reduce(_ * _) // => 24' }],
		['verify value differs from option 0', { verify: 'val xs = List(1, 2, 3)\nxs.map(_ + 1).reduce(_ * _) // => 25' }],
		['option 0 differs between locales', { options: [{ text: { ko: '24', en: '25' }, why: { ko: 'ㄱ', en: 'a' } }, ...opts(['1', '2', '3'])] }],
		['code line missing from verify', { verify: 'val xs = List(1, 2, 3)\nxs.map(_ + 2).reduce(_ * _) // => 24' }],
		['prompt names the answer', { prompt: { ko: '24가 되는 이유는?', en: 'What is the result?' } }],
		['prompt names the answer (en)', { prompt: { ko: '결과는?', en: 'Does this give 24?' } }],
		['slip on a non-compile pattern', { slip: 'xs.map(_ * _)' }]
	];
	for (const [name, over] of rejects) it(`drops: ${name}`, () => expect(parseDrills(reply(good(over)), input())).toEqual([]));

	it('allows the answer value inside a longer token in the prompt', () => {
		expect(parseDrills(reply(good({ prompt: { ko: '결과는? (2024년식)', en: 'Result? (list24)' } })), input())).toHaveLength(1);
	});
	it('drops repeats: existing, exemplar, and within the reply', () => {
		expect(parseDrills(reply(good()), input({ existing: ['val xs = List(1, 2, 3)\n  xs.map(_ + 1).reduce(_ * _)'] }))).toEqual([]);
		const ex = good({ code: exemplarCheck.code, verify: exemplarCheck.verify, options: opts(['18', '컴파일 오류', 'List(4, 6, 8)', '9']) });
		expect(parseDrills(reply(ex), input())).toEqual([]);
		expect(parseDrills(reply(good(), good()), input())).toHaveLength(1);
	});
	it('works without an exemplar', () => {
		expect(parseDrills(reply(good()), input({ exemplar: null }))).toHaveLength(1);
	});

	describe('compile patterns', () => {
		const c = (over: Record<string, unknown> = {}) => good({ slip: 'val xs = List(1, 2, 3)\nxs.map(_ + _).reduce(_ * _)', ...over });
		it('requires a slip that differs from the code', () => {
			expect(parseDrills(reply(c()), input({}, 'compile'))).toHaveLength(1);
			expect(parseDrills(reply(c()), input({}, 'compile'))[0].slip).toContain('_ + _');
			expect(parseDrills(reply(good()), input({}, 'compile'))).toEqual([]);
			expect(parseDrills(reply(c({ slip: '' })), input({}, 'compile'))).toEqual([]);
			expect(parseDrills(reply(c({ slip: good().code })), input({}, 'compile'))).toEqual([]);
			expect(parseDrills(reply(c({ slip: '  ' + good().code.replace('\n', '\n   ') })), input({}, 'compile'))).toEqual([]);
		});
		it('accepts a missing slip on a non-compile pattern', () => {
			const { slip: _slip, ...rest } = good();
			expect(parseDrills(reply(rest), input())).toHaveLength(1);
		});
	});
});

describe('review', () => {
	const drills = (): Drill[] => parseDrills(reply(
		good(),
		good({ code: 'val ys = List(2, 3)\nys.map(_ + 1).reduce(_ * _)', verify: 'val ys = List(2, 3)\nys.map(_ + 1).reduce(_ * _) // => 12', options: opts(['12', '컴파일 오류', 'List(3, 4)', '7']) })
	), input());
	const seeds = ['seed-a', 'seed-b'];
	type Shown = { index: number; code: string; options: { ko: string; en: string }[] };
	const shown = (s = seeds) => (JSON.parse(reviewPrompt(drills(), s)) as { drills: Shown[] }).drills;
	/** What a perfect reviewer answers: the displayed position of the value that verify shows. */
	const perfect = (s = seeds) => shown(s).map((d, i) => ({ index: i, answer: d.options.findIndex((o) => o.ko === drills()[i].options[0].text.ko), ambiguous: false, reason: 'ok' }));

	it('reviewPrompt hides answers and why, and is deterministic', () => {
		const p = reviewPrompt(drills(), seeds);
		expect(p).toBe(reviewPrompt(drills(), seeds));
		expect(p).not.toContain('이유');
		expect(p).not.toContain('Reason');
		expect(p).not.toContain('verify');
		expect(p).not.toContain('=> 24');
		const parsed = shown();
		expect(parsed).toHaveLength(2);
		expect(parsed[0].options.map((o) => o.ko).sort()).toEqual(['24', '6', 'List(2, 3, 4)', '컴파일 오류'].sort());
	});
	it('shuffles per seed, not always in the original order', () => {
		const orders = new Set<string>();
		for (let i = 0; i < 12; i++) orders.add(shown([`s${i}`, 'x'])[0].options.map((o) => o.ko).join('|'));
		expect(orders.size).toBeGreaterThan(3);
		expect(shown(['same', 'x'])[0].options).toEqual(shown(['same', 'y'])[0].options);
	});
	it('maps the displayed answer back through the same seed', () => {
		const r = parseReview(JSON.stringify({ reviews: perfect() }), drills(), seeds);
		expect(r).toEqual([{ index: 0, ok: true, reason: 'ok' }, { index: 1, ok: true, reason: 'ok' }]);
		// a different seed would map the same displayed positions to other options
		let differs = false;
		for (let i = 0; i < 12 && !differs; i++) differs = parseReview(JSON.stringify({ reviews: perfect() }), drills(), [`other${i}`, 'seed-b'])[0].ok === false;
		expect(differs).toBe(true);
	});
	it('marks a wrong answer or an ambiguous one as not ok', () => {
		const p = perfect();
		const wrong = { ...p[1], answer: (p[1].answer + 1) % 4 };
		const r = parseReview(JSON.stringify({ reviews: [{ ...p[0], ambiguous: true, reason: 'two fit' }, wrong] }), drills(), seeds);
		expect(r.map((x) => x.ok)).toEqual([false, false]);
		expect(r[0].reason).toBe('two fit');
		expect(r[1].reason).not.toBe('');
	});
	it('treats missing, malformed, out of range and duplicate entries conservatively', () => {
		const p = perfect();
		expect(parseReview(JSON.stringify({ reviews: [p[0]] }), drills(), seeds).map((x) => x.ok)).toEqual([true, false]);
		expect(parseReview(JSON.stringify({ reviews: [{ ...p[0], answer: 7 }, { ...p[1], ambiguous: 'no' }] }), drills(), seeds).map((x) => x.ok)).toEqual([false, false]);
		expect(parseReview(JSON.stringify({ reviews: [{ ...p[0], answer: '1' }, { index: 5, answer: 0, ambiguous: false }] }), drills(), seeds).map((x) => x.ok)).toEqual([false, false]);
		const bad = { ...p[0], answer: (p[0].answer + 1) % 4 };
		expect(parseReview(JSON.stringify({ reviews: [bad, p[0], p[1]] }), drills(), seeds).map((x) => x.ok)).toEqual([false, true]);
		expect(parseReview('garbage', drills(), seeds).map((x) => x.ok)).toEqual([false, false]);
		expect(parseReview('{"reviews":"x"}', drills(), seeds)).toHaveLength(2);
	});
	it('reads fenced and prose-wrapped replies', () => {
		const body = JSON.stringify({ reviews: perfect() });
		expect(parseReview('```json\n' + body + '\n```', drills(), seeds).every((x) => x.ok)).toBe(true);
		expect(parseReview('Solved:\n' + body, drills(), seeds).every((x) => x.ok)).toBe(true);
	});
});

describe('drillCheck', () => {
	const [d] = parseDrills(reply(good({
		prompt: { ko: '결과는?', en: 'What is the result?' },
		options: [
			{ text: { ko: '24', en: '24' }, why: { ko: '맞습니다.', en: 'Right.' } },
			{ text: { ko: '컴파일 오류', en: 'Compile error' }, why: { ko: '오류가 아닙니다.', en: 'It compiles.' } },
			{ text: { ko: 'List(2, 3, 4)', en: 'List(2, 3, 4)' }, why: { ko: '접습니다.', en: 'It folds.' } },
			{ text: { ko: '6', en: '6' }, why: { ko: '먼저 더합니다.', en: 'Add first.' } }
		]
	})), input());
	it('builds a trace check in either locale', () => {
		const ko = drillCheck(d, 7, 'placeholder', 'collections', 'ko');
		expect(ko).toMatchObject({ id: 'drill-7', kind: 'trace', topic: 'collections', debrief: 'placeholder', answer: 0, unlock: [], code: d.code, verify: d.verify, prompt: '결과는?' });
		expect(ko.options).toHaveLength(4);
		expect(ko.options[1]).toEqual({ text: '컴파일 오류', why: '오류가 아닙니다.' });
		const en = drillCheck(d, 7, 'placeholder', 'collections', 'en');
		expect(en.prompt).toBe('What is the result?');
		expect(en.options[1]).toEqual({ text: 'Compile error', why: 'It compiles.' });
		expect(en.options[0].text).toBe(ko.options[0].text);
	});
	it('has the same shape as a catalog check', () => {
		expect(Object.keys(drillCheck(d, 1, 'p', 'collections', 'en')).sort()).toEqual(Object.keys(exemplarCheck).sort());
	});
});
