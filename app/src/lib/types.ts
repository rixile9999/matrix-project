// Contract between the server layer (+page.server.ts / +server.ts) and the Svelte pages.
// All timestamps are unix seconds.
import type { Mode } from './core/select.ts';
import type { Rating } from './core/rating.ts';

export type Problem = {
	id: string; // `${contestId}${index}`, e.g. "1850C"
	contestId: number;
	index: string;
	name: string;
	rating: number;
	tags: string[];
	solvedCount: number;
	url: string; // https://codeforces.com/problemset/problem/{contestId}/{index}
};

export type Outcome = 'solved' | 'timeout' | 'gave_up';

export type Attempt = {
	id: number;
	problem: Problem;
	mode: Mode;
	startedAt: number;
	limitSec: number;
	endedAt: number | null; // null while active
	outcome: Outcome | null; // null while active
	elapsedSec: number | null; // for 'solved': accepted submission time - startedAt
	ratingBefore: number; // derived by replay
	ratingAfter: number | null; // null while active
};

export type Offer = {
	mode: Mode;
	problem: Problem | null; // null when no candidate is available
	window: [number, number]; // problem rating range for this mode
	limitSec: number;
	pSolve: number | null; // expected solve probability for `problem`
};

/** `/` load. If an attempt is active, load redirects to /attempt/[id] instead. */
export type HomeData = {
	handle: string | null;
	problemCount: number;
	lastSyncAt: number | null;
	rating: Rating; // internal rating (CF scale) + RD
	cfRating: number | null; // actual contest rating from user.info
	offers: Offer[]; // one per mode, in order speed, standard, depth; empty if no handle/problems
	recent: Attempt[]; // last 5 finished, newest first
};
// `/` form actions (all POST, return { error?: string } via fail() on problems):
//   ?/setHandle  fields: handle, initialRating (optional number)  -> saves, fetches user.info, syncs
//   ?/sync       -> refreshes problemset + my submissions
//   ?/start      fields: mode, problemId  -> creates attempt, redirects to /attempt/[id]

/** `/attempt/[id]` load. */
export type AttemptData = { attempt: Attempt; now: number };
// `/attempt/[id]` form action: ?/giveUp -> marks gave_up, stays on page
// POST /attempt/[id]/check (no body) -> CheckResponse. Polls CF for an accepted submission,
// and resolves as 'timeout' once the deadline has passed with no accepted submission in time.
export type CheckResponse = { resolved: boolean; outcome: Outcome | null; error?: string };

/** `/history` load. */
export type HistoryData = {
	points: { t: number; r: number; rd: number }[]; // rating after each finished attempt, oldest first
	attempts: Attempt[]; // finished, newest first
	tags: { tag: string; n: number; actual: number; expected: number; deviation: number }[]; // weakest first
};
