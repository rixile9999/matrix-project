import { tr } from '#lib/server/locale.ts';
import { secureAccountOrigin, setAccountSession } from '#lib/server/account-session.ts';
import { fail, redirect } from '@sveltejs/kit';
import { login } from '#lib/server/auth.ts';

export const actions = {
	default: async ({request, cookies, url, getClientAddress}) => {
		const data = await request.formData();
		if (!secureAccountOrigin(url)) return fail(403, { error: tr('다른 기기에서는 HTTPS 주소로 로그인하세요.', 'Use HTTPS to sign in from another device.') });
		const token = await login(String(data.get('name') ?? '').trim(), String(data.get('password') ?? ''), getClientAddress());
		if (!token) return fail(401, { error: tr('로그인할 수 없습니다. 입력을 확인하거나 잠시 후 다시 시도하세요.', 'Could not sign in. Check your details or try again shortly.') });
		setAccountSession(cookies, url, token);
		redirect(303, '/');
	}
};
