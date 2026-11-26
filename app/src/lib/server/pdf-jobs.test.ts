import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import type { PdfSetContent } from '#lib/pdf-sets.ts';
import { db, withAccount } from './db.ts';
import { generatePdfSet } from './pdf-generate.ts';
import { pdfJob, recentPdfJob, startPdfJob } from './pdf-jobs.ts';
import { findPdfSetByRequest, listPdfSets } from './pdf-sets.ts';

vi.mock('./pdf-generate.ts', async (original) => ({
	...await original<typeof import('./pdf-generate.ts')>(), generatePdfSet: vi.fn()
}));
const directory = mkdtempSync(join(tmpdir(), 'matrix-pdf-jobs-'));
const previous = process.env.MATRIX_DATA;
process.env.MATRIX_DATA = directory;
afterAll(() => {
	if (previous === undefined) delete process.env.MATRIX_DATA;
	else process.env.MATRIX_DATA = previous;
	rmSync(directory, { recursive: true, force: true });
});

it('finishes after the upload request ends, publishes once, and isolates job and progress data', async () => {
	const [owner, other, id] = [randomUUID(), randomUUID(), randomUUID()];
	const file = new File(['pdf'], 'example.pdf');
	const result = Promise.withResolvers<PdfSetContent>();
	vi.mocked(generatePdfSet).mockImplementationOnce(async (_file, _backend, _signal, report) => {
		report?.({ stage: 'authoring', completed: 1, total: 3 });
		return await result.promise;
	});
	withAccount(owner, () => {
		expect(startPdfJob(id, file, 'codex')).toBe(id);
		expect(startPdfJob(id, file, 'codex')).toBe(id);
		expect(startPdfJob(randomUUID(), file, 'codex')).toBeNull();
		expect(recentPdfJob()).toMatchObject({ stage: 'authoring', completed: 1, total: 3 });
	});
	withAccount(other, () => {
		expect(pdfJob(id)).toBeNull();
		expect(listPdfSets()).toHaveLength(0);
	});
	result.resolve({ title: { en: 'Sets', ko: '집합' }, questions: [] });
	await vi.waitFor(() => withAccount(owner, () => expect(pdfJob(id)?.stage).toBe('done')));
	withAccount(owner, () => {
		expect(startPdfJob(id, file, 'codex')).toBe(id);
		expect(findPdfSetByRequest(id)).toBeTruthy();
	});
	withAccount(other, () => {
		expect(findPdfSetByRequest(id)).toBeNull();
		expect(listPdfSets()).toHaveLength(1);
	});
	expect(generatePdfSet).toHaveBeenCalledTimes(1);
});

it('reports an interrupted job, allows re-upload, and keeps failed results out of the catalogue', async () => {
	const id = randomUUID();
	const owner = randomUUID();
	await withAccount(owner, async () => {
		db().prepare("INSERT INTO pdf_generation_jobs (request_id, source_name, started_at, process_id, stage) VALUES (?, 'copy.pdf', 0, 'old', 'planning')").run(id);
		expect(pdfJob(id)?.error?.en).toContain('restarted');
		vi.mocked(generatePdfSet).mockRejectedValueOnce(new Error('internal provider detail'));
		expect(startPdfJob(id, new File(['pdf'], 'copy.pdf'), 'codex')).toBe(id);
		await vi.waitFor(() => expect(pdfJob(id)?.stage).toBe('failed'));
		expect(pdfJob(id)?.error?.en).not.toContain('internal');
		expect(findPdfSetByRequest(id)).toBeNull();
	});
});
