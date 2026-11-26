import { WorkerUnavailable } from '#lib/server/worker.ts';
import { error, json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { verifyMessage } from '#lib/server/coach.ts';

export const POST = async ({ request }) => {
	const b = await readJson(request);
	const r = await verifyMessage(b.messageId, b.block).catch(e => {
		if (e instanceof WorkerUnavailable) error(503,e.message);
		throw e;
	});
	if (!r) return json({ error: '검증할 trace 블록을 찾을 수 없습니다.' }, { status: 404 });
	return json(r);
};
