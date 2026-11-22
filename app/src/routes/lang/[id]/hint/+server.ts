import { error, json } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { loadProblem } from '#lib/server/judge.ts';

export const POST = async ({ params }) => {
	if (!loadProblem('scala', params.id)) error(404, 'Problem not found');
	try {
		return json({ hints: l.useHint(params.id) });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
	}
};
