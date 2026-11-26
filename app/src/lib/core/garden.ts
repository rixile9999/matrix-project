// Garden: pure maths. The form of the plant, the rhythm by hour and the facts of a week are all recomputed from the records;
// nothing here is stored. The form on a day is a function of the records up to the end of that day, so a date slider can show the past.
// Resting changes nothing (no decay, no streak): a day without records leaves every value as it was.
// Time zone: the process's local time. Timestamps are unix seconds. I/O (reading the tables) lives in src/lib/server/garden.ts.
import { TOPICS } from './lang.ts';
import { noteStatus, replayEach, type Rating } from './memo-sched.ts';
import { topicNames as statsTopicNames } from '../stats/labels.ts';
import type { Copy, Mode as StatsMode, Outcome as StatsOutcome, Topic as StatsTopic } from '../stats/types.ts';
import type { Locale } from '../locale.ts';
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
export type StatsRec = {
	id: number; lessonId: string; title: Copy; topic: StatsTopic; mode: StatsMode;
	seconds: number; startedAt: number; endedAt: number; outcome: StatsOutcome;
	hints: number; usedReference: boolean; submissions: number; correctFields: number; totalFields: number;
};
export type GardenRecords = {
	lang: LangRec[]; memo: MemoRec[]; spar: SparRec[]; sprintSpeeds: SpeedRec[]; stats: StatsRec[];
	cards: string[]; // ids of the cards that can be leaves (file cards that are open)
	topicsTotal: number;
	statsTopicsTotal: number;
};

// ---------- constants (see the report for why) ----------
/** Passed language and statistics sessions each count 1, a memo review 0.2 (about 20 s), a finished Sparring run 2. */
export const W = { lang: 1, memo: 0.2, spar: 2, stats: 1 } as const;
/** x -> 1 - exp(-x / scale): rises fast at first, never reaches 1. Scale = the amount that gives 0.63. */
export const SCALE = { volume: 120, leaves: 40, roots: 60 } as const;
/** Roots: a distinct level-3, book or depth-mode problem passed counts 3; a minute spent past the limit on a language problem that was passed in the end counts 0.25. */
export const ROOTS = { perProblem: 3, perOvertimeMin: 0.25 } as const;
/** Pace: the median elapsed/limit of passed coding or statistics speed sessions maps 0.2 -> 1 (fast, dry) … 1.1 -> 0 (slow, wet). */
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
const copy = (locale: Locale) => (ko: string, en: string) => locale === 'en' ? en : ko;
const count = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const hour = (n: number) => `${String(n).padStart(2, '0')}:00`;
/** 32-bit string hash. */
export function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export const KIND_LABEL: Record<GardenKind, string> = {
	unknown: '아직 무엇이 될지 모름', wide: '넓게 퍼지는 형태', straight: '곧게 서는 형태', even: '고르게 자라는 형태'
};
const kindLabelEn: Record<GardenKind, string> = {
	unknown: 'Still taking shape', wide: 'Spreading out', straight: 'Growing upright', even: 'Growing evenly'
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
export function sparBestMoments(spar: SparRec[], locale: Locale = 'ko'): Moment[] {
	const t = copy(locale);
	const out: Moment[] = [];
	const runs = spar.filter((r) => r.status === 'finished' && r.endedAt !== null).sort((a, b) => a.endedAt! - b.endedAt! || a.id - b.id);
	let sprint: number | null = null;
	let recall: { correct: number; accuracy: number } | null = null;
	for (const r of runs) {
		if (r.kind === 'sprint') {
			if (r.skipped > 0 || r.totalMs === null) continue;
			if (sprint !== null && r.totalMs < sprint) out.push({ at: r.endedAt!, kind: 'sprint-best', label: t('Sprint 최고 기록 경신', 'New Sprint best') });
			if (sprint === null || r.totalMs < sprint) sprint = r.totalMs;
		} else {
			if (r.accuracy === null || r.accuracy < 0.8) continue;
			const better = !recall || r.correct > recall.correct || (r.correct === recall.correct && r.accuracy > recall.accuracy);
			if (recall && better) out.push({ at: r.endedAt!, kind: 'recall-best', label: t('Recall 최고 기록 경신', 'New Recall best') });
			if (better) recall = { correct: r.correct, accuracy: r.accuracy };
		}
	}
	return out;
}

/** The first pass of each level-3 problem. */
export function firstLevel3Moments(lang: LangRec[], locale: Locale = 'ko'): Moment[] {
	const first = new Map<string, LangRec>();
	for (const s of lang) {
		if (s.level !== 3 || !isPassed(s)) continue;
		const f = first.get(s.problemId);
		if (!f || s.endedAt! < f.endedAt!) first.set(s.problemId, s);
	}
	return [...first.values()].map((s) => ({ at: s.endedAt!, kind: 'first-level3' as const, label: copy(locale)(`${s.title} 첫 통과`, `First pass on ${s.title}`), problemId: s.problemId }));
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
	langPassed: 0, statsRuns: 0, statsPassed: 0, statsDepthPassed: 0, memoReviews: 0, sparRuns: 0, topics: 0, topicsTotal, stableCards: 0, deepPassed: 0, overtimeMin: 0, medianRatio: null, mended: 0, bests: 0, firstLevel3: 0
});

