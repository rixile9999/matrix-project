import { error, fail, redirect } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { sessionCard } from '#lib/server/debrief.ts';
import type { LangSessionData } from '#lib/types.ts';

export const load = async ({ params }): Promise<LangSessionData> => {
	if (!l.findProblem(params.id)) error(404, 'Problem not found');
	const view = l.sessionView(params.id);
	if (!view) redirect(303, '/lang');
	return { ...view, debrief: view.session.finished ? sessionCard(view.session.id) : null };
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
