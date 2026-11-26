import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db } from './db.ts';
import { judge, loadBooks } from './judge.ts';
import { findProblem } from './lang.ts';
import { listCheatEntries } from './cheatsheet.ts';
import { memoFiles, readMemoFile } from './memo-content.ts';
import { CARD_KINDS, CHECK_KINDS, capOvertime, gradeFromChecklist, type Check, type MemoCard, type Pattern } from '#lib/core/memo.ts';
import type { MemoFacts } from '#lib/core/coach-prompt.ts';
import { TOPICS, type BookMeta, type CheatEntry, type JudgeResult } from '#lib/core/lang.ts';
import {
	LIMIT_SEC, VERDICT, WEEK_GOAL, buildMemories, daysThisWeek, dueAfter, estimateMinutes, failedTwice, humanInterval, isDue, itemKey, noteStatus, permutation, pickSession,
	plan, previewDue, replay, type Item, type ItemType, type Memory, type Rating, type Review
} from '#lib/core/memo-sched.ts';
import type {
	MemoAnswerResponse, MemoCardView, MemoCheckResponse, MemoCheckView, MemoHomeData, MemoKind, MemoNoteGroup, MemoNoteRow, MemoNotesData, MemoRedo, MemoRevealResponse, MemoSolutionResponse
} from '#lib/types.ts';

const LANG = 'scala';
const REVIEW_CARDS = 12;
const NEW_CARDS = 4;
const CHECKS = 3;
const now = () => new Date();
const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- content (may be half written: skip what is broken, never throw) ----------
const isStr = (v: unknown): v is string => typeof v === 'string';
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const opts = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every((o) => rec(o) && isStr(o.text) && isStr(o.why));
const idx = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

function validCard(c: unknown): c is MemoCard {
	return (
		rec(c) && isStr(c.id) && /^[\w-]+$/.test(c.id) && isStr(c.kind) && c.kind in CARD_KINDS && isStr(c.title) && isStr(c.summary) && isStr(c.prompt) &&
		strs(c.points) && c.points.length > 0 && (c.promptCode === undefined || isStr(c.promptCode)) && (c.answerCode === undefined || isStr(c.answerCode)) &&
		(c.pattern === undefined || isStr(c.pattern)) && (c.unlock === undefined || strs(c.unlock)) && (c.topic === undefined || isStr(c.topic)) &&
		(c.book === undefined || (rec(c.book) && isStr(c.book.id) && Number.isInteger(c.book.chapter)))
	);
}

function validCheck(c: unknown): c is Check {
	if (!rec(c) || !isStr(c.id) || !/^[\w-]+$/.test(c.id) || !isStr(c.kind) || !isStr(c.prompt) || !(c.unlock === undefined || strs(c.unlock))) return false;
	const lines = strs(c.lines) && c.lines.length >= 2 ? c.lines : null;
	const problem = isStr(c.problem) && findProblem(c.problem) !== null;
	switch (c.kind) {
		case 'order':
			return !!lines && problem && (c.given === undefined || isStr(c.given)) && Array.isArray(c.distractors) && c.distractors.every((d) => rec(d) && isStr(d.line) && isStr(d.why));
		case 'bug':
			return !!lines && problem && (c.given === undefined || isStr(c.given)) && idx(c.bugIndex, lines.length) && isStr(c.fixed) && isStr(c.why);
		case 'trace':
			return isStr(c.code) && opts(c.options) && idx(c.answer, 4);
		case 'approach':
			return opts(c.options) && idx(c.answer, 4);
		default:
			return false;
	}
}

function readValid<T>(sub: 'cards' | 'checks', ok: (v: unknown) => v is T): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	let files: string[] = [];
	try {
		files = memoFiles(LANG, sub);
	} catch {
		return out;
	}
	for (const f of files) {
		let list: unknown[];
		try {
			const v: unknown = readMemoFile<unknown>(LANG, sub, f);
			list = Array.isArray(v) ? v : [];
		} catch {
			continue; // unparsable file: skip it
		}
		for (const x of list) {
			const id = rec(x) ? x.id : undefined;
			if (isStr(id) && ok(x) && !seen.has(id)) {
				seen.add(id);
				out.push(x);
			}
		}
	}
	return out;
}

