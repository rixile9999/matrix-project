// The plant of the Garden page: a seeded branching form drawn as ink-brush ribbons on a canvas.
// The shape is a pure function of the form (every random choice is hash(seed, node path, purpose), never a sequential stream),
// so a small change of breadth or pace flips only a few decisions. Only a tiny sway and a slow breath change per frame.
// No DOM access at module top level (SvelteKit SSR).
import type { GardenForm } from '#lib/types.ts';

type Shape = Pick<GardenForm, 'volume' | 'breadth' | 'leaves' | 'roots' | 'pace' | 'leafCount' | 'mended' | 'flowers' | 'seed'>;

const TAU = Math.PI * 2;
const DM = 11; // deepest branching level
const INK = '236, 235, 230';
const COOL = '159, 176, 216';
const GOLD = '#d9b26a';
const BLOOM = '255, 226, 190';
const MAX_LEAVES = 160;
const BREATH_S = 11;

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

// ---------- hashed randomness: one value per (seed or node id, purpose, index) ----------
function mix(a: number, b: number, c: number): number {
	let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x1b873593, 0xc2b2ae35);
	h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
	return h >>> 0;
}
const hash = (a: number, b: number, c = 0) => mix(a, b, c) / 4294967296;

// ---------- topology: a node is one segment of a stroke; the continuation child keeps the stroke going, sides start new strokes ----------
type Node = {
	id: number; parent: number; depth: number; angle: number; len: number; part: number;
	cont: number; tip: boolean; // cont: index of the continuation child or -1
	x0: number; y0: number; x1: number; y1: number; // filled by layout
};

function buildTree(seed: number, root: boolean, wide: number, reach: number): Node[] {
	const nodes: Node[] = [];
	if (reach <= 0) return nodes;
	const home = root ? Math.PI / 2 : -Math.PI / 2;
	const pull = root ? 0.05 : 0.1;
	const spread = root ? 0.55 + wide * 0.5 : 0.3 + wide * 0.75;
	const grow = (parent: number, id: number, angle: number, len: number, depth: number, turn: number): number => {
		const part = clamp(reach - depth);
		if (part <= 0) return -1;
		if (root) angle = clamp(angle, 0.22, Math.PI - 0.22);
		const i = nodes.length;
		const node: Node = { id, parent, depth, angle, len, part, cont: -1, tip: false, x0: 0, y0: 0, x1: 0, y1: 0 };
		nodes.push(node);
		if (depth >= DM || len < 0.13) { node.tip = true; return i; }
		const wander = (hash(id, 1) - 0.5) * (root ? 0.7 : 0.34 + wide * 0.3 + (depth < 3 ? 0.2 : 0)) + (home - angle) * pull;
		node.cont = grow(i, mix(id, 1, 0), angle + wander, len * (root ? 0.86 : 0.83) * (1 + (hash(id, 2) - 0.5) * 0.1 - (root ? 0 : wide * 0.05) + 0.04), depth + 1, -turn);
		if (node.cont < 0) node.tip = true;
		if (depth < 1) return i; // a clear trunk first
		const sides = hash(id, 3) < 0.4 + wide * 0.4 ? 2 : 1;
		for (let k = 0; k < sides; k++) {
			const side = k ? -turn : turn;
			const sl = len * (0.5 + wide * 0.22 + hash(id, 6 + k) * 0.1);
			if (sl < 0.2) continue; // no stubs
			grow(i, mix(id, 2 + k, 0), angle + side * spread * (0.7 + hash(id, 4 + k) * 0.6), sl, depth + 1.8, -side);
		}
		return i;
	};
	const a0 = home + (hash(seed, root ? 91 : 90) - 0.5) * (root ? 0.3 : 0.16);
	grow(-1, mix(seed, root ? 7 : 3, 1), a0, root ? 0.7 : 0.62, 0, hash(seed, 92) < 0.5 ? 1 : -1);
	return nodes;
}

