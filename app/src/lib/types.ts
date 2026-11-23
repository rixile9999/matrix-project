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
	memoDue: number; // cards in today's memorisation plan (due + new), for the "오늘 복습 N장" link
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
import type { CheatEntry, JudgeResult, LangProblem, TopicId } from './core/lang.ts';

export type LangLevel = LangProblem['level'];
export type LangKind = LangProblem['kind'];

export type LangListItem = {
	id: string;
	order: number;
	level: LangLevel;
	topic: TopicId;
	kind: LangKind;
	title: string;
	limitSec: number;
	status: 'new' | 'attempted' | 'passed'; // passed = at least one session passed
	bestSec: number | null; // fastest passing session
	clean: boolean; // some passing session used none of the problem's `avoid` keywords
	book: { id: string; chapter: number; exercise: string } | null; // set for book problems (badge "책 3.7")
};

/** A book card on /lang. passed/total count only complete problems of that book. */
export type LangBookCard = { id: string; title: string; passed: number; total: number };

/** `/lang/book/[book]` load (404 for an unknown book). Action ?/start (field: problemId) creates a session and redirects to /lang/[id]. */
export type LangBookData = {
	id: string;
	title: string;
	passed: number;
	total: number;
	resume: { problemId: string; title: string; chapter: number; exercise: string } | null; // first unpassed in book order; null when empty or all passed
	chapters: { chapter: number; title: string; passed: number; total: number; problems: LangListItem[] }[]; // chapter order; problems in exercise order, [] = 준비 중
};

/** Where a book problem sits, for the problem screen's breadcrumb. */
export type LangBookRef = { id: string; title: string; chapter: number; chapterTitle: string; exercise: string };

/** One topic of the /lang matrix; `levels[0..2]` are levels 1..3, each in problem order. Only topics with problems appear. */
export type LangTopicRow = { topic: TopicId; label: string; levels: [LangListItem[], LangListItem[], LangListItem[]] };

/** continue = next unpassed level 2 · warmup = a level 1 (see suggestWarmup in core/study.ts) · challenge = next unpassed level 3. */
export type LangSuggestion = { key: 'continue' | 'warmup' | 'challenge'; label: string; problemId: string; title: string };

/** `/lang` load. Action ?/start (field: problemId) creates a session and redirects to /lang/[id]. */
export type LangHomeData = {
	books: LangBookCard[]; // _books.json order
	topics: LangTopicRow[]; // TOPICS order; includes book problems (item.book != null), the client filters them
	levels: { level: LangLevel; label: string; passed: number; total: number }[]; // always 3 entries; NON-book problems only
	suggestions: LangSuggestion[]; // only those with a candidate; NON-book problems only
};

export type LangFinished = {
	outcome: 'passed' | 'revealed'; // revealed = gave up and looked at the solution
	elapsedSec: number;
	overtime: boolean; // passed after limitSec
	avoided: string[]; // avoid-keywords used in the passing code
	solution: string; // model answer (Scala source)
	notes: string;
	targets: string[];
	lookedUp: string[]; // cheat sheet entry ids opened during this session, first-opened order, deduplicated
};

/** `/lang/[id]` load: the latest session of that problem; redirects to /lang if there is none. */
export type LangSessionData = {
	problem: {
		id: string; order: number; level: LangLevel; topic: TopicId; kind: LangKind; title: string; limitSec: number; statement: string; starter: string;
		avoid: string[]; // only for kind 'refactor' (shown in the header note), else []
		book: LangBookRef | null; // book problems only
		given: string | null; // Given.scala (read-only code the problem builds on); not secret, always sent
	};
	session: {
		id: number;
		startedAt: number;
		code: string; // code of the last run, or the starter
		hints: string[]; // hints revealed so far (0–2)
		refs: string[]; // related cheat entry ids: [] until hint 1 is revealed or the session is finished (withheld otherwise)
		intent: string | null; // 출제 취지: null under the same rule as refs, and for problems without one
		lastResult: JudgeResult | null;
		finished: LangFinished | null;
	};
	cheat: CheatEntry[]; // the whole cheat sheet (static), topic order; topics not written yet are absent
	now: number;
	nextId: string | null; // non-book: next non-book problem of the same level; book: next problem in book order (crosses chapters)
};
// `/lang/[id]` form actions: ?/restart (new session for this problem, same page), ?/reveal (give up -> finished.outcome 'revealed')
// POST /lang/[id]/run     JSON body { code: string } -> LangRunResponse (judges, records the run; first pass finishes the session)
// POST /lang/[id]/hint    no body -> LangHintResponse (reveals the next hint; refs appear with hint 1)
// POST /lang/[id]/lookup  JSON body { entryId: string } -> LangLookupResponse (append-only; ignored without an open session)
export type LangRunResponse = { result: JudgeResult; finished: boolean; error?: string };
export type LangHintResponse = { hints: string[]; refs: string[]; intent: string | null; error?: string };
export type LangLookupResponse = { recorded: boolean };

