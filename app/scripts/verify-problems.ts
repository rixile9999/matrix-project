// Checks every problem: schema, model solution passes, starter (???) does not.
// Usage: node scripts/verify-problems.ts [lang] [idPrefix]
import { judge, listProblems, loadSolution } from '../src/lib/server/judge.ts';

const [lang = 'scala', prefix = ''] = process.argv.slice(2);
let bad = 0;
const seen = new Set<number>();
for (const p of listProblems(lang).filter((p) => p.id.startsWith(prefix))) {
	const problems: string[] = [];
	for (const k of ['id', 'title', 'statement', 'starter', 'notes'] as const) if (!p[k]) problems.push(`missing ${k}`);
	if (p.hints?.length !== 2) problems.push('hints must have 2 entries');
	if (!p.targets?.length) problems.push('no targets');
	if (seen.has(p.order)) problems.push(`duplicate order ${p.order}`);
	seen.add(p.order);
	if (!p.starter.includes('???')) problems.push('starter has no ???');
	const sol = await judge(lang, p, loadSolution(lang, p.id));
	if (sol.status !== 'passed') problems.push(`solution ${sol.status}: ${sol.output || JSON.stringify(sol.cases.filter((c) => c.status !== 'ok'))}`);
	if (sol.cases.length < 4) problems.push(`only ${sol.cases.length} test cases`);
	if (sol.avoided.length) problems.push(`solution uses avoided: ${sol.avoided}`);
	const st = await judge(lang, p, p.starter);
	if (st.status === 'passed') problems.push('starter passes the tests');
	console.log(`${problems.length ? 'FAIL' : 'ok  '} ${p.id} (${sol.cases.length} cases)${problems.map((x) => '\n     - ' + x).join('')}`);
	if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
