import * as s from '#lib/server/spar.ts';
import type { SparRecordsData } from '#lib/types.ts';

export const load = async (): Promise<SparRecordsData> => s.recordsData();
