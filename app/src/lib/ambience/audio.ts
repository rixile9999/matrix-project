// One audio clock and score per page session, shared across route changes.
import { hz, newScore, newSpacePattern, type PulseNote } from './score';
import type { MusicTrack, Scene, SoundMode } from './types';

let ac: AudioContext | null = null;
let master: GainNode, room: GainNode, music: BiquadFilterNode;
let airBand: BiquadFilterNode, bed: GainNode;
let strings: PeriodicWave;
let track: MusicTrack = 'patterns';
let space: ReturnType<typeof newSpacePattern> | undefined;
let score: ReturnType<typeof newScore>;
let harmony: number[] = [];
let drones: { oscillator: OscillatorNode; gain: GainNode }[] = [];
const samples = new Map<number, AudioBuffer>();
const sampleNotes: [number, string][] = [[57,'A3'],[60,'C4'],[66,'Fs4'],[69,'A4']];
let wanted = false, volume = 0.6, live = 0;
let scene: Scene = 'home', mode: SoundMode = 'full';
let nextChord = 0, nextPulse = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let sleep: ReturnType<typeof setTimeout> | undefined;
const range = (low: number, high: number) => low + Math.random() * (high - low);
const gainLevel = () => wanted ? volume * (mode === 'quiet' ? 0.35 : 1) : 0;

function retire(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
	const context = ac;
	live++;
	source.onended = () => {
		source.disconnect();
		for (const node of nodes) node.disconnect();
		if (ac === context) live--;
	};
}

async function loadPiano(context: AudioContext) {
	await Promise.all(sampleNotes.map(async ([midi, file]) => {
		try {
			const response = await fetch('/audio/piano/' + file + '.mp3');
			if (!response.ok) return;
			const buffer = await context.decodeAudioData(await response.arrayBuffer());
			if (context === ac) samples.set(midi, buffer);
		} catch { /* A soft synthesized note covers missing or undecodable samples. */ }
	}));
}

function drone(midi: number, voice: number, at: number) {
	const c = ac!;
	const oscillator = c.createOscillator(), gain = c.createGain();
	oscillator.frequency.value = hz(midi);
	oscillator.detune.value = [-2, 1, 3][voice];
	gain.gain.setValueAtTime(0, at);
	gain.gain.linearRampToValueAtTime([0.066, 0.046, 0.032][voice], at + 5);
	oscillator.connect(gain).connect(bed);
	oscillator.start(at);
	return { oscillator, gain };
}

function init() {
	if (ac) return true;
	try {
		const C = typeof window === 'undefined' ? undefined : window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!C) return false;
		const c = ac = new C();
		master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
		music = c.createBiquadFilter(); music.type = 'lowpass'; music.Q.value = 0.45; music.connect(master);
		bed = c.createGain(); bed.gain.value = track === 'space' ? 0.09 : 1; bed.connect(music);
		strings = c.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, 0.44, 0.24, 0.14, 0.08]));
		room = c.createGain(); room.gain.value = 0.19;
		for (const delay of [0.19, 0.37]) {
			const tap = c.createDelay(1), feedback = c.createGain();
			tap.delayTime.value = delay; feedback.gain.value = 0.23;
			room.connect(tap).connect(feedback).connect(tap);
			tap.connect(music);
		}
		const air = c.createBufferSource(), airLevel = c.createGain();
		const noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		air.buffer = noise; air.loop = true;
		airBand = c.createBiquadFilter(); airBand.type = 'bandpass'; airBand.frequency.value = 680;
		airLevel.gain.value = 0.013;
		air.connect(airBand).connect(airLevel).connect(bed);
		air.start();
		score = newScore();
		if (track === 'space') space = newSpacePattern(score.transpose);
		harmony = score.voicing();
		drones = harmony.map((pitch, i) => drone(pitch, i, c.currentTime));
		nextChord = c.currentTime + range(45,120);
		nextPulse = c.currentTime + 0.12;
		timer = setInterval(advance, 100);
		document.addEventListener('visibilitychange', visibility);
		void loadPiano(c);
		return true;
	} catch { dispose(); return false; }
}

function playNote(note: PulseNote, at: number, pulseSeconds: number) {
	const { midi, echo, accent, instrument } = note;
	const focused = mode === 'quiet' || scene === 'still' || scene === 'run';
	const level = (focused ? 0.48 : mode === 'bed' ? 0.8 : 1) *
		(echo ? 0.55 : 1) * (accent ? 1 : 0.78);
	if (instrument !== 'piano') {
		const ringing = track === 'space' ? 1.75 : 1;
		const duration = pulseSeconds * (instrument === 'strings' ? 3.2 : 2.5) * ringing;
		const c = ac!;
		function partial(ratio: number, length: number, attack: number, peak: number) {
			const oscillator = c.createOscillator(), envelope = c.createGain();
			oscillator.frequency.value = hz(midi) * ratio;
			if (instrument === 'strings') oscillator.setPeriodicWave(strings);
			envelope.gain.setValueAtTime(0, at);
			envelope.gain.linearRampToValueAtTime(peak * level, at + attack);
			envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
			oscillator.connect(envelope);
			envelope.connect(music); envelope.connect(room);
			retire(oscillator, envelope);
			oscillator.start(at); oscillator.stop(at + length + 0.03);
		}
		if (instrument === 'strings') partial(1, duration, duration * 0.25, 0.092);
		else {
			partial(1, duration, 0.012, 0.09);
			partial(3.98, duration * 0.22, 0.008, 0.032);
		}
		return;
	}
	const duration = pulseSeconds * (track === 'space' ? 2.7 : echo ? 1.05 : 1.45);
	const c = ac!;
	const envelope = c.createGain(), felt = c.createBiquadFilter();
	felt.type = 'lowpass'; felt.Q.value = 0.45;
	felt.frequency.setValueAtTime(echo ? 1450 : 2050, at);
	felt.frequency.exponentialRampToValueAtTime(680, at + duration);
	let source: AudioBufferSourceNode | OscillatorNode;
	let peak: number;
	if (samples.size) {
		const nearest = [...samples.keys()].reduce((a,b) => Math.abs(midi-a) <= Math.abs(midi-b) ? a : b);
		const sampler = c.createBufferSource();
		sampler.buffer = samples.get(nearest)!;
		sampler.playbackRate.value = 2 ** ((midi-nearest)/12);
		source = sampler; peak = 0.32 * level;
	} else {
		const osc = c.createOscillator();
		osc.type = 'triangle'; osc.frequency.value = hz(midi);
		source = osc; peak = 0.06 * level;
	}
	envelope.gain.setValueAtTime(0, at);
	envelope.gain.linearRampToValueAtTime(peak, at + 0.023);
	envelope.gain.exponentialRampToValueAtTime(peak * 0.45, at + duration * 0.6);
	envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.26);
	source.connect(envelope).connect(felt);
	felt.connect(music); felt.connect(room);
	retire(source, envelope, felt);
	source.start(at); source.stop(at + duration + 0.3);
}

