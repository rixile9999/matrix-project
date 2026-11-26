// Contract between the server layer (+page.server.ts / +server.ts) and the Svelte pages.
// All timestamps are unix seconds.
import type { Mode } from './core/select.ts';
import type { Rating } from './core/rating.ts';
import type { Day, ExperimentId, FocusFact, Observation, SelfState, Strip, Unknown } from './core/debrief.ts';

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
	debrief: DebriefSessionCard | null; // the session strip and observations; only once the session is finished (never while the timer runs)
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
	attemptId?: number; // standalone /memo/check attempt id anchoring the option/line permutation
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

// ---------------------------------------------------------------------------
// Operator (the question-answering side panel; name in core/coach.ts COACH_NAME). Rules and the answer format:
// src/lib/core/coach.ts. Server: src/lib/server/coach.ts. Log: the append-only coach_messages table.
// Access is decided by the server on every request; the client's own idea of it only controls what is shown.
import type { BackendId, CoachAccess, CoachContext } from './core/coach.ts';

export type CoachMessage = {
	id: number;
	role: 'user' | 'coach';
	text: string; // coach: the raw answer (parse with parseAnswer)
	backend: BackendId | null; // coach messages only
	ms: number | null; // coach messages: time to the complete answer
	at: number; // unix seconds
	error: boolean; // coach message that failed (text = the reason, shown as such)
};

/** GET /coach/thread?kind=lang|memo|stats&id=… (&run=… for stats). Messages from the language session, the last 24 hours
 *  on the memo card, or the completed statistics run. Oldest first. */
export type CoachThreadResponse = {
	access: CoachAccess;
	opensAt: number | null; // lang + locked + open session: unix seconds when the limit ends (the panel unlocks itself then)
	gets: string[]; // localized labels for the information sent to the backend
	backends: { id: BackendId; label: string }[];
	messages: CoachMessage[];
};

// POST /coach/ask  JSON { context: CoachContext, backend: BackendId, question: string, code?: string }
//   `code` = the editor's current text (lang only; falls back to the last run's code).
//   403 { error } when access is 'locked'; 400 for a bad body; 404 unknown item.
//   Otherwise 200 with an NDJSON stream (content-type application/x-ndjson), one CoachEvent per line:
export type CoachEvent =
	| { type: 'start'; userMessageId: number }
	| { type: 'delta'; text: string } // append to the answer so far
	| { type: 'done'; message: CoachMessage } // the stored answer (text = the full answer)
	| { type: 'error'; message: CoachMessage }; // stored with error: true

// POST /coach/verify  JSON { messageId: number, block: number /* index among the answer's trace segments */ }
//   Runs the trace block's steps through the Scala toolchain. 404 unknown message/block.
export type CoachVerifyResponse = {
	ok: boolean; // every step's value matched
	steps: { ok: boolean; actual: string | null }[]; // actual = real toString, null when it could not be evaluated
	error: string | null; // compile error text when nothing could be run
};

// ---------------------------------------------------------------------------
// Sparring (스파링): Sprint = 5 already-passed level-1 problems back to back against the real judge, one clock;
// Recall = 90 seconds of unlocked trace / approach / bug checks. Pure logic: src/lib/core/spar.ts, server: src/lib/server/spar.ts.
// Storage is append-only (spar_runs + spar_events); totals, splits, "best" and every label below are recomputed from the events.
// No points, badges or streaks: only records, compared with the learner's own earlier runs.
//
// Conventions of this section
//  - `*At` = unix seconds; `*Ms` = milliseconds. `elapsedMs` fields are the SERVER's clock at the moment the response was made
//    (ms since the run started): the page runs its own clock as `elapsedMs + (performance.now() - receivedAt)`.
//  - One run is active at a time (both kinds together). Starting while one is active redirects to that run instead.
//  - A run is `running` until it has a `finish` or `abandon` event. The server appends those lazily: a Sprint open for more than
//    2 hours, or a Recall open past its deadline + 60 s without being finished, becomes `abandoned` the next time anything looks at it.
//    A Recall whose deadline passed less than 60 s ago becomes `finished` (its valid answers stand).
//  - Run ids are integers in the URL (`/spar/sprint/12`). Unknown id, non-integer id, or a run of the other kind -> 404.
//  - Every non-GET request needs the same-origin header (hooks.server.ts), like the rest of the app.
//  - Errors from endpoints: HTTP 400 (bad body), 409 (state does not allow it) with a `SparError` body. `over: true` means the run is
//    no longer running: leave the screen and go to `runUrl`.
//  - Secrets: no hint, note, target, intent or model solution of a Sprint problem is ever sent (not on the result page either;
//    link to /lang/<problemId> instead). Recall whys and the correct answer of a check are sent only after that check was answered
//    (the single index `highlight`) and the explanations only by `/spar/run/[run]` once the run is over.
import type { SparKind, SparStatus } from './core/spar.ts';
export type { SparKind, SparStatus };
export type SparMode = SparKind | 'stats';

