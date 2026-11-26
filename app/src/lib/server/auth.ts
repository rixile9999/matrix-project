import { tr } from './locale.ts';
import { argon2, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const accountRoot = () => resolve(process.env.MATRIX_DATA ?? 'data/accounts');
let store: DatabaseSync | undefined;
export function authStore() {
	if (store) return store;
	mkdirSync(accountRoot(), { recursive: true, mode: 0o700 });
	store = new DatabaseSync(join(accountRoot(), 'auth.db'));
	store.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE NOT NULL, password TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
		CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
	return store;
}
export async function passwordHash(password: string, salt = randomBytes(16)): Promise<string> {
	const hash = await new Promise<Buffer>((ok, fail) => argon2('argon2id', {
		message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32
	}, (err, buf) => err ? fail(err) : ok(buf)));
	return salt.toString('hex') + ':' + hash.toString('hex');
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const sessionAge = 7 * 86400;
export type Account = { id: string; name: string };
export function accountFor(token?: string): Account | undefined {
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
	return authStore().prepare('SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?')
		.get(digest(token), Date.now()) as Account | undefined;
}
export function revoke(token?: string) {
	if (token) authStore().prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
}

let hashing = 0;
function allowAttempt(bucket: string, limit: number, now: number) {
	const db = authStore();
	db.prepare('DELETE FROM attempts WHERE until<=?').run(now);
	const row = db.prepare(`INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(bucket)
		DO UPDATE SET count=count+1 RETURNING count`).get(bucket, now + 300000);
	return Number(row?.count) <= limit;
}

export async function register(name: string, password: string, ip: string) {
	if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(name)) return { error: tr('아이디는 영문, 숫자, 점, 밑줄, 하이픈으로 1~64자를 입력하세요.', 'Use 1–64 letters, numbers, periods, underscores, or hyphens for your username.'), status: 400 } as const;
	if (password.length < 12 || password.length > 512) return { error: tr('비밀번호는 12~512자로 입력하세요.', 'Use a password between 12 and 512 characters.'), status: 400 } as const;
	if (hashing >= 4 || !allowAttempt('signup:'+ip, 12, Date.now())) return { error: tr('잠시 후 다시 시도하세요.', 'Try again shortly.'), status: 429 } as const;
	hashing++;
	try {
		const hash = await passwordHash(password);
		const db = authStore(), id = randomUUID(), token = randomBytes(32).toString('hex');
		db.exec('BEGIN IMMEDIATE');
		try {
			const created = db.prepare('INSERT INTO users(id,name,password) VALUES(?,?,?) ON CONFLICT(name) DO NOTHING').run(id,name,hash);
			if (!created.changes) {
				db.exec('ROLLBACK');
				return { error: tr('이미 사용 중인 아이디입니다.', 'This username is already taken.'), status: 409 } as const;
			}
			db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Date.now()+sessionAge*1000);
			db.exec('COMMIT');
			return { token } as const;
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	} finally { hashing--; }
}

export async function login(name: string, password: string, ip: string) {
	const db = authStore(), now = Date.now();
	if (!name || name.length > 80 || !password || password.length > 512 || hashing >= 4) return null;
	if (!allowAttempt('ip:'+ip, 45, now) || !allowAttempt('name:'+name.toLowerCase(), 10, now)) return null;
	const user = db.prepare('SELECT * FROM users WHERE name=?').get(name) as (Account & {password: string}) | undefined;
	const stored = user?.password ?? '00'.repeat(16)+':'+'00'.repeat(32);
	hashing++;
	try {
		const computed = await passwordHash(password, Buffer.from(stored.split(':')[0], 'hex'));
		if (!timingSafeEqual(Buffer.from(stored), Buffer.from(computed)) || !user) return null;
		const token = randomBytes(32).toString('hex');
		db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
		// A concurrent password reset invalidates the credential we just checked.
		const inserted = db.prepare('INSERT INTO sessions SELECT ?, id, ? FROM users WHERE id=? AND password=?')
			.run(digest(token), now + sessionAge*1000, user.id, stored);
		if (!inserted.changes) return null;
		db.prepare('DELETE FROM attempts WHERE bucket=?').run('name:'+name.toLowerCase());
		return token;
	} finally { hashing--; }
}
