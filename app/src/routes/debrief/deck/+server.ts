import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { addToDeck } from '#lib/server/debrief.ts';

export const POST = async ({ request }) => {
	const r = addToDeck((await readJson(request)).pattern);
	return json(r, { status: 'error' in r ? 400 : 200 });
};
