// Garden, server side: reads the records into the plain shapes of core/garden.ts, builds the page data, and writes weekly readings on request.
// The form and the rhythm are recomputed on every load; the only thing stored is a reading (append-only garden_readings).
import { db, accountId } from './db.ts';
import { english, tr } from './locale.ts';
import { findProblem } from './lang.ts';
import { gardenMemo } from './memo.ts';
import { allRuns } from './spar-log.ts';
import { askCoach, connectedCoaches } from './worker.ts';
import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
import {
	READING_SYSTEM, READING_SYSTEM_EN, createGarden, parseReading, readingPrompt, rhythmOf, weekKeyOf, weekLabelOf, weekStartOf, weeklyFacts,
	type GardenRecords, type LangRec, type SparRec, type SpeedRec, type WeekFact
} from '#lib/core/garden.ts';
import { TOPICS } from '#lib/core/lang.ts';
import { recallSummary, runStatus, sprintSummary } from '#lib/core/spar.ts';
import type { GardenData, GardenReading, GardenReadingResponse } from '#lib/types.ts';
import type { Locale } from '#lib/locale.ts';

const LANG = 'scala';
const nowSec = () => Math.floor(Date.now() / 1000);
export const DEFAULT_BACKEND: BackendId = 'claude';

type SessionRow = { id: number; problem_id: string; started_at: number; hints_used: number; ended_at: number | null; outcome: 'passed' | 'revealed' | null; elapsed_sec: number | null };

/** Everything the maths needs, read from the tables. Sessions of problems that no longer exist are left out. */
export function loadRecords(): GardenRecords {
	const meta = new Map<string, ReturnType<typeof findProblem>>();
	const problem = (id: string) => (meta.has(id) ? meta.get(id)! : (meta.set(id, findProblem(id)), meta.get(id)!));

	const rows = db().prepare('SELECT id, problem_id, started_at, hints_used, ended_at, outcome, elapsed_sec FROM lang_sessions WHERE lang = ? ORDER BY id').all(LANG) as SessionRow[];
	const lang: LangRec[] = rows.flatMap((r) => {
		const p = problem(r.problem_id);
		return p
			? [{
				id: r.id, problemId: p.id, title: p.title, topic: p.topic, level: p.level, book: !!p.book, limitSec: p.limitSec, startedAt: r.started_at, endedAt: r.ended_at,
				outcome: r.outcome, elapsedSec: r.elapsed_sec, hintsUsed: r.hints_used
			}]
			: [];
	});

	const m = gardenMemo();
	const now = Date.now();
	const spar: SparRec[] = [];
	const sprintSpeeds: SpeedRec[] = [];
	for (const r of allRuns()) {
		const st = runStatus(r.kind, r.events, now - r.startedMs); // read only: nothing is settled here
		const end = r.events.find((e) => e.type === 'finish' || e.type === 'abandon');
		const endedAt = end ? end.at : st.settle ? r.startedAt + Math.round(st.settle.ms / 1000) : null;
		if (r.kind === 'sprint') {
			const sum = sprintSummary(r.items, r.events);
			spar.push({ id: r.id, kind: 'sprint', startedAt: r.startedAt, endedAt, status: st.status, totalMs: sum.totalMs, skipped: sum.skipped, correct: 0, accuracy: null });
			for (const row of sum.rows) {
				const p = problem(row.id);
				const pass = r.events.find((e) => e.type === 'pass' && e.itemId === row.id);
				if (row.outcome === 'passed' && row.splitMs !== null && p && p.limitSec > 0 && pass) sprintSpeeds.push({ at: pass.at, ratio: row.splitMs / (p.limitSec * 1000) });
			}
		} else {
			const sum = recallSummary(r.events);
			spar.push({ id: r.id, kind: 'recall', startedAt: r.startedAt, endedAt, status: st.status, totalMs: null, skipped: 0, correct: sum.correct, accuracy: sum.accuracy });
		}
	}
	return { lang, memo: m.reviews, spar, sprintSpeeds, cards: m.cards, topicsTotal: Object.keys(TOPICS).length };
}

// ---------- readings ----------
type ReadingRow = { id: number; week_key: string; created_at: number; backend: string; body: string };
const backendName = (id: string) => (id in BACKENDS ? BACKENDS[id as BackendId] : id);