export type SparError = { error: string; over?: boolean; runUrl?: string };

/** One line of the records list, and the summary shape used on the home page. Computed from the run's events. */
export type SparRecordRow = {
	id: number;
	kind: SparMode;
	startedAt: number;
	status: SparStatus; // 'running' only for the active run (its label is "진행 중")
	// Short label for the list: sprint finished without skip "6:27" (m:ss); sprint finished with skips "건너뜀 1";
	// recall finished "9 · 90%" (correct count · accuracy rounded), recall with no answer "0개"; abandoned (any kind) "중단"; running "진행 중".
	label: string;
	totalMs: number | null; // sprint finished (with or without skips): start -> last pass/skip; otherwise null
	skipped: number; // sprint: skipped problems; 0 for recall
	answered: number; // recall: answers that counted; 0 for sprint
	correct: number; // recall: of those, right; 0 for sprint
	accuracy: number | null; // recall with answered > 0: correct / answered (0..1); otherwise null
	// Best of its kind, so at most one row per kind is true.
	//   sprint: finished, no skip, smallest totalMs (tie: the earlier run). A run with a skip or an abandon is never best.
	//   recall: finished, accuracy >= 0.8, most correct (tie: higher accuracy, then the earlier run). Null best when no run qualifies.
	best: boolean;
};

/** Per kind on the home page. */
export type SparKindHome = {
	eligible: number; // sprint: passed level-1 non-book problems; recall: unlocked trace/approach/bug checks
	needed: number; // minimum to start: 5 for both
	startable: boolean; // eligible >= needed (the server refuses otherwise)
	best: SparRecordRow | null;
	last: SparRecordRow | null; // latest finished run (skips allowed, abandoned ones not)
	trend: SparRecordRow[]; // up to the last 5 finished runs, OLDEST first (for a small sparkline: totalMs for sprint, correct for recall)
};

/** `/spar` load. */
export type SparHomeData = {
	sprint: SparKindHome;
	recall: SparKindHome;
	stats: SparKindHome;
	active: { id: number; kind: SparMode; startedAt: number; url: string } | null; // a running run, to offer "이어서"; url = its run page
	runs: number; // all recorded runs, abandoned included ("기록 23회")
};
// `/spar` form actions (POST forms; 303 redirect on success):
//   ?/startSprint  ?/startRecall   (no fields)
//   - a run is already active (either kind) -> redirects to that run (/spar/sprint/<id> or /spar/recall/<id>), nothing new is created
//   - not enough material -> fail(409, { error }) with a Korean message, e.g. "통과한 기본 문제가 5개 이상 있어야 합니다. 지금 3개입니다."
//   - success -> redirect to /spar/sprint/<id> or /spar/recall/<id>. The clock starts at that moment on the server.
export type SparStartFailure = { error: string };

// ---------- Sprint ----------
/** A Sprint problem as shown. Deliberately without hints, notes, targets, refs, intent, solution (and book problems never appear). */
export type SparSprintProblem = {
	id: string;
	topic: TopicId;
	topicLabel: string; // Korean, e.g. "컬렉션"
	kind: LangKind; // write | fix | refactor | complete
	title: string;
	limitSec: number; // the problem's own limit: the page may show it as a soft reference, nothing is enforced
	statement: string; // inline `code` allowed
	starter: string;
	avoid: string[]; // only for kind 'refactor' (a run fails while one remains), else []
	bestCumMs: number | null; // best run's cumulative time at THIS position (see SparSprintData.best); null when there is no best run yet
};

