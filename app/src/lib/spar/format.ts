const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** "11. 25. 14:03" from unix seconds; fixed zone so server and browser render the same text. */
export const fmtDate = (sec: number): string => fmt.format(new Date(sec * 1000));
const fmtLong = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDateLong = (sec: number): string => fmtLong.format(new Date(sec * 1000));
/** "12초" / "1분 05초" for a difference; the sign is words, not a symbol. */
export function fmtSpan(ms: number): string {
	const s = Math.round(Math.abs(ms) / 1000);
	return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
}
