import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import type { MemoRevealResponse } from '#lib/types.ts';

export const POST = async ({ request }) => {
	const body = await m.readJson(request);
	const r = m.revealCard(body.id, body.elapsedMs);
	if (!r) error(404, 'Card not found');
	return json(r satisfies MemoRevealResponse);
};
