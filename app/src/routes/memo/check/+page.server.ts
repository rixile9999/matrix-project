import * as m from '#lib/server/memo.ts';
import type { MemoCheckData } from '#lib/types.ts';

export const load = async (): Promise<MemoCheckData> => ({ checks: m.checkSession() });
