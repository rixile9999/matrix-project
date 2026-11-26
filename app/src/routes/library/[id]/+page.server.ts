import { error, fail, redirect } from '@sveltejs/kit';
import { tr } from '#lib/server/locale.ts';
import { answerPdfQuestion, pdfPracticeView } from '#lib/server/pdf-sets.ts';
import type { Actions, PageServerLoad } from './$types';

function missing(): never {
	error(404, tr('문제집 또는 문항을 찾을 수 없습니다.', 'Practice set or question not found.'));
}

function questionIndex(url: URL): number | null {
	const question = url.searchParams.get('question');
	if (question === null) return null;
	if (!/^[1-9]\d*$/.test(question) || !Number.isSafeInteger(Number(question))) missing();
	return Number(question) - 1;
}

export const load: PageServerLoad = ({ params, url, locals, depends }) => {
	depends('matrix:locale');
	const view = pdfPracticeView(params.id, questionIndex(url), locals.locale);
	if (!view) missing();
	return view;
};

export const actions = {
	answer: async ({ params, url, request }) => {
		const index = questionIndex(url);
		if (index === null) missing();
		const answer = (await request.formData()).get('answer');
		const selected = typeof answer === 'string' && /^\d+$/.test(answer) ? Number(answer) : Number.NaN;
		const result = answerPdfQuestion(params.id, index, selected);
		if (result === 'missing') missing();
		if (result === 'invalid') return fail(400, { error: 'invalid' as const });
		if (result === 'unopened') return fail(409, { error: 'unopened' as const });
		redirect(303, `/library/${params.id}?question=${index + 1}`);
	}
} satisfies Actions;
