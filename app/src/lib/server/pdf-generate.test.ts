import { beforeEach, expect, it, vi } from 'vitest';
import { PDF_UPLOAD_MAX_BYTES } from '#lib/pdf-sets.ts';
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
			const contents = lines.map((line, j) => `BT /F1 12 Tf 30 ${742 - j * 17} Td (${line}) Tj ET`).join('\n');
			return [
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
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

function response() {
	return {
		title: { en: 'Visible light', ko: '가시광선' },
		questions: [
			{
				prompt: { en: 'What can a prism separate into colors?', ko: '프리즘은 무엇을 여러 색으로 분리할 수 있나요?' },
				explanation: { en: 'A prism can separate white light into different colors.', ko: '프리즘은 백색광을 여러 색으로 분리할 수 있습니다.' },
				page: 2, correct: 0, evidence: facts[0]!
			},
			{
				prompt: { en: 'What forms white light?', ko: '백색광은 무엇으로 이루어져 있나요?' },
				explanation: { en: 'White light contains a mixture of visible wavelengths.', ko: '백색광에는 여러 가시광선 파장이 섞여 있습니다.' },
				page: 2, correct: 1, evidence: facts[1]!
			},
			{
				prompt: { en: 'What happens as light bends between substances?', ko: '빛이 물질 사이에서 방향을 바꿀 때 어떤 현상이 일어나나요?' },
				explanation: { en: 'Refraction is a change in direction between substances.', ko: '굴절은 물질 사이에서 빛의 방향이 바뀌는 현상입니다.' },
				page: 2, correct: 2, evidence: facts[2]!
			}
		].map((question) => ({
			...question,
			choices: [
				{ en: 'White light', ko: '백색광' },
				{ en: 'Several visible wavelengths', ko: '여러 가시광선 파장' },
				{ en: 'Refraction', ko: '굴절' },
				{ en: 'Interference', ko: '간섭' }
			]
		}))
	};
}

beforeEach(() => vi.resetAllMocks());

it('sends bounded, numbered text pages through Coach and strips evidence from the checked set', async () => {
	const answer = response();
	vi.mocked(askCoach).mockResolvedValue(JSON.stringify(answer));
	const pages = [[], facts, ...Array.from({ length: 8 }, () => ['Other information.']), ['Page eleven marker.']];

	const set = await generatePdfSet(pdf(pages), 'codex');
	expect(set.questions.map(({ page, correct }) => [page, correct])).toEqual([[2, 0], [2, 1], [2, 2]]);
	expect(set.title).toEqual(answer.title);
	expect(set.questions.every((question) => !Object.hasOwn(question, 'evidence'))).toBe(true);
	const [backend, prompt, system] = vi.mocked(askCoach).mock.calls[0]!;
	expect(backend).toBe('codex');
	expect(prompt).not.toContain('private-light-notes.pdf');
	expect(prompt).not.toContain('Page eleven marker.');
	expect(JSON.parse(prompt).pages.map(({ page }: { page: number }) => page)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
	expect(JSON.parse(prompt).pages[0].text).toContain(facts[0]);
	expect(system).toContain('untrusted reference data');
});

it('rejects oversized uploads, malformed PDFs and PDFs without selectable text before contacting Coach', async () => {
	await expect(generatePdfSet(new File([new Uint8Array(PDF_UPLOAD_MAX_BYTES + 1)], 'large.pdf'), 'codex')).rejects.toMatchObject({
		code: 'file_too_large', status: 413
	});
	await expect(generatePdfSet(new File(['%PDF-1.4\ntruncated'], 'broken.pdf'), 'codex')).rejects.toMatchObject({
		code: 'invalid_pdf', status: 400
	});
	await expect(withLocale('en', () => generatePdfSet(pdf([[], []]), 'codex'))).rejects.toMatchObject({
		code: 'insufficient_text', status: 422, message: 'Choose a PDF with selectable text in its first ten pages.'
	});
	expect(askCoach).not.toHaveBeenCalled();
});

it.each([
	['wrong page', (answer: ReturnType<typeof response>) => { answer.questions[0]!.page = 1; }],
	['invented evidence', (answer: ReturnType<typeof response>) => { answer.questions[0]!.evidence = 'A different fact that does not appear in this PDF.'; }],
	['incorrect index', (answer: ReturnType<typeof response>) => { answer.questions[0]!.correct = 4; }],
	['duplicate prompt', (answer: ReturnType<typeof response>) => { answer.questions[1]!.prompt = answer.questions[0]!.prompt; }],
	['duplicate translated option', (answer: ReturnType<typeof response>) => { answer.questions[0]!.choices[1]!.ko = '백색광.'; }],
	['missing translation', (answer: ReturnType<typeof response>) => { answer.questions[0]!.prompt.ko = ''; }],
	['too few questions', (answer: ReturnType<typeof response>) => { answer.questions.pop(); }]
] as const)('rejects a response with %s', async (_label, mutate) => {
	const answer = response();
	mutate(answer);
	vi.mocked(askCoach).mockResolvedValue(JSON.stringify(answer));
	await expect(generatePdfSet(pdf([['Unrelated first page.'], facts]), 'codex')).rejects.toMatchObject({
		code: 'insufficient_questions', status: 422
	});
});
