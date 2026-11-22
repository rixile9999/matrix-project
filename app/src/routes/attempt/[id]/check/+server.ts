import { json } from '@sveltejs/kit';
import * as s from '#lib/server/service.ts';
import type { CheckResponse } from '#lib/types.ts';

export const POST = async ({ params }) => {
	try {
		const r = await s.resolveAttempt(Number(params.id));
		return json({ resolved: r.resolved, outcome: r.outcome } satisfies CheckResponse);
	} catch (e) {
		return json({ resolved: false, outcome: null, error: e instanceof Error ? e.message : String(e) } satisfies CheckResponse);
	}
};
