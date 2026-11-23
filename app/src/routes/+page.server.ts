import { fail, redirect } from '@sveltejs/kit';
import * as s from '#lib/server/service.ts';
import { dueTotal } from '#lib/server/memo.ts';
import type { HomeData } from '#lib/types.ts';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const load = async (): Promise<HomeData> => {
	const active = s.getActiveAttemptId();
	if (active !== null) redirect(303, `/attempt/${active}`);
	const handle = s.getSetting('handle');
	const cfRating = s.getSetting('cf_rating');
	const last = s.getSetting('last_sync_at');
	return {
		memoDue: dueTotal(),
		handle,
		problemCount: s.problemCount(),
		lastSyncAt: last === null ? null : Number(last),
		rating: s.ratingState().rating,
		cfRating: cfRating === null ? null : Number(cfRating),
		offers: s.buildOffers(),
		recent: s.recentAttempts(5)
	};
};

export const actions = {
	setHandle: async ({ request }) => {
		const f = await request.formData();
		const raw = String(f.get('initialRating') ?? '').trim();
		const initial = raw === '' ? null : Number(raw);
		if (initial !== null && !Number.isFinite(initial)) return fail(400, { error: '초기 레이팅이 올바르지 않습니다.' });
		try {
			await s.setHandle(String(f.get('handle') ?? ''), initial);
		} catch (e) {
			return fail(400, { error: msg(e) });
		}
		return {};
	},
	sync: async () => {
		try {
			await s.sync();
		} catch (e) {
			return fail(502, { error: msg(e) });
		}
		return {};
	},
	start: async ({ request }) => {
		const f = await request.formData();
		let id: number;
		try {
			id = s.startAttempt(String(f.get('mode') ?? ''), String(f.get('problemId') ?? ''));
		} catch (e) {
			return fail(400, { error: msg(e) });
		}
		redirect(303, `/attempt/${id}`);
	}
};
