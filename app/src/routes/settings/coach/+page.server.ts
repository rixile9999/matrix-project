import {fail} from '@sveltejs/kit';
import {coachStatus,setCoachKey} from '#lib/server/worker.ts';
import {BACKENDS,type BackendId} from '#lib/core/coach.ts';
import {secureAccountOrigin} from '#lib/server/account-session.ts';

export const load = async () => ({status:await coachStatus().catch(()=>null)});
export const actions = {
	default:async({request,url})=>{
		if (!secureAccountOrigin(url)) return fail(403,{error:'HTTPS 또는 localhost로 접속하세요.'});
		const form=await request.formData();
		const id=String(form.get('backend'));
		if (!Object.hasOwn(BACKENDS,id)) return fail(400,{error:'제공자를 확인하세요.'});
		const action=form.get('action');
		if (action!=='save' && action!=='remove') return fail(400,{error:'요청을 확인하세요.'});
		const key=String(form.get('key') ?? '').trim();
		if (action==='save' && !/^[!-~]{8,4096}$/.test(key)) return fail(400,{error:'API 키를 확인하세요.'});
		try { await setCoachKey(id as BackendId,action==='remove'?null:key); }
		catch { return fail(503,{error:'코치 설정 저장에 실패했습니다. 잠시 후 다시 시도하세요.'}); }
		return {message:action==='remove'?'키를 삭제했습니다.':'이 계정의 키를 저장했습니다.'};
	}
};
