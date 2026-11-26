// KITBASH passes: a hero carries gear cut from other library characters of the same family and pixel scale
// (tools/sprites/parts/*.png, cut by `charbase.mjs --part`). Nothing is drawn: the part's own pixels are placed —
// turned to the angle the frame needs with a RotSprite-style rotation (scale2x twice, rotate, sample back), so
// every pixel stays one of the part's colours at the sprite's pixel size.
import path from 'path';
import { hex, K, key, loadPng } from './pixels.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cache = new Map();
export function part(name) {
	if (!cache.has(name)) {
		const img = loadPng(path.join(ROOT, 'parts', name + '.png'));
		cache.set(name, { img, up: scale2x(scale2x(img)) });
	}
	return cache.get(name);
}
/** EPX / Scale2x: doubles a sprite keeping hard pixel edges (the RotSprite pre-pass). */
function scale2x(s) {
	const w = s.w, h = s.h, o = { w: w * 2, h: h * 2, d: new Uint8Array(w * h * 16) };
	const g = (x, y) => { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); const i = (y * w + x) * 4; return s.d[i + 3] ? (key(s.d[i], s.d[i + 1], s.d[i + 2]) + 1) : 0; };
	const put = (x, y, sx, sy) => { const i = (sy * w + sx) * 4, j = (y * o.w + x) * 4; o.d.set(s.d.subarray(i, i + 4), j); };
	const at = (x, y) => [Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y))];
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const P = g(x, y), A = g(x, y - 1), B = g(x + 1, y), C = g(x - 1, y), D = g(x, y + 1);
		const src = [[x, y], [x, y], [x, y], [x, y]];
		if (C === A && C !== D && A !== B) src[0] = at(x, y - 1);
		if (A === B && A !== C && B !== D) src[1] = at(x + 1, y);
		if (D === C && D !== B && C !== A) src[2] = at(x - 1, y);
		if (B === D && B !== A && D !== C) src[3] = at(x, y + 1);
		put(2 * x, 2 * y, ...src[0]); put(2 * x + 1, 2 * y, ...src[1]); put(2 * x, 2 * y + 1, ...src[2]); put(2 * x + 1, 2 * y + 1, ...src[3]);
	}
	return o;
}
/**
 * Place a part: its point `from` (part px) lands on `to` (sheet px); the part turns by `ang` radians and is mirrored
 * across its own x axis first when `flip`. `keep(px, py)` (part coords) can drop pixels; `under` = only where the
 * frame is empty. Returns the sheet pixels painted.
 */
export function place(F, P, from, to, ang = 0, flip = false, keep = null, under = false) {
	const { img, up } = P, c = Math.cos(ang), s = Math.sin(ang), R = Math.ceil(Math.hypot(img.w, img.h)) + 2, done = [];
	for (let ty = to[1] - R; ty <= to[1] + R; ty++) for (let tx = to[0] - R; tx <= to[0] + R; tx++) {
		if (!F.inCell(tx) || ty < 0 || ty >= F.ch) continue;
		const dx = tx - to[0], dy = ty - to[1];
		let px = c * dx + s * dy, py = -s * dx + c * dy; // undo the turn
		if (flip) py = -py;
		px += from[0]; py += from[1];
		const ux = Math.floor(px * 4 + 2), uy = Math.floor(py * 4 + 2);
		if (ux < 0 || uy < 0 || ux >= up.w || uy >= up.h) continue;
		const i = (uy * up.w + ux) * 4;
		if (!up.d[i + 3] || (keep && !keep(px, py)) || (under && F.isSet(tx, ty))) continue;
		F.put(tx, ty, [up.d[i], up.d[i + 1], up.d[i + 2]]);
		done.push([tx, ty]);
	}
	return done;
}

