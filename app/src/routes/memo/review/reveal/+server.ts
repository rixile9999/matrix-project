import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import type { MemoRevealResponse } from '#lib/types.ts';

export const POST = async ({ request }) => {
	const r = m.revealCard((await m.readJson(request)).id);
	if (!r) error(404, 'Card not found');
	return json(r satisfies MemoRevealResponse);
};
