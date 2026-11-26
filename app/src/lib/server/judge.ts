import { readPack } from './content-language.ts';
import { runScala } from './worker.ts';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findAvoided, parseCases, type BookMeta, type JudgeResult, type LangProblem } from '#lib/core/lang.ts';

const PROBLEMS_DIR = resolve(process.env.PROBLEMS_DIR ?? 'problems');
const problemDir = (lang: string, id: string) => join(PROBLEMS_DIR, lang, id);

export function listProblems(lang: string): LangProblem[] {
	const dir = join(PROBLEMS_DIR, lang);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((d) => existsSync(join(dir, d, 'problem.json')))
		.map((d) => readPack(readFileSync(join(dir, d, 'problem.json'), 'utf8')) as LangProblem)
		.sort((a, b) => a.level - b.level || a.order - b.order);
}

export function loadProblem(lang: string, id: string): LangProblem | null {
	if (!/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(lang)) return null;
	const f = join(problemDir(lang, id), 'problem.json');
	return existsSync(f) ? (readPack(readFileSync(f, 'utf8')) as LangProblem) : null;
}

export const loadSolution = (lang: string, id: string) => readFileSync(join(problemDir(lang, id), 'Solution.scala'), 'utf8');

/** Code the learner builds on (book problems), or null. */
export function loadGiven(lang: string, id: string): string | null {
	const f = join(problemDir(lang, id), 'Given.scala');
	return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

export function loadBooks(lang: string): Record<string, BookMeta> {
	const f = join(PROBLEMS_DIR, lang, '_books.json');
	return existsSync(f) ? readPack(readFileSync(f, 'utf8')) : {};
}

export async function judge(lang: string, problem: LangProblem, code: string, owner?: string): Promise<JudgeResult> {
	const files: Record<string,string> = {
		'Judge.scala': readFileSync(join(PROBLEMS_DIR, '_harness', 'Judge.scala'),'utf8'),
		'Tests.scala': readFileSync(join(problemDir(lang,problem.id),'Tests.scala'),'utf8'),
		'User.scala': code
	};
	const given = loadGiven(lang, problem.id);
	if (given !== null) files['Given.scala'] = given;
	const avoided = findAvoided(code, problem.avoid);
	const {stdout, stderr, code: exit, timedOut} = await runScala(files,owner);
	const { cases, rest } = parseCases(stdout);
	// Keep only compiler errors, without colour codes, harness warnings or work-dir paths.
	const clean = stderr
		.replace(/\x1b\[[0-9;]*m/g, '')
		.split('\n')
		.filter((l) => l.startsWith('[error]'))
		.map((l) => l.slice(8).replace(/^\S*User\.scala/, 'User.scala'))
		.join('\n')
		.trim();
	if (timedOut) return ({ status: 'timeout', cases, output: rest, avoided });
	if (cases.length === 0) return ({ status: 'compile_error', cases, output: clean || rest || stderr.trim(), avoided });
	const allOk = exit === 0 && cases.every((c) => c.status === 'ok');
	if (allOk && problem.kind === 'refactor' && avoided.length > 0) {
		const used = avoided.map((w) => '`' + w + '`').join(', ');
		return ({ status: 'failed', cases, output: `테스트는 통과했지만 ${used} 사용이 남아 있습니다. 이 문제는 그것 없이 다시 쓰는 것이 목표입니다.`, avoided });
	}
	return ({ status: allOk ? 'passed' : 'failed', cases, output: rest, avoided });
}
