import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import { bothLanguages } from '#lib/server/locale.ts';

export const POST = async ({ request, locals }) => {
	const body = await m.readJson(request);
	const r = bothLanguages(() => m.revealCard(body.id, body.elapsedMs));
	if (!r.en || !r.ko) error(404, 'Card not found');
	return json({ ...r[locals.locale], ...r });
};
