import { fail, redirect } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import type { SparHomeData } from '#lib/types.ts';

export const load = async (): Promise<SparHomeData> => s.homeData();

/** Starting while a run is active redirects to that run; not enough material -> 409 { error }. */
const starter = (start: () => { id: number; kind: 'sprint' | 'recall' }) => async () => {
	let run;
	try {
		run = start();
	} catch (e) {
		const f = s.failure(e);
		return fail(f.status, { error: f.message });
	}
	redirect(303, `/spar/${run.kind}/${run.id}`);
};

export const actions = { startSprint: starter(s.startSprint), startRecall: starter(s.startRecall) };
