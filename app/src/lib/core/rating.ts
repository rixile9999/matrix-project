// Glicko-1 against Codeforces problem ratings. Pure functions only.
// A CF problem rated d is solved in-contest with ~50% probability by a participant rated d,
// so playing "matches" against problems keeps the user's rating on the CF scale.

export type Rating = { r: number; rd: number };

export const PROBLEM_RD = 50;
export const MIN_RD = 60; // keep the rating responsive for a single, improving user

const Q = Math.LN10 / 400;
const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / Math.PI ** 2);

/** Probability that a player rated r solves a problem rated d. */
export const expected = (r: number, d: number, opponentRd = 0) =>
	1 / (1 + 10 ** ((-g(opponentRd) * (r - d)) / 400));

/** Problem rating at which a player rated r succeeds with probability p. */
export const difficultyFor = (r: number, p: number) => r - 400 * Math.log10(p / (1 - p));

export function update(player: Rating, d: number, score: number): Rating {
	const gj = g(PROBLEM_RD);
	const e = expected(player.r, d, PROBLEM_RD);
	const dInv = Q * Q * gj * gj * e * (1 - e);
	const denom = 1 / player.rd ** 2 + dInv;
	return {
		r: player.r + (Q / denom) * gj * (score - e),
		rd: Math.max(MIN_RD, Math.sqrt(1 / denom))
	};
}

export type Result = { difficulty: number; tags: string[]; score: number };
export type TagStat = { n: number; actual: number; expected: number };

/** Replays the attempt log: ratings are always derived, never stored. */
export function replay(initial: Rating, results: Result[]) {
	let cur = initial;
	const history: Rating[] = [initial];
	const tags = new Map<string, TagStat>();
	for (const res of results) {
		const e = expected(cur.r, res.difficulty);
		for (const t of res.tags) {
			const s = tags.get(t) ?? { n: 0, actual: 0, expected: 0 };
			tags.set(t, { n: s.n + 1, actual: s.actual + res.score, expected: s.expected + e });
		}
		cur = update(cur, res.difficulty, res.score);
		history.push(cur);
	}
	return { rating: cur, history, tags };
}

/** Mean (actual - expected) solve rate for a tag; negative = weaker than the overall rating predicts. */
export const deviation = (s: TagStat) => (s.n === 0 ? 0 : (s.actual - s.expected) / s.n);