export function firstRecordAt(rec: GardenRecords): number | null {
	const all = [...rec.lang.map((s) => s.startedAt), ...rec.memo.map((r) => r.at), ...rec.spar.map((r) => r.startedAt), ...rec.stats.map((r) => r.endedAt)];
	return all.length ? all.reduce((earliest, at) => Math.min(earliest, at)) : null;
}

/** A garden over a set of records. `formAt(t)` is the form from the records up to t (inclusive). */
export function createGarden(rec: GardenRecords, locale: Locale = 'ko') {
	const first = firstRecordAt(rec);
	const seed = first === null ? 1 : hash(dateString(dayNumber(first))) % 1_000_000;
	const timeline = stableTimeline(rec.memo, rec.cards);
	const moments = [...sparBestMoments(rec.spar, locale), ...firstLevel3Moments(rec.lang, locale)].sort((a, b) => a.at - b.at);
	const kindLabels = locale === 'en' ? kindLabelEn : KIND_LABEL;

	function formAt(asOf: number): GardenForm {
		if (first === null || first > asOf) {
			return {
				day: 0, volume: 0, breadth: 0, leaves: 0, roots: 0, pace: 0.5, leafCount: 0, mended: 0, flowers: 0, kind: 'unknown', kindLabel: kindLabels.unknown, seed,
				numbers: emptyNumbers(rec.topicsTotal)
			};
		}
		const sessions = sessionsAt(rec.lang, asOf);
		const passed = sessions.filter(isPassed);
		const memo = rec.memo.filter((r) => r.at <= asOf);
		const spar = rec.spar.filter((r) => r.status === 'finished' && r.endedAt !== null && r.endedAt <= asOf);
		const stats = rec.stats.filter((r) => r.endedAt <= asOf);
		const statsPassed = stats.filter((r) => r.outcome === 'passed');

		const volume = sat(passed.length * W.lang + memo.length * W.memo + spar.length * W.spar + statsPassed.length * W.stats, SCALE.volume);

		const byTopic = new Map<string, number>();
		for (const s of passed) byTopic.set(s.topic, (byTopic.get(s.topic) ?? 0) + W.lang);
		for (const r of memo) if (r.topic) byTopic.set(r.topic, (byTopic.get(r.topic) ?? 0) + W.memo);
		const byStatsTopic = new Map<StatsTopic, number>();
		for (const r of statsPassed) byStatsTopic.set(r.topic, (byStatsTopic.get(r.topic) ?? 0) + W.stats);
		// Add a track's full catalogue to the denominator when it has a topic in the form.
		const topicsTotal = (byTopic.size > 0 || byStatsTopic.size === 0 ? rec.topicsTotal : 0) + (byStatsTopic.size ? rec.statsTopicsTotal : 0);
		const breadth = normalisedEntropy([...byTopic.values(), ...byStatsTopic.values()], topicsTotal);

		const stable = stableCountAt(timeline, asOf);
		const leaves = sat(stable, SCALE.leaves);

		const passedIds = new Set(passed.map((s) => s.problemId));
		const deep = new Set(passed.filter((s) => s.level === 3 || s.book).map((s) => s.problemId)).size;
		const statsDeep = new Set(statsPassed.filter((s) => s.mode === 'depth').map((s) => s.lessonId)).size;
		const overSec = sessions.filter((s) => passedIds.has(s.problemId) && overLimit(s)).reduce((a, s) => a + (s.elapsedSec! - s.limitSec), 0);
		const overtimeMin = Math.round(overSec / 60);
		const roots = sat((deep + statsDeep) * ROOTS.perProblem + (overSec / 60) * ROOTS.perOvertimeMin, SCALE.roots);

		const ratios = [
			...passed.filter((s) => s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec),
			...statsSpeeds(statsPassed).map((s) => s.ratio)
		];
		const medianRatio = ratios.length >= PACE.min ? median(ratios) : null;

		const mended = mendedProblems(sessions).length;
		const mine = moments.filter((m) => m.at <= asOf);
		const bests = mine.filter((m) => m.kind !== 'first-level3').length;
		const firstLevel3 = mine.length - bests;

		const kind = kindOf(volume, breadth);
		return {
			day: dayNumber(asOf) - dayNumber(first) + 1, volume, breadth, leaves, roots, pace: paceOf(medianRatio), leafCount: stable, mended, flowers: mine.length, kind, kindLabel: kindLabels[kind], seed,
			numbers: {
				langPassed: passed.length, statsRuns: stats.length, statsPassed: statsPassed.length, statsDepthPassed: statsDeep,
				memoReviews: memo.length, sparRuns: spar.length, topics: byTopic.size + byStatsTopic.size, topicsTotal, stableCards: stable, deepPassed: deep, overtimeMin,
				medianRatio, mended, bests, firstLevel3
			}
		};
	}

	/** One form per local day from the first record's day to the day of `now` (the last one is as of `now`). */
	function days(now: number): { date: string; form: GardenForm }[] {
		const to = dayNumber(now);
		if (first === null || first > now) return [{ date: dateString(to), form: formAt(now) }];
		const out: { date: string; form: GardenForm }[] = [];
		for (let d = dayNumber(first); d <= to; d++) out.push({ date: dateString(d), form: formAt(d === to ? now : dayStart(d + 1) - 0.001) });
		return out;
	}
	return { formAt, days, first, moments, stableCountAt: (t: number) => stableCountAt(timeline, t), stableTimeline: timeline };
}

