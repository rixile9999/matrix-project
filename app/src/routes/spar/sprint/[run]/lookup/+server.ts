import { error, json } from '@sveltejs/kit';
import * as s from '#lib/server/spar.ts';
import { readJson } from '#lib/server/memo.ts';
import type { LangLookupResponse } from '#lib/types.ts';

/** Unknown entries, malformed bodies and runs that are not running are ignored silently ({ recorded: false }). */
export const POST = async ({ params, request }) => {
	const run = s.findRun(params.run, 'sprint');
	if (!run) error(404, 'Run not found');
	const b = await readJson(request);
	return json({ recorded: s.sprintLookup(run.id, b.entryId) } satisfies LangLookupResponse);
};
