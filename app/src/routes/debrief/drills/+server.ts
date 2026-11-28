import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { startDrills } from '#lib/server/drill.ts';

/** Starts a background generation job for a note (one at a time per account). */
export const POST = async ({ request }) => {
	const body = await readJson(request);
	const r = startDrills(body.pattern, body.backend);
	return json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
};
