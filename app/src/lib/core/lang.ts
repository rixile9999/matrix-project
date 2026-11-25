// Language-study pack: problem format and pure judge helpers.

/** problems/<lang>/<id>/problem.json. Solution.scala and Tests.scala sit next to it. */
export type LangProblem = {
	id: string; // directory name, e.g. "001-sum-of-squares"
	order: number; // position within its level
	level: 1 | 2 | 3; // 1 기본 (1–3 min), 2 응용 (5–10 min), 3 복합 (15–25 min)
	topic: TopicId;
	kind: 'write' | 'fix' | 'refactor' | 'complete'; // refactor: using an `avoid` keyword fails the run
	refs: string[]; // cheat sheet entry ids relevant to this problem (shown with hint 1 and after finishing)
	title: string;
	limitSec: number; // level 1: 60–180, level 2: 300–600, level 3: 900–1500
	targets: string[]; // constructs this problem is meant to teach
	avoid: string[]; // keywords the idiomatic answer does not need, e.g. ["var", "while"]
	statement: string; // Korean, inline `code` allowed
	starter: string; // signature with ??? body
	hints: [string, string]; // 1: which construct; 2: worked example of a similar task
	notes: string; // 2–4 sentences on the syntax that appeared, shown after passing
	// Book-derived problems only. An optional Given.scala next to problem.json holds code the
	// learner builds on (earlier exercises' results); it is compiled with the submission and shown read-only.
	book?: { id: string; chapter: number; exercise: string }; // exercise label as in the book, e.g. "3.7"
	intent?: string; // 출제 취지: why the book asks this, 2–3 Korean sentences; shown with hint 1 and after finishing
};

/** problems/<lang>/_books.json: book id -> metadata. */
export type BookMeta = { title: string; chapters: Record<string, string> };

export type CaseResult = { name: string; status: 'ok' | 'fail' | 'error'; detail: string };
export type JudgeResult = {
	status: 'passed' | 'failed' | 'compile_error' | 'timeout';
	cases: CaseResult[];
	output: string; // compiler diagnostics, or the user's own stdout
	avoided: string[]; // entries of problem.avoid found in the submitted code
};

const CASE = '##CASE|';

export function parseCases(stdout: string): { cases: CaseResult[]; rest: string } {
	const cases: CaseResult[] = [];
	const rest: string[] = [];
	for (const line of stdout.split('\n')) {
		if (!line.startsWith(CASE)) {
			rest.push(line);
			continue;
		}
		const [status, name, ...detail] = line.slice(CASE.length).split('|');
		if (status === 'ok' || status === 'fail' || status === 'error') cases.push({ name, status, detail: detail.join('|') });
	}
	return { cases, rest: rest.join('\n').trim() };
}

/**
 * Which of `avoid` appear in the code, ignoring comments and string literals. Entries are whole words
 * ("for"), several words with any whitespace between them ("case class"), or symbols ("=>", "::").
 */
export function findAvoided(code: string, avoid: string[]): string[] {
	const stripped = code
		.replace(/"""[\s\S]*?"""/g, '""')
		.replace(/"(?:\\.|[^"\\\n])*"/g, '""')
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/.*$/gm, ' ');
	const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return avoid.filter((w) => {
		const body = w.trim().split(/\s+/).map(esc).join('\\s+');
		// word boundaries only where the entry itself starts / ends with a word character
		const re = new RegExp(`${/^\w/.test(w) ? '(?<![\\w.])' : ''}${body}${/\w$/.test(w) ? '(?!\\w)' : ''}`);
		return re.test(stripped);
	});
}

export const TOPICS = {
	syntax: '기본 문법',
	collections: '컬렉션',
	folds: 'fold·누적',
	maps: 'Map·Set',
	pattern: '패턴 매칭',
	errors: 'Option·Either·Try',
	strings: '문자열',
	recursion: '재귀',
	lazy: '지연 평가',
	types: '타입·ADT',
	functions: '함수',
	context: 'given·extension',
	sugar: '컴파일러 변환'
} as const;
export type TopicId = keyof typeof TOPICS;

export const LEVELS = { 1: '기본', 2: '응용', 3: '복합' } as const;

/** Test names may be "단계 › 케이스"; the part before " › " groups cases into stages. */
export const STAGE_SEP = ' › ';

/** cheatsheet/<lang>/<topic>.json holds CheatEntry[]. Ids are fixed by cheatsheet/<lang>/_index.json. */
export type CheatEntry = {
	id: string;
	topic: TopicId;
	title: string;
	// Scala 3 snippet. A line ending in `// => text` is checked by scripts/verify-cheatsheet.ts:
	// `text` must equal the toString of that line's expression (or of the val the line defines).
	code: string;
	text: string; // 1–2 Korean sentences
	scala2?: string; // what differs from Scala 2, only when something does
};
