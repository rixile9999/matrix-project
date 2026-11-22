// Codeforces API client. CF allows ~1 request / 2s, so calls are serialized with a gap.
const BASE = 'https://codeforces.com/api';
const GAP_MS = 2100;

export type CfProblem = { contestId: number; index: string; name: string; rating: number; tags: string[]; solvedCount: number };
export type CfSubmission = { id: number; contestId?: number; problem: { contestId?: number; index: string }; verdict?: string; creationTimeSeconds: number };

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function call<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
	const run = async () => {
		const wait = lastAt + GAP_MS - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		try {
			const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
			const res = await fetch(`${BASE}/${method}?${qs}`, { signal: AbortSignal.timeout(30_000) });
			const body = (await res.json().catch(() => null)) as { status: string; comment?: string; result: T } | null;
			if (!body) throw new Error(`Codeforces API ${method}: HTTP ${res.status}`);
			if (body.status !== 'OK') throw new Error(body.comment ?? `Codeforces API ${method} failed`);
			return body.result;
		} finally {
			lastAt = Date.now();
		}
	};
	const p = chain.then(run, run);
	chain = p.catch(() => {});
	return p;
}

export async function fetchProblems(): Promise<CfProblem[]> {
	const r = await call<{
		problems: { contestId?: number; index: string; name: string; rating?: number; tags: string[] }[];
		problemStatistics: { contestId?: number; index: string; solvedCount: number }[];
	}>('problemset.problems');
	const solved = new Map(r.problemStatistics.map((s) => [`${s.contestId}${s.index}`, s.solvedCount]));
	const out: CfProblem[] = [];
	for (const p of r.problems) {
		if (p.rating == null || p.contestId == null) continue;
		out.push({
			contestId: p.contestId,
			index: p.index,
			name: p.name,
			rating: p.rating,
			tags: p.tags,
			solvedCount: solved.get(`${p.contestId}${p.index}`) ?? 0
		});
	}
	return out;
}

export const fetchSubmissions = (handle: string, count?: number) =>
	call<CfSubmission[]>('user.status', count ? { handle, from: 1, count } : { handle });

export async function fetchUserInfo(handle: string): Promise<{ handle: string; rating?: number }> {
	const r = await call<{ handle: string; rating?: number }[]>('user.info', { handles: handle });
	return r[0];
}
