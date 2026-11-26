import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, expect, it } from 'vitest';
import type { PdfSetContent } from '#lib/pdf-sets.ts';
import { withAccount } from './db.ts';
import {
	answerPdfQuestion, findPdfSetByRequest, listPdfSets, pdfPracticeView, publishPdfSet, savePdfSet
} from './pdf-sets.ts';

const directory = mkdtempSync(join(tmpdir(), 'matrix-pdf-sets-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = directory;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(directory, { recursive: true, force: true });
});

const fixture: PdfSetContent = {
	title: { en: 'Cells', ko: '세포' },
	questions: [
		{
			page: 6,
			prompt: { en: 'Which structure controls entry into a cell?', ko: '어떤 구조가 세포로 들어오는 물질을 조절하나요?' },
			choices: [{ en: 'Ribosome', ko: '리보솜' }, { en: 'Cell membrane', ko: '세포막' }],
			correct: 1,
			explanation: { en: 'The membrane selectively controls passage.', ko: '세포막은 물질을 선택적으로 통과시킵니다.' }
		},
		{
			page: 7,
			prompt: { en: 'Which structure produces proteins?', ko: '어떤 구조가 단백질을 합성하나요?' },
			choices: [{ en: 'Ribosome', ko: '리보솜' }, { en: 'Cell membrane', ko: '세포막' }],
			correct: 0,
			explanation: { en: 'Ribosomes translate messenger RNA.', ko: '리보솜은 전령 RNA를 번역합니다.' }
		}
	]
};

it('publishes new sets with stable IDs and keeps request IDs and filenames account-scoped', () => {
	const uploader = randomUUID();
	const reader = randomUUID();
	const request = randomUUID();
	const [first, second] = withAccount(uploader, () => {
		const id = savePdfSet('cells.pdf', fixture, request);
		expect(findPdfSetByRequest(request)).toBe(id);
		expect(savePdfSet('retry.pdf', fixture, request)).toBe(id);
		const second = savePdfSet('another.pdf', fixture, randomUUID());
		expect(listPdfSets().filter((entry) => entry.id === id || entry.id === second)).toEqual([
			{ id: second, sourceName: 'another.pdf', title: fixture.title, count: 2, isShared: true },
			{ id, sourceName: 'cells.pdf', title: fixture.title, count: 2, isShared: true }
		]);
		expect(pdfPracticeView(id, null, 'en')).toMatchObject({ id, sourceName: 'cells.pdf', isShared: true });
		return [id, second];
	});
	const third = withAccount(reader, () => {
		expect(listPdfSets().filter((entry) => entry.id === first || entry.id === second)).toEqual([
			{ id: second, sourceName: null, title: fixture.title, count: 2, isShared: true },
			{ id: first, sourceName: null, title: fixture.title, count: 2, isShared: true }
		]);
		expect(findPdfSetByRequest(request)).toBeNull();
		expect(pdfPracticeView(first, null, 'ko')).toMatchObject({
			id: first, title: fixture.title.ko, sourceName: null, isShared: true
		});
		const id = savePdfSet('reader-notes.pdf', fixture, request);
		expect(id).not.toBe(first);
		expect(findPdfSetByRequest(request)).toBe(id);
		return id;
	});
	withAccount(uploader, () => {
		expect(findPdfSetByRequest(request)).toBe(first);
		expect(listPdfSets().find((entry) => entry.id === third)).toMatchObject({ sourceName: null, isShared: true });
	});
});

it('shares a question and its timer across locales and releases only submitted answers', () => {
	const account = randomUUID();
	const id = withAccount(account, () => {
		const set = savePdfSet('cells.pdf', fixture, randomUUID());
		expect(answerPdfQuestion(set, 0, 1)).toBe('unopened');
		const english = pdfPracticeView(set, null, 'en', 1000)!;
		expect(english.question).toEqual({
			index: 0,
			prompt: fixture.questions[0].prompt.en,
			choices: fixture.questions[0].choices.map((text) => text.en),
			page: 6,
			startedAt: 1000,
			limitSec: 120,
			feedback: null
		});
		expect(pdfPracticeView(set, 0, 'ko', 2000)?.question).toMatchObject({
			prompt: fixture.questions[0].prompt.ko,
			startedAt: 1000,
			feedback: null
		});
		expect(pdfPracticeView(set, 0, 'en', 3000)?.question).toEqual(english.question);
		expect(answerPdfQuestion(set, 0, 9, 3000)).toBe('invalid');
		expect(pdfPracticeView(set, 0, 'en')?.question?.feedback).toBeNull();
		expect(answerPdfQuestion(set, 0, 0, 4000)).toBe('answered');
		expect(answerPdfQuestion(set, 0, 1, 5000)).toBe('answered');
		return set;
	});
	withAccount(account, () => {
		expect(pdfPracticeView(id, 0, 'ko')?.question?.feedback).toEqual({
			selected: 0, correct: 1, explanation: fixture.questions[0].explanation.ko, late: false
		});
		const resumed = pdfPracticeView(id, null, 'en', 6000);
		expect(resumed).toMatchObject({ progress: [true, false], answered: 1, resume: 1 });
		expect(resumed?.question).toMatchObject({ index: 1, feedback: null });
		expect(answerPdfQuestion(id, 1, 0, 127000)).toBe('answered');
		expect(pdfPracticeView(id, 1, 'en')?.question?.feedback).toMatchObject({ selected: 0, correct: 0, late: true });
		expect(pdfPracticeView(id, null, 'en')).toMatchObject({
			progress: [true, true], answered: 2, correct: 1, resume: -1, question: null
		});
	});
});