/** A problem already left behind in this run, in run order. */
export type SparSprintDone = {
	problemId: string;
	title: string;
	outcome: 'passed' | 'skipped';
	splitMs: number; // from the previous pass/skip (or the run start) to this one
	cumMs: number; // from the run start to this one
	runs: number; // how many times it was judged (a skipped problem may have 0)
	bestCumMs: number | null; // best run's cumulative time at the same position; null when there is no best run yet
	deltaMs: number | null; // cumMs - bestCumMs: negative = ahead of the best run ("12초 빠름"), positive = behind; null without best
};

/** `/spar/sprint/[run]` load while the run is running (otherwise 303 -> /spar/run/<id>), and the `sprint` field of every Sprint endpoint response. */
export type SparSprintData = {
	run: { id: number; startedAt: number };
	status: SparStatus; // load always sees 'running'; an endpoint response may say 'finished' (last problem passed/skipped) or 'abandoned'
	runUrl: string | null; // set unless running: where the result is (`/spar/run/<id>`) -> navigate there
	total: number; // 5
	index: number; // 0-based position of `problem` (== done.length); == total when finished
	problem: SparSprintProblem | null; // null unless running
	code: string; // editor content for `problem`: the code of its last judged run in this run, else the starter
	lastResult: JudgeResult | null; // result of that last judged run (shown under the editor after reload), else null
	runs: number; // judged runs of `problem` so far
	done: SparSprintDone[];
	// The best run to race against: finished, no skip, smallest total. cumMs[i] = its cumulative time after position i (length 5). null = no best yet,
	// then show no comparison. While solving, `problem.bestCumMs` is the pace to beat for the current position.
	best: { id: number; totalMs: number; cumMs: number[] } | null;
	elapsedMs: number; // server clock for the one run clock
	cheat: CheatEntry[]; // the whole cheat sheet (static, same as /lang/[id]); opening an entry should POST .../lookup
};
// POST /spar/sprint/[run]/run   JSON { problemId: string, code: string } -> SparSprintRunResponse
//   Judges for real (serialized with other judge jobs; can take many seconds; the run clock keeps running). A failing, non-compiling or
//   timed-out run is recorded and the run stays on the same problem. A pass is stamped with the moment the code was SUBMITTED (judge latency is not
//   charged to the learner), then the run moves to the next problem, or finishes after the 5th.
//   409 when `problemId` is not the current problem (stale tab: reload) or the run is no longer running (SparError.over).
export type SparSprintRunResponse = {
	result: JudgeResult; // same as /lang: status, cases, output, avoided (a refactor problem fails while an avoided keyword remains)
	passed: boolean;
	sprint: SparSprintData; // the state AFTER this run: on a pass, `done` has a new last row (use its deltaMs for the pace message) and `problem` is the next one
};
// POST /spar/sprint/[run]/skip  JSON { problemId: string } -> SparSprintSkipResponse
//   Records a skip of the current problem (the run can no longer be the best) and moves on; 409 like `run`.
export type SparSprintSkipResponse = { sprint: SparSprintData };
// POST /spar/sprint/[run]/lookup  JSON { entryId: string } -> LangLookupResponse ({ recorded })
//   Cheat sheet opened for an entry, recorded against the current problem. Ignored silently ({ recorded: false }) for unknown entries or a run that is not running.
// POST /spar/sprint/[run]/abandon  (no body) -> SparAbandonResponse. Marks a running run abandoned ("중단"); on a run already over it changes nothing.
export type SparAbandonResponse = { runUrl: string };

