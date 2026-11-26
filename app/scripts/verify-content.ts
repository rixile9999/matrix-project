// Unified 3-speed content verifier (fast / changed).
// - fast:    pure static checks (no compiler, DB, or network): schema, ID/reference integrity,
//            bilingual parity for authored catalogues, Debrief sample recognition, and pedagogy warnings.
// - changed: runs `fast` plus targeted execution checks for files changed since a base ref (and their
//            referencing items, including deletions/renames). Escalates to `check` + `test` when shared
//            rules, judges, or verifiers change, or when the base ref cannot be resolved.
// Usage:
//   node scripts/verify-content.ts --mode fast [--strict-warn]
//   node scripts/verify-content.ts --mode changed [--base <ref>] [--strict-warn]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONTENT_BOUNDS, LEVEL_LIMIT_SEC } from '../src/lib/core/rules.ts';
import { TOPICS, type CheatEntry, type LangProblem } from '../src/lib/core/lang.ts';
import { examplesOf, matchCompile, matchFailed, type DebriefPattern } from '../src/lib/core/debrief.ts';
import type { Check, MemoCard } from '../src/lib/core/memo.ts';
import { cheatIndex, listCheatEntries } from '../src/lib/server/cheatsheet.ts';
import { loadBooks, loadProblem } from '../src/lib/server/judge.ts';
import { loadPatterns, memoFiles, readMemoFile } from '../src/lib/server/memo-content.ts';
import { lessons } from '../src/lib/server/stats-content.ts';

type Mode = 'fast' | 'changed';
const args = process.argv.slice(2);
const argValue = (flag: string) => {
	const i = args.indexOf(flag);
	return i >= 0 ? args[i + 1] : undefined;
};
const mode = (argValue('--mode') ?? 'fast') as Mode;
const strictWarn = args.includes('--strict-warn');
const baseArg = argValue('--base');

if (mode !== 'fast' && mode !== 'changed') {
	console.error(`Unknown --mode "${mode}". Use "fast" or "changed".`);
	process.exit(2);
}

const LANG = 'scala';
const TOPIC_IDS = Object.keys(TOPICS);

type StaticReport = {
	errors: string[];
	warnings: string[];
	stats: { problems: number; cheat: number; cards: number; checks: number; debrief: number; statsLessons: number };
	problemRefs: Map<string, string[]>;
	memoFileByProblem: Map<string, Set<string>>;
};

function isBilingualCopy(v: unknown): boolean {
	return Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0].trim().length > 0 && v[1].trim().length > 0;
}

