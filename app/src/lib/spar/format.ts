import { page } from '$app/state';
import { t } from '#lib/i18n.svelte.ts';

// Use the same time zone on the server and in the browser.
const time = { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false } as const;
const formats = (locale: string) => ({
	short: new Intl.DateTimeFormat(locale, { ...time, month: 'numeric', day: 'numeric' }),
	long: new Intl.DateTimeFormat(locale, { ...time, year: 'numeric', month: 'long', day: 'numeric' })
});
const byLocale = { en: formats('en-US'), ko: formats('ko-KR') };
export const fmtDate = (sec: number) => byLocale[page.data.locale].short.format(new Date(sec * 1000));
export const fmtDateLong = (sec: number) => byLocale[page.data.locale].long.format(new Date(sec * 1000));

export function fmtSpan(ms: number): string {
	const seconds = Math.round(Math.abs(ms) / 1000);
	if (seconds < 60) return t(`${seconds}초`, `${seconds}s`);
	const minutes = Math.floor(seconds / 60);
	const rest = String(seconds % 60).padStart(2, '0');
	return t(`${minutes}분 ${rest}초`, `${minutes}m ${rest}s`);
}
