import { pickBackdrop } from './core';
import type { AmbienceSettings, Backdrop } from './types';

const KEY = 'ambience';
const DEFAULTS: AmbienceSettings = { sound: false, volume: 0.6, motion: true, backdrop: 'random' };
const BACKDROP_VALUES = ['none', 'earthrise', 'blackhole', 'earth', 'random'];

function load(): AmbienceSettings {
	const s = { ...DEFAULTS };
	try {
		const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
		if (raw) {
			const o = JSON.parse(raw) as Partial<AmbienceSettings>;
			if (typeof o.sound === 'boolean') s.sound = o.sound;
			if (typeof o.volume === 'number' && o.volume >= 0 && o.volume <= 1) s.volume = o.volume;
			if (typeof o.motion === 'boolean') s.motion = o.motion;
			if (typeof o.backdrop === 'string' && BACKDROP_VALUES.includes(o.backdrop)) s.backdrop = o.backdrop as AmbienceSettings['backdrop'];
		}
	} catch { /* unreadable storage: keep defaults */ }
	return s;
}

export const settings: AmbienceSettings = $state(load());

let saved = JSON.stringify(settings);
/** Persist when something changed. Called by the components' effects; cheap and idempotent. */
export function saveSettings(): void {
	const json = JSON.stringify({ sound: settings.sound, volume: settings.volume, motion: settings.motion, backdrop: settings.backdrop });
	if (json === saved) return;
	saved = json;
	try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, json); } catch { /* private mode etc. */ }
}

let randomPick: Backdrop | null = null;
/** The backdrop to show. 'random' is drawn once per page load and stays put while the page lives. */
export function resolveBackdrop(): Backdrop {
	if (settings.backdrop !== 'random') return settings.backdrop;
	return (randomPick ??= pickBackdrop('random'));
}
