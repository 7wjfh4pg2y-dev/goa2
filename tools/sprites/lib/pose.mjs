// The pose stage: NEW Hit / Death frames made from a hero's finished frames by moving the pack's OWN pixels whole
// (the art-consistency rule: nothing is drawn — no generated strokes, no limbs; the user turned down a redrawn arm,
// 2026-11-26). Runs after the passes, on the hero's output strips, for any pack that declares a `rig` in base.mjs:
//
//   rig: { arm: 'leather', hip: 'buckle', neck: 'collar', knee: 6, hand? }   (hand = a pack whose arm is one with the
//        body, e.g. bare skin: the Defend ward's hand = the forward-most pixel of that material; arm / neck may be left out)
//     arm  = the material of the free (front) arm — the patch furthest FORWARD (+x) between the neck and a little
//            below the hip; it RIDES the torso as one rigid piece (otherwise the lean would break it at the belt)
//     hip  = the belt material: rows above its first row lean, the legs stay planted
//     neck = the first row of this material = where the head starts (the head whips on its own)
//     knee = rows above the foot where a crouch takes rows out of the legs
//
// A pose = { lean, head, crouch }: lean / head in px (− = back, packs face right), crouch in rows; given for a ~45 px
// figure and scaled with the character. Poses that need a new LIMB position come from the pack's own drawings
// instead (Defend = the pack's `guard` frames, see base.mjs / anims.mjs).
import { K, key } from './pixels.mjs';

/** The generated sheets: name → {from: source sheet, frames: [[source frame, pose] | 'rest' (copy the rest)]}. */
export const POSES = {
	// Hit: the blow snaps the torso back and the head further, then it settles
	phit: { from: 'hit', frames: [
		[0, { lean: -4, head: -2, crouch: 1 }],
		[1, { lean: -3, head: -2, crouch: 1 }],
		[2, { lean: -1, head: 0, crouch: 0 }]
	] },
	// Death: thrown back by the killing blow, the head lolls, the knees give, the body pitches forward → the pack's collapse
	pdeath: { from: 'death', frames: [
		[0, { lean: -4, head: -2, crouch: 1 }],
		[1, { lean: -2, head: -3, crouch: 2 }],
		[2, { lean: 2, head: 3, crouch: 3 }],
		'rest'
	] }
};

/**
 * Build the generated sheets for a hero. `out[sheet]` = the hero's finished strips ({w, h, d}), `src[sheet]` = the
 * pack's strips (background cleared; read for the materials only). Returns {name: {img, frames}}.
 */
export function buildPoses(B, H, out, src, charH) {
	if (!B.rig) return {};
	const R = B.rig, cw = B.cell, k = charH / 45, res = {};
	const rig = { ARM: new Set((B.materials[R.arm] || []).map(K)), HIP: new Set((B.materials[R.hip] || []).map(K)), NECK: new Set((B.materials[R.neck] || []).map(K)), knee: R.knee ?? 6 };
	for (const [name, def] of Object.entries(POSES)) {
		const O = out[def.from], S = src[def.from];
		if (!O || !S) continue;
		const n = Math.round(O.w / cw), list = [];
		for (const e of def.frames) {
			if (e === 'rest') { for (let f = list.at(-1)[0] + 1; f < n; f++) list.push([f, null]); continue; }
			if (e[0] < n) list.push(e);
		}
		const img = { w: list.length * cw, h: O.h, d: new Uint8Array(list.length * cw * O.h * 4) };
		list.forEach(([f, p], i) => {
			const cell = cut(O, f * cw, cw);
			const kAt = (x, y) => { const j = (y * S.w + f * cw + x) * 4; return S.d[j + 3] ? key(S.d[j], S.d[j + 1], S.d[j + 2]) : -1; };
			paste(img, p ? pose(cell, kAt, B.foot, rig, scaled(p, k)) : cell, i * cw);
		});
		res[name] = { img, frames: list.length };
	}
	return res;
}

/** Where the free hand is in a frame (the forward tip of the free arm) — the Defend ward stands just in front of it. */
export function handAt(cell, kAt, foot, rig) {
	if (rig.HAND) { // the arm is one with the body (bare skin): the hand = the forward-most hand-material pixel
		let best = null;
		for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) if (cell.d[(y * cell.w + x) * 4 + 3] && rig.HAND.has(kAt(x, y)) && (!best || x > best[0])) best = [x, y];
		return best && [best[0] + 1, best[1]];
	}
	const g = geometry(cell, kAt, foot, rig);
	if (!g.arm) return null;
	let best = null;
	for (const [x, y] of g.arm) if (!best || x > best[0] || (x === best[0] && y < best[1])) best = [x, y];
	return [best[0] + 1, best[1]];
}

const scaled = (p, k) => ({ lean: Math.round(p.lean * k), head: Math.round(p.head * k), crouch: Math.round(p.crouch * k) });
function cut(img, x0, cw) { const c = { w: cw, h: img.h, d: new Uint8Array(cw * img.h * 4) }; for (let y = 0; y < img.h; y++) c.d.set(img.d.subarray((y * img.w + x0) * 4, (y * img.w + x0 + cw) * 4), y * cw * 4); return c; }
function paste(img, c, x0) { for (let y = 0; y < c.h; y++) img.d.set(c.d.subarray(y * c.w * 4, (y + 1) * c.w * 4), (y * img.w + x0) * 4); }

