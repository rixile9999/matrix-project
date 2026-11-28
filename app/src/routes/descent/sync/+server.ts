import { json } from '@sveltejs/kit';
import { sync } from '#lib/server/descent.ts';

/** Observes the top problem's records after a run, hint, reveal or the clock passing the limit; may start a coach turn. */
export const POST = async () => {
	const r = await sync();
	return json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });
};
