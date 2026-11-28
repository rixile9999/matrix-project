import { describe, expect, it } from 'vitest';
import {
	DESCENT_SYSTEM,
	MAX_DEPTH,
	SAY_MAX,
	allowed,
	parseReply,
	phase,
	reduce,
	turnPrompt,
	validate,
	type Candidates,
	type Frame,
	type Pending,
	type State,
	type TurnInput
} from './descent.ts';

const frame = (id: number, depth: number, over: Partial<Frame> = {}): Frame => ({ id, problemId: `p${id}`, depth, status: 'solving', overtime: false, gap: null, ...over });
const st = (stack: Frame[] = [], pending: Pending = null): State => ({ stack, pending });
const C: Candidates = { pose: ['a', 'b'], offer: ['s1', 's2'] };
const NONE: Candidates = { pose: [], offer: [] };

const idle = st();
const solving = st([frame(1, 0)]);
const stuckOvertime = st([frame(1, 0, { overtime: true })]);
const stuckFailed = st([frame(1, 0, { status: 'failed' })]);
const floorState = st([frame(1, 0, { status: 'held' }), frame(2, 1, { status: 'held' }), frame(3, 2, { status: 'held' }), frame(4, 3, { overtime: true })]);
const passedRoot = st([frame(1, 0, { status: 'passed' })]);
const passedSub = st([frame(1, 0, { status: 'held' }), frame(2, 1, { status: 'passed' })]);
const offered = st([frame(1, 0, { overtime: true })], { kind: 'descend', problemId: 's1', gap: 'zip' });
const ascendOffer = st([frame(1, 0, { status: 'held' }), frame(2, 1, { status: 'passed' })], { kind: 'ascend' });

describe('phase', () => {
	it('derives the phase from the stack', () => {
		expect(phase(idle)).toBe('idle');
		expect(phase(solving)).toBe('solving');
		expect(phase(stuckOvertime)).toBe('stuck');
		expect(phase(stuckFailed)).toBe('stuck');
		expect(phase(floorState)).toBe('floor');
		expect(phase(st([frame(1, MAX_DEPTH, { status: 'failed' })]))).toBe('floor');
		expect(phase(passedRoot)).toBe('passed');
		expect(phase(passedSub)).toBe('passed');
		expect(phase(offered)).toBe('offered');
		expect(phase(ascendOffer)).toBe('passed');
	});
});

describe('allowed', () => {
	it('per phase', () => {
		expect(allowed(idle, C)).toEqual(['say', 'pose']);
		expect(allowed(solving, C)).toEqual(['say', 'hint']);
		expect(allowed(stuckOvertime, C)).toEqual(['say', 'hint', 'offer']);
		expect(allowed(stuckFailed, C)).toEqual(['say', 'hint', 'offer']);
		expect(allowed(floorState, C)).toEqual(['say', 'hint', 'example']);
		expect(allowed(offered, C)).toEqual(['say']);
		expect(allowed(passedRoot, C)).toEqual(['say', 'pose']);
		expect(allowed(passedSub, C)).toEqual(['say', 'ascend']);
		expect(allowed(ascendOffer, C)).toEqual(['say']);
	});
	it('stuck without offer candidates has no offer, and never pose', () => {
		expect(allowed(stuckOvertime, NONE)).toEqual(['say', 'hint']);
		for (const s of [solving, stuckOvertime, floorState, offered, passedSub]) expect(allowed(s, C)).not.toContain('pose');
	});
	it('floor never offers a descent', () => {
		expect(allowed(floorState, C)).not.toContain('offer');
	});
});

