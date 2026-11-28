// Debrief drills, server side: asks a model for trace exercises that make a learner face a note's mistake again, proves each one by
// running it (value and, for compile patterns, the slip), has a second pass solve it blind, and stores only what survived.
// Adding a drill to the deck is the learner's choice; the memo deck then reviews it as check `drill-<id>`.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';
import { bothLanguages, tr } from './locale.ts';
import { askCoach, connectedCoaches, runScala as workerRunScala } from './worker.ts';
import { annotatedBody, parseShows } from './scala-run.ts';
import { DEFAULT_BACKEND, catalog, debriefChecks, loadLog } from './debrief.ts';
import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
import { matchCompile, parseCompile, patternStats, type DebriefPattern } from '#lib/core/debrief.ts';
import {
	DRILL_SYSTEM, PER_DAY, PER_JOB, PER_NOTE, REVIEW_SYSTEM, drillCheck, drillHash, drillPrompt, parseDrills, parseReview, reviewPrompt,
	type Drill, type DrillInput
} from '#lib/core/drill.ts';
import type { TraceCheck } from '#lib/core/memo.ts';
import type { Locale } from '#lib/locale.ts';
import type { DebriefDrill, DebriefOk } from '#lib/types.ts';

const nowSec = () => Math.floor(Date.now() / 1000);
const ASK_TIMEOUT_MS = 150_000;
const AUTO_RETRY_AFTER_SEC = 24 * 3600;

// One web process; jobs of an earlier process can never finish.
const processId = randomUUID();

// ---------- verification ----------
export type RunScala = (files: Record<string, string>) => Promise<{ stdout: string; stderr: string; code: number; timedOut: boolean }>;

let cheatHarness: string | null = null;
const harness = () => (cheatHarness ??= readFileSync(resolve('cheatsheet/_harness/Cheat.scala'), 'utf8'));

