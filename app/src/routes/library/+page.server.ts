import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
import { PDF_UPLOAD_MAX_BYTES, type BiText } from '#lib/pdf-sets.ts';
import { accountId } from '#lib/server/db.ts';
import { generatePdfSet, PdfGenerationError } from '#lib/server/pdf-generate.ts';
import { findPdfSetByRequest, listPdfSets, savePdfSet } from '#lib/server/pdf-sets.ts';
import { connectedCoaches } from '#lib/server/worker.ts';
import type { Actions, PageServerLoad } from './$types';

const inFlight = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxMiB = PDF_UPLOAD_MAX_BYTES / (1024 * 1024);

type UploadFailure = { error: BiText; requestId?: string; backend?: BackendId };

const errors = {
	audience: { en: 'New sets are shared with all signed-in members. Reload the upload form before generating a set.', ko: '새 문제집은 모든 로그인 회원에게 공개됩니다. 업로드 화면을 새로고침한 뒤 생성하세요.' },
	request: { en: 'The upload could not be read. Choose a PDF and try again.', ko: '업로드를 읽지 못했습니다. PDF를 선택하고 다시 시도하세요.' },
	file: { en: 'Choose a PDF to upload.', ko: '업로드할 PDF를 선택하세요.' },
	size: { en: `Choose a PDF that is ${maxMiB} MiB or smaller.`, ko: `${maxMiB} MiB 이하인 PDF를 선택하세요.` },
	backend: { en: 'Choose a provider connected in Coach settings.', ko: '코치 설정에서 연결한 제공자를 선택하세요.' },
	busy: { en: 'This upload is still generating questions. Wait a moment and try again.', ko: '이 PDF의 문제를 생성 중입니다. 잠시 후 다시 시도하세요.' },
	unavailable: { en: 'Could not create a practice set. Try again shortly.', ko: '문제집을 만들지 못했습니다. 잠시 후 다시 시도하세요.' }
} satisfies Record<string, BiText>;

export const load = (async () => ({
	requestId: randomUUID(),
	sets: listPdfSets(),
	backends: await connectedCoaches()
})) satisfies PageServerLoad;

export const actions = {
	default: async ({ request }) => {
		let form: FormData;
		try {
			form = await request.formData();
		} catch (error) {
			if (error instanceof Error && 'status' in error && error.status === 413) {
				return fail<UploadFailure>(413, { error: errors.size });
			}
			return fail<UploadFailure>(400, { error: errors.request });
		}

		const requestId = form.get('requestId');
		if (typeof requestId !== 'string' || !uuid.test(requestId)) {
			return fail<UploadFailure>(400, { error: errors.request });
		}

		const priorSet = findPdfSetByRequest(requestId);
		if (priorSet !== null) redirect(303, `/library/${priorSet}`);
		// Tabs opened before the shared library launched still promise a private set.
		if (form.get('visibility') !== 'members') return fail<UploadFailure>(409, { error: errors.audience });

		const candidate = form.get('backend');
		if (typeof candidate !== 'string' || !Object.hasOwn(BACKENDS, candidate)) {
			return fail<UploadFailure>(400, { error: errors.backend, requestId });
		}
		const backend = candidate as BackendId;
		const reject = (status: number, error: BiText) => fail<UploadFailure>(status, { error, requestId, backend });
		const file = form.get('pdf');
		if (!(file instanceof File) || file.size === 0) return reject(400, errors.file);
		if (file.size > PDF_UPLOAD_MAX_BYTES) return reject(413, errors.size);

		const key = `${accountId()}:${requestId}`;
		if (inFlight.has(key)) return reject(409, errors.busy);
		inFlight.add(key);
		let setId: string;
		try {
			if (!(await connectedCoaches()).includes(backend)) return reject(503, errors.backend);
			const content = await generatePdfSet(file, backend, request.signal);
			const sourceName = file.name.split(/[\\/]/).at(-1)?.slice(0, 255).toWellFormed().trim() || 'PDF';
			setId = savePdfSet(sourceName, content, requestId);
		} catch (error) {
			if (error instanceof PdfGenerationError) return reject(error.status, error.text);
			return reject(503, errors.unavailable);
		} finally {
			inFlight.delete(key);
		}
		redirect(303, `/library/${setId}`);
	}
} satisfies Actions;
