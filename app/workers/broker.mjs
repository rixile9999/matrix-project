// Trusted control process. Its Unix socket is accessible only to the web service.
// All Docker options, filenames, networks, images and entrypoints are server-owned.
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { chownSync, chmodSync, writeFileSync, renameSync, rmSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
const docker = promisify(execFile);
const socket = process.env.MATRIX_WORKER_SOCKET ?? '/ipc/worker.sock';
const active = new Set();
const fields = new Set(['Judge.scala','User.scala','Tests.scala','Given.scala','T.scala','Main.scala','Cheat.scala']);
const credential = {claude:'ANTHROPIC_API_KEY',codex:'CODEX_API_KEY',qwen:'OPENAI_API_KEY'};
const ownerId = process.env.MATRIX_CLI_OWNER_ID;
const loginFiles = {codex:['auth.json'],claude:['.credentials.json'],qwen:['oauth_creds.json','subscription_credentials.json']};
const apiFile = (owner,provider) => '/run/matrix-credentials/'+owner+'/'+provider;
function methods(owner,provider) {
	return {
		cli: owner === ownerId && loginFiles[provider].some(file=>existsSync('/cli/'+provider+'/'+file)),
		api: existsSync(apiFile(owner,provider))
	};
}
const max = 1024*1024;
const server = http.createServer(async (req, res) => {
	let reserved, container, child, timer, ended = false, timedOut = false, outputLimit = false;
	const stop = () => {
		ended = true;
		child?.kill('SIGKILL');
		if (container) void docker('docker',['rm','-f',container]).catch(()=>{});
	};
	res.on('close', () => { if (!res.writableEnded) stop(); });
	const emit = event => { if (!res.destroyed) res.write(JSON.stringify(event)+'\n'); };
	try {
		if (req.method !== 'POST' || !['/scala','/coach','/coach-status','/coach-key'].includes(req.url)) throw Error('요청 형식 오류');
		let size=0; const chunks=[];
		for await (const chunk of req) {
			size += chunk.length;
			if (size>max) throw Error('작업 입력이 너무 큽니다.');
			chunks.push(chunk);
		}
		const job=JSON.parse(Buffer.concat(chunks).toString());
		if (!/^(?:[a-f0-9-]{36}|maintenance)$/.test(job.owner)) throw Error('작업 소유자가 필요합니다.');
		if (req.url !== '/scala' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(job.owner)) throw Error('잘못된 계정입니다.');
		if (req.url === '/coach-status') {
			emit({status:{allowCli:job.owner===ownerId, providers:Object.fromEntries(Object.keys(credential).map(id=>[id,methods(job.owner,id)]))}});
			return;
		}
		if (req.url === '/coach-key') {
			if (!Object.hasOwn(credential,job.backend)) throw Error('잘못된 제공자입니다.');
			const file=apiFile(job.owner,job.backend);
			if (job.key===null) rmSync(file,{force:true});
			else {
				if (typeof job.key!=='string' || !/^[!-~]{8,4096}$/.test(job.key)) throw Error('API 키 형식을 확인하세요.');
				mkdirSync(dirname(file),{recursive:true,mode:0o700});
				const tmp=file+'.'+randomUUID();
				writeFileSync(tmp,job.key,{mode:0o600,flag:'wx'});
				renameSync(tmp,file);
			}
			emit({saved:true});
			return;
		}
		const slot = req.url+job.owner;
		if (active.has(slot) || active.size>=4) throw Error('워커 사용 중입니다. 잠시 후 다시 시도하세요.');
		active.add(slot); reserved=slot;
		const scala = req.url === '/scala';
		const args=['create','--pull=never','--label','matrix.worker=job','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','10001:10001',
			'--cpus=1.5','--memory=1536m','--memory-swap=1536m','--pids-limit=160','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=384m,uid=10001,gid=10001',
			'--log-driver=none','--ulimit','nofile=512:512','-e','HOME=/tmp/home','-i'];
		const env={...process.env};
		let input;
		if (scala) {
			const files=Object.entries(job.files);
			if (!files.length || files.length>fields.size || files.some(([k,v])=>!fields.has(k)||typeof v!=='string')) throw Error('Scala 파일 형식 오류');
			input=files.map(([k,v])=>k+' '+Buffer.from(v).toString('base64')+'\n').join('');
			args.push('--network=none','-e','JAVA_TOOL_OPTIONS=-Duser.home=/tmp/home','matrix-scala:1');
		} else {
			const {backend,prompt,system}=job;
			if (!Object.hasOwn(credential,backend) || typeof prompt!=='string' || typeof system!=='string') throw Error('코칭 요청 형식 오류');
			const method=methods(job.owner,backend);
			if (method.cli) {
				args.push('--mount','type=volume,source=matrix-cli-'+backend+',target=/identity','-e','MATRIX_AUTH_MODE=cli');
			} else if (method.api) {
				const key=credential[backend];
				env[key]=readFileSync(apiFile(job.owner,backend),'utf8');
				args.push('-e',key);
			} else throw Error('코치 연결 설정에서 이 계정의 인증을 먼저 연결하세요.');
			args.push('--network=none','--mount','type=volume,source=matrix-relay-'+backend+',target=/relay,readonly','-e','HTTPS_PROXY=http://127.0.0.1:8080','-e','HTTP_PROXY=http://127.0.0.1:8080',
				'-e','https_proxy=http://127.0.0.1:8080','-e','http_proxy=http://127.0.0.1:8080','-e','NODE_USE_ENV_PROXY=1');
			if (backend==='qwen' && !method.cli) args.push('-e','OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1','-e','OPENAI_MODEL=qwen3-coder-plus');
			args.push('matrix-coach:1');
			input=JSON.stringify({backend,prompt,system});
		}
		const name='matrix-job-'+randomUUID();
		args.splice(1,0,'--name',name);
		await docker('docker',args,{env,timeout:20000});
		container=name;
		if (ended) return;
		child=spawn('docker',['start','-ai',name],{stdio:['pipe','pipe','pipe']});
		timer=setTimeout(()=>{timedOut=true;stop();},scala?90000:145000);
		let stdout='',stderr='',pending='',bytes=0;
		child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
		const count = text => {
			bytes+=Buffer.byteLength(text);
			if (bytes<=max) return true;
			outputLimit=true;stop();return false;
		};
		child.stderr.on('data',s=>{if(count(s)) stderr+=s;});
		child.stdout.on('data',s=>{
			if (!count(s)) return;
			if (scala) {stdout+=s;return;}
			pending+=s;
			let end;
			while ((end=pending.indexOf('\n'))!==-1) {
				const line=pending.slice(0,end); pending=pending.slice(end+1);
				try {
					const event=JSON.parse(line);
					if (typeof event.delta==='string') emit({delta:event.delta});
					if (typeof event.text==='string') stdout=event.text;
				} catch { /* CLI diagnostics are never forwarded. */ }
			}
		});
		child.stdin.on('error',()=>{});
		child.stdin.end(input);
		const code=await new Promise((ok,fail)=>{child.once('error',fail);child.once('close',ok);});
		if (outputLimit) throw Error('작업 출력 한도를 초과했습니다.');
		if (!timedOut && (code===null || code>=125 && code<=127)) throw Error('격리 실행 환경을 시작할 수 없습니다.');
		if (!scala && (code!==0 || !stdout || timedOut)) throw Error('코칭 응답 실패. 제공자 인증과 연결을 확인하세요.');
		if (scala) emit({result:{stdout,stderr,code,timedOut:timedOut || code === 124}});
		else emit({text:stdout});
	} catch(e) {
		// docker errors can contain its argv or VM details.
		const safe = e instanceof Error && !('cmd' in e) && /[가-힣]/.test(e.message);
		emit({error:safe?e.message:'격리 워커를 사용할 수 없습니다.'});
	} finally {
		clearTimeout(timer);
		if (container) await docker('docker',['rm','-f',container],{timeout:10000}).catch(()=>{});
		if (reserved) active.delete(reserved);
		res.end();
	}
});
server.requestTimeout=15000;
mkdirSync(dirname(socket),{recursive:true});
if (existsSync(socket)) unlinkSync(socket);
const {stdout:stale}=await docker('docker',['ps','-aq','--filter','label=matrix.worker=job']);
for (const id of stale.trim().split(/\s+/).filter(Boolean)) await docker('docker',['rm','-f',id]);
server.listen(socket,()=>{ chownSync(socket,1000,1000); chmodSync(socket,0o660); });