function layout(nodes: Node[], unit: number): { minX: number; maxX: number; minY: number; maxY: number } {
	let minX = 0, maxX = 0, minY = 0, maxY = 0;
	for (const n of nodes) {
		const bx = n.parent < 0 ? 0 : nodes[n.parent].x1, by = n.parent < 0 ? 0 : nodes[n.parent].y1;
		const L = n.len * unit * n.part;
		n.x0 = bx; n.y0 = by; n.x1 = bx + Math.cos(n.angle) * L; n.y1 = by + Math.sin(n.angle) * L;
		minX = Math.min(minX, n.x1); maxX = Math.max(maxX, n.x1); minY = Math.min(minY, n.y1); maxY = Math.max(maxY, n.y1);
	}
	return { minX, maxX, minY, maxY };
}

// ---------- strokes: a chain of nodes smoothed to a Catmull-Rom curve, with a width per sample ----------
type Stroke = { X: number[]; Y: number[]; NX: number[]; NY: number[]; Wd: number[]; n: number; id: number; sd: number };
type Loc = { s: Stroke; k0: number; k1: number };
const SUB = 4;

function makeStroke(nodes: Node[], first: number, wStart: (n: Node, i: number) => number, wEnd: (n: Node, i: number) => number, press: (id: number) => number, locs: Loc[], minW: number): Stroke {
	const chain: number[] = [];
	for (let i = first; i >= 0; i = nodes[i].cont) chain.push(i);
	const f = nodes[first];
	const PX = [f.x0], PY = [f.y0], PW = [wStart(f, first) * press(f.id)];
	for (const i of chain) { const n = nodes[i]; PX.push(n.x1); PY.push(n.y1); PW.push(wEnd(n, i) * press(mix(n.id, 9, 0))); }
	PW[PW.length - 1] *= 0.3; // the tip lifts off the paper
	const m = PX.length;
	const get = (a: number[], i: number) => (i < 0 ? 2 * a[0] - a[1] : i >= m ? 2 * a[m - 1] - a[m - 2] : a[i]);
	const X: number[] = [], Y: number[] = [], Wd: number[] = [];
	for (let i = 0; i < m - 1; i++) {
		for (let j = 0; j < SUB; j++) {
			const t = j / SUB, t2 = t * t, t3 = t2 * t;
			const cr = (a: number[]) => 0.5 * (2 * a[i] + (-get(a, i - 1) + a[i + 1]) * t + (2 * get(a, i - 1) - 5 * a[i] + 4 * a[i + 1] - get(a, i + 2)) * t2 + (-get(a, i - 1) + 3 * a[i] - 3 * a[i + 1] + get(a, i + 2)) * t3);
			X.push(cr(PX)); Y.push(cr(PY)); Wd.push(Math.max(minW, PW[i] + (PW[i + 1] - PW[i]) * t));
		}
	}
	X.push(PX[m - 1]); Y.push(PY[m - 1]); Wd.push(Math.max(minW * 0.6, PW[m - 1]));
	const n = X.length, NX: number[] = [], NY: number[] = [];
	for (let k = 0; k < n; k++) {
		const dx = X[Math.min(n - 1, k + 1)] - X[Math.max(0, k - 1)], dy = Y[Math.min(n - 1, k + 1)] - Y[Math.max(0, k - 1)];
		const l = Math.hypot(dx, dy) || 1;
		NX.push(-dy / l); NY.push(dx / l);
	}
	const s: Stroke = { X, Y, NX, NY, Wd, n, id: f.id, sd: f.depth };
	chain.forEach((ni, c) => { locs[ni] = { s, k0: c * SUB, k1: (c + 1) * SUB }; });
	return s;
}

function poly(p: Path2D, s: Stroke, k0: number, k1: number, uL: number, uR: number, wMul: number) {
	for (let k = k0; k <= k1; k++) { const h = (s.Wd[k] * wMul) / 2; const x = s.X[k] + s.NX[k] * h * uL, y = s.Y[k] + s.NY[k] * h * uL; if (k === k0) p.moveTo(x, y); else p.lineTo(x, y); }
	for (let k = k1; k >= k0; k--) { const h = (s.Wd[k] * wMul) / 2; p.lineTo(s.X[k] + s.NX[k] * h * uR, s.Y[k] + s.NY[k] * h * uR); }
	p.closePath();
}

