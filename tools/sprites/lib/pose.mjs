// The pose stage: NEW frames made from a hero's finished frames, at the pack's own pixel scale (the art-consistency
// rule: every pixel is the pack's own, moved whole-pixel, or a stroke in the pack's own shades). Runs after the
// passes, on the hero's output strips, so it works for any hero of a pack that declares a `rig` in its base.mjs:
//
//   rig: { arm: 'leather', hip: 'buckle', neck: 'collar', knee: 6 }
//     arm  = the material of the free (near, front) arm — found as the leather patch furthest FORWARD (+x) between
//            the neck and a little below the hip, right of the hip's middle; erased and redrawn at new angles
//     hip  = the belt material: rows above its first row lean, the legs stay planted
//     neck = the first row of this material = where the head starts (the head whips on its own)
//     knee = rows above the foot where a crouch takes rows out of the legs
//
// A pose = { lean, head, crouch, arm: [upper, fore] | null }: lean / head in px (− = back, packs face right),
// crouch in rows, arm angles in degrees (0 = hanging straight down, 90 = straight forward, 180 = straight up).
// Lengths scale with the character (lean etc. are given for a ~45 px figure).
import { K, hex, key } from './pixels.mjs';

/** The generated sheets: name → {from: source sheet, frames: [[source frame, pose] | source frame (copied)]}. */
export const POSES = {
	// Hit: the blow snaps the torso back and the head further, the free arm flies up and swings back down
	phit: { from: 'hit', frames: [
		[0, { lean: -4, head: -2, crouch: 1, arm: [115, 160] }],
		[1, { lean: -3, head: -2, crouch: 1, arm: [80, 115] }],
		[2, { lean: -1, head: 0, crouch: 0, arm: [30, 45] }]
	] },
	// Death: thrown back by the killing blow (arm flung up), the head lolls, the knees give, the body pitches
	// forward with the arm hanging → the pack's own collapse
	pdeath: { from: 'death', frames: [
		[0, { lean: -4, head: -2, crouch: 1, arm: [125, 170] }],
		[1, { lean: -2, head: -3, crouch: 2, arm: [75, 45] }],
		[2, { lean: 2, head: 3, crouch: 3, arm: [10, -5] }],
		'rest'
	] },
	// Defend: the free hand comes up in front, forearm raised, palm out to the attacker (Arien's card art), and holds
	// while the ward stands (frames 1 … n−2 = guard)
	pdefend: { from: 'idle', frames: [
		[0, { lean: 0, head: 0, crouch: 0, arm: [45, 110] }],
		[1, { lean: -1, head: 0, crouch: 1, arm: [70, 160], palm: true }],
		[2, { lean: -2, head: -1, crouch: 1, arm: [72, 165], palm: true }],
		[3, { lean: -2, head: -1, crouch: 1, arm: [72, 165], palm: true }],
		[4, { lean: -1, head: 0, crouch: 1, arm: [70, 160], palm: true }],
		[5, { lean: -1, head: 0, crouch: 1, arm: [70, 160], palm: true }],
		[6, { lean: 0, head: 0, crouch: 0, arm: [45, 90] }]
	] }
};

/**
 * Build the generated sheets for a hero. `out[sheet]` = the hero's finished strips ({w, h, d}), `src[sheet]` = the
 * pack's strips (background cleared; read for the materials only). Returns {name: {img, frames, palm: [[x, y] | null]}}.
 */
export function buildPoses(B, H, out, src, charH) {
	if (!B.rig) return {};
	const R = B.rig, cw = B.cell, k = charH / 45, res = {};
	const ARM = new Set((B.materials[R.arm] || []).map(K)), HIP = new Set((B.materials[R.hip] || []).map(K)), NECK = new Set((B.materials[R.neck] || []).map(K));
	const shade = (H.palette[R.arm] || B.materials[R.arm]).map(hex);
	for (const [name, def] of Object.entries(POSES)) {
		const O = out[def.from], S = src[def.from];
		if (!O || !S) continue;
		const n = Math.round(O.w / cw), list = [];
		for (const e of def.frames) {
			if (e === 'rest') { for (let f = list.at(-1)[0] + 1; f < n; f++) list.push([f, null]); continue; }
			if (e[0] < n) list.push(e);
		}
		const img = { w: list.length * cw, h: O.h, d: new Uint8Array(list.length * cw * O.h * 4) }, palm = [];
		list.forEach(([f, p], i) => {
			const cell = cut(O, f * cw, cw);
			if (!p) { paste(img, cell, i * cw); palm.push(null); return; }
			const kAt = (x, y) => { const j = (y * S.w + f * cw + x) * 4; return S.d[j + 3] ? key(S.d[j], S.d[j + 1], S.d[j + 2]) : -1; };
			const posed = pose(cell, kAt, B.foot, { ARM, HIP, NECK, knee: R.knee ?? 6 }, scaled(p, k), shade);
			paste(img, posed.cell, i * cw); palm.push(posed.palm);
		});
		res[name] = { img, frames: list.length, palm };
	}
	return res;
}

