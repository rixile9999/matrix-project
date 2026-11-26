// Debrief, pure part: turns the raw log (sessions, runs, lookups, marks, questions) into
//  - mistake patterns (runs classified by a verified catalog, debrief/<lang>/patterns.json),
//  - the strip of one session and two or three observations about it,
//  - the traces of attention over a day and a week (facts, never a score),
//  - the facts an Operator reading may cite, and the parser that checks the reading.
// No I/O. All times are unix seconds; "local" is the process time zone.
import type { Locale } from '../locale.ts';

const copy = (locale: Locale) => (ko: string, en: string) => locale === 'en' ? en : ko;
const count = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- inputs ----------
export type RunStatus = 'passed' | 'failed' | 'compile_error' | 'timeout';
export type DSession = {
	id: number; problemId: string; title: string; limitSec: number;
	startedAt: number; endedAt: number | null; outcome: 'passed' | 'revealed' | null; hintsUsed: number;
};
export type DRun = { id: number; sessionId: number; at: number; status: RunStatus; code: string; output: string; failing: string[] /* names of failed cases */ };
export type DLookup = { sessionId: number; at: number };
export type MarkKind = 'hint' | 'away' | 'back' | 'idle' | 'active';
export type DMark = { sessionId: number; at: number; kind: MarkKind };
export type DQuestion = { sessionId: number; at: number; text: string };
export type SelfState = 'clear' | 'fair' | 'foggy';
export type DSelf = { sessionId: number; at: number; state: SelfState | 'none' };

export const SELF_LABEL: Record<SelfState, string> = { clear: '또렷', fair: '보통', foggy: '흐림' };
export const SELF_LABEL_EN: Record<SelfState, string> = { clear: 'Clear', fair: 'Fair', foggy: 'Foggy' };

/** Everything the analysis reads. */
export type DebriefLog = { sessions: DSession[]; runs: DRun[]; lookups: DLookup[]; marks: DMark[]; questions: DQuestion[]; selves: DSelf[] };

// ---------- the catalog ----------
/** debrief/<lang>/patterns.json holds DebriefPattern[]. Regexes are JavaScript sources, matched case-sensitively. */
export type DebriefPattern = {
	id: string; // kebab-case
	title: string; // the rule as a title, e.g. "`_`는 쓸 때마다 새 인자다"
	short: string; // for lists
	on: 'compile' | 'failed';
	// compile: every given regex must match one compiler error (message = the error text, source = the code line it points at, caret = the code under ^^^)
	// failed: `cases` must match a failing case name; `code`, if given, must match the submitted code
	message?: string;
	source?: string;
	caret?: string;
	cases?: string;
	code?: string;
	rule: string[]; // 2–3 short lines, inline `code` allowed
	verify: string; // cheat-sheet-format snippet; every `expr // => value` line is an example shown under the rule and is checked by running it
	check: string; // id of the trace check (memo/<lang>/checks, field `debrief` = this id) that ends the note
	practice: string[]; // problem ids where the rule is exercised
	samples: PatternSample[]; // real failures this pattern must recognise (checked by scripts/verify-debrief.ts)
};
export type PatternSample = { message?: string; source?: string; caret?: string; cases?: string[]; code?: string };

// ---------- compiler output ----------
export type CompileError = { line: number; col: number; message: string; head: string; source: string; caret: string; from: number; to: number /* caret span in source */ };

const CARET_LINE = /^\s*\^+\s*$/;

/** Splits the judge's compile output ("User.scala:L:C\nmessage…\n<source line>\n<carets>" repeated) into errors. */
export function parseCompile(output: string): CompileError[] {
	const lines = output.split('\n');
	const out: CompileError[] = [];
	let cur: { line: number; col: number; body: string[] } | null = null;
	const flush = () => {
		if (!cur) return;
		const body = [...cur.body];
		while (body.length && body[body.length - 1].trim() === '') body.pop();
		let source = '';
		let caret = '';
		let from = 0;
		let to = 0;
		if (body.length >= 2 && CARET_LINE.test(body[body.length - 1])) {
			const marks = body.pop()!;
			source = body.pop()!.replace(/\s+$/, '');
			from = Math.min(marks.indexOf('^'), source.length);
			to = Math.min(marks.lastIndexOf('^') + 1, source.length);
			caret = source.slice(from, to);
		}
		const message = body.join('\n').trim();
		out.push({ line: cur.line, col: cur.col, message, head: message.split('\n')[0] ?? '', source, caret, from, to });
		cur = null;
	};
	for (const l of lines) {
		const m = l.match(/^\w+\.scala:(\d+):(\d+)$/);
		if (m) {
			flush();
			cur = { line: Number(m[1]), col: Number(m[2]), body: [] };
		} else if (cur) cur.body.push(l);
	}
	flush();
	return out;
}

// ---------- classification ----------
export type Evidence =
	| { kind: 'compile'; source: string; caretFrom: number; caretTo: number; head: string }
	| { kind: 'failed'; code: string; cases: string[] };
export type Hit = { pattern: string; runId: number; sessionId: number; at: number; evidence: Evidence };

const rx = (s: string | undefined) => (s === undefined ? null : new RegExp(s));

