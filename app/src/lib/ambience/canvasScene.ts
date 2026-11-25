// The procedural picture: a dark body's limb with light behind it, drifting dust, and a thin orbit whose small body marks progress.
import { SCENE_PARAMS, bloomStep, easeParams, easeProgress, orbitProgress, rippleStep, type Bloom, type Params } from './core';
import type { Scene } from './types';

type Dust = { x: number; y: number; z: number; tw: number; ph: number };
const TAU = 6.283;

export function createCanvasScene(cv: HTMLCanvasElement) {
	const g = cv.getContext('2d');
	const dust: Dust[] = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: 0.2 + Math.random() * 0.5, ph: Math.random() * TAU }));
	let W = 0, H = 0, T = 0;
	let scene: Scene = 'home';
	let cur: Params = [...SCENE_PARAMS.home];
	let bloom: Bloom = { value: 0, target: 0 };
	let ripple = -1;
	let wantProgress: number | undefined;
	let prog = 0;
	let vid = false; // over a video the canvas only adds what reacts: orbit, body, the bloom and its wave

	function resize() {
		const r = cv.getBoundingClientRect(), d = Math.min(globalThis.devicePixelRatio || 1, 2);
		W = r.width; H = r.height;
		cv.width = Math.max(1, Math.round(W * d)); cv.height = Math.max(1, Math.round(H * d));
		g?.setTransform(d, 0, 0, d, 0, 0);
	}

	/** Advance the easing by dt seconds. */
	function step(dt: number) {
		dt = Math.min(0.05, dt);
		T += dt;
		cur = easeParams(cur, SCENE_PARAMS[scene], dt);
		bloom = bloomStep(bloom, dt);
		ripple = rippleStep(ripple, dt);
		prog = easeProgress(prog, orbitProgress(scene, wantProgress), dt);
		drift(dt);
	}

	function drift(dt: number) {
		for (const s of dust) {
			const a = Math.sin(s.y * 3 + T * 0.05) * 1.2 + Math.cos(s.x * 2.3 - T * 0.04);
			s.x += (Math.cos(a) * cur[0] * s.z * 0.006 + (0.5 - s.x) * cur[1] * 0.02) * dt;
			s.y += (Math.sin(a) * cur[0] * s.z * 0.004 + (0.66 - s.y) * cur[1] * 0.02) * dt;
			if (s.x < -0.02) s.x = 1.02; else if (s.x > 1.02) s.x = -0.02;
			if (s.y < -0.02) s.y = 0.7; else if (s.y > 0.72) s.y = -0.02;
		}
	}

	/** Jump to the settled picture for the current scene (no motion, no bloom). */
	function settle() {
		cur = [...SCENE_PARAMS[scene]];
		bloom = { value: 0, target: 0 };
		ripple = -1;
		prog = orbitProgress(scene, wantProgress);
	}

	function draw() {
		if (!g || W === 0) return;
		const breath = (Math.sin((T * TAU) / 11) + 1) / 2; // one breath every 11 seconds
		const light = cur[2] * (0.75 + 0.25 * breath) + bloom.value * 0.9;
		const cx = W / 2, top = H * 0.66, R = Math.max(W * 0.95, 720), cy = top + R;
		let gr: CanvasGradient;
		if (vid) g.clearRect(0, 0, W, H);
		else {
			g.fillStyle = '#06070b'; g.fillRect(0, 0, W, H);
			gr = g.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.8);
			gr.addColorStop(0, 'rgba(70, 82, 150, .10)'); gr.addColorStop(1, 'rgba(70, 82, 150, 0)');
			g.fillStyle = gr; g.fillRect(0, 0, W, H);
		}

		for (const s of dust) {
			const px = s.x * W, py = s.y * H;
			let al = (0.18 + 0.5 * s.z) * (0.7 + 0.3 * Math.sin(T * s.tw + s.ph)) * cur[3] * (vid ? 0.35 : 1);
			if (ripple >= 0) { // the wave passing through lifts each grain for a moment
				const d = Math.abs(Math.hypot(px - cx, py - top) - ripple * W * 0.8);
				if (d < 40) al += (1 - d / 40) * (1 - ripple) * 0.6;
			}
			g.fillStyle = `rgba(236, 235, 230, ${Math.min(1, al)})`;
			g.beginPath(); g.arc(px, py, s.z * 1.15, 0, TAU); g.fill();
		}

		// light behind the limb, then the dark body over it, then the thin rim
		const lit = vid ? bloom.value * 0.9 : light;
		gr = g.createRadialGradient(cx, top + 10, 0, cx, top + 10, W * 0.52);
		gr.addColorStop(0, `rgba(255, 220, 180, ${0.34 * lit})`); gr.addColorStop(0.35, `rgba(214, 170, 190, ${0.12 * lit})`); gr.addColorStop(1, 'rgba(120, 130, 220, 0)');
		g.fillStyle = gr; g.fillRect(0, 0, W, H);
		if (!vid) {
			g.fillStyle = '#05060a'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
			const rim = g.createLinearGradient(cx - W * 0.5, 0, cx + W * 0.5, 0);
			rim.addColorStop(0, 'rgba(255, 236, 214, 0)'); rim.addColorStop(0.5, `rgba(255, 236, 214, ${Math.min(1, 0.25 + light)})`); rim.addColorStop(1, 'rgba(255, 236, 214, 0)');
			g.strokeStyle = rim; g.lineWidth = 1.1; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
		}
		if (ripple >= 0) {
			g.strokeStyle = `rgba(255, 236, 214, ${(1 - ripple) * 0.22})`; g.lineWidth = 1;
			g.beginPath(); g.arc(cx, top, ripple * W * 0.8, Math.PI, TAU); g.stroke();
		}

		// orbit: a hairline ellipse; the travelled part is a little brighter, the body sits at the current progress
		const ox = cx, oy = top - H * 0.2, rx = Math.min(W * 0.36, 380), ry = rx * 0.26, rot = -0.16, a0 = -Math.PI * 0.5;
		g.lineWidth = 1; g.strokeStyle = 'rgba(236, 235, 230, .10)';
		g.beginPath(); g.ellipse(ox, oy, rx, ry, rot, 0, TAU); g.stroke();
		if (prog > 0) { g.strokeStyle = 'rgba(236, 235, 230, .34)'; g.beginPath(); g.ellipse(ox, oy, rx, ry, rot, a0, a0 + prog * TAU); g.stroke(); }
		const ba = a0 + prog * TAU, ex = Math.cos(ba) * rx, ey = Math.sin(ba) * ry;
		const bx = ox + ex * Math.cos(rot) - ey * Math.sin(rot), by = oy + ex * Math.sin(rot) + ey * Math.cos(rot);
		const halo = 10 + 8 * breath + bloom.value * 26;
		gr = g.createRadialGradient(bx, by, 0, bx, by, halo);
		gr.addColorStop(0, `rgba(255, 236, 214, ${0.4 + bloom.value * 0.3})`); gr.addColorStop(1, 'rgba(255, 236, 214, 0)');
		g.fillStyle = gr; g.beginPath(); g.arc(bx, by, halo, 0, TAU); g.fill();
		g.fillStyle = '#fff6ea'; g.beginPath(); g.arc(bx, by, 2.2, 0, TAU); g.fill();
	}

	return {
		resize, step, draw, settle,
		setScene(s: Scene) { scene = s; },
		setProgress(p: number | undefined) { wantProgress = p; },
		setOverVideo(v: boolean) { vid = v; },
		fireBloom() { bloom = { ...bloom, target: 1 }; ripple = 0; },
	};
}
export type CanvasScene = ReturnType<typeof createCanvasScene>;
