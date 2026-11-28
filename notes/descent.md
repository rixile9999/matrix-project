# Descent — coach chat + code editor, one screen

Status: in implementation (2026-11-27). Decisions: `notes/simplify.md`. Mockup: `notes/ui-mockup-descent.html` is superseded by the chat layout
(left: conversation, right: editor, top right: trail + three depth dots).

## Idea
One page, `/descent`. The learner talks to the coach; the coach poses a problem; the learner solves it in the editor (existing judge, hints, cheat sheet,
records). When the learner is stuck, the coach may **offer** an easier sub-problem. Accepting it is the learner's own statement that knowledge was missing.
Depth limit 3; at the floor the coach shows a worked example instead. After a sub-problem passes the coach offers to go back up.
We only manage two things: the **workflow** (server-owned state machine) and the **memory** (computed from records).

This round: problems come from the existing verified pool only. Generating problems and web search are later rounds.

## Rules
- The server owns the state. The model only proposes one action per turn; the server validates it against the state and the candidate lists it supplied.
  An invalid action is dropped and only the (sanitised) text is kept; if the text is empty too, a server default line is used.
- While the top problem is being solved and its time limit has not passed, the coach gets NO solution, hints or notes in its context and may not explain
  the solution. A request for help in that phase is answered only by the staged hints: action `hint` → the server calls the existing `useHint` and posts the
  hint text. After the limit passes (or the session ended) the coach may explain freely (same data the existing coach gets at `limited`/`full`).
- An offer to descend is allowed only when the top frame's session is over the limit or ended as `revealed`, the top frame's depth is < 3, and the sub-problem
  id is one of the server's candidates. At depth 3 the only allowed step down is `example` (the floor).
- Records are the truth (rule 23): frames point at ordinary `lang_sessions`; time, hints, lookups, runs are recorded by the existing code paths.
- "Solved" for a problem that needed a descent is only recorded by a later pass: accepting a descent schedules a revisit for the parent 3 days later.
  Going back up right away is allowed and starts a fresh session (`restartSession`), but does not close the revisit.
- Text style: rule G in CLAUDE.md. Coach lines are short (<= 140 chars, at most two sentences), no praise filler, no explanations of the system.
- Bilingual: UI via `t('한국어','English')`, server strings via `tr(...)`, coach replies in the learner's locale.

