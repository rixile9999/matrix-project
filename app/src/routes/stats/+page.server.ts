import { fail, redirect } from '@sveltejs/kit';
import { courseView, findLesson, startRun } from '#lib/server/stats.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => courseView();

export const actions: Actions = {
	start: async ({ request }) => {
		const form = await request.formData();
		const lesson = findLesson(String(form.get('lessonId') ?? ''));
		if (!lesson) return fail(404, { error: 'unavailable' as const });
		redirect(303, `/stats/${lesson.id}?run=${startRun(lesson)}`);
	}
};
