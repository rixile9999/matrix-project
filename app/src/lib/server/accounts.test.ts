import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { accountFor, authStore, login, passwordHash, revoke } from './auth.ts';
import { accountId, db, withAccount } from './db.ts';

const temp=mkdtempSync(join(tmpdir(),'matrix-accounts-'));
const before=process.env.MATRIX_DATA;
process.env.MATRIX_DATA=temp;
afterAll(()=>{
	if (before) process.env.MATRIX_DATA=before; else delete process.env.MATRIX_DATA;
	rmSync(temp,{recursive:true,force:true});
});

it('binds the same numeric row id to different accounts across an async boundary', async ()=>{
	const ids=[randomUUID(),randomUUID()];
	await Promise.all(ids.map(id=>withAccount(id,async()=>{
		db().prepare("INSERT INTO coach_messages(at,context_kind,context_id,backend,role,text,access) VALUES(0,'memo','same','claude','user',?,'limited')").run(id);
		await new Promise(resolve=>setTimeout(resolve,10));
		expect(accountId()).toBe(id);
		expect(db().prepare('SELECT text FROM coach_messages WHERE id=1').get()?.text).toBe(id);
	})));
	expect(()=>db()).toThrow();
});

it('accepts a correct password, stores only a token digest and revokes the session', async ()=>{
	const id=randomUUID(), password='sample test password';
	authStore().prepare('INSERT INTO users VALUES(?,?,?)').run(id,'learner',await passwordHash(password));
	expect(await login('learner','incorrect','localhost')).toBeNull();
	const token=await login('Learner',password,'localhost');
	expect(accountFor(token!)).toMatchObject({id,name:'learner'});
	expect(authStore().prepare('SELECT token FROM sessions').get()?.token).not.toBe(token);
	revoke(token!);
	expect(accountFor(token!)).toBeUndefined();
});

it('resets an account and invalidates its previous browser sessions', async ()=>{
	const { execFileSync } = await import('node:child_process');
	const name='reset-test', initial='first test password', replacement='replacement password';
	const admin=(command:string,password:string)=>execFileSync(process.execPath,['scripts/account.ts',command,name],{
		input:password,env:{...process.env,MATRIX_DATA:temp},stdio:['pipe','ignore','pipe']
	});
	admin('create',initial);
	const token=await login(name,initial,'reset-client');
	expect(accountFor(token!)).toBeDefined();
	admin('reset',replacement);
	expect(accountFor(token!)).toBeUndefined();
	expect(await login(name,initial,'reset-client')).toBeNull();
	expect(await login(name,replacement,'reset-client')).toBeTruthy();
});

it('creates a fresh account and session exactly once for equivalent signup names', async () => {
	const { register } = await import('./auth.ts');
	const results = await Promise.all(['NewUser', 'newuser'].map(name => register(name, 'example signup passphrase', 'signup-test')));
	const tokens = results.flatMap(result => result.token ? [result.token] : []);
	expect(tokens).toHaveLength(1);
	expect(results.find(result => result.error)?.status).toBe(409);
	const user = accountFor(tokens[0])!;
	expect(user.id).toBeTruthy();
	withAccount(user.id, () => expect(db().prepare('SELECT count(*) AS n FROM coach_messages').get()?.n).toBe(0));
});
