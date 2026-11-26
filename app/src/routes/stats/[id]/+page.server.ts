import { error, fail, redirect } from '@sveltejs/kit';
import { tr } from '#lib/server/locale.ts';
import { act, findLesson, runView, startRun } from '#lib/server/stats.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function lessonFor({ params }: RequestEvent) {
	const lesson = findLesson(params.id);
	if (!lesson) error(404, tr('문제를 찾을 수 없습니다.', 'Lesson not found.'));
	return lesson;
}

function runId({ url }: RequestEvent) {
	const id = Number(url.searchParams.get('run'));
	if (!Number.isSafeInteger(id) || id <= 0) redirect(303, '/stats');
	return id;
}

export const load: PageServerLoad = (event) => {
	const view = runView(lessonFor(event), runId(event));
	if (!view) redirect(303, '/stats');
	return view;
};

function apply(operation: Parameters<typeof act>[2]) {
	return async (event: RequestEvent) => {
		const lesson = lessonFor(event);
		const id = runId(event);
		const form = await event.request.formData();
		const values = lesson.fields.map((_, index) => String(form.get(`answer${index}`) ?? '').trim().slice(0, 80));
		const result = act(lesson, id, operation, operation === 'check' ? values : []);
		if (result) return fail(result === 'unavailable' ? 404 : 400, { error: result, values });
		return { error: null, values, showReference: operation === 'reference' };
	};
}

export const actions: Actions = {
	check: apply('check'),
	hint: apply('hint'),
	reference: apply('reference'),
	reveal: apply('reveal'),
	restart: (event) => {
		const lesson = lessonFor(event);
		redirect(303, `/stats/${lesson.id}?run=${startRun(lesson)}`);
	}
};