## core/descent.ts (pure) — package A
```ts
export const MAX_DEPTH = 3;
export const REVISIT_DAYS = 3;
export const SAY_MAX = 140;

export type FrameStatus = 'solving' | 'held' | 'passed' | 'failed';   // failed = ended revealed
export type Frame = { id: number; problemId: string; depth: number; status: FrameStatus; overtime: boolean; gap: string | null };
export type Pending = { kind: 'descend'; problemId: string; gap: string } | { kind: 'ascend' } | null;
export type State = { stack: Frame[]; pending: Pending };              // stack[0] is the root; the top is the last element

export type Action =
	| { type: 'say' }
	| { type: 'pose'; problemId: string }
	| { type: 'offer'; problemId: string; gap: string }                  // gap: 2–40 chars, names the missing piece (e.g. "zip")
	| { type: 'ascend' }
	| { type: 'example' }
	| { type: 'hint' };
export type Reply = { say: string; action: Action };

export type Candidates = { pose: string[]; offer: string[] };          // problem ids the server allows this turn
export function allowed(state: State, c: Candidates): Action['type'][]; // which action types are legal right now
export function validate(reply: Reply, state: State, c: Candidates): Reply; // illegal action -> { type: 'say' }; say trimmed to SAY_MAX, single paragraph
export function parseReply(text: string): Reply | null;                 // tolerant JSON extraction of {"say": "...", "action": {...}}

export type Event =
	| { type: 'posed'; frame: Frame }
	| { type: 'offered'; problemId: string; gap: string }
	| { type: 'accepted'; frame: Frame }      // pushes the sub frame; the previous top becomes 'held'
	| { type: 'declined' }
	| { type: 'run'; passed: boolean; overtime: boolean }
	| { type: 'revealed' }
	| { type: 'ascendOffered' }
	| { type: 'ascended' }                    // pops the top; the new top becomes 'solving'
	| { type: 'stay' }                        // declined the ascend offer
	| { type: 'closed' };                     // thread ends, stack cleared
export function reduce(state: State, e: Event): State;                  // pure transition; an impossible event returns the state unchanged

export type Phase = 'idle' | 'solving' | 'stuck' | 'offered' | 'passed' | 'floor';
export function phase(state: State): Phase;  // idle: empty stack; stuck: top solving+overtime or failed, depth < 3; floor: same at depth 3; passed: top passed

export const DESCENT_SYSTEM: (locale: 'ko' | 'en') => string;
export type TurnInput = {
	phase: Phase; allowed: Action['type'][];
	trail: { title: string; depth: number; status: FrameStatus }[];
	memory: string[];                                   // <= 12 short fact lines
	candidates: { pose: PoolItem[]; offer: PoolItem[] };
	problem: { title: string; statement: string; code: string | null; lastResult: string | null; solution: string | null; hintsLeft: number } | null; // solution null while locked
	history: { role: 'me' | 'coach' | 'event'; text: string }[];       // last <= 10
	said: string | null;                                // the learner's new message, if any
	trigger: 'message' | 'stuck' | 'passed' | 'start';
};
export type PoolItem = { id: string; title: string; topic: string; level: 1 | 2 | 3; targets: string[] };
export function turnPrompt(input: TurnInput): string;  // JSON.stringify
```
`DESCENT_SYSTEM` tells the model: you are the Operator, a terse coach; reply with one JSON object `{"say","action"}` only; pick the action from `allowed`;
problem ids only from the candidate lists; never write or describe the solution when `problem.solution` is null — use `hint`; offer a descent only when the
evidence (code, last result) shows a missing piece of knowledge, and name that piece in `gap`; one or two short sentences; no praise filler; ask
"풀어 볼래요?"-style when offering. Tests: every transition, `allowed` per phase, validate drops illegal actions/ids/depth, parse tolerance.

## server/descent.ts — package B
Account tables (in `server/db.ts`, same style as the `debrief_*` tables):
```sql
CREATE TABLE IF NOT EXISTS descent_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, ended_at INTEGER, backend TEXT NOT NULL, pending TEXT);
CREATE TABLE IF NOT EXISTS descent_frames (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, parent_id INTEGER, problem_id TEXT NOT NULL,
  depth INTEGER NOT NULL, gap TEXT, session_id INTEGER, opened_at INTEGER NOT NULL, closed_at INTEGER, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS descent_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, at INTEGER NOT NULL, role TEXT NOT NULL,
  text TEXT NOT NULL, tone TEXT, offer TEXT);
CREATE TABLE IF NOT EXISTS descent_revisits (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL, frame_id INTEGER NOT NULL, due_at INTEGER NOT NULL, done_at INTEGER);
```
Shared (schema `catalog`, created where `catalog.pdf_sets` is created):
```sql
CREATE TABLE IF NOT EXISTS catalog.descent_links (parent_id TEXT NOT NULL, sub_id TEXT NOT NULL, gap TEXT NOT NULL, offered INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (parent_id, sub_id));
```
Only problem ids, the gap label and counters are shared — never a learner's code or text.

