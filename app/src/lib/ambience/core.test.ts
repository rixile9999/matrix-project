import { describe, expect, it } from 'vitest';
import {
	BEAT, BREATH, SCENE_PARAMS, bloomStep, easeParams, easeProgress, motifEvents, nextBreath, orbitProgress, pickBackdrop, rippleStep,
} from './core';

describe('easeParams', () => {
	it('moves toward the target without overshoot and settles', () => {
		let p = SCENE_PARAMS.home;
		for (let i = 0; i < 60 * 20; i++) p = easeParams(p, SCENE_PARAMS.run, 1 / 60);
		p.forEach((v, i) => expect(v).toBeCloseTo(SCENE_PARAMS.run[i], 3));
		const one = easeParams(SCENE_PARAMS.home, SCENE_PARAMS.run, 0.05);
		expect(one[2]).toBeLessThan(SCENE_PARAMS.home[2]);
		expect(one[2]).toBeGreaterThan(SCENE_PARAMS.run[2]);
	});
});

describe('bloom', () => {
	it('rises, switches its target off near the peak, then falls', () => {
		let b = { value: 0, target: 1 };
		let peaked = false;
		for (let i = 0; i < 60 * 10; i++) { b = bloomStep(b, 1 / 60); if (b.target === 0) peaked = true; }
		expect(peaked).toBe(true);
		expect(b.value).toBeLessThan(0.5);
	});
	it('the ripple travels once and ends idle', () => {
		let r = 0, steps = 0;
		while (r >= 0 && steps < 1000) { r = rippleStep(r, 0.1); steps++; }
		expect(r).toBe(-1);
		expect(steps).toBeGreaterThan(40);
		expect(rippleStep(-1, 1)).toBe(-1);
	});
});

describe('orbit progress', () => {
	it('is at rest when undefined, and clamps', () => {
		expect(orbitProgress('home', undefined)).toBe(0);
		expect(orbitProgress('result', undefined)).toBe(1);
		expect(orbitProgress('run', 1.4)).toBe(1);
		expect(orbitProgress('run', 0.4)).toBe(0.4);
	});
	it('eases forward and snaps on a reset', () => {
		expect(easeProgress(0.2, 0.4, 0.1)).toBeGreaterThan(0.2);
		expect(easeProgress(0.2, 0.4, 0.1)).toBeLessThan(0.4);
		expect(easeProgress(1, 0, 0.1)).toBe(0);
	});
});

describe('motif schedule (3+3+2)', () => {
	const ev = motifEvents(100);
	const plucks = ev.filter((e) => e.kind === 'pluck');
	it('has 4 bars x 6 plucks and thumps from bar 2', () => {
		expect(plucks).toHaveLength(24);
		expect(ev.filter((e) => e.kind === 'thump')).toHaveLength(12);
	});
	it('first bar hits at 3+3+2 twice in sixteenths', () => {
		const rel = plucks.slice(0, 6).map((e) => Math.round(((e.t - 100) / BEAT) * 2));
		expect(rel).toEqual([0, 3, 6, 8, 11, 14]);
	});
	it('ends inside 32 beats and levels rise then fall', () => {
		expect(Math.max(...ev.map((e) => e.t)) - 100).toBeLessThan(32 * BEAT);
		const bar = (i: number) => plucks[i * 6].peak;
		expect(bar(0)).toBeLessThan(bar(1));
		expect(bar(3)).toBeLessThan(bar(2));
	});
});

describe('nextBreath', () => {
	it('lands on a breath boundary after now', () => {
		const t = nextBreath(10, 10 + 25.2);
		expect((t - 10) % BREATH).toBeCloseTo(0, 9);
		expect(t).toBeGreaterThanOrEqual(10 + 25.2 + 0.1);
		expect(t).toBeLessThan(10 + 25.2 + 0.1 + BREATH);
	});
});

describe('pickBackdrop', () => {
	it('passes a fixed choice through', () => expect(pickBackdrop('earth', () => 0)).toBe('earth'));
	it('maps the rng onto the four', () => {
		expect(pickBackdrop('random', () => 0)).toBe('none');
		expect(pickBackdrop('random', () => 0.3)).toBe('earthrise');
		expect(pickBackdrop('random', () => 0.6)).toBe('blackhole');
		expect(pickBackdrop('random', () => 0.999)).toBe('earth');
		expect(pickBackdrop('random', () => 1)).toBe('earth');
	});
});