describe('validate', () => {
	it('keeps a legal action', () => {
		expect(validate({ say: 'Try it?', action: { type: 'offer', problemId: 's1', gap: ' zip ' } }, stuckOvertime, C)).toEqual({
			say: 'Try it?',
			action: { type: 'offer', problemId: 's1', gap: 'zip' }
		});
		expect(validate({ say: 'x', action: { type: 'pose', problemId: 'a' } }, idle, C).action).toEqual({ type: 'pose', problemId: 'a' });
		expect(validate({ say: 'x', action: { type: 'hint' } }, solving, C).action).toEqual({ type: 'hint' });
		expect(validate({ say: 'x', action: { type: 'ascend' } }, passedSub, C).action).toEqual({ type: 'ascend' });
		expect(validate({ say: 'x', action: { type: 'example' } }, floorState, C).action).toEqual({ type: 'example' });
	});
	it('drops an action that is not allowed in the phase', () => {
		expect(validate({ say: 'x', action: { type: 'offer', problemId: 's1', gap: 'zip' } }, solving, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'offer', problemId: 's1', gap: 'zip' } }, floorState, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'offer', problemId: 's1', gap: 'zip' } }, stuckOvertime, NONE).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'pose', problemId: 'a' } }, stuckOvertime, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'example' } }, stuckOvertime, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'ascend' } }, passedRoot, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'hint' } }, offered, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'ascend' } }, ascendOffer, C).action).toEqual({ type: 'say' });
	});
	it('drops ids outside the candidate lists', () => {
		expect(validate({ say: 'x', action: { type: 'pose', problemId: 'zzz' } }, idle, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: { type: 'offer', problemId: 'a', gap: 'zip' } }, stuckOvertime, C).action).toEqual({ type: 'say' }); // a pose id
		expect(validate({ say: 'x', action: { type: 'pose', problemId: 's1' } }, idle, C).action).toEqual({ type: 'say' }); // an offer id
	});
	it('checks the gap length', () => {
		const go = (gap: string) => validate({ say: 'x', action: { type: 'offer', problemId: 's1', gap } }, stuckOvertime, C).action.type;
		expect(go('z')).toBe('say');
		expect(go('  z ')).toBe('say');
		expect(go('zi')).toBe('offer');
		expect(go('a'.repeat(40))).toBe('offer');
		expect(go('a'.repeat(41))).toBe('say');
		expect(go('')).toBe('say');
	});
	it('drops garbage actions', () => {
		expect(validate({ say: 'x', action: { type: 'nuke' } as never }, idle, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 'x', action: null as never }, idle, C).action).toEqual({ type: 'say' });
		expect(validate({ say: 5 as never, action: { type: 'say' } }, idle, C)).toEqual({ say: '', action: { type: 'say' } });
	});
	it('does not carry extra fields', () => {
		const r = validate({ say: 'x', action: { type: 'hint', problemId: 'a', solution: 'leak' } as never }, solving, C);
		expect(r.action).toEqual({ type: 'hint' });
	});
	it('makes say one trimmed paragraph within SAY_MAX', () => {
		expect(validate({ say: '  one\n\ntwo \t three  ', action: { type: 'say' } }, idle, C).say).toBe('one two three');
		const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
		const cut = validate({ say: long, action: { type: 'say' } }, idle, C).say;
		expect(cut.length).toBeLessThanOrEqual(SAY_MAX);
		expect(cut.endsWith('…')).toBe(true);
		expect(long.startsWith(cut.slice(0, -1))).toBe(true);
		expect(/word\d+…$/.test(cut)).toBe(true); // ends on a whole word
		const noSpaces = validate({ say: 'ㄱ'.repeat(400), action: { type: 'say' } }, idle, C).say;
		expect(noSpaces.length).toBeLessThanOrEqual(SAY_MAX);
		const exact = 'a'.repeat(SAY_MAX);
		expect(validate({ say: exact, action: { type: 'say' } }, idle, C).say).toBe(exact);
	});
	it('does not split a surrogate pair', () => {
		const out = validate({ say: '😀'.repeat(200), action: { type: 'say' } }, idle, C).say;
		expect(out.length).toBeLessThanOrEqual(SAY_MAX);
		expect(out.slice(0, -1)).toMatch(/^(?:😀)+$/u);
	});
});

