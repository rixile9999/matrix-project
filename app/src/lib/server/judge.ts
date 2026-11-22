import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findAvoided, parseCases, type JudgeResult, type LangProblem } from '#lib/core/lang.ts';

const PROBLEMS_DIR = resolve(process.env.PROBLEMS_DIR ?? 'problems');
const WORK_DIR = resolve(process.env.JUDGE_DIR ?? 'data/judge');
const LOCAL_CLI = resolve('../tools/scala-cli');
const SCALA_CLI = process.env.SCALA_CLI ?? (existsSync(LOCAL_CLI) ? LOCAL_CLI : 'scala-cli');
const TIMEOUT_MS = 90_000; // the first run also downloads the compiler

const problemDir = (lang: string, id: string) => join(PROBLEMS_DIR, lang, id);

export function listProblems(lang: string): LangProblem[] {
	const dir = join(PROBLEMS_DIR, lang);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((d) => existsSync(join(dir, d, 'problem.json')))
		.map((d) => JSON.parse(readFileSync(join(dir, d, 'problem.json'), 'utf8')) as LangProblem)
		.sort((a, b) => a.order - b.order);
}

export function loadProblem(lang: string, id: string): LangProblem | null {
	if (!/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(lang)) return null;
	const f = join(problemDir(lang, id), 'problem.json');
	return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as LangProblem) : null;
}

export const loadSolution = (lang: string, id: string) => readFileSync(join(problemDir(lang, id), 'Solution.scala'), 'utf8');

let queue: Promise<unknown> = Promise.resolve();

/** Compiles `code` together with the problem's tests and runs them. Runs are serialized. */
export function judge(lang: string, problem: LangProblem, code: string): Promise<JudgeResult> {
	const run = queue.then(() => runOnce(lang, problem, code));
	queue = run.catch(() => {});
	return run;
}

function runOnce(lang: string, problem: LangProblem, code: string): Promise<JudgeResult> {
	// A stable directory per problem lets the compile server reuse its incremental state.
	const dir = join(WORK_DIR, lang, problem.id);
	mkdirSync(dir, { recursive: true });
	copyFileSync(join(PROBLEMS_DIR, '_harness', 'Judge.scala'), join(dir, 'Judge.scala'));
	copyFileSync(join(problemDir(lang, problem.id), 'Tests.scala'), join(dir, 'Tests.scala'));
	writeFileSync(join(dir, 'User.scala'), code);
	const avoided = findAvoided(code, problem.avoid);

	return new Promise((done) => {
		execFile(SCALA_CLI, ['run', dir, '-q'], { timeout: TIMEOUT_MS, maxBuffer: 1 << 20, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
			const { cases, rest } = parseCases(stdout);
			// Keep only compiler errors, without colour codes, harness warnings or work-dir paths.
			const clean = stderr
				.replace(/\x1b\[[0-9;]*m/g, '')
				.split('\n')
				.filter((l) => l.startsWith('[error]'))
				.map((l) => l.slice(8).replace(/^\S*User\.scala/, 'User.scala'))
				.join('\n')
				.trim();
			if (err && (err as { killed?: boolean }).killed) return done({ status: 'timeout', cases, output: rest, avoided });
			if (cases.length === 0) return done({ status: 'compile_error', cases, output: clean || rest || stderr.trim(), avoided });
			const passed = !err && cases.every((c) => c.status === 'ok');
			done({ status: passed ? 'passed' : 'failed', cases, output: rest, avoided });
		});
	});
}
