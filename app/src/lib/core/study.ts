// Pure helpers for the language pack: suggested starts and staged test results.
import { STAGE_SEP, type CaseResult, type TopicId } from './lang.ts';

export type StudyProblem = { id: string; level: 1 | 2 | 3; topic: TopicId; passedAt: number | null }; // passedAt: latest passing time, null = not passed
export type StudySession = { level: 1 | 2 | 3; topic: TopicId; endedAt: number; hintsUsed: number; outcome: 'passed' | 'revealed'; overtime: boolean };

/** Struggled = both hints used, finished over time, or gave up. */
export const struggled = (s: StudySession) => s.hintsUsed >= 2 || s.overtime || s.outcome === 'revealed';

/** First unpassed problem of `level`, in the given (curriculum) order. */
export const nextUnpassed = (problems: StudyProblem[], level: 1 | 2 | 3): string | null =>
	problems.find((p) => p.level === level && p.passedAt === null)?.id ?? null;

/** A Sparring Sprint problem that was skipped or took longer than its own limit: a struggled level-1 session of `topic` that ended at `endedAt`. */
export type SprintStruggle = { topic: TopicId; endedAt: number };

/**
 * Level-1 warm-up: an unpassed problem on the topic of the most recent struggle (a struggled level-2 session or a Sprint struggle);
 * else the first unpassed one; when all are passed, the one passed longest ago, or, if a Sprint struggle exists, the one passed
 * longest ago on that struggle's topic. Null if there are none. Without Sprint struggles this is the level-2-only rule.
 */
export function suggestWarmup(problems: StudyProblem[], sessions: StudySession[], sprint: SprintStruggle[] = []): string | null {
	const basics = problems.filter((p) => p.level === 1);
	const open = basics.filter((p) => p.passedAt === null);
	const latest = <T extends { topic: TopicId; endedAt: number }>(list: T[]) => list.reduce<T | null>((a, s) => (!a || s.endedAt >= a.endedAt ? s : a), null);
	const oldest = (list: StudyProblem[]) => list.reduce<StudyProblem | null>((a, p) => (!a || p.passedAt! < a.passedAt! ? p : a), null);
	const fromSprint = latest(sprint);
	if (open.length) {
		const last = latest([...sessions.filter((s) => s.level === 2 && struggled(s)), ...sprint]);
		return (open.find((p) => p.topic === last?.topic) ?? open[0]).id;
	}
	return (oldest(basics.filter((p) => p.topic === fromSprint?.topic)) ?? oldest(basics))?.id ?? null;
}

export type StageGroup = { stage: string | null; cases: CaseResult[]; ok: number }; // case names have the stage prefix removed

/** Groups cases by the text before STAGE_SEP, stages in first-appearance order. Unstaged cases keep their place, merged while adjacent. */
export function groupStages(cases: CaseResult[]): StageGroup[] {
	const groups: StageGroup[] = [];
	const byStage = new Map<string, StageGroup>();
	for (const c of cases) {
		const at = c.name.indexOf(STAGE_SEP);
		let g: StageGroup | undefined;
		if (at < 0) {
			g = groups.at(-1);
			if (!g || g.stage !== null) groups.push((g = { stage: null, cases: [], ok: 0 }));
		} else {
			const stage = c.name.slice(0, at);
			g = byStage.get(stage);
			if (!g) groups.push((g = { stage, cases: [], ok: 0 })), byStage.set(stage, g);
		}
		g.cases.push(at < 0 ? c : { ...c, name: c.name.slice(at + STAGE_SEP.length) });
		if (c.status === 'ok') g.ok++;
	}
	return groups;
}