function runFastChecks(): StaticReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	const err = (scope: string, msg: string) => errors.push(`[${scope}] ${msg}`);
	const warn = (scope: string, msg: string) => warnings.push(`[${scope}] ${msg}`);

	// ---------- 1. Cheatsheet (static) ----------
	const index = cheatIndex(LANG);
	const cheatEntries: CheatEntry[] = listCheatEntries(LANG);
	const cheatIds = new Set<string>();
	for (const topic of TOPIC_IDS) {
		const want = new Set((index[topic] ?? []).map(([id]) => id));
		const got = cheatEntries.filter((e) => e.topic === topic).map((e) => e.id);
		for (const id of want) if (!got.includes(id)) err('cheatsheet', `${topic}: missing entry ${id}`);
		for (const id of got) if (!want.has(id)) err('cheatsheet', `${topic}: unknown id ${id}`);
		if (new Set(got).size !== got.length) err('cheatsheet', `${topic}: duplicate ids`);
		for (const id of want) cheatIds.add(id);
	}
	for (const e of cheatEntries) {
		if (!e.title || !e.text || !e.code) err('cheatsheet', `${e.id}: missing title/text/code`);
		if (!/\/\/ => /.test(e.code)) err('cheatsheet', `${e.id}: missing checked line (// => ...)`);
		if (e.code.split('\n').length > CONTENT_BOUNDS.cheatMaxLines) err('cheatsheet', `${e.id}: code longer than ${CONTENT_BOUNDS.cheatMaxLines} lines`);
	}

	// ---------- 2. Scala problems (static) ----------
	const problemsRoot = resolve(process.env.PROBLEMS_DIR ?? 'problems', LANG);
	const books = loadBooks(LANG);
	const problemIds = new Set<string>();
	const seenOrder = new Set<string>();
	const problems: LangProblem[] = [];
	const problemRefs = new Map<string, string[]>();
	const referencedCheats = new Set<string>();

	const dirs = existsSync(problemsRoot)
		? readdirSync(problemsRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort()
		: [];

	for (const dir of dirs) {
		let p: LangProblem | null = null;
		try {
			p = loadProblem(LANG, dir);
		} catch (e) {
			err('problem', `${dir}: invalid JSON (${(e as Error).message})`);
			continue;
		}
		if (!p) {
			err('problem', `${dir}: missing problem.json`);
			continue;
		}
		if (p.id !== dir) err('problem', `${dir}: id "${p.id}" does not match directory name`);
		if (problemIds.has(p.id)) err('problem', `${p.id}: duplicate problem id`);
		problemIds.add(p.id);
		problems.push(p);

		for (const k of ['id', 'title', 'statement', 'starter', 'notes'] as const) if (!p[k]) err('problem', `${p.id}: missing ${k}`);
		if (!existsSync(join(problemsRoot, dir, 'Solution.scala'))) err('problem', `${p.id}: missing Solution.scala`);
		if (!existsSync(join(problemsRoot, dir, 'Tests.scala'))) err('problem', `${p.id}: missing Tests.scala`);
		if (p.hints?.length !== CONTENT_BOUNDS.hintsPerProblem) err('problem', `${p.id}: hints must have ${CONTENT_BOUNDS.hintsPerProblem} entries`);
		if (!p.targets?.length) err('problem', `${p.id}: missing targets`);
		const orderKey = `${p.level}/${p.order}`;
		if (seenOrder.has(orderKey)) err('problem', `${p.id}: duplicate order ${p.order} in level ${p.level}`);
		seenOrder.add(orderKey);
		if (![1, 2, 3].includes(p.level)) err('problem', `${p.id}: bad level ${p.level}`);
		else {
			const [lo, hi] = LEVEL_LIMIT_SEC[p.level];
			if (p.limitSec < lo || p.limitSec > hi) err('problem', `${p.id}: limitSec ${p.limitSec} outside [${lo}, ${hi}] for level ${p.level}`);
		}
		if (!TOPIC_IDS.includes(p.topic)) err('problem', `${p.id}: bad topic ${p.topic}`);
		if (!['write', 'fix', 'refactor', 'complete'].includes(p.kind)) err('problem', `${p.id}: bad kind ${p.kind}`);
		if (!Array.isArray(p.refs)) err('problem', `${p.id}: missing refs`);
		else {
			problemRefs.set(p.id, p.refs);
			for (const r of p.refs) {
				if (!cheatIds.has(r)) err('problem', `${p.id}: unknown cheat sheet ref ${r}`);
				else referencedCheats.add(r);
			}
		}
		if (p.book) {
			const b = books[p.book.id];
			if (!b) err('problem', `${p.id}: unknown book ${p.book.id}`);
			else if (!b.chapters[String(p.book.chapter)]) err('problem', `${p.id}: unknown chapter ${p.book.chapter}`);
			if (!/^\d+\.\d+$/.test(p.book.exercise ?? '')) err('problem', `${p.id}: book.exercise must look like "3.7"`);
			if (!p.intent || p.intent.length < CONTENT_BOUNDS.minIntentChars) err('problem', `${p.id}: book problem needs intent (>= ${CONTENT_BOUNDS.minIntentChars} chars)`);
		}
	}

	// ---------- 3. Scala memo cards & checks (static) ----------
	const patterns = loadPatterns(LANG);
	const allMemoIds = new Map<string, string>();
	const cards: MemoCard[] = [];
	const checks: Check[] = [];
	const memoFileByProblem = new Map<string, Set<string>>();
	const unlockedByTopic = new Set<string>();

	const trackProblemRef = (pid: string, file: string) => {
		if (!memoFileByProblem.has(pid)) memoFileByProblem.set(pid, new Set());
		memoFileByProblem.get(pid)!.add(file);
	};

	for (const sub of ['cards', 'checks'] as const) {
		for (const f of memoFiles(LANG, sub)) {
			let items: (MemoCard | Check)[];
			try {
				items = readMemoFile(LANG, sub, f);
			} catch (e) {
				err('memo', `${sub}/${f}: invalid JSON (${(e as Error).message})`);
				continue;
			}
			for (const it of items) {
				const key = `${sub}:${it.id}`;
				if (allMemoIds.has(key)) err('memo', `${it.id}: duplicate id (in ${allMemoIds.get(key)} and ${f})`);
				allMemoIds.set(key, f);
				if (!/^[a-z0-9-]+$/.test(it.id ?? '')) err('memo', `${it.id}: id must be kebab-case`);
				if (!TOPIC_IDS.includes(it.topic)) err('memo', `${it.id}: bad topic ${it.topic}`);
				else unlockedByTopic.add(it.topic);
				if (!it.prompt || it.prompt.length > CONTENT_BOUNDS.memoPromptMaxChars) err('memo', `${it.id}: prompt missing or > ${CONTENT_BOUNDS.memoPromptMaxChars} chars`);
				if (!Array.isArray(it.unlock)) err('memo', `${it.id}: unlock must be an array`);
				else {
					for (const u of it.unlock) {
						if (!problemIds.has(u)) err('memo', `${it.id}: unknown unlock problem ${u}`);
						else trackProblemRef(u, `${sub}/${f}`);
					}
				}
				if (sub === 'cards') cards.push(it as MemoCard);
				else {
					const c = it as Check;
					checks.push(c);
					if ((c.kind === 'order' || c.kind === 'bug') && c.problem) {
						if (!problemIds.has(c.problem)) err('memo', `${c.id}: unknown problem ${c.problem}`);
						else trackProblemRef(c.problem, `${sub}/${f}`);
					}
				}
			}
		}
	}

	for (const c of cards) {
		if (!['concept', 'recognize', 'steps', 'line'].includes(c.kind)) err('memo', `${c.id}: bad kind ${c.kind}`);
		if (!c.title || !c.summary) err('memo', `${c.id}: title and summary are required`);
		const [lo, hi] = c.kind === 'line' ? [1, 2] : [2, 4];
		if (!Array.isArray(c.points) || c.points.length < lo || c.points.length > hi) err('memo', `${c.id}: points must have ${lo}-${hi} entries`);
		else for (const pt of c.points) if (!pt || pt.length > CONTENT_BOUNDS.memoPointMaxChars) err('memo', `${c.id}: point empty or > ${CONTENT_BOUNDS.memoPointMaxChars} chars`);
		if (c.kind !== 'concept' && !(c.pattern && patterns[c.pattern])) err('memo', `${c.id}: pattern missing or unknown (${c.pattern})`);
		if (c.pattern && !patterns[c.pattern]) err('memo', `${c.id}: unknown pattern ${c.pattern}`);
		if (c.book && !books[c.book.id]?.chapters[String(c.book.chapter)]) err('memo', `${c.id}: unknown book or chapter`);
		if (c.kind === 'line' && !(c.promptCode ?? '').includes('____')) err('memo', `${c.id}: line cards need promptCode with ____`);
		if (c.kind === 'line' && !c.answerCode) err('memo', `${c.id}: line cards need answerCode`);
		if (c.answerCode && !c.verify) err('memo', `${c.id}: answerCode needs verify`);
	}

	const checkById = new Map(checks.map((c) => [c.id, c]));
	for (const c of checks) {
		if (c.kind === 'trace' || c.kind === 'approach') {
			if (!Array.isArray(c.options) || c.options.length !== 4) err('memo', `${c.id}: must have 4 options`);
			else {
				if (new Set(c.options.map((o) => o.text)).size !== 4) err('memo', `${c.id}: options must be distinct`);
				if (c.options.some((o) => !o.text || !o.why)) err('memo', `${c.id}: every option needs text and why`);
				if (!(c.answer >= 0 && c.answer < 4)) err('memo', `${c.id}: answer out of range`);
			}
			if (c.kind === 'trace' && (!c.code || !c.verify)) err('memo', `${c.id}: trace check requires code and verify`);
		} else if (c.kind === 'order') {
			if (!Array.isArray(c.lines) || c.lines.length < 4 || c.lines.length > 9) err('memo', `${c.id}: order lines must have 4-9 entries`);
			if (!c.distractors?.length || c.distractors.length > 2) err('memo', `${c.id}: order check needs 1-2 distractors`);
		} else if (c.kind === 'bug') {
			if (!c.why || !c.fixed) err('memo', `${c.id}: bug check requires why and fixed`);
			if (!Array.isArray(c.lines) || !(c.bugIndex >= 0 && c.bugIndex < c.lines.length)) err('memo', `${c.id}: invalid bugIndex`);
		}
	}

	// ---------- 4. Scala Debrief patterns (static + pure JS sample recognition) ----------
	let debriefCatalog: DebriefPattern[] = [];
	const debriefPath = resolve(process.env.DEBRIEF_DIR ?? 'debrief', LANG, 'patterns.json');
	if (existsSync(debriefPath)) {
		try {
			debriefCatalog = JSON.parse(readFileSync(debriefPath, 'utf8')) as DebriefPattern[];
		} catch (e) {
			err('debrief', `patterns.json invalid JSON (${(e as Error).message})`);
		}
		const seenDebrief = new Set<string>();
		const regexOk = (id: string, name: string, src: string | undefined) => {
			if (src === undefined) return;
			try {
				new RegExp(src);
			} catch (e) {
				err('debrief', `${id}: invalid regex ${name} (${(e as Error).message})`);
			}
		};
		for (const p of debriefCatalog) {
			if (!/^[a-z0-9-]+$/.test(p.id ?? '')) err('debrief', `${String(p.id)}: id must be kebab-case`);
			if (seenDebrief.has(p.id)) err('debrief', `${p.id}: duplicate id`);
			seenDebrief.add(p.id);
			if (!p.title || !p.short) err('debrief', `${p.id}: title and short are required`);
			if (p.on !== 'compile' && p.on !== 'failed') err('debrief', `${p.id}: bad on ${p.on}`);
			for (const k of ['message', 'source', 'caret', 'cases', 'code'] as const) regexOk(p.id, k, p[k]);
			if (p.on === 'compile' && !p.message && !p.source && !p.caret) err('debrief', `${p.id}: compile pattern needs message, source or caret`);
			if (p.on === 'failed' && !p.cases) err('debrief', `${p.id}: failed pattern needs cases`);
			if (!Array.isArray(p.rule) || p.rule.length < 1 || p.rule.length > 3 || p.rule.some((r) => !r || r.length > CONTENT_BOUNDS.debriefRuleMaxChars)) {
				err('debrief', `${p.id}: rule must be 1-3 lines <= ${CONTENT_BOUNDS.debriefRuleMaxChars} chars`);
			}
			if (!examplesOf(p.verify ?? '').length) err('debrief', `${p.id}: verify needs at least one // => line`);
			const ck = checkById.get(p.check);
			if (!ck) err('debrief', `${p.id}: unknown check ${p.check}`);
			else if (ck.kind !== 'trace' || ck.debrief !== p.id) err('debrief', `${p.id}: check ${p.check} must be a trace check with debrief="${p.id}"`);
			if (!p.practice?.length) err('debrief', `${p.id}: practice needs at least one problem`);
			for (const pid of p.practice ?? []) if (!problemIds.has(pid)) err('debrief', `${p.id}: unknown practice problem ${pid}`);
			if (!p.samples?.length) err('debrief', `${p.id}: samples needs at least one real failure`);
		}
		for (const ck of checkById.values()) {
			if (ck.debrief && !debriefCatalog.some((p) => p.check === ck.id && p.id === ck.debrief)) {
				err('debrief', `${ck.id}: check names debrief "${ck.debrief}" but no pattern uses it`);
			}
		}
		for (const p of debriefCatalog) {
			(p.samples ?? []).forEach((s, i) => {
				const isCompile = p.on === 'compile';
				const hit = (q: DebriefPattern) =>
					isCompile ? matchCompile(q, { message: s.message ?? '', source: s.source ?? '', caret: s.caret ?? '' }) : matchFailed(q, s.cases ?? [], s.code ?? '');
				if (!hit(p)) err('debrief', `${p.id}: sample ${i + 1} not recognised`);
				else {
					const first = debriefCatalog.find(hit)!;
					if (first.id !== p.id) err('debrief', `${p.id}: sample ${i + 1} matched first by ${first.id}`);
				}
			});
		}
	}

	// ---------- 5. Statistics catalogue (static + required bilingual parity) ----------
	const statsIds = new Set<string>();
	for (const lesson of lessons) {
		if (!/^[a-z0-9-]+$/.test(lesson.id)) err('stats', `${lesson.id}: id must be kebab-case`);
		if (statsIds.has(lesson.id)) err('stats', `${lesson.id}: duplicate lesson id`);
		statsIds.add(lesson.id);
		if (!Number.isFinite(lesson.seconds) || lesson.seconds <= 0) err('stats', `${lesson.id}: invalid seconds`);
		for (const [name, val] of [
			['title', lesson.title],
			['targets', lesson.targets],
			['prompt', lesson.prompt],
			['solution', lesson.solution],
			['intent', lesson.intent],
			['reference.formula', lesson.reference?.formula],
			['reference.symbols', lesson.reference?.symbols],
			['reference.conditions', lesson.reference?.conditions],
			['reference.pitfall', lesson.reference?.pitfall]
		] as const) {
			if (!isBilingualCopy(val)) err('stats', `${lesson.id}: missing bilingual copy for ${name}`);
		}
		if (!Array.isArray(lesson.hints) || lesson.hints.length !== CONTENT_BOUNDS.hintsPerProblem || !lesson.hints.every(isBilingualCopy)) {
			err('stats', `${lesson.id}: hints must have ${CONTENT_BOUNDS.hintsPerProblem} bilingual entries`);
		}
		if (!Array.isArray(lesson.fields) || lesson.fields.length === 0) err('stats', `${lesson.id}: needs at least 1 answer field`);
		else {
			lesson.fields.forEach((f, idx) => {
				if (!isBilingualCopy(f.label)) err('stats', `${lesson.id}: field[${idx}] missing bilingual label`);
				if (!isBilingualCopy(f.feedback)) err('stats', `${lesson.id}: field[${idx}] missing bilingual feedback`);
				if (typeof f.answer !== 'number' || !Number.isFinite(f.answer)) err('stats', `${lesson.id}: field[${idx}] answer must be finite number`);
			});
		}
	}

	// ---------- 6. Cross-layer Pedagogy Linter (Warnings only, never blocks WIP) ----------
	const orphanCheats = [...cheatIds].filter((id) => !referencedCheats.has(id));
	if (orphanCheats.length) warn('pedagogy', `${orphanCheats.length} cheat sheet entries not referenced by any problem refs (${orphanCheats.slice(0, 6).join(', ')}${orphanCheats.length > 6 ? ', ...' : ''})`);

	const byTopic = new Map<string, LangProblem[]>();
	for (const p of problems) byTopic.set(p.topic, [...(byTopic.get(p.topic) ?? []), p]);
	for (const [topic, list] of byTopic) {
		if (!unlockedByTopic.has(topic)) warn('pedagogy', `topic "${topic}" (${list.length} problems) has 0 linked memo cards or checks`);
		const nonBook = list.filter((p) => !p.book);
		if (nonBook.length >= CONTENT_BOUNDS.pedagogyWarnMinTopicProblems && nonBook.every((p) => p.kind === 'write')) {
			warn('pedagogy', `topic "${topic}" (${nonBook.length} curriculum problems) uses only kind="write" (consider mixing fix/refactor/complete)`);
		}
	}

	return {
		errors,
		warnings,
		stats: {
			problems: problems.length,
			cheat: cheatEntries.length,
			cards: cards.length,
			checks: checks.length,
			debrief: debriefCatalog.length,
			statsLessons: lessons.length
		},
		problemRefs,
		memoFileByProblem
	};
}

