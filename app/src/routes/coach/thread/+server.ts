import { tr } from '#lib/server/locale.ts';
import { json } from '@sveltejs/kit';
import { threadView } from '#lib/server/coach.ts';
import { isCoachKind, isCoachRunId } from '#lib/core/coach.ts';

export const GET = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	const id = url.searchParams.get('id');
	const run = url.searchParams.get('run');
	const runId = run && /^[1-9]\d*$/.test(run) ? Number(run) : undefined;
	if (!isCoachKind(kind) || !id || (kind === 'stats' && !isCoachRunId(runId))) {
		return json({ error: tr('질문할 대상이 올바르지 않습니다.', 'Invalid coaching context.') }, { status: 400 });
	}
	const view = await threadView(kind, id, runId);
	if (!view) return json({ error: tr('대상을 찾을 수 없습니다.', 'Context not found.') }, { status: 404 });
	return json(view, { headers: { 'cache-control': 'no-store' } });
};
