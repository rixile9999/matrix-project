import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';

export const POST = async ({ request }) => {
	const r = m.checkSolution((await m.readJson(request)).id);
	if (!r) error(404, 'Check not found');
	if (r === 'forbidden') error(403, '먼저 답을 제출하세요.');
	return json(r);
};
