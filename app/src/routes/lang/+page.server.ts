import { fail, redirect } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { redoProblems } from '#lib/server/memo.ts';
import type { LangHomeData, MemoRedo } from '#lib/types.ts';

/** `redo`: problems whose 풀이 과정 card failed twice in a row (see /memo). */
export const load = async (): Promise<LangHomeData & { redo: MemoRedo[] }> => ({ ...l.listView(), redo: redoProblems() });

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
