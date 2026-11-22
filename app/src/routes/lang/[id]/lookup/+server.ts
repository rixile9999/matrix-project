import { error, json } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { loadProblem } from '#lib/server/judge.ts';
import type { LangLookupResponse } from '#lib/types.ts';

/** Lookups on a finished or missing session, malformed bodies and unknown entries are ignored silently ({ recorded: false }). */
export const POST = async ({ params, request }) => {
	if (!loadProblem('scala', params.id)) error(404, 'Problem not found');
	let entryId: unknown;
	try {
		entryId = ((await request.json()) as { entryId?: unknown } | null)?.entryId;
	} catch {
		return json({ recorded: false } satisfies LangLookupResponse);
	}
	return json({ recorded: l.recordLookup(params.id, entryId) } satisfies LangLookupResponse);
};
