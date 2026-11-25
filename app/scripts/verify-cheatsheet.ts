// Compiles every cheat sheet snippet and checks each `// => text` annotation against the real value.
// Usage: node scripts/verify-cheatsheet.ts [lang] [topic ...]   (no topics = all; also checks the id list)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SCALA_CLI, annotatedBody, freshDir, parseShows, scalaErrors } from '../src/lib/server/scala-run.ts';
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
const generate = (e: CheatEntry) => `object ${objName(e.id)}:\n${annotatedBody(e.id, e.code, expected)}`;
const dir = resolve(process.env.JUDGE_DIR ?? 'data/judge', 'cheatsheet-' + lang);
freshDir(dir);
for (const e of entries) writeFileSync(join(dir, `${objName(e.id)}.scala`), generate(e));
writeFileSync(join(dir, 'Main.scala'), `@main def run(): Unit =\n${entries.map((e) => `  Cheat.touch(${objName(e.id)})`).join('\n') || '  ()'}\n`);

// 3. compile + run, compare.
let out = '';
try {
	out = execFileSync(SCALA_CLI, ['run', dir, '-q'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
} catch (err) {
	const e = err as { stdout?: string; stderr?: string };
	out = e.stdout ?? '';
	problems.push('compile/run failed:\n' + scalaErrors(e.stderr ?? '', dir));
}
const seen = new Set<string>();
for (const { key: id, n, actual } of parseShows(out)) {
	const key = `${id}|${n}`;
	seen.add(key);
	if (expected.get(key) !== actual) problems.push(`${id} line ${n}: annotated "${expected.get(key)}", actual "${actual}"`);
}
for (const key of expected.keys()) if (!seen.has(key)) problems.push(`${key.replace('|', ' line ')}: never evaluated`);

console.log(problems.length ? 'FAIL\n - ' + problems.join('\n - ') : `ok   ${entries.length} entries, ${expected.size} checked lines (${topics.join(', ')})`);
process.exit(problems.length ? 1 : 0);
