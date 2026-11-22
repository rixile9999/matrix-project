import { error } from '@sveltejs/kit';
import * as s from '#lib/server/service.ts';
import type { AttemptData } from '#lib/types.ts';

export const load = async ({ params }): Promise<AttemptData> => {
	const attempt = s.getAttempt(Number(params.id));
	if (!attempt) error(404, 'Attempt not found');
	return { attempt, now: s.now() };
};

export const actions = {
	giveUp: async ({ params }) => {
		s.giveUp(Number(params.id));
		return {};
	}
};
