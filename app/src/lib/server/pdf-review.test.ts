import { beforeEach, expect, it, vi } from 'vitest';
import type { PdfQuestion } from '#lib/pdf-sets.ts';
import { PdfReviewError, reviewPdfQuestions } from './pdf-review.ts';
import { askCoach } from './worker.ts';

vi.mock('./worker.ts', () => ({ askCoach: vi.fn() }));
beforeEach(() => vi.mocked(askCoach).mockReset());

const question: PdfQuestion = {
	conceptId: 'c1-1',
	kind: 'apply',
	page: 12,
	prompt: { en: 'What is the mean of 4 and 10?', ko: '4와 10의 평균은 얼마인가요?' },
	choices: [{ en: '7', ko: '7' }, { en: '14', ko: '14' }, { en: '6', ko: '6' }, { en: '5', ko: '5' }],
	correct: 0,
	intent: { en: 'Private intent', ko: '공개 전 의도' },
	explanation: { en: 'Private explanation', ko: '공개 전 해설' }
};
const context = {
	title: { en: 'Statistics', ko: '통계학' },
	concepts: [{
		id: 'c1-1', title: { en: 'Arithmetic mean', ko: '산술 평균' },
		objective: { en: 'Calculate an arithmetic mean.', ko: '산술 평균을 계산한다.' },
		prerequisites: [], page: 12
	}],
	pages: [{ page: 12, text: 'The arithmetic mean is the sum divided by the count.' }]
};
const pass = { index: 0, selectedEn: 0, selectedKo: 0, issue: null, reason: null };
const response = (reviews: object[]) => JSON.stringify({ reviews });

it('checks a solved exercise in a fresh call with only public fields and source context', async () => {
	vi.mocked(askCoach).mockResolvedValueOnce(response([pass]));
	const signal = new AbortController().signal;
	expect(await reviewPdfQuestions('codex', { ...context, questions: [question] }, signal)).toEqual([]);
	const [backend, prompt, system, , requestedSignal] = vi.mocked(askCoach).mock.calls[0]!;
	expect(backend).toBe('codex');
	expect(requestedSignal).toBe(signal);
	expect(system).toContain('First solve the English and Korean versions independently.');
	expect(system).toContain('Do not solve or reproduce those questions.');
	expect(JSON.parse(prompt)).toEqual({
		...context,
		questions: [{ index: 0, conceptId: question.conceptId, kind: question.kind, page: question.page, prompt: question.prompt, choices: question.choices }]
	});
});

it('rejects a wrong keyed answer, non-equivalent choices, ambiguity and an exercise that misses its learning goal', async () => {
	const supportedReason = 'Make the example require a new calculation.';
	vi.mocked(askCoach).mockResolvedValueOnce(response([
		{ ...pass, index: 3, issue: 'weak-skill', reason: supportedReason },
		{ ...pass, index: 2, selectedEn: null, selectedKo: null },
		{ ...pass, index: 1, selectedKo: 1 },
		{ ...pass, selectedEn: 1, selectedKo: 1 }
	]));
	expect(await reviewPdfQuestions('codex', { ...context, questions: Array.from({ length: 4 }, () => question) })).toEqual([
		{ index: 0, reason: expect.stringContaining('keyed answer') },
		{ index: 1, reason: expect.stringContaining('both languages') },
		{ index: 2, reason: expect.stringContaining('exactly one') },
		{ index: 3, reason: supportedReason }
	]);
});

it('retries malformed output and requires exactly one in-range result per question', async () => {
	vi.mocked(askCoach)
		.mockResolvedValueOnce(response([pass, pass]))
		.mockResolvedValueOnce(response([pass, { ...pass, index: 1, selectedKo: 4 }]));
	await expect(reviewPdfQuestions('codex', { ...context, questions: [question, question] })).rejects.toBeInstanceOf(PdfReviewError);
	expect(askCoach).toHaveBeenCalledTimes(2);
	expect(vi.mocked(askCoach).mock.calls[1]?.[2]).toContain('previous output failed validation');
});

it('accepts a repaired report and discards unsafe model details', async () => {
	vi.mocked(askCoach)
		.mockResolvedValueOnce('not JSON')
		.mockResolvedValueOnce(response([{ ...pass, selectedEn: null, selectedKo: null, issue: 'unsafe', reason: 'avoid repeating this' }]));
	expect(await reviewPdfQuestions('codex', { ...context, questions: [question] })).toEqual([
		{ index: 0, unsafe: true, reason: 'Replace unsafe material with a safe exercise.' }
	]);
});

it('propagates worker failures and cancellation separately from malformed output', async () => {
	const failure = new Error('worker disconnected');
	vi.mocked(askCoach).mockRejectedValueOnce(failure);
	await expect(reviewPdfQuestions('codex', { ...context, questions: [question] })).rejects.toBe(failure);
	const abort = new AbortController();
	abort.abort(new Error('user cancelled'));
	await expect(reviewPdfQuestions('codex', { ...context, questions: [question] }, abort.signal)).rejects.toBe(abort.signal.reason);
	expect(askCoach).toHaveBeenCalledTimes(1);
});
