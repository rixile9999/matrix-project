import { error, redirect } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import type { SparSprintData } from '#lib/types.ts';

export const load = async ({ params }): Promise<SparSprintData> => {
	const run = s.findRun(params.run, 'sprint');
	if (!run) error(404, 'Run not found');
	const view = s.sprintView(run.id);
	if (view.status !== 'running') redirect(303, `/spar/run/${run.id}`);
	return view;
};
