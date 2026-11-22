import * as s from '#lib/server/service.ts';
import type { HistoryData } from '#lib/types.ts';

export const load = (): HistoryData => s.history();
