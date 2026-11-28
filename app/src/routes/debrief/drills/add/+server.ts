import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { setDrillState } from '#lib/server/drill.ts';

export const POST = async ({ request }) => {
	const body = await readJson(request);
	const r = setDrillState(body.id, body.drop);
	return json(r, { status: 'error' in r ? 400 : 200 });
};
