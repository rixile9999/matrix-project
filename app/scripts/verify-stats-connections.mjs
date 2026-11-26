// Run the built HTTP routes with a disposable learner and no production services.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withAccount } from '../src/lib/server/db.ts';
import { savePdfSet } from '../src/lib/server/pdf-sets.ts';
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
	assert.equal((await request('/library', { requestId: randomUUID(), visibility: 'members' })).status, 409);
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
	const pdfId = withAccount(randomUUID(), () => savePdfSet('fixture.pdf', {
		title: { en: 'Cell functions', ko: '세포의 기능' },
		concepts: [
			{ id: 'membranes', title: { en: 'Membranes', ko: '세포막' }, objective: { en: 'Describe membrane transport.', ko: '막을 통한 물질 이동을 설명한다.' }, prerequisites: [], page: 8 },
			{ id: 'translation', title: { en: 'Translation', ko: '번역' }, objective: { en: 'Describe how proteins are made.', ko: '단백질 합성 과정을 설명한다.' }, prerequisites: ['membranes'], page: 9 }
		],
		questions: [
			{
				page: 8, conceptId: 'membranes', kind: 'recall',
				prompt: { en: 'Which structure controls cell entry?', ko: '어떤 구조가 세포로 들어오는 물질을 조절하나요?' },
				choices: [{ en: 'Membrane', ko: '세포막' }, { en: 'Ribosome', ko: '리보솜' }],
				correct: 0, explanation: { en: 'Membranes regulate passage.', ko: '세포막은 물질의 통과를 조절합니다.' }
			},
			{
				page: 9, conceptId: 'translation', kind: 'apply',
				prompt: { en: 'Which structure reads messenger RNA?', ko: '어떤 구조가 전령 RNA를 읽나요?' },
				choices: [{ en: 'Membrane', ko: '세포막' }, { en: 'Ribosome', ko: '리보솜' }],
				correct: 1, explanation: { en: 'Ribosomes translate RNA.', ko: '리보솜은 RNA를 번역합니다.' }
			}
		]
	}, randomUUID()));
	const book = '/library/' + pdfId;
	const exercise = book + '?question=1';
	assert.ok((await html('/library')).includes(`href="${book}"`));
	assert.doesNotMatch(await html(book), /name="answer"/);
	assert.equal((await request(exercise + '&/answer', { answer: '0' })).status, 409);
	for (const locale of ['en', 'ko', 'en']) {
		assert.equal((await request('/locale', { locale })).status, 303);
		const overview = await html(book);
		assert.ok(overview.includes(locale === 'en' ? 'Concept map' : '개념 지도'));
		assert.ok(overview.includes(locale === 'en' ? 'Concept index' : '개념 목차'));
		assert.ok(overview.includes(locale === 'en' ? 'Prerequisites' : '선행 개념'));
		assert.ok(overview.includes(locale === 'en' ? 'Describe membrane transport.' : '막을 통한 물질 이동을 설명한다.'));
		assert.ok(overview.includes(`href="${book}#concept-membranes"`));
		assert.ok(overview.includes(`href="${exercise}"`));
		assert.doesNotMatch(overview, /name="answer"/);
		const active = await request(exercise);
		assert.equal(active.status, 200);
		const body = await active.text();
		assert.ok(body.includes(locale === 'en' ? 'Which structure controls cell entry?' : '어떤 구조가 세포로 들어오는 물질을 조절하나요?'));
		assert.doesNotMatch(body, /Membranes regulate passage|세포막은 물질의 통과를 조절합니다|Ribosomes translate RNA|리보솜은 RNA를 번역합니다/);
	}
	const submitted = await request(exercise + '&/answer', { answer: '0' });
	assert.equal(submitted.status, 303);
	assert.equal(submitted.headers.get('location'), exercise);
	assert.match(await html(exercise), /Membranes regulate passage/);
	assert.match(await html(book), /1 of 2 answered/);
	assert.match(await html(book + '?question=2'), /Which structure reads messenger RNA/);
	assert.equal((await request(book + '?question=2&/answer', { answer: '1' })).status, 303);
	assert.match(await html(book), /2 of 2 correct/);
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