describe('parseReply', () => {
	const ok = { say: 'Try it?', action: { type: 'offer', problemId: 's1', gap: 'zip' } };
	it('parses plain JSON', () => {
		expect(parseReply(JSON.stringify(ok))).toEqual({ say: 'Try it?', action: { type: 'offer', problemId: 's1', gap: 'zip' } });
	});
	it('parses a fenced block', () => {
		expect(parseReply('```json\n' + JSON.stringify(ok) + '\n```')?.action.type).toBe('offer');
	});
	it('finds the object inside prose, braces in strings included', () => {
		const text = 'Sure, here it is: {"say":"use {x} here","action":{"type":"hint"}} hope that helps';
		expect(parseReply(text)).toEqual({ say: 'use {x} here', action: { type: 'hint' } });
	});
	it('accepts the action as a bare string', () => {
		expect(parseReply('{"say":"hm","action":"hint"}')).toEqual({ say: 'hm', action: { type: 'hint' } });
	});
	it('maps unknown or incomplete actions to say, keeping the text', () => {
		expect(parseReply('{"say":"a","action":{"type":"explode"}}')).toEqual({ say: 'a', action: { type: 'say' } });
		expect(parseReply('{"say":"a","action":{"type":"pose"}}')).toEqual({ say: 'a', action: { type: 'say' } });
		expect(parseReply('{"say":"a","action":{"type":"offer","problemId":"s1"}}')).toEqual({ say: 'a', action: { type: 'say' } });
		expect(parseReply('{"say":"a"}')).toEqual({ say: 'a', action: { type: 'say' } });
	});
	it('keeps a valid action without text', () => {
		expect(parseReply('{"action":{"type":"hint"}}')).toEqual({ say: '', action: { type: 'hint' } });
	});
	it('returns null for nothing usable', () => {
		expect(parseReply('')).toBeNull();
		expect(parseReply('no json here')).toBeNull();
		expect(parseReply('[1,2]')).toBeNull();
		expect(parseReply('{"say":"","action":{"type":"say"}}')).toBeNull();
		expect(parseReply('{"say": "unterminated')).toBeNull();
		expect(parseReply(null as never)).toBeNull();
	});
	it('roundtrips through validate', () => {
		const r = validate(parseReply(JSON.stringify(ok))!, stuckOvertime, C);
		expect(r.action).toEqual({ type: 'offer', problemId: 's1', gap: 'zip' });
	});
});

