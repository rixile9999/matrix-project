import { describe, expect, it } from 'vitest';
import { newScore, newSpacePattern } from './score';

describe('process score', () => {
	it('keeps two common voices on each harmonic change', () => {
		const score = newScore();
		let last = score.voicing();
		for (let i = 0; i < 200; i++) {
			const next = score.changeChord();
			expect(next.filter((n,j) => n === last[j])).toHaveLength(2);
			last = next;
		}
	});
	it('holds each pattern for four bars, adding a single onset at a time', () => {
		const score = newScore();
		const bar = () => Array.from({ length: 8 }, () => score.nextPulse());
		let previous = bar();
		expect(previous.flat()).toHaveLength(3);
		for (const count of [4, 5]) {
			for (let i = 0; i < 3; i++) expect(bar()).toEqual(previous);
			const next = bar();
			expect(next.flat()).toHaveLength(count);
			expect(next.filter((slot, i) => previous[i].length && slot[0].midi !== previous[i][0].midi)).toHaveLength(0);
			previous = next;
		}
	});
	it('displaces the upper copy on the pulse grid, then carries one pitch change into the next cycle', () => {
		const score = newScore();
		const bars = Array.from({ length: 37 }, () => Array.from({ length: 8 }, () => score.nextPulse()));
		for (const shift of [1, 2, 3]) {
			const bar = bars[(shift + 2) * 4];
			for (let i = 0; i < 8; i++) {
				const lead = bars[8][i][0];
				expect(bar[i].find(note => !note.echo)).toEqual(lead);
				const reply = bar[(i + shift) % 8].find(note => note.echo);
				if (lead) expect(reply).toMatchObject({ midi: lead.midi + 12, echo: true, accent: lead.accent });
				else expect(reply).toBeUndefined();
			}
		}
		expect(bars[32]).toEqual(bars[0]);
		expect(bars[36].flat()).toHaveLength(3);
		expect(bars[36].filter((slot, i) => slot[0]?.midi !== bars[0][i][0]?.midi)).toHaveLength(1);
	});
});

describe('instrument arrangements', () => {
	it('keeps the piano theme when mallets and strings enter', () => {
		const score = newScore();
		const bars = Array.from({ length: 21 }, () => Array.from({ length: 8 }, () => score.nextPulse()));
		expect(bars[0].flat().map(n => n.instrument)).toEqual(['piano', 'piano', 'piano']);
		expect(new Set(bars[20].flat().map(n => n.instrument))).toEqual(new Set(['piano', 'mallet', 'strings']));
		for (const i of [0, 3, 5]) expect(bars[20][i][0]).toEqual(bars[0][i][0]);
	});
	it('leaves six or more empty pulses after each call and reply', () => {
		const score = newSpacePattern(2);
		const phrases = Array.from({ length: 9 }, () => Array.from({ length: 16 }, () => score.nextPulse()));
		expect(phrases[0]).toEqual(phrases[1]);
		expect(phrases[0][0][0].midi).not.toBe(phrases[8][0][0].midi);
		for (const phrase of phrases) {
			expect(phrase.flat().length).toBeGreaterThanOrEqual(2);
			expect(phrase.flat().length).toBeLessThanOrEqual(3);
			expect(phrase.slice(10).flat()).toEqual([]);
		}
		expect(new Set(phrases.flat(2).map(n => n.instrument))).toEqual(new Set(['piano', 'mallet', 'strings']));
	});
});
