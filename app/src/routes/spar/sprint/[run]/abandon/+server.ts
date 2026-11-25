import { error, json } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import type { SparAbandonResponse } from '#lib/types.ts';

export const POST = async ({ params }) => {
	const run = s.findRun(params.run, 'sprint');
	if (!run) error(404, 'Run not found');
	return json(s.abandon(run.id) satisfies SparAbandonResponse);
};