function runCommand(cmd: string, cmdArgs: string[]): boolean {
	const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
	return r.status === 0;
}

function detectChangedFiles(base?: string): { files: string[]; escalateReason: string | null } {
	const git = (gitArgs: string[]) => {
		try {
			return execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
		} catch {
			return null;
		}
	};

	let ref = base;
	if (!ref) {
		ref = git(['merge-base', 'HEAD', 'origin/main']) ?? git(['rev-parse', 'HEAD~1']) ?? undefined;
	}
	if (!ref) return { files: [], escalateReason: 'could not resolve git base commit' };

	const diffOut = git(['diff', '--name-status', ref]);
	const statusOut = git(['status', '--porcelain']);
	if (diffOut === null || statusOut === null) return { files: [], escalateReason: 'git diff/status failed' };

	const files = new Set<string>();
	for (const line of diffOut.split('\n').filter(Boolean)) {
		const parts = line.split('\t');
		for (const p of parts.slice(1)) if (p) files.add(p);
	}
	for (const line of statusOut.split('\n').filter(Boolean)) {
		const body = line.slice(3).trim();
		for (const p of body.split(' -> ')) if (p) files.add(p);
	}

	const list = [...files];
	const escalationPatterns = [
		/^app\/src\/lib\/core\/(rules|lang|memo|debrief|memo-sched|spar|garden|coach|coach-prompt)\.ts$/,
		/^app\/src\/lib\/server\/(judge|scala-run|worker|memo|spar|debrief|garden|coach|lang|stats|db)\.ts$/,
		/^app\/scripts\/verify-/
	];
	const hit = list.find((f) => escalationPatterns.some((re) => re.test(f)));
	if (hit) return { files: list, escalateReason: `shared rule/engine/verifier changed (${hit})` };
	return { files: list, escalateReason: null };
}

