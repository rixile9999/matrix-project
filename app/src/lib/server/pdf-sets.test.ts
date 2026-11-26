import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import type { PdfSetContent } from '#lib/pdf-sets.ts';
import { withAccount } from './db.ts';
import {
	answerPdfQuestion, findPdfSetByRequest, listPdfSets, pdfPracticeView, savePdfSet
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

it('deduplicates uploads within one account and lists its newest sets first', () => {
	const account = randomUUID();
	const request = randomUUID();
	const first = withAccount(account, () => {
		const id = savePdfSet('cells.pdf', fixture, request);
		expect(findPdfSetByRequest(request)).toBe(id);
		expect(savePdfSet('retry.pdf', fixture, request)).toBe(id);
		const second = savePdfSet('another.pdf', fixture, randomUUID());
		expect(listPdfSets()).toEqual([
			{ id: second, sourceName: 'another.pdf', title: fixture.title, count: 2 },
			{ id, sourceName: 'cells.pdf', title: fixture.title, count: 2 }
		]);
		return id;
	});
	withAccount(randomUUID(), () => {
		expect(listPdfSets()).toEqual([]);
		expect(findPdfSetByRequest(request)).toBeNull();
		expect(pdfPracticeView(first, null, 'en')).toBeNull();
		expect(answerPdfQuestion(first, 0, 1)).toBe('missing');
		expect(savePdfSet('cells.pdf', fixture, request)).not.toBe(first);
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
