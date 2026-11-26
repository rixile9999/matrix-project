import { tr } from '#lib/server/locale.ts';
import {fail} from '@sveltejs/kit';
import {coachStatus,setCoachKey} from '#lib/server/worker.ts';
import {BACKENDS,type BackendId} from '#lib/core/coach.ts';
import {secureAccountOrigin} from '#lib/server/account-session.ts';

export const load = async () => ({status:await coachStatus().catch(()=>null)});
export const actions = {
	default:async({request,url})=>{
		if (!secureAccountOrigin(url)) return fail(403,{error:tr('HTTPS 또는 localhost로 접속하세요.', 'Connect via HTTPS or localhost.')});
		const form=await request.formData();
		const id=String(form.get('backend'));
		if (!Object.hasOwn(BACKENDS,id)) return fail(400,{error:tr('제공자를 확인하세요.', 'Check the provider.')});
		const action=form.get('action');
		if (action!=='save' && action!=='remove') return fail(400,{error:tr('요청을 확인하세요.', 'Check the request.')});
		const key=String(form.get('key') ?? '').trim();
		if (action==='save' && !/^[!-~]{8,4096}$/.test(key)) return fail(400,{error:tr('API 키를 확인하세요.', 'Check your API key.')});
		try { await setCoachKey(id as BackendId,action==='remove'?null:key); }
		catch { return fail(503,{error:tr('코치 설정 저장에 실패했습니다. 잠시 후 다시 시도하세요.', 'Could not save coach settings. Try again shortly.')}); }
		return {message:action==='remove'?tr('키를 삭제했습니다.', 'Key removed.'):tr('이 계정의 키를 저장했습니다.', 'Key saved for this account.')};
	}
};
