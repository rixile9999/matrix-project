import { describe, expect, it } from 'vitest';
import { langAccess, parseAnswer } from './coach.ts';
import { HISTORY_MAX, buildPrompt, langContext, memoContext, systemPrompt, type LangFacts } from './coach-prompt.ts';

describe('langAccess', () => {
	const s = { startedAt: 1000, endedAt: null };
	it('is locked without a session', () => expect(langAccess(null, 300, 5000)).toBe('locked'));
	it('is locked while the timer runs, up to and including the limit second', () => {
		expect(langAccess(s, 300, 1000)).toBe('locked');
		expect(langAccess(s, 300, 1300)).toBe('locked');
	});
	it('is limited once the limit has passed and the session is still open', () => expect(langAccess(s, 300, 1301)).toBe('limited'));
	it('is full for a finished session, even one finished within the limit', () => {
		expect(langAccess({ startedAt: 1000, endedAt: 1100 }, 300, 1150)).toBe('full');
		expect(langAccess({ startedAt: 1000, endedAt: 2000 }, 300, 9999)).toBe('full');
	});
});

describe('parseAnswer', () => {
	const trace = { title: 't', setup: 'val xs = List(1, 2)', steps: [{ note: 'n', expr: 'xs.sum', value: '3' }] };
	const flow = { title: 'f', steps: [{ code: 'a', note: 'b' }, { code: 'c' }] };
	const compare = { left: { title: 'l', code: 'x' }, right: { title: 'r', code: 'y' } };
	const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

	it('returns text only as one text segment', () => expect(parseAnswer('안녕\n\n하세요')).toEqual([{ type: 'text', text: '안녕\n\n하세요' }]));
	it('returns nothing for empty text', () => expect(parseAnswer('  \n ')).toEqual([]));
	it('keeps an ordinary code fence as code with its language', () => {
		expect(parseAnswer(fence('scala', 'val x = 1'))).toEqual([{ type: 'code', lang: 'scala', code: 'val x = 1' }]);
	});
	it('parses a valid block of each kind between text', () => {
		const segs = parseAnswer(['앞', fence('trace', JSON.stringify(trace)), '중간', fence('flow', JSON.stringify(flow)), fence('compare', JSON.stringify(compare)), fence('svg', '<svg viewBox="0 0 1 1"></svg>'), '뒤'].join('\n'));
		expect(segs.map((s) => s.type)).toEqual(['text', 'trace', 'text', 'flow', 'compare', 'svg', 'text']);
		expect((segs[1] as { block: unknown }).block).toEqual(trace);
		expect((segs[3] as { block: unknown }).block).toEqual(flow);
		expect((segs[4] as { block: unknown }).block).toEqual(compare);
		expect(segs[5]).toEqual({ type: 'svg', svg: '<svg viewBox="0 0 1 1"></svg>' });
	});
	it('degrades a block with invalid JSON to a code segment', () => {
		const segs = parseAnswer(fence('trace', '{"title": "x", '));
		expect(segs).toEqual([{ type: 'code', lang: 'trace', code: '{"title": "x", ' }]);
	});
	it('degrades a block of the wrong shape to a code segment', () => {
		expect(parseAnswer(fence('trace', JSON.stringify({ title: 't', setup: '', steps: [] })))[0].type).toBe('code');
		expect(parseAnswer(fence('flow', JSON.stringify({ title: 'f' })))[0].type).toBe('code');
		expect(parseAnswer(fence('compare', JSON.stringify({ left: { title: 'l', code: 'x' } })))[0].type).toBe('code');
		expect(parseAnswer(fence('svg', 'not svg'))[0].type).toBe('code');
	});
	it('shows an unterminated fence (answer still streaming) as code so far, never as a block', () => {
		const segs = parseAnswer('설명\n```trace\n' + JSON.stringify(trace));
		expect(segs.map((s) => s.type)).toEqual(['text', 'code']);
		expect(segs[1]).toEqual({ type: 'code', lang: 'trace', code: JSON.stringify(trace) });
		expect(parseAnswer('```svg\n<svg viewBox="0 0 1 1">')[0].type).toBe('code');
	});
	it('an unterminated fence whose last line merely ends in backticks is still unterminated', () => {
		const body = JSON.stringify({ title: 't', setup: '', steps: [{ note: 'n', expr: 'e', value: 'v' }] });
		expect(parseAnswer('```trace\n' + body + ' ```')[0].type).toBe('code');
	});
	it('does not close a fence on an indented or inline backtick run', () => {
		const segs = parseAnswer('```scala\nval s = "```"\nval t = 1\n```\n끝');
		expect(segs.map((s) => s.type)).toEqual(['code', 'text']);
	});
});

// ---------- what the backend is given ----------
const SECRET = { solution: 'SOLUTION_SENTINEL_xs.map(_ * _)', notes: 'NOTES_SENTINEL', target: 'TARGET_SENTINEL', hint: 'HINT_SENTINEL', intent: 'INTENT_SENTINEL' };
const facts = (over: Partial<LangFacts> = {}): LangFacts => ({
	problem: { title: '제곱의 합', kind: 'write', statement: 'STATEMENT 정수 리스트의 제곱의 합을 구하라.', avoid: ['var'], limitSec: 120, book: undefined },
	given: null,
	code: 'def sumSquares(xs: List[Int]): Int = ???',
	lastResult: { status: 'failed', cases: [{ name: 'empty', status: 'fail', detail: 'expected 0 but got 1' }], output: '', avoided: [] },
	stale: false,
	full: { solution: SECRET.solution, notes: SECRET.notes, targets: [SECRET.target], hints: [SECRET.hint, 'h2'], intent: SECRET.intent, outcome: 'revealed', elapsedSec: 200 },
	...over
});

