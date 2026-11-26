import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { createReading } from '#lib/server/debrief.ts';

/** Coaching on request (a button; never automatic: it costs tokens). */
export const POST = async ({ request }) => {
	const r = await createReading((await readJson(request)).backend);
	return json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
};
