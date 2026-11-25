// Verifies memo content: schema, references, and every piece of code by actually running it.
// Usage: node scripts/verify-memo.ts [lang] [fileFilter]   (fileFilter = substring of a cards/checks file name)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { judge, loadBooks, loadProblem } from '../src/lib/server/judge.ts';
import { SCALA_CLI, annotatedBody, freshDir, parseShows, scalaErrors } from '../src/lib/server/scala-run.ts';
import { loadPatterns, memoFiles, readMemoFile } from '../src/lib/server/memo-content.ts';
import { TOPICS } from '../src/lib/core/lang.ts';
import type { Check, MemoCard } from '../src/lib/core/memo.ts';

const [lang = 'scala', filter = ''] = process.argv.slice(2);
const topics = Object.keys(TOPICS);
const patterns = loadPatterns(lang);
const books = loadBooks(lang);
const bad: string[] = [];
const err = (id: string, m: string) => bad.push(`${id}: ${m}`);

// ids must be unique across ALL files, even when only some are being verified
const allIds = new Map<string, string>();
const cards: MemoCard[] = [];
const checks: Check[] = [];
for (const sub of ['cards', 'checks'] as const)
	for (const f of memoFiles(lang, sub)) {
		let items: (MemoCard | Check)[];
		try {
			items = readMemoFile(lang, sub, f);
		} catch (e) {
			bad.push(`${sub}/${f}: invalid JSON (${(e as Error).message})`);
			continue;
		}
		for (const it of items) {
			const key = `${sub}:${it.id}`;
			if (allIds.has(key)) err(it.id, `duplicate id (in ${allIds.get(key)} and ${f})`);
			allIds.set(key, f);
			if (!f.includes(filter)) continue;
			if (sub === 'cards') cards.push(it as MemoCard);
			else checks.push(it as Check);
		}
	}

const snippets: { key: string; code: string }[] = [];
const problemOk = (id: string, pid: string) => {
	const p = loadProblem(lang, pid);
	if (!p) err(id, `unknown problem ${pid}`);
	return p;
};
const common = (it: { id: string; topic: string; prompt: string; unlock: string[] }) => {
	if (!/^[a-z0-9-]+$/.test(it.id ?? '')) err(it.id, 'id must be kebab-case');
	if (!topics.includes(it.topic)) err(it.id, `bad topic ${it.topic}`);
	if (!it.prompt || it.prompt.length > 220) err(it.id, 'prompt missing or longer than 220 chars');
	if (!Array.isArray(it.unlock)) err(it.id, 'unlock must be an array');
	else for (const u of it.unlock) problemOk(it.id, u);
};

for (const c of cards) {
	common(c);
	if (!['concept', 'recognize', 'steps', 'line'].includes(c.kind)) err(c.id, `bad kind ${c.kind}`);
	if (!c.title || !c.summary) err(c.id, 'title and summary are required');
	const [lo, hi] = c.kind === 'line' ? [1, 2] : [2, 4];
	if (!Array.isArray(c.points) || c.points.length < lo || c.points.length > hi) err(c.id, `points must have ${lo}–${hi} entries`);
	else for (const p of c.points) if (!p || p.length > 140) err(c.id, 'a point is empty or longer than 140 chars');
	if (c.kind !== 'concept' && !(c.pattern && patterns[c.pattern])) err(c.id, `pattern missing or unknown (${c.pattern})`);
	if (c.pattern && !patterns[c.pattern]) err(c.id, `unknown pattern ${c.pattern}`);
	if (c.book && !books[c.book.id]?.chapters[String(c.book.chapter)]) err(c.id, 'unknown book or chapter');
	if (c.kind === 'line' && !(c.promptCode ?? '').includes('____')) err(c.id, 'line cards need promptCode with a ____ blank');
	if (c.kind === 'line' && !c.answerCode) err(c.id, 'line cards need answerCode');
	if (c.answerCode) {
		if (!c.verify) err(c.id, 'answerCode needs verify');
		else {
			const have = new Set(c.verify.split('\n').map((l) => l.replace(/\s*\/\/ => .*$/, '').trim()));
			for (const l of c.answerCode.split('\n').map((l) => l.trim()).filter(Boolean))
				if (!have.has(l)) err(c.id, `verify does not contain the answerCode line: ${l}`);
		}
	}
	if (c.verify) snippets.push({ key: `card-${c.id}`, code: c.verify });
}

