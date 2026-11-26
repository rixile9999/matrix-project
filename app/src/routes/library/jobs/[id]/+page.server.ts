import { error, redirect } from '@sveltejs/kit';
import { findPdfSetByRequest } from '#lib/server/pdf-sets.ts';
import { pdfJob } from '#lib/server/pdf-jobs.ts';
import { tr } from '#lib/server/locale.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, depends }) => {
	depends('matrix:pdf-job');
	const id = findPdfSetByRequest(params.id);
	if (id) redirect(303, `/library/${id}`);
	const job = pdfJob(params.id);
	if (!job) error(404, tr('생성 작업을 찾을 수 없습니다.', 'Generation job not found.'));
	return { job };
};