/** Rows: the figure's top, the belt (hip) row, the neck row; and the free arm's pixels. */
function geometry(c, kAt, foot, rig) {
	const W = c.w, Hh = c.h, on = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && c.d[(y * W + x) * 4 + 3];
	let top = Hh, hipY = -1, neckY = -1, hx0 = W, hx1 = -1;
	for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
		if (!on(x, y)) continue;
		top = Math.min(top, y); const kk = kAt(x, y);
		if (rig.HIP.has(kk)) { if (hipY < 0) hipY = y; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
		if (neckY < 0 && rig.NECK.has(kk)) neckY = y;
	}
	if (hipY < 0) hipY = foot - Math.round((foot - top) * 0.55);
	if (neckY < 0) neckY = top + Math.round((hipY - top) * 0.3);
	const hipMid = hx1 >= 0 ? (hx0 + hx1) / 2 : W / 2;
	const lo = hipY + Math.round((hipY - neckY) * 0.9), seen = new Set(); let arm = null, armX = -1;
	for (let y = neckY; y <= lo; y++) for (let x = 0; x < W; x++) {
		if (seen.has(y * W + x) || !on(x, y) || !rig.ARM.has(kAt(x, y))) continue;
		const px = [], st = [[x, y]]; seen.add(y * W + x);
		while (st.length) {
			const [a, b] = st.pop(); px.push([a, b]);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = a + dx, ny = b + dy;
				if (ny < neckY || ny > lo || seen.has(ny * W + nx) || !on(nx, ny) || !rig.ARM.has(kAt(nx, ny))) continue;
				seen.add(ny * W + nx); st.push([nx, ny]);
			}
		}
		const mx = px.reduce((s, q) => s + q[0], 0) / px.length;
		if (px.length >= 4 && mx > hipMid + 2 && mx > armX) { arm = px; armX = mx; }
	}
	return { top, hipY, neckY, arm };
}

/** One posed frame: lean + head whip above the belt, a crouch at the knee, the free arm riding the torso whole. */
export function pose(c, kAt, foot, rig, p) {
	const W = c.w, Hh = c.h, at = (x, y) => (y * W + x) * 4;
	const { top, hipY, neckY, arm } = geometry(c, kAt, foot, rig);
	const d = new Uint8Array(c.d);
	// lift the free arm out (kept whole, pasted back where its shoulder went)
	let armPx = null, sh = null;
	if (arm) {
		armPx = arm.map(([x, y]) => [x, y, d.slice(at(x, y), at(x, y) + 4)]);
		for (const [x, y] of arm) if (!sh || y < sh[1]) sh = [x, y];
		for (const [x, y] of arm) d[at(x, y) + 3] = 0;
	}
	const row = (y) => (y < hipY ? Math.round((p.lean * (hipY - y)) / Math.max(1, hipY - top)) + (y < neckY ? p.head : 0) : 0);
	const L = new Uint8Array(d.length);
	for (let y = 0; y < Hh; y++) { const dx = row(y); for (let x = 0; x < W; x++) { const sx = x - dx; if (sx >= 0 && sx < W) L.set(d.subarray(at(sx, y), at(sx, y) + 4), at(x, y)); } }
	// crouch: the `cr` rows just above the knee go, everything above them comes down over them
	const kneeY = foot - rig.knee, cr = Math.max(0, p.crouch || 0), C = new Uint8Array(L.length);
	for (let y = 0; y < Hh; y++) { const from = y >= kneeY ? y : y - cr; if (from >= 0) C.set(L.subarray(at(0, from), at(0, from) + W * 4), at(0, y)); }
	if (armPx) {
		const dx = row(sh[1]), dy = sh[1] < kneeY ? cr : 0;
		for (const [x, y, px] of armPx) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < Hh) C.set(px, at(nx, ny)); }
	}
	return { w: W, h: Hh, d: C };
}

/** The free hand on each of a sheet's frames (null where not asked / not found): [frame] → [x, y] in cell px. */
export function handsOf(B, out, src, sheet, frames) {
	const O = out[sheet], S = src[sheet], cw = B.cell;
	if (!B.rig || !O || !S) return null;
	const rig = { ARM: new Set((B.materials[B.rig.arm] || []).map(K)), HIP: new Set((B.materials[B.rig.hip] || []).map(K)), NECK: new Set((B.materials[B.rig.neck] || []).map(K)), knee: B.rig.knee ?? 6, HAND: B.rig.hand ? new Set((B.materials[B.rig.hand] || []).map(K)) : null };
	const n = Math.round(O.w / cw), res = Array(n).fill(null);
	for (const f of frames) {
		if (f >= n) continue;
		const kAt = (x, y) => { const j = (y * S.w + f * cw + x) * 4; return S.d[j + 3] ? key(S.d[j], S.d[j + 1], S.d[j + 2]) : -1; };
		res[f] = handAt(cut(O, f * cw, cw), kAt, B.foot, rig);
	}
	return res;
}
