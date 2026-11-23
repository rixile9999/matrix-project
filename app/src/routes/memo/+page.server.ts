import * as m from '#lib/server/memo.ts';
import type { MemoHomeData } from '#lib/types.ts';

export const load = async (): Promise<MemoHomeData> => m.homeView();
