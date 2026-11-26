import { tr } from './locale.ts';
import {request} from 'node:http';
import {resolve} from 'node:path';
import { accountId } from './db.ts';
import { BACKENDS, type BackendId } from '../core/coach.ts';

const workerErrors: Record<string, string> = {
	'요청 형식 오류': 'Invalid request.',
	'작업 입력이 너무 큽니다.': 'Job input is too large.',
	'작업 소유자가 필요합니다.': 'A job owner is required.',
	'잘못된 계정입니다.': 'Invalid account.',
	'잘못된 제공자입니다.': 'Invalid provider.',
	'API 키 형식을 확인하세요.': 'Check the API key format.',
	'워커 사용 중입니다. 잠시 후 다시 시도하세요.': 'The worker is busy. Try again shortly.',
	'Scala 파일 형식 오류': 'Invalid Scala files.',
	'코칭 요청 형식 오류': 'Invalid coaching request.',
	'코치 연결 설정에서 이 계정의 인증을 먼저 연결하세요.': 'Connect this account in Coach settings first.',
	'작업 출력 한도를 초과했습니다.': 'Job output exceeded the limit.',
	'격리 실행 환경을 시작할 수 없습니다.': 'Could not start the isolated worker.',
	'코칭 응답 실패. 제공자 인증과 연결을 확인하세요.': 'The coach could not respond. Check the provider connection and credentials.',
	'격리 워커를 사용할 수 없습니다.': 'The isolated worker is unavailable.'
};

export class WorkerUnavailable extends Error {}

type ScalaResult = { stdout:string; stderr:string; code:number; timedOut:boolean };
type ConnectionStatus = {allowCli:boolean;providers:Record<BackendId,{cli:boolean;api:boolean}>};
type Reply = { status?:ConnectionStatus; saved?:boolean; delta?:string; text?:string; error?:string; result?:ScalaResult };
async function job(path:string, body:object, receive:(event:Reply)=>void, signal?:AbortSignal) {
	const socketPath = process.env.MATRIX_WORKER_SOCKET ?? resolve('data/worker.sock');
	const deadline = AbortSignal.timeout(155000);
	const abort = signal ? AbortSignal.any([signal,deadline]) : deadline;
	const response = await new Promise<import('node:http').IncomingMessage>((ok,fail)=>{
		const req=request({socketPath,path,method:'POST',signal:abort},ok);
		req.on('error',()=>fail(new WorkerUnavailable(tr('격리 워커에 연결할 수 없습니다. 잠시 후 다시 시도하세요.', 'Cannot reach the isolated worker. Try again shortly.'))));
		req.end(JSON.stringify(body));
	});
	let buffer='';
	response.setEncoding('utf8');
	for await (const chunk of response) {
		buffer+=chunk;
		let end;
		while ((end=buffer.indexOf('\n'))!==-1) {
			const event:Reply=JSON.parse(buffer.slice(0,end));
			buffer=buffer.slice(end+1);
			if (event.error) throw new WorkerUnavailable(tr(event.error, workerErrors[event.error] ?? event.error));
			receive(event);
		}
	}
}
export async function runScala(files:Record<string,string>, owner = accountId()) {
	let result:ScalaResult | undefined;
	await job('/scala',{owner,files},e=>{result=e.result;});
	if (!result) throw new WorkerUnavailable(tr('채점 결과를 받지 못했습니다.', 'The grader returned no result.'));
	return result;
}
export async function askCoach(backend:BackendId,prompt:string,system:string,onDelta:(s:string)=>void,signal?:AbortSignal) {
	let text='';
	await job('/coach',{owner:accountId(),backend,prompt,system},e=>{
		if (e.delta) onDelta(e.delta);
		if (e.text) text=e.text;
	},signal);
	if (!text) throw Error(tr('코칭 결과를 받지 못했습니다.', 'The coach returned no answer.'));
	return text;
}

export async function coachStatus() {
	let status: ConnectionStatus | undefined;
	await job('/coach-status',{owner:accountId()},event=>{status=event.status;},AbortSignal.timeout(3000));
	if (!status) throw new WorkerUnavailable(tr('코치 연결 상태를 확인할 수 없습니다.', 'Could not check the coach connection.'));
	return status;
}
export async function connectedCoaches():Promise<BackendId[]> {
	try {
		const {providers}=await coachStatus();
		return (Object.keys(BACKENDS) as BackendId[]).filter(id=>providers[id].cli || providers[id].api);
	} catch { return []; }
}
export async function setCoachKey(backend: BackendId, key:string|null) {
	let saved=false;
	await job('/coach-key',{owner:accountId(),backend,key},event=>{saved=event.saved===true;},AbortSignal.timeout(5000));
	if (!saved) throw new WorkerUnavailable(tr('연결 설정을 저장하지 못했습니다.', 'Could not save the connection settings.'));
}