const scaled = (p, k) => ({ ...p, lean: Math.round(p.lean * k), head: Math.round(p.head * k), crouch: Math.round(p.crouch * k) });
function cut(img, x0, cw) { const c = { w: cw, h: img.h, d: new Uint8Array(cw * img.h * 4) }; for (let y = 0; y < img.h; y++) c.d.set(img.d.subarray((y * img.w + x0) * 4, (y * img.w + x0 + cw) * 4), y * cw * 4); return c; }
function paste(img, c, x0) { for (let y = 0; y < c.h; y++) img.d.set(c.d.subarray(y * c.w * 4, (y + 1) * c.w * 4), (y * img.w + x0) * 4); }

/** One posed frame. */
export function pose(c, kAt, foot, rig, p, shade) {
	const W = c.w, Hh = c.h, at = (x, y) => (y * W + x) * 4, on = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && c.d[at(x, y) + 3];
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
	// the free arm: the leather patch furthest forward between the neck and just under the hip
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
	const d = new Uint8Array(c.d);
	let shoulder = null, len = 0;
	if (arm && p.arm) {
		let sy = Hh, sx = 0, by = 0;
		for (const [x, y] of arm) { if (y < sy || (y === sy && x > sx)) { sy = y; sx = x; } by = Math.max(by, y); }
		shoulder = [sx, sy]; len = Math.max(6, by - sy + 1);
		const mine = new Set(arm.map(([x, y]) => y * W + x));
		for (const [x, y] of arm) d[at(x, y) + 3] = 0;
		// fill what the arm covered on the body: a pixel with body on BOTH sides takes the colour on its left
		for (const [x, y] of arm) {
			let r = -1; for (let q = 1; q <= 3; q++) { if (x + q < W && d[at(x + q, y) + 3] && !mine.has(y * W + x + q)) { r = x + q; break; } }
			if (r < 0 || x < 1 || !d[at(x - 1, y) + 3]) continue;
			d.copyWithin(at(x, y), at(x - 1, y), at(x - 1, y) + 4);
		}
	}
	// lean (rows above the hip, more towards the top) + the head's own whip
	const row = (y) => (y < hipY ? Math.round((p.lean * (hipY - y)) / Math.max(1, hipY - top)) + (y < neckY ? p.head : 0) : 0);
	const L = new Uint8Array(d.length);
	for (let y = 0; y < Hh; y++) { const dx = row(y); for (let x = 0; x < W; x++) { const sx = x - dx; if (sx >= 0 && sx < W) L.set(d.subarray(at(sx, y), at(sx, y) + 4), at(x, y)); } }
	// crouch: take rows out of the legs at the knee, everything above drops
	const kneeY = foot - rig.knee, cr = Math.max(0, p.crouch || 0), C = new Uint8Array(L.length);
	// (the `cr` rows just above the knee are the ones that go: everything above them comes down over them)
	for (let y = 0; y < Hh; y++) { const from = y >= kneeY ? y : y - cr; if (from >= 0) C.set(L.subarray(at(0, from), at(0, from) + W * 4), at(0, y)); }
	let palm = null;
	if (shoulder) {
		const S = [shoulder[0] + row(shoulder[1]), shoulder[1] + (shoulder[1] < kneeY ? cr : 0)];
		const u = Math.round(len * 0.5), f = len - u, rad = (a) => (a * Math.PI) / 180;
		const E = [Math.round(S[0] + u * Math.sin(rad(p.arm[0]))), Math.round(S[1] + u * Math.cos(rad(p.arm[0])))];
		const Hd = [Math.round(E[0] + f * Math.sin(rad(p.arm[1]))), Math.round(E[1] + f * Math.cos(rad(p.arm[1])))];
		const put = (x, y, col) => { if (x < 0 || y < 0 || x >= W || y >= Hh) return; const i = at(x, y); C[i] = col[0]; C[i + 1] = col[1]; C[i + 2] = col[2]; C[i + 3] = 255; };
		const limb = (A, Bp) => {
			const n = Math.max(Math.abs(Bp[0] - A[0]), Math.abs(Bp[1] - A[1]), 1), vert = Math.abs(Bp[1] - A[1]) >= Math.abs(Bp[0] - A[0]);
			for (let t = 0; t <= n; t++) {
				const x = Math.round(A[0] + ((Bp[0] - A[0]) * t) / n), y = Math.round(A[1] + ((Bp[1] - A[1]) * t) / n);
				// two px thick like the pack's arms: the lit edge outward (right / top), the shade inside (left / below)
				if (vert) { put(x - 1, y, shade[1]); put(x, y, shade[0]); } else { put(x, y + 1, shade[1]); put(x, y, shade[0]); }
			}
		};
		limb(S, E); limb(E, Hd);
		// the hand: a glove in the darker shades; an open palm (casting) stands up 3 px, lit on its front
		const g1 = shade[Math.min(1, shade.length - 1)], g2 = shade[Math.min(2, shade.length - 1)];
		if (p.palm) { put(Hd[0], Hd[1] - 1, g1); put(Hd[0], Hd[1], g1); put(Hd[0], Hd[1] + 1, g2); put(Hd[0] + 1, Hd[1] - 2, shade[0]); put(Hd[0] + 1, Hd[1] - 1, shade[0]); put(Hd[0] + 1, Hd[1], g1); palm = [Hd[0] + 2, Hd[1] - 1]; }
		else { put(Hd[0], Hd[1], g1); put(Hd[0] + 1, Hd[1], g1); put(Hd[0], Hd[1] + 1, g2); put(Hd[0] + 1, Hd[1] + 1, g2); }
	}
	return { cell: { w: W, h: Hh, d: C }, palm };
}
