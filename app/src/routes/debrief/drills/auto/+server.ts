import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { setDrillAuto } from '#lib/server/drill.ts';

export const POST = async ({ request }) => {
	const r = setDrillAuto((await readJson(request)).on);
	return json(r, { status: 'error' in r ? 400 : 200 });
};
