import { readPack } from './content-language.ts';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOPICS, type CheatEntry, type TopicId } from '#lib/core/lang.ts';

const DIR = resolve(process.env.CHEATSHEET_DIR ?? 'cheatsheet');

/** The fixed id list: topic -> [id, title][]. */
export function cheatIndex(lang: string): Record<TopicId, [string, string][]> {
	return JSON.parse(readFileSync(join(DIR, lang, '_index.json'), 'utf8'));
}

/** All written entries, in topic order then index order. */
export function listCheatEntries(lang: string): CheatEntry[] {
	const dir = join(DIR, lang);
	if (!existsSync(dir)) return [];
	const index = cheatIndex(lang);
	const out: CheatEntry[] = [];
	for (const topic of Object.keys(TOPICS) as TopicId[]) {
		const f = join(dir, `${topic}.json`);
		if (!existsSync(f)) continue;
		const entries = readPack(readFileSync(f, 'utf8')) as CheatEntry[];
		const pos = new Map((index[topic] ?? []).map(([id], i) => [id, i]));
		out.push(...entries.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999)));
	}
	return out;
}

export const cheatFiles = (lang: string) =>
	readdirSync(join(DIR, lang)).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
