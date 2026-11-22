/** CSS variable for the Codeforces rank band of a rating. */
export function rankColor(rating: number): string {
	if (rating < 1200) return 'var(--rk-gray)';
	if (rating < 1400) return 'var(--rk-green)';
	if (rating < 1600) return 'var(--rk-cyan)';
	if (rating < 1900) return 'var(--rk-blue)';
	if (rating < 2100) return 'var(--rk-violet)';
	if (rating < 2400) return 'var(--rk-orange)';
	return 'var(--rk-red)';
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Seconds -> mm:ss (minutes may exceed 59). */
export function mmss(sec: number): string {
	const s = Math.max(0, Math.round(sec));
	return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}

/** Signed integer delta with a real minus sign. */
export function signed(n: number): string {
	const r = Math.round(n);
	return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0';
}

export function dateTime(t: number): string {
	const d = new Date(t * 1000);
	return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