/** One stroke into a path. dry 0 = a continuous ribbon; dry > 0 = bristle lanes that skip more and more toward the end of the stroke. */
function paint(p: Path2D, s: Stroke, dry: number) {
	if (s.n < 2) return;
	const w0 = s.Wd[0];
	if (dry < 0.03 || w0 < 1.1) {
		if (dry >= 0.03 && w0 < 1.1) { // hairline twigs of a dry brush: broken into short pieces
			for (let k = 0; k < s.n - 1; k += 3) if (hash(s.id, 40, k) >= dry * 0.5 * clamp((k / s.n - 0.3) / 0.7)) poly(p, s, k, Math.min(s.n - 1, k + 3), -1, 1, 1);
			return;
		}
		poly(p, s, 0, s.n - 1, -1, 1, 1);
		return;
	}
	const nl = w0 < 3 ? 3 : 5;
	for (let j = 0; j < nl; j++) {
		const c = -1 + (2 * j + 1) / nl + (hash(s.id, 41, j) - 0.5) * 0.18, hf = (1 / nl) * (0.72 + hash(s.id, 42, j) * 0.2);
		const edge = j === 0 || j === nl - 1 ? 1.3 : 0.75;
		let run = -1;
		for (let k = 0; k < s.n - 1; k++) {
			const tp = k / (s.n - 1);
			const gp = clamp(dry * (0.03 + 0.6 * Math.pow(tp, 1.4)) * edge);
			const vis = hash(s.id, 43 + j, k >> 1) >= gp;
			if (vis && run < 0) run = k;
			if ((!vis || k === s.n - 2) && run >= 0) { poly(p, s, run, vis ? s.n - 1 : k, c - hf, c + hf, 1); run = -1; }
		}
	}
}

// ---------- the cache: everything that depends on the shape and the box, not on time ----------
type Flower = { x: number; y: number; ph: number; r: number; a: number };
type Cache = {
	W: number; H: number; cx: number; ground: number; key: string;
	root: Path2D[]; rootA: number[]; bleed: Path2D; bleed2: Path2D; core: Path2D; stem: Path2D[]; stemA: number[]; leaf: Path2D[]; leafA: number[]; leafBleed: Path2D; gold: Path2D;
	flowers: Flower[]; seedDot: number; goldW: number; swayK: number; wet: number;
};

