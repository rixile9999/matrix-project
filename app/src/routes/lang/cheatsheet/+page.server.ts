import * as l from '#lib/server/lang.ts';
import type { LangCheatData } from '#lib/types.ts';

export const load = async (): Promise<LangCheatData> => l.cheatView();
