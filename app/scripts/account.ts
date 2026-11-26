// Run from app/. Password is read from a pipe so it never appears in argv or shell history.
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authStore, accountRoot, passwordHash } from '../src/lib/server/auth.ts';

const [command, name, legacy, ...extra] = process.argv.slice(2);
if (!['create','reset'].includes(command) || !/^[a-zA-Z0-9_.-]{1,64}$/.test(name ?? '') || extra.length || (command === 'reset' && legacy))
	throw Error('사용법: 비밀번호를 표준 입력으로 전달 | node scripts/account.ts create 이름 [이전할 SQLite 파일] 또는 reset 이름');
if (process.stdin.isTTY) throw Error('비밀번호를 터미널에 표시하지 않도록 표준 입력을 사용하세요.');
const password = readFileSync(0,'utf8').replace(/\r?\n$/, '');
if (password.length < 12 || password.length > 512) throw Error('비밀번호는 12~512자로 지정하세요.');
const hash = await passwordHash(password), db = authStore();
db.exec('BEGIN IMMEDIATE');
let createdDirectory: string | undefined;
try {
	if (command === 'reset') {
		const user = db.prepare('UPDATE users SET password=? WHERE name=? RETURNING id').get(hash, name);
		if (!user) throw Error('등록되지 않은 계정');
		db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
		db.prepare('DELETE FROM attempts WHERE bucket=?').run('name:'+name.toLowerCase());
	} else {
		const id = randomUUID();
		db.prepare('INSERT INTO users VALUES (?,?,?)').run(id, name, hash);
		if (legacy) {
			if (db.prepare('SELECT count(*) AS n FROM users').get()?.n !== 1) throw Error('기존 기록은 최초 소유자 생성 시만 이전할 수 있습니다.');
			const backup = join(accountRoot(), 'legacy-'+id+'.db');
			const source = new DatabaseSync(resolve(legacy), {readOnly:true});
			try {
				if (!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attempts'").get()) throw Error('훈련 DB가 아닙니다.');
				source.prepare('VACUUM INTO ?').run(backup);
			} finally { source.close(); }
			const snapshot = new DatabaseSync(backup,{readOnly:true});
			try { if (snapshot.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw Error('백업 무결성 확인 실패'); }
			finally { snapshot.close(); }
			const dir = join(accountRoot(), 'users', id);
			mkdirSync(dir,{recursive:true, mode:0o700});
			createdDirectory = dir;
			copyFileSync(backup, join(dir,'trainer.db'), constants.COPYFILE_EXCL);
		}
	}
	db.exec('COMMIT');
	console.log(name+' 계정 설정을 완료했습니다.');
} catch (e) {
	db.exec('ROLLBACK');
	if (createdDirectory && existsSync(createdDirectory)) rmSync(createdDirectory,{recursive:true});
	throw e;
}