describe('reduce', () => {
	it('posed: opens a root from nothing or after a passed root', () => {
		const f = frame(1, 0);
		expect(reduce(idle, { type: 'posed', frame: f })).toEqual({ stack: [f], pending: null });
		const g = frame(9, 0);
		expect(reduce(passedRoot, { type: 'posed', frame: g })).toEqual({ stack: [g], pending: null });
	});
	it('posed: impossible while solving, at depth > 0, or with a pending offer', () => {
		expect(reduce(solving, { type: 'posed', frame: frame(9, 0) })).toBe(solving);
		expect(reduce(idle, { type: 'posed', frame: frame(9, 1) })).toBe(idle);
		expect(reduce(passedSub, { type: 'posed', frame: frame(9, 0) })).toBe(passedSub);
	});
	it('offered: only when stuck', () => {
		expect(reduce(stuckOvertime, { type: 'offered', problemId: 's1', gap: 'zip' }).pending).toEqual({ kind: 'descend', problemId: 's1', gap: 'zip' });
		expect(reduce(stuckFailed, { type: 'offered', problemId: 's1', gap: 'zip' }).pending).not.toBeNull();
		for (const s of [idle, solving, floorState, passedRoot, offered]) expect(reduce(s, { type: 'offered', problemId: 's1', gap: 'zip' })).toBe(s);
	});
	it('accepted: holds the parent, pushes the sub frame, clears pending', () => {
		const sub = frame(2, 1, { gap: 'zip' });
		const next = reduce(offered, { type: 'accepted', frame: sub });
		expect(next.pending).toBeNull();
		expect(next.stack.map((f) => [f.id, f.status])).toEqual([
			[1, 'held'],
			[2, 'solving']
		]);
		expect(phase(next)).toBe('solving');
	});
	it('accepted: depth must be previous + 1 and <= MAX_DEPTH; needs an open offer', () => {
		expect(reduce(offered, { type: 'accepted', frame: frame(2, 2) })).toBe(offered);
		expect(reduce(offered, { type: 'accepted', frame: frame(2, 0) })).toBe(offered);
		expect(reduce(stuckOvertime, { type: 'accepted', frame: frame(2, 1) })).toBe(stuckOvertime);
		const deep = st([frame(4, MAX_DEPTH, { overtime: true })], { kind: 'descend', problemId: 'x', gap: 'gg' });
		expect(reduce(deep, { type: 'accepted', frame: frame(5, MAX_DEPTH + 1) })).toBe(deep);
	});
	it('declined: clears a descend offer only', () => {
		expect(reduce(offered, { type: 'declined' })).toEqual({ stack: offered.stack, pending: null });
		expect(reduce(ascendOffer, { type: 'declined' })).toBe(ascendOffer);
		expect(reduce(solving, { type: 'declined' })).toBe(solving);
	});
	it('run passed: top passed', () => {
		const next = reduce(solving, { type: 'run', passed: true, overtime: false });
		expect(next.stack[0].status).toBe('passed');
		expect(phase(next)).toBe('passed');
	});
	it('run failed: stays solving, records overtime', () => {
		const a = reduce(solving, { type: 'run', passed: false, overtime: false });
		expect(a.stack[0]).toMatchObject({ status: 'solving', overtime: false });
		const b = reduce(a, { type: 'run', passed: false, overtime: true });
		expect(b.stack[0]).toMatchObject({ status: 'solving', overtime: true });
		expect(phase(b)).toBe('stuck');
		expect(reduce(b, { type: 'run', passed: false, overtime: false }).stack[0].overtime).toBe(true); // time does not run backwards
	});
	it('run passed after the limit still passes (overtime recorded)', () => {
		const next = reduce(solving, { type: 'run', passed: true, overtime: true });
		expect(next.stack[0]).toMatchObject({ status: 'passed', overtime: true });
	});
	it('run: ignored when there is no solving top', () => {
		for (const s of [idle, passedRoot, stuckFailed]) expect(reduce(s, { type: 'run', passed: true, overtime: false })).toBe(s);
	});
	it('revealed: top fails', () => {
		const next = reduce(solving, { type: 'revealed' });
		expect(next.stack[0].status).toBe('failed');
		expect(phase(next)).toBe('stuck');
		expect(phase(reduce(st([frame(4, MAX_DEPTH)]), { type: 'revealed' }))).toBe('floor');
		expect(reduce(idle, { type: 'revealed' })).toBe(idle);
		expect(reduce(passedRoot, { type: 'revealed' })).toBe(passedRoot);
	});
	it('ascendOffered: only after a sub-problem passed', () => {
		expect(reduce(passedSub, { type: 'ascendOffered' }).pending).toEqual({ kind: 'ascend' });
		expect(reduce(passedRoot, { type: 'ascendOffered' })).toBe(passedRoot);
		expect(reduce(solving, { type: 'ascendOffered' })).toBe(solving);
		expect(reduce(ascendOffer, { type: 'ascendOffered' })).toBe(ascendOffer);
	});
	it('ascended: pops the top, parent solving again with a fresh clock', () => {
		const held = st([frame(1, 0, { status: 'held', overtime: true }), frame(2, 1, { status: 'passed' })], { kind: 'ascend' });
		const next = reduce(held, { type: 'ascended' });
		expect(next.pending).toBeNull();
		expect(next.stack).toEqual([{ ...held.stack[0], status: 'solving', overtime: false }]);
		expect(reduce(passedSub, { type: 'ascended' })).toBe(passedSub); // no ascend offer
		expect(reduce(st([frame(1, 0, { status: 'passed' })], { kind: 'ascend' }), { type: 'ascended' }).stack).toHaveLength(1); // nothing to pop to
	});
	it('stay: clears an ascend offer only', () => {
		expect(reduce(ascendOffer, { type: 'stay' })).toEqual({ stack: ascendOffer.stack, pending: null });
		expect(reduce(offered, { type: 'stay' })).toBe(offered);
	});
	it('closed: clears everything', () => {
		expect(reduce(offered, { type: 'closed' })).toEqual({ stack: [], pending: null });
		expect(reduce(idle, { type: 'closed' })).toEqual({ stack: [], pending: null });
	});
	it('never mutates its input', () => {
		const snap = JSON.stringify(offered);
		reduce(offered, { type: 'accepted', frame: frame(2, 1) });
		reduce(offered, { type: 'closed' });
		expect(JSON.stringify(offered)).toBe(snap);
	});
	it('full path: pose, fail past the limit, offer, accept, pass, ascend', () => {
		let s = reduce(idle, { type: 'posed', frame: frame(1, 0) });
		s = reduce(s, { type: 'run', passed: false, overtime: false });
		expect(phase(s)).toBe('solving');
		expect(allowed(s, C)).not.toContain('offer');
		s = reduce(s, { type: 'run', passed: false, overtime: true });
		expect(allowed(s, C)).toContain('offer');
		s = reduce(s, { type: 'offered', problemId: 's1', gap: 'zip' });
		expect(phase(s)).toBe('offered');
		s = reduce(s, { type: 'accepted', frame: frame(2, 1, { gap: 'zip' }) });
		s = reduce(s, { type: 'run', passed: true, overtime: false });
		expect(allowed(s, C)).toEqual(['say', 'ascend']);
		s = reduce(s, { type: 'ascendOffered' });
		expect(allowed(s, C)).toEqual(['say']);
		s = reduce(s, { type: 'ascended' });
		expect(s.stack).toHaveLength(1);
		expect(s.stack[0]).toMatchObject({ id: 1, status: 'solving', overtime: false });
	});
	it('reaches the floor after three descents', () => {
		let s = st([frame(1, 0, { overtime: true })]);
		for (let d = 1; d <= MAX_DEPTH; d++) {
			s = reduce(s, { type: 'offered', problemId: `s${d}`, gap: 'gap' });
			s = reduce(s, { type: 'accepted', frame: frame(d + 1, d) });
			s = reduce(s, { type: 'run', passed: false, overtime: true });
		}
		expect(s.stack).toHaveLength(MAX_DEPTH + 1);
		expect(phase(s)).toBe('floor');
		expect(reduce(s, { type: 'offered', problemId: 'x', gap: 'gap' })).toBe(s);
		expect(allowed(s, C)).toEqual(['say', 'hint', 'example']);
	});
});

describe('prompts', () => {
	it('system prompt differs by locale in the output language only', () => {
		const ko = DESCENT_SYSTEM('ko');
		const en = DESCENT_SYSTEM('en');
		expect(ko).toContain('Korean');
		expect(ko).toContain('풀어 볼래요?');
		expect(en).toContain('English');
		expect(en).not.toContain('Write `say` in Korean');
		for (const s of [ko, en]) {
			expect(s).toContain('"say"');
			expect(s).toContain('allowed');
			expect(s).toContain('problem.solution');
			expect(s).toContain('gap');
			expect(s).toContain('140');
		}
	});
	it('turnPrompt is the JSON of the input', () => {
		const input: TurnInput = {
			phase: 'idle',
			allowed: ['say', 'pose'],
			trail: [],
			memory: [],
			candidates: { pose: [{ id: 'a', title: 'A', topic: 't', level: 1, targets: ['x'] }], offer: [] },
			problem: null,
			history: [],
			said: null,
			trigger: 'start'
		};
		expect(JSON.parse(turnPrompt(input))).toEqual(input);
	});
});
