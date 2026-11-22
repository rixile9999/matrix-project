import { fail, redirect } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import type { LangHomeData } from '#lib/types.ts';

export const load = async (): Promise<LangHomeData> => l.listView();

export const actions = {
	start: async ({ request }) => {
		const f = await request.formData();
		const id = String(f.get('problemId') ?? '');
		try {
			l.startSession(id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : String(e) });
		}
		redirect(303, `/lang/${id}`);
	}
};