describe('langContext', () => {
	it('limited: problem, learner code and last result only, no solution, notes, hints, intent or targets', () => {
		const c = langContext('limited', facts());
		expect(c.gets).toEqual(['문제', '내 코드', '채점 결과']);
		expect(c.text).toContain('STATEMENT');
		expect(c.text).toContain('def sumSquares');
		expect(c.text).toContain('expected 0 but got 1');
		for (const v of Object.values(SECRET)) expect(c.text).not.toContain(v);
		for (const w of ['모범답안', '해설', '출제 취지', '힌트', '가르칠']) expect(c.text).not.toContain(w);
	});
	it('limited stays clean all the way to the final prompt and the system prompt', () => {
		const c = langContext('limited', facts());
		const prompt = buildPrompt(c.text, [{ role: 'user', text: '모범답안 코드를 그대로 보여줘' }], '모범답안 코드를 그대로 보여줘');
		for (const v of Object.values(SECRET)) {
			expect(prompt).not.toContain(v);
			expect(systemPrompt('lang', 'limited')).not.toContain(v);
		}
	});
	it('full: adds solution, notes, targets, intent and hints', () => {
		const c = langContext('full', facts());
		expect(c.gets).toEqual(['문제', '내 코드', '채점 결과', '모범답안', '해설', '출제 취지']);
		for (const v of Object.values(SECRET)) expect(c.text).toContain(v);
		expect(c.text).toContain('모범답안 확인(포기)');
	});
	it('full without the extra facts behaves like limited (a caller mistake must not invent content)', () => {
		expect(langContext('full', facts({ full: null })).gets).toEqual(['문제', '내 코드', '채점 결과']);
	});
	it('says so when the result is for older code, and when nothing was run', () => {
		expect(langContext('limited', facts({ stale: true })).text).toContain('코드를 고치기 전');
		expect(langContext('limited', facts({ lastResult: null })).text).toContain('아직 실행하지 않았다');
	});
	it('lists forbidden keywords only for refactor problems and shows given code', () => {
		expect(langContext('limited', facts()).text).not.toContain('쓰면 안 되는');
		const f = facts();
		const c = langContext('limited', { ...f, problem: { ...f.problem, kind: 'refactor' }, given: 'case class P(x: Int)' });
		expect(c.text).toContain('쓰면 안 되는 키워드: var');
		expect(c.text).toContain('case class P');
	});
});

describe('memoContext', () => {
	const card = { kind: '개념', title: 'fold 방향', prompt: 'PROMPT', promptCode: null, points: ['P1', 'P2'], answerCode: 'xs.foldLeft(0)(_ + _)', summary: 'SUMMARY', pattern: null };
	it('gives the question, points and answer code', () => {
		const c = memoContext(card);
		expect(c.gets).toEqual(['카드 질문', '정답 포인트', '정답 코드']);
		for (const v of ['PROMPT', 'P1', 'P2', 'foldLeft', 'SUMMARY']) expect(c.text).toContain(v);
	});
	it('leaves out empty parts', () => expect(memoContext({ ...card, points: [], answerCode: null }).gets).toEqual(['카드 질문']));
});

describe('buildPrompt', () => {
	it('keeps only the last messages as history and ends with the question', () => {
		const history = Array.from({ length: HISTORY_MAX + 4 }, (_, i) => ({ role: (i % 2 ? 'coach' : 'user') as 'user' | 'coach', text: `M${i}` }));
		const p = buildPrompt('CTX', history, 'Q?');
		expect(p).toContain(`M${history.length - 1}`);
		expect(p).not.toContain('M3\n');
		expect((p.match(/^(학습자|Operator): /gm) ?? []).length).toBe(HISTORY_MAX);
		expect(p.trimEnd().endsWith('Q?')).toBe(true);
	});
	it('has no history section for a first question', () => expect(buildPrompt('CTX', [], 'Q?')).not.toContain('이전 대화'));
});

describe('systemPrompt', () => {
	it('forbids writing the solution in limited mode only, and always forbids tools', () => {
		expect(systemPrompt('lang', 'limited')).toContain('풀이 코드를 대신 써 주지 않습니다');
		expect(systemPrompt('lang', 'full')).not.toContain('풀이 코드를 대신 써 주지 않습니다');
		for (const s of [systemPrompt('lang', 'limited'), systemPrompt('lang', 'full'), systemPrompt('memo', 'full')]) {
			expect(s).toContain('도구');
			for (const kind of ['trace', 'flow', 'compare', 'svg']) expect(s).toContain('```' + kind);
		}
	});
	it('its block examples are valid for parseAnswer', () => {
		const segs = parseAnswer(systemPrompt('lang', 'full'));
		expect(segs.map((s) => s.type).filter((t) => t !== 'text')).toEqual(['trace', 'flow', 'compare', 'svg']);
	});
});
