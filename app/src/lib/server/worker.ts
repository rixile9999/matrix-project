import {request} from 'node:http';
import {resolve} from 'node:path';
import { accountId } from './db.ts';
import type { BackendId } from '../core/coach.ts';

export class WorkerUnavailable extends Error {}

type ScalaResult = { stdout:string; stderr:string; code:number; timedOut:boolean };
type Reply = { delta?:string; text?:string; error?:string; result?:ScalaResult };
async function job(path:string, body:object, receive:(event:Reply)=>void, signal?:AbortSignal) {
	const socketPath = process.env.MATRIX_WORKER_SOCKET ?? resolve('data/worker.sock');
	const deadline = AbortSignal.timeout(155000);
	const abort = signal ? AbortSignal.any([signal,deadline]) : deadline;
	const response = await new Promise<import('node:http').IncomingMessage>((ok,fail)=>{
		const req=request({socketPath,path,method:'POST',signal:abort},ok);
		req.on('error',()=>fail(new WorkerUnavailable('격리 워커에 연결할 수 없습니다. 잠시 후 다시 시도하세요.')));
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
			if (event.error) throw new WorkerUnavailable(event.error);
			receive(event);
		}
	}
}
export async function runScala(files:Record<string,string>, owner = accountId()) {
	let result:ScalaResult | undefined;
	await job('/scala',{owner,files},e=>{result=e.result;});
	if (!result) throw new WorkerUnavailable('채점 결과를 받지 못했습니다.');
	return result;
}
export async function askCoach(backend:BackendId,prompt:string,system:string,onDelta:(s:string)=>void,signal?:AbortSignal) {
	let text='';
	await job('/coach',{owner:accountId(),backend,prompt,system},e=>{
		if (e.delta) onDelta(e.delta);
		if (e.text) text=e.text;
	},signal);
	if (!text) throw Error('코칭 결과를 받지 못했습니다.');
	return text;
}
