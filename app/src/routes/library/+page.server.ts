import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
import { PDF_UPLOAD_MAX_BYTES, type BiText } from '#lib/pdf-sets.ts';
import { pdfJob, recentPdfJob, startPdfJob } from '#lib/server/pdf-jobs.ts';
import { findPdfSetByRequest, listPdfSets } from '#lib/server/pdf-sets.ts';
import { coachConnections } from '#lib/server/worker.ts';
import type { Actions, PageServerLoad } from './$types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxMiB = PDF_UPLOAD_MAX_BYTES / (1024 * 1024);

type UploadFailure = { error: BiText; requestId?: string; backend?: BackendId };

const errors = {
	audience: { en: 'New sets are shared with all signed-in members. Reload the upload form before generating a set.', ko: '새 문제집은 모든 로그인 회원에게 공개됩니다. 업로드 화면을 새로고침한 뒤 생성하세요.' },
	scope: { en: 'Reload the form to confirm full-book processing before uploading.', ko: '책 전체 처리 안내를 확인할 수 있도록 업로드 화면을 새로고침하세요.' },
	request: { en: 'The upload could not be read. Choose a PDF and try again.', ko: '업로드를 읽지 못했습니다. PDF를 선택하고 다시 시도하세요.' },
	file: { en: 'Choose a PDF to upload.', ko: '업로드할 PDF를 선택하세요.' },
	size: { en: `Choose a PDF that is ${maxMiB} MiB or smaller.`, ko: `${maxMiB} MiB 이하인 PDF를 선택하세요.` },
	backend: { en: 'Choose a provider connected in Coach settings.', ko: '코치 설정에서 연결한 제공자를 선택하세요.' },
	busy: { en: 'A PDF is already being processed for your account. Open its progress from the library.', ko: '이 계정에서 이미 PDF를 처리하고 있습니다. 목록에서 진행 상황을 확인하세요.' }
} satisfies Record<string, BiText>;

export const load = (async () => ({
	requestId: randomUUID(),
	sets: listPdfSets(),
	job: recentPdfJob(),
	connections: await coachConnections()
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

		const job = pdfJob(requestId);
		if (job && job.stage !== 'failed') redirect(303, `/library/jobs/${requestId}`);

		// Earlier member-library forms disclosed sending only the first ten pages.
		if (form.get('scope') !== 'whole-book') return fail<UploadFailure>(409, { error: errors.scope });
		const candidate = form.get('backend');
		if (typeof candidate !== 'string' || !Object.hasOwn(BACKENDS, candidate)) {
			return fail<UploadFailure>(400, { error: errors.backend, requestId });
		}
		const backend = candidate as BackendId;
		const reject = (status: number, error: BiText) => fail<UploadFailure>(status, { error, requestId, backend });
		const file = form.get('pdf');
		if (!(file instanceof File) || file.size === 0) return reject(400, errors.file);
		if (file.size > PDF_UPLOAD_MAX_BYTES) return reject(413, errors.size);

		const { methods } = await coachConnections();
		if (!methods[backend]) return reject(503, errors.backend);
		const id = startPdfJob(requestId, file, backend);
		if (!id) return reject(409, errors.busy);
		redirect(303, `/library/jobs/${id}`);
	}
} satisfies Actions;