/** Does `p` recognise this compile error? */
export function matchCompile(p: DebriefPattern, e: Pick<CompileError, 'message' | 'source' | 'caret'>): boolean {
	if (p.on !== 'compile') return false;
	const tests: [RegExp | null, string][] = [[rx(p.message), e.message], [rx(p.source), e.source], [rx(p.caret), e.caret]];
	return tests.some(([r]) => r) && tests.every(([r, s]) => !r || r.test(s));
}
/** Does `p` recognise this failed run? */
export function matchFailed(p: DebriefPattern, failing: string[], code: string): boolean {
	if (p.on !== 'failed' || !p.cases) return false;
	const c = new RegExp(p.cases);
	return failing.some((n) => c.test(n)) && (!p.code || new RegExp(p.code).test(code));
}

/** The first five lines of code around the mistake, for a failed run (the code as written). */
const excerpt = (code: string, max = 6) => {
	const l = code.replace(/\s+$/, '').split('\n');
	return l.length <= max ? l.join('\n') : l.slice(0, max).join('\n') + '\n…';
};

/** Every pattern a run shows, at most once per pattern (the catalog order decides which pattern an error belongs to). */
export function classifyRun(run: DRun, catalog: DebriefPattern[]): Hit[] {
	const hits = new Map<string, Hit>();
	if (run.status === 'compile_error') {
		for (const e of parseCompile(run.output)) {
			const p = catalog.find((q) => matchCompile(q, e));
			if (!p || hits.has(p.id)) continue;
			const lead = e.source.length - e.source.trimStart().length;
			hits.set(p.id, {
				pattern: p.id, runId: run.id, sessionId: run.sessionId, at: run.at,
				evidence: { kind: 'compile', source: e.source.trim(), caretFrom: Math.max(0, e.from - lead), caretTo: Math.max(0, e.to - lead), head: e.head }
			});
		}
	} else if (run.status === 'failed' && run.failing.length) {
		for (const p of catalog) {
			if (hits.has(p.id) || !matchFailed(p, run.failing, run.code)) continue;
			const c = new RegExp(p.cases!);
			hits.set(p.id, { pattern: p.id, runId: run.id, sessionId: run.sessionId, at: run.at, evidence: { kind: 'failed', code: excerpt(run.code), cases: run.failing.filter((n) => c.test(n)) } });
		}
	}
	return [...hits.values()];
}

// ---------- pattern notes ----------
/** A pattern becomes a note when it showed up in two sessions, or three times in one. */
export const NOTE_MIN_SESSIONS = 2;
export const NOTE_MIN_RUNS = 3;
export const EVIDENCE_MAX = 6;

export type PatternStat = {
	id: string;
	runs: number;
	sessions: number;
	problems: string[]; // problem ids, most recent first
	lastAt: number;
	note: boolean; // reached the threshold
	evidence: (Hit & { problemId: string; title: string })[]; // most recent first, one per distinct line of code, at most EVIDENCE_MAX
	questions: (DQuestion & { problemId: string })[]; // Operator questions asked in the sessions where the pattern showed up
};

export function patternStats(log: DebriefLog, catalog: DebriefPattern[]): { stats: PatternStat[]; hitsByRun: Map<number, Hit[]> } {
	const sessionOf = new Map(log.sessions.map((s) => [s.id, s]));
	const hitsByRun = new Map<number, Hit[]>();
	const by = new Map<string, Hit[]>();
	for (const r of log.runs) {
		if (!sessionOf.has(r.sessionId)) continue;
		const hs = classifyRun(r, catalog);
		if (hs.length) hitsByRun.set(r.id, hs);
		for (const h of hs) by.set(h.pattern, [...(by.get(h.pattern) ?? []), h]);
	}
	const stats: PatternStat[] = [];
	for (const p of catalog) {
		const hs = (by.get(p.id) ?? []).sort((a, b) => b.at - a.at || b.runId - a.runId);
		if (!hs.length) continue;
		const sessions = new Set(hs.map((h) => h.sessionId));
		const problems = [...new Set(hs.map((h) => sessionOf.get(h.sessionId)!.problemId))];
		const seen = new Set<string>();
		const evidence: PatternStat['evidence'] = [];
		for (const h of hs) {
			const key = h.evidence.kind === 'compile' ? h.evidence.source : h.evidence.code;
			if (seen.has(key)) continue;
			seen.add(key);
			const s = sessionOf.get(h.sessionId)!;
			evidence.push({ ...h, problemId: s.problemId, title: s.title });
			if (evidence.length >= EVIDENCE_MAX) break;
		}
		stats.push({
			id: p.id, runs: hs.length, sessions: sessions.size, problems, lastAt: hs[0].at,
			note: sessions.size >= NOTE_MIN_SESSIONS || hs.length >= NOTE_MIN_RUNS,
			evidence,
			questions: log.questions.filter((q) => sessions.has(q.sessionId)).map((q) => ({ ...q, problemId: sessionOf.get(q.sessionId)!.problemId }))
		});
	}
	stats.sort((a, b) => Number(b.note) - Number(a.note) || b.runs - a.runs || b.lastAt - a.lastAt);
	return { stats, hitsByRun };
}

