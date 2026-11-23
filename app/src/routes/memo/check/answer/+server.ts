import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import type { MemoCheckResponse } from '#lib/types.ts';

export const POST = async ({ request }) => {
	const b = await m.readJson(request);
	let r: MemoCheckResponse | null;
	try {
		r = await m.answerCheck(b.id, b.choice, b.elapsedMs);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Bad request');
	}
	if (!r) error(404, 'Check not found');
	return json(r);
};
