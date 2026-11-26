// The in-app question-answering side panel ("Operator"): pure rules and the answer format.
// Backends are agent CLIs run without tools (src/lib/server/coach.ts). Nothing here does I/O.

/** Display name of the feature. Change it here only. */
export const COACH_NAME = 'Operator';

export const BACKENDS = { claude: 'Claude Code', codex: 'Codex', qwen: 'Qwen Code' } as const;
export type BackendId = keyof typeof BACKENDS;

/** What a question is about. Statistics threads belong to a specific lesson run. */
export type CoachContext = { kind: 'lang'; id: string } | { kind: 'memo'; id: string } | { kind: 'stats'; id: string; runId: number };

export const isCoachKind = (value: unknown): value is CoachContext['kind'] => value === 'lang' || value === 'memo' || value === 'stats';

export const isCoachRunId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * locked  = no questions (the timer is running: the result must be the learner's own);
 * limited = questions allowed, the backend is NOT given the model solution, notes, hints or intent;
 * full    = everything about the item is given to the backend.
 */
export type CoachAccess = 'locked' | 'limited' | 'full';

/** Access for a language problem, from its latest session. No session = locked. */
export function langAccess(s: { startedAt: number; endedAt: number | null } | null, limitSec: number, now: number): CoachAccess {
	if (!s) return 'locked';
	if (s.endedAt !== null) return 'full';
	return now > s.startedAt + limitSec ? 'limited' : 'locked';
}

// ---------- answer format ----------
// An answer is Markdown (paragraphs, `inline code`, fenced code) plus optional visual blocks:
// fenced blocks whose info string is one of BLOCK_KINDS and whose body is JSON (svg: raw SVG markup).

/**
 * trace: a value followed step by step. Each step's `expr` is a Scala 3 expression evaluated after `setup`;
 * `value` is what the coach claims its toString is. The server runs them (verifyTrace) and reports the truth.
 */
export type TraceBlock = {
	title: string;
	setup: string; // Scala lines defining what the steps use, e.g. "val xs = List(3, 1, 4)"
	cells?: string[]; // optional row of boxes to show (the collection being walked)
	steps: { note: string; expr: string; value: string; at?: number /* index into cells to highlight */ }[];
};
/** flow: code rewritten in stages (e.g. a for-comprehension desugared), each with a one-line reason for the step that follows. */
export type FlowBlock = { title: string; steps: { code: string; note?: string }[] };
/** compare: two versions side by side; differing lines are highlighted by the UI. */
export type CompareBlock = { left: { title: string; code: string }; right: { title: string; code: string } };

export type Segment =
	| { type: 'text'; text: string }
	| { type: 'code'; lang: string; code: string }
	| { type: 'trace'; block: TraceBlock }
	| { type: 'flow'; block: FlowBlock }
	| { type: 'compare'; block: CompareBlock }
	| { type: 'svg'; svg: string };

export const BLOCK_KINDS = ['trace', 'flow', 'compare', 'svg'] as const;

const str = (v: unknown): v is string => typeof v === 'string';
const isTrace = (b: any): b is TraceBlock =>
	b && str(b.title) && str(b.setup) && Array.isArray(b.steps) && b.steps.length > 0 && b.steps.length <= 30 &&
	b.steps.every((s: any) => s && str(s.note) && str(s.expr) && str(s.value) && (s.at === undefined || Number.isInteger(s.at))) &&
	(b.cells === undefined || (Array.isArray(b.cells) && b.cells.every(str)));
const isFlow = (b: any): b is FlowBlock =>
	b && str(b.title) && Array.isArray(b.steps) && b.steps.length > 0 && b.steps.every((s: any) => s && str(s.code) && (s.note === undefined || str(s.note)));
const isCompare = (b: any): b is CompareBlock =>
	b && [b.left, b.right].every((s: any) => s && str(s.title) && str(s.code));

/**
 * Splits an answer into segments. A visual block that is not valid (bad JSON, wrong shape) degrades to a
 * plain code segment, so a sloppy answer still shows something. An unterminated fence (text still streaming)
 * is shown as code so far.
 */
export function parseAnswer(text: string): Segment[] {
	const out: Segment[] = [];
	const push = (t: string) => {
		if (t.trim()) out.push({ type: 'text', text: t.trim() });
	};
	const re = /^```([\w-]*)[^\n]*\n([\s\S]*?)(?:(^```[ \t]*$)|(?![\s\S]))/gm;
	let last = 0;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		push(text.slice(last, m.index));
		last = re.lastIndex;
		const lang = m[1];
		const body = m[2].replace(/\n$/, '');
		const closed = m[3] !== undefined; // the closing fence matched (not just the end of the text)
		let seg: Segment = { type: 'code', lang, code: body };
		if (closed && lang === 'svg' && /^\s*<svg[\s>]/.test(body)) seg = { type: 'svg', svg: body };
		else if (closed && (lang === 'trace' || lang === 'flow' || lang === 'compare')) {
			try {
				const b = JSON.parse(body);
				if (lang === 'trace' && isTrace(b)) seg = { type: 'trace', block: b };
				else if (lang === 'flow' && isFlow(b)) seg = { type: 'flow', block: b };
				else if (lang === 'compare' && isCompare(b)) seg = { type: 'compare', block: b };
			} catch {
				// keep as code
			}
		}
		out.push(seg);
	}
	push(text.slice(last));
	return out;
}