/** patterns.json and patterns-*.json, each file on its own so one broken file only loses itself. */
function patterns(): Record<string, Pattern> {
	const dir = resolve(process.env.MEMO_DIR ?? 'memo', LANG);
	const out: Record<string, Pattern> = {};
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir).filter((f) => /^patterns(-[\w-]+)?\.json$/.test(f)).sort()) {
		try {
			const v: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'));
			if (!rec(v)) continue;
			for (const [id, p] of Object.entries(v)) if (rec(p) && isStr(p.title) && isStr(p.when) && strs(p.steps)) out[id] = p as Pattern;
		} catch {}
	}
	return out;
}

function books(): Record<string, BookMeta> {
	try {
		const b = loadBooks(LANG);
		return rec(b) ? (b as Record<string, BookMeta>) : {};
	} catch {
		return {};
	}
}

function cheatEntries(): CheatEntry[] {
	try {
		return listCheatEntries(LANG);
	} catch {
		return [];
	}
}

// ---------- facts from the log and the language pack ----------
const finishedProblems = () =>
	new Set((db().prepare('SELECT DISTINCT problem_id FROM lang_sessions WHERE lang = ? AND ended_at IS NOT NULL').all(LANG) as { problem_id: string }[]).map((r) => r.problem_id));
const lookedUpEntries = () => (db().prepare('SELECT entry_id FROM lang_lookups GROUP BY entry_id ORDER BY MIN(id)').all() as { entry_id: string }[]).map((r) => r.entry_id);

type LogRow = { item_type: ItemType; item_id: string; at: number; rating: Rating };
const reviewLog = (): Review[] =>
	(db().prepare('SELECT item_type, item_id, at, rating FROM memo_reviews ORDER BY id').all() as LogRow[]).map((r) => ({ itemType: r.item_type, itemId: r.item_id, at: r.at, rating: r.rating }));

/** Cards (file cards plus synthetic syntax cards) in one normalised shape. */
type AnyCard = {
	id: string; kind: MemoKind; title: string; summary: string; prompt: string; promptCode: string | null; points: string[]; answerCode: string | null;
	pattern: string | null; book: { id: string; chapter: number } | null; topic: string | null; unlock: string[]; entry: CheatEntry | null;
};

/** Round-robin over groups (keeping the order within a group), so new items of one group do not crowd out the rest. */
function mixBy<T>(list: T[], group: (x: T) => string): T[] {
	const by = new Map<string, T[]>();
	for (const x of list) by.set(group(x), [...(by.get(group(x)) ?? []), x]);
	const lists = [...by.values()];
	return Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) => lists.flatMap((l) => (l[i] ? [l[i]] : []))).flat();
}

type World = { cards: AnyCard[]; checks: Check[]; memories: Map<string, Memory>; finished: Set<string>; at: Date };

/** Debrief pattern ids whose note was added to the deck (append-only debrief_deck). */
const deckPatterns = () => new Set((db().prepare('SELECT DISTINCT pattern_id FROM debrief_deck').all() as { pattern_id: string }[]).map((r) => r.pattern_id));

function world(): World {
	const deck = deckPatterns();
	const inDeck = (id: string) => deck.has(id);
	const finished = finishedProblems();
	const cards: AnyCard[] = readValid<MemoCard>('cards', validCard).map((c) => ({
		id: c.id, kind: c.kind, title: c.title, summary: c.summary, prompt: c.prompt, promptCode: c.promptCode ?? null, points: c.points, answerCode: c.answerCode ?? null,
		pattern: c.pattern ?? null, book: c.book ?? null, topic: c.topic ?? null, unlock: c.unlock ?? [], entry: null
	}));
	const taken = new Set(cards.map((c) => c.id));
	const entries = new Map(cheatEntries().map((e) => [e.id, e]));
	for (const id of lookedUpEntries()) {
		const e = entries.get(id);
		if (!e || taken.has(`syntax-${id}`)) continue;
		cards.push({
			id: `syntax-${id}`, kind: 'syntax', title: e.title, summary: '', prompt: `${e.title}: 쓰는 법과 결과를 떠올려 보라`, promptCode: null, points: ['떠올렸다'], answerCode: null,
			pattern: null, book: null, topic: e.topic, unlock: [], entry: e
		});
	}
	return { cards: mixBy(cards, (c) => (c.kind === 'syntax' ? 'syntax' : 'file')), checks: readValid<Check>('checks', validCheck).filter((c) => !c.debrief || inDeck(c.debrief)), memories: buildMemories(reviewLog()), finished, at: now() };
}

