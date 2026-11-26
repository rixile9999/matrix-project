import { randomUUID } from 'node:crypto';
import type { BackendId } from '#lib/core/coach.ts';
import type { BiText, PdfGenerationProgress } from '#lib/pdf-sets.ts';
import { db } from './db.ts';
import { generatePdfSet, PdfGenerationError } from './pdf-generate.ts';
import { savePdfSet } from './pdf-sets.ts';

// The production Node adapter runs one web process. Only this process holds the uploaded bytes.
const processId = randomUUID();
const interrupted: BiText = {
	en: 'Generation stopped when the server restarted. Upload the PDF again to restart.',
	ko: '서버가 재시작되어 생성이 중단됐습니다. PDF를 다시 올리면 새로 시작합니다.'
};
const unavailable: BiText = {
	en: 'Generation failed. Check the provider connection and upload the PDF again.',
	ko: '생성에 실패했습니다. 제공자 연결을 확인하고 PDF를 다시 올려 주세요.'
};

type JobRow = {
	id: string; sourceName: string; stage: PdfGenerationProgress['stage'] | 'failed' | 'done';
	completed: number; total: number; error: string | null;
};
function markInterruptedJobs() {
	db().prepare(`UPDATE pdf_generation_jobs SET stage='failed', error=?
		WHERE process_id <> ? AND stage NOT IN ('failed', 'done')`).run(JSON.stringify(interrupted), processId);
}
const jobColumns = 'request_id AS id, source_name AS sourceName, stage, completed, total, error';
function jobView(row: JobRow) {
	return { ...row, error: row.error ? JSON.parse(row.error) as BiText : null };
}

export function pdfJob(id: string) {
	markInterruptedJobs();
	const row = db().prepare(`SELECT ${jobColumns} FROM pdf_generation_jobs WHERE request_id=?`).get(id) as JobRow | undefined;
	return row ? jobView(row) : null;
}

export function recentPdfJob() {
	markInterruptedJobs();
	const row = db().prepare(`SELECT ${jobColumns} FROM pdf_generation_jobs ORDER BY started_at DESC, rowid DESC LIMIT 1`).get() as JobRow | undefined;
	return row && row.stage !== 'done' ? jobView(row) : null;
}

export function startPdfJob(id: string, file: File, backend: BackendId) {
	const previous = pdfJob(id);
	if (previous && previous.stage !== 'failed') return id;
	const busy = db().prepare("SELECT request_id FROM pdf_generation_jobs WHERE stage NOT IN ('failed','done') LIMIT 1").get();
	if (busy) return null;
	const sourceName = file.name.split(/[\\/]/).at(-1)?.slice(0, 255).toWellFormed().trim() || 'PDF';
	db().prepare(`INSERT INTO pdf_generation_jobs (request_id, source_name, started_at, process_id, stage)
		VALUES (?, ?, ?, ?, 'extracting') ON CONFLICT(request_id) DO UPDATE SET
		source_name=excluded.source_name, started_at=excluded.started_at, process_id=excluded.process_id,
		stage='extracting', completed=0, total=1, error=NULL`).run(id, sourceName, Date.now(), processId);

	// Keep the authenticated account context while allowing the browser to leave.
	void runPdfJob(id, file, sourceName, backend);
	return id;
}

async function runPdfJob(id: string, file: File, sourceName: string, backend: BackendId) {
	const database = db();
	try {
		const content = await generatePdfSet(file, backend, undefined, (progress) => {
			database.prepare('UPDATE pdf_generation_jobs SET stage=?, completed=?, total=? WHERE request_id=?')
				.run(progress.stage, progress.completed, progress.total, id);
		});
		database.exec('BEGIN IMMEDIATE');
		try {
			savePdfSet(sourceName, content, id);
			database.prepare("UPDATE pdf_generation_jobs SET stage='done' WHERE request_id=?").run(id);
			database.exec('COMMIT');
		} catch (error) {
			database.exec('ROLLBACK');
			throw error;
		}
	} catch (error) {
		const message = error instanceof PdfGenerationError ? error.text : unavailable;
		database.prepare("UPDATE pdf_generation_jobs SET stage='failed', error=? WHERE request_id=?").run(JSON.stringify(message), id);
	}
}
