// The one shared sound engine (module singleton), synthesized with Web Audio. Created lazily by the first enable(true),
// which must come from a user gesture. Survives client-side navigation; Ambience.svelte only tells it the scene.
import { BEAT, BREATH, motifEvents, nextBreath } from './core';
import type { Scene, SoundMode } from './types';

type Ctor = typeof AudioContext;
type Out = AudioNode;

let ac: AudioContext | null = null;
let master: GainNode, bus: GainNode, toneLp: BiquadFilterNode, colour: GainNode, echo: GainNode, edge: GainNode;
let sources: (AudioScheduledSourceNode)[] = [];
let wanted = false; // sound switched on by the user
let volume = 0.6;
let mode: SoundMode = 'full'; // 'full' = bed + rhythm; 'bed' = bed only; 'quiet' = bed only, much lower
const level = () => volume * (mode === 'quiet' ? 0.35 : 1);
let scene: Scene = 'home';
let t0 = 0, nextMotif = 0, motifUntil = 0;
let pulseTimer: ReturnType<typeof setInterval> | null = null;
let motifTimer: ReturnType<typeof setInterval> | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
let live = 0; // transient nodes started and not yet ended (for leak checks)
let listening = false;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function transient(o: AudioScheduledSourceNode) {
	live++;
	o.onended = () => { live--; o.disconnect(); };
}

function init(): boolean {
	if (ac) return true;
	try {
		const C: Ctor | undefined = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
		if (!C) return false;
		ac = new C();
		const c = ac;
		master = c.createGain(); master.gain.value = level(); master.connect(c.destination);
		bus = c.createGain(); bus.gain.value = 0;
		toneLp = c.createBiquadFilter(); toneLp.type = 'lowpass'; toneLp.frequency.value = 700; toneLp.Q.value = 0.3;
		bus.connect(toneLp); toneLp.connect(master);
		echo = c.createGain(); toneLp.connect(echo);
		edge = c.createGain(); edge.gain.value = 0.9; edge.connect(master); edge.connect(echo); // the rhythm bypasses the tone filter
		t0 = c.currentTime; nextMotif = t0 + rand(40, 70);
		for (const [time, fb] of [[BEAT * 0.75, 0.34], [BEAT * 0.5, 0.3]]) { // two echoes in time with the beat stand in for a room
			const d = c.createDelay(1), f = c.createGain(), w = c.createGain();
			d.delayTime.value = time; f.gain.value = fb; w.gain.value = 0.32;
			echo.connect(d); d.connect(f); f.connect(d); d.connect(w); w.connect(master);
		}
		const voice = (freq: number, level: number, dest: Out) => { // two sines a few cents apart, breathing at their own slow rate
			for (const cents of [-3, 4]) {
				const o = c.createOscillator(), v = c.createGain(), l = c.createOscillator(), dp = c.createGain();
				o.frequency.value = freq; o.detune.value = cents; v.gain.value = level;
				l.frequency.value = rand(0.04, 0.1); dp.gain.value = level * 0.55;
				l.connect(dp); dp.connect(v.gain); o.connect(v); v.connect(dest); o.start(); l.start(); sources.push(o, l);
			}
		};
		[73.4, 110, 164.8].forEach((f, k) => voice(f, [0.07, 0.05, 0.032][k], bus)); // the bed: D, A, E
		colour = c.createGain(); colour.gain.value = 0; colour.connect(bus); // F#, B, C#: heard only when the chord opens
		[185, 246.9, 277.2, 370].forEach((f) => voice(f, 0.03, colour));
		// air: filtered noise that swells like a breath
		const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), ch = buf.getChannelData(0);
		for (let k = 0; k < ch.length; k++) ch[k] = Math.random() * 2 - 1;
		const n = c.createBufferSource(), bp = c.createBiquadFilter(), nv = c.createGain(), nl = c.createOscillator(), nd = c.createGain();
		n.buffer = buf; n.loop = true; bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.5; nv.gain.value = 0.012;
		nl.frequency.value = 1 / 11; nd.gain.value = 0.009; nl.connect(nd); nd.connect(nv.gain);
		n.connect(bp); bp.connect(nv); nv.connect(bus); n.start(); nl.start(); sources.push(n, nl);

		motifTimer = setInterval(() => {
			if (!ac || !wanted || mode !== 'full' || scene === 'still' || ac.currentTime < nextMotif) return;
			motif(false);
			nextMotif = ac.currentTime + rand(55, 95);
		}, 1000);
		if (typeof document !== 'undefined' && !listening) { document.addEventListener('visibilitychange', onVisibility); listening = true; }
		return true;
	} catch {
		teardown();
		return false;
	}
}

