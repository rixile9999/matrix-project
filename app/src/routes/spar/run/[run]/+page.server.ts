import { error, redirect } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import type { SparRunData } from '#lib/types.ts';

export const load = async ({ params }): Promise<SparRunData> => {
	const run = s.findAnyRun(params.run);
	if (!run) error(404, 'Run not found');
	const detail = s.runDetail(run.id);
	if (!detail) error(404, 'Run not found');
	if (detail === 'running') redirect(303, `/spar/${run.kind}/${run.id}`);
	return { detail };
};
