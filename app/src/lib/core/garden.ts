// Garden: pure maths. The form of the plant, the rhythm by hour and the facts of a week are all recomputed from the records;
// nothing here is stored. The form on a day is a function of the records up to the end of that day, so a date slider can show the past.
// Resting changes nothing (no decay, no streak): a day without records leaves every value as it was.
// Time zone: the process's local time. Timestamps are unix seconds. I/O (reading the tables) lives in src/lib/server/garden.ts.
import { TOPICS } from './lang.ts';
import { noteStatus, replayEach, type Rating } from './memo-sched.ts';
import type { GardenForm, GardenHour, GardenKind, GardenNumbers, GardenRhythmFact } from '../types.ts';

// ---------- records ----------
/** One language session (a row of lang_sessions with its problem's facts). endedAt null = not ended (open, or abandoned when a later session of the problem exists). */
export type LangRec = {
	id: number; problemId: string; title: string; topic: string; level: 1 | 2 | 3; book: boolean; limitSec: number;
	startedAt: number; endedAt: number | null; outcome: 'passed' | 'revealed' | null; elapsedSec: number | null; hintsUsed: number;
};
export type MemoRec = { itemType: 'card' | 'check'; itemId: string; at: number; rating: Rating; topic: string | null };
/** One Sparring run. endedAt = time of its end event; status as of now. */
export type SparRec = {
	id: number; kind: 'sprint' | 'recall'; startedAt: number; endedAt: number | null; status: 'running' | 'finished' | 'abandoned';
	totalMs: number | null; skipped: number; correct: number; accuracy: number | null;
};
/** How long a solved problem took relative to its limit (1 = exactly the limit): sprint splits. */
export type SpeedRec = { at: number; ratio: number };
export type GardenRecords = {
	lang: LangRec[]; memo: MemoRec[]; spar: SparRec[]; sprintSpeeds: SpeedRec[];
	cards: string[]; // ids of the cards that can be leaves (file cards that are open)
	topicsTotal: number;
};

// ---------- constants (see the report for why) ----------
/** Weight of one record in "how much practice": a passed language session 1, a memo review 0.2 (about 20 s), a finished Sparring run 2. */
export const W = { lang: 1, memo: 0.2, spar: 2 } as const;
/** x -> 1 - exp(-x / scale): rises fast at first, never reaches 1. Scale = the amount that gives 0.63. */
export const SCALE = { volume: 120, leaves: 40, roots: 60 } as const;
/** Roots: a level-3 or book problem passed counts 3; a minute spent past the limit on a problem that was passed in the end counts 0.25. */
export const ROOTS = { perProblem: 3, perOvertimeMin: 0.25 } as const;
/** Pace: the median elapsed/limit of passed sessions maps 0.2 -> 1 (fast, dry) … 1.1 -> 0 (slow, wet). Needs this many passed sessions. */
export const PACE = { fast: 0.2, slow: 1.1, min: 3 } as const;
export const KIND = { seedling: 0.18, wide: 0.62, straight: 0.36 } as const;
export const MIN_PER_HOUR = 6;
export const MIN_HOURS = 3;
export const GAP_DAYS = 3;
export const GAP_NEED = { gaps: 2, after: 6, normal: 20 } as const;

