import { page } from '$app/state';
import { englishLabel } from './locale.ts';

export function t(korean: string, english: string): string {
	return page.data.locale === 'ko' ? korean : english;
}

export function label(source: string): string {
	return t(source, englishLabel(source));
}
