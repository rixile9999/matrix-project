import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { turn } from '#lib/server/descent.ts';

/** The learner says something or answers the open offer; the coach replies (409 while a turn runs). */
export const POST = async ({ request }) => {
	const r = await turn(await readJson(request));
	return json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
};
