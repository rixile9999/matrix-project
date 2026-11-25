import { error, redirect } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import type { SparRecallData } from '#lib/types.ts';

export const load = async ({ params }): Promise<SparRecallData> => {
	const run = s.findRun(params.run, 'recall');
	if (!run) error(404, 'Run not found');
	const view = s.recallScreen(run.id);
	if (!view) redirect(303, `/spar/run/${run.id}`);
	return view;
};
