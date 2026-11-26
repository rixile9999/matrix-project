import { randomUUID } from 'node:crypto';
import type { BiText, PdfSetContent } from '#lib/pdf-sets.ts';
import type { Locale } from '#lib/locale.ts';
import { db } from './db.ts';

export const PDF_QUESTION_LIMIT_SEC = 120;

type PdfSetRow = { source_name: string; content: string };
type PdfAttempt = {
	question_index: number;
	started_at: number;
	answered_at: number | null;
	selected: number | null;
};

export function findPdfSetByRequest(requestId: string): string | null {
	const set = db().prepare('SELECT id FROM pdf_sets WHERE request_id = ?').get(requestId);
	return (set?.id as string | undefined) ?? null;
}

export function savePdfSet(sourceName: string, content: PdfSetContent, requestId: string): string {
	const id = randomUUID();
	const saved = db().prepare(`
		INSERT INTO pdf_sets (id, request_id, source_name, content) VALUES (?, ?, ?, ?)
		ON CONFLICT (request_id) DO NOTHING
	`).run(id, requestId, sourceName, JSON.stringify(content));
	return saved.changes ? id : findPdfSetByRequest(requestId)!;
}

export function listPdfSets(): { id: string; title: BiText; sourceName: string; count: number }[] {
	const rows = db().prepare(`
		SELECT id, source_name AS sourceName, json_extract(content, '$.title') AS title,
			json_array_length(content, '$.questions') AS count
		FROM pdf_sets ORDER BY rowid DESC
	`).all() as { id: string; sourceName: string; title: string; count: number }[];
	return rows.map((row) => ({ ...row, title: JSON.parse(row.title) as BiText }));
}

function readPdfSet(id: string) {
	const row = db().prepare('SELECT source_name, content FROM pdf_sets WHERE id = ?').get(id) as PdfSetRow | undefined;
	return row ? { sourceName: row.source_name, content: JSON.parse(row.content) as PdfSetContent } : null;
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
