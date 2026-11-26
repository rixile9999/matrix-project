import { redirect } from '@sveltejs/kit';
import { revoke } from '#lib/server/auth.ts';
export const POST = ({cookies}) => {
	revoke(cookies.get('matrix_session'));
	cookies.delete('matrix_session',{path:'/'});
	redirect(303,'/login');
};
