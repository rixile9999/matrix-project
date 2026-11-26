// Run the built HTTP routes with a disposable learner and no production services.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lessons } from '../src/lib/server/stats-content.ts';

const root = await mkdtemp(join(tmpdir(), 'matrix-routes-'));
const server = createServer();
try {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const origin = 'http://127.0.0.1:' + server.address().port;
	Object.assign(process.env, {
		ORIGIN: origin, MATRIX_ALLOWED_ORIGINS: origin, MATRIX_DATA: root,
		MATRIX_WORKER_SOCKET: join(root, 'offline.sock')
	});
	const { handler } = await import('../build/handler.js');
	server.on('request', handler);

	const cookies = new Map();
	async function request(path, form) {
		const response = await fetch(origin + path, {
			method: form ? 'POST' : 'GET', redirect: 'manual',
			headers: { origin, cookie: [...cookies.values()].join('; '), accept: 'text/html' },
			body: form ? new URLSearchParams(form) : undefined,
			signal: AbortSignal.timeout(10000)
		});
		for (const cookie of response.headers.getSetCookie()) {
			const pair = cookie.split(';')[0];
			cookies.set(pair.split('=')[0], pair);
		}
		return response;
	}
	async function html(path) {
		const response = await request(path);
		assert.equal(response.status, 200, path);
		// Exclude hydration data so a missing link cannot pass because its URL is serialized.
		return (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
	}
	const password = randomBytes(24).toString('hex');
	assert.equal((await request('/signup', { name: 'verify', password, confirm: password })).status, 303);
	// An old, still-open upload form described its new set as private.
	assert.equal((await request('/library', { requestId: randomUUID() })).status, 409);
	const lesson = lessons[0];
	assert.ok((await html('/stats')).includes('value="' + lesson.id + '"'));
	const start = await request('/stats?/start', { lessonId: lesson.id });
	assert.equal(start.status, 303);
	const run = start.headers.get('location');
	assert.ok(run.startsWith('/stats/' + lesson.id + '?run='));
	const id = new URL(run, origin).searchParams.get('run');
	const thread = '/coach/thread?' + new URLSearchParams({ kind: 'stats', id: lesson.id, run: id });
	assert.equal((await (await request(thread)).json()).access, 'locked');
	assert.doesNotMatch(await html(run), /class="[^"]*stats-coach/);
	assert.equal((await request(run + '&/reference', {})).status, 200);
	const answers = Object.fromEntries(lesson.fields.map((field, i) => ['answer' + i, String(field.answer)]));
	assert.equal((await request(run + '&/check', answers)).status, 200);
	for (const locale of ['en', 'ko']) {
		assert.equal((await request('/locale', { locale })).status, 303);
		const review = await html(run);
		assert.ok(review.includes('<html lang="' + locale + '"'));
		assert.match(review, /class="[^"]*stats-coach/);
		assert.equal((await (await request(thread)).json()).access, 'full');
		assert.ok((await html('/debrief')).includes('href="' + run + '"'));
		assert.match(await html('/garden'), /id="statistics"/);
		const course = await html('/stats');
		assert.ok(course.includes('href="/library"'));
		const library = await html('/library');
		assert.match(library, locale === 'en' ? />PDF sets<\/h1>/ : />PDF 문제집<\/h1>/);
		assert.ok(library.includes(locale === 'en' ? 'Open Coach settings' : '코치 설정 열기'));
		assert.ok(library.includes('<html lang="' + locale + '"'));
		const mapTitle = locale === 'en' ? 'Learning model' : '학습 구조';
		assert.match(course, new RegExp(`<a\\b[^>]*href="/learning-map"[^>]*>\\s*${mapTitle}\\s*</a>`));
		const learningMap = await html('/learning-map');
		assert.ok(learningMap.includes('<html lang="' + locale + '"'));
		assert.match(learningMap, new RegExp(`<h1\\b[^>]*>\\s*${mapTitle}\\s*</h1>`));
		for (const link of ['/spar#h-stats', '/garden#statistics', '/debrief#stats-reviews']) {
			assert.ok(course.includes('href="' + link + '"'), link);
		}
		assert.match(await html('/spar'), /action="\?\/startStats"/);
	}
	const round = await request('/spar?/startStats', {});
	assert.equal(round.status, 303);
	const roundPath = round.headers.get('location');
	assert.match(roundPath, /^\/spar\/stats\/\d+$/);
	assert.match(await html(roundPath), /name="answer"/);
	assert.ok((await html('/spar/records')).includes('href="' + roundPath + '"'));
	console.log('Built routes verified: Statistics, Sparring, Debrief, Garden, Coach, Learning model, PDF sets (English and Korean).');
} finally {
	server.closeAllConnections();
	if (server.listening) await new Promise((resolve) => server.close(resolve));
	await rm(root, { recursive: true, force: true });
}
