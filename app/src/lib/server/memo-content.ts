import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Check, MemoCard, Pattern } from '#lib/core/memo.ts';

const DIR = resolve(process.env.MEMO_DIR ?? 'memo');

function readAll<T>(lang: string, sub: string): T[] {
	const dir = join(DIR, lang, sub);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T[]);
}

export const listCards = (lang: string) => readAll<MemoCard>(lang, 'cards');
export const listChecks = (lang: string) => readAll<Check>(lang, 'checks');
/** patterns.json plus any patterns-*.json next to it, merged. */
export function loadPatterns(lang: string): Record<string, Pattern> {
	const dir = join(DIR, lang);
	if (!existsSync(dir)) return {};
	const out: Record<string, Pattern> = {};
	for (const f of readdirSync(dir).filter((f) => /^patterns(-[\w-]+)?\.json$/.test(f)).sort())
		Object.assign(out, JSON.parse(readFileSync(join(dir, f), 'utf8')));
	return out;
}
/** File name (without .json) of each card/check, for verifier messages and filters. */
export function memoFiles(lang: string, sub: 'cards' | 'checks'): string[] {
	const dir = join(DIR, lang, sub);
	return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
}
export const readMemoFile = <T>(lang: string, sub: 'cards' | 'checks', file: string) =>
	JSON.parse(readFileSync(join(DIR, lang, sub, file), 'utf8')) as T[];
