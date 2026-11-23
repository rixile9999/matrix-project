import * as m from '#lib/server/memo.ts';
import type { MemoNotesData } from '#lib/types.ts';

export const load = async (): Promise<MemoNotesData> => m.notesView();