it('opens the localized concept map without starting a timer and records practice by concept', () => {
	const concepts: NonNullable<PdfSetContent['concepts']> = [
		{
			id: 'membranes', title: { en: 'Membranes', ko: '세포막' },
			objective: { en: 'Describe transport across a membrane.', ko: '막을 통한 물질 이동을 설명한다.' },
			prerequisites: [], page: 6
		},
		{
			id: 'translation', title: { en: 'Translation', ko: '번역' },
			objective: { en: 'Trace the path from RNA to a protein.', ko: 'RNA에서 단백질까지의 과정을 설명한다.' },
			prerequisites: ['membranes'], page: 7
		}
	];
	const content: PdfSetContent = {
		...fixture,
		concepts,
		questions: [
			{
				...fixture.questions[0], conceptId: 'membranes', kind: 'apply',
				intent: { en: 'Connect selective transport to the cell boundary.', ko: '선택적 이동과 세포의 경계를 연결한다.' }
			},
			{ ...fixture.questions[1], conceptId: 'translation', kind: 'integrate' }
		]
	};
	const account = randomUUID();
	const id = withAccount(account, () => {
		const id = savePdfSet('cells.pdf', content, randomUUID());
		const map = pdfPracticeView(id, null, 'ko', 1000)!;
		expect(map).toMatchObject({
			question: null, progress: [false, false], resume: 0,
			concepts: [
				{ id: 'membranes', title: concepts[0].title.ko, objective: concepts[0].objective.ko, page: 6, prerequisites: [], exercises: [{ index: 0, kind: 'apply', answered: false }] },
				{ id: 'translation', title: concepts[1].title.ko, objective: concepts[1].objective.ko, page: 7, prerequisites: ['membranes'], exercises: [{ index: 1, kind: 'integrate', answered: false }] }
			]
		});
		expect(JSON.stringify(map)).not.toContain(content.questions[0].explanation.ko);
		expect(answerPdfQuestion(id, 0, 1, 2000)).toBe('unopened');
		expect(pdfPracticeView(id, 0, 'en', 3000)?.question).toMatchObject({
			index: 0, startedAt: 3000, limitSec: 300, feedback: null, conceptId: 'membranes', kind: 'apply'
		});
		expect(pdfPracticeView(id, 0, 'ko', 4000)?.question).toMatchObject({ startedAt: 3000, feedback: null });
		expect(answerPdfQuestion(id, 0, 1, 250000)).toBe('answered');
		expect(pdfPracticeView(id, 0, 'en')?.question?.feedback).toMatchObject({
			correct: 1, late: false, intent: content.questions[0].intent?.en
		});
		expect(pdfPracticeView(id, null, 'en')?.concepts[0].exercises).toEqual([{ index: 0, kind: 'apply', answered: true }]);
		expect(pdfPracticeView(id, 1, 'en', 251000)?.question).toMatchObject({ startedAt: 251000, limitSec: 900, feedback: null });
		expect(answerPdfQuestion(id, 1, 0, 1151001)).toBe('answered');
		expect(pdfPracticeView(id, 1, 'en')?.question?.feedback?.late).toBe(true);
		expect(pdfPracticeView(id, null, 'en')).toMatchObject({ answered: 2, correct: 2, resume: -1, question: null });
		return id;
	});
	withAccount(randomUUID(), () => {
		const map = pdfPracticeView(id, null, 'en')!;
		expect(map.concepts.flatMap((concept) => concept.exercises.map((exercise) => exercise.answered)))
			.toEqual([false, false]);
		expect(pdfPracticeView(id, 0, 'en')?.question?.feedback).toBeNull();
	});
});