// ---------- Recall ----------
/** `/spar/recall/[run]` load while the run is running (otherwise 303 -> /spar/run/<id>) and the state the page starts from. */
export type SparRecallData = {
	run: { id: number; startedAt: number };
	durationMs: number; // 90000
	elapsedMs: number; // server clock; the deadline is durationMs. Reaching it, navigate to /spar/run/<id> (the server settles the run as finished).
	listSize: number; // checks in this run's fixed list (up to 40; more than can be answered in 90 s)
	answered: number; // counted answers so far
	correct: number; // of those, right
	// The check to answer now, exactly like /memo/check but only kinds trace (`code` + `options`), approach (`options`), bug (`lines`: tap the wrong line).
	// Options are in their fixed display order. Nothing about the answer. `limitSec` is irrelevant here.
	current: MemoCheckView;
};
// POST /spar/recall/[run]/answer  JSON { id: string, choice: number } -> SparRecallAnswerResponse
//   `id` must be the current check, `choice` = displayed option index (trace/approach) or line index (bug). Only the first answer of a check counts;
//   the server holds the cursor, so a double tap or a stale id is NOT counted (accepted: false, `next` = the check that is really current).
//   An answer arriving after startedAt + 90 s is NOT counted: { accepted: false, over: true, runUrl } (the run is settled as finished).
//   An accepted answer is also recorded as a memo review of that check by the same rule as POST /memo/check/answer (first answer within an hour only;
//   rating 3 right / 1 wrong, overtime cap), so nothing is double-recorded whichever page the learner answered on first.
//   A run that is not running any more (finished, abandoned, deadline passed) also answers 200 { accepted: false, over: true, runUrl }.
//   400 (SparError) for a malformed choice.
export type SparRecallAnswerResponse = {
	accepted: boolean;
	over: boolean; // no more checks: the deadline passed or the list is exhausted. Show the flash if accepted, then navigate to runUrl.
	correct: boolean | null; // null when not accepted
	highlight: number | null; // index to mark in the half-second flash: the RIGHT option/line (compare with the tapped one to colour it); null when not accepted
	answered: number;
	correctCount: number;
	next: MemoCheckView | null; // null when over
	runUrl: string | null; // set when over
};
// POST /spar/recall/[run]/abandon  (no body) -> SparAbandonResponse (as for Sprint)

// ---------- Run detail (result page and a past run's page) ----------
/** What a Sprint problem looked like in a run, with its numbers. Still no hints/solution: link to /lang/<problemId> for those. */
export type SparSprintResultRow = {
	problemId: string;
	title: string;
	topicLabel: string;
	kind: LangKind;
	limitSec: number;
	outcome: 'passed' | 'skipped' | null; // null = never reached (abandoned run)
	splitMs: number | null; // null when not reached
	cumMs: number | null;
	overLimit: boolean; // splitMs > limitSec * 1000 (skipped problems count too): such a problem fed the warm-up suggestion on /lang
	runs: number; // judged runs ("두 번 실행했습니다")
	bestSplitMs: number | null; // split of the same problem in the comparison run (below), null when that run did not have it
	lookups: { entryId: string; title: string }[]; // cheat entries opened on this problem, deduplicated, first-opened order
};

/** The extreme rows, relative to the baseline named by `basis`: 'best' = the comparison run's split of that problem; 'limit' = the problem's own limitSec
 *  (used when no row has a comparison split, which is common because sprints avoid recent problems). deltaMs = splitMs - baseline. */
export type SparSprintExtreme = { problemId: string; title: string; deltaMs: number; basis: 'best' | 'limit' };

type SparDetailBase = {
	id: number;
	startedAt: number;
	status: 'finished' | 'abandoned'; // a running run redirects to its own screen instead
	label: string; // same as SparRecordRow.label
	isBest: boolean; // this run is currently the best of its kind
};

export type SparSprintDetail = SparDetailBase & {
	kind: 'sprint';
	totalMs: number | null; // null for an abandoned run
	skipped: number;
	// Comparison run = the best run among those BEFORE this one (finished, no skip, smallest total); null for the first. Fixed in time: a later, faster run does not change it.
	previousBest: { id: number; totalMs: number } | null;
	deltaMs: number | null; // totalMs - previousBest.totalMs (negative = faster); null without previousBest, without total, or when this run had a skip
	problems: SparSprintResultRow[]; // all 5 in run order
	slowest: SparSprintExtreme | null; // "가장 느려진 곳": largest positive delta; null if none is positive
	fastest: SparSprintExtreme | null; // largest negative delta; null if none is negative
	lookupCount: number; // all cheat sheet openings in the run
};

/** One answered check of a Recall run, with everything now allowed to be shown. Option/line order = the order the learner saw. */
export type SparRecallAnswerRow = {
	checkId: string;
	kind: 'trace' | 'approach' | 'bug';
	kindLabel: string;
	prompt: string;
	code: string | null; // trace
	lines: string[]; // bug: the code lines as shown
	options: string[]; // trace/approach: as shown
	choice: number; // displayed index tapped
	correctIndex: number; // displayed index of the right option (trace/approach) or the wrong line (bug)
	correct: boolean;
	whys: string[]; // trace/approach: why of every displayed option, same order as `options`; bug: []
	why: string | null; // bug: why that line is wrong
	fixed: string | null; // bug: the corrected line
	ms: number; // time spent on it (previous answer or run start -> this answer)
	recorded: boolean; // false when the same check had been answered within the hour elsewhere, so this answer was not logged as a review
};

