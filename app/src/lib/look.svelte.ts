// The look setting: 'arena' (default; dark, with the ambience layer) or 'light' (the original light app).
// It lives in localStorage and as `data-look` on <html>; the inline script in app.html sets the attribute before the first
// paint. The state starts as 'arena' on server and client alike (so hydration matches) and syncs from the attribute on mount.
export type Look = 'arena' | 'light';

const KEY = 'look';
export const look = $state<{ value: Look }>({ value: 'arena' });

/** Read the look that app.html already applied. Call once from onMount in the root layout. */
export function syncLook(): void {
	look.value = document.documentElement.dataset.look === 'light' ? 'light' : 'arena';
}

export function setLook(v: Look): void {
	look.value = v;
	document.documentElement.dataset.look = v;
	try { localStorage.setItem(KEY, v); } catch { /* private mode: applies for this page only */ }
}