const open = (w: World, unlock: string[] | undefined) => !unlock || unlock.length === 0 || unlock.some((p) => w.finished.has(p));
const cardOpen = (w: World, c: AnyCard) => open(w, c.unlock);
const cardItems = (w: World): Item[] =>
	w.cards.map((c) => ({ key: itemKey('card', c.id), unlocked: cardOpen(w, c), groups: [...(c.pattern ? [`p:${c.pattern}`] : []), ...c.unlock.map((u) => `u:${u}`), ...(c.entry ? [`s:${c.entry.id}`] : [])] }));
const checkItems = (w: World): Item[] =>
	[...mixBy(w.checks.filter((c) => open(w, c.unlock)), (c) => c.kind), ...w.checks.filter((c) => !open(w, c.unlock))].map((c) => ({
		key: itemKey('check', c.id), unlocked: open(w, c.unlock), groups: c.unlock.map((u) => `u:${u}`)
	}));

const idOf = (key: string) => key.slice(key.indexOf(':') + 1);
const limitOf = (kind: MemoKind | Check['kind']) => LIMIT_SEC[kind];

// ---------- cards ----------
function source(c: AnyCard, pats: Record<string, Pattern>): string | null {
	if (c.book) {
		const meta = books()[c.book.id];
		const t = meta?.chapters?.[c.book.chapter];
		return `책 ${c.book.chapter}장${isStr(t) && t ? ` ${t}` : ''}에서`;
	}
	if (c.kind === 'recognize' || c.kind === 'syntax') return null; // the pattern is the answer
	if (c.pattern && pats[c.pattern]) return `유형: ${pats[c.pattern].title}`;
	if (c.topic && c.topic in TOPICS) return `주제: ${TOPICS[c.topic as keyof typeof TOPICS]}`;
	return null;
}

const cardView = (c: AnyCard, pats: Record<string, Pattern>): MemoCardView => ({
	id: c.id, kind: c.kind, kindLabel: c.kind === 'syntax' ? '문법' : CARD_KINDS[c.kind], prompt: c.prompt, promptCode: c.promptCode, source: source(c, pats), limitSec: limitOf(c.kind)
});

/** Today's session: due cards, then new ones, interleaved. */
export function reviewSession(): MemoCardView[] {
	const w = world();
	const by = new Map(w.cards.map((c) => [itemKey('card', c.id), c]));
	const pats = patterns();
	return pickSession(cardItems(w), w.memories, w.at, REVIEW_CARDS, NEW_CARDS).map((k) => cardView(by.get(k)!, pats));
}

function openCard(id: unknown): { w: World; c: AnyCard } | null {
	if (!isStr(id)) return null;
	const w = world();
	const c = w.cards.find((x) => x.id === id);
	return c && cardOpen(w, c) ? { w, c } : null;
}

/** A card with everything the Operator may know about it, or null for an unknown or locked card. */
export function coachCard(id: unknown): MemoFacts | null {
	const f = openCard(id);
	if (!f) return null;
	const c = f.c;
	const pat = c.pattern ? patterns()[c.pattern] : undefined;
	return {
		kind: c.kind === 'syntax' ? '문법' : CARD_KINDS[c.kind], title: c.title, prompt: c.prompt, promptCode: c.promptCode, points: c.entry ? [] : c.points, answerCode: c.answerCode ?? c.entry?.code ?? null, summary: c.summary || c.entry?.text || '',
		pattern: pat ? { title: pat.title, when: pat.when, steps: pat.steps } : null
	};
}

