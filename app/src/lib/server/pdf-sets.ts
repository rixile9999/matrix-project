import { randomUUID } from 'node:crypto';
import type { BiText, PdfSetContent } from '#lib/pdf-sets.ts';
import type { Locale } from '#lib/locale.ts';
import { accountId, db } from './db.ts';

export const PDF_QUESTION_LIMIT_SEC = 120;

type PdfSetRow = { sourceName: string | null; content: string; isShared: number };
type PdfAttempt = {
	question_index: number;
	started_at: number;
	answered_at: number | null;
	selected: number | null;
};

export function findPdfSetByRequest(requestId: string): string | null {
	const set = db().prepare(`
		SELECT id FROM main.pdf_sets WHERE request_id = ?
		UNION ALL
		SELECT id FROM catalog.pdf_sets WHERE account_id = ? AND request_id = ?
		LIMIT 1
	`).get(requestId, accountId(), requestId);
	return (set?.id as string | undefined) ?? null;
}

export function savePdfSet(sourceName: string, content: PdfSetContent, requestId: string): string {
	const existing = findPdfSetByRequest(requestId);
	if (existing !== null) return existing;
	const id = randomUUID();
	const saved = db().prepare(`
		INSERT INTO catalog.pdf_sets (id, account_id, request_id, source_name, content) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (account_id, request_id) DO NOTHING
	`).run(id, accountId(), requestId, sourceName, JSON.stringify(content));
	return saved.changes ? id : findPdfSetByRequest(requestId)!;
}

export function publishPdfSet(id: string): boolean {
	const owner = accountId();
	const published = db().prepare(`
		INSERT INTO catalog.pdf_sets (id, account_id, request_id, source_name, content)
		SELECT id, ?, request_id, source_name, content FROM main.pdf_sets WHERE id = ?
		ON CONFLICT DO NOTHING
	`).run(owner, id);
	return published.changes > 0 || Boolean(db().prepare(`
		SELECT 1 FROM catalog.pdf_sets WHERE id = ? AND account_id = ?
	`).get(id, owner));
}

const visiblePdfSets = `
	SELECT id, CASE WHEN account_id = ? THEN source_name END AS sourceName,
		content, 1 AS isShared, rowid AS position
	FROM catalog.pdf_sets
	UNION ALL
	SELECT id, source_name, content, 0, rowid
	FROM main.pdf_sets AS private
	WHERE NOT EXISTS (SELECT 1 FROM catalog.pdf_sets AS shared WHERE shared.id = private.id)
`;

export function listPdfSets(): { id: string; title: BiText; sourceName: string | null; count: number; isShared: boolean }[] {
	const rows = db().prepare(`
		SELECT id, sourceName, json_extract(content, '$.title') AS title,
			json_array_length(content, '$.questions') AS count, isShared
		FROM (${visiblePdfSets}) ORDER BY isShared DESC, position DESC
	`).all(accountId()) as { id: string; sourceName: string | null; title: string; count: number; isShared: number }[];
	return rows.map((row) => ({ ...row, title: JSON.parse(row.title) as BiText, isShared: row.isShared === 1 }));
}

function readPdfSet(id: string) {
	const row = db().prepare(`
		SELECT sourceName, content, isShared FROM (${visiblePdfSets}) WHERE id = ?
	`).get(accountId(), id) as PdfSetRow | undefined;
	return row ? { sourceName: row.sourceName, content: JSON.parse(row.content) as PdfSetContent, isShared: row.isShared === 1 } : null;
}

function openQuestion(id: string, index: number, now: number): number {
	db().prepare(`
		INSERT INTO pdf_question_attempts (set_id, question_index, started_at) VALUES (?, ?, ?)
		ON CONFLICT (set_id, question_index) DO NOTHING
	`).run(id, index, now);
	const attempt = db().prepare(`
		SELECT started_at FROM pdf_question_attempts WHERE set_id = ? AND question_index = ?
	`).get(id, index)!;
	return attempt.started_at as number;
}

export function pdfPracticeView(id: string, index: number | null, locale: Locale, now = Date.now()) {
	const set = readPdfSet(id);
	if (!set) return null;
	const attempts = db().prepare(`
		SELECT question_index, started_at, answered_at, selected FROM pdf_question_attempts WHERE set_id = ?
	`).all(id) as PdfAttempt[];
	const byIndex = new Map(attempts.map((attempt) => [attempt.question_index, attempt]));
	const { questions } = set.content;
	const progress = questions.map((_, index) => byIndex.get(index)?.selected != null);
	const answered = progress.filter(Boolean).length;
	const resume = progress.indexOf(false);
	const current = index ?? resume;
	const question = questions[current];
	if (index !== null && !question) return null;

	const attempt = byIndex.get(current);
	// Only explicitly expose solution data for the question with a submitted answer.
	const feedback = question && attempt?.selected != null && attempt.answered_at !== null
		? {
			selected: attempt.selected,
			correct: question.correct,
			explanation: question.explanation[locale],
			late: attempt.answered_at - attempt.started_at > PDF_QUESTION_LIMIT_SEC * 1000
		}
		: null;
	return {
		id,
		title: set.content.title[locale],
		sourceName: set.sourceName,
		isShared: set.isShared,
		progress,
		answered,
		correct: resume < 0 ? questions.filter((question, index) => byIndex.get(index)?.selected === question.correct).length : null,
		resume,
		question: question ? {
			index: current,
			prompt: question.prompt[locale],
			choices: question.choices.map((choice) => choice[locale]),
			page: question.page,
			startedAt: attempt?.started_at ?? openQuestion(id, current, now),
			limitSec: PDF_QUESTION_LIMIT_SEC,
			feedback
		} : null
	};
}

export function answerPdfQuestion(id: string, index: number, selected: number, now = Date.now()) {
	const set = readPdfSet(id);
	const question = set?.content.questions[index];
	if (!question) return 'missing';
	if (!Number.isSafeInteger(selected) || selected < 0 || selected >= question.choices.length) return 'invalid';
	const attempt = db().prepare(`
		UPDATE pdf_question_attempts SET selected = ?, answered_at = MAX(?, started_at)
		WHERE set_id = ? AND question_index = ? AND selected IS NULL
		RETURNING selected
	`).get(selected, now, id, index);
	if (attempt) return 'answered';
	return db().prepare(`
		SELECT 1 FROM pdf_question_attempts WHERE set_id = ? AND question_index = ?
	`).get(id, index) ? 'answered' : 'unopened';
}
