import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const form = await request.formData();
	const locale = form.get('locale');
	if (locale !== 'en' && locale !== 'ko') error(400, 'Choose English or 한국어.');
	cookies.set('matrix_locale', locale, {
		path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: url.protocol === 'https:'
	});
	if (request.headers.get('accept') === 'application/json') return new Response(null, { status: 204 });
	const next = URL.parse(String(form.get('next') || '/'), url.origin);
	if (!next) redirect(303, '/');
	redirect(303, next.origin === url.origin && !next.pathname.startsWith('//') ? next.pathname + next.search : '/');
};