/** Compile errors no pattern knows, grouped by their first line (names and types blurred), when they came back in two sessions. */
export type Unknown = { head: string; runs: number; sessions: number; example: { source: string; problemId: string; at: number } };
export function unknownRepeats(log: DebriefLog, catalog: DebriefPattern[]): Unknown[] {
	const sessionOf = new Map(log.sessions.map((s) => [s.id, s]));
	const by = new Map<string, { runs: Set<number>; sessions: Set<number>; ex: Unknown['example']; head: string }>();
	for (const r of log.runs) {
		if (r.status !== 'compile_error' || !sessionOf.has(r.sessionId)) continue;
		for (const e of parseCompile(r.output)) {
			if (catalog.some((p) => matchCompile(p, e))) continue;
			const key = e.head.replace(/`[^`]*`|\b[A-Z]\w*(\[[^\]]*\])?|\b\w+\$\d+\b/g, '·').replace(/\b(value|method|parameter|of|in) \w+/g, '$1 ·').trim();
			const g = by.get(key) ?? { runs: new Set(), sessions: new Set(), ex: { source: e.source.trim(), problemId: sessionOf.get(r.sessionId)!.problemId, at: r.at }, head: e.head };
			g.runs.add(r.id);
			g.sessions.add(r.sessionId);
			if (r.at >= g.ex.at) { g.ex = { source: e.source.trim(), problemId: sessionOf.get(r.sessionId)!.problemId, at: r.at }; g.head = e.head; }
			by.set(key, g);
		}
	}
	return [...by.values()].filter((g) => g.sessions.size >= 2).map((g) => ({ head: g.head, runs: g.runs.size, sessions: g.sessions.size, example: g.ex })).sort((a, b) => b.runs - a.runs);
}

// ---------- one session ----------
export const QUICK_RETRY_SEC = 10;
export const SILENT_SEC = 90; // a gap worth mentioning in one session
export const IDLE_AFTER_SEC = 60; // the page reports 'idle' after this long without input

export type Interval = { from: number; to: number }; // seconds since the session start
export type StripMark = { t: number; kind: 'run'; status: RunStatus; head: string; runId: number } | { t: number; kind: 'lookup' } | { t: number; kind: 'hint' };
export type Strip = {
	sessionId: number;
	length: number; // seconds shown: max(limit, elapsed)
	limitSec: number;
	elapsed: number; // seconds until the end (or the last event of an open session)
	marks: StripMark[];
	away: Interval[];
	idle: Interval[];
	silent: Interval | null; // the longest stretch without a run or lookup, if >= SILENT_SEC
	recorded: boolean; // the page recorded away/idle marks for this session (older sessions have none)
};

/** Intervals opened by `open` and closed by `close` (or by the end), clipped to [0, end]. */
function intervals(marks: DMark[], start: number, end: number, open: MarkKind, close: MarkKind[]): Interval[] {
	const out: Interval[] = [];
	let at: number | null = null;
	for (const m of marks) {
		if (m.kind === open && at === null) at = m.at;
		else if (close.includes(m.kind) && at !== null) {
			out.push({ from: Math.max(0, at - start), to: Math.max(0, Math.min(m.at, end) - start) });
			at = null;
		}
	}
	if (at !== null) out.push({ from: Math.max(0, at - start), to: Math.max(0, end - start) });
	return out.filter((i) => i.to > i.from);
}

export const overlap = (a: Interval, list: Interval[]) => list.reduce((n, b) => n + Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from)), 0);

export function sessionStrip(s: DSession, log: Pick<DebriefLog, 'runs' | 'lookups' | 'marks'>, locale: Locale = 'ko'): Strip {
	const c = copy(locale);
	const runs = log.runs.filter((r) => r.sessionId === s.id).sort((a, b) => a.at - b.at || a.id - b.id);
	const lookups = log.lookups.filter((l) => l.sessionId === s.id);
	const marks = log.marks.filter((m) => m.sessionId === s.id).sort((a, b) => a.at - b.at);
	const lastEvent = Math.max(s.startedAt, ...runs.map((r) => r.at), ...lookups.map((l) => l.at), ...marks.map((m) => m.at));
	const end = s.endedAt ?? lastEvent;
	const elapsed = Math.max(0, end - s.startedAt);
	const t = (at: number) => Math.max(0, Math.min(at, end) - s.startedAt);
	const head = (r: DRun) => {
		switch (r.status) {
			case 'compile_error': return parseCompile(r.output)[0]?.head ?? c('컴파일 오류', 'Compile error');
			case 'passed': return c('통과', 'Passed');
			case 'timeout': return c('시간 초과', 'Timed out');
			case 'failed': {
				const failed = c('실패', 'Failed');
				const examples = r.failing.slice(0, 2).join(', ');
				const suffix = r.failing.length > 2 ? c(' 외', ' and more') : '';
				return examples ? `${failed}: ${examples}${suffix}` : failed;
			}
		}
	};
	const stripMarks: StripMark[] = [
		...runs.map((r): StripMark => ({ t: t(r.at), kind: 'run', status: r.status, head: head(r), runId: r.id })),
		...lookups.map((l): StripMark => ({ t: t(l.at), kind: 'lookup' })),
		...marks.filter((m) => m.kind === 'hint').map((m): StripMark => ({ t: t(m.at), kind: 'hint' }))
	].sort((a, b) => a.t - b.t);
	// the longest stretch with no run and no lookup
	const points = [0, ...runs.map((r) => t(r.at)), ...lookups.map((l) => t(l.at)), elapsed].sort((a, b) => a - b);
	let silent: Interval | null = null;
	for (let i = 1; i < points.length; i++) if (points[i] - points[i - 1] >= SILENT_SEC && (!silent || points[i] - points[i - 1] > silent.to - silent.from)) silent = { from: points[i - 1], to: points[i] };
	return {
		sessionId: s.id, length: Math.max(s.limitSec, elapsed), limitSec: s.limitSec, elapsed, marks: stripMarks,
		away: intervals(marks, s.startedAt, end, 'away', ['back']),
		idle: intervals(marks, s.startedAt, end, 'idle', ['active', 'away']),
		silent,
		recorded: marks.some((m) => m.kind !== 'hint')
	};
}

/** Pairs of (failed run, next run in the same session): the gap in seconds and whether the error stayed the same. */
export function retries(runs: DRun[]): { gap: number; same: boolean; sessionId: number; at: number }[] {
	const by = new Map<number, DRun[]>();
	for (const r of runs) by.set(r.sessionId, [...(by.get(r.sessionId) ?? []), r]);
	const out: { gap: number; same: boolean; sessionId: number; at: number }[] = [];
	const sig = (r: DRun) => (r.status === 'compile_error' ? (parseCompile(r.output)[0]?.head ?? r.output) : r.failing.join('|'));
	for (const list of by.values()) {
		list.sort((a, b) => a.at - b.at || a.id - b.id);
		for (let i = 1; i < list.length; i++) {
			const a = list[i - 1];
			if (a.status !== 'compile_error' && a.status !== 'failed') continue;
			out.push({ gap: list[i].at - a.at, same: list[i].status === a.status && sig(list[i]) === sig(a), sessionId: a.sessionId, at: list[i].at });
		}
	}
	return out;
}

export type Observation = { key: string; label: string; text: string; pattern?: string /* link to a note */ };
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
const minSec = (sec: number, locale: Locale) => {
	const minutes = Math.floor(sec / 60);
	const seconds = Math.round(sec % 60);
	if (locale === 'en') return minutes ? `${minutes}m${seconds ? ` ${seconds}s` : ''}` : `${seconds}s`;
	return minutes ? `${minutes}분${seconds ? ` ${seconds}초` : ''}` : `${seconds}초`;
};

/** Two to four terse observations about one finished session. Facts only, no prose; nothing about the person. */
export function observe(s: DSession, strip: Strip, runs: DRun[], lookups: DLookup[], hits: Hit[], stats: PatternStat[], catalog: DebriefPattern[], locale: Locale = 'ko'): Observation[] {
	const t = copy(locale);
	const time = (sec: number) => minSec(sec, locale);
	const out: Observation[] = [];
	const mine = runs.filter((r) => r.sessionId === s.id);
	const n = (st: RunStatus) => mine.filter((r) => r.status === st).length;
	if (mine.length) {
		const quick = retries(mine).filter((r) => r.gap <= QUICK_RETRY_SEC).length;
		const parts = [
			t(`${mine.length}번`, count(mine.length, 'run')),
			n('compile_error') && t(`오류 ${n('compile_error')}`, count(n('compile_error'), 'compile error')),
			n('failed') && t(`실패 ${n('failed')}`, count(n('failed'), 'failure')),
			n('passed') && t(`통과 ${n('passed')}`, count(n('passed'), 'pass', 'passes')),
			quick && t(`${QUICK_RETRY_SEC}초 내 재실행 ${quick}`, `${count(quick, 'retry', 'retries')} within ${QUICK_RETRY_SEC}s`)
		];
		out.push({ key: 'runs', label: t('실행', 'Runs'), text: parts.filter(Boolean).join(' · ') });
	} else out.push({ key: 'runs', label: t('실행', 'Runs'), text: t('없음', 'None') });

	const byId = new Map(stats.map((p) => [p.id, p]));
	for (const id of [...new Set(hits.filter((h) => h.sessionId === s.id).map((h) => h.pattern))]) {
		const p = catalog.find((c) => c.id === id)!;
		const st = byId.get(id);
		out.push(st?.note
			? { key: 'pattern:' + id, label: t('패턴', 'Pattern'), text: `${p.short} · ${t(`${st.runs}번째`, count(st.runs, 'occurrence'))}`, pattern: id }
			: { key: 'pattern:' + id, label: t('처음', 'First occurrence'), text: p.short });
	}

	if (strip.silent) {
		const sl = strip.silent;
		const away = overlap(sl, strip.away);
		const idle = overlap(sl, strip.idle);
		const duration = time(sl.to - sl.from);
		const parts = [t(`${mmss(sl.from)}부터 ${duration}`, `${duration} from ${mmss(sl.from)}`), away && t(`이탈 ${time(away)}`, `${time(away)} away`), idle && t(`정지 ${time(idle)}`, `${time(idle)} idle`)];
		out.push({ key: 'silent', label: t('정적', 'Quiet interval'), text: parts.filter(Boolean).join(' · ') });
	}
	if (s.outcome === 'revealed' && !lookups.some((l) => l.sessionId === s.id)) {
		const hints = s.hintsUsed >= 2 ? t(' · 힌트 2', ' · 2 hints') : '';
		out.push({ key: 'reveal', label: t('공개', 'Solution opened'), text: t('치트시트 없이', 'Without a cheatsheet lookup') + hints });
	}
	return out;
}

// ---------- the day and the week ----------
export const SITTING_GAP_SEC = 20 * 60; // sessions closer than this belong to one sitting
export const LONG_SILENT_SEC = 10 * 60;
export const FATIGUE_AFTER_SEC = 60 * 60;
export const FACT_MIN = 4; // a rate needs at least this many cases

export const localDate = (sec: number) => {
	const d = new Date(sec * 1000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayStartOf = (date: string) => {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(y, m - 1, d).getTime() / 1000;
};
export const clock = (sec: number) => {
	const d = new Date(sec * 1000);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export type DaySession = { id: number; problemId: string; title: string; from: number; to: number; outcome: 'passed' | 'revealed' | 'open'; runs: number; silentLong: boolean };
export type Day = { date: string; start: number; sessions: DaySession[]; rests: { from: number; to: number }[] /* gaps >= SITTING_GAP_SEC between sessions */ };

const endOf = (s: DSession, runs: DRun[], lookups: DLookup[]) =>
	s.endedAt ?? Math.max(s.startedAt + 60, ...runs.filter((r) => r.sessionId === s.id).map((r) => r.at), ...lookups.filter((l) => l.sessionId === s.id).map((l) => l.at));

/** Sessions that started on `date` (local), on a time axis. */
export function dayView(log: DebriefLog, date: string): Day {
	const start = dayStartOf(date);
	const sessions = log.sessions
		.filter((s) => localDate(s.startedAt) === date)
		.sort((a, b) => a.startedAt - b.startedAt)
		.map((s): DaySession => {
			const strip = sessionStrip(s, log);
			return {
				id: s.id, problemId: s.problemId, title: s.title, from: s.startedAt, to: endOf(s, log.runs, log.lookups),
				outcome: s.outcome ?? 'open', runs: log.runs.filter((r) => r.sessionId === s.id).length,
				silentLong: !!strip.silent && strip.silent.to - strip.silent.from >= LONG_SILENT_SEC
			};
		});
	const rests: Day['rests'] = [];
	for (let i = 1; i < sessions.length; i++) {
		const gap = sessions[i].from - Math.max(...sessions.slice(0, i).map((x) => x.to));
		if (gap >= SITTING_GAP_SEC) rests.push({ from: sessions[i].from - gap, to: sessions[i].from });
	}
	return { date, start, sessions, rests };
}

/** Local dates that have sessions, newest first. */
export const activeDays = (log: DebriefLog, max = 21) => [...new Set(log.sessions.map((s) => localDate(s.startedAt)))].sort().reverse().slice(0, max);

export type FocusFact = {
	id: string;
	label: string;
	value: string | null; // null: not enough records yet
	detail: string;
	need?: string; // when value is null
	before?: string | null; // the same measure over the previous window, when that window has enough records
};

type Window = { from: number; to: number };
const inside = (w: Window, at: number) => at >= w.from && at < w.to;
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/** The measures behind the facts, over one window. Rates are null below FACT_MIN cases. */
export function measures(log: DebriefLog, w: Window) {
	const sessions = log.sessions.filter((s) => inside(w, s.startedAt)).sort((a, b) => a.startedAt - b.startedAt);
	const ids = new Set(sessions.map((s) => s.id));
	const runs = log.runs.filter((r) => ids.has(r.sessionId));
	const lookups = log.lookups.filter((l) => ids.has(l.sessionId));
	const rt = retries(runs);
	const quick = rt.filter((r) => r.gap <= QUICK_RETRY_SEC);
	const revealed = sessions.filter((s) => s.outcome === 'revealed');
	const revealNoLookup = revealed.filter((s) => !lookups.some((l) => l.sessionId === s.id));
	const strips = sessions.map((s) => ({ s, strip: sessionStrip(s, log) }));
	const silentLong = strips.filter(({ strip }) => strip.silent && strip.silent.to - strip.silent.from >= LONG_SILENT_SEC);
	const recorded = strips.filter(({ strip }) => strip.recorded);
	const sum = (l: Interval[]) => l.reduce((n, i) => n + i.to - i.from, 0);
	const awaySec = recorded.reduce((n, { strip }) => n + sum(strip.away), 0);
	const idleSec = recorded.reduce((n, { strip }) => n + sum(strip.idle), 0);
	const activeSec = recorded.reduce((n, { strip }) => n + strip.elapsed, 0);
	// sittings
	const sittings: DSession[][] = [];
	let lastEnd = -Infinity;
	for (const s of sessions) {
		if (s.startedAt - lastEnd >= SITTING_GAP_SEC || !sittings.length) sittings.push([]);
		sittings[sittings.length - 1].push(s);
		lastEnd = Math.max(lastEnd, endOf(s, log.runs, log.lookups));
	}
	const sittingLen = sittings.map((g) => Math.max(...g.map((s) => endOf(s, log.runs, log.lookups))) - g[0].startedAt);
	const early: DSession[] = [];
	const late: DSession[] = [];
	for (const g of sittings) for (const s of g) if (s.outcome) (s.startedAt - g[0].startedAt < FATIGUE_AFTER_SEC ? early : late).push(s);
	const passRate = (l: DSession[]) => (l.length >= FACT_MIN ? l.filter((s) => s.outcome === 'passed').length / l.length : null);
	const selves = new Map<number, SelfState | 'none'>();
	for (const x of [...log.selves].sort((a, b) => a.at - b.at)) if (ids.has(x.sessionId)) selves.set(x.sessionId, x.state);
	return {
		sessions: sessions.length, finished: sessions.filter((s) => s.outcome).length,
		retries: rt.length, quick: quick.length, quickSame: quick.filter((q) => q.same).length,
		quickRate: rt.length >= FACT_MIN ? quick.length / rt.length : null,
		revealed: revealed.length, revealNoLookup: revealNoLookup.length, revealHints2: revealed.filter((s) => s.hintsUsed >= 2).length,
		revealNoLookupRate: revealed.length >= FACT_MIN ? revealNoLookup.length / revealed.length : null,
		silentLong: silentLong.map(({ s, strip }) => ({ id: s.id, problemId: s.problemId, at: s.startedAt, sec: strip.silent!.to - strip.silent!.from, runs: runs.filter((r) => r.sessionId === s.id).length })),
		recordedSessions: recorded.length, awaySec, idleSec, activeSec,
		sittings: sittings.length, longestSittingSec: sittingLen.length ? Math.max(...sittingLen) : 0,
		earlyRate: passRate(early), lateRate: passRate(late), early: early.length, late: late.length,
		selves: [...selves.values()].filter((v): v is SelfState => v !== 'none'),
		selfPass: (st: SelfState) => {
			const l = sessions.filter((s) => selves.get(s.id) === st && s.outcome);
			return l.length >= 3 ? l.filter((s) => s.outcome === 'passed').length / l.length : null;
		}
	};
}

export const WEEK_SEC = 7 * 86_400;
export const PREV_MIN_SESSIONS = 5;

/** The traces of attention over the last seven days, each next to the seven days before when those had enough sessions. */
export function focusFacts(log: DebriefLog, now: number, locale: Locale = 'ko'): FocusFact[] {
	const t = copy(locale);
	const time = (sec: number) => minSec(sec, locale);
	const cur = measures(log, { from: now - WEEK_SEC, to: now + 1 });
	const prevM = measures(log, { from: now - 2 * WEEK_SEC, to: now - WEEK_SEC });
	const prev = prevM.sessions >= PREV_MIN_SESSIONS ? prevM : null;
	const facts: FocusFact[] = [];
	const rate = (r: number | null, a: number, b: number) => (r === null ? null : `${a} / ${b}`);
	facts.push({
		id: 'sessions', label: t('세션', 'Sessions'), value: cur.sessions ? `${cur.sessions}` : null,
		detail: cur.sessions ? t(
			`${cur.sittings}번 앉아서 했고, 가장 길게 이어 한 시간은 ${time(cur.longestSittingSec)}입니다. 20분 넘게 비면 새로 앉은 것으로 셉니다.`,
			`${count(cur.sittings, 'sitting')}. The longest lasted ${time(cur.longestSittingSec)}. A break of 20 minutes starts a new sitting.`
		) : t('최근 7일 기록이 없습니다.', 'No sessions in the last seven days.'),
		need: t('세션 1개', '1 session'), before: prev ? `${prev.sessions}` : null
	});
	facts.push({
		id: 'quick', label: retryLabel(locale), value: rate(cur.quickRate, cur.quick, cur.retries),
		detail: cur.quickRate === null ? '' : t(
			`실패한 실행 다음 실행 ${cur.retries}번 중 ${cur.quick}번${cur.quickSame ? `, 그중 ${cur.quickSame}번은 같은 오류가 다시 났습니다` : ''}.`,
			`${cur.quick} of ${count(cur.retries, 'retry', 'retries')} after failure came within ${QUICK_RETRY_SEC}s.${cur.quickSame ? ` The same error returned on ${count(cur.quickSame, 'retry', 'retries')}.` : ''}`
		),
		need: t(`실패 뒤 다시 실행 ${FACT_MIN}번`, `${FACT_MIN} retries after failure`), before: prev && prev.quickRate !== null ? `${prev.quick} / ${prev.retries}` : null
	});
	facts.push({
		id: 'reveal', label: revealLabel(locale), value: rate(cur.revealNoLookupRate, cur.revealNoLookup, cur.revealed),
		detail: cur.revealNoLookupRate === null ? '' : t(
			`답을 연 ${cur.revealed}번 중 ${cur.revealNoLookup}번은 치트시트를 열지 않았습니다. 힌트 두 개를 다 쓰고 연 것은 ${cur.revealHints2}번.`,
			`${cur.revealNoLookup} of ${cur.revealed} solutions were opened without a lookup. Both hints were used before opening ${count(cur.revealHints2, 'solution')}.`
		),
		need: t(`답 공개 ${FACT_MIN}번`, `${FACT_MIN} solutions opened`), before: prev && prev.revealNoLookupRate !== null ? `${prev.revealNoLookup} / ${prev.revealed}` : null
	});
	facts.push({
		id: 'silent', label: t(`${LONG_SILENT_SEC / 60}분 넘게 실행 없음`, `At least ${LONG_SILENT_SEC / 60}m without a run or lookup`), value: `${cur.silentLong.length}`,
		detail: cur.silentLong.length ? cur.silentLong.slice(0, 3).map((x) => `${localDate(x.at).slice(5).replace('-', '/')} ${clock(x.at)} ${x.problemId}: ${time(x.sec)}`).join(' · ') : t('긴 빈 시간이 없었습니다.', 'No long gaps.'),
		before: prev ? `${prev.silentLong.length}` : null
	});
	facts.push({
		id: 'away', label: t('다른 탭 / 입력 없음', 'Away / Idle'), value: cur.recordedSessions ? `${time(cur.awaySec)} / ${time(cur.idleSec)}` : null,
		detail: cur.recordedSessions ? t(`기록한 세션 ${cur.recordedSessions}개, 문제 화면에 있던 시간 ${time(cur.activeSec)} 중.`, `${count(cur.recordedSessions, 'tracked session')} spanning ${time(cur.activeSec)}.`) : '',
		need: t('새 기록이 쌓이면 보입니다 (이 기능 이후의 세션부터)', 'Needs sessions with tab and input activity recorded'), before: prev && prev.recordedSessions ? `${time(prev.awaySec)} / ${time(prev.idleSec)}` : null
	});
	facts.push({
		id: 'fatigue', label: t('앉은 지 1시간 전후 통과율', 'Pass rate in the first hour and later'), value: cur.earlyRate !== null && cur.lateRate !== null ? `${pct(cur.earlyRate, 1)} → ${pct(cur.lateRate, 1)}` : null,
		detail: cur.earlyRate !== null && cur.lateRate !== null ? t(`1시간 안에 시작한 세션 ${cur.early}개, 그 뒤 ${cur.late}개.`, `${count(cur.early, 'session')} started in the first hour, and ${cur.late} started later.`) : '',
		need: t(`양쪽에 끝난 세션 ${FACT_MIN}개씩`, `${FACT_MIN} finished sessions in each group`), before: prev && prev.earlyRate !== null && prev.lateRate !== null ? `${pct(prev.earlyRate, 1)} → ${pct(prev.lateRate, 1)}` : null
	});
	const self = (['clear', 'fair', 'foggy'] as SelfState[]).map((st) => ({ st, n: cur.selves.filter((x) => x === st).length, r: cur.selfPass(st) }));
	const selfLabel = locale === 'en' ? SELF_LABEL_EN : SELF_LABEL;
	facts.push({
		id: 'self', label: t('자기 보고', 'Self-reports'), value: cur.selves.length ? self.filter((x) => x.n).map((x) => `${selfLabel[x.st]} ${x.n}`).join(' · ') : null,
		detail: self.some((x) => x.r !== null)
			? self.filter((x) => x.r !== null).map((x) => t(`${selfLabel[x.st]}일 때 통과 ${pct(x.r!, 1)}`, `${selfLabel[x.st]}: ${pct(x.r!, 1)} passed`)).join(', ') + '.'
			: cur.selves.length ? t('상태별 통과율은 상태마다 3번 이상 모이면 보입니다.', 'Pass rates need at least three reports per state.') : '',
		need: t('세션을 마친 뒤 한 번 눌러 남깁니다 (선택)', 'Optional after a finished session')
	});
	return facts;
}

// ---------- experiments ----------
export const EXPERIMENTS = {
	'read-error': { title: '오류 첫 줄 읽고 실행', detail: '실패하면 메시지 첫 줄을 읽고 나서 다시 실행합니다.', measure: 'quick' as const },
	'cheat-first': { title: '답 열기 전 치트시트 한 번', detail: '막지 않고 기록만 합니다. 답을 열기 전에 관련 문법을 한 번 찾아봅니다.', measure: 'reveal' as const }
};
const experimentsEn: Record<keyof typeof EXPERIMENTS, { title: string; detail: string }> = {
	'read-error': { title: 'Read before retrying', detail: 'After a failure, read the first line of the error before running again.' },
	'cheat-first': { title: 'Look up syntax first', detail: 'Check the relevant syntax before opening the solution.' }
};
export type ExperimentId = keyof typeof EXPERIMENTS;
export const isExperiment = (v: unknown): v is ExperimentId => typeof v === 'string' && Object.hasOwn(EXPERIMENTS, v);
export const experimentCopy = (id: ExperimentId, locale: Locale) => locale === 'en' ? experimentsEn[id] : EXPERIMENTS[id];
const retryLabel = (locale: Locale) => copy(locale)(`실패 뒤 ${QUICK_RETRY_SEC}초 안 재실행`, `Retried within ${QUICK_RETRY_SEC}s of failure`);
const revealLabel = (locale: Locale) => copy(locale)('조회 없이 답 공개', 'Opened solutions without a lookup');

/** The chosen experiment's measure before (14 days before choosing) and since choosing. */
export function experimentResult(log: DebriefLog, id: ExperimentId, chosenAt: number, now: number, locale: Locale = 'ko') {
	const before = measures(log, { from: chosenAt - 2 * WEEK_SEC, to: chosenAt });
	const after = measures(log, { from: chosenAt, to: now + 1 });
	const show = (m: ReturnType<typeof measures>) =>
		EXPERIMENTS[id].measure === 'quick'
			? m.retries ? `${m.quick} / ${m.retries}` : '—'
			: m.revealed ? `${m.revealNoLookup} / ${m.revealed}` : '—';
	const label = EXPERIMENTS[id].measure === 'quick' ? retryLabel(locale) : revealLabel(locale);
	return { label, before: show(before), after: show(after), afterSessions: after.sessions };
}

// ---------- coaching (Operator reading) ----------
export type CoachFact = { id: string; text: string };

/** What a reading may rely on: pattern notes, the week's traces, questions. Each with an id the sentences must cite. */
export function coachingFacts(log: DebriefLog, stats: PatternStat[], catalog: DebriefPattern[], now: number, locale: Locale = 'ko'): CoachFact[] {
	const t = copy(locale);
	const facts: CoachFact[] = [];
	const name = (id: string) => catalog.find((p) => p.id === id)?.short ?? id;
	for (const p of stats.filter((x) => x.note).slice(0, 5))
		facts.push({ id: `pattern:${p.id}`, text: t(
			`반복된 실수 “${name(p.id)}”: 실행 ${p.runs}번, 세션 ${p.sessions}개, 문제 ${p.problems.join(', ')}. 마지막 ${localDate(p.lastAt)} ${clock(p.lastAt)}.`,
			`Recurring mistake “${name(p.id)}” appeared in ${count(p.runs, 'run')} across ${count(p.sessions, 'session')}, on problems ${p.problems.join(', ')}. Last seen ${localDate(p.lastAt)} ${clock(p.lastAt)}.`
		) });
	for (const fact of focusFacts(log, now, locale)) {
		if (fact.value === null) continue;
		const previous = fact.before ? t(` 그 전 7일: ${fact.before}.`, ` Previous seven days: ${fact.before}.`) : '';
		facts.push({ id: `focus:${fact.id}`, text: t(
			`최근 7일 ${fact.label}: ${fact.value}. ${fact.detail}${previous}`,
			`Last seven days, ${fact.label}: ${fact.value}. ${fact.detail}${previous}`
		).trim() });
	}
	const qs = log.questions.filter((q) => q.at >= now - WEEK_SEC);
	if (qs.length) {
		const sessionOf = new Map(log.sessions.map((s) => [s.id, s]));
		const questions = qs.slice(-6).map((q) => `[${sessionOf.get(q.sessionId)?.problemId ?? '?'}] ${q.text.replace(/\s+/g, ' ').slice(0, 60)}`).join(' / ');
		facts.push({ id: 'questions', text: t(`최근 7일 Operator 질문 ${qs.length}개: ${questions}`, `${count(qs.length, 'Operator question')} in the last seven days: ${questions}`) });
	}
	return facts;
}

export const COACH_SYSTEM = [
	'당신은 학습 기록을 읽고 짧게 코칭하는 사람입니다. 문체는 담백하고 구체적입니다.',
	'',
	'규칙',
	'- 입력 JSON의 facts에 적힌 사실만 근거로 쓴다. 숫자, 이름, 날짜를 지어내거나 바꾸지 않는다.',
	'- 3문장에서 5문장. 한 문장은 한국어 110자 이하.',
	'- 문장마다 근거가 된 fact의 id를 facts 배열에 적는다. 근거가 없는 문장은 쓰지 않는다.',
	'- 사람의 성격, 재능, 의지, 집중력 수준을 판정하지 않는다. "집중을 못 했다", "게으르다" 같은 말을 쓰지 않는다. 기록된 행동만 말한다.',
	'- 기록으로 알 수 없는 것은 알 수 없다고 쓴다. 칭찬과 걱정을 꾸며내지 않는다.',
	'- 마지막 문장은 기록에 근거한 구체적인 다음 행동 하나를 제안한다.',
	'- 도구를 쓰지 않고, 파일을 읽지 않는다.',
	'- 출력은 아래 모양의 JSON 하나뿐이다. 설명, 마크다운, 코드펜스를 붙이지 않는다.',
	'{"sentences":[{"text":"문장","facts":["fact id","fact id"]}]}'
].join('\n');

export const COACH_MAX_CHARS = 110;
const COACH_EN_MAX_CHARS = 180;
export const COACH_MAX_SENTENCES = 5;
export const COACH_SYSTEM_EN = [
	'Give short, specific coaching on recent practice in plain English.',
	'Use only the facts in the input JSON. Keep all numbers, names, and dates as given.',
	`Write three to five sentences, at most ${COACH_EN_MAX_CHARS} characters each.`,
	'Each sentence must cite the supporting fact IDs in its facts array.',
	'Describe recorded behavior. Avoid judging personality, talent, willpower, or concentration. Mark what the records leave unknown. Avoid invented praise or concern.',
	'Suggest one specific next action supported by the records in the final sentence.',
	'Use no tools or files. Return only JSON in this format, with no Markdown:',
	'{"sentences":[{"text":"Sentence","facts":["fact id","fact id"]}]}'
].join('\n');

export function coachingPrompt(facts: CoachFact[], locale: Locale = 'ko') {
	const lead = copy(locale)('최근 학습 기록의 사실입니다. 이 사실로만 코칭해 주세요.', 'Give coaching based on these recorded practice facts.');
	return `${lead}\n\n${JSON.stringify({ facts }, null, 1)}`;
}

const JUDGING = /(당신|너|그대)(은|는)\s|성격|재능|게으|의지가|집중(력)?(을|이)?\s?(못|부족|약)|산만/;
const JUDGING_EN = /\b(?:lazy|willpower|your personality|your talent|lack(?:ed|s)? concentration|could not focus|you (?:are|were) distracted)\b/i;

/** Strict JSON in, validated sentences out (each cites known fact ids, is short, and judges no one). Null when the text is not the expected JSON. */
export function parseCoaching(text: string, facts: CoachFact[], locale: Locale = 'ko'): { sentences: { text: string; factIds: string[] }[]; dropped: number } | null {
	const known = new Set(facts.map((f) => f.id));
	const limit = locale === 'en' ? COACH_EN_MAX_CHARS : COACH_MAX_CHARS;
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
	const out: { text: string; factIds: string[] }[] = [];
	let dropped = 0;
	for (const x of list) {
		const o = (x && typeof x === 'object' ? x : {}) as { text?: unknown; facts?: unknown };
		const t = typeof o.text === 'string' ? o.text.trim() : '';
		const ids = Array.isArray(o.facts) ? (o.facts.filter((i) => typeof i === 'string' && known.has(i)) as string[]) : [];
		if (!t || !ids.length || Array.from(t).length > limit || JUDGING.test(t) || (locale === 'en' && JUDGING_EN.test(t)) || out.length >= COACH_MAX_SENTENCES) {
			dropped++;
			continue;
		}
		out.push({ text: t, factIds: [...new Set(ids)] });
	}
	return { sentences: out, dropped };
}

// ---------- examples of a pattern ----------
/** The `expr // => value` lines of a verify snippet, as shown under a rule. */
export const examplesOf = (verify: string) =>
	verify.split('\n').flatMap((l) => {
		const m = l.match(/^\s*(.*?)\s*\/\/ => (.*)$/);
		return m ? [{ expr: m[1], value: m[2].trim() }] : [];
	});
