// Verifies the Debrief pattern catalog: schema, references, that every sample is recognised by its own pattern
// (and not taken first by an earlier one), and every example by actually running it.
// Usage: node scripts/verify-debrief.ts [lang]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadProblem } from '../src/lib/server/judge.ts';
import { SCALA_CLI, annotatedBody, freshDir, parseShows, scalaErrors } from '../src/lib/server/scala-run.ts';
import { listChecks } from '../src/lib/server/memo-content.ts';
import { examplesOf, matchCompile, matchFailed, type DebriefPattern } from '../src/lib/core/debrief.ts';

const [lang = 'scala'] = process.argv.slice(2);
const bad: string[] = [];
const err = (id: string, m: string) => bad.push(`${id}: ${m}`);

let catalog: DebriefPattern[] = [];
try {
	catalog = JSON.parse(readFileSync(resolve('debrief', lang, 'patterns.json'), 'utf8'));
} catch (e) {
	console.log(`FAIL\n - patterns.json: ${(e as Error).message}`);
	process.exit(1);
}
const checks = new Map(listChecks(lang).map((c) => [c.id, c]));
const ids = new Set<string>();
const regexOk = (id: string, name: string, src: string | undefined) => {
	if (src === undefined) return;
	try {
		new RegExp(src);
	} catch (e) {
		err(id, `${name} is not a valid regex (${(e as Error).message})`);
	}
};

for (const p of catalog) {
	if (!/^[a-z0-9-]+$/.test(p.id ?? '')) err(String(p.id), 'id must be kebab-case');
	if (ids.has(p.id)) err(p.id, 'duplicate id');
	ids.add(p.id);
	if (!p.title || !p.short) err(p.id, 'title and short are required');
	if (p.on !== 'compile' && p.on !== 'failed') err(p.id, `bad on ${p.on}`);
	for (const k of ['message', 'source', 'caret', 'cases', 'code'] as const) regexOk(p.id, k, p[k]);
	if (p.on === 'compile' && !p.message && !p.source && !p.caret) err(p.id, 'a compile pattern needs message, source or caret');
	if (p.on === 'failed' && !p.cases) err(p.id, 'a failed pattern needs cases');
	if (!Array.isArray(p.rule) || p.rule.length < 1 || p.rule.length > 3 || p.rule.some((r) => !r || r.length > 160)) err(p.id, 'rule: 1–3 lines, each <= 160 chars');
	if (!examplesOf(p.verify ?? '').length) err(p.id, 'verify needs at least one `// =>` line');
	const c = checks.get(p.check);
	if (!c) err(p.id, `unknown check ${p.check}`);
	else if (c.kind !== 'trace' || c.debrief !== p.id) err(p.id, `check ${p.check} must be a trace check with debrief = "${p.id}"`);
	for (const pid of p.practice ?? []) if (!loadProblem(lang, pid)) err(p.id, `unknown practice problem ${pid}`);
	if (!p.practice?.length) err(p.id, 'practice needs at least one problem');
	if (!p.samples?.length) err(p.id, 'samples needs at least one real failure');
}
// every debrief check belongs to a pattern
for (const c of checks.values()) if (c.debrief && !catalog.some((p) => p.check === c.id && p.id === c.debrief)) err(c.id, `check names debrief "${c.debrief}" but no pattern uses it`);

// samples: recognised by their own pattern, and that pattern is the first in catalog order that recognises them
for (const p of catalog)
	(p.samples ?? []).forEach((s, i) => {
		const isCompile = p.on === 'compile';
		const hit = (q: DebriefPattern) =>
			isCompile ? matchCompile(q, { message: s.message ?? '', source: s.source ?? '', caret: s.caret ?? '' }) : matchFailed(q, s.cases ?? [], s.code ?? '');
		if (!hit(p)) err(p.id, `sample ${i + 1} is not recognised`);
		else {
			const first = catalog.find(hit)!;
			if (first.id !== p.id) err(p.id, `sample ${i + 1} is taken first by ${first.id}`);
		}
	});

// run every example in one compile
const snippets = catalog.filter((p) => p.verify).map((p) => ({ key: `pattern-${p.id}`, code: p.verify }));
if (snippets.length) {
	const expected = new Map<string, string>();
	const obj = (k: string) => 'D_' + k.replace(/\W/g, '_');
	const dir = resolve(process.env.JUDGE_DIR ?? 'data/judge', 'debrief-' + lang);
	freshDir(dir);
	for (const s of snippets) writeFileSync(join(dir, `${obj(s.key)}.scala`), `object ${obj(s.key)}:\n${annotatedBody(s.key, s.code, expected)}`);
	writeFileSync(join(dir, 'Main.scala'), `@main def run(): Unit =\n${snippets.map((s) => `  Cheat.touch(${obj(s.key)})`).join('\n')}\n`);
	let out = '';
	try {
		out = execFileSync(SCALA_CLI, ['run', dir, '-q'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
	} catch (e) {
		const x = e as { stdout?: string; stderr?: string };
		out = x.stdout ?? '';
		bad.push('examples failed to compile/run:\n' + scalaErrors(x.stderr ?? '', dir));
	}
	const seen = new Set<string>();
	for (const { key, n, actual } of parseShows(out)) {
		seen.add(`${key}|${n}`);
		if (expected.get(`${key}|${n}`) !== actual) bad.push(`${key} line ${n}: annotated "${expected.get(`${key}|${n}`)}", actual "${actual}"`);
	}
	for (const k of expected.keys()) if (!seen.has(k)) bad.push(`${k.replace('|', ' line ')}: never evaluated`);
}

console.log(bad.length ? 'FAIL\n - ' + bad.join('\n - ') : `ok   ${catalog.length} patterns, ${catalog.reduce((n, p) => n + (p.samples?.length ?? 0), 0)} samples, ${snippets.length} example snippets run`);
process.exit(bad.length ? 1 : 0);
