import { error, fail, redirect } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import type { LangBookData } from '#lib/types.ts';

export const load = async ({ params }): Promise<LangBookData> => l.bookView(params.book) ?? error(404, 'Book not found');

export const actions = {
	start: async ({ request }) => {
		const id = String((await request.formData()).get('problemId') ?? '');
		try {
			l.startSession(id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
		redirect(303, `/lang/${id}`);
	}
};
