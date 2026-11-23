import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import type { MemoAnswerResponse } from '#lib/types.ts';

export const POST = async ({ request }) => {
	const b = await m.readJson(request);
	let r: MemoAnswerResponse | null;
	try {
		r = m.answerCard(b.id, b.ticked, b.elapsedMs);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Bad request');
	}
	if (!r) error(404, 'Card not found');
	return json(r);
};
