// Compiles every cheat sheet snippet and checks each `// => text` annotation against the real value.
// Usage: node scripts/verify-cheatsheet.ts [lang] [topic ...]   (no topics = all; also checks the id list)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cheatIndex, listCheatEntries } from '../src/lib/server/cheatsheet.ts';
import { TOPICS, type CheatEntry } from '../src/lib/core/lang.ts';

const [lang = 'scala', ...only] = process.argv.slice(2);
const index = cheatIndex(lang);
const topics = (only.length ? only : Object.keys(TOPICS)) as (keyof typeof TOPICS)[];
const entries = listCheatEntries(lang).filter((e) => topics.includes(e.topic));
const problems: string[] = [];

// 1. ids: every indexed id of the selected topics is written exactly once, and nothing else.
for (const t of topics) {
	const want = new Set((index[t] ?? []).map(([id]) => id));
	const got = entries.filter((e) => e.topic === t).map((e) => e.id);
	for (const id of want) if (!got.includes(id)) problems.push(`${t}: missing entry ${id}`);
	for (const id of got) if (!want.has(id)) problems.push(`${t}: unknown id ${id}`);
	if (new Set(got).size !== got.length) problems.push(`${t}: duplicate ids`);
}
for (const e of entries) {
	if (!e.title || !e.text || !e.code) problems.push(`${e.id}: missing title/text/code`);
	if (!/\/\/ => /.test(e.code)) problems.push(`${e.id}: no checked line (// => …)`);
	if (e.code.split('\n').length > 14) problems.push(`${e.id}: code longer than 14 lines`);
}

// 2. generate one object per entry; annotated lines become Cheat.show calls.
const expected = new Map<string, string>();
const objName = (id: string) => 'E_' + id.replace(/\W/g, '_');
function generate(e: CheatEntry): string {
	const body = e.code.split('\n').map((line, i) => {
		const m = line.match(/^(\s*)(.*?)\s*\/\/ => (.*)$/);
		if (!m) return '  ' + line;
		const [, indent, code, exp] = m;
		expected.set(`${e.id}|${i + 1}`, exp.trim());
		const def = code.match(/^(?:lazy\s+)?val\s+(\w+)\s*(?::[^=]+)?=[^=>]/);
		return def
			? `  ${indent}${code}\n  ${indent}Cheat.show("${e.id}", ${i + 1}, ${def[1]})`
			: `  ${indent}Cheat.show("${e.id}", ${i + 1}, ${code})`;
	});
	return `object ${objName(e.id)}:\n${body.join('\n')}\n`;
}
const dir = resolve(process.env.JUDGE_DIR ?? 'data/judge', 'cheatsheet-' + lang);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
copyFileSync(resolve('cheatsheet/_harness/Cheat.scala'), join(dir, 'Cheat.scala'));
for (const e of entries) writeFileSync(join(dir, `${objName(e.id)}.scala`), generate(e));
writeFileSync(join(dir, 'Main.scala'), `@main def run(): Unit =\n${entries.map((e) => `  Cheat.touch(${objName(e.id)})`).join('\n') || '  ()'}\n`);

// 3. compile + run, compare.
const local = resolve('../tools/scala-cli');
const cli = process.env.SCALA_CLI ?? (existsSync(local) ? local : 'scala-cli');
let out = '';
try {
	out = execFileSync(cli, ['run', dir, '-q'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
} catch (err) {
	const e = err as { stdout?: string; stderr?: string };
	out = e.stdout ?? '';
	const errs = (e.stderr ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => l.startsWith('[error]'));
	problems.push('compile/run failed:\n' + errs.join('\n').replaceAll(dir + '/', ''));
}
const seen = new Set<string>();
for (const line of out.split('\n')) {
	if (!line.startsWith('##SHOW|')) continue;
	const [, id, n, ...rest] = line.split('|');
	const key = `${id}|${n}`;
	seen.add(key);
	const actual = rest.join('|').trim();
	if (expected.get(key) !== actual) problems.push(`${id} line ${n}: annotated "${expected.get(key)}", actual "${actual}"`);
}
for (const key of expected.keys()) if (!seen.has(key)) problems.push(`${key.replace('|', ' line ')}: never evaluated`);

console.log(problems.length ? 'FAIL\n - ' + problems.join('\n - ') : `ok   ${entries.length} entries, ${expected.size} checked lines (${topics.join(', ')})`);
process.exit(problems.length ? 1 : 0);
