import { describe, expect, it } from 'vitest';
import { parseLocale } from '../locale.ts';
import { readPack } from './content-language.ts';
import { bothLanguages, tr, withLocale } from './locale.ts';
import { listProblems } from './judge.ts';
import { listCards, listChecks } from './memo-content.ts';
import { listCheatEntries } from './cheatsheet.ts';

describe('language selection', () => {
	it('defaults to English and keeps simultaneous requests independent', async () => {
		expect([undefined, 'en', 'fr', 'ko'].map(parseLocale)).toEqual(['en', 'en', 'en', 'ko']);
		const concurrent = bothLanguages(async () => {
			await new Promise(resolve => setTimeout(resolve, 1));
			return tr('한국어', 'English');
		});
		expect(await Promise.all([concurrent.en, concurrent.ko])).toEqual(['English', '한국어']);
	});

	it('translates authored prose and retains test matchers, programs and trace answers', () => {
		const raw = JSON.stringify({
			kind: 'trace', title: '패턴 매칭', cases: ['패턴 매칭'], lines: ['패턴 매칭'],
			options: [{ text: '패턴 매칭', why: '패턴 매칭' }]
		});
		const original = JSON.parse(raw) as { title: string; cases: string[]; lines: string[]; options: { text: string; why: string }[] };
		const english = withLocale('en', () => readPack<typeof original>(raw));
		expect(english.title).not.toMatch(/[가-힣]/);
		expect(english.cases).toEqual(original.cases);
		expect(english.lines).toEqual(original.lines);
		expect(english.options[0].text).toBe(original.options[0].text);
		expect(english.options[0].why).toBe(english.title);
		expect(withLocale('ko', () => readPack(raw))).toEqual(original);
	});

	it('ships English and Korean for the same exercises, hints, cards and checks', () => {
		const problems = bothLanguages(() => listProblems('scala'));
		expect(problems.en.map(p => [p.id, p.starter, p.refs, p.avoid])).toEqual(problems.ko.map(p => [p.id, p.starter, p.refs, p.avoid]));
		const withoutInlineCode = (text: string) => text.replace(/`[^`]*`/g, '');
		for (const p of problems.en) {
			expect([p.title, p.statement, ...p.hints, p.notes, p.intent ?? ''].map(withoutInlineCode).join('\n'), p.id).not.toMatch(/[가-힣]/);
		}
		const cards = bothLanguages(() => listCards('scala'));
		expect(cards.en.map(c => [c.id, c.answerCode])).toEqual(cards.ko.map(c => [c.id, c.answerCode]));
		const checks = bothLanguages(() => listChecks('scala'));
		expect(checks.en.map(c => c.id)).toEqual(checks.ko.map(c => c.id));
		const cheats = bothLanguages(() => listCheatEntries('scala'));
		expect(cheats.en.map(c => [c.id, c.code])).toEqual(cheats.ko.map(c => [c.id, c.code]));
	});
});