function build(f: Shape, W: number, H: number): Cache {
	const cx = W / 2, ground = H * 0.7, sc = H / 800;
	const vol = clamp(f.volume), wide = clamp(f.breadth), pace = clamp(f.pace), roots = clamp(f.roots);
	const dry = clamp((pace - 0.35) / 0.6), wet = clamp((0.55 - pace) / 0.55);
	const wfac = 1 + 0.2 * wet - 0.15 * dry;
	const c: Cache = { W, H, cx, ground, key: '', root: [], rootA: [], bleed: new Path2D(), bleed2: new Path2D(), core: new Path2D(), stem: [], stemA: [], leaf: [], leafA: [], leafBleed: new Path2D(), gold: new Path2D(), flowers: [], seedDot: 0, goldW: Math.max(1.2, 1.5 * sc), swayK: 0.0045, wet };
	const press = (id: number) => 1 + (hash(id, 11) - 0.5) * 0.28;

	// --- above ground ---
	const up = buildTree(f.seed, false, wide, DM * Math.pow(vol, 0.66));
	const uLoc: Loc[] = [];
	const leafMargin = 22 * sc;
	if (up.length) {
		const bb = layout(up, 1);
		const hu = Math.max(1e-6, -bb.minY), halfW = Math.max(1e-6, Math.max(-bb.minX, bb.maxX));
		const pref = H * (0.105 + 0.105 * smooth(vol / 0.7));
		const s = Math.min(pref, (ground - H * 0.05 - leafMargin) / hu, (W / 2 - leafMargin - W * 0.03) / halfW);
		layout(up, s);
		const w0 = Math.max(2.4 * sc, s * 0.03 * (0.55 + 0.7 * vol)) * wfac;
		const sub = up.map((n) => n.part); // pipe model: a segment is as thick as what it carries
		for (let i = up.length - 1; i > 0; i--) sub[up[i].parent] += sub[i];
		const wmin = Math.max(0.6, 0.9 * sc * wfac), g = (v: number) => wmin + (w0 - wmin) * Math.pow(Math.max(0, v) / sub[0], 0.45);
		const minW = 0.5;
		const tiers = [0.76, 0.64, 0.52];
		const tierP = tiers.map(() => new Path2D());
		const aShift = 0.05 * wet - 0.07 * dry;
		for (let i = 0; i < up.length; i++) {
			if (up[i].parent >= 0 && up[up[i].parent].cont === i) continue; // continuation: part of its parent's stroke
			const st = makeStroke(up, i, (n, k) => g(sub[k]), (n, k) => g(sub[k] - n.part), press, uLoc, minW);
			paint(tierP[st.sd <= 1 ? 0 : st.sd <= 5 ? 1 : 2], st, dry);
			if (wet > 0.12 && st.sd <= 7) { poly(c.bleed, st, 0, st.n - 1, -1, 1, 1.7); poly(c.bleed2, st, 0, st.n - 1, -1, 1, 2.8); }
			if (wet > 0.12 && st.sd <= 5) poly(c.core, st, 0, st.n - 1, -1, 1, 0.4);
		}
		for (let t = 2; t >= 0; t--) { c.stem.push(tierP[t]); c.stemA.push(clamp(tiers[t] + aShift, 0, 1)); }
		c.seedDot = 0;

		// leaves: slots on the grown twigs, taken in a fixed hashed order
		const nLeaf = Math.min(MAX_LEAVES, Math.max(0, Math.round(f.leafCount)));
		if (nLeaf > 0) {
			type Slot = { key: number; i: number; t: number; side: number; kind: number; h: number };
			const slots: Slot[] = [];
			up.forEach((n, i) => {
				const bias = 0.9 - 0.45 * (n.depth / DM), late = n.depth < 1 ? 2 : 0; // the first segment only lends leaves when nothing else exists
				const kMid = hash(n.id, 20) * bias + late, kEnd = hash(n.id, 22) * bias + late, tm = 0.4 + 0.2 * hash(n.id, 21);
				if (!late) { slots.push({ key: kMid, i, t: tm, side: 1, kind: 0, h: hash(n.id, 23) }, { key: kMid, i, t: tm + 0.05, side: -1, kind: 0, h: hash(n.id, 24) }); }
				slots.push({ key: kEnd, i, t: 1, side: 1, kind: 1, h: hash(n.id, 25) }, { key: kEnd, i, t: 1, side: -1, kind: 1, h: hash(n.id, 26) });
				if (n.cont < 0) slots.push({ key: kEnd + 0.0001, i, t: 1, side: 0, kind: 2, h: hash(n.id, 27) });
			});
			slots.sort((a, b) => a.key - b.key);
			const small = 0.85 + 0.15 * clamp(vol / 0.25), sizeMul = (0.8 + 0.4 * clamp(f.leaves)) * (1.25 - 0.4 * nLeaf / MAX_LEAVES) * small * sc;
			const shades = [0.28, 0.42, 0.58];
			const shP = shades.map(() => new Path2D());
			for (const sl of slots.slice(0, nLeaf)) {
				const n = up[sl.i], loc = uLoc[sl.i];
				const k = Math.round(loc.k0 + sl.t * (loc.k1 - loc.k0)), S = loc.s;
				const kk = Math.min(S.n - 1, k);
				const tx = S.X[Math.min(S.n - 1, kk + 1)] - S.X[Math.max(0, kk - 1)], ty = S.Y[Math.min(S.n - 1, kk + 1)] - S.Y[Math.max(0, kk - 1)];
				const ta = Math.atan2(ty, tx);
				const open = sl.kind === 0 ? 0.75 + 0.5 * sl.h : sl.kind === 1 ? 0.65 + 0.35 * sl.h : (sl.h - 0.5) * 0.5;
				const ang = ta + sl.side * open;
				const L = (14 + 16 * sl.h) * sizeMul * (0.35 + 0.65 * n.part) * (1 - 0.18 * dry);
				const half = L * (0.21 - 0.04 * dry) * (0.85 + 0.3 * hash(n.id, 28 + sl.kind));
				const shade = sl.h < 0.4 ? 0 : sl.h < 0.75 ? 1 : 2;
				const bx = S.X[kk] + S.NX[kk] * S.Wd[kk] * 0.3 * sl.side, by = S.Y[kk] + S.NY[kk] * S.Wd[kk] * 0.3 * sl.side;
				petal(shP[shade], bx, by, ang, L, half, (hash(n.id, 29 + sl.side) - 0.5) * 0.5);
				if (wet > 0.12) petal(c.leafBleed, bx, by, ang, L * 1.1, half * 1.35, 0);
			}
			shades.forEach((a, t) => { c.leaf.push(shP[t]); c.leafA.push(a + 0.05 * wet - 0.04 * dry); });
		}

		// gold seams across joints of the stem
		const nGold = Math.max(0, Math.round(f.mended));
		if (nGold > 0) {
			const cands = up.map((n, i) => ({ n, i })).filter(({ n }) => n.part >= 1 && n.cont >= 0 && n.depth >= 1 && n.depth <= 8).sort((a, b) => hash(a.n.id, 30) - hash(b.n.id, 30));
			for (const { n, i } of cands.slice(0, nGold)) {
				const loc = uLoc[i], S = loc.s, k = loc.k1;
				const tx = S.X[Math.min(S.n - 1, k + 1)] - S.X[k - 1], ty = S.Y[Math.min(S.n - 1, k + 1)] - S.Y[k - 1], l = Math.hypot(tx, ty) || 1;
				const ux = tx / l, uy = ty / l, nx = -uy, ny = ux;
				const r = Math.max(4 * sc + 1, S.Wd[k] * 0.62 + 2.4 * sc), bulge = r * (0.45 + 0.3 * hash(n.id, 32)), sh = (hash(n.id, 33) - 0.5) * 0.3 * r;
				const px = S.X[k] + ux * sh, py = S.Y[k] + uy * sh;
				c.gold.moveTo(px + nx * r, py + ny * r);
				c.gold.quadraticCurveTo(px + ux * bulge * 2, py + uy * bulge * 2, px - nx * r, py - ny * r);
			}
		}

		// flowers on the tips
		const nFl = Math.max(0, Math.round(f.flowers));
		if (nFl > 0) {
			const rank = (n: Node) => hash(n.id, 31) + (n.cont < 0 && n.part >= 0.3 ? 0 : 1); // tips first, then any grown joint
			const cands = up.filter((n) => n.part >= 0.3 && n.depth >= 2).sort((a, b) => rank(a) - rank(b));
			for (const n of cands.slice(0, nFl)) c.flowers.push({ x: n.x1, y: n.y1, ph: hash(n.id, 34) * TAU, r: (8.5 + 3 * hash(n.id, 35)) * sc, a: hash(n.id, 36) * TAU });
		}
	} else if (roots <= 0 || f.volume <= 0) c.seedDot = 1;
	if (up.length && vol < 0.015) c.seedDot = 1 - vol / 0.015;

	// --- below ground ---
	const dn = buildTree(f.seed, true, wide, DM * Math.pow(roots, 0.7));
	if (dn.length) {
		const bb = layout(dn, 1);
		const hd = Math.max(1e-6, bb.maxY), halfW = Math.max(1e-6, Math.max(-bb.minX, bb.maxX));
		const s = Math.min(H * 0.1, (H - ground - H * 0.04) / hd, (W * 0.44) / halfW);
		layout(dn, s);
		const w0 = Math.max(1.1 * sc, 2.2 * sc * (0.7 + 0.5 * roots)) * (1 + 0.15 * wet - 0.3 * dry);
		const tiers = [0.62, 0.48, 0.36], tp = tiers.map(() => new Path2D()), rLoc: Loc[] = [];
		for (let i = 0; i < dn.length; i++) {
			if (dn[i].parent >= 0 && dn[dn[i].parent].cont === i) continue;
			const st = makeStroke(dn, i, (n) => w0 * Math.pow(0.8, n.depth), (n) => w0 * Math.pow(0.8, n.depth + 1), press, rLoc, 0.45);
			paint(tp[st.sd <= 1 ? 0 : st.sd <= 4 ? 1 : 2], st, dry * 0.6);
		}
		for (let t = 2; t >= 0; t--) { c.root.push(tp[t]); c.rootA.push(tiers[t]); }
	}
	return c;
}

