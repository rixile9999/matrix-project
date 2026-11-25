// Memorisation pack: cards (recalled, self-graded against a checklist) and checks
// (answered by tapping, graded automatically). Content lives in memo/<lang>/.
import type { TopicId } from './lang.ts';

export type CardKind = 'concept' | 'recognize' | 'steps' | 'line';

/** memo/<lang>/cards/*.json holds MemoCard[]. */
export type MemoCard = {
	id: string; // unique across all card files, kebab-case
	kind: CardKind;
	// concept:   a why / compare / predict / counter-example question about an idea
	// recognize: a problem description -> which technique, and what in the description gives it away
	// steps:     a problem -> the purpose of each solution step, in order (not code)
	// line:      the one line of a solution people get wrong, blanked as ____ in promptCode
	topic: TopicId;
	title: string; // short name for the notes page, e.g. "fold의 방향과 스택"
	summary: string; // one-line takeaway for the notes page
	prompt: string; // the question (Korean, <= 220 chars, inline `code` allowed)
	promptCode?: string; // code shown with the question (required for 'line', with ____ for the blank)
	points: string[]; // the answer as 2–4 checkable elements (1–2 for 'line'); each <= 140 chars
	answerCode?: string; // code shown with the answer
	verify?: string; // required with answerCode: a self-contained snippet in cheat-sheet format (`// => value`
	// lines are executed and compared) that contains every line of answerCode, proving it runs
	pattern?: string; // id in patterns.json; required for recognize / steps / line
	book?: { id: string; chapter: number };
	unlock: string[]; // problem ids: the card becomes available once any of them has been finished; [] = always
};

/** memo/<lang>/patterns.json: pattern id -> a reusable solution shape. */
export type Pattern = { title: string; when: string; steps: string[] };

type CheckBase = { id: string; topic: TopicId; prompt: string; unlock: string[] };

/** Arrange shuffled lines. The submitted order is judged for real against `problem`'s tests. */
export type OrderCheck = CheckBase & {
	kind: 'order';
	problem: string; // problem id whose tests decide correctness
	given?: string; // fixed code shown above the lines and prepended to the submission
	lines: string[]; // 4–9 lines in a correct order, indentation included
	distractors: { line: string; replaces: number; why: string }[]; // 1–2 plausible wrong lines; `replaces` = index in lines
};
/** What does this evaluate to? */
export type TraceCheck = CheckBase & {
	kind: 'trace';
	code: string;
	options: { text: string; why: string }[]; // exactly 4; wrong ones come from real misconceptions
	answer: number;
	verify: string; // cheat-sheet-format snippet with a `// => value` line whose value equals options[answer].text
};
/** Tap the wrong line. */
export type BugCheck = CheckBase & {
	kind: 'bug';
	problem: string; // lines must compile and fail this problem's tests; with `fixed` they must pass
	given?: string;
	lines: string[];
	bugIndex: number;
	fixed: string; // the corrected line
	why: string;
};
/** Read a problem, choose technique + complexity. */
export type ApproachCheck = CheckBase & {
	kind: 'approach';
	options: { text: string; why: string }[]; // exactly 4
	answer: number;
};
/** memo/<lang>/checks/*.json holds Check[]. */
export type Check = OrderCheck | TraceCheck | BugCheck | ApproachCheck;

export const CARD_KINDS: Record<CardKind, string> = { concept: '개념', recognize: '알아보기', steps: '풀이 과정', line: '핵심 한 줄' };
export const CHECK_KINDS: Record<Check['kind'], string> = { order: '순서 배열', trace: '값 추적', bug: '버그 줄 찾기', approach: '접근법 고르기' };

/** Checklist result -> review grade (FSRS rating): nothing recalled = again, part = hard, all = good. */
export const gradeFromChecklist = (checked: number, total: number): 1 | 2 | 3 =>
	checked <= 0 ? 1 : checked >= total ? 3 : 2;

/** The time limit's consequence: a right answer that came after the limit counts as shaky (hard), not remembered, so it returns sooner. */
export const capOvertime = (rating: 1 | 2 | 3, overtime: boolean): 1 | 2 | 3 => (overtime && rating === 3 ? 2 : rating);
