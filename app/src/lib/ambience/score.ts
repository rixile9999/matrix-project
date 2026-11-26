// MIDI voicings in D major. Neighbours retain two voices in their original registers.
const chords = [
	[38, 45, 52], [35, 45, 52], [35, 45, 54], [38, 45, 54],
	[38, 47, 54], [38, 47, 52], [35, 47, 52], [35, 47, 54]
];
const range = (low: number, high: number) => low + Math.random() * (high - low);
const pick = <T>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
const scale = [57, 59, 62, 64, 66, 69];
// Each addition occupies a rest in the same eight-pulse bar.
const entrances = [0, 3, 5, 1, 6];
const contours = [[2, 4, 1, 3, 0], [3, 1, 4, 2, 5], [1, 3, 2, 4, 0]];
const sections = [
	{ count: 3, shift: 0 }, { count: 4, shift: 0 }, { count: 5, shift: 0 },
	{ count: 5, shift: 1 }, { count: 5, shift: 2 }, { count: 5, shift: 3 },
	{ count: 5, shift: 0 }, { count: 4, shift: 0 }, { count: 3, shift: 0 }
];
type Instrument = 'piano' | 'mallet' | 'strings';
export type PulseNote = { midi: number; echo: boolean; accent: boolean; instrument: Instrument };
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function newScore() {
	const transpose = pick([-3, -2, 0, 2]);
	let chord = 0, previous = -1;
	const voicing = () => chords[chord].map(n => n + transpose);
	const cell = [...pick(contours)];
	const pulseSeconds = range(0.32, 0.39);
	let pulse = 0, bar = 0, section = 0;

	return {
		transpose,
		voicing,
		changeChord() {
			const candidates = chords.map((_, i) => i).filter(i => i !== previous &&
				chords[i].filter((n, voice) => n === chords[chord][voice]).length === 2);
			previous = chord;
			chord = pick(candidates);
			return voicing();
		},
		pulseSeconds,
		nextPulse() {
			const { count, shift } = sections[section];
			const notes: PulseNote[] = [];
			function voice(slot: number, echo: boolean) {
				const i = entrances.indexOf(slot);
				if (i >= 0 && i < count) {
					// Piano carries the original three attacks. Mallets fill the added rests,
					// and the displaced line passes from mallets to bowed strings.
					let instrument: Instrument = i < 3 ? 'piano' : 'mallet';
					if (echo) instrument = shift === 2 || (shift === 3 && i < 3) ? 'strings' : 'mallet';
					notes.push({ midi: scale[cell[i]] + transpose + (echo ? 12 : 0), echo, accent: i === 0, instrument });
				}
			}
			voice(pulse, false);
			if (shift) voice((pulse - shift + 8) % 8, true);
			pulse = (pulse + 1) % 8;
			if (pulse === 0 && ++bar === 4) {
				bar = 0;
				section = (section + 1) % sections.length;
				if (section === 0) {
					// Carry the figure forward, changing just one of its three exposed notes.
					const index = pick([0, 1, 2]);
					const exposed = cell.slice(0, 3);
					cell[index] = pick(scale.map((_, i) => i).filter(i => !exposed.includes(i)));
				}
			}
			return notes;
		}
	};
}

// A two-note call slowly opens out and contracts over eight phrases.
export function newSpacePattern(transpose: number) {
	const pulseSeconds = range(0.48, 0.55);
	const replies = [3, 3, 5, 5, 7, 7, 5, 3];
	let first = 62, answer = 69;
	let pulse = 0, phrase = 0;
	return {
		pulseSeconds,
		nextPulse(): PulseNote[] {
			const notes: PulseNote[] = [];
			if (pulse === 0) {
				notes.push({ midi: first + transpose, instrument: phrase === 5 ? 'strings' : 'piano', accent: true, echo: false });
			} else if (pulse === replies[phrase]) {
				const instrument = phrase < 2 ? 'piano' : phrase < 5 ? 'mallet' : 'strings';
				notes.push({ midi: answer + transpose, instrument, accent: false, echo: false });
			} else if (pulse === 9 && phrase === 3) {
				notes.push({ midi: first + transpose + 12, instrument: 'strings', accent: false, echo: true });
			}
			pulse = (pulse + 1) % 16;
			if (pulse === 0) {
				phrase = (phrase + 1) % replies.length;
				if (phrase === 0) {
					first = pick([59, 62, 64].filter(n => n !== first));
					answer = first + pick([5, 7, 12]);
				}
			}
			return notes;
		}
	};
}
