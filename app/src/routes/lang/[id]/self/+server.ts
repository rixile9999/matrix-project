import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { recordSelf } from '#lib/server/debrief.ts';

/** The optional one-tap self report after a finished session. */
export const POST = async ({ params, request }) => {
	const b = await readJson(request);
	return json({ recorded: recordSelf(params.id, b.sessionId, b.state) });
};