function petal(p: Path2D, x: number, y: number, a: number, L: number, half: number, skew: number) {
	const ca = Math.cos(a), sa = Math.sin(a);
	const pt = (lx: number, ly: number): [number, number] => [x + ca * lx - sa * ly, y + sa * lx + ca * ly];
	const [c1x, c1y] = pt(L * 0.38, -half * (1.9 + skew)), [tx, ty] = pt(L, L * 0.04 * skew), [c2x, c2y] = pt(L * 0.42, half * (1.9 - skew));
	p.moveTo(x, y); p.quadraticCurveTo(c1x, c1y, tx, ty); p.quadraticCurveTo(c2x, c2y, x, y);
}

// ---------- the organism: owns sizing, the loop, visibility and reduced motion ----------
export function createOrganism(canvas: HTMLCanvasElement): { set(form: GardenForm): void; destroy(): void } {
	const ctx = canvas.getContext('2d');
	let shape: Shape | null = null, shapeKey = '', cache: Cache | null = null;
	let W = 0, H = 0, dpr = 1, T = 0, last = 0, raf = 0, visible = true, dead = false, dirty = true;
	const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
	let reduce = !!mq?.matches;

	function measure() {
		const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
		if (w === W && h === H && d === dpr) return;
		W = w; H = h; dpr = d;
		canvas.width = Math.max(1, Math.round(W * d)); canvas.height = Math.max(1, Math.round(H * d));
		dirty = true;
	}

	function draw(now: number) {
		if (!ctx || W < 2 || H < 2 || !shape) return;
		if (dirty || !cache) { cache = build(shape, W, H); dirty = false; }
		const c = cache, breath = reduce ? 0 : Math.sin((now / 1000) * TAU / BREATH_S);
		const sway = reduce ? 0 : Math.sin(now / 1000 * 0.5) * c.swayK * (1 + breath * 0.3);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);

		// a pale disc behind
		let g = ctx.createRadialGradient(c.cx, c.ground - H * 0.3, 0, c.cx, c.ground - H * 0.3, H * 0.5);
		g.addColorStop(0, `rgba(240, 207, 166, ${0.07 + 0.02 * breath})`); g.addColorStop(1, 'rgba(240, 207, 166, 0)');
		ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
		// the ground line, fading at both ends
		g = ctx.createLinearGradient(W * 0.06, 0, W * 0.94, 0);
		g.addColorStop(0, `rgba(${INK}, 0)`); g.addColorStop(0.2, `rgba(${INK}, .16)`); g.addColorStop(0.8, `rgba(${INK}, .16)`); g.addColorStop(1, `rgba(${INK}, 0)`);
		ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W * 0.06, c.ground + 0.5); ctx.lineTo(W * 0.94, c.ground + 0.5); ctx.stroke();

		ctx.save();
		ctx.translate(c.cx, c.ground);
		// roots: still
		c.root.forEach((p, i) => { ctx.fillStyle = `rgba(${COOL}, ${c.rootA[i]})`; ctx.fill(p, 'nonzero'); });
		// the plant: a slight shear around the base is the whole sway
		ctx.transform(1, 0, -sway, 1, 0, 0);
		const wb = Math.min(1, c.wet * 2);
		ctx.fillStyle = `rgba(${INK}, ${0.035 * wb})`; ctx.fill(c.bleed2, 'nonzero');
		ctx.fillStyle = `rgba(${INK}, ${0.07 * wb})`; ctx.fill(c.bleed, 'nonzero');
		c.stem.forEach((p, i) => { ctx.fillStyle = `rgba(${INK}, ${c.stemA[i]})`; ctx.fill(p, 'nonzero'); });
		ctx.fillStyle = `rgba(${INK}, ${0.16 * wb})`; ctx.fill(c.core, 'nonzero');
		ctx.fillStyle = `rgba(${INK}, ${0.03 * wb})`; ctx.fill(c.leafBleed, 'nonzero');
		c.leaf.forEach((p, i) => { ctx.fillStyle = `rgba(${INK}, ${c.leafA[i]})`; ctx.fill(p, 'nonzero'); });
		ctx.strokeStyle = GOLD; ctx.lineWidth = c.goldW; ctx.lineCap = 'round'; ctx.globalAlpha = 0.95; ctx.stroke(c.gold); ctx.globalAlpha = 1;
		for (const fl of c.flowers) {
			const b = Math.sin((now / 1000) * TAU / BREATH_S + fl.ph), rad = fl.r * (1 + 0.14 * b);
			g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rad * 2);
			g.addColorStop(0, `rgba(${BLOOM}, ${0.55 + 0.1 * b})`); g.addColorStop(0.45, `rgba(${BLOOM}, .16)`); g.addColorStop(1, `rgba(${BLOOM}, 0)`);
			ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fl.x, fl.y, rad * 2, 0, TAU); ctx.fill();
			ctx.fillStyle = `rgba(${BLOOM}, .5)`; ctx.beginPath();
			for (let k = 0; k < 5; k++) { const a = fl.a + (k * TAU) / 5; ctx.moveTo(fl.x, fl.y); ctx.ellipse(fl.x + Math.cos(a) * rad * 0.5, fl.y + Math.sin(a) * rad * 0.5, rad * 0.5, rad * 0.22, a, 0, TAU); }
			ctx.fill();
			ctx.fillStyle = '#fff3e2'; ctx.beginPath(); ctx.arc(fl.x, fl.y, Math.max(1.4, rad * 0.2), 0, TAU); ctx.fill();
		}
		if (c.seedDot > 0) {
			ctx.fillStyle = `rgba(${INK}, ${0.9 * c.seedDot})`; ctx.beginPath(); ctx.ellipse(0, -1, 2.6 * (H / 800 + 0.4), 1.9 * (H / 800 + 0.4), 0, 0, TAU); ctx.fill();
		}
		ctx.restore();
	}

	function tick(now: number) {
		raf = 0;
		if (dead || reduce || !visible || document.hidden) return;
		if (now - last >= 32) { last = now; draw(now); }
		raf = requestAnimationFrame(tick);
	}
	function kick() {
		if (dead) return;
		if (reduce) { measure(); draw(0); return; }
		if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick);
	}

	const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); kick(); }) : null;
	ro?.observe(canvas);
	const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }) : null;
	io?.observe(canvas);
	const onVis = () => { if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else kick(); };
	document.addEventListener('visibilitychange', onVis);
	const onMq = () => { reduce = !!mq?.matches; if (reduce && raf) { cancelAnimationFrame(raf); raf = 0; } kick(); };
	mq?.addEventListener('change', onMq);
	measure();

	return {
		set(form: GardenForm) {
			const s: Shape = { volume: form.volume, breadth: form.breadth, leaves: form.leaves, roots: form.roots, pace: form.pace, leafCount: form.leafCount, mended: form.mended, flowers: form.flowers, seed: form.seed };
			const k = `${s.volume}|${s.breadth}|${s.leaves}|${s.roots}|${s.pace}|${s.leafCount}|${s.mended}|${s.flowers}|${s.seed}`;
			shape = s;
			if (k !== shapeKey) { shapeKey = k; dirty = true; }
			measure();
			kick();
		},
		destroy() {
			dead = true;
			if (raf) cancelAnimationFrame(raf);
			raf = 0; ro?.disconnect(); io?.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			mq?.removeEventListener('change', onMq);
			cache = null;
		}
	};
}
