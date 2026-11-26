import { fail, redirect } from '@sveltejs/kit';
import { register } from '#lib/server/auth.ts';
import { secureAccountOrigin, setAccountSession } from '#lib/server/account-session.ts';


export const actions = {
	default: async ({request, cookies, url, getClientAddress}) => {
		if (!secureAccountOrigin(url)) return fail(403, { name: '', error: '다른 기기에서는 HTTPS 주소로 가입하세요.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (password !== form.get('confirm')) return fail(400, { name, error: '두 비밀번호가 일치하지 않습니다.' });
		const result = await register(name, password, getClientAddress());
		if (result.status !== undefined) return fail(result.status, { name, error: result.error });
		setAccountSession(cookies, url, result.token);
		redirect(303, '/');
	}
};
