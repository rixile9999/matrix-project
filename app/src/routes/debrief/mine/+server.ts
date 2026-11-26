import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { saveMine } from '#lib/server/debrief.ts';

export const POST = async ({ request }) => {
	const b = await readJson(request);
	const r = saveMine(b.pattern, b.text);
	return json(r, { status: 'error' in r ? 400 : 200 });
};
