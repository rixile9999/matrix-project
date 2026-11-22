import { error, json } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import { loadProblem } from '#lib/server/judge.ts';
import type { LangHintResponse } from '#lib/types.ts';

export const POST = async ({ params }) => {
	if (!loadProblem('scala', params.id)) error(404, 'Problem not found');
	try {
		return json(l.useHint(params.id) satisfies Omit<LangHintResponse, 'error'>);
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
	}
};