function onVisibility() {
	if (!ac) return;
	if (document.hidden) void ac.suspend().catch(() => {});
	else if (wanted) void ac.resume().catch(() => {});
}

function note(freq: number, t: number, dur: number, peak: number, glideTo?: number) {
	if (!ac) return;
	const o = ac.createOscillator(), v = ac.createGain();
	o.frequency.setValueAtTime(freq, t);
	if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
	v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur / 5)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(v); v.connect(toneLp); transient(o); o.start(t); o.stop(t + dur + 0.05);
}
function pluck(freq: number, t: number, dur: number, peak: number) {
	if (!ac) return;
	const o = ac.createOscillator(), f = ac.createBiquadFilter(), v = ac.createGain();
	o.type = 'sawtooth'; o.frequency.value = freq;
	f.type = 'bandpass'; f.Q.value = 7; f.frequency.setValueAtTime(freq * 5, t); f.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur);
	v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(peak, t + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(f); f.connect(v); v.connect(edge); transient(o); o.start(t); o.stop(t + dur + 0.05);
}
function thump(t: number, peak: number) {
	if (!ac) return;
	const o = ac.createOscillator(), v = ac.createGain();
	o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
	v.gain.setValueAtTime(peak, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
	o.connect(v); v.connect(master); transient(o); o.start(t); o.stop(t + 0.4);
}

function motif(now: boolean) {
	if (!ac || !wanted || ac.currentTime < motifUntil) return;
	// start on the next breath (at once when asked for by hand)
	const start = now ? ac.currentTime + 0.08 : nextBreath(t0, ac.currentTime);
	for (const e of motifEvents(start)) {
		if (e.kind === 'pluck') pluck(e.freq, e.t, e.dur, e.peak);
		else thump(e.t, e.peak);
	}
	motifUntil = start + 32 * BEAT + 2;
}

function stopPulse() {
	if (pulseTimer !== null) clearInterval(pulseTimer);
	pulseTimer = null;
}

function applyScene() {
	if (!ac || !wanted) return;
	const c = ac, t = c.currentTime;
	toneLp.frequency.cancelScheduledValues(t);
	stopPulse();
	if (scene === 'run') {
		toneLp.frequency.setTargetAtTime(380, t, 1.6); // the tone closes: attention narrows
		colour.gain.cancelScheduledValues(t); colour.gain.setTargetAtTime(0, t, 1.5);
		note(98, t, 1.4, 0.07, 146.8);
		nextMotif = Math.min(nextMotif, t + BREATH * 1.5); // the rhythm arrives soon after a problem opens
		let next = t + 1.2;
		pulseTimer = setInterval(() => { // a slow pulse, about 54 a minute
			if (!ac || ac.state !== 'running') { next = Math.max(next, (ac?.currentTime ?? 0) + 0.1); return; }
			while (next < ac.currentTime + 0.3) {
				const o = ac.createOscillator(), v = ac.createGain();
				o.frequency.value = 55; v.gain.setValueAtTime(0, next);
				v.gain.linearRampToValueAtTime(0.16, next + 0.04); v.gain.exponentialRampToValueAtTime(0.0001, next + 0.55);
				o.connect(v); v.connect(master); transient(o); o.start(next); o.stop(next + 0.6); next += 1.11;
			}
		}, 100);
	} else if (scene === 'result') {
		toneLp.frequency.setTargetAtTime(2200, t, 0.9); // the chord opens once ...
		toneLp.frequency.setTargetAtTime(800, t + 5, 2.5); // ... and settles
		colour.gain.cancelScheduledValues(t); colour.gain.setTargetAtTime(1, t, 0.8); colour.gain.setTargetAtTime(0, t + 5, 3);
		[880, 1318.5, 1760].forEach((f, k) => note(f, t + 0.15 + k * 0.22, 3.2, 0.035));
	} else if (scene === 'still') {
		toneLp.frequency.setTargetAtTime(380, t, 1.6); // the bed only: closed tone, no pulse, no rhythm
		colour.gain.cancelScheduledValues(t); colour.gain.setTargetAtTime(0, t, 1.5);
	} else {
		toneLp.frequency.setTargetAtTime(700, t, 2);
		colour.gain.cancelScheduledValues(t); colour.gain.setTargetAtTime(0, t, 1.5);
	}
}

/** Switch the sound on or off. Turning on must be called from a user gesture the first time. Never throws. */
export function enable(on: boolean): void {
	try {
		if (on && wanted && ac) return; // already on
		wanted = on;
		if (suspendTimer !== null) { clearTimeout(suspendTimer); suspendTimer = null; }
		if (on) {
			if (!init() || !ac) { wanted = false; return; }
			if (!document.hidden) void ac.resume().catch(() => {});
			bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setTargetAtTime(1, ac.currentTime, 1.2);
			applyScene();
		} else if (ac) {
			bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setTargetAtTime(0, ac.currentTime, 0.3);
			stopPulse();
			suspendTimer = setTimeout(() => { suspendTimer = null; if (!wanted && ac) void ac.suspend().catch(() => {}); }, 2000);
		}
	} catch { wanted = false; }
}

export function setVolume(v: number): void {
	volume = Math.min(1, Math.max(0, v));
	try { if (ac) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05); } catch { /* ignore */ }
}