export type SparRecallDetail = SparDetailBase & {
	kind: 'recall';
	answered: number;
	correct: number;
	accuracy: number | null; // 0..1; null when nothing was answered
	listSize: number;
	previousBest: { id: number; correct: number; accuracy: number } | null; // best among earlier runs; null for the first or when none qualified
	answers: SparRecallAnswerRow[]; // in answer order; missed ones are the rows with correct === false
};

export type SparRunDetail = SparSprintDetail | SparRecallDetail;
/** `/spar/run/[run]` load. A running run redirects (303) to its own screen (/spar/sprint/<id> or /spar/recall/<id>); unknown -> 404. */
export type SparRunData = { detail: SparRunDetail };

/** `/spar/records` load: newest first, at most 100 rows. Link each row to `/spar/run/<id>` (a running one redirects to its screen). */
export type SparRecordsData = { rows: SparRecordRow[]; total: number; truncated: boolean };

// ---------- Garden ----------
// /garden: the learner's records drawn as a living form, their rhythm by hour of day, and a weekly reading written on request.
// Everything here is recomputed from the records on each load (core/garden.ts). Only readings are stored (append-only, garden_readings).
// All timestamps are unix seconds; "local" = the server's time zone.

/** The short label of the form. Describes recorded behaviour, never the person. */
export type GardenKind = 'unknown' | 'wide' | 'straight' | 'even';

/** The numbers behind each part of the form, shown in the "읽는 법" legend. */
export type GardenNumbers = {
	langPassed: number; // passed language sessions (volume)
	statsRuns: number; // ended probability and statistics sessions
	statsPassed: number; // passed probability and statistics sessions (volume)
	statsDepthPassed: number; // distinct depth lessons passed (roots)
	memoReviews: number; // memo reviews, cards and checks (volume)
	sparRuns: number; // finished Sparring runs (volume)
	topics: number; // distinct topics practised (breadth)
	topicsTotal: number; // catalogue topics in the tracks represented in the form
	stableCards: number; // cards that are stable now (leaves)
	deepPassed: number; // distinct level-3 or book problems passed (roots)
	overtimeMin: number; // minutes spent past the limit on problems that were later passed (roots)
	medianRatio: number | null; // median elapsed / limit of passed coding and statistics speed sessions (pace); null with fewer than 3
	mended: number; // problems that once ended revealed, abandoned or past the limit and were later passed
	bests: number; // new Sparring bests
	firstLevel3: number; // first passes of level-3 problems
};

/** The form on one day: a pure function of the records up to the end of that day. 0..1 values saturate; counts are exact. */
export type GardenForm = {
	day: number; // 1 = the day of the first record; 0 = no record yet
	volume: number; // 0..1 stem height / thickness
	breadth: number; // 0..1 how evenly practice is spread over topics (normalised entropy)
	leaves: number; // 0..1 saturating share of stable cards
	roots: number; // 0..1
	pace: number; // 0..1: 1 = fast (dry, broken strokes), 0 = slow (wet, continuous), 0.5 = not enough data
	leafCount: number; // leaves to draw = stable cards
	mended: number; // gold marks to draw
	flowers: number; // flowers to draw
	kind: GardenKind;
	kindLabel: string;
	seed: number; // integer fixed by the first record, so the shape keeps its identity while it grows
	numbers: GardenNumbers;
};

export type GardenDay = { date: string /* YYYY-MM-DD, local */; form: GardenForm };

export type GardenHour = { hour: number; n: number; ok: number; rate: number | null /* 0..1, null when n = 0 */; enough: boolean /* n >= GardenRhythm.minPerHour */ };
/** One fact of the rhythm. value = null: not enough records yet; `need` says how many are needed. */
export type GardenRhythmFact = { key: 'best' | 'shaky' | 'gapSlow' | 'gapReturn'; label: string; value: string | null; need: string };
export type GardenRhythm = { hours: GardenHour[] /* 24, by local hour */; total: number; minPerHour: number; facts: GardenRhythmFact[] };

