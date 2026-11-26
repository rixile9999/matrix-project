// Checks every problem: schema, model solution passes, starter (???) does not.
// Usage: node scripts/verify-problems.ts [lang] [idPrefix]
import { judge, listProblems, loadBooks, loadSolution } from '../src/lib/server/judge.ts';
import { cheatIndex } from '../src/lib/server/cheatsheet.ts';
import { TOPICS } from '../src/lib/core/lang.ts';

const [lang = 'scala', prefix = ''] = process.argv.slice(2);
let bad = 0;
const seen = new Set<string>();
const TOPIC_IDS = Object.keys(TOPICS);
const cheatIds = new Set(Object.values(cheatIndex(lang)).flat().map(([id]) => id));
const books = loadBooks(lang);
const LIMITS = { 1: [60, 180], 2: [300, 600], 3: [900, 1500] } as const;
for (const p of listProblems(lang).filter((p) => p.id.startsWith(prefix))) {
	const problems: string[] = [];
	for (const k of ['id', 'title', 'statement', 'starter', 'notes'] as const) if (!p[k]) problems.push(`missing ${k}`);
	if (p.hints?.length !== 2) problems.push('hints must have 2 entries');
	if (!p.targets?.length) problems.push('no targets');
	if (seen.has(`${p.level}/${p.order}`)) problems.push(`duplicate order ${p.order} in level ${p.level}`);
	seen.add(`${p.level}/${p.order}`);
	if (![1, 2, 3].includes(p.level)) problems.push(`bad level ${p.level}`);
	else if (p.limitSec < LIMITS[p.level][0] || p.limitSec > LIMITS[p.level][1]) problems.push(`limitSec ${p.limitSec} outside ${LIMITS[p.level]} for level ${p.level}`);
	if (!TOPIC_IDS.includes(p.topic)) problems.push(`bad topic ${p.topic}`);
	if (!['write', 'fix', 'refactor', 'complete'].includes(p.kind)) problems.push(`bad kind ${p.kind}`);
	for (const r of p.refs ?? []) if (!cheatIds.has(r)) problems.push(`unknown cheat sheet ref ${r}`);
	if (!p.refs) problems.push('missing refs');
	if (p.book) {
		const b = books[p.book.id];
		if (!b) problems.push(`unknown book ${p.book.id}`);
		else if (!b.chapters[String(p.book.chapter)]) problems.push(`unknown chapter ${p.book.chapter}`);
		if (!/^\d+\.\d+$/.test(p.book.exercise ?? '')) problems.push('book.exercise must look like "3.7"');
		if (!p.intent || p.intent.length < 30) problems.push('book problems need an intent (출제 취지)');
	}
	const sol = await judge(lang, p, loadSolution(lang, p.id), 'maintenance');
	if (sol.status !== 'passed') problems.push(`solution ${sol.status}: ${sol.output || JSON.stringify(sol.cases.filter((c) => c.status !== 'ok'))}`);
	if (sol.cases.length < (p.level === 1 ? 3 : 4)) problems.push(`only ${sol.cases.length} test cases`);
	if (sol.avoided.length) problems.push(`solution uses avoided: ${sol.avoided}`);
	const st = await judge(lang, p, p.starter, 'maintenance');
	if (st.status === 'passed') problems.push('starter passes as given');
	// write/complete: the gap is a ??? body, or a missing member whose compile error is the lesson
	if ((p.kind === 'write' || p.kind === 'complete') && !p.starter.includes('???') && st.status !== 'compile_error') problems.push('starter has no ??? and compiles');
	if (p.kind === 'fix' && st.status === 'compile_error') problems.push('fix starter must compile (the bug is a wrong result, not a compile error)');
	if (p.kind === 'refactor' && !(st.cases.length > 0 && st.cases.every((c) => c.status === 'ok') && st.avoided.length > 0)) problems.push('refactor starter must pass all tests while using an avoided keyword');
	console.log(`${problems.length ? 'FAIL' : 'ok  '} ${p.id} (${sol.cases.length} cases)${problems.map((x) => '\n     - ' + x).join('')}`);
	if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
