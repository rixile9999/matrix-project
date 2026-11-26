import { json } from '@sveltejs/kit';
import { readJson } from '#lib/server/memo.ts';
import { recordMark } from '#lib/server/debrief.ts';

/** Tab hidden/shown and input stopped/resumed while a session is open (Debrief). Anything else is ignored: { recorded: false }. */
export const POST = async ({ params, request }) => json({ recorded: recordMark(params.id, (await readJson(request)).kind) });
