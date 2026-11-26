import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { accountId } from './db.ts';
import { askCoach, coachConnections, connectedCoaches } from './worker.ts';

vi.mock('./db.ts', () => ({ accountId: vi.fn() }));

const owner = randomUUID();
const member = randomUUID();
const root = mkdtempSync(join(tmpdir(), 'm-worker-'));
const previousSocket = process.env.MATRIX_WORKER_SOCKET;
const socket = join(root, 'worker.sock');
let waitRequests = 0;
const broker = createServer(async (req, res) => {
	let body = '';
	for await (const chunk of req) body += chunk;
	const { owner: id, prompt } = JSON.parse(body);
	if (req.url === '/coach' && id === owner) {
		const busy = prompt !== 'wait' || ++waitRequests === 1;
		res.end(JSON.stringify(busy ? { error: '워커 사용 중입니다. 잠시 후 다시 시도하세요.' } : { text: 'ready' }) + '\n');
		return;
	}
	if (req.url !== '/coach-status' || (id !== owner && id !== member)) {
		res.end();
		return;
	}
	res.end(JSON.stringify({
		status: {
			allowCli: id === owner,
			providers: {
				claude: { cli: true, api: false },
				codex: { cli: true, api: true },
				qwen: { cli: false, api: false }
			}
		}
	}) + '\n');
});

beforeAll(async () => {
	process.env.MATRIX_WORKER_SOCKET = socket;
	await new Promise<void>((resolve, reject) => {
		broker.once('error', reject);
		broker.listen(socket, resolve);
	});
});

afterAll(async () => {
	await new Promise<void>((resolve) => broker.close(() => resolve()));
	if (previousSocket === undefined) delete process.env.MATRIX_WORKER_SOCKET;
	else process.env.MATRIX_WORKER_SOCKET = previousSocket;
	rmSync(root, { recursive: true, force: true });
});

it('reports preferential CLI only to the owner and keeps the connected-provider list compatible', async () => {
	vi.mocked(accountId).mockReturnValueOnce(owner).mockReturnValueOnce(member).mockReturnValueOnce(member);
	expect(await coachConnections()).toEqual({ allowCli: true, methods: { claude: 'cli', codex: 'cli' } });
	expect(await coachConnections()).toEqual({ allowCli: false, methods: { codex: 'api' } });
	expect(await connectedCoaches()).toEqual(['codex']);
});

it('exposes no methods or owner controls when the broker status is missing', async () => {
	vi.mocked(accountId).mockReturnValueOnce(randomUUID());
	expect(await coachConnections()).toEqual({ allowCli: false, methods: {} });
});

it('waits for a busy worker for book jobs while interactive requests still fail promptly', async () => {
	vi.mocked(accountId).mockReturnValue(owner);
	await expect(askCoach('codex', 'interactive', '', () => {})).rejects.toThrow();
	await expect(askCoach('codex', 'wait', '', () => {}, undefined, true)).resolves.toBe('ready');
	expect(waitRequests).toBe(2);
}, 8000);