/** How much of the sound scene plays: Sparring 'full', other screens 'bed' (no rhythm), work screens 'quiet'. */
export function setMode(m: SoundMode): void {
	if (m === mode) return;
	mode = m;
	try { if (ac) master.gain.setTargetAtTime(level(), ac.currentTime, 1.5); } catch { /* ignore */ }
}

/** Tell the engine which scene is showing. Safe to call before the sound is on; it applies when it comes on. */
export function setScene(s: Scene): void {
	if (s === scene) return;
	scene = s;
	try { applyScene(); } catch { /* ignore */ }
}

export function sfx(kind: 'ok' | 'bad' | 'tick'): void {
	try {
		if (!ac || !wanted) return;
		const t = ac.currentTime;
		if (kind === 'ok') { note(1318.5, t, 0.5, 0.05); note(1975.5, t + 0.04, 0.7, 0.022); }
		else if (kind === 'bad') note(146.8, t, 0.35, 0.09, 98);
		else note(1760, t, 0.12, 0.018);
	} catch { /* ignore */ }
}

/** Play the rhythm right now (for a demo button). */
export function motifNow(): void {
	try { motifUntil = 0; motif(true); } catch { /* ignore */ }
}

/** True once an AudioContext exists (the first user gesture has happened). */
export function isReady(): boolean { return ac !== null; }

/** Debug: persistent sources, transient nodes still alive, running timers, context state. */
export function stats() {
	return { sources: sources.length, live, pulse: pulseTimer !== null, motifTimer: motifTimer !== null, state: ac?.state ?? 'none', scene, mode, wanted, gain: master ? +master.gain.value.toFixed(3) : 0 };
}

function teardown() {
	stopPulse();
	if (motifTimer !== null) clearInterval(motifTimer);
	motifTimer = null;
	if (suspendTimer !== null) clearTimeout(suspendTimer);
	suspendTimer = null;
	if (listening && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
	listening = false;
	for (const s of sources) { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } }
	sources = [];
	live = 0;
	const c = ac;
	ac = null;
	wanted = false;
	if (c) void c.close().catch(() => {});
}

/** Stop everything and release the context. A later enable(true) starts a fresh engine. */
export function dispose(): void {
	try { teardown(); } catch { /* ignore */ }
}