// ---------- rhythm ----------
export type Outcome = { at: number; ok: boolean };

/**
 * First-attempt outcomes: memo reviews, each language problem's first session, and each statistics lesson's first ended session.
 * A statistics success is a solve on the first submission with no hint or reference.
 */
export function firstAttempts(rec: Pick<GardenRecords, 'lang' | 'memo' | 'stats'>): Outcome[] {
	const out: Outcome[] = rec.memo.map((r) => ({ at: r.at, ok: r.rating >= 2 }));
	for (const list of byProblem([...rec.lang].sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)).values()) {
		const s = list[0];
		if (s.endedAt === null) {
			if (list.length > 1) out.push({ at: s.startedAt, ok: false });
			continue;
		}
		out.push({ at: s.startedAt, ok: s.outcome === 'passed' && (s.elapsedSec ?? 0) <= s.limitSec && s.hintsUsed === 0 });
	}
	const seen = new Set<string>();
	for (const s of [...rec.stats].sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)) {
		if (seen.has(s.lessonId)) continue;
		seen.add(s.lessonId);
		out.push({ at: s.startedAt, ok: s.outcome === 'passed' && s.submissions === 1 && s.hints === 0 && !s.usedReference });
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

const hourText = (h: GardenHour, locale: Locale) => copy(locale)(`${h.hour}시 · ${pct(h.rate!)} (${h.n}건)`, `${hour(h.hour)} · ${pct(h.rate!)} (${count(h.n, 'attempt')})`);

/** Best and shakiest hours: only hours with enough samples are named, and only when at least MIN_HOURS of them exist. */
export function bestAndShaky(hours: GardenHour[]): { best: GardenHour; shaky: GardenHour } | 'few' | 'flat' {
	const ok = hours.filter((h) => h.enough);
	if (ok.length < MIN_HOURS) return 'few';
	const best = ok.reduce((a, h) => (h.rate! > a.rate! || (h.rate === a.rate && h.n > a.n) ? h : a));
	const shaky = ok.reduce((a, h) => (h.rate! < a.rate! || (h.rate === a.rate && h.n > a.n) ? h : a));
	return best.rate! - shaky.rate! < 0.05 ? 'flat' : { best, shaky };
}

export type Gap = { returnDay: number; after: SpeedRec[] };

function statsSpeeds(runs: StatsRec[]): SpeedRec[] {
	return runs.filter((r) => r.mode === 'speed' && r.outcome === 'passed' && r.seconds > 0)
		.map((r) => ({ at: r.endedAt, ratio: (r.endedAt - r.startedAt) / r.seconds }));
}

/** Passed language sessions, sprint splits, and solved statistics speed lessons. */
export function speedSamples(rec: Pick<GardenRecords, 'lang' | 'sprintSpeeds' | 'stats'>): SpeedRec[] {
	return [
		...rec.lang.filter((s) => isPassed(s) && s.limitSec > 0).map((s) => ({ at: s.endedAt!, ratio: (s.elapsedSec ?? 0) / s.limitSec })),
		...rec.sprintSpeeds,
		...statsSpeeds(rec.stats)
	].sort((a, b) => a.at - b.at);
}

export function activeDays(rec: Pick<GardenRecords, 'lang' | 'memo' | 'spar' | 'stats'>): number[] {
	const days = new Set<number>();
	for (const s of rec.lang) {
		days.add(dayNumber(s.startedAt));
		if (s.endedAt !== null) days.add(dayNumber(s.endedAt));
	}
	for (const r of rec.memo) days.add(dayNumber(r.at));
	for (const r of rec.spar) days.add(dayNumber(r.startedAt));
	for (const r of rec.stats) {
		days.add(dayNumber(r.startedAt));
		days.add(dayNumber(r.endedAt));
	}
	return [...days].sort((a, b) => a - b);
}

const daysWord = (n: number) => (n === 0 ? '같은 날 돌아옴' : n === 1 ? '하루' : n === 2 ? '이틀' : n === 3 ? '사흘' : `${n}일`);

/** The two gap facts: how much slower on the first day back after >= GAP_DAYS without records, and how many days until normal speed again. */
export function gapFacts(days: number[], speeds: SpeedRec[], locale: Locale = 'ko'): { slow: string | null; back: string | null } {
	const t = copy(locale);
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
		slow = Math.abs(x) < 0.05 ? t('평소와 비슷', 'About the usual pace') :
			x > 0 ? t(`평소보다 ${pct(x)} 느림`, `${pct(x)} slower than usual`) : t(`평소보다 ${pct(-x)} 빠름`, `${pct(-x)} faster than usual`);
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
		if (took.length >= GAP_NEED.gaps && m !== null) {
			const days = Math.round(m);
			back = t(daysWord(days), days === 0 ? 'Same day' : count(days, 'day'));
		}
	}
	return { slow, back };
}