const optionsOk = (c: { id: string; options: { text: string; why: string }[]; answer: number }) => {
	if (!Array.isArray(c.options) || c.options.length !== 4) return err(c.id, 'exactly 4 options');
	if (new Set(c.options.map((o) => o.text)).size !== 4) err(c.id, 'options must be distinct');
	if (c.options.some((o) => !o.text || !o.why)) err(c.id, 'every option needs text and why');
	if (!(c.answer >= 0 && c.answer < 4)) err(c.id, 'answer must be an option index');
};
const traceExpect = new Map<string, string>();
for (const c of checks) {
	common(c);
	if (c.kind === 'trace') {
		optionsOk(c);
		if (!c.code || !c.verify) err(c.id, 'code and verify are required');
		else {
			snippets.push({ key: `check-${c.id}`, code: c.verify });
			traceExpect.set(`check-${c.id}`, c.options[c.answer]?.text ?? '');
		}
	} else if (c.kind === 'approach') optionsOk(c);
	else if (c.kind === 'order') {
		const p = problemOk(c.id, c.problem);
		if (!Array.isArray(c.lines) || c.lines.length < 4 || c.lines.length > 9) err(c.id, 'lines must have 4–9 entries');
		if (!c.distractors?.length || c.distractors.length > 2) err(c.id, '1–2 distractors');
		if (p && Array.isArray(c.lines)) {
			const pre = c.given ? c.given + '\n' : '';
			const r = await judge(lang, p, pre + c.lines.join('\n'));
			if (r.status !== 'passed') err(c.id, `correct order does not pass (${r.status}) ${r.output}`);
			for (const d of c.distractors ?? []) {
				if (!d.why || !(d.replaces >= 0 && d.replaces < c.lines.length)) { err(c.id, 'distractor needs why and a valid replaces index'); continue; }
				const swapped = c.lines.map((l, i) => (i === d.replaces ? d.line : l));
				const rd = await judge(lang, p, pre + swapped.join('\n'));
				if (rd.status === 'passed') err(c.id, `distractor still passes: ${d.line.trim()}`);
			}
		}
	} else if (c.kind === 'bug') {
		const p = problemOk(c.id, c.problem);
		if (!c.why || !c.fixed) err(c.id, 'why and fixed are required');
		if (!Array.isArray(c.lines) || !(c.bugIndex >= 0 && c.bugIndex < c.lines.length)) err(c.id, 'bugIndex must be a line index');
		else if (p) {
			const pre = c.given ? c.given + '\n' : '';
			const r = await judge(lang, p, pre + c.lines.join('\n'));
			if (r.status !== 'failed') err(c.id, `buggy version must compile and fail, got ${r.status}`);
			const rf = await judge(lang, p, pre + c.lines.map((l, i) => (i === c.bugIndex ? c.fixed : l)).join('\n'));
			if (rf.status !== 'passed') err(c.id, `fixed version does not pass (${rf.status})`);
		}
	} else err((c as Check).id, `bad kind ${(c as Check).kind}`);
}

// run all snippets in one compile
if (snippets.length) {
	const expected = new Map<string, string>();
	const obj = (k: string) => 'M_' + k.replace(/\W/g, '_');
	const gen = (s: { key: string; code: string }) => `object ${obj(s.key)}:\n${annotatedBody(s.key, s.code, expected)}`;
	const dir = resolve(process.env.JUDGE_DIR ?? 'data/judge', 'memo-' + lang);
	freshDir(dir);
	for (const s of snippets) writeFileSync(join(dir, `${obj(s.key)}.scala`), gen(s));
	writeFileSync(join(dir, 'Main.scala'), `@main def run(): Unit =\n${snippets.map((s) => `  Cheat.touch(${obj(s.key)})`).join('\n')}\n`);
	let out = '';
	try {
		out = execFileSync(SCALA_CLI, ['run', dir, '-q'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
	} catch (e) {
		const x = e as { stdout?: string; stderr?: string };
		out = x.stdout ?? '';
		bad.push('snippets failed to compile/run:\n' + scalaErrors(x.stderr ?? '', dir));
	}
	const actualByKey = new Map<string, string[]>();
	const seen = new Set<string>();
	for (const { key, n, actual } of parseShows(out)) {
		seen.add(`${key}|${n}`);
		actualByKey.set(key, [...(actualByKey.get(key) ?? []), actual]);
		if (expected.get(`${key}|${n}`) !== actual) bad.push(`${key} line ${n}: annotated "${expected.get(`${key}|${n}`)}", actual "${actual}"`);
	}
	for (const k of expected.keys()) if (!seen.has(k)) bad.push(`${k.replace('|', ' line ')}: never evaluated`);
	for (const s of snippets) if (![...expected.keys()].some((k) => k.startsWith(s.key + '|'))) bad.push(`${s.key}: verify has no // => line`);
	for (const [key, want] of traceExpect) if (!(actualByKey.get(key) ?? []).includes(want)) bad.push(`${key}: the correct option "${want}" is not a value produced by verify`);
}

console.log(bad.length ? 'FAIL\n - ' + bad.join('\n - ') : `ok   ${cards.length} cards, ${checks.length} checks, ${snippets.length} snippets run`);
process.exit(bad.length ? 1 : 0);
