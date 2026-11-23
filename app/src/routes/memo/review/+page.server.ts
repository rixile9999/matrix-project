import * as m from '#lib/server/memo.ts';
import type { MemoReviewData } from '#lib/types.ts';

export const load = async (): Promise<MemoReviewData> => ({ cards: m.reviewSession() });
