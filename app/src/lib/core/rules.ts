// Shared cross-track timing policy and content bounds.
// One definition per rule: runtime code and verification scripts both import from here.
// Track-specific grading and hint semantics remain inside their own track modules.

/** Allowed limitSec range [min, max] per difficulty level (CLAUDE.md #6: 1–3m, 5–10m, 15–25m). */
export const LEVEL_LIMIT_SEC = {
	1: [60, 180],
	2: [300, 600],
	3: [900, 1500]
} as const;

/** Seconds allowed per memorisation item, by kind. Overtime is recorded, never enforced. */
export const MEMO_LIMIT_SEC = {
	concept: 40,
	recognize: 40,
	steps: 60,
	line: 30,
	syntax: 30,
	trace: 45,
	approach: 45,
	bug: 60,
	order: 120
} as const;

/** Shared static content bounds enforced by both fast and full verifiers. */
export const CONTENT_BOUNDS = {
	hintsPerProblem: 2,
	minIntentChars: 30,
	minCasesByLevel: { 1: 3, 2: 4, 3: 4 } as const,
	cheatMaxLines: 14,
	memoPromptMaxChars: 220,
	memoPointMaxChars: 140,
	debriefRuleMaxChars: 160,
	pedagogyWarnMinTopicProblems: 4
} as const;