export const RHYTHM_NEED = {
	best: `시간대마다 ${MIN_PER_HOUR}건 이상 쌓인 시간대가 ${MIN_HOURS}개 이상이면 보입니다.`,
	gapSlow: `${GAP_DAYS}일 이상 비운 뒤 돌아온 날이 ${GAP_NEED.gaps}번 이상, 그날 푼 것이 ${GAP_NEED.after}개 이상, 평소 기록이 ${GAP_NEED.normal}개 이상이면 보입니다.`,
	gapReturn: `돌아온 날이 ${GAP_NEED.gaps}번 이상, 평소 기록이 ${GAP_NEED.normal}개 이상이면 보입니다.`
};

export function rhythmOf(rec: GardenRecords, locale: Locale = 'ko'): { hours: GardenHour[]; total: number; minPerHour: number; facts: GardenRhythmFact[] } {
	const t = copy(locale);
	const outcomes = firstAttempts(rec);
	const hours = hourly(outcomes);
	const bs = bestAndShaky(hours);
	const gaps = gapFacts(activeDays(rec), speedSamples(rec), locale);
	const named = typeof bs === 'object';
	const flat = bs === 'flat' ? t('시간대 차이가 크지 않음', 'Similar across hours') : null;
	const hourNeed = t(RHYTHM_NEED.best, `Needs ${MIN_HOURS} hours with at least ${MIN_PER_HOUR} attempts each.`);
	return {
		hours, total: outcomes.length, minPerHour: MIN_PER_HOUR,
		facts: [
			{ key: 'best', label: t('가장 잘 푸는 시간', 'Strongest hour'), value: named ? hourText(bs.best, locale) : flat, need: hourNeed },
			{ key: 'shaky', label: t('가장 흔들리는 시간', 'Weakest hour'), value: named ? hourText(bs.shaky, locale) : flat, need: hourNeed },
			{ key: 'gapSlow', label: t(`${GAP_DAYS}일 이상 비운 뒤 속도`, `Pace after a break of ${GAP_DAYS}+ days`), value: gaps.slow, need: t(RHYTHM_NEED.gapSlow, `Needs ${GAP_NEED.gaps} returns, ${GAP_NEED.after} attempts on return days, and ${GAP_NEED.normal} on other days.`) },
			{ key: 'gapReturn', label: t('돌아오는 데 걸리는 날', 'Time to regain your pace'), value: gaps.back, need: t(RHYTHM_NEED.gapReturn, `Needs ${GAP_NEED.gaps} returns and ${GAP_NEED.normal} attempts on other days.`) }
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
export const weekLabelOf = (start: number, locale: Locale = 'ko'): string => {
	const s = new Date(start * 1000);
	const e = new Date(start * 1000 + 6 * 86_400_000);
	if (locale === 'en') {
		const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
		return `${date.format(s)} – ${date.format(e)}`;
	}
	return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`;
};

const topicsEn: Record<keyof typeof TOPICS, string> = {
	syntax: 'Basic syntax', collections: 'Collections', folds: 'Folds and accumulation', maps: 'Map and Set',
	pattern: 'Pattern matching', errors: 'Option, Either, and Try', strings: 'Strings', recursion: 'Recursion',
	lazy: 'Lazy evaluation', types: 'Types and ADTs', functions: 'Functions', context: 'Given and extension', sugar: 'Desugaring'
};
const topicName = (topic: string, locale: Locale) =>
	Object.hasOwn(TOPICS, topic) ? (locale === 'en' ? topicsEn : TOPICS)[topic as keyof typeof TOPICS] : topic;
const inWeek = (at: number, a: number, b: number) => at >= a && at < b;
const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * Weekly facts with stable ids, used by the backend and shown as evidence.
 */
export function weeklyFacts(rec: GardenRecords, start: number, now: number, garden = createGarden(rec), locale: Locale = 'ko'): WeekFact[] {
	const t = copy(locale);
	const end = Math.min(dayStart(dayNumber(start) + 7), now + 1);
	const prevStart = dayStart(dayNumber(start) - 7);
	const facts: WeekFact[] = [];
	const add = (id: string, text: string) => facts.push({ id, text });

	const sessions = sessionsAt(rec.lang, now);
	const passedWeek = sessions.filter((s) => isPassed(s) && inWeek(s.endedAt!, start, end));
	const memoWeek = rec.memo.filter((r) => inWeek(r.at, start, end));
	const memoPrev = rec.memo.filter((r) => inWeek(r.at, prevStart, start));
	const sparWeek = rec.spar.filter((r) => r.status === 'finished' && r.endedAt !== null && inWeek(r.endedAt, start, end));
	const stats = rec.stats.filter((r) => r.endedAt <= now);
	const statsWeek = stats.filter((r) => inWeek(r.endedAt, start, end));
	const anyWeek = passedWeek.length + memoWeek.length + sparWeek.length + statsWeek.length + sessions.filter((s) => inWeek(s.startedAt, start, end)).length;
	if (anyWeek === 0) return [];

	// days with a record
	const dayset = new Set(activeDays({ ...rec, stats }).filter((d) => inWeek(dayStart(d), start, end)));
	const elapsedDays = Math.min(7, dayNumber(now) - dayNumber(start) + 1);
	add('days', t(`이번 주 ${elapsedDays}일 가운데 기록이 있는 날은 ${dayset.size}일입니다.`, `Practice is recorded on ${dayset.size} of ${count(elapsedDays, 'day')} so far this week.`));

	if (passedWeek.length) {
		const by = new Map<string, number>();
		for (const s of passedWeek) by.set(s.topic, (by.get(s.topic) ?? 0) + 1);
		const name = (topic: string) => topicName(topic, locale);
		const list = top(by, 4).map(([topic, n]) => `${name(topic)} ${n}`).join(', ');
		add('lang', t(`이번 주 통과한 언어 문제는 ${passedWeek.length}개입니다. (${list})`, `This week, ${count(passedWeek.length, 'language problem')} passed (${list}).`));
		const before = new Set(sessions.filter((s) => isPassed(s) && s.endedAt! < start).map((s) => s.topic));
		const fresh = [...new Set(passedWeek.map((s) => s.topic))].filter((t) => !before.has(t));
		const topicCount = new Set(passedWeek.map((s) => s.topic)).size;
		add('topics', fresh.length
			? t(`이번 주 처음 통과한 주제가 ${fresh.length}개 있습니다. (${fresh.map(name).join(', ')})`, `First passes in ${count(fresh.length, 'topic')} this week (${fresh.map(name).join(', ')}).`)
			: t(`이번 주에는 처음 다룬 주제가 없습니다. 이번 주 주제는 ${topicCount}개입니다.`, `Passes spanned ${count(topicCount, 'topic')} this week, all with prior passes.`));
		const deep = passedWeek.filter((s) => s.level === 3 || s.book);
		if (deep.length) {
			const min = Math.round(deep.reduce((a, s) => a + (s.elapsedSec ?? 0), 0) / 60);
			add('deep', t(`복합 문제나 책 문제를 ${deep.length}개 통과했습니다. 걸린 시간은 모두 ${min}분입니다.`, `${count(deep.length, 'advanced or book problem')} passed in ${count(min, 'minute')} total.`));
		}
		const ratios = passedWeek.filter((s) => s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec);
		const all = sessions.filter((s) => isPassed(s) && s.limitSec > 0).map((s) => (s.elapsedSec ?? 0) / s.limitSec);
		if (ratios.length >= PACE.min && all.length >= 2 * PACE.min) {
			const recent = pct(median(ratios)!);
			const overall = pct(median(all)!);
			add('pace', t(`이번 주 통과한 코딩 문제는 제한 시간의 ${recent}(중앙값)를 썼습니다. 지금까지 전체는 ${overall}입니다.`, `This week’s coding passes used a median of ${recent} of the time limit, compared with ${overall} across all coding passes.`));
		}
	}

	const mended = mendedProblems(sessions).filter((m) => inWeek(m.passedAt, start, end)).slice(0, 3);
	const how = { revealed: '모범답안을 보고 끝낸', abandoned: '풀다 만', over: '제한 시간을 넘긴' } as const;
	const howEn = { revealed: 'the solution was opened', abandoned: 'the attempt was left unfinished', over: 'the attempt went over time' } as const;
	mended.forEach((m, i) => add(`mend${i + 1}`, t(
		`${m.title}: ${md(m.struggleAt)}에 ${how[m.how]} 문제를 ${md(m.passedAt)}에 다시 풀어 통과했습니다.`,
		`${m.title} passed on ${md(m.passedAt)} after ${howEn[m.how]} on ${md(m.struggleAt)}.`
	)));

	if (memoWeek.length) {
		const ok = memoWeek.filter((r) => r.rating >= 2).length;
		const recalled = pct(ok / memoWeek.length);
		add('memo', t(
			`이번 주 암기 복습은 ${memoWeek.length}회, 기억한 비율은 ${recalled}입니다.${memoPrev.length ? ` 지난주는 ${memoPrev.length}회였습니다.` : ''}`,
			`${count(memoWeek.length, 'review')} this week with ${recalled} recall.${memoPrev.length ? ` Last week had ${count(memoPrev.length, 'review')}.` : ''}`
		));
	}
	if (rec.memo.length) {
		const a = garden.stableCountAt(start - 1), b = garden.stableCountAt(Math.min(end - 1, now));
		if (b !== a) add('leaf', t(`안정된 카드가 주초 ${a}장에서 지금 ${b}장으로 ${b > a ? '늘었' : '줄었'}습니다.`, `The number of stable cards changed from ${a} at the start of the week to ${b} now.`));
		else if (b > 0) add('leaf', t(`안정된 카드는 이번 주 ${b}장 그대로입니다.`, `The number of stable cards stayed at ${b} this week.`));
		const twice = twiceFailed(rec.memo, rec.cards);
		if (twice > 0) add('shaky', t(`최근 복습에서 두 번 연속 모른 카드가 ${twice}장 있습니다.`, `Both of the last two reviews were missed for ${count(twice, 'card')}.`));
	}

	if (sparWeek.length) {
		const bests = sparBestMoments(rec.spar).filter((m) => inWeek(m.at, start, end));
		add('spar', t(
			`이번 주 끝낸 Sparring은 ${sparWeek.length}회입니다.${bests.length ? ` 그중 최고 기록을 새로 쓴 것이 ${bests.length}번입니다.` : ''}`,
			`${count(sparWeek.length, 'Sparring run')} finished this week.${bests.length ? ` They included ${count(bests.length, 'new best')}.` : ''}`
		));
	}
	if (statsWeek.length) {
		const passed = statsWeek.filter((r) => r.outcome === 'passed').length;
		const revealed = statsWeek.filter((r) => r.outcome === 'revealed').length;
		const timedOut = statsWeek.length - passed - revealed;
		add('stats', t(
			`이번 주 확률·통계 세션은 ${statsWeek.length}회입니다. 정답 ${passed}회, 답안 열람 ${revealed}회, 시간 초과 ${timedOut}회입니다.`,
			`Probability & Statistics had ${count(statsWeek.length, 'session')} this week (${passed} solved, ${count(revealed, 'solution')} viewed, ${timedOut} timed out).`
		));
		const topics = [...new Set(statsWeek.map((r) => r.topic))].map((topic) => t(...statsTopicNames[topic])).join(', ');
		add('stats-topics', t(`이번 주 확률·통계에서 다룬 주제입니다. (${topics})`, `Topics practiced in Probability & Statistics (${topics}).`));
		const practiced = new Map(statsWeek.map((r) => [r.lessonId, t(...r.title)]));
		const titles = [...practiced.values()].slice(0, 3).join(', ');
		add('stats-lessons', t(
			`이번 주 확률·통계 문제 ${practiced.size}개를 연습했습니다. (${titles}${practiced.size > 3 ? ' 외' : ''})`,
			`This week’s ${count(practiced.size, 'statistics lesson')} included ${titles}.`
		));
		const checked = statsWeek.filter((r) => r.submissions > 0);
		if (checked.length) {
			const correct = checked.reduce((total, r) => total + r.correctFields, 0);
			const fields = checked.reduce((total, r) => total + r.totalFields, 0);
			add('stats-checks', t(
				`답안을 제출한 확률·통계 세션 ${checked.length}회의 마지막 제출에서 ${fields}칸 중 ${correct}칸이 맞았습니다.`,
				`Across the last submission in each of ${count(checked.length, 'checked statistics session')}, ${correct} of ${fields} answer fields were correct.`
			));
		}
		const hinted = statsWeek.filter((r) => r.hints > 0).length;
		const referenced = statsWeek.filter((r) => r.usedReference).length;
		if (hinted || referenced) add('stats-help', t(
			`확률·통계 세션 중 ${hinted}회에서 힌트를, ${referenced}회에서 치트시트를 사용했습니다.`,
			`Hints were opened in ${count(hinted, 'statistics session')} and the cheat sheet in ${referenced}.`
		));
	}
	const l3 = firstLevel3Moments(sessions).filter((m) => inWeek(m.at, start, end));
	if (l3.length) {
		const titles = l3.slice(0, 3).map((moment) => sessions.find((s) => s.problemId === moment.problemId)?.title ?? moment.problemId).join(', ');
		add('first3', t(`복합 문제를 처음 통과했습니다. (${titles})`, `First passes on advanced problems (${titles}).`));
	}

	const hoursWeek = new Map<string, number>();
	for (const o of [...memoWeek.map((r) => r.at), ...passedWeek.map((s) => s.endedAt!), ...statsWeek.map((r) => r.endedAt)]) hoursWeek.set(String(hourOf(o)), (hoursWeek.get(String(hourOf(o))) ?? 0) + 1);
	const [h1] = top(hoursWeek, 1);
	if (h1 && h1[1] >= 4) add('hour', t(`이번 주 기록이 가장 몰린 시간은 ${h1[0]}시대입니다. (${h1[1]}건)`, `The busiest hour this week was ${hour(Number(h1[0]))} (${count(h1[1], 'record')}).`));

	const rhythm = bestAndShaky(hourly(firstAttempts({ ...rec, stats })));
	if (typeof rhythm === 'object') {
		const best = hourText(rhythm.best, locale);
		const shaky = hourText(rhythm.shaky, locale);
		add('rhythm', t(`전체 기록에서 첫 시도 성공률이 가장 높은 시간은 ${best}, 가장 낮은 시간은 ${shaky}입니다.`, `Across all records, first-attempt success was highest at ${best} and lowest at ${shaky}.`));
	}
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
const READING_EN_MAX_CHARS = 160;
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

export const READING_SYSTEM_EN = [
	'Write a short, calm reflection on a week of practice. Draw on nature and seasonal imagery in the style of East Asian ink painting.',
	'Use only the facts in the input JSON. Keep all numbers, names, and dates as given.',
	`Write three to five sentences in English, at most ${READING_EN_MAX_CHARS} characters each.`,
	'Each sentence must cite the supporting fact IDs in its facts array.',
	'Describe only recorded behavior and changes. Avoid claims about personality, talent, temperament, fortune, or the future.',
	'Avoid unsupported advice, praise, and concern. Treat slow days and days off neutrally.',
	'Use no tools or files. Return only JSON in this format, with no Markdown:',
	'{"sentences":[{"text":"Sentence","facts":["fact id","fact id"]}]}'
].join('\n');

export function readingPrompt(weekLabel: string, facts: WeekFact[], locale: Locale = 'ko'): string {
	const lead = copy(locale)(`이번 주(${weekLabel})의 기록 사실입니다. 이 사실로만 한 주를 읽어 주세요.`, `Reflect on the week of ${weekLabel} using these recorded facts.`);
	return `${lead}\n\n${JSON.stringify({ week: weekLabel, facts }, null, 1)}`;
}

/** Phrases that read as a statement about the person or a fortune; such a sentence is dropped. */
const PERSON = /(당신|너|그대)(은|는|의 (성격|기질|천성|운))|운세|팔자|타고난|천성|성격|기질|앞날|미래에는/;
const PERSON_EN = /\b(?:personality|temperament|innate talent|destin(?:y|ed)|your future|you (?:are|were) a .*person)\b/i;

export type ParsedReading = { sentences: { text: string; factIds: string[] }[]; dropped: number };

/** Checks cited facts, sentence length, and person judgments. */
export function parseReading(text: string, facts: WeekFact[], locale: Locale = 'ko'): ParsedReading | null {
	const known = new Set(facts.map((f) => f.id));
	const limit = locale === 'en' ? READING_EN_MAX_CHARS : READING_MAX_CHARS;
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
		if (!t || ids.length === 0 || Array.from(t).length > limit || PERSON.test(t) || (locale === 'en' && PERSON_EN.test(t)) || out.length >= READING_MAX_SENTENCES) {
			dropped++;
			continue;
		}
		out.push({ text: t, factIds: [...new Set(ids)] });
	}
	return { sentences: out, dropped };
}