/** The compiler's errors the way the judge hands them to Debrief: `[error]` lines only, no colours, the file shown as `User.scala`. */
const cleanErrors = (stderr: string) =>
	stderr
		.replace(/\x1b\[[0-9;]*m/g, '')
		.split('\n')
		.filter((l) => l.startsWith('[error]'))
		.map((l) => l.slice(8).replace(/^\S*User\.scala/, 'User.scala'))
		.join('\n')
		.trim();

/**
 * Machine verification of one drill.
 * 1. `verify` runs under the cheat-sheet harness (Cheat.scala + `object T` + a Main) and shows exactly options[0].
 * 2. No wrong option equals the shown value.
 * 3. Compile patterns: `slip`, wrapped as `object Slip:` in User.scala next to an empty Main, must fail to compile, and one of its
 *    errors, cleaned like the judge cleans them and parsed with parseCompile, must be recognised by the FIRST matching catalog pattern = this one.
 */
export async function verifyDrill(
	d: Drill, pattern: DebriefPattern, cat: DebriefPattern[], run: RunScala
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const no = (reason: string) => ({ ok: false as const, reason });
	try {
		const expected = new Map<string, string>();
		const body = annotatedBody('drill', d.verify, expected);
		const r = await run({
			'Cheat.scala': harness(),
			'T.scala': `object T:\n${body}`,
			'Main.scala': '@main def run(): Unit =\n  Cheat.touch(T)\n'
		});
		if (r.timedOut) return no('verify timed out');
		const shows = parseShows(r.stdout).filter((s) => s.key === 'drill');
		if (r.code !== 0 || shows.length !== 1) return no('verify does not run: ' + (cleanErrors(r.stderr).split('\n')[1] ?? r.stderr.slice(0, 120)));
		const shown = shows[0].actual;
		if (shown !== d.options[0].text.ko) return no(`verify shows "${shown}", option 0 says "${d.options[0].text.ko}"`);
		for (const [i, o] of d.options.slice(1).entries()) if (o.text.ko === shown || o.text.en === shown) return no(`wrong option ${i + 1} equals the shown value`);

		if (pattern.on === 'compile') {
			if (!d.slip) return no('a compile pattern needs a slip');
			const s = await run({
				'User.scala': 'object Slip:\n' + d.slip.split('\n').map((l) => '  ' + l).join('\n') + '\n',
				'Main.scala': '@main def run(): Unit = ()\n'
			});
			if (s.timedOut) return no('slip timed out');
			const errors = parseCompile(cleanErrors(s.stderr));
			if (!errors.length) return no(s.code === 0 ? 'slip compiles' : 'slip fails without a compiler error');
			const first = errors.map((e) => cat.find((q) => matchCompile(q, e))?.id);
			if (!first.includes(pattern.id)) return no(`slip is classified as ${first.find((id) => id) ?? 'nothing'}, not ${pattern.id}`);
		}
		return { ok: true };
	} catch (e) {
		return no('runner: ' + (e instanceof Error ? e.message : String(e)).slice(0, 160));
	}
}

// ---------- stored drills ----------
type DrillRow = { id: number; pattern_id: string; created_at: number; backend: string; reviewer: string; hash: string; body: string; state: 'ready' | 'added' | 'dropped' };

function parseBody(body: string): Drill | null {
	try {
		const d = JSON.parse(body) as Drill;
		return d && typeof d.code === 'string' && typeof d.verify === 'string' && Array.isArray(d.options) && d.options.length === 4 && d.prompt ? d : null;
	} catch {
		return null;
	}
}

/** Non-dropped drills of a pattern, newest first. The answer stays on the server. */
export function drillsFor(patternId: string, locale: Locale): DebriefDrill[] {
	const rows = db().prepare("SELECT * FROM debrief_drills WHERE pattern_id = ? AND state != 'dropped' ORDER BY id DESC").all(patternId) as DrillRow[];
	return rows.flatMap((r) => {
		const d = parseBody(r.body);
		return d ? [{ id: r.id, prompt: d.prompt[locale], code: d.code, state: r.state as 'ready' | 'added' }] : [];
	});
}

const noteCount = (patternId: string) =>
	(db().prepare("SELECT COUNT(*) AS n FROM debrief_drills WHERE pattern_id = ? AND state != 'dropped'").get(patternId) as { n: number }).n;
const dayStart = () => {
	const d = new Date(Date.now());
	d.setHours(0, 0, 0, 0);
	return Math.floor(d.getTime() / 1000);
};
const dayCount = () => (db().prepare('SELECT COUNT(*) AS n FROM debrief_drills WHERE created_at >= ?').get(dayStart()) as { n: number }).n;
/** How many drills a job may still ask for under the three caps. */
const room = (patternId: string) => Math.max(0, Math.min(PER_JOB, PER_NOTE - noteCount(patternId), PER_DAY - dayCount()));

// ---------- jobs ----------
type JobRow = { id: number; pattern_id: string; started_at: number; ended_at: number | null; status: 'running' | 'done' | 'failed'; asked: number; kept: number; error: string | null; auto: number };

function markInterrupted() {
	db().prepare("UPDATE debrief_drill_jobs SET status = 'failed', error = 'interrupted', ended_at = ? WHERE status = 'running' AND process_id <> ?").run(nowSec(), processId);
}
const running = () => {
	markInterrupted();
	return !!db().prepare("SELECT 1 FROM debrief_drill_jobs WHERE status = 'running'").get();
};

/** The latest job of a pattern: 'running', or 'failed' (a later success clears it). */
export function drillJobState(patternId: string): 'running' | 'failed' | null {
	markInterrupted();
	const j = db().prepare('SELECT status FROM debrief_drill_jobs WHERE pattern_id = ? ORDER BY id DESC LIMIT 1').get(patternId) as { status: string } | undefined;
	return j?.status === 'running' ? 'running' : j?.status === 'failed' ? 'failed' : null;
}

export function drillAuto(): boolean {
	const r = db().prepare('SELECT enabled FROM debrief_drill_auto ORDER BY id DESC LIMIT 1').get() as { enabled: number } | undefined;
	return r ? r.enabled === 1 : true; // opt-out: on until the learner turns it off
}
export function setDrillAuto(on: unknown): DebriefOk {
	if (typeof on !== 'boolean') return { error: tr('켜기 또는 끄기만 보낼 수 있습니다.', 'Send true or false.') };
	db().prepare('INSERT INTO debrief_drill_auto(at, enabled) VALUES(?,?)').run(nowSec(), on ? 1 : 0);
	return { ok: true };
}

const finish = (id: number, status: 'done' | 'failed', kept: number, error: string | null = null) =>
	db().prepare('UPDATE debrief_drill_jobs SET status = ?, kept = ?, error = ?, ended_at = ? WHERE id = ?').run(status, kept, error, nowSec(), id);

/** The note's pattern in both languages and the catalog check as a format example (answer first), plus the learner's own failing lines. */
function buildInput(patternId: string, count: number): { input: DrillInput; pattern: DebriefPattern; cat: DebriefPattern[]; topic: string } | null {
	const both = bothLanguages(catalog);
	const ko = both.ko.find((p) => p.id === patternId);
	const en = both.en.find((p) => p.id === patternId) ?? ko;
	if (!ko || !en) return null;
	const cat = both.ko;
	const check = bothLanguages(debriefChecks).en.get(ko.check);
	const exemplar = check && check.kind === 'trace' && check.options.length === 4
		? { code: check.code, verify: check.verify, prompt: check.prompt, options: [check.options[check.answer], ...check.options.filter((_, i) => i !== check.answer)] }
		: null;
	const stat = patternStats(loadLog(), cat).stats.find((s) => s.id === patternId);
	const evidence = (stat?.evidence ?? []).slice(0, 3).map((h) => h.evidence.kind === 'compile'
		? { code: h.evidence.source, message: h.evidence.head }
		: { code: h.evidence.code, message: h.evidence.cases.join(', ') });
	const existing = (db().prepare('SELECT body FROM debrief_drills WHERE pattern_id = ?').all(patternId) as { body: string }[]).flatMap((r) => parseBody(r.body)?.code ?? []);
	return {
		input: { pattern: { id: patternId, title: { ko: ko.title, en: en.title }, rule: { ko: ko.rule, en: en.rule }, on: ko.on }, exemplar, evidence, existing, count },
		pattern: ko, cat, topic: check?.topic ?? 'syntax'
	};
}

const REPAIR = '\nThe previous reply could not be used. Return only the JSON object {"drills":[...]} and check every rule in the system prompt (counts, option order, one `// =>` line, both languages, slip) before replying.';
const failedBy = (reasons: string[]) => (reasons.length && reasons.every((r) => r.startsWith('runner:')) ? 'runner' : 'verify');

/** One pattern: generate, verify, review blind, store. Ends the job row; never throws. */
async function runOne(jobId: number, patternId: string, backend: BackendId): Promise<void> {
	try {
		const count = room(patternId);
		if (count <= 0) return void finish(jobId, 'done', 0);
		const built = buildInput(patternId, count);
		if (!built) return void finish(jobId, 'failed', 0, 'unknown');
		const { input, pattern, cat } = built;
		db().prepare('UPDATE debrief_drill_jobs SET asked = ? WHERE id = ?').run(count, jobId);

		let drills: Drill[] = [];
		for (const repair of [false, true]) {
			let reply: string;
			try {
				reply = await askCoach(backend, drillPrompt(input), repair ? DRILL_SYSTEM + REPAIR : DRILL_SYSTEM, () => {}, AbortSignal.timeout(ASK_TIMEOUT_MS), true);
			} catch {
				return void finish(jobId, 'failed', 0, 'provider');
			}
			drills = parseDrills(reply, input).slice(0, count);
			if (drills.length) break;
		}
		if (!drills.length) return void finish(jobId, 'failed', 0, 'parse');

		const verified: Drill[] = [];
		const reasons: string[] = [];
		for (const d of drills) {
			const v = await verifyDrill(d, pattern, cat, (files) => workerRunScala(files));
			if (v.ok) verified.push(d);
			else reasons.push(v.reason);
		}
		if (!verified.length) return void finish(jobId, 'failed', 0, failedBy(reasons));

		const have = await connectedCoaches();
		const reviewer = have.find((b) => b !== backend) ?? backend;
		const seeds = verified.map((_, i) => `${jobId}:${i}`);
		let reviews: ReturnType<typeof parseReview>;
		try {
			reviews = parseReview(await askCoach(reviewer, reviewPrompt(verified, seeds), REVIEW_SYSTEM, () => {}, AbortSignal.timeout(ASK_TIMEOUT_MS), true), verified, seeds);
		} catch {
			return void finish(jobId, 'failed', 0, 'review');
		}

		let kept = 0;
		for (const [i, d] of verified.entries()) {
			if (!reviews[i]?.ok) continue;
			if (noteCount(patternId) >= PER_NOTE || dayCount() >= PER_DAY) break;
			const r = db().prepare('INSERT OR IGNORE INTO debrief_drills(pattern_id, created_at, backend, reviewer, hash, body) VALUES(?,?,?,?,?,?)')
				.run(patternId, nowSec(), backend, reviewer, drillHash(d.code), JSON.stringify(d));
			kept += Number(r.changes);
		}
		if (kept) finish(jobId, 'done', kept);
		else finish(jobId, 'failed', 0, 'none');
	} catch {
		try {
			finish(jobId, 'failed', 0, 'internal');
		} catch {
			// the account database is gone; nothing left to record
		}
	}
}

/** One running job per account: the patterns go through one after the other, each with its own row. */
function startQueue(patternIds: string[], backend: BackendId, auto: boolean): boolean {
	if (!patternIds.length || running()) return false;
	const insert = db().prepare("INSERT INTO debrief_drill_jobs(pattern_id, started_at, process_id, backend, status, auto) VALUES(?,?,?,?,'running',?)");
	const jobs = patternIds.map((p) => ({ id: Number(insert.run(p, nowSec(), processId, backend, auto ? 1 : 0).lastInsertRowid), pattern: p }));
	// Started inside the request's account context, which the background work keeps.
	void (async () => {
		for (const j of jobs) await runOne(j.id, j.pattern, backend);
	})();
	return true;
}

const noteOf = (id: string) => patternStats(loadLog(), catalog()).stats.find((s) => s.id === id)?.note === true;

export function startDrills(pattern: unknown, backend?: unknown): { status: number; body: DebriefOk } {
	try {
		if (typeof pattern !== 'string' || !catalog().some((p) => p.id === pattern)) return { status: 400, body: { error: tr('알 수 없는 노트입니다.', 'Unknown note.') } };
		if (!noteOf(pattern)) return { status: 400, body: { error: tr('아직 노트가 되지 않은 패턴입니다.', 'This pattern does not have a note yet.') } };
		if (running()) return { status: 409, body: { error: tr('이미 만드는 중입니다.', 'Already making.') } };
		if (room(pattern) <= 0) return { status: 409, body: { error: tr('오늘은 여기까지입니다.', 'That is enough for now.') } };
		const id = (typeof backend === 'string' && backend in BACKENDS ? backend : DEFAULT_BACKEND) as BackendId;
		return startQueue([pattern], id, false) ? { status: 202, body: { ok: true } } : { status: 409, body: { error: tr('이미 만드는 중입니다.', 'Already making.') } };
	} catch {
		return { status: 500, body: { error: tr('시작하지 못했습니다.', 'Could not start.') } };
	}
}

/** ready -> added (also puts the pattern's note into the deck), ready/added -> dropped. */
export function setDrillState(id: unknown, drop: unknown): DebriefOk {
	const row = Number.isInteger(id) ? db().prepare('SELECT * FROM debrief_drills WHERE id = ?').get(id as number) as DrillRow | undefined : undefined;
	if (!row || row.state === 'dropped') return { error: tr('알 수 없는 변형입니다.', 'Unknown variation.') };
	const at = nowSec();
	if (drop === true) {
		db().prepare("UPDATE debrief_drills SET state = 'dropped', state_at = ? WHERE id = ?").run(at, row.id);
		return { ok: true };
	}
	if (row.state === 'ready') db().prepare("UPDATE debrief_drills SET state = 'added', state_at = ? WHERE id = ?").run(at, row.id);
	if (!db().prepare('SELECT 1 FROM debrief_deck WHERE pattern_id = ?').get(row.pattern_id)) db().prepare('INSERT INTO debrief_deck(pattern_id, at) VALUES(?,?)').run(row.pattern_id, at);
	return { ok: true };
}

/** Drills in the deck, as memo checks `drill-<id>`. */
export function deckDrillChecks(locale: Locale): TraceCheck[] {
	const rows = db().prepare("SELECT * FROM debrief_drills WHERE state = 'added' ORDER BY id").all() as DrillRow[];
	if (!rows.length) return [];
	const checkOf = new Map(catalog().map((p) => [p.id, p.check]));
	const checks = debriefChecks();
	return rows.flatMap((r) => {
		const d = parseBody(r.body);
		return d ? [drillCheck(d, r.id, r.pattern_id, checks.get(checkOf.get(r.pattern_id) ?? '')?.topic ?? 'syntax', locale)] : [];
	});
}

// ---------- background generation after a session ----------
/** Recently failed on its own: the last automatic job asked for drills, ended within a day and kept none. */
const coolingDown = (patternId: string) => {
	const j = db().prepare('SELECT ended_at, asked, kept, error FROM debrief_drill_jobs WHERE pattern_id = ? AND auto = 1 AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1')
		.get(patternId) as { ended_at: number; asked: number; kept: number; error: string | null } | undefined;
	return !!j && j.asked > 0 && j.kept === 0 && j.error !== 'interrupted' && j.ended_at >= nowSec() - AUTO_RETRY_AFTER_SEC;
};

/**
 * A session just finished: every note pattern it showed (most runs first, including a pattern that became a note in this very
 * session) that is under the caps and not cooling down is generated in one background job. Silent without a connected backend
 * and when the learner turned it off. Never throws.
 */
export function autoDrills(problemId: string): void {
	try {
		if (!drillAuto() || running()) return;
		const log = loadLog();
		const cat = catalog();
		const last = log.sessions.filter((s) => s.problemId === problemId && s.endedAt !== null).sort((a, b) => b.id - a.id)[0];
		if (!last) return;
		const { stats, hitsByRun } = patternStats(log, cat);
		const notes = new Set(stats.filter((s) => s.note).map((s) => s.id));
		const runs = new Map<string, number>();
		for (const r of log.runs) if (r.sessionId === last.id) for (const h of hitsByRun.get(r.id) ?? []) if (notes.has(h.pattern)) runs.set(h.pattern, (runs.get(h.pattern) ?? 0) + 1);
		const picked = [...runs].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => room(id) > 0 && !coolingDown(id));
		if (!picked.length) return;
		void (async () => {
			try {
				const have = await connectedCoaches();
				if (!have.length) return;
				startQueue(picked, have.includes(DEFAULT_BACKEND) ? DEFAULT_BACKEND : have[0], true);
			} catch {
				// a broken background start must never reach the session
			}
		})();
	} catch {
		// never break a run
	}
}