export function revealCard(id: unknown, elapsedMs?: unknown): MemoRevealResponse | null {
	const f = openCard(id);
	if (!f) return null;
	const { w, c } = f;
	const prev = previewDue(w.memories.get(itemKey('card', c.id)) ?? null, w.at);
	const total = c.points.length;
	const over = clampMs(elapsedMs) > limitOf(c.kind) * 1000;
	return {
		points: c.points,
		answerCode: c.answerCode,
		patternTitle: (c.kind === 'recognize' || c.kind === 'steps') && c.pattern ? (patterns()[c.pattern]?.title ?? null) : null,
		entry: c.entry,
		next: Array.from({ length: total + 1 }, (_, n) => humanInterval(prev[capOvertime(gradeFromChecklist(n, total), over)], w.at))
	};
}

const clampMs = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(3_600_000, Math.max(0, Math.round(v))) : 0);

function record(type: ItemType, id: string, rating: Rating, elapsedMs: number, detail: object) {
	db().prepare('INSERT INTO memo_reviews(item_type, item_id, at, rating, elapsed_ms, detail) VALUES(?,?,?,?,?,?)').run(type, id, nowSec(), rating, elapsedMs, JSON.stringify(detail));
}

const memoryOf = (type: ItemType, id: string) =>
	replay((db().prepare('SELECT at, rating FROM memo_reviews WHERE item_type = ? AND item_id = ? ORDER BY id').all(type, id) as { at: number; rating: Rating }[]));

/** Records a card review. Null for an unknown or locked card; throws for a malformed tick list. */
export function answerCard(id: unknown, ticked: unknown, elapsedMs: unknown): MemoAnswerResponse | null {
	const f = openCard(id);
	if (!f) return null;
	const total = f.c.points.length;
	if (!Array.isArray(ticked) || !ticked.every((i) => idx(i, total)) || new Set(ticked).size !== ticked.length) throw new Error('체크한 항목이 올바르지 않습니다.');
	const ms = clampMs(elapsedMs);
	const overtime = ms > limitOf(f.c.kind) * 1000;
	const rating = capOvertime(gradeFromChecklist(ticked.length, total), overtime);
	record('card', f.c.id, rating, ms, { ticked: [...(ticked as number[])].sort((a, b) => a - b), total, limitSec: limitOf(f.c.kind), overtime });
	const m = memoryOf('card', f.c.id)!;
	return { rating, word: VERDICT[rating], next: humanInterval(m.card.due, now()) };
}

// ---------- checks ----------
const checkKindLabel = (c: Check) => CHECK_KINDS[c.kind];
const orderPool = (c: Check & { kind: 'order' }) => [...c.lines, ...c.distractors.map((d) => d.line)];

function checkView(c: Check): MemoCheckView {
	const base = { id: c.id, kind: c.kind, kindLabel: checkKindLabel(c), prompt: c.prompt, limitSec: limitOf(c.kind), code: null, given: null, lines: [] as string[], options: [] as string[] };
	switch (c.kind) {
		case 'order': {
			const pool = orderPool(c);
			return { ...base, given: c.given ?? null, lines: permutation(pool.length, c.id).map((i) => pool[i]) };
		}
		case 'bug':
			return { ...base, given: c.given ?? null, lines: c.lines };
		case 'trace':
			return { ...base, code: c.code, options: permutation(4, c.id).map((i) => c.options[i].text) };
		case 'approach':
			return { ...base, options: permutation(4, c.id).map((i) => c.options[i].text) };
	}
}

export function checkSession(): MemoCheckView[] {
	const w = world();
	const by = new Map(w.checks.map((c) => [itemKey('check', c.id), c]));
	return pickSession(checkItems(w), w.memories, w.at, CHECKS, CHECKS).map((k) => checkView(by.get(k)!));
}

function openCheck(id: unknown): Check | null {
	if (!isStr(id)) return null;
	const w = world();
	const c = w.checks.find((x) => x.id === id);
	return c && open(w, c.unlock) ? c : null;
}

const none = { message: null, why: null, correctIndex: null, whys: [] as string[], bugIndex: null, fixed: null };

