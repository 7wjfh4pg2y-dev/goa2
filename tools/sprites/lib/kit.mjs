// KITBASH passes: a hero carries gear cut from other library characters of the same family and pixel scale
// (tools/sprites/parts/*.png, cut by `charbase.mjs --part`). Nothing is drawn: the part's own pixels are placed —
// turned to the angle the frame needs with a RotSprite-style rotation (scale2x twice, rotate, sample back), so
// every pixel stays one of the part's colours at the sprite's pixel size.
import path from 'path';
import { hex, K, key, loadPng } from './pixels.mjs';
import { skipped } from './parts.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cache = new Map();
const tplCache = {};
/** The pack's own pixels inside box (frame coords) on frame f of a base strip, as [dx, dy, key] from the box centre. */
function template(base, file, f, cell, box) {
	const img = loadPng(path.join(ROOT, 'bases', base, file)), out = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
	for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
		const i = (y * img.w + f * cell + x) * 4;
		if (img.d[i + 3] && (img.d[i] > 12 || img.d[i + 1] > 12 || img.d[i + 2] > 12)) out.push([x - cx, y - cy, key(img.d[i], img.d[i + 1], img.d[i + 2])]); // outlines match anywhere: leave them out
	}
	return out;
}
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
export function place(F, P, from, to, ang = 0, flip = false, keep = null, under = false, skip = null) {
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
		if (!up.d[i + 3] || (keep && !keep(px, py)) || (under && F.isSet(tx, ty)) || (skip && skip(tx, ty))) continue;
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
	 * A HAND-EDITED stamp (parts/<p.part>.png, made from one frame the artist touched up: changed pixels, magenta =
	 * cleared) laid on every frame at the eye (part px `p.eye`), or — where the eye isn't found — at the head top
	 * (`p.head` = the eye's offset from it). The axe stays in front. Skipped from H.skip.gear on (lying down).
	 */
	stamp(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const P = part(p.part), at = F.lm.eye || (F.lm.head && [F.lm.head[0] + p.head[0], F.lm.head[1] + p.head[1]]);
		if (!at) return;
		const AX = F.masks.axe || new Set(), { img } = P;
		for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
			const i = (y * img.w + x) * 4; if (!img.d[i + 3]) continue;
			const tx = at[0] - p.eye[0] + x, ty = at[1] - p.eye[1] + y;
			if (!F.inCell(tx) || ty < 0 || ty >= F.ch || AX.has(F.q(tx, ty))) continue;
			if (img.d[i] === 255 && img.d[i + 1] === 0 && img.d[i + 2] === 255) F.out.d[F.at(tx, ty) + 3] = 0;
			else F.put(tx, ty, [img.d[i], img.d[i + 1], img.d[i + 2]]);
		}
	},

	/**
	 * ARM RIG for the shield arm (landmarks only, nothing drawn): the shoulder S = the body's back edge at the shoulder
	 * row (p.row below the eye) + p.sx; the forearm = the arm's wrap (a bracer from `wraps`, not the axe hand's), its
	 * long axis by PCA; the end nearer S = the elbow, the other end + p.reach along the axis = the hand. Angles are
	 * kept against idle frame 0 (H._rig), so parts hung on the arm turn by how far the arm turned.
	 */
	armrig(F, B, H, p) {
		const eye = F.lm.eye || (F.lm.head && [F.lm.head[0] + p.head[0], F.lm.head[1] + p.head[1]]);
		if (!eye) return;
		const row = eye[1] + p.row;
		let bx = -1;
		for (let x = Math.max(F.x0, eye[0] - p.scan); x < eye[0]; x++) if (F.kAt(x, row) >= 0) { bx = x; break; }
		if (bx < 0) return;
		const S = [bx + p.sx, row], ax = F.lm.axe?.base;
		// the axe hand = the bracer nearest the axe head's base (only that one: with both hands on the haft the other is the shield hand)
		// the belt shares the wraps colour: a wide patch at the kilt's top edge is the belt, not a forearm
		const KILT = mat(B, 'kilt'); let ky = -1;
		for (let y = 0; y < F.ch && ky < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) { ky = y; break; }
		const all = (F.lm.bracers || []).filter((b) => !(ky >= 0 && b.w >= 6 && b.w > b.h * 1.4 && Math.abs(b.y1 - ky) <= 4)), dAx = (b) => (ax ? Math.hypot(b.c[0] - ax[0], b.c[1] - ax[1]) : 1e9);
		const axeHand = ax && all.length ? all.reduce((a, b) => (dAx(b) < dAx(a) ? b : a)) : null;
		const br = all.filter((b) => b !== axeHand || dAx(b) > (p.clear ?? 14));
		const rig = { S };
		if (br.length) {
			const last = F.strip.handAt, d = (c) => Math.hypot(c.c[0] - last[0], c.c[1] - last[1]);
			const b = br.reduce((a, c) => ((last ? d(c) < d(a) : c.c[0] < a.c[0]) ? c : a));
			if (!last || d(b) <= (p.jump ?? 16)) {
				const [mx, my] = b.c; let sxx = 0, syy = 0, sxy = 0;
				for (const [x, y] of b.px) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
				const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
				let lo = 1e9, hi = -1e9; for (const [x, y] of b.px) { const t = (x - mx) * ux + (y - my) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
				let e1 = [mx + ux * lo, my + uy * lo], e2 = [mx + ux * hi, my + uy * hi];
				if (Math.hypot(e1[0] - S[0], e1[1] - S[1]) > Math.hypot(e2[0] - S[0], e2[1] - S[1])) [e1, e2] = [e2, e1];
				const dl = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]) || 1, dh = [(e2[0] - e1[0]) / dl, (e2[1] - e1[1]) / dl];
				rig.elbow = e1; rig.hand = [e2[0] + dh[0] * p.reach, e2[1] + dh[1] * p.reach];
				rig.a = Math.atan2(dh[1], dh[0]); rig.u = Math.atan2(e1[1] - S[1], e1[0] - S[0]);
				F.strip.handAt = b.c;
			}
		}
		if (F.anim === 'idle' && F.f === 0 && rig.hand) H._rig = { a: rig.a, u: rig.u };
		F.lm.arm = rig;
	},

	/**
	 * A shoulder plate (part) on the back of the shoulders: its left edge on the body's back edge at the shoulder row
	 * (p.row below the eye; the pack's own pixels, so the shield doesn't count), its top p.top below the eye. Drawn
	 * before the head, so the beard hangs over it.
	 */
	shoulderplate(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const rig = F.lm.arm; if (!rig) return;
		const turn = rig.u != null && H._rig ? rig.u - H._rig.u : 0;
		const P = part(p.part), AX = F.masks.axe;
		const done = place(F, P, p.pin, [Math.round(rig.S[0]), Math.round(rig.S[1])], turn * (p.follow ?? 1), false, null, false, (x, y) => AX?.has(F.q(x, y)));
		F.masks.plate = new Set(done.map(([x, y]) => F.q(x, y)));
	},

	/**
	 * FOLLOW: a hand-edited part rides the body part it was drawn on. The pack's own pixels of that body part (p.box
	 * on frame p.f of p.file, the frame the edit was made on) are searched for in every frame — shifted up to p.reach
	 * px from where the eye says they should be, turned by up to ±p.turn degrees — and the part is laid on with the
	 * best match's shift and turn (RotSprite, so the pixels stay pixels). Magenta in the part = clear the pixel (an
	 * old topknot). The axe stays in front. Skipped from H.skip.gear on, or when nothing matches well enough.
	 */
	follow(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const eye = F.lm.eye || (F.lm.head && [F.lm.head[0] + p.head[0], F.lm.head[1] + p.head[1]]);
		if (!eye) return;
		const T = (tplCache[p.file + p.box] ||= template(H.base, p.file, p.f ?? 0, B.cell, p.box));
		const cx = (p.box[0] + p.box[2]) / 2, cy = (p.box[1] + p.box[3]) / 2;
		const gx = Math.round(eye[0] - F.x0 + cx - p.eye[0]), gy = Math.round(eye[1] + cy - p.eye[1]);
		const R = p.reach ?? 10, A = p.turn ?? 40, step = p.step ?? 5;
		let best = null;
		for (let deg = -A; deg <= A; deg += step) {
			const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
			const rot = T.map(([dx, dy, k]) => [Math.round(c * dx - s * dy), Math.round(s * dx + c * dy), k]);
			for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
				let n = 0;
				for (const [dx, dy, k] of rot) { const x = F.x0 + gx + ox + dx, y = gy + oy + dy; if (F.inCell(x) && y >= 0 && y < F.ch && F.kAt(x, y) === k) n++; }
				const sc = n - Math.abs(deg) * (p.turnCost ?? 0.04) - (Math.abs(ox) + Math.abs(oy)) * (p.moveCost ?? 0.02);
				if (!best || sc > best.sc) best = { sc, n, a, x: F.x0 + gx + ox, y: gy + oy };
			}
		}
		if (!best || best.n < T.length * (p.min ?? 0.3)) return;
		const P = part(p.part), AX = F.masks.axe;
		const done = place(F, P, [cx - p.origin[0], cy - p.origin[1]], [best.x, best.y], best.a, false, null, false, (x, y) => AX?.has(F.q(x, y)));
		for (const [x, y] of done) { const i = F.at(x, y); if (F.out.d[i] === 255 && F.out.d[i + 1] === 0 && F.out.d[i + 2] === 255) F.out.d[i + 3] = 0; }
		(F.lm.follow ||= {})[p.part] = { x: best.x - F.x0, y: best.y, deg: Math.round(best.a * 180 / Math.PI), fit: +(best.n / T.length).toFixed(2) };
	},

	/**
	 * REGRIP: frames where the pack's figure swings the weapon two-handed but its own weapon doesn't show (the orc's
	 * spear trails behind him): p.grips[sheet][frame] = [back hand, front hand] (frame px, read off the pack's
	 * drawing). The old shaft behind the back hand goes, and the long-hafted part (p.part, butt at p.anchor, haft
	 * along p.axis) is laid from the back hand through the front hand; the front fist stays in front of the haft.
	 */
	regrip(F, B, H, p) {
		const g = p.grips?.[F.anim]?.[F.f];
		if (!g) return;
		const [[bx, by], [fx, fy]] = g.map(([x, y]) => [x + F.x0, y]);
		// the old shaft (thin wraps patches) behind the back hand, and its outline, off
		for (const b of F.lm.shafts || []) for (const [x, y] of b.px) if (x < bx - 1) {
			F.out.d[F.at(x, y) + 3] = 0;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy, k = F.kAt(nx, ny);
				if (nx >= bx - 1 || k !== K(p.outline)) continue;
				let body = false; for (let ey = -1; ey <= 1 && !body; ey++) for (let ex = -1; ex <= 1 && !body; ex++) { const kk = F.kAt(nx + ex, ny + ey); if (kk >= 0 && kk !== K(p.outline) && !b.px.some(([sx, sy]) => sx === nx + ex && sy === ny + ey)) body = true; }
				if (!body) F.out.d[F.at(nx, ny) + 3] = 0;
			}
		}
		const P = part(p.part), [ax, ay] = p.axis, ang = Math.atan2(fy - by, fx - bx) - Math.atan2(ay, ax);
		const SKIN = mat(B, 'skin'), WR = mat(B, 'wraps');
		const fist = (x, y) => (SKIN.has(F.kAt(x, y)) || WR.has(F.kAt(x, y))) && Math.hypot(x - fx, y - fy) <= (p.fist ?? 3);
		const done = place(F, P, p.anchor, [bx, by], ang, false, null, false, fist);
		F.masks.axe = new Set(done.map(([x, y]) => F.q(x, y)));
		F.lm.axe = { base: [fx, fy], dir: [Math.cos(ang), Math.sin(ang)] };
	},

	/**
	 * A cuirass from the chest's own pixels: the skin 4-connected to the middle of the chest, in the band from p.top
	 * to p.bottom rows above the kilt's top, re-shaded onto p.ramp by lightness (every muscle line kept); a fur collar
	 * on its top edge, bronze studs along its foot, iron spike studs at p.studs (offsets from the kilt's left end /
	 * top) where the leather is whole, and spikes off its front edge at p.edge rows.
	 */
	cuirass(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const SKIN = mat(B, 'skin'), KILT = mat(B, 'kilt');
		let ky = -1, kx0 = 1e9, kx1 = -1;
		for (let y = 0; y < F.ch && ky < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) { ky = y; break; }
		if (ky < 0) return;
		for (let y = ky; y <= ky + 3; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) { kx0 = Math.min(kx0, x); kx1 = Math.max(kx1, x); }
		// the chest hangs from the eye (or the head top): its middle at p.chest from the eye, p.half wide either side
		const eye = F.lm.eye || (F.lm.head && [F.lm.head[0] + p.head[0], F.lm.head[1] + p.head[1]]);
		if (!eye) return;
		const cx = eye[0] + p.chest[0];
		const y0 = eye[1] + p.neck, y1 = ky - p.bottom, inBand = (x, y) => y >= y0 && y <= y1 && x >= cx - p.half && x <= cx + p.half;
		const ok = (x, y) => F.inCell(x) && inBand(x, y) && SKIN.has(F.kAt(x, y)) && !F.masks.axe?.has(F.q(x, y));
		// seed: the skin pixel nearest the chest's middle
		const sx = cx, sy = eye[1] + p.chest[1];
		let seed = null, bd = 1e9;
		for (let y = y0; y <= y1; y++) for (let x = cx - p.half; x <= cx + p.half; x++) if (ok(x, y)) { const d = Math.abs(x - sx) + Math.abs(y - sy); if (d < bd) { bd = d; seed = [x, y]; } }
		if (!seed) return;
		const C = new Set([F.q(...seed)]), st = [seed];
		// muscle lines are drawn in the outline colour: step over a 1-px line to the skin beyond it (still inside the band)
		const OUT = mat(B, 'outline');
		while (st.length) {
			const [a, b] = st.pop();
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				let nx = a + dx, ny = b + dy;
				if (OUT.has(F.kAt(nx, ny)) && inBand(nx, ny)) { nx += dx; ny += dy; }
				const q = F.q(nx, ny); if (!C.has(q) && ok(nx, ny)) { C.add(q); st.push([nx, ny]); }
			}
		}
		const R = p.ramp.map(hex), lum = (x, y) => { const i = F.at(x, y); return 0.3 * F.out.d[i] + 0.59 * F.out.d[i + 1] + 0.11 * F.out.d[i + 2]; };
		const xy = (q) => [q % F.w, Math.floor(q / F.w)];
		for (const q of C) { const [x, y] = xy(q), L = lum(x, y); F.put(x, y, R[L > 170 ? 0 : L > 140 ? 1 : L > 110 ? 2 : L > 85 ? 3 : 4]); }
		const has = (x, y) => C.has(F.q(x, y));
		// fur collar: the top pixel of each column
		const FUR = p.collar.map(hex);
		for (let x = cx - p.half; x <= cx + p.half; x++) for (let y = y0; y <= y1; y++) if (has(x, y)) { F.put(x, y, FUR[(x + y) & 1]); break; }
		// bronze studs along the foot
		const BZ = p.bronze.map(hex);
		for (let x = cx - p.half + 4; x <= cx + p.half - 1; x += 3) { const y = ky - p.belt; if (has(x, y)) { F.put(x, y, BZ[0]); if (has(x, y + 1)) F.put(x, y + 1, BZ[1]); } }
		// iron spike studs
		const [IH, IM, ID] = p.iron.map(hex), O = hex(p.outline);
		for (const [dx, dy] of p.studs) {
			const x = cx - p.half + 1 + dx, y = ky - dy;
			let whole = true; for (let j = 0; j < 3; j++) for (let i = -1; i <= 1; i++) if (!has(x + i, y + j)) whole = false;
			if (!whole) continue;
			F.put(x, y, IH); F.put(x - 1, y + 1, IH); F.put(x, y + 1, IM); F.put(x + 1, y + 1, ID); F.put(x - 1, y + 2, O); F.put(x, y + 2, ID); F.put(x + 1, y + 2, O);
		}
		// spikes off the front edge (packs face +x)
		for (const dy of p.edge) {
			const y = ky - dy; let ex = -1;
			for (let x = cx - p.half; x <= cx + p.half; x++) if (has(x, y)) ex = x;
			if (ex < 0) continue;
			const rows = ['ooo..', 'hhhho', 'dddo.', 'oo...'], pal = { o: O, h: IH, d: ID };
			rows.forEach((r, j) => [...r].forEach((ch, i) => { const tx = ex + i, ty = y - 1 + j; if (ch !== '.' && F.inCell(tx) && (i < 2 || !F.isSet(tx, ty) || ch !== 'o')) F.put(tx, ty, pal[ch]); }));
		}
	},

	/**
	 * Fur boots on the lower legs: each skin patch whose foot is below the kilt (a shin) turns to shaggy fur from p.len
	 * rows above its foot, swelling p.bulk px at the cuff (then fewer down the leg), lit at the front, dark at the
	 * back and toward the ankle, stray light hairs and dark crevices from a hash (no pattern), a jagged outline and a
	 * ragged hem; the pixels just under it become the sole.
	 */
	furboots(F, B, H, p) {
		const SKIN = mat(B, 'skin'), KILT = mat(B, 'kilt'), FUR = p.fur.map(hex), SOLE = p.sole.map(hex), O = hex(p.outline);
		let ky = -1;
		for (let y = 0; y < F.ch && ky < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) { ky = y; break; }
		if (ky < 0) return;
		const hh = (...a) => { let v = 0; for (const t of a) v = (Math.imul(v, 1103515245) + Math.imul(t, 2654435761 | 0) + 12345) >>> 0; return (v >>> 13) & 0xff; };
		const isO = (x, y) => { const i = F.at(x, y); return F.out.d[i + 3] && F.out.d[i] < 12 && F.out.d[i + 1] < 12 && F.out.d[i + 2] < 12; };
		const seen = new Set(), legs = [];
		for (let y = ky + 2; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
			if (seen.has(F.q(x, y)) || !SKIN.has(F.kAt(x, y))) continue;
			const px = [], st = [[x, y]]; seen.add(F.q(x, y));
			while (st.length) { const [a, b] = st.pop(); px.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = a + dx, ny = b + dy; if (!F.inCell(nx) || ny < ky || ny >= F.ch || seen.has(F.q(nx, ny)) || !SKIN.has(F.kAt(nx, ny))) continue; seen.add(F.q(nx, ny)); st.push([nx, ny]); } }
			if (px.length >= 8) legs.push(px);
		}
		let kb = ky; for (let y = ky; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (KILT.has(F.kAt(x, y))) kb = y;
		const span = (px) => [Math.min(...px.map((v) => v[0])), Math.max(...px.map((v) => v[0])), Math.max(...px.map((v) => v[1]))];
		// feet = the lowest skin patches below the kilt; a boot = every leg pixel in the p.len rows above a foot's sole
		const feet = legs.filter((px) => { const [a, b, bot] = span(px); return bot > kb + 2 && !legs.some((o) => o !== px && span(o)[2] > bot && span(o)[0] <= b && span(o)[1] >= a); });
		const LEG = new Set(), skinLeg = new Set(), ext = new Set(), all = legs.flat();
		for (const ft of feet) {
			const [fa, fb, bot] = span(ft), top = bot - p.len;
			const px = all.filter(([x, y]) => y >= top && y <= bot && x >= fa - 3 && x <= fb + 3);
			const set = new Set(px.filter(([, y]) => y >= top).map(([x, y]) => F.q(x, y)));
			if (!set.size) continue;
			for (const q of set) skinLeg.add(q);
			for (let y = top; y <= bot; y++) {
				const xs = px.filter((v) => v[1] === y).map((v) => v[0]); if (!xs.length) continue;
				const g = y - top <= 4 ? p.bulk : y - top <= 12 ? p.bulk - 1 : 0, a = Math.min(...xs) - g, b = Math.max(...xs) + g;
				for (let x = a; x <= b; x++) if (F.inCell(x)) { LEG.add(F.q(x, y)); if (!set.has(F.q(x, y))) ext.add(F.q(x, y)); }
			}
			// soles: what lies right under the boot
			const x0 = Math.min(...px.map((v) => v[0])) - 3, x1 = Math.max(...px.map((v) => v[0])) + 4;
			for (let y = bot + 1; y <= bot + 3; y++) for (let x = x0; x <= x1; x++) if (F.inCell(x) && F.isSet(x, y) && !isO(x, y)) F.put(x, y, SOLE[hh(x, y) % 3 ? 0 : 1]);
		}
		const xy = (q) => [q % F.w, Math.floor(q / F.w)], inL = (x, y) => LEG.has(F.q(x, y));
		const tone = (x, y, base) => { const n = hh(x, y); let k = base; if (n < 26) k--; else if (n > 232) k++; return FUR[Math.max(0, Math.min(3, k))]; };
		// paint: the shin's own pixels and the new bulk (only over empty space or outline: never over the kilt)
		for (const q of LEG) {
			const [x, y] = xy(q);
			if (ext.has(q) && F.isSet(x, y) && !isO(x, y)) { LEG.delete(q); continue; }
		}
		for (const q of LEG) {
			const [x, y] = xy(q), l = !inL(x - 1, y), r = !inL(x + 1, y) || !inL(x + 2, y);
			let base = l ? 1 : r ? 3 : 2;
			if (base < 3 && hh(x, y, 9) % 3 && !inL(x, y + 3)) base++;
			F.put(x, y, tone(x, y, base));
		}
		for (const q of LEG) { const [x, y] = xy(q); if (hh(x, y, 4) < 20 && inL(x - 1, y) && inL(x + 1, y)) { F.put(x, y, FUR[0]); if (inL(x, y + 1)) F.put(x, y + 1, FUR[1]); } }
		// outline round the new bulk, jagged fur at the sides
		for (const q of LEG) {
			const [x, y] = xy(q);
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (F.inCell(nx) && !inL(nx, ny) && !F.isSet(nx, ny)) F.put(nx, ny, O); }
		}
		for (const q of LEG) {
			const [x, y] = xy(q);
			for (const dx of [-1, 1]) {
				const n = x + dx, m = x + 2 * dx;
				if (!inL(n, y) && F.inCell(m) && isO(n, y) && !F.isSet(m, y) && hh(x, y, dx + 7) % 5 === 0 && inL(x, y - 1) && inL(x, y + 1)) { F.put(n, y, FUR[3]); F.put(m, y, O); }
			}
		}
	},

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
		const done = place(F, P, p.anchor, [base[0] - ux * (p.back ?? 0), base[1] - uy * (p.back ?? 0)], ang, flip, keep);
		F.lm.axe = { base, dir: [ux, uy] };
		F.masks.axe = new Set(done.map(([x, y]) => F.q(x, y)));
	},

	/**
	 * A part strapped to the free forearm (the Spartan's round shield): its centre on the bracer furthest BACK (−x,
	 * packs face right); frames with no bracer keep the offset the strip last saw from the belt.
	 */
	shield(F, B, H, p) {
		const P = part(p.part), rig = F.lm.arm, AX = F.masks.axe, skip = (x, y) => AX?.has(F.q(x, y));
		if (rig?.hand) {
			const turn = H._rig ? rig.a - H._rig.a : 0, c = Math.cos(turn), s = Math.sin(turn), [ox, oy] = p.grip || [0, 0];
			const at = [Math.round(rig.hand[0] + c * ox - s * oy), Math.round(rig.hand[1] + s * ox + c * oy)];
			place(F, P, [P.img.w / 2, P.img.h / 2], at, turn, false, null, false, skip);
			F.strip.shAt = at; F.strip.shOff = rig.S ? [at[0] - rig.S[0], at[1] - rig.S[1]] : F.strip.shOff; F.lm.shield = at;
			return;
		}
		// the arm is hidden (behind the body): the shield stays where the shoulder last carried it
		const S = rig?.S, o = F.strip.shOff || p.off || [-9, 21];
		if (!S) return;
		const at = [Math.round(S[0] + o[0]), Math.round(S[1] + o[1])];
		place(F, P, [P.img.w / 2, P.img.h / 2], at, 0, false, null, false, skip);
		F.lm.shield = at;
	}
};
