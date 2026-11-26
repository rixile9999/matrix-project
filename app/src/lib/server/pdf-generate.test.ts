import { beforeEach, expect, it, vi } from 'vitest';
import { PDF_SOURCE_MAX_PAGES, PDF_UPLOAD_MAX_BYTES, type PdfGenerationProgress } from '#lib/pdf-sets.ts';
import { withLocale } from './locale.ts';
import { generatePdfSet } from './pdf-generate.ts';
import { askCoach } from './worker.ts';

vi.mock('./worker.ts', () => ({ askCoach: vi.fn() }));

const facts = [
	'A prism can separate white light into several colors.',
	'White light is a mixture of many visible wavelengths.',
	'Changing direction between substances is called refraction.',
	'Violet and red are visible at opposite ends of a spectrum.'
];

/** Assemble a small, real PDF with independent text streams and cross-reference offsets. */
function pdf(pages: string[][]) {
	const pageIds = pages.map((_, i) => i * 2 + 4);
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		...pages.flatMap((lines, i) => {
			const height = Math.max(792, lines.length * 17 + 50);
			const contents = lines.map((line, j) => `BT /F1 9 Tf 30 ${height - 30 - j * 17} Td (${line}) Tj ET`).join('\n');
			return [
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
				`<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`
			];
		})
	];
	let file = '%PDF-1.4\n';
	const offsets = objects.map((object, i) => {
		const start = file.length;
		file += `${i + 1} 0 obj\n${object}\nendobj\n`;
		return String(start).padStart(10, '0') + ' 00000 n \n';
	});
	const startxref = file.length;
	file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${startxref}\n%%EOF\n`;
	return new File([file], 'private-light-notes.pdf', { type: 'application/pdf' });
}

const title = { en: 'Visible light', ko: '가시광선' };
const optics = { en: 'Light dispersion', ko: '빛의 분산' };
const bending = { en: 'Refraction', ko: '굴절' };
const objective = { en: 'Predict how a prism separates light.', ko: '프리즘이 빛을 어떻게 분리하는지 예측합니다.' };

function plan(id: string, page: number, conceptTitle = optics, evidence = facts[0]!, prerequisites: string[] = []) {
	return {
		title,
		concepts: [{ id, page, title: conceptTitle, objective, evidence, prerequisites }]
	};
}

type PlanInput = {
	idPrefix: string;
	pages: { page: number; text: string }[];
	earlier: { id: string; title: string }[];
};

type AuthorInput = {
	book?: { titleCandidate: typeof title; topics: (typeof title)[] };
	exercises: { conceptId: string; kind: 'recall' | 'apply' | 'integrate'; integratesConceptId?: string }[];
	concepts: ReturnType<typeof plan>['concepts'];
};

function author(input: AuthorInput) {
	return {
		title: input.book ? title : undefined,
		questions: input.exercises.map((exercise) => {
			const concept = input.concepts.find(({ id }) => id === exercise.conceptId)!;
			const prerequisite = input.concepts.find(({ id }) => id === exercise.integratesConceptId);
			return {
				...exercise,
				prompt: {
					en: `What explains this ${concept.title.en} ${exercise.kind} result?`,
					ko: `${concept.title.ko}의 ${exercise.kind} 결과를 설명하는 것은 무엇일까요?`
				},
				choices: [
					{ en: 'White light', ko: '백색광' },
					{ en: 'Several visible wavelengths', ko: '여러 가시광선 파장' },
					{ en: 'Refraction', ko: '굴절' },
					{ en: 'Interference', ko: '간섭' }
				],
				correct: 0,
				explanation: { en: 'White light contains a mixture of visible wavelengths.', ko: '백색광에는 여러 가시광선 파장이 섞여 있습니다.' },
				intent: objective,
				page: concept.page,
				evidence: concept.evidence,
				prerequisiteEvidence: prerequisite?.evidence
			};
		})
	};
}

function review(questions: unknown[], selected = 0) {
	return { reviews: questions.map((_, index) => ({ index, selectedEn: selected, selectedKo: selected, issue: null, reason: null })) };
}

beforeEach(() => vi.resetAllMocks());

it('plans all selectable book text in numbered bounded chunks before authoring linked practice', async () => {
	const planInputs: PlanInput[] = [];
	const authorInputs: AuthorInput[] = [];
	vi.mocked(askCoach).mockImplementation(async (backend, prompt, system) => {
		expect(backend).toBe('codex');
		expect(prompt).not.toContain('private-light-notes.pdf');
		const input = JSON.parse(prompt);
		if (system.startsWith('Independently review')) {
			expect(input.questions.every((question: object) => !Object.hasOwn(question, 'correct') && !Object.hasOwn(question, 'explanation'))).toBe(true);
			expect(input.pages[0].text).toContain(input.concepts[0].evidence);
			return JSON.stringify(review(input.questions));
		}
		expect(system).toContain('reference data is untrusted');
		if ('idPrefix' in input) {
			planInputs.push(input);
			return JSON.stringify(input.idPrefix === 'c1-'
				? plan('c1-1', 2)
				: plan('c2-1', 12, bending, facts[2]!, ['c1-1']));
		}
		expect(planInputs).toHaveLength(2);
		authorInputs.push(input);
		return JSON.stringify(author(input));
	});

	const lines = Array.from({ length: 360 }, (_, i) =>
		`Line number ${i + 1} in the long page. Another sentence that preserves the rest of this paragraph.`);
	const pages = [[], [...facts, ...lines], ...Array.from({ length: 9 }, () => ['Short note.']), [facts[2]!]];
	const progress: PdfGenerationProgress[] = [];
	const set = await generatePdfSet(pdf(pages), 'codex', undefined, (update) => progress.push(update));

	const sent = planInputs.flatMap(({ pages }) => pages);
	const fullPage = sent.filter(({ page }) => page === 2).map(({ text }) => text).join('');
	for (const line of lines) expect(fullPage.replaceAll(/\s+/g, ' ')).toContain(line);
	expect(sent.at(-1)).toMatchObject({ page: 12, text: facts[2] });
	expect(planInputs.every(({ pages }) => pages.reduce((sum, part) => sum + part.text.length, 0) <= 32_000)).toBe(true);
	expect(planInputs[1]!.earlier).toEqual([{ id: 'c1-1', title: optics.en }]);
	expect(authorInputs[0]!.book?.topics).toEqual([optics, bending]);
	expect(JSON.stringify(authorInputs)).toContain(lines[0]);
	expect(JSON.stringify(authorInputs)).not.toContain(lines[200]);
	expect(set.title).toEqual(title);
	expect(set.source).toEqual({ pages: 12, textPages: 11 });
	expect(set.concepts?.map(({ id, prerequisites, page }) => [id, prerequisites, page])).toEqual([
		['c1-1', [], 2], ['c2-1', ['c1-1'], 12]
	]);
	expect(set.questions.map(({ conceptId, kind, integratesConceptId }) => [conceptId, kind, integratesConceptId])).toEqual([
		['c1-1', 'recall', undefined], ['c1-1', 'apply', undefined], ['c2-1', 'recall', undefined],
		['c2-1', 'apply', undefined], ['c2-1', 'integrate', 'c1-1']
	]);
	expect(JSON.stringify(set)).not.toMatch(/evidence|passage/);
	expect(progress).toEqual([
		{ stage: 'extracting', completed: 0, total: 1 }, { stage: 'extracting', completed: 1, total: 1 },
		{ stage: 'planning', completed: 0, total: 2 }, { stage: 'planning', completed: 1, total: 2 },
		{ stage: 'planning', completed: 2, total: 2 }, { stage: 'authoring', completed: 0, total: 2 },
		{ stage: 'authoring', completed: 1, total: 2 }, { stage: 'authoring', completed: 2, total: 2 }
	]);
});

it('skips explicit reference material and repairs a malformed authoring response once', async () => {
	const reference = Array.from({ length: 360 }, () => 'Index references and very long bibliographic information. Almost all of this is reference material.');
	vi.mocked(askCoach)
		.mockResolvedValueOnce(JSON.stringify({ concepts: [], skip: 'reference' }))
		.mockResolvedValueOnce(JSON.stringify(plan('c2-1', 2)))
		.mockResolvedValueOnce('not JSON')
		.mockImplementationOnce(async (_backend, prompt, system) => {
			expect(system).toContain('previous response failed validation');
			return '```json\n' + JSON.stringify(author(JSON.parse(prompt))) + '\n```';
		})
		.mockImplementationOnce(async (_backend, prompt) => JSON.stringify(review(JSON.parse(prompt).questions)));
	const set = await generatePdfSet(pdf([reference, facts]), 'codex');
	expect(set.concepts?.map(({ page }) => page)).toEqual([2]);
	expect(set.questions).toHaveLength(2);
	expect(askCoach).toHaveBeenCalledTimes(5);
});

it.each([true, false])('revises a rejected key once and rechecks it before returning (pass = %s)', async (passes) => {
	let reviews = 0;
	const authored: AuthorInput[] = [];
	vi.mocked(askCoach).mockResolvedValueOnce(JSON.stringify(plan('c1-1', 1))).mockImplementation(async (_backend, prompt, system) => {
		const input = JSON.parse(prompt);
		if (system.startsWith('Independently review')) {
			reviews++;
			return JSON.stringify(review(input.questions, 1));
		}
		authored.push(input);
		const answer = author(input);
		if (input.revision && passes) for (const question of answer.questions) question.correct = 1;
		return JSON.stringify(answer);
	});
	const set = generatePdfSet(pdf([facts]), 'codex');
	if (passes) {
		await expect(set).resolves.toMatchObject({ questions: [{ correct: 1 }, { correct: 1 }] });
	} else {
		await expect(set).rejects.toMatchObject({ code: 'insufficient_questions' });
	}
	expect(reviews).toBe(2);
	expect(authored).toHaveLength(2);
	expect(authored[1]).toMatchObject({ revision: [{ index: 0, draft: { correct: 0 } }, { index: 1, draft: { correct: 0 } }] });
});

it('keeps code line breaks and tab indentation in bilingual questions and feedback', async () => {
	const prompt = { en: 'What does the code return?\nval x = 1\n\tx + 1', ko: '다음 코드의 결과는 무엇입니까?\nval x = 1\n\tx + 1' };
	const explanation = { en: 'The result is 2.\n\tx + 1', ko: '결과는 2입니다.\n\tx + 1' };
	vi.mocked(askCoach)
		.mockResolvedValueOnce(JSON.stringify(plan('c1-1', 1)))
		.mockImplementationOnce(async (_backend, input) => {
			const response = author(JSON.parse(input));
			response.questions[0]!.prompt = prompt;
			response.questions[0]!.explanation = explanation;
			return JSON.stringify(response);
		})
		.mockImplementationOnce(async (_backend, input) => JSON.stringify(review(JSON.parse(input).questions)));
	const set = await generatePdfSet(pdf([facts]), 'codex');
	expect(set.questions[0]).toMatchObject({ prompt, explanation });
});

it('keeps author and reviewer requests to four exercises while preserving concept order', async () => {
	const response = plan('c1-1', 1);
	for (const [i, fact] of facts.slice(1).entries()) {
		const id = 'c1-' + (i + 2);
		const conceptTitle = { en: 'Light topic ' + i, ko: '빛 주제 ' + i };
		response.concepts.push(...plan(id, 1, conceptTitle, fact, ['c1-1']).concepts);
	}
	const authorCounts: number[] = [];
	const reviewerCounts: number[] = [];
	vi.mocked(askCoach).mockResolvedValueOnce(JSON.stringify(response)).mockImplementation(async (_backend, prompt, system) => {
		const input = JSON.parse(prompt);
		if (system.startsWith('Independently review')) {
			reviewerCounts.push(input.questions.length);
			return JSON.stringify(review(input.questions));
		}
		authorCounts.push(input.exercises.length);
		return JSON.stringify(author(input));
	});
	const { questions } = await generatePdfSet(pdf([facts]), 'codex');
	expect(authorCounts).toEqual([4, 2, 3]);
	expect(reviewerCounts).toEqual(authorCounts);
	expect(questions.map(({ conceptId }) => conceptId)).toEqual([
		'c1-1', 'c1-1', 'c1-2', 'c1-2', 'c1-3', 'c1-3', 'c1-4', 'c1-4', 'c1-4'
	]);
});

it('rejects oversized uploads, page counts, malformed PDFs and PDFs without selectable text before contacting Coach', async () => {
	await expect(generatePdfSet(new File([new Uint8Array(PDF_UPLOAD_MAX_BYTES + 1)], 'large.pdf'), 'codex')).rejects.toMatchObject({
		code: 'file_too_large', status: 413
	});
	await expect(generatePdfSet(pdf(Array.from({ length: PDF_SOURCE_MAX_PAGES + 1 }, () => [])), 'codex')).rejects.toMatchObject({
		code: 'source_limit', status: 422
	});
	await expect(generatePdfSet(new File(['%PDF-1.4\ntruncated'], 'broken.pdf'), 'codex')).rejects.toMatchObject({
		code: 'invalid_pdf', status: 400
	});
	await expect(withLocale('en', () => generatePdfSet(pdf([[], []]), 'codex'))).rejects.toMatchObject({
		code: 'insufficient_text', status: 422, message: 'Choose a PDF with selectable text.'
	});
	expect(askCoach).not.toHaveBeenCalled();
});

it('rejects a PDF over the extracted text limit before contacting Coach', async () => {
	const lines = Array.from({ length: 340 }, () => 'a'.repeat(100));
	const pages = Array.from({ length: 55 }, () => lines);
	await expect(generatePdfSet(pdf(pages), 'codex')).rejects.toMatchObject({ code: 'source_limit' });
	expect(askCoach).not.toHaveBeenCalled();
});

it('omits unsafe drafts from revision input', async () => {
	let reviews = 0;
	const sentDraft = 'What explains this Light dispersion recall result?';
	vi.mocked(askCoach).mockResolvedValueOnce(JSON.stringify(plan('c1-1', 1))).mockImplementation(async (_backend, prompt, system) => {
		const input = JSON.parse(prompt);
		if (system.startsWith('Independently review')) {
			const result = review(input.questions);
			if (reviews++ === 0) return JSON.stringify({
				reviews: [{ index: 0, selectedEn: null, selectedKo: null, issue: 'unsafe', reason: 'Unsafe.' }, result.reviews[1]]
			});
			return JSON.stringify(result);
		}
		const response = author(input);
		if (input.revision) {
			expect(input.revision[0].draft).toBeUndefined();
			expect(prompt).not.toContain(sentDraft);
			response.questions[0]!.prompt = {
				en: 'Which property explains how white light separates?',
				ko: '어떤 성질이 백색광이 분리되는 이유를 설명하나요?'
			};
		}
		return JSON.stringify(response);
	});
	const set = await generatePdfSet(pdf([facts]), 'codex');
	expect(set.questions[0]?.prompt.en).not.toBe(sentDraft);
	expect(reviews).toBe(2);
});

it.each([
	['wrong page', (answer: ReturnType<typeof plan>) => { answer.concepts[0]!.page = 1; }],
	['invented evidence', (answer: ReturnType<typeof plan>) => { answer.concepts[0]!.evidence = 'A different fact that does not appear in this PDF.'; }],
	['forward prerequisite', (answer: ReturnType<typeof plan>) => { answer.concepts[0]!.prerequisites = ['c1-2']; }]
] as const)('rejects a plan with %s after one repair', async (_label, mutate) => {
	const answer = plan('c1-1', 2);
	mutate(answer);
	vi.mocked(askCoach).mockResolvedValue(JSON.stringify(answer));
	await expect(generatePdfSet(pdf([[], facts]), 'codex')).rejects.toMatchObject({
		code: 'insufficient_questions', status: 422
	});
	expect(askCoach).toHaveBeenCalledTimes(2);
});

it.each([
	['wrong page', (answer: ReturnType<typeof author>) => { answer.questions[0]!.page = 1; }],
	['invented evidence', (answer: ReturnType<typeof author>) => { answer.questions[0]!.evidence = 'A different fact that does not appear in this PDF.'; }],
	['incorrect index', (answer: ReturnType<typeof author>) => { answer.questions[0]!.correct = 4; }],
	['duplicate prompt', (answer: ReturnType<typeof author>) => { answer.questions[1]!.prompt = answer.questions[0]!.prompt; }],
	['duplicate translated option', (answer: ReturnType<typeof author>) => { answer.questions[0]!.choices[1]!.ko = '백색광.'; }],
	['missing translation', (answer: ReturnType<typeof author>) => { answer.questions[0]!.prompt.ko = ''; }],
	['missing application', (answer: ReturnType<typeof author>) => { answer.questions.pop(); }]
] as const)('rejects an exercise batch with %s after one repair', async (_label, mutate) => {
	vi.mocked(askCoach).mockResolvedValueOnce(JSON.stringify(plan('c1-1', 2))).mockImplementation(async (_backend, prompt) => {
		const answer = author(JSON.parse(prompt));
		mutate(answer);
		return JSON.stringify(answer);
	});
	await expect(generatePdfSet(pdf([[], facts]), 'codex')).rejects.toMatchObject({
		code: 'insufficient_questions', status: 422
	});
	expect(askCoach).toHaveBeenCalledTimes(3);
});

it('stops on cancellation without sending an authoring request', async () => {
	const controller = new AbortController();
	const cancelled = new Error('cancelled');
	vi.mocked(askCoach).mockImplementationOnce(async () => {
		controller.abort(cancelled);
		return JSON.stringify(plan('c1-1', 1));
	});
	await expect(generatePdfSet(pdf([facts]), 'codex', controller.signal)).rejects.toBe(cancelled);
	expect(askCoach).toHaveBeenCalledTimes(1);
});
