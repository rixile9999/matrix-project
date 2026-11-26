// Only provider authentication files survive a job. Chat history, plugins,
// configuration and the agent workspace stay in the job's disposable home.
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';
export const files = {
	codex:['.codex/auth.json'],
	claude:['.claude/.credentials.json'],
	qwen:['.qwen/oauth_creds.json','.qwen/subscription_credentials.json']
};
export function openIdentity(provider) {
	const home=process.env.HOME;
	for (const file of files[provider]) {
		const local=join(home,file), saved=join('/identity',basename(file));
		mkdirSync(dirname(local),{recursive:true,mode:0o700});
		if (existsSync(saved)) writeFileSync(local,readFileSync(saved),{mode:0o600});
	}
}
export function saveIdentity(provider) {
	let found=false;
	for (const file of files[provider]) {
		const local=join(process.env.HOME,file), saved=join('/identity',basename(file));
		if (!existsSync(local)) continue;
		const value=readFileSync(local);
		if (!Object.keys(JSON.parse(value)).length) continue;
		writeFileSync(saved+'.new',value,{mode:0o600});
		renameSync(saved+'.new',saved);
		found=true;
	}
	return found;
}
