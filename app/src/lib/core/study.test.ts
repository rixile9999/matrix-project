import { describe, expect, it } from 'vitest';
import { groupStages, nextUnpassed, struggled, suggestWarmup, type StudyProblem, type StudySession } from './study.ts';

const P = (id: string, level: 1 | 2 | 3, topic: StudyProblem['topic'], passedAt: number | null = null): StudyProblem => ({ id, level, topic, passedAt });
const S = (o: Partial<StudySession>): StudySession => ({ level: 2, topic: 'maps', endedAt: 100, hintsUsed: 0, outcome: 'passed', overtime: false, ...o });

describe('struggled', () => {
	it('flags two hints, overtime and reveal only', () => {
		expect(struggled(S({}))).toBe(false);
		expect(struggled(S({ hintsUsed: 1 }))).toBe(false);
		expect(struggled(S({ hintsUsed: 2 }))).toBe(true);
		expect(struggled(S({ overtime: true }))).toBe(true);
		expect(struggled(S({ outcome: 'revealed' }))).toBe(true);
	});
});

describe('suggestWarmup', () => {
	const ps = [P('a', 1, 'syntax'), P('b', 1, 'maps'), P('c', 1, 'maps'), P('d', 2, 'maps')];
	it('prefers the topic of the latest struggled level-2 session', () => {
		const ss = [S({ topic: 'syntax', hintsUsed: 2, endedAt: 50 }), S({ topic: 'maps', outcome: 'revealed', endedAt: 90 })];
		expect(suggestWarmup(ps, ss)).toBe('b');
	});
	it('ignores clean sessions and level-1/3 sessions', () => {
		const ss = [S({ topic: 'maps' }), S({ topic: 'maps', level: 1, hintsUsed: 2 }), S({ topic: 'maps', level: 3, hintsUsed: 2 })];
		expect(suggestWarmup(ps, ss)).toBe('a');
	});
	it('falls back to the first unpassed when the topic has none left', () => {
		const done = [P('a', 1, 'syntax'), P('b', 1, 'maps', 5)];
		expect(suggestWarmup(done, [S({ topic: 'maps', hintsUsed: 2 })])).toBe('a');
	});
	it('picks the one passed longest ago when all are passed', () => {
		expect(suggestWarmup([P('a', 1, 'syntax', 30), P('b', 1, 'maps', 10), P('c', 1, 'maps', 20)], [])).toBe('b');
	});
	it('is null without level-1 problems', () => expect(suggestWarmup([P('d', 2, 'maps')], [])).toBeNull());
});

describe('nextUnpassed', () => {
	const ps = [P('a', 2, 'syntax', 1), P('b', 2, 'maps'), P('c', 3, 'maps'), P('d', 2, 'maps')];
	it('takes the first unpassed of the level in order', () => {
		expect(nextUnpassed(ps, 2)).toBe('b');
		expect(nextUnpassed(ps, 3)).toBe('c');
		expect(nextUnpassed(ps, 1)).toBeNull();
	});
});

describe('groupStages', () => {
	const c = (name: string, status: 'ok' | 'fail' = 'ok') => ({ name, status, detail: '' });
	it('groups by stage in first-appearance order, even when interleaved', () => {
		const g = groupStages([c('1단계 토큰화 › a'), c('2단계 파싱 › b', 'fail'), c('1단계 토큰화 › c'), c('2단계 파싱 › d')]);
		expect(g.map((x) => [x.stage, x.ok, x.cases.length])).toEqual([['1단계 토큰화', 2, 2], ['2단계 파싱', 1, 2]]);
		expect(g[0].cases.map((x) => x.name)).toEqual(['a', 'c']);
	});
	it('keeps unstaged names as they are', () => {
		const g = groupStages([c('x'), c('y', 'fail'), c('s › z')]);
		expect(g.map((x) => x.stage)).toEqual([null, 's']);
		expect(g[0].cases.map((x) => x.name)).toEqual(['x', 'y']);
	});
	it('splits only at the first separator', () => expect(groupStages([c('s › a › b')])[0].cases[0].name).toBe('a › b'));
});