export type GardenReadingSentence = { text: string; facts: { id: string; text: string }[] /* the cited facts, in plain words */ };
export type GardenReading = { id: number; weekKey: string; createdAt: number; backend: string /* BackendId */; backendName: string; sentences: GardenReadingSentence[] };

/** `/garden` load. */
export type GardenData = {
	days: GardenDay[]; // first record day … today, oldest first; one zero form (day 0) when there are no records
	rhythm: GardenRhythm;
	week: { key: string /* Monday, YYYY-MM-DD */; label: string; factCount: number /* facts this week can be read from; 0 = nothing to read */ };
	reading: GardenReading | null; // the latest reading of this week
	backends: { id: string; name: string }[];
	defaultBackend: string;
};

/** POST `/garden/reading` body `{ backend?: string }`. 200 { reading }; failures { error } (Korean, calm). */
export type GardenReadingResponse = { reading: GardenReading } | { error: string };

// ---------- Debrief ----------
// /debrief: mistake patterns from the run log (classified by the verified catalog debrief/<lang>/patterns.json), the traces of attention
// (facts, never a score), and coaching written on request. Recomputed from the records on each load (core/debrief.ts).
export type { Day, FocusFact, Observation, SelfState, Strip, Unknown };

export type DebriefSessionCard = {
	id: number; problemId: string; title: string; startedAt: number; outcome: 'passed' | 'revealed' | null; elapsedSec: number; limitSec: number;
	strip: Strip; observations: Observation[]; self: SelfState | null;
};
export type DebriefEvidence = { problemId: string; title: string; at: number } & (
	| { kind: 'compile'; source: string; caretFrom: number; caretTo: number; head: string }
	| { kind: 'failed'; code: string; cases: string[] }
);
export type DebriefNote = {
	id: string; title: string; short: string;
	runs: number; sessions: number; lastAt: number;
	note: boolean; // reached the threshold (2 sessions or 3 runs); otherwise "emerging"
	problems: { id: string; title: string }[];
	evidence: DebriefEvidence[];
	rule: string[]; // inline markdown
	examples: { expr: string; value: string }[]; // verified by running (scripts/verify-debrief.ts)
	mine: string | null; // the learner's own line
	check: { id: string; prompt: string; code: string; options: { text: string; why: string }[]; answer: number } | null;
	inDeck: boolean;
	practice: { id: string; title: string; passed: boolean }[];
	questions: { problemId: string; at: number; text: string }[]; // Operator questions in the sessions where it showed up
};
export type DebriefReading = { id: number; createdAt: number; backend: string; backendName: string; sentences: { text: string; facts: { id: string; text: string }[] }[] };
export type DebriefExperiment = { id: ExperimentId; title: string; detail: string };
export type DebriefData = {
	notes: DebriefNote[]; // notes first (most runs first), then emerging patterns
	unknown: Unknown[]; // repeated compile errors the catalog does not know
	recent: DebriefSessionCard[]; // the latest finished sessions, newest first
	days: string[]; // local dates with sessions, newest first
	day: Day | null; // the selected day (default: the newest)
	focus: FocusFact[];
	reading: DebriefReading | null;
	factCount: number; // facts a reading could cite; 0 = nothing to read
	backends: { id: string; name: string }[];
	defaultBackend: string;
	experiments: DebriefExperiment[];
	choice: (DebriefExperiment & { at: number; result: { label: string; before: string; after: string; afterSessions: number } }) | null;
	warmup: { patternId: string; short: string; problemId: string; title: string } | null;
};
// POST /debrief/deck    { pattern } -> { ok: true } | { error }  (adds the note's check to the memo deck; append-only)
// POST /debrief/mine    { pattern, text } -> { ok: true } | { error }  (text <= 200 chars; '' clears)
// POST /debrief/choice  { choice: ExperimentId | '' } -> { ok: true } | { error }
// POST /debrief/reading { backend? } -> { reading: DebriefReading } | { error }
// POST /lang/[id]/mark  { kind: 'away' | 'back' | 'idle' | 'active' } -> { recorded: boolean }  (only while the latest session is open)
// POST /lang/[id]/self  { sessionId, state: SelfState | 'none' } -> { recorded: boolean }  (only for a finished session)
export type DebriefOk = { ok: true } | { error: string };
export type DebriefReadingResponse = { reading: DebriefReading } | { error: string };
