import { error, json } from '@sveltejs/kit';
import * as l from '#lib/server/lang.ts';
import type { LangRunResponse } from '#lib/types.ts';

/** Rejections keep the LangRunResponse shape: an empty 'failed' result (no cases, the message as output) plus `error`. */
const rejected = (message: string) =>
	json({ result: { status: 'failed', cases: [], output: message, avoided: [] }, finished: false, error: message } satisfies LangRunResponse, { status: 400 });

export const POST = async ({ params, request }) => {
	if (!l.findProblem(params.id)) error(404, 'Problem not found');
	let code: unknown;
	try {
		code = ((await request.json()) as { code?: unknown } | null)?.code;
	} catch {
		return rejected('요청 형식이 올바르지 않습니다.');
	}
	try {
		return json((await l.runCode(params.id, code)) satisfies Omit<LangRunResponse, 'error'>);
	} catch (e) {
		return rejected(e instanceof Error ? e.message : String(e));
	}
};