/** `/lang/cheatsheet` load. `passedBy[entryId]`: problems already passed that list the entry in `refs` (others would leak hints). */
export type LangCheatData = { entries: CheatEntry[]; passedBy: Record<string, { id: string; title: string }[]> };


// ---------------------------------------------------------------------------
// Memorisation (암기): cards recalled and self-graded, checks answered by tapping. Content: memo/<lang>/,
// scheduling: src/lib/core/memo-sched.ts (replayed from the append-only memo_reviews table, nothing derived is stored).
// Everything that reveals an answer (points, answerCode, pattern title, correct option/order, whys) is sent only by the
// reveal / answer endpoints below, never in page data.
import type { NoteStatus } from './core/memo-sched.ts';

export type MemoKind = 'concept' | 'recognize' | 'steps' | 'line' | 'syntax'; // syntax = synthetic card from a looked-up cheat sheet entry (id `syntax-<entryId>`)

/** A card as shown with its question. No answer content. */
export type MemoCardView = {
	id: string;
	kind: MemoKind;
	kindLabel: string;
	prompt: string; // inline `code` allowed
	promptCode: string | null;
	source: string | null; // "책 3장 …에서" / "유형: …" / null (never the pattern title for recognize cards)
	limitSec: number;
};

/** The "오늘 복습" plan: due reviews plus at most 4 new cards, split by kind (process = recognize + steps + line). */
export type MemoHomeData = {
	total: number;
	split: { concept: number; process: number; syntax: number };
	sessionSize: number; // what "복습 시작" takes: at most 12
	minutes: number;
	checks: number; // checks the next check session would hold (0–3)
	shaky: number; // 흔들림 cards, for the notes link
	redo: MemoRedo[];
	weekDays: number; // distinct days this week with a review
	weekGoal: number;
	openItems: number; // unlocked cards + checks (0 = nothing available at all)
};

/** A problem whose 풀이 과정 card was rated 1 on its two latest reviews. Link: /lang/<problemId>. */
export type MemoRedo = { problemId: string; title: string; cardTitle: string };

/** `/memo/review` load. */
export type MemoReviewData = { cards: MemoCardView[] };
// POST /memo/review/reveal  { id } -> MemoRevealResponse   (404 for unknown or locked cards)
// POST /memo/review/answer  { id, ticked: number[] /* indexes into points */, elapsedMs } -> MemoAnswerResponse (records the review)
export type MemoRevealResponse = {
	points: string[];
	answerCode: string | null;
	patternTitle: string | null; // recognize / steps only
	entry: CheatEntry | null; // syntax cards: the cheat sheet entry
	next: string[]; // next review in words, indexed by how many points get ticked (0..points.length)
};
export type MemoAnswerResponse = { rating: 1 | 2 | 3; word: string; next: string };

export type MemoCheckKind = 'order' | 'trace' | 'bug' | 'approach';
/** A check as shown. order: `lines` = the pool (shuffled, distractors mixed in); bug: `lines` = the code lines; trace/approach: `options` (shuffled). */
export type MemoCheckView = {
	id: string;
	kind: MemoCheckKind;
	kindLabel: string;
	prompt: string;
	limitSec: number;
	code: string | null; // trace
	given: string | null; // order / bug: fixed code above the lines
	lines: string[];
	options: string[];
};
/** `/memo/check` load. */
export type MemoCheckData = { checks: MemoCheckView[] };
// POST /memo/check/answer { id, choice, elapsedMs } -> MemoCheckResponse
//   choice: order = displayed pool indexes in the chosen order; trace/approach = displayed option index; bug = line index.
//   Only the first submission of a check within an hour is recorded (rating 3 right / 1 wrong; `recorded` says so). Retries are judged but never recorded.
// POST /memo/check/solution { id } -> MemoSolutionResponse (order only; 403 until an answer has been recorded)
export type MemoCheckResponse = {
	correct: boolean;
	recorded: boolean;
	message: string | null; // order: why it failed (distractor why, failing case, or compiler line)
	why: string | null; // bug: why; trace/approach: why of the tapped option
	correctIndex: number | null; // trace/approach: displayed index of the right option
	whys: string[]; // trace/approach: why of every displayed option
	bugIndex: number | null;
	fixed: string | null;
};
export type MemoSolutionResponse = { order: number[] };

/** `/memo/notes` load. */
export type MemoNoteRow = { id: string; title: string; summary: string | null /* null while locked */; status: NoteStatus; locked: boolean };
export type MemoNoteGroup = { key: string; heading: string; sub: string | null; steps: string[]; rows: MemoNoteRow[] };
export type MemoNotesData = { groups: MemoNoteGroup[]; shaky: number };
