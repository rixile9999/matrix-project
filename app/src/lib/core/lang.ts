// Language-study pack: problem format and pure judge helpers.

/** problems/<lang>/<id>/problem.json. Solution.scala and Tests.scala sit next to it. */
export type LangProblem = {
	id: string; // directory name, e.g. "001-sum-of-squares"
	order: number; // curriculum position
	title: string;
	limitSec: number; // 300–600
	targets: string[]; // constructs this problem is meant to teach
	avoid: string[]; // keywords the idiomatic answer does not need, e.g. ["var", "while"]
	statement: string; // Korean, inline `code` allowed
	starter: string; // signature with ??? body
	hints: [string, string]; // 1: which construct; 2: worked example of a similar task
	notes: string; // 2–4 sentences on the syntax that appeared, shown after passing
};

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

/** Which of `avoid` appear as whole words in the code, ignoring comments and string literals. */
export function findAvoided(code: string, avoid: string[]): string[] {
	const stripped = code
		.replace(/"""[\s\S]*?"""/g, '""')
		.replace(/"(?:\\.|[^"\\\n])*"/g, '""')
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/\/\/.*$/gm, ' ');
	return avoid.filter((w) => new RegExp(`(?<![\\w.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).test(stripped));
}