function firstFailure(r: JudgeResult): string {
	if (r.status === 'timeout') return '시간 안에 끝나지 않았습니다.';
	if (r.status === 'compile_error') {
		const lines = r.output.split('\n').filter((l) => l.trim());
		return lines.find((l) => !/^User\.scala:\d+/.test(l.trim())) ?? lines[0] ?? '컴파일되지 않습니다.'; // the first line is often only the position
	}
	const bad = r.cases.find((c) => c.status !== 'ok');
	return bad ? `${bad.name}${bad.detail ? `: ${bad.detail}` : ''}` : '테스트를 통과하지 못했습니다.';
}

const answeredRecently = (id: string) => !!db().prepare("SELECT 1 FROM memo_reviews WHERE item_type = 'check' AND item_id = ? AND at >= ?").get(id, nowSec() - 3600);

function recordCheck(c: Check, first: boolean, correct: boolean, ms: number, detail: object): boolean {
	if (!first) return false;
	const overtime = ms > limitOf(c.kind) * 1000;
	record('check', c.id, capOvertime(correct ? 3 : 1, overtime), ms, { ...detail, limitSec: limitOf(c.kind), overtime });
	return true;
}

/** Judges a submission. Null for an unknown or locked check; throws for a malformed choice. Only the first submission within an hour is recorded: the server decides, so a retry can never be the one that counts. */
export async function answerCheck(id: unknown, choice: unknown, elapsedMs: unknown): Promise<MemoCheckResponse | null> {
	const c = openCheck(id);
	if (!c) return null;
	const isFirst = !answeredRecently(c.id);
	const ms = clampMs(elapsedMs);

	if (c.kind === 'trace' || c.kind === 'approach') {
		if (!idx(choice, 4)) throw new Error('보기를 고르세요.');
		const perm = permutation(4, c.id);
		const picked = perm[choice as number];
		const correct = picked === c.answer;
		const recorded = recordCheck(c, isFirst, correct, ms, { choice: picked, answer: c.answer });
		return { ...none, correct, recorded, why: c.options[picked].why, correctIndex: perm.indexOf(c.answer), whys: perm.map((i) => c.options[i].why) };
	}
	if (c.kind === 'bug') {
		if (!idx(choice, c.lines.length)) throw new Error('줄을 고르세요.');
		const correct = choice === c.bugIndex;
		const recorded = recordCheck(c, isFirst, correct, ms, { choice, bugIndex: c.bugIndex });
		return { ...none, correct, recorded, why: c.why, bugIndex: c.bugIndex, fixed: c.fixed };
	}

	const pool = orderPool(c);
	if (!Array.isArray(choice) || choice.length === 0 || choice.length > pool.length || !choice.every((i) => idx(i, pool.length)) || new Set(choice).size !== choice.length)
		throw new Error('줄을 골라 순서대로 놓으세요.');
	const perm = permutation(pool.length, c.id);
	const orig = (choice as number[]).map((d) => perm[d]);
	const usedDistractors = orig.filter((o) => o >= c.lines.length).map((o) => o - c.lines.length);
	const problem = findProblem(c.problem);
	if (!problem) return null;
	const body = orig.map((o) => pool[o]).join('\n');
	const code = `${c.given ? (c.given.endsWith('\n') ? c.given : `${c.given}\n`) : ''}${body}\n`;
	const result = await judge(LANG, problem, code);
	const correct = result.status === 'passed';
	const recorded = recordCheck(c, isFirst, correct, ms, { order: orig, usedDistractors, status: result.status });
	const message = correct ? null : usedDistractors.length ? c.distractors[usedDistractors[0]].why : firstFailure(result);
	return { ...none, correct, recorded, message };
}

// ---------- for Sparring (Recall) ----------
export type RecallKind = 'trace' | 'approach' | 'bug';
const recallKinds = new Set<string>(['trace', 'approach', 'bug']);