function advance() {
	if (!ac || !wanted || ac.state !== 'running' || document.hidden) return;
	const t = ac.currentTime;
	if (t >= nextChord) {
		const next = score.changeChord();
		const i = next.findIndex((n, index) => n !== harmony[index]);
		const old = drones[i];
		old.gain.gain.setTargetAtTime(0, t, 1.25);
		retire(old.oscillator, old.gain);
		old.oscillator.stop(t + 6);
		drones[i] = drone(next[i], i, t);
		harmony = next;
		airBand.frequency.setTargetAtTime(range(490,890), t, 9);
		nextChord = t + range(45,120);
	}
	// Anchor to the audio clock. After a stalled tab, resume without a burst of overdue notes.
	if (nextPulse < t) nextPulse = t + 0.03;
	const pattern = track === 'space' ? space! : score;
	while (nextPulse < t + 0.24) {
		for (const note of pattern.nextPulse()) playNote(note, nextPulse, pattern.pulseSeconds);
		nextPulse += pattern.pulseSeconds;
	}
}

function visibility() {
	if (!ac) return;
	if (document.hidden) void ac.suspend().catch(()=>{});
	else if (wanted) void ac.resume().catch(()=>{});
}
function mix() {
	if (!ac) return;
	const t = ac.currentTime;
	const cutoff = scene === 'still' || mode === 'quiet' ? 760 : scene === 'run' ? 1080 : 2100;
	music.frequency.setTargetAtTime(cutoff,t,1.2);
	master.gain.setTargetAtTime(gainLevel(),t,wanted ? 0.35 : 0.08);
}

export function enable(on: boolean) {
	if (wanted === on && ac) return;
	wanted = on;
	clearTimeout(sleep);
	if (on) {
		if (!init()) { wanted = false; return; }
		if (!document.hidden) void ac!.resume().catch(()=>{});
	} else if (ac) {
		sleep = setTimeout(()=>{ if (!wanted) void ac?.suspend().catch(()=>{}); },500);
	}
	mix();
}
export function setTrack(value: MusicTrack) {
	if (track === value) return;
	track = value;
	if (!ac) return;
	if (track === 'space') space = newSpacePattern(score.transpose);
	const t = ac.currentTime;
	bed.gain.setTargetAtTime(track === 'space' ? 0.09 : 1, t, 0.32);
	// Let the previous lookahead and the ringing notes finish naturally.
	nextPulse = t + 0.36;
}
export function setVolume(v: number) { volume = Math.min(1,Math.max(0,v)); mix(); }
export function setMode(m: SoundMode) { mode = m; mix(); }
export function setScene(s: Scene) {
	if (scene === s) return;
	scene = s;
	mix();
}

export function sfx(kind: 'ok' | 'bad' | 'tick') {
	if (!ac || !wanted) return;
	const c = ac, t = c.currentTime;
	function tone(freq: number, at: number, duration: number, peak: number, glide?: number) {
		const osc = c.createOscillator(), env = c.createGain();
		osc.frequency.setValueAtTime(freq,at);
		if (glide) osc.frequency.exponentialRampToValueAtTime(glide,at+duration);
		env.gain.setValueAtTime(0,at); env.gain.linearRampToValueAtTime(peak,at+0.02);
		env.gain.exponentialRampToValueAtTime(0.0001,at+duration);
		osc.connect(env).connect(music); retire(osc,env);
		osc.start(at); osc.stop(at+duration+0.05);
	}
	if (kind === 'ok') { tone(1318.5,t,0.5,0.05); tone(1975.5,t+0.04,0.7,0.022); }
	else if (kind === 'bad') tone(146.8,t,0.35,0.09,98);
	else tone(1760,t,0.12,0.018);
}

export const isReady = () => ac !== null;
export const stats = () => ({
	sources:ac ? drones.length + 1 : 0, live, pulse:!!timer && wanted, motifTimer:!!timer, state:ac?.state ?? 'none',
	scene, mode, wanted, gain:ac ? master.gain.value : 0
});
export function dispose() {
	clearInterval(timer); timer = undefined;
	clearTimeout(sleep);
	if (typeof document !== 'undefined') document.removeEventListener('visibilitychange',visibility);
	const c = ac;
	ac = null; wanted = false; drones = []; live = 0; samples.clear();
	if (c) void c.close().catch(()=>{});
}
