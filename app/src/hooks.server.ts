import { parseLocale } from './lib/locale.ts';
import { withLocale } from './lib/server/locale.ts';
import { accountFor } from './lib/server/auth.ts';
import { withAccount } from './lib/server/db.ts';
import type { Handle } from '@sveltejs/kit/hooks';

// Retain the private-network origin gate in addition to session authentication.
const PRIVATE_HOST =
	/^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+|[\w-]+\.local|[\w.-]+\.ts\.net|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/;

export function sameOriginPrivate(origin: string | null, host: string | null): boolean {
	if (!origin || !host) return false;
	try {
		const o = new URL(origin);
		return o.host === host && PRIVATE_HOST.test(o.hostname);
	} catch {
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const { method, headers } = event.request;
	const locale = parseLocale(event.cookies.get('matrix_locale'));
	event.locals.locale = locale;
	const render = () => withLocale(locale, () => resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="%matrix.locale%"', `<html lang="${locale}"`)
	}));
	const configured = (process.env.MATRIX_ALLOWED_ORIGINS || process.env.ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
	const acceptedOrigin = configured.length ? configured.includes(event.url.origin) : sameOriginPrivate(event.url.origin,event.url.host);
	if (!acceptedOrigin) return new Response(locale === 'ko' ? '등록되지 않은 접속 주소입니다.' : 'This address is not registered.', {status:403});
	if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
		if (headers.get('origin') !== event.url.origin) {
			return new Response(locale === 'ko' ? '다른 사이트에서 온 요청이라 거부했습니다.' : 'Cross-site request rejected.', { status: 403 });
		}
	}
	if (event.route.id === '/login' || event.route.id === '/signup' || event.route.id === '/locale') {
		const response = await render();
		response.headers.set('cache-control', 'private, no-store');
		return response;
	}
	const user = accountFor(event.cookies.get('matrix_session'));
	if (!user) {
		if (method === 'GET' && headers.get('accept')?.includes('text/html')) return new Response(null, {status:303, headers:{location:'/login', 'cache-control':'no-store'}});
		return new Response(locale === 'ko' ? '로그인이 필요합니다.' : 'Please sign in.', {status:401, headers:{'cache-control':'no-store'}});
	}
	event.locals.user = user;
	const response = await withAccount(user.id, render);
	response.headers.set('cache-control','private, no-store');
	return response;
};
