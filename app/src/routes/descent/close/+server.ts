import { json } from '@sveltejs/kit';
import { closeThread } from '#lib/server/descent.ts';

/** Ends the open thread. */
export const POST = () => json(closeThread(), { headers: { 'cache-control': 'no-store' } });
