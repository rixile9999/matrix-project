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

// ---------------------------------------------------------------------------
// Language study pack (Scala). Problem files: see src/lib/core/lang.ts (LangProblem),
// judged by src/lib/server/judge.ts. Hints, notes, targets and the model solution are
// withheld from the client until the session state allows them.
import type { JudgeResult } from './core/lang.ts';

export type LangListItem = {
	id: string;
	order: number;
	title: string;
	limitSec: number;
	status: 'new' | 'attempted' | 'passed'; // passed = at least one session passed
	bestSec: number | null; // fastest passing session
	clean: boolean; // some passing session used none of the problem's `avoid` keywords
	targets: string[] | null; // null until status is 'passed'
};

/** `/lang` load. Action ?/start (field: problemId) creates a session and redirects to /lang/[id]. */
export type LangHomeData = {
	problems: LangListItem[]; // curriculum order
	nextId: string | null; // first problem that is not passed
	passedCount: number;
};

export type LangFinished = {
	outcome: 'passed' | 'revealed'; // revealed = gave up and looked at the solution
	elapsedSec: number;
	overtime: boolean; // passed after limitSec
	avoided: string[]; // avoid-keywords used in the passing code
	solution: string; // model answer (Scala source)
	notes: string;
	targets: string[];
};

/** `/lang/[id]` load: the latest session of that problem; redirects to /lang if there is none. */
export type LangSessionData = {
	problem: { id: string; order: number; title: string; limitSec: number; statement: string; starter: string };
	session: {
		id: number;
		startedAt: number;
		code: string; // code of the last run, or the starter
		hints: string[]; // hints revealed so far (0–2)
		lastResult: JudgeResult | null;
		finished: LangFinished | null;
	};
	now: number;
	nextId: string | null; // next problem in curriculum order
};
// `/lang/[id]` form actions: ?/restart (new session for this problem, same page), ?/reveal (give up -> finished.outcome 'revealed')
// POST /lang/[id]/run   JSON body { code: string } -> LangRunResponse (judges, records the run; first pass finishes the session)
// POST /lang/[id]/hint  no body -> { hints: string[] } (reveals the next hint)
export type LangRunResponse = { result: JudgeResult; finished: boolean; error?: string };
