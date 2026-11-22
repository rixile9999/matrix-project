import { error, fail, redirect } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { loadProblem } from '#lib/server/judge.ts';
import type { LangSessionData } from '#lib/types.ts';

export const load = async ({ params }): Promise<LangSessionData> => {
	if (!loadProblem('scala', params.id)) error(404, 'Problem not found');
	const view = l.sessionView(params.id);
	if (!view) redirect(303, '/lang');
	return view;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const actions = {
	restart: async ({ params }) => {
		try {
			l.restartSession(params.id);
		} catch (e) {
			return fail(400, { error: msg(e) });
		}
		return {};
	},
	reveal: async ({ params }) => {
		try {
			l.revealSolution(params.id);
		} catch (e) {
			return fail(400, { error: msg(e) });
		}
		return {};
	}
};