it('keeps progress, timers, scores and feedback separate across accounts on the same set', () => {
	const uploader = randomUUID();
	const learner = randomUUID();
	const id = withAccount(uploader, () => {
		const id = savePdfSet('cells.pdf', fixture, randomUUID());
		expect(pdfPracticeView(id, 0, 'en', 1000)?.question?.startedAt).toBe(1000);
		expect(answerPdfQuestion(id, 0, 1, 2000)).toBe('answered');
		expect(pdfPracticeView(id, 1, 'en', 3000)?.question?.startedAt).toBe(3000);
		expect(answerPdfQuestion(id, 1, 0, 4000)).toBe('answered');
		expect(pdfPracticeView(id, null, 'en')).toMatchObject({ answered: 2, correct: 2, resume: -1 });
		return id;
	});
	withAccount(learner, () => {
		expect(answerPdfQuestion(id, 0, 0, 5000)).toBe('unopened');
		expect(pdfPracticeView(id, null, 'ko', 6000)).toMatchObject({
			progress: [false, false], answered: 0, correct: null, resume: 0,
			question: { index: 0, startedAt: 6000, feedback: null }
		});
		expect(answerPdfQuestion(id, 0, 0, 127000)).toBe('answered');
		expect(pdfPracticeView(id, 0, 'ko')?.question?.feedback).toEqual({
			selected: 0, correct: 1, explanation: fixture.questions[0].explanation.ko, late: true
		});
		expect(pdfPracticeView(id, null, 'en', 128000)).toMatchObject({
			progress: [true, false], answered: 1, correct: null, resume: 1,
			question: { index: 1, startedAt: 128000, feedback: null }
		});
		expect(answerPdfQuestion(id, 1, 1, 129000)).toBe('answered');
		expect(pdfPracticeView(id, null, 'ko')).toMatchObject({ answered: 2, correct: 0, resume: -1 });
	});
	withAccount(uploader, () => {
		expect(pdfPracticeView(id, 0, 'en')).toMatchObject({
			answered: 2, correct: 2,
			question: { startedAt: 1000, feedback: { selected: 1, correct: 1, late: false } }
		});
	});
});

it('keeps legacy sets private until their owner publishes them with the same ID and progress', () => {
	const owner = randomUUID();
	const reader = randomUUID();
	const id = randomUUID();
	const request = randomUUID();
	const accountDirectory = join(directory, 'users', owner);
	mkdirSync(accountDirectory, { recursive: true });
	const legacy = new DatabaseSync(join(accountDirectory, 'trainer.db'));
	legacy.exec(`
		CREATE TABLE pdf_sets (
			id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, source_name TEXT NOT NULL, content TEXT NOT NULL
		);
		CREATE TABLE pdf_question_attempts (
			set_id TEXT NOT NULL REFERENCES pdf_sets(id) ON DELETE CASCADE,
			question_index INTEGER NOT NULL CHECK (question_index >= 0),
			started_at INTEGER NOT NULL, answered_at INTEGER, selected INTEGER,
			CHECK ((answered_at IS NULL) = (selected IS NULL)),
			PRIMARY KEY (set_id, question_index)
		);
	`);
	legacy.prepare('INSERT INTO pdf_sets VALUES (?, ?, ?, ?)').run(id, request, 'private-notes.pdf', JSON.stringify(fixture));
	legacy.prepare('INSERT INTO pdf_question_attempts VALUES (?, 0, 1000, 3000, 1), (?, 1, 4000, NULL, NULL)').run(id, id);
	legacy.close();

	withAccount(reader, () => {
		expect(listPdfSets().some((entry) => entry.id === id)).toBe(false);
		expect(pdfPracticeView(id, null, 'en')).toBeNull();
		expect(answerPdfQuestion(id, 0, 1)).toBe('missing');
		expect(publishPdfSet(id)).toBe(false);
	});
	withAccount(owner, () => {
		expect(findPdfSetByRequest(request)).toBe(id);
		expect(listPdfSets().find((entry) => entry.id === id)).toMatchObject({ isShared: false, sourceName: 'private-notes.pdf' });
		const answered = pdfPracticeView(id, 0, 'ko', 5000);
		const open = pdfPracticeView(id, null, 'en', 6000);
		expect(answered?.question?.feedback).toMatchObject({ selected: 1, correct: 1, late: false });
		expect(open).toMatchObject({
			isShared: false, progress: [true, false], answered: 1, resume: 1,
			question: { index: 1, startedAt: 4000, feedback: null }
		});
		expect(publishPdfSet(id)).toBe(true);
		expect(publishPdfSet(id)).toBe(true);
		expect(listPdfSets().filter((entry) => entry.id === id)).toEqual([
			{ id, sourceName: 'private-notes.pdf', title: fixture.title, count: 2, isShared: true }
		]);
		expect(pdfPracticeView(id, 0, 'ko', 7000)).toEqual({ ...answered, isShared: true });
		expect(pdfPracticeView(id, null, 'en', 8000)).toEqual({ ...open, isShared: true });
		expect(findPdfSetByRequest(request)).toBe(id);
		expect(answerPdfQuestion(id, 1, 0, 9000)).toBe('answered');
		expect(pdfPracticeView(id, null, 'en')).toMatchObject({ answered: 2, correct: 2 });
	});
	withAccount(reader, () => {
		expect(listPdfSets().filter((entry) => entry.id === id)).toEqual([
			{ id, sourceName: null, title: fixture.title, count: 2, isShared: true }
		]);
		expect(findPdfSetByRequest(request)).toBeNull();
		expect(publishPdfSet(id)).toBe(false);
		expect(pdfPracticeView(id, null, 'en', 10000)).toMatchObject({
			id, isShared: true, sourceName: null, progress: [false, false], answered: 0, resume: 0,
			question: { index: 0, startedAt: 10000, feedback: null }
		});
	});
});