function hasScalaCli(): boolean {
	const bin = process.env.SCALA_CLI ?? resolve('..', 'tools', 'scala-cli');
	if (existsSync(bin)) return true;
	const r = spawnSync('which', ['scala-cli'], { stdio: 'ignore' });
	return r.status === 0;
}

const t0 = performance.now();
const report = runFastChecks();
const elapsedMs = Math.round(performance.now() - t0);

const s = report.stats;
console.log(
	`verify:fast (${elapsedMs}ms) — ${s.problems} problems, ${s.cheat} cheat entries, ${s.cards} cards, ${s.checks} checks, ${s.debrief} debrief patterns, ${s.statsLessons} stats lessons`
);
if (report.warnings.length) {
	console.log(`Warnings (${report.warnings.length}):`);
	for (const w of report.warnings) console.log(`  warn  ${w}`);
}
if (report.errors.length) {
	console.error(`Errors (${report.errors.length}):`);
	for (const e of report.errors) console.error(`  FAIL  ${e}`);
	process.exit(1);
}
if (strictWarn && report.warnings.length) {
	console.error('Failing due to --strict-warn.');
	process.exit(1);
}

if (mode === 'fast') {
	console.log('ok   verify:fast passed.');
	process.exit(0);
}

// ---------- mode === 'changed' ----------
const { files, escalateReason } = detectChangedFiles(baseArg);
if (escalateReason) {
	console.log(`verify:changed escalating to check + test (${escalateReason})...`);
	const ok = runCommand('pnpm', ['run', 'check']) && runCommand('pnpm', ['run', 'test']);
	process.exit(ok ? 0 : 1);
}
if (files.length === 0) {
	console.log('ok   verify:changed found no changed files.');
	process.exit(0);
}

