import {spawnSync} from 'node:child_process';
import {openIdentity,saveIdentity,files} from './identity.mjs';
const backend=process.argv[2];
if (!Object.hasOwn(files,backend)) throw Error('Unknown provider');
openIdentity(backend);
const commands={codex:['login','--device-auth'],claude:['auth','login','--claudeai'],qwen:['--auth-type','qwen-subscription','--safe-mode']};
const child=spawnSync(backend,commands[backend],{stdio:'inherit',cwd:'/tmp'});
if (child.status!==0 || !saveIdentity(backend)) {
	console.error('로그인을 완료한 뒤 다시 시도하세요.');
	process.exitCode=1;
}