function toReading(r: ReadingRow): GardenReading | null {
	try {
		const body = JSON.parse(r.body) as { sentences?: { text: string; facts: { id: string; text: string }[] }[] };
		if (!Array.isArray(body.sentences)) return null;
		return { id: r.id, weekKey: r.week_key, createdAt: r.created_at, backend: r.backend, backendName: backendName(r.backend), sentences: body.sentences };
	} catch {
		return null;
	}
}

const latestReading = (weekKey: string, locale: Locale): GardenReading | null => {
	const r = db().prepare(`SELECT * FROM garden_readings WHERE week_key = ?
		AND CASE WHEN json_valid(body) THEN COALESCE(json_extract(body, '$.locale'), 'ko') END = ?
		ORDER BY id DESC LIMIT 1`).get(weekKey, locale) as ReadingRow | undefined;
	return r ? toReading(r) : null;
};

export async function gardenData(): Promise<GardenData> {
	const locale = english() ? 'en' : 'ko';
	const rec = loadRecords();
	const g = createGarden(rec, locale);
	const now = nowSec();
	const start = weekStartOf(now);
	const key = weekKeyOf(start);
	const available = await connectedCoaches();
	return {
		days: g.days(now),
		rhythm: rhythmOf(rec, locale),
		week: { key, label: weekLabelOf(start, locale), factCount: weeklyFacts(rec, start, now, g, locale).length },
		reading: latestReading(key, locale),
		backends: available.map((id) => ({ id, name: BACKENDS[id] })),
		defaultBackend: available[0] ?? DEFAULT_BACKEND
	};
}

const busy = new Set<string>();
const ASK_TIMEOUT_MS = 150_000;

/** Asks one backend for this week's reading, validates it, stores the accepted sentences as a new row. On any failure nothing is stored. */
export async function createReading(backendId: unknown): Promise<{ status: number; body: GardenReadingResponse }> {
	const locale = english() ? 'en' : 'ko';
	const id = (typeof backendId === 'string' && backendId in BACKENDS ? backendId : DEFAULT_BACKEND) as BackendId;
	if (busy.has(accountId())) return { status: 409, body: { error: tr('이미 풀이를 쓰는 중입니다. 잠시 기다려 주세요.', 'A reading is already being written. Please wait.') } };
	const rec = loadRecords();
	const now = nowSec();
	const start = weekStartOf(now);
	const key = weekKeyOf(start);
	const facts = weeklyFacts(rec, start, now, undefined, locale);
	if (facts.length === 0) return { status: 409, body: { error: tr('이번 주 기록이 아직 없어 읽을 것이 없습니다.', 'No records for this week yet.') } };

	busy.add(accountId());
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), ASK_TIMEOUT_MS);
		let text: string;
		try {
			text = await askCoach(id, readingPrompt(weekLabelOf(start, locale), facts, locale), locale === 'en' ? READING_SYSTEM_EN : READING_SYSTEM, () => {}, ctl.signal);
		} finally {
			clearTimeout(timer);
		}
		const parsed = parseReading(text, facts, locale);
		if (!parsed || parsed.sentences.length === 0) return { status: 502, body: { error: tr('풀이를 받았지만 쓸 수 있는 문장이 없었습니다. 다시 시도해 주세요.', 'The reading contained no usable sentences. Try again.') } };
		const byId = new Map(facts.map((f) => [f.id, f]));
		const sentences = parsed.sentences.map((s) => ({ text: s.text, facts: s.factIds.map((i) => byId.get(i)!) as WeekFact[] }));
		const at = nowSec();
		const row = db().prepare('INSERT INTO garden_readings(week_key, created_at, backend, body) VALUES(?,?,?,?)').run(key, at, id, JSON.stringify({ locale, sentences }));
		return { status: 200, body: { reading: { id: Number(row.lastInsertRowid), weekKey: key, createdAt: at, backend: id, backendName: backendName(id), sentences } } };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { status: 502, body: { error: tr(`풀이를 받지 못했습니다. ${msg}`, `Could not get the reading. ${msg}`).slice(0, 600) } };
	} finally {
		busy.delete(accountId());
	}
}
