import type { Cookies } from '@sveltejs/kit';
import { revoke, sessionAge } from './auth.ts';

export function secureAccountOrigin(url: URL) {
	return url.protocol === 'https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
}

export function setAccountSession(cookies: Cookies, url: URL, token: string) {
	revoke(cookies.get('matrix_session'));
	cookies.set('matrix_session', token, {
		path:'/', httpOnly:true, sameSite:'lax', secure:url.protocol === 'https:', maxAge:sessionAge
	});
}