const changedProblems = new Set<string>();
const changedCheatTopics = new Set<string>();
const changedMemoFilters = new Set<string>();
let debriefChanged = false;
let statsChanged = false;
let appCodeChanged = false;

for (const f of files) {
	const mProb = f.match(/^app\/problems\/scala\/([^/]+)\//);
	if (mProb && !mProb[1].startsWith('_')) changedProblems.add(mProb[1]);
	const mCheat = f.match(/^app\/cheatsheet\/scala\/([^/]+)\.json$/);
	if (mCheat && mCheat[1] !== '_index') changedCheatTopics.add(mCheat[1]);
	const mMemo = f.match(/^app\/memo\/scala\/(?:cards|checks)\/([^/]+)\.json$/);
	if (mMemo) changedMemoFilters.add(mMemo[1]);
	if (/^app\/debrief\/scala\//.test(f)) debriefChanged = true;
	if (/^app\/src\/lib\/(server\/stats|stats\/)/.test(f) || /^app\/src\/routes\/stats\//.test(f)) statsChanged = true;
	if (/^app\/src\//.test(f)) appCodeChanged = true;
}

// Expand to referencing items: changed cheatsheet topics -> referencing problems; changed problems -> referencing memo files.
if (changedCheatTopics.size) {
	const idx = cheatIndex(LANG);
	const touchedCheatIds = new Set([...changedCheatTopics].flatMap((t) => (idx[t] ?? []).map(([id]) => id)));
	for (const [pid, refs] of report.problemRefs) {
		if (refs.some((r) => touchedCheatIds.has(r))) changedProblems.add(pid);
	}
}
for (const pid of changedProblems) {
	for (const mf of report.memoFileByProblem.get(pid) ?? []) {
		const baseName = mf.split('/').pop()!;
		changedMemoFilters.add(baseName);
	}
}

let allOk = true;
const scalaReady = hasScalaCli();
if ((changedProblems.size || changedCheatTopics.size || changedMemoFilters.size || debriefChanged) && !scalaReady) {
	console.log('note scala-cli not found locally; skipping Scala execution checks (static verify:fast already passed).');
} else {
	for (const pid of changedProblems) {
		if (!existsSync(resolve('problems', LANG, pid))) continue; // deleted problem: already checked by verify:fast references
		console.log(`verify:changed -> verify-problems ${pid}`);
		if (!runCommand('node', ['scripts/verify-problems.ts', LANG, pid])) allOk = false;
	}
	if (changedCheatTopics.size) {
		const topics = [...changedCheatTopics].filter((t) => TOPIC_IDS.includes(t));
		if (topics.length) {
			console.log(`verify:changed -> verify-cheatsheet ${topics.join(' ')}`);
			if (!runCommand('node', ['scripts/verify-cheatsheet.ts', LANG, ...topics])) allOk = false;
		}
	}
	for (const flt of changedMemoFilters) {
		console.log(`verify:changed -> verify-memo ${flt}`);
		if (!runCommand('node', ['scripts/verify-memo.ts', LANG, flt])) allOk = false;
	}
	if (debriefChanged) {
		console.log('verify:changed -> verify-debrief');
		if (!runCommand('node', ['scripts/verify-debrief.ts', LANG])) allOk = false;
	}
}

if (statsChanged) {
	console.log('verify:changed -> stats tests');
	if (!runCommand('pnpm', ['exec', 'vitest', 'run', 'src/lib/server/stats.test.ts', 'src/lib/server/stats-connectivity.test.ts'])) allOk = false;
}
if (appCodeChanged && !statsChanged) {
	console.log('verify:changed -> svelte-check + vitest');
	if (!runCommand('pnpm', ['run', 'check']) || !runCommand('pnpm', ['run', 'test'])) allOk = false;
}

console.log(allOk ? 'ok   verify:changed passed.' : 'FAIL verify:changed failed.');
process.exit(allOk ? 0 : 1);