Exports
```ts
export function descentData(): DescentData;                       // current open thread (or an empty one), messages, stack, the top problem's session view
export async function turn(body: { text?: unknown; choice?: unknown; backend?: unknown }): Promise<{ status: number; body: DescentOk }>;
export async function sync(): Promise<{ status: number; body: DescentOk }>; // observe records after a run/hint/reveal on the top problem; may trigger a coach turn
export function closeThread(): DescentOk;
export function memoryFacts(locale): string[];                    // gaps (accepted descents), Debrief notes, revisits due, recent passes; <= 12 lines
export function candidates(state): { pose: PoolItem[]; offer: PoolItem[] };
```
- `turn({ text })`: store the learner's message, build `TurnInput`, `askCoach`, `parseReply` → `validate` → apply. `turn({ choice: 'accept' | 'decline' })`
  resolves the pending offer without calling the model for the transition itself, then (accept-descend) `startSession(sub)`, (accept-ascend)
  `restartSession(parent)`; after an accepted descent insert the revisit row for the parent and bump `catalog.descent_links.accepted`.
- `sync()`: read the top frame's latest `lang_sessions`/`lang_runs` rows; append `event` messages for new runs (`통과 · 0:52`, `오류 3 · 시간 끝` style, terse);
  update frame status; when the phase just became `stuck`, `floor` or `passed`, run a coach turn with that trigger. Idempotent: calling it twice adds nothing new
  (track the last seen run id / session state on the frame or thread).
- Applying actions: `pose` → open root frame + `startSession`; `offer` → set pending, message with `offer` JSON, bump `offered`; `ascend` → pending ascend;
  `example` → post the top problem's hint 2 (the worked example) and its cheat-sheet refs as a coach message, mark the frame so it is not repeated;
  `hint` → `useHint` and post the returned hint; `say` → text only.
- Candidates. `pose`: for each topic, the next unpassed problem at level 1 and 2 (skip book problems), plus problems with a due revisit first; cap 16.
  `offer`: links from `catalog.descent_links` for this parent (most accepted first), then pool problems of a lower level sharing the topic or a `refs` entry,
  then (parent at level 1) same-level problems with a smaller `order` sharing a `refs` entry; unpassed first; never a problem already on the stack; cap 6.
- Coach access: build the `problem` block with `solution: null` and no hints while `langAccess(...) === 'locked'`.
- One model call per account at a time (409 otherwise); 150 s timeout; failures become a coach message with a short error and never corrupt state.
- A revisit is `done` when a `lang_sessions` row for that problem passes with `started_at >= due_at` (compute lazily in `descentData`/`memoryFacts`).
- Routes: `src/routes/descent/+page.server.ts` (load → `descentData()`), `src/routes/descent/turn/+server.ts`, `sync/+server.ts`, `close/+server.ts`.
- Tests with a temp account DB and a fake `askCoach`: pose → run fail overtime → offer → accept → sub passes → ascend; illegal offer before overtime is dropped;
  depth 3 floor uses `example`; sync idempotence; locked context has no solution; revisit closes only after the due date.

## UI — package C
`src/routes/descent/+page.svelte` (+ components under `src/lib/descent/` if useful). Nav link `Descent` in `src/routes/+layout.svelte` next to Debrief.
- Left: conversation. `me` right-aligned, `coach` in the display serif, `event` centred mono with tone colour. An open offer shows two buttons
  (`내려가기`/`Descend` + `계속`/`Stay`; ascend: `올라가기`/`Up` + `하나 더`/`Stay`). Input at the bottom (`코치에게`/`To the coach`), Enter sends.
- Right: the top problem — title, statement, `CodeEditor`, clock, run / hint / cheat-sheet buttons, result cases — reusing the endpoints and components the
  existing `src/routes/lang/[id]/+page.svelte` uses (`/lang/[id]/run`, `/hint`, `/lookup`, `/mark`). After each run/hint: `POST /descent/sync`, then `invalidateAll()`.
  When the clock passes the limit, call sync once. Empty state (no problem yet): the editor pane is a quiet blank.
- Top right: trail `root › … › current` and three depth dots.
- While a turn is in flight: a pulse, input disabled. Phone width: panes stack (chat first), no horizontal scroll.
- No explanatory text anywhere; no memory/workflow debug panels.

## Types (already in `src/lib/types.ts`)
`DescentData`, `DescentMessage`, `DescentFrameView`, `DescentOk`.
