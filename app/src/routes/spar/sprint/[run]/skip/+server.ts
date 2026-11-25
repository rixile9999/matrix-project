import { error, json } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import { readJson } from '#lib/server/memo.ts';
import type { SparSprintSkipResponse } from '#lib/types.ts';

export const POST = async ({ params, request }) => {
	const run = s.findRun(params.run, 'sprint');
	if (!run) error(404, 'Run not found');
	const b = await readJson(request);
	try {
		return json(s.sprintSkip(run.id, b.problemId) satisfies SparSprintSkipResponse);
	} catch (e) {
		const f = s.failure(e);
		return json(f.body, { status: f.status });
	}
};