/** Unlocked trace / approach / bug checks (order checks need the judge) with what the Recall order needs: due or last answered wrong, and the last review time. */
export function recallPool(): { id: string; kind: RecallKind; topic: string; urgent: boolean; lastAt: number | null }[] {
	const w = world();
	return w.checks
		.filter((c) => recallKinds.has(c.kind) && open(w, c.unlock))
		.map((c) => {
			const m = w.memories.get(itemKey('check', c.id));
			return { id: c.id, kind: c.kind as RecallKind, topic: c.topic, urgent: !!m && (isDue(m, w.at) || m.lastRating === 1), lastAt: m?.card.last_review ? Math.floor(m.card.last_review.getTime() / 1000) : null };
		});
}

/** The check as shown (options in their fixed display order), for an unlocked trace / approach / bug check; null otherwise. */
export function recallView(id: unknown): MemoCheckView | null {
	const c = openCheck(id);
	return c && recallKinds.has(c.kind) ? checkView(c) : null;
}

export type CheckKey = { view: MemoCheckView; correctIndex: number; whys: string[]; why: string | null; fixed: string | null };

/** Everything about a trace / approach / bug check, answer included, in displayed order. Only for runs that are over: never call it for a check still to be answered. Null for unknown ones. */
export function checkKey(id: string): CheckKey | null {
	const c = world().checks.find((x) => x.id === id);
	if (!c || !recallKinds.has(c.kind)) return null;
	const view = checkView(c);
	if (c.kind === 'bug') return { view, correctIndex: c.bugIndex, whys: [], why: c.why, fixed: c.fixed };
	if (c.kind === 'order') return null;
	const perm = permutation(4, c.id);
	return { view, correctIndex: perm.indexOf(c.answer), whys: perm.map((i) => c.options[i].why), why: null, fixed: null };
}

/** The correct line order as displayed pool indexes; only once an answer to this check has been recorded in the last hour. */
export function checkSolution(id: unknown): MemoSolutionResponse | 'forbidden' | null {
	const c = openCheck(id);
	if (!c || c.kind !== 'order') return null;
	if (!answeredRecently(c.id)) return 'forbidden';
	const perm = permutation(orderPool(c).length, c.id);
	return { order: c.lines.map((_, i) => perm.indexOf(i)) };
}

// ---------- home ----------
const processKinds = new Set<MemoKind>(['recognize', 'steps', 'line']);

function redoList(w: World): MemoRedo[] {
	const out = new Map<string, MemoRedo>();
	for (const c of w.cards) {
		if (c.kind !== 'steps' || !cardOpen(w, c) || !failedTwice(w.memories.get(itemKey('card', c.id)))) continue;
		const pid = c.unlock.find((p) => w.finished.has(p) && findProblem(p)) ?? c.unlock.find((p) => findProblem(p));
		const p = pid ? findProblem(pid) : null;
		if (p && !out.has(p.id)) out.set(p.id, { problemId: p.id, title: p.title, cardTitle: c.title });
	}
	return [...out.values()];
}

export const redoProblems = (): MemoRedo[] => redoList(world());

const shakyCards = (w: World) => w.cards.filter((c) => c.kind !== 'syntax' && noteStatus(w.memories.get(itemKey('card', c.id)), cardOpen(w, c)) === 'shaky');

export function homeView(): MemoHomeData {
	const w = world();
	const items = cardItems(w);
	const p = plan(items, w.memories, w.at, Infinity, NEW_CARDS);
	const kinds = new Map(w.cards.map((c) => [itemKey('card', c.id), c.kind]));
	const keys = [...p.due, ...p.fresh];
	const split = { concept: 0, process: 0, syntax: 0 };
	for (const k of keys) {
		const kind = kinds.get(k)!;
		split[kind === 'concept' ? 'concept' : kind === 'syntax' ? 'syntax' : processKinds.has(kind) ? 'process' : 'concept']++;
	}
	const at = (db().prepare('SELECT at FROM memo_reviews').all() as { at: number }[]).map((r) => r.at);
	return {
		total: keys.length,
		split,
		sessionSize: Math.min(REVIEW_CARDS, keys.length),
		minutes: estimateMinutes(keys.length),
		checks: pickSession(checkItems(w), w.memories, w.at, CHECKS, CHECKS).length,
		shaky: shakyCards(w).length,
		redo: redoList(w),
		weekDays: daysThisWeek(at, w.at),
		weekGoal: WEEK_GOAL,
		openItems: items.filter((i) => i.unlocked).length + checkItems(w).filter((i) => i.unlocked).length
	};
}

