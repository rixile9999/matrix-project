import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { startAsk } from '#lib/server/coach.ts';

export const POST = async ({ request }) => {
	const r = startAsk(await readJson(request), request.signal);
	if ('error' in r) return json({ error: r.error }, { status: r.status });
	return new Response(r.stream, {
		headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }
	});
};
