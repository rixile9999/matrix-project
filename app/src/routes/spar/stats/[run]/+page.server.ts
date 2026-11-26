import { error, fail } from '@sveltejs/kit';
import { tr } from '#lib/server/locale.ts';
import { actOnStatsRound, statsRoundView, type RoundOperation } from '#lib/server/spar-stats.ts';
import type { Actions, PageServerLoad } from './$types';

function roundId(param: string) {
	if (!/^\d{1,9}$/.test(param)) error(404, tr('기록을 찾을 수 없습니다.', 'Round not found.'));
	return Number(param);
}

export const load: PageServerLoad = ({ params }) => {
	const round = statsRoundView(roundId(params.run));
	if (!round) error(404, tr('기록을 찾을 수 없습니다.', 'Round not found.'));
	return round;
};

function apply(operation: RoundOperation) {
	return async ({ params, request }: Parameters<Actions[string]>[0]) => {
		const form = await request.formData();
		const runId = Number(form.get('runId'));
		const values = form.getAll('answer').map((value) => String(value).trim().slice(0, 80));
		const code = actOnStatsRound(roundId(params.run), runId, operation, values);
		const response = { code, runId, values };
		if (code) return fail(code === 'unavailable' ? 404 : code === 'moved' ? 409 : 400, response);
		return response;
	};
}

export const actions: Actions = {
	check: apply('check'),
	hint: apply('hint'),
	reference: apply('reference'),
	next: apply('next'),
	abandon: apply('abandon')
};