// ---------- small helpers ----------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sat = (x: number, scale: number) => 1 - Math.exp(-Math.max(0, x) / scale);
export function median(xs: number[]): number | null {
	if (xs.length === 0) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Local calendar day as an integer (days since 1970-01-01 of the local date). */
export const dayNumber = (sec: number): number => {
	const d = new Date(sec * 1000);
	return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};
/** Unix seconds of local midnight that starts day `n`. */
export const dayStart = (n: number): number => {
	const u = new Date(n * 86_400_000);
	return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime() / 1000;
};
export const dateString = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const hourOf = (sec: number) => new Date(sec * 1000).getHours();
const md = (sec: number) => `${new Date(sec * 1000).getMonth() + 1}.${new Date(sec * 1000).getDate()}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** 32-bit string hash. */
export function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export const KIND_LABEL: Record<GardenKind, string> = {
	unknown: '아직 무엇이 될지 모름', wide: '넓게 퍼지는 형태', straight: '곧게 서는 형태', even: '고르게 자라는 형태'
};

/** Short label of the form from its values, as in the mockup. Describes the recorded practice, not a person. */
export function kindOf(volume: number, breadth: number): GardenKind {
	if (volume < KIND.seedling) return 'unknown';
	return breadth > KIND.wide ? 'wide' : breadth < KIND.straight ? 'straight' : 'even';
}

/** Normalised Shannon entropy of weights (0 = all in one place, 1 = perfectly even over `total` places). */
export function normalisedEntropy(weights: number[], total: number): number {
	const sum = weights.reduce((a, b) => a + b, 0);
	if (sum <= 0 || total < 2) return 0;
	const h = -weights.filter((w) => w > 0).reduce((a, w) => a + (w / sum) * Math.log(w / sum), 0);
	return clamp01(h / Math.log(total));
}

/** 0..1 from the median elapsed/limit: 1 = fast. Null (not enough sessions) = 0.5. */
export function paceOf(medianRatio: number | null): number {
	if (medianRatio === null) return 0.5;
	return clamp01((PACE.slow - medianRatio) / (PACE.slow - PACE.fast));
}

// ---------- language sessions as of a moment ----------
/** Sessions as they stood at `asOf`: a session that had not ended yet counts as open. Sorted by start, then id. */
function sessionsAt(lang: LangRec[], asOf: number): LangRec[] {
	return lang
		.filter((s) => s.startedAt <= asOf)
		.map((s) => (s.endedAt !== null && s.endedAt <= asOf ? s : { ...s, endedAt: null, outcome: null, elapsedSec: null }))
		.sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
}
const byProblem = (ss: LangRec[]) => {
	const m = new Map<string, LangRec[]>();
	for (const s of ss) m.set(s.problemId, [...(m.get(s.problemId) ?? []), s]);
	return m;
};
const isPassed = (s: LangRec) => s.outcome === 'passed' && s.endedAt !== null;
const overLimit = (s: LangRec) => s.endedAt !== null && (s.elapsedSec ?? 0) > s.limitSec;

export type Mended = { problemId: string; title: string; struggleAt: number; passedAt: number; how: 'revealed' | 'abandoned' | 'over' };

/**
 * Problems that once ended revealed, were left open and replaced, or were finished past the limit, and were passed in a later session.
 * One entry per problem: its first such struggle and the first pass after it.
 */
export function mendedProblems(sessions: LangRec[]): Mended[] {
	const out: Mended[] = [];
	for (const [problemId, list] of byProblem(sessions)) {
		for (let i = 0; i < list.length; i++) {
			const s = list[i];
			const how = s.outcome === 'revealed' ? 'revealed' : s.endedAt === null && i < list.length - 1 ? 'abandoned' : overLimit(s) ? 'over' : null;
			if (!how) continue;
			const later = list.slice(i + 1).find(isPassed);
			if (later) out.push({ problemId, title: s.title, struggleAt: s.endedAt ?? list[i + 1].startedAt, passedAt: later.endedAt!, how });
			break; // the first struggle decides; a problem is mended once
		}
	}
	return out;
}

// ---------- rare moments ----------
export type Moment = { at: number; kind: 'sprint-best' | 'recall-best' | 'first-level3'; label: string; problemId?: string };

/** A new best is an improvement over an earlier qualifying best (the first qualifying run is not a "new" best). Same rules as core/spar.ts bestSprint / bestRecall. */
export function sparBestMoments(spar: SparRec[]): Moment[] {
	const out: Moment[] = [];
	const runs = spar.filter((r) => r.status === 'finished' && r.endedAt !== null).sort((a, b) => a.endedAt! - b.endedAt! || a.id - b.id);
	let sprint: number | null = null;
	let recall: { correct: number; accuracy: number } | null = null;
	for (const r of runs) {
		if (r.kind === 'sprint') {
			if (r.skipped > 0 || r.totalMs === null) continue;
			if (sprint !== null && r.totalMs < sprint) out.push({ at: r.endedAt!, kind: 'sprint-best', label: 'Sprint 최고 기록 경신' });
			if (sprint === null || r.totalMs < sprint) sprint = r.totalMs;
		} else {
			if (r.accuracy === null || r.accuracy < 0.8) continue;
			const better = !recall || r.correct > recall.correct || (r.correct === recall.correct && r.accuracy > recall.accuracy);
			if (recall && better) out.push({ at: r.endedAt!, kind: 'recall-best', label: 'Recall 최고 기록 경신' });
			if (better) recall = { correct: r.correct, accuracy: r.accuracy };
		}
	}
	return out;
}

/** The first pass of each level-3 problem. */
export function firstLevel3Moments(lang: LangRec[]): Moment[] {
	const first = new Map<string, LangRec>();
	for (const s of lang) {
		if (s.level !== 3 || !isPassed(s)) continue;
		const f = first.get(s.problemId);
		if (!f || s.endedAt! < f.endedAt!) first.set(s.problemId, s);
	}
	return [...first.values()].map((s) => ({ at: s.endedAt!, kind: 'first-level3' as const, label: `${s.title} 첫 통과`, problemId: s.problemId }));
}

// ---------- the form ----------
type StableStep = { at: number; stable: boolean };

/** For each live card, whether it was stable after each of its reviews (notes status: last rating >= 3 and interval >= 7 days). */
function stableTimeline(memo: MemoRec[], cards: string[]): Map<string, StableStep[]> {
	const live = new Set(cards);
	const by = new Map<string, MemoRec[]>();
	for (const r of memo) if (r.itemType === 'card' && live.has(r.itemId)) by.set(r.itemId, [...(by.get(r.itemId) ?? []), r]);
	const out = new Map<string, StableStep[]>();
	for (const [id, rs] of by) {
		const sorted = rs.map((r, i) => ({ ...r, i })).sort((a, b) => a.at - b.at || a.i - b.i);
		out.set(id, replayEach(sorted).map((m, k) => ({ at: sorted[k].at, stable: noteStatus(m, true) === 'stable' })));
	}
	return out;
}

const stableCountAt = (tl: Map<string, StableStep[]>, asOf: number) => {
	let n = 0;
	for (const steps of tl.values()) {
		let last: StableStep | undefined;
		for (const s of steps) if (s.at <= asOf) last = s;
		if (last?.stable) n++;
	}
	return n;
};

const emptyNumbers = (topicsTotal: number): GardenNumbers => ({
	langPassed: 0, memoReviews: 0, sparRuns: 0, topics: 0, topicsTotal, stableCards: 0, deepPassed: 0, overtimeMin: 0, medianRatio: null, mended: 0, bests: 0, firstLevel3: 0
});

export function firstRecordAt(rec: GardenRecords): number | null {
	const all = [...rec.lang.map((s) => s.startedAt), ...rec.memo.map((r) => r.at), ...rec.spar.map((r) => r.startedAt)];
	return all.length ? Math.min(...all) : null;
}

/** A garden over a set of records. `formAt(t)` is the form from the records up to t (inclusive). */
export function createGarden(rec: GardenRecords) {
	const first = firstRecordAt(rec);
	const seed = first === null ? 1 : hash(dateString(dayNumber(first))) % 1_000_000;
	const timeline = stableTimeline(rec.memo, rec.cards);
	const moments = [...sparBestMoments(rec.spar), ...firstLevel3Moments(rec.lang)].sort((a, b) => a.at - b.at);

	function formAt(asOf: number): GardenForm {
		if (first === null || first > asOf) {
			return {
				day: 0, volume: 0, breadth: 0, leaves: 0, roots: 0, pace: 0.5, leafCount: 0, mended: 0, flowers: 0, kind: 'unknown', kindLabel: KIND_LABEL.unknown, seed,
				numbers: emptyNumbers(rec.topicsTotal)
			};
		}
		const sessions = sessionsAt(rec.lang, asOf);
		const passed = sessions.filter(isPassed);
		const memo = rec.memo.filter((r) => r.at <= asOf);
		const spar = rec.spar.filter((r) => r.status === 'finished' && r.endedAt !== null && r.endedAt <= asOf);

		const volume = sat(passed.length * W.lang + memo.length * W.memo + spar.length * W.spar, SCALE.volume);

		const byTopic = new Map<string, number>();
		for (const s of passed) byTopic.set(s.topic, (byTopic.get(s.topic) ?? 0) + W.lang);
		for (const r of memo) if (r.topic) byTopic.set(r.topic, (byTopic.get(r.topic) ?? 0) + W.memo);
		const breadth = normalisedEntropy([...byTopic.values()], rec.topicsTotal);

		const stable = stableCountAt(timeline, asOf);
		const leaves = sat(stable, SCALE.leaves);

		const passedIds = new Set(passed.map((s) => s.problemId));
		const deep = new Set(passed.filter((s) => s.level === 3 || s.book).map((s) => s.problemId)).size;
		const overSec = sessions.filter((s) => passedIds.has(s.problemId) && overLimit(s)).reduce((a, s) => a + (s.elapsedSec! - s.limitSec), 0);
		const overtimeMin = Math.round(overSec / 60);
		const roots = sat(deep * ROOTS.perProblem + (overSec / 60) * ROOTS.perOvertimeMin, SCALE.roots);

		const ratios = passed.filter((s) => s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec);
		const medianRatio = ratios.length >= PACE.min ? median(ratios) : null;

		const mended = mendedProblems(sessions).length;
		const mine = moments.filter((m) => m.at <= asOf);
		const bests = mine.filter((m) => m.kind !== 'first-level3').length;
		const firstLevel3 = mine.length - bests;

		const kind = kindOf(volume, breadth);
		return {
			day: dayNumber(asOf) - dayNumber(first) + 1, volume, breadth, leaves, roots, pace: paceOf(medianRatio), leafCount: stable, mended, flowers: mine.length, kind, kindLabel: KIND_LABEL[kind], seed,
			numbers: {
				langPassed: passed.length, memoReviews: memo.length, sparRuns: spar.length, topics: byTopic.size, topicsTotal: rec.topicsTotal, stableCards: stable, deepPassed: deep, overtimeMin,
				medianRatio, mended, bests, firstLevel3
			}
		};
	}

	/** One form per local day from the first record's day to the day of `now` (the last one is as of `now`). */
	function days(now: number): { date: string; form: GardenForm }[] {
		const to = dayNumber(now);
		if (first === null) return [{ date: dateString(to), form: formAt(now) }];
		const out: { date: string; form: GardenForm }[] = [];
		for (let d = dayNumber(first); d <= to; d++) out.push({ date: dateString(d), form: formAt(d === to ? now : dayStart(d + 1) - 1) });
		return out;
	}
	return { formAt, days, first, moments, stableCountAt: (t: number) => stableCountAt(timeline, t), stableTimeline: timeline };
}

// ---------- rhythm ----------
export type Outcome = { at: number; ok: boolean };

/**
 * First-attempt outcomes: memo reviews (rating >= 2 is ok, 1 is not) and, for each problem, its first language session
 * (ok = passed within the limit without hints; a session left open and replaced counts as not ok; one still open is left out).
 */
export function firstAttempts(rec: Pick<GardenRecords, 'lang' | 'memo'>): Outcome[] {
	const out: Outcome[] = rec.memo.map((r) => ({ at: r.at, ok: r.rating >= 2 }));
	for (const list of byProblem([...rec.lang].sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)).values()) {
		const s = list[0];
		if (s.endedAt === null) {
			if (list.length > 1) out.push({ at: s.startedAt, ok: false });
			continue;
		}
		out.push({ at: s.startedAt, ok: s.outcome === 'passed' && (s.elapsedSec ?? 0) <= s.limitSec && s.hintsUsed === 0 });
	}
	return out;
}

export function hourly(outcomes: Outcome[], min = MIN_PER_HOUR): GardenHour[] {
	const hours: GardenHour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, n: 0, ok: 0, rate: null, enough: false }));
	for (const o of outcomes) {
		const h = hours[hourOf(o.at)];
		h.n++;
		if (o.ok) h.ok++;
	}
	for (const h of hours) {
		h.rate = h.n ? h.ok / h.n : null;
		h.enough = h.n >= min;
	}
	return hours;
}

const hourText = (h: GardenHour) => `${h.hour}시 · ${pct(h.rate!)} (${h.n}건)`;

/** Best and shakiest hours: only hours with enough samples are named, and only when at least MIN_HOURS of them exist. */
export function bestAndShaky(hours: GardenHour[]): { best: GardenHour; shaky: GardenHour } | 'few' | 'flat' {
	const ok = hours.filter((h) => h.enough);
	if (ok.length < MIN_HOURS) return 'few';
	const best = ok.reduce((a, h) => (h.rate! > a.rate! || (h.rate === a.rate && h.n > a.n) ? h : a));
	const shaky = ok.reduce((a, h) => (h.rate! < a.rate! || (h.rate === a.rate && h.n > a.n) ? h : a));
	return best.rate! - shaky.rate! < 0.05 ? 'flat' : { best, shaky };
}

export type Gap = { returnDay: number; after: SpeedRec[] };

/** All speeds as (calendar day, ratio): passed language sessions and sprint splits. */
export function speedSamples(rec: Pick<GardenRecords, 'lang' | 'sprintSpeeds'>): SpeedRec[] {
	return [
		...rec.lang.filter((s) => isPassed(s) && s.limitSec > 0).map((s) => ({ at: s.endedAt!, ratio: (s.elapsedSec ?? 0) / s.limitSec })),
		...rec.sprintSpeeds
	].sort((a, b) => a.at - b.at);
}

export function activeDays(rec: Pick<GardenRecords, 'lang' | 'memo' | 'spar'>): number[] {
	const days = new Set<number>();
	for (const s of rec.lang) {
		days.add(dayNumber(s.startedAt));
		if (s.endedAt !== null) days.add(dayNumber(s.endedAt));
	}
	for (const r of rec.memo) days.add(dayNumber(r.at));
	for (const r of rec.spar) days.add(dayNumber(r.startedAt));
	return [...days].sort((a, b) => a - b);
}

const daysWord = (n: number) => (n === 0 ? '같은 날 돌아옴' : n === 1 ? '하루' : n === 2 ? '이틀' : n === 3 ? '사흘' : `${n}일`);

/** The two gap facts: how much slower on the first day back after >= GAP_DAYS without records, and how many days until normal speed again. */
export function gapFacts(days: number[], speeds: SpeedRec[]): { slow: string | null; back: string | null } {
	const returns: number[] = [];
	for (let i = 1; i < days.length; i++) if (days[i] - days[i - 1] >= GAP_DAYS) returns.push(days[i]);
	const byDay = new Map<number, number[]>();
	for (const s of speeds) byDay.set(dayNumber(s.at), [...(byDay.get(dayNumber(s.at)) ?? []), s.ratio]);
	const retSet = new Set(returns);
	const normal = [...byDay].filter(([d]) => !retSet.has(d)).flatMap(([, r]) => r);
	const base = median(normal);
	const gaps = returns.filter((d) => byDay.has(d));
	const after = gaps.flatMap((d) => byDay.get(d)!);
	let slow: string | null = null;
	if (base !== null && base > 0 && gaps.length >= GAP_NEED.gaps && after.length >= GAP_NEED.after && normal.length >= GAP_NEED.normal) {
		const x = median(after)! / base - 1;
		slow = Math.abs(x) < 0.05 ? '평소와 비슷' : x > 0 ? `평소보다 ${Math.round(x * 100)}% 느림` : `평소보다 ${Math.round(-x * 100)}% 빠름`;
	}
	let back: string | null = null;
	if (base !== null && base > 0 && normal.length >= GAP_NEED.normal) {
		const took: number[] = [];
		for (const d of gaps) {
			for (let k = 0; k <= 14; k++) {
				const r = byDay.get(d + k);
				if (r && median(r)! <= base * 1.1) {
					took.push(k);
					break;
				}
			}
		}
		const m = median(took);
		if (took.length >= GAP_NEED.gaps && m !== null) back = daysWord(Math.round(m));
	}
	return { slow, back };
}

export const RHYTHM_NEED = {
	best: `시간대마다 ${MIN_PER_HOUR}건 이상 쌓인 시간대가 ${MIN_HOURS}개 이상이면 보입니다.`,
	gapSlow: `${GAP_DAYS}일 이상 비운 뒤 돌아온 날이 ${GAP_NEED.gaps}번 이상, 그날 푼 것이 ${GAP_NEED.after}개 이상, 평소 기록이 ${GAP_NEED.normal}개 이상이면 보입니다.`,
	gapReturn: `돌아온 날이 ${GAP_NEED.gaps}번 이상, 평소 기록이 ${GAP_NEED.normal}개 이상이면 보입니다.`
};

export function rhythmOf(rec: GardenRecords): { hours: GardenHour[]; total: number; minPerHour: number; facts: GardenRhythmFact[] } {
	const outcomes = firstAttempts(rec);
	const hours = hourly(outcomes);
	const bs = bestAndShaky(hours);
	const gaps = gapFacts(activeDays(rec), speedSamples(rec));
	const named = typeof bs === 'object';
	const flat = bs === 'flat' ? '시간대 차이가 크지 않음' : null;
	return {
		hours, total: outcomes.length, minPerHour: MIN_PER_HOUR,
		facts: [
			{ key: 'best', label: '가장 잘 푸는 시간', value: named ? hourText(bs.best) : flat, need: RHYTHM_NEED.best },
			{ key: 'shaky', label: '가장 흔들리는 시간', value: named ? hourText(bs.shaky) : flat, need: RHYTHM_NEED.best },
			{ key: 'gapSlow', label: `${GAP_DAYS}일 이상 비운 뒤 속도`, value: gaps.slow, need: RHYTHM_NEED.gapSlow },
			{ key: 'gapReturn', label: '돌아오는 데 걸리는 날', value: gaps.back, need: RHYTHM_NEED.gapReturn }
		]
	};
}

// ---------- the week ----------
export type WeekFact = { id: string; text: string };

/** Local Monday 00:00 (unix seconds) of the week containing `now`. */
export function weekStartOf(now: number): number {
	const d = new Date(now * 1000);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime() / 1000;
}
export const weekKeyOf = (start: number): string => dateString(dayNumber(start));
export const weekLabelOf = (start: number): string => {
	const s = new Date(start * 1000);
	const e = new Date(start * 1000 + 6 * 86_400_000);
	return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
};

const topicName = (t: string) => (t in TOPICS ? TOPICS[t as keyof typeof TOPICS] : t);
const inWeek = (at: number, a: number, b: number) => at >= a && at < b;
const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * The facts of the week starting at `start` (up to `now`), each with an id and a plain Korean sentence. Used both as what the backend may rely on
 * and as what "근거 보기" shows. Empty when the week has no record at all.
 */
export function weeklyFacts(rec: GardenRecords, start: number, now: number, garden = createGarden(rec)): WeekFact[] {
	const end = Math.min(dayStart(dayNumber(start) + 7), now + 1);
	const prevStart = dayStart(dayNumber(start) - 7);
	const facts: WeekFact[] = [];
	const add = (id: string, text: string) => facts.push({ id, text });

	const sessions = sessionsAt(rec.lang, now);
	const passedWeek = sessions.filter((s) => isPassed(s) && inWeek(s.endedAt!, start, end));
	const memoWeek = rec.memo.filter((r) => inWeek(r.at, start, end));
	const memoPrev = rec.memo.filter((r) => inWeek(r.at, prevStart, start));
	const sparWeek = rec.spar.filter((r) => r.status === 'finished' && r.endedAt !== null && inWeek(r.endedAt, start, end));
	const anyWeek = passedWeek.length + memoWeek.length + sparWeek.length + sessions.filter((s) => inWeek(s.startedAt, start, end)).length;
	if (anyWeek === 0) return [];

	// days with a record
	const dayset = new Set(activeDays({ lang: rec.lang, memo: rec.memo, spar: rec.spar }).filter((d) => inWeek(dayStart(d), start, end)));
	const elapsedDays = Math.min(7, dayNumber(now) - dayNumber(start) + 1);
	add('days', `이번 주 ${elapsedDays}일 가운데 기록이 있는 날은 ${dayset.size}일입니다.`);

	if (passedWeek.length) {
		const by = new Map<string, number>();
		for (const s of passedWeek) by.set(s.topic, (by.get(s.topic) ?? 0) + 1);
		const list = top(by, 4).map(([t, n]) => `${topicName(t)} ${n}`).join(', ');
		add('lang', `이번 주 통과한 언어 문제는 ${passedWeek.length}개입니다. (${list})`);
		const before = new Set(sessions.filter((s) => isPassed(s) && s.endedAt! < start).map((s) => s.topic));
		const fresh = [...new Set(passedWeek.map((s) => s.topic))].filter((t) => !before.has(t));
		add('topics', fresh.length ? `이번 주 처음 통과한 주제가 ${fresh.length}개 있습니다. (${fresh.map(topicName).join(', ')})` : `이번 주에는 처음 다룬 주제가 없습니다. 이번 주 주제는 ${new Set(passedWeek.map((s) => s.topic)).size}개입니다.`);
		const deep = passedWeek.filter((s) => s.level === 3 || s.book);
		if (deep.length) {
			const min = Math.round(deep.reduce((a, s) => a + (s.elapsedSec ?? 0), 0) / 60);
			add('deep', `복합 문제나 책 문제를 ${deep.length}개 통과했습니다. 걸린 시간은 모두 ${min}분입니다.`);
		}
		const ratios = passedWeek.filter((s) => s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec);
		const all = sessions.filter((s) => isPassed(s) && s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec);
		if (ratios.length >= PACE.min && all.length >= 2 * PACE.min) add('pace', `이번 주 통과 문제는 제한 시간의 ${pct(median(ratios)!)}(중앙값)를 썼습니다. 지금까지 전체는 ${pct(median(all)!)}입니다.`);
	}

	const mended = mendedProblems(sessions).filter((m) => inWeek(m.passedAt, start, end)).slice(0, 3);
	const how = { revealed: '모범답안을 보고 끝낸', abandoned: '풀다 만', over: '제한 시간을 넘긴' } as const;
	mended.forEach((m, i) => add(`mend${i + 1}`, `${m.title}: ${md(m.struggleAt)}에 ${how[m.how]} 문제를 ${md(m.passedAt)}에 다시 풀어 통과했습니다.`));

	if (memoWeek.length) {
		const ok = memoWeek.filter((r) => r.rating >= 2).length;
		add('memo', `이번 주 암기 복습은 ${memoWeek.length}회, 기억한 비율은 ${pct(ok / memoWeek.length)}입니다.${memoPrev.length ? ` 지난주는 ${memoPrev.length}회였습니다.` : ''}`);
	}
	if (rec.memo.length) {
		const a = garden.stableCountAt(start - 1), b = garden.stableCountAt(Math.min(end - 1, now));
		if (b !== a) add('leaf', `안정된 카드가 주초 ${a}장에서 지금 ${b}장으로 ${b > a ? '늘었' : '줄었'}습니다.`);
		else if (b > 0) add('leaf', `안정된 카드는 이번 주 ${b}장 그대로입니다.`);
		const twice = twiceFailed(rec.memo, rec.cards);
		if (twice > 0) add('shaky', `최근 복습에서 두 번 연속 모른 카드가 ${twice}장 있습니다.`);
	}

	if (sparWeek.length) {
		const bests = sparBestMoments(rec.spar).filter((m) => inWeek(m.at, start, end));
		add('spar', `이번 주 끝낸 Sparring은 ${sparWeek.length}회입니다.${bests.length ? ` 그중 최고 기록을 새로 쓴 것이 ${bests.length}번입니다.` : ''}`);
	}
	const l3 = firstLevel3Moments(sessions).filter((m) => inWeek(m.at, start, end));
	if (l3.length) add('first3', `복합 문제를 처음 통과했습니다. (${l3.slice(0, 3).map((m) => m.label.replace(/ 첫 통과$/, '')).join(', ')})`);

	const hoursWeek = new Map<string, number>();
	for (const o of [...memoWeek.map((r) => r.at), ...passedWeek.map((s) => s.endedAt!)]) hoursWeek.set(String(hourOf(o)), (hoursWeek.get(String(hourOf(o))) ?? 0) + 1);
	const [h1] = top(hoursWeek, 1);
	if (h1 && h1[1] >= 4) add('hour', `이번 주 기록이 가장 몰린 시간은 ${h1[0]}시대입니다. (${h1[1]}건)`);

	const r = rhythmOf(rec);
	const best = r.facts.find((f) => f.key === 'best');
	const shaky = r.facts.find((f) => f.key === 'shaky');
	if (best?.value && shaky?.value && best.value !== shaky.value && !best.value.includes('크지 않음')) add('rhythm', `전체 기록에서 정답률이 가장 높은 시간은 ${best.value}, 가장 낮은 시간은 ${shaky.value}입니다.`);
	return facts;
}

/** Cards (that are live) whose two latest reviews were both "again". */
function twiceFailed(memo: MemoRec[], cards: string[]): number {
	const live = new Set(cards);
	const by = new Map<string, MemoRec[]>();
	for (const r of memo) if (r.itemType === 'card' && live.has(r.itemId)) by.set(r.itemId, [...(by.get(r.itemId) ?? []), r]);
	let n = 0;
	for (const rs of by.values()) {
		const last = rs.sort((a, b) => a.at - b.at).slice(-2);
		if (last.length === 2 && last.every((r) => r.rating === 1)) n++;
	}
	return n;
}

// ---------- the reading ----------
export const READING_MAX_CHARS = 80;
export const READING_MAX_SENTENCES = 5;

export const READING_SYSTEM = [
	'당신은 학습 기록에서 한 주를 읽어 짧은 글을 쓰는 사람입니다. 문체는 차분하고 고전적이며, 동양 붓그림의 감각으로 자연과 계절에 빗대어 씁니다.',
	'',
	'규칙',
	'- 입력 JSON의 facts에 적힌 사실만 근거로 쓴다. 숫자, 이름, 날짜를 지어내거나 바꾸지 않는다.',
	'- 3문장에서 5문장. 한 문장은 한국어 80자 이하.',
	'- 문장마다 근거가 된 fact의 id를 facts 배열에 적는다. 근거가 없는 문장은 쓰지 않는다.',
	'- 사람의 성격, 재능, 기질, 운세, 앞날을 말하지 않는다. "당신은 ~한 사람" 같은 단정도 하지 않는다. 기록에 나타난 행동과 흐름만 묘사한다.',
	'- facts가 뒷받침하지 않는 조언, 권유, 칭찬, 걱정은 쓰지 않는다. 쉰 날이나 느린 날을 나쁘게 말하지 않는다.',
	'- 도구를 쓰지 않고, 파일을 읽지 않는다.',
	'- 출력은 아래 모양의 JSON 하나뿐이다. 설명, 마크다운, 코드펜스를 붙이지 않는다.',
	'{"sentences":[{"text":"문장","facts":["fact id","fact id"]}]}'
].join('\n');

export function readingPrompt(weekLabel: string, facts: WeekFact[]): string {
	return `이번 주(${weekLabel})의 기록 사실입니다. 이 사실로만 한 주를 읽어 주세요.\n\n${JSON.stringify({ week: weekLabel, facts }, null, 1)}`;
}

/** Phrases that read as a statement about the person or a fortune; such a sentence is dropped. */
const PERSON = /(당신|너|그대)(은|는|의 (성격|기질|천성|운))|운세|팔자|타고난|천성|성격|기질|앞날|미래에는/;

export type ParsedReading = { sentences: { text: string; factIds: string[] }[]; dropped: number };

/** Strict JSON in, validated sentences out. Drops sentences that cite no known fact id, exceed 80 characters, or say who the person is. Null when the text is not the expected JSON. */
export function parseReading(text: string, facts: WeekFact[]): ParsedReading | null {
	const known = new Set(facts.map((f) => f.id));
	const a = text.indexOf('{');
	const b = text.lastIndexOf('}');
	if (a < 0 || b <= a) return null;
	let v: unknown;
	try {
		v = JSON.parse(text.slice(a, b + 1));
	} catch {
		return null;
	}
	const list = v && typeof v === 'object' ? (v as { sentences?: unknown }).sentences : null;
	if (!Array.isArray(list)) return null;
	const out: ParsedReading['sentences'] = [];
	let dropped = 0;
	for (const x of list) {
		const t = x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text.trim() : '';
		const ids = x && typeof x === 'object' && Array.isArray((x as { facts?: unknown }).facts) ? ((x as { facts: unknown[] }).facts.filter((i) => typeof i === 'string' && known.has(i)) as string[]) : [];
		if (!t || ids.length === 0 || Array.from(t).length > READING_MAX_CHARS || PERSON.test(t) || out.length >= READING_MAX_SENTENCES) {
			dropped++;
			continue;
		}
		out.push({ text: t, factIds: [...new Set(ids)] });
	}
	return { sentences: out, dropped };
}