const mat = (B, name) => new Set((B.materials[name] || []).map(K));
const cen = (px) => [px.reduce((a, v) => a + v[0], 0) / px.length, px.reduce((a, v) => a + v[1], 0) / px.length];
/** 8-connected patches of the source pixels in `set` (sheet coords). */
function blobs(F, set) {
	const seen = new Set(), out = [];
	for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
		if (seen.has(F.q(x, y)) || !set.has(F.kAt(x, y))) continue;
		const px = [], st = [[x, y]]; seen.add(F.q(x, y));
		while (st.length) { const [a, b] = st.pop(); px.push([a, b]); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = a + dx, ny = b + dy; if (!F.inCell(nx) || ny < 0 || ny >= F.ch || seen.has(F.q(nx, ny)) || !set.has(F.kAt(nx, ny))) continue; seen.add(F.q(nx, ny)); st.push([nx, ny]); } }
		const xs = px.map((v) => v[0]), ys = px.map((v) => v[1]);
		out.push({ px, w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, x0: Math.min(...xs), y1: Math.max(...ys), c: cen(px) });
	}
	return out;
}

export const KIT = {
	/**
	 * Wraps → gear. A pack whose wraps, belt and weapon shaft share ONE colour (p.material): thin long patches are the
	 * shaft / belt (→ p.shaft colours, light / dark by row parity of the long axis — a flat leather tone, as drawn),
	 * patches low on the legs are greaves (p.greave), the rest are arm bracers (p.bracer). Bracers are kept in
	 * F.lm.bracers (for the shield).
	 */
	wraps(F, B, H, p) {
		const all = blobs(F, mat(B, p.material)), foot = B.foot, br = [];
		for (const b of all) {
			const long = Math.max(b.w, b.h), thin = long >= 7 && b.px.length <= long * 2.6;
			const kind = thin ? 'shaft' : b.c[1] >= foot - p.legs ? 'greave' : 'bracer';
			const col = hex(p[kind]);
			for (const [x, y] of b.px) F.put(x, y, col);
			if (kind === 'bracer') br.push(b);
			if (kind === 'shaft') (F.lm.shafts ||= []).push(b);
		}
		F.lm.bracers = br;
	},

	/**
	 * Swap a weapon's head for a part (the Minotaur Brute's axe for the Orc Brute's spear head). The head = the
	 * patches of p.head colours; its direction = from the hand / shaft pixels round it to the head; the part's
	 * `anchor` (where its haft meets the blade) lands on the head's base and its `axis` (haft → head, part px) turns
	 * to that direction; the blade faces forward. Only the part's pixels past `stub` along the axis are placed, so
	 * the hand on the shaft stays in front.
	 */
	axe(F, B, H, p) {
		const HEAD = new Set(p.head.map(K)), eye = F.lm.eye, heads = blobs(F, HEAD).filter((b) => b.px.length >= (p.min ?? 4) && !(eye && Math.hypot(b.c[0] - eye[0], b.c[1] - eye[1]) < (p.face ?? 10)));
		if (!heads.length) return;
		const hd = heads.reduce((a, b) => (b.px.length > a.px.length ? b : a));
		const inHead = new Set(hd.px.map(([x, y]) => F.q(x, y)));
		// the head's light-edge pixels (the eye / tusk colour) count too, where they touch it
		const near = [];
		for (const [x, y] of hd.px) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
			const nx = x + dx, ny = y + dy; if (!F.inCell(nx) || ny < 0 || ny >= F.ch || inHead.has(F.q(nx, ny))) continue;
			const k = F.kAt(nx, ny); if (k >= 0 && k !== 0x020203 && k !== 0x030202) near.push([nx, ny]);
		}
		if (!near.length) return;
		const hc = hd.c, nc = cen(near);
		let ux = hc[0] - nc[0], uy = hc[1] - nc[1]; const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
		// erase the old head (and its outline) from the output
		const old = new Set(), edge = [...hd.px];
		for (const [x, y] of hd.px) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; const k = F.kAt(nx, ny); if (F.inCell(nx) && (k === 0x020203 || HEAD.has(k) || k === 0xfff1c0)) old.add(F.q(nx, ny)), edge.push([nx, ny]); }
		for (const q of old) { const x = q % F.w, y = Math.floor(q / F.w); F.out.d[F.at(x, y) + 3] = 0; }
		// the base of the head = its pixel furthest back along the direction
		let base = hd.px[0], bmin = 1e9;
		for (const [x, y] of hd.px) { const t = (x - hc[0]) * ux + (y - hc[1]) * uy; if (t < bmin) { bmin = t; base = [x, y]; } }
		const P = part(p.part), [ax, ay] = p.axis, am = Math.hypot(ax, ay), a0 = Math.atan2(ay / am, ax / am), ang = Math.atan2(uy, ux) - a0;
		// blade side: the part's blade lies on side `p.side` (+1 = to the left of the axis, i.e. (ay, -ax)); pick the
		// side facing forward (+x), and up when the haft is level
		const L = [uy, -ux], score = (v) => v[0] + 0.35 * -v[1], want = score(L) >= score([-L[0], -L[1]]) ? 1 : -1;
		const flip = want !== p.side;
		const keep = (px, py) => ((px - p.anchor[0]) * ax + (py - p.anchor[1]) * ay) / am >= -(p.stub ?? 2);
		place(F, P, p.anchor, [base[0] - ux * (p.back ?? 0), base[1] - uy * (p.back ?? 0)], ang, flip, keep);
		F.lm.axe = { base, dir: [ux, uy] };
	},

	/**
	 * A part strapped to the free forearm (the Spartan's round shield): its centre on the bracer furthest BACK (−x,
	 * packs face right); frames with no bracer keep the offset the strip last saw from the belt.
	 */
	shield(F, B, H, p) {
		const P = part(p.part), ax = F.lm.axe?.base, KILT = mat(B, p.waist || 'kilt');
		// the waist: the back of the body (−x) on the kilt's top rows — every frame has it, so the shield never jumps
		let ky = -1;
		for (let y = 0; y < F.ch && ky < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) { ky = y; break; }
		let bx = 1e9;
		if (ky >= 0) for (let y = ky; y <= ky + 2; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (F.kAt(x, y) >= 0) { bx = Math.min(bx, x); break; }
		const waist = ky >= 0 && bx < 1e9 ? [bx, ky] : null;
		const home = (H._shield ||= {}), arm = (p.arm || []).includes(F.anim);
		// the weapon hand's bracer doesn't count (both hands on the haft)
		const br = (F.lm.bracers || []).filter((b) => !ax || Math.hypot(b.c[0] - ax[0], b.c[1] - ax[1]) > (p.clear ?? 14));
		let at = null;
		if (arm && br.length) {
			// on the free forearm: the bracer nearest last frame's shield (the strip's first frame: the one furthest back)
			const last = F.strip.shAt, d = (c) => Math.hypot(c.c[0] - last[0], c.c[1] - last[1]);
			const b = br.reduce((a, c) => ((last ? d(c) < d(a) : c.c[0] < a.c[0]) ? c : a));
			if (!last || d(b) <= (p.jump ?? 12)) at = [b.c[0] + (p.dx ?? 0), b.c[1] + (p.dy ?? 0)];
			if (at && waist && F.anim === 'idle' && F.f === 0) home.off = [at[0] - waist[0], at[1] - waist[1]];
		}
		// braced in FRONT (the Defend crouch): the shield at the front of the chest, just above the waist
		if (!at && waist && (p.front || []).includes(F.anim)) {
			const SKIN = mat(B, 'skin'); let fx = -1;
			for (let y = Math.max(0, waist[1] - 8); y < waist[1]; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (SKIN.has(F.kAt(x, y))) fx = Math.max(fx, x);
			if (fx >= 0) at = [fx + (p.fo?.[0] ?? -4), waist[1] + (p.fo?.[1] ?? -2)];
		}
		// strapped on: rides the waist at the offset the idle showed
		if (!at && waist) { const o = home.off || p.off || [4, 2]; at = [waist[0] + o[0], waist[1] + o[1]]; }
		if (!at) return;
		at = [Math.round(at[0]), Math.round(at[1])];
		place(F, P, [P.img.w / 2, P.img.h / 2], at);
		F.strip.shAt = at; F.lm.shield = at;
	}
};