/** Cards in today's plan, for the link on the front page. Never throws. */
export function dueTotal(): number {
	try {
		const w = world();
		const p = plan(cardItems(w), w.memories, w.at, Infinity, NEW_CARDS);
		return p.due.length + p.fresh.length;
	} catch {
		return 0;
	}
}

// ---------- notes ----------
export function notesView(): MemoNotesData {
	const w = world();
	const pats = patterns();
	const bk = books();
	const cards = w.cards.filter((c) => c.kind !== 'syntax');
	const row = (c: AnyCard): MemoNoteRow => {
		const locked = !cardOpen(w, c);
		return { id: c.id, title: c.title, summary: locked ? null : c.summary, status: noteStatus(w.memories.get(itemKey('card', c.id)), !locked), locked };
	};
	const groups = new Map<string, MemoNoteGroup & { order: number[] }>();
	const put = (key: string, order: number[], make: () => Omit<MemoNoteGroup, 'rows' | 'key'>, c: AnyCard) => {
		if (!groups.has(key)) groups.set(key, { key, ...make(), rows: [], order });
		groups.get(key)!.rows.push(row(c));
	};
	const bookIds = Object.keys(bk);
	const patternHasOpen = (id: string) => cards.some((c) => c.pattern === id && !c.book && cardOpen(w, c));
	const topics = Object.keys(TOPICS);
	for (const c of cards) {
		if (c.book) {
			const meta = bk[c.book.id];
			const bi = bookIds.indexOf(c.book.id);
			put(`book:${c.book.id}:${c.book.chapter}`, [0, bi < 0 ? 99 : bi, c.book.chapter], () => ({
				heading: `${isStr(meta?.title) ? meta.title : '책'} ${c.book!.chapter}장`, sub: meta?.chapters?.[c.book!.chapter] ?? null, steps: []
			}), c);
		} else if (c.pattern && pats[c.pattern] && patternHasOpen(c.pattern)) {
			const p = pats[c.pattern];
			put(`pattern:${c.pattern}`, [1, Object.keys(pats).indexOf(c.pattern), 0], () => ({ heading: `유형 · ${p.title}`, sub: p.when, steps: p.steps }), c);
		} else if (c.pattern && pats[c.pattern]) {
			put('pattern-locked', [2, 0, 0], () => ({ heading: '아직 열리지 않은 유형', sub: null, steps: [] }), c);
		} else {
			const t = c.topic && c.topic in TOPICS ? c.topic : '';
			put(`topic:${t}`, [3, t ? topics.indexOf(t) : 99, 0], () => ({ heading: t ? TOPICS[t as keyof typeof TOPICS] : '기타', sub: null, steps: [] }), c);
		}
	}
	const list = [...groups.values()].sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2]);
	return { groups: list.map(({ order: _o, ...g }) => g), shaky: shakyCards(w).length };
}

/** For Garden: every review with the topic of its item (null if the item no longer exists), and the ids of the cards that can be leaves (file cards that are open). */
export function gardenMemo(): { reviews: { itemType: ItemType; itemId: string; at: number; rating: Rating; topic: string | null }[]; cards: string[] } {
	const w = world();
	const topic = new Map<string, string | null>();
	for (const c of w.cards) topic.set(itemKey('card', c.id), c.topic && c.topic in TOPICS ? c.topic : null);
	for (const c of w.checks) topic.set(itemKey('check', c.id), c.topic in TOPICS ? c.topic : null);
	return {
		reviews: reviewLog().map((r) => ({ ...r, topic: topic.get(itemKey(r.itemType, r.itemId)) ?? null })),
		cards: w.cards.filter((c) => c.kind !== 'syntax' && cardOpen(w, c)).map((c) => c.id)
	};
}

/** A JSON request body as an object; anything else is {}. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const v: unknown = await request.json();
		return rec(v) ? v : {};
	} catch {
		return {};
	}
}
