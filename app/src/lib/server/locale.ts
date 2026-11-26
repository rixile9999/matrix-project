import { AsyncLocalStorage } from 'node:async_hooks';
import { englishLabel, type Locale } from '../locale.ts';

const context = new AsyncLocalStorage<Locale>();
export const withLocale = <T>(locale: Locale, fn: () => T) => context.run(locale, fn);
// Maintenance scripts and content verifiers read the original Korean sources.
export const english = () => context.getStore() === 'en';
export const tr = (korean: string, en: string) => english() ? en : korean;
export const label = (source: string) => english() ? englishLabel(source) : source;

export function bothLanguages<T>(read: () => T) {
	return { en: withLocale('en', read), ko: withLocale('ko', read) };
}
