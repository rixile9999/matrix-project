// Shared by the verify scripts and the Operator's trace check: run Scala snippets and read back their values.
// A snippet line ending in `// => value` is evaluated with Cheat.show (cheatsheet/_harness/Cheat.scala), which prints
// `##SHOW|<key>|<line>|<toString>`; the caller compares that with the annotation.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export { SCALA_CLI, WORK_DIR } from './judge.ts';

const ANSI = /\x1b\[[0-9;]*m/g;

/** An empty directory containing only the Cheat harness; scala-cli runs it as a project. */
export function freshDir(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	copyFileSync(resolve('cheatsheet/_harness/Cheat.scala'), join(dir, 'Cheat.scala'));
}

/**
 * The body of `object X:` for a snippet: every `// => value` line gets a Cheat.show after it
 * (a `val x = …` shows x). Expected values are recorded in `expected` under `<key>|<line number>`.
 */
export function annotatedBody(key: string, code: string, expected: Map<string, string>): string {
	return code
		.split('\n')
		.map((line, i) => {
			const m = line.match(/^(\s*)(.*?)\s*\/\/ => (.*)$/);
			if (!m) return '  ' + line;
			const [, indent, body, exp] = m;
			expected.set(`${key}|${i + 1}`, exp.trim());
			const def = body.match(/^(?:lazy\s+)?val\s+(\w+)\s*(?::[^=]+)?=[^=>]/);
			return def ? `  ${indent}${body}\n  ${indent}Cheat.show("${key}", ${i + 1}, ${def[1]})` : `  ${indent}Cheat.show("${key}", ${i + 1}, ${body})`;
		})
		.join('\n') + '\n';
}

/** `##SHOW|key|n|value` lines of a run's stdout. */
export function parseShows(stdout: string): { key: string; n: string; actual: string }[] {
	const out: { key: string; n: string; actual: string }[] = [];
	for (const line of stdout.split('\n')) {
		if (!line.startsWith('##SHOW|')) continue;
		const [, key, n, ...rest] = line.split('|');
		out.push({ key, n, actual: rest.join('|').trim() });
	}
	return out;
}

/** The compiler's `[error]` lines, without colour codes and without the work directory in paths. */
export function scalaErrors(stderr: string, dir: string): string {
	return stderr.replace(ANSI, '').split('\n').filter((l) => l.startsWith('[error]')).join('\n').replaceAll(dir + '/', '');
}
