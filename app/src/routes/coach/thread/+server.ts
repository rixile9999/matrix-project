import { json } from '@sveltejs/kit';
import { threadView } from '#lib/server/coach.ts';

export const GET = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	const id = url.searchParams.get('id');
	if ((kind !== 'lang' && kind !== 'memo') || !id) return json({ error: 'kind(lang|memo)와 id가 필요합니다.' }, { status: 400 });
	const view = await threadView(kind, id);
	if (!view) return json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 });
	return json(view, { headers: { 'cache-control': 'no-store' } });
};
