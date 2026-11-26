import { withLocale } from '#lib/server/locale.ts';
import { contentText } from '#lib/server/content-language.ts';
import { WorkerUnavailable } from '#lib/server/worker.ts';
import { error, json } from '@sveltejs/kit';
import * as m from '#lib/server/memo.ts';
import type { MemoCheckResponse } from '#lib/types.ts';

export const POST = async ({ request, locals }) => {
	const b = await m.readJson(request);
	let r: MemoCheckResponse | null;
	try {
		r = await withLocale('ko', () => m.answerCheck(b.id, b.choice, b.elapsedMs));
	} catch (e) {
		error(e instanceof WorkerUnavailable ? 503 : 400, e instanceof Error ? e.message : 'Bad request');
	}
	if (!r) error(404, 'Check not found');
	const feedback = r;
	const en = withLocale('en', () => ({
		...feedback,
		message: feedback.message && contentText(feedback.message),
		why: feedback.why && contentText(feedback.why),
		whys: feedback.whys.map(contentText)
	}));
	return json({ ...(locals.locale === 'en' ? en : feedback), ko: feedback, en });
};
