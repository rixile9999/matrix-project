import { reviewSession } from '#lib/server/memo.ts';
import { bothLanguages } from '#lib/server/locale.ts';

export const load = () => ({ queue: bothLanguages(reviewSession) });
