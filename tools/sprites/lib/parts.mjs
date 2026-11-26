// The parts library: every pass a hero spec can list, in the order it lists them. A pass gets the frame `F`
// (pixels.mjs frameOf), the base pack `B`, the hero `H` and its own params `p`. Landmarks a pass finds go in
// F.lm, pixel sets other passes respect go in F.masks. Passes paint F.out; they never touch the source.
//
// Colours: a base pack names its MATERIALS (source colours, light → dark); a hero's `palette` gives the same
// material names their new colours (same order). Unlisted materials keep the source colours.
import { hex, K, patches } from './pixels.mjs';
import { KIT } from './kit.mjs';

const mat = (B, name) => (B.materials[name] || []).map(K);
const rgb = (H, name, i) => hex(H.palette[name][i]);

export const PASSES = {
	/**
	 * Hair segmentation. Hair shares its colours with other things (the huntress' arrow fletching): hair = every
	 * hair-coloured patch except small ones (≤ p.small px) touching the `p.not` material; the largest patch is
	 * always hair and is kept as F.lm.hair (the head, for later landmarks).
	 */
	hair(F, B, H, p = {}) {
		const HAIR = new Set(mat(B, 'hair')), NOT = new Set(mat(B, p.not || 'shaft')), small = p.small ?? 6;
		const all = patches(F, (k) => HAIR.has(k), (k) => NOT.has(k));
		let best = [];
		for (const c of all) if (c.px.length > best.length) best = c.px;
		const set = new Set();
		for (const c of all) if (!(c.touches && c.px.length <= small)) for (const [x, y] of c.px) set.add(F.q(x, y));
		for (const [x, y] of best) set.add(F.q(x, y));
		F.masks.hair = set; F.lm.hair = best;
	},

	/**
	 * Recolour by material. Hair pixels: the base's hair[0] (highlight) → palette.hair[0], the rest → hair[1].
	 * Hair-coloured pixels that are NOT hair → palette.glint (highlight / shade). Everything else by material.
	 */
	recolor(F, B, H) {
		const HAIR = mat(B, 'hair'), hairSet = F.masks.hair || new Set();
		const table = new Map();
		for (const [name, src] of Object.entries(B.materials)) {
			if (name === 'hair' || !H.palette[name]) continue;
			src.forEach((c, i) => table.set(K(c), hex(H.palette[name][Math.min(i, H.palette[name].length - 1)])));
		}
		for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
			const k = F.kAt(x, y); if (k < 0) continue;
			if (HAIR.includes(k)) {
				if (hairSet.has(F.q(x, y))) { F.put(x, y, rgb(H, 'hair', k === HAIR[0] ? 0 : 1)); continue; }
				if (H.palette.glint) { F.put(x, y, rgb(H, 'glint', k === HAIR[0] ? 0 : 1)); continue; }
			}
			F.put(x, y, table.get(k) ?? F.srcRgb(x, y));
		}
	},

	/**
	 * Turn a pack's energy effects into WATER (torrent / water-bending). Effect pixels = opaque pixels whose colour is
	 * no material of the pack. Solid fills (B.fx.fill) become a body of water shaded by depth from its edge (foam rim →
	 * aqua → deep); everything else (thin bolts / sparks) breaks into spray: most pixels kept as light spray, the rest
	 * shed one pixel down as a falling droplet. p.colors = {foam, light, mid, deep, spray, drop}.
	 */
	torrent(F, B, H, p) {
		const body = new Set(Object.values(B.materials).flat().map(K)), fill = new Set((B.fx?.fill || []).map(K));
		const c = Object.fromEntries(Object.entries(p.colors).map(([k, v]) => [k, hex(v)]));
		const isFx = (x, y) => { const k = F.kAt(x, y); return k >= 0 && !body.has(k); };
		const isFill = (x, y) => fill.has(F.kAt(x, y));
		const depth = (x, y) => { for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const nx = x + dx, ny = y + dy; if (!F.inCell(nx) || ny < 0 || ny >= F.ch || !isFill(nx, ny)) return r; } return 4; };
		const drops = [];
		for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
			if (!isFx(x, y)) continue;
			if (isFill(x, y)) { const d = depth(x, y); F.put(x, y, d === 1 ? c.foam : d === 2 ? c.light : d === 3 ? c.mid : c.deep); continue; }
			// a bolt inside / against the water is part of the wave
			let wet = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isFill(x + dx, y + dy)) wet++;
			if (wet >= 6) { F.put(x, y, wet >= 14 ? c.mid : c.light); continue; }
			const h = ((x - F.x0) * 73856093) ^ (y * 19349663) ^ (F.f * 83492791);
			if ((h >>> 0) % 7 < (p.shed ?? 3)) { F.out.d[F.at(x, y) + 3] = 0; drops.push([x, y + 1 + ((h >>> 3) & 1)]); continue; }
			const nearFill = isFill(x + 1, y) || isFill(x - 1, y) || isFill(x, y + 1) || isFill(x, y - 1);
			F.put(x, y, nearFill ? c.foam : (h >>> 5) & 1 ? c.spray : c.light);
		}
		for (const [x, y] of drops) if (F.inCell(x) && y < F.ch && !F.isSet(x, y)) F.put(x, y, c.drop);
	},

	/**
	 * A spiked FIN CREST on a helmet: p.from = the source colours of the head's top (e.g. the pack's hair); from its
	 * topmost row, `spikes` fins rise and lean BACK (away from the facing), front fin tallest. p.colors = {hi, mid, dk}.
	 */
	crest(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const top = new Set(p.from.map(K));
		let ty = -1, x0 = 1e9, x1 = -1;
		for (let y = 0; y < F.ch && ty < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (top.has(F.kAt(x, y))) { ty = y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
		if (ty < 0) return;
		for (let y = ty; y < ty + 2; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (top.has(F.kAt(x, y))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
		const c = Object.fromEntries(Object.entries(p.colors).map(([k, v]) => [k, hex(v)]));
		(p.spikes || [4, 3, 2]).forEach((h, i) => {
			const bx = x1 - i * (p.gap || 2);
			if (bx < x0 - 1) return;
			for (let k = 1; k <= h; k++) {
				const x = bx - Math.floor(k / 2), y = ty - k;
				if (!F.isSet(x, y)) F.put(x, y, k === h ? c.hi : c.mid);
				if (k < h - 1 && !F.isSet(x - 1, y)) F.put(x - 1, y, c.dk);
			}
		});
		F.lm.crest = [x1, ty];
	},

	/** A third, darker hair tone on edges facing away from the light (open below or to the left), not on highlights. */
	hairEdge(F, B, H) {
		const HI = mat(B, 'hair')[0];
		for (const q of F.masks.hair || []) {
			const x = q % F.w, y = Math.floor(q / F.w);
			const open = F.kAt(x, y + 1) < 0 || F.kAt(x - 1, y) < 0;
			if (open && F.kAt(x, y) !== HI) F.put(x, y, rgb(H, 'hair', 2));
		}
	},

	/** Studs + highlights on a two-tone weapon limb at a regular pixel rhythm (Silverarrow's bow). */
	studs(F, B, H, p) {
		const [LT, DK] = mat(B, p.material);
		for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
			if (F.kAt(x, y) === LT && F.kAt(x + 1, y) === DK && y % p.every === p.studAt) F.put(x, y, hex(p.stud));
			if (F.kAt(x, y) === LT && F.kAt(x - 1, y) < 0 && F.kAt(x, y - 1) === LT && y % p.every === p.hiAt) F.put(x, y, hex(p.hi));
		}
	},

	/**
	 * Landmarks: the eye (first pixel of the base's eye colour, top-down; a frame without one places it from the head
	 * at the offset the strip's earlier frames showed), the hair tie (centre-left of the tie material), the shoulder
	 * (skin just below and behind the eye, ≤ p.shoulderW px wide). Skipped frames (H.skip) get no eye / shoulder.
	 */
	landmarks(F, B, H, p = {}) {
		const EYE = mat(B, 'eye')[0], TIE = mat(B, 'tie')[0], SKIN = new Set(mat(B, 'skin'));
		let tx = 1e9, ty = 0, tn = 0;
		for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (F.kAt(x, y) === TIE) { tn++; tx = Math.min(tx, x); ty += y; }
		if (tn) F.lm.tie = [tx - 1, Math.round(ty / tn)];
		let ex = -1, ey = -1;
		for (let y = 0; y < F.ch && ex < 0; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (F.kAt(x, y) === EYE) { ex = x; ey = y; break; }
		const head = F.lm.hair || [];
		const hb = head.length ? [Math.max(...head.map((v) => v[0])), Math.min(...head.map((v) => v[1]))] : null;
		const offs = (F.strip.eyeOff ||= []);
		if (hb && ex >= 0) offs.push([ex - hb[0], ey - hb[1]]);
		else if (hb && ex < 0) { const o = offs.length ? offs[offs.length - 1] : [-2, 4]; ex = hb[0] + o[0]; ey = hb[1] + o[1]; }
		if (ex < 0 || skipped(F, H, 'gear')) return;
		F.lm.eye = [ex, ey];
		const hair = F.masks.hair || new Set(), sh = [];
		for (let y = ey + 2; y <= ey + 8; y++) for (let x = ex - 9; x <= ex - 2; x++) if (x >= F.x0 && SKIN.has(F.kAt(x, y)) && !hair.has(F.q(x, y))) sh.push([x, y]);
		const r = sh.length ? Math.max(...sh.map((v) => v[0])) : 0;
		const kept = sh.filter((v) => v[0] >= r - ((p.shoulderW ?? 4) - 1));
		if (kept.length >= 2) F.lm.shoulder = { px: kept, top: Math.min(...kept.map((v) => v[1])), left: Math.min(...kept.map((v) => v[0])), right: Math.max(...kept.map((v) => v[0])) };
	},

	/** A ridged leather pauldron over the shoulder skin: light top plate, alternating ridges, a raised cap, a dark rim behind, a rivet. */
	pauldron(F, B, H, p) {
		const s = F.lm.shoulder; if (!s) return;
		const SKIN = new Set(mat(B, 'skin')), c = Object.fromEntries(Object.entries(p.colors).map(([k, v]) => [k, hex(v)]));
		for (const [x, y] of s.px) { const r = y - s.top; F.put(x, y, r === 0 ? c.hi : r % 2 === 1 ? c.dk : c.mid); }
		for (let x = s.left; x <= s.right; x++) { const y = s.top - 1; if (!F.isSet(x, y) || SKIN.has(F.kAt(x, y))) F.put(x, y, c.mid); }
		for (let y = s.top; y <= s.top + 2; y++) if (!F.isSet(s.left - 1, y)) F.put(s.left - 1, y, c.edge);
		F.put(Math.round((s.left + s.right) / 2), s.top, c.rivet);
	},

	/** A quiver on the back: a slanted 3 px tube behind the body (banded), fletching above its mouth; masked so hair may fall over it. */
	quiver(F, B, H, p) {
		const s = F.lm.shoulder; if (!s) return;
		const c = Object.fromEntries(Object.entries(p.colors).map(([k, v]) => [k, hex(v)]));
		const mask = (F.masks.behind ||= new Set());
		const qx = s.left + p.at[0], qy = s.top + p.at[1];
		for (let t = 0; t <= p.len; t++) for (let w = 0; w < 3; w++) {
			const x = Math.round(qx + p.dx * t + w - 1), y = Math.round(qy + p.dy * t);
			if (!F.inCell(x) || (F.isSet(x, y) && !mask.has(F.q(x, y)))) continue;
			F.put(x, y, t === 1 || t === p.len - 1 ? c.band : w === 2 ? c.lt : w === 1 ? c.md : c.dk);
			mask.add(F.q(x, y));
		}
		for (const [fx, fy, which] of p.fletch) {
			const x = Math.round(qx + fx), y = Math.round(qy + fy);
			if (F.inCell(x) && !F.isSet(x, y)) { F.put(x, y, which ? c.fl2 : c.fl); mask.add(F.q(x, y)); }
		}
	},

	/** A strap across the chest from the shoulder, painted over the given material only, with a buckle every `buckle` px. */
	strap(F, B, H, p) {
		const s = F.lm.shoulder; if (!s) return;
		const ON = new Set(mat(B, p.over));
		for (let t = 1; t <= p.len; t++) { const x = s.right + Math.round(t * p.slope), y = s.top + 1 + t; if (ON.has(F.kAt(x, y))) F.put(x, y, hex(t % p.buckle === 0 ? p.buckleColor : p.color)); }
	},

	/**
	 * A ponytail from the tie (else the back of the head): a tapered curve per animation (p.byAnim[sheet] = {L, dx, dy,
	 * amp, upto}) swaying with the frame index, drawn only behind the sprite (or over `behind` gear), with a shaded
	 * underside, a dark tip and the tie colour at its root.
	 */
	ponytail(F, B, H, p) {
		const T = p.byAnim[F.anim], head = F.lm.hair || [];
		if (!T || !head.length || (T.upto && F.f >= T.upto)) return;
		let ax, ay;
		if (F.lm.tie) [ax, ay] = F.lm.tie;
		else { const top = Math.min(...head.map((v) => v[1])); const row = head.filter((v) => v[1] <= top + 2); ax = Math.min(...row.map((v) => v[0])); ay = top + 2; }
		const behind = F.masks.behind || new Set(), free = (x, y) => !F.isSet(x, y) || behind.has(F.q(x, y));
		const ph = (F.f / F.n) * Math.PI * 2, m = Math.hypot(T.dx, T.dy), ux = T.dx / m, uy = T.dy / m, px = -uy, py = ux;
		const pts = [];
		for (let t = 0; t <= T.L; t += 0.35) { const wave = T.amp * Math.sin(t * 0.55 - ph) * (t / T.L) * 1.6; pts.push([ax + ux * t + px * wave, ay + uy * t + py * wave, t / T.L]); }
		for (const [fx, fy, s] of pts) {
			const w = s < 0.45 ? 2 : s < 0.85 ? 1.5 : 1;
			for (let k = 0; k < w; k += 1) {
				const x = Math.round(fx + px * k * 0.9), y = Math.round(fy + py * k * 0.9 + (Math.abs(py) < 0.5 ? k : 0));
				if (!F.inCell(x) || !free(x, y)) continue;
				F.put(x, y, rgb(H, 'hair', s > 0.88 ? 3 : k === 0 ? 0 : 1));
			}
		}
		for (const [fx, fy, s] of pts) { const x = Math.round(fx - px), y = Math.round(fy - py); if (s > 0.1 && s < 0.88 && F.inCell(x) && free(x, y)) F.put(x, y, rgb(H, 'hair', 2)); }
		const r0 = pts[2]; if (r0) { const x = Math.round(r0[0]), y = Math.round(r0[1]); F.put(x, y, rgb(H, 'tie', 0)); F.put(Math.round(x + px), Math.round(y + py), rgb(H, 'tie', 1)); }
	},
	/**
	 * A beard from the pack's own pixels: the skin just under the eye (rows eye+1 … eye+depth, from eye − back to
	 * eye + fwd) recoloured by its source lightness (light → hi, mid → mid, dark → dk). The eye = the `eye` material
	 * pixel nearest the head (the largest hair patch, so the hair pass must run first). Nothing is drawn: the face's
	 * own pixels turn red, so the beard moves with every frame the artist drew.
	 */
	beard(F, B, H, p) {
		if (skipped(F, H, 'gear')) return;
		const EYE = new Set(mat(B, 'eye')), SKIN = new Set(mat(B, 'skin')), head = F.lm.hair || [];
		if (!head.length) return;
		const top = Math.min(...head.map((v) => v[1])), hx = head.filter((v) => v[1] <= top + 2).map((v) => v[0]);
		const cx = (Math.min(...hx) + Math.max(...hx)) / 2;
		F.lm.head = [Math.round(cx), top];
		let eye = null, bd = 1e9;
		for (let y = top; y <= top + 12; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) if (EYE.has(F.kAt(x, y))) { const d = Math.abs(x - cx) + Math.abs(y - top - 5); if (d < bd) { bd = d; eye = [x, y]; } }
		if (!eye || bd > 12) return;
		const c = { hi: hex(p.colors.hi), mid: hex(p.colors.mid), dk: hex(p.colors.dk) }, ALSO = new Set((p.also || []).map(K));
		for (let y = eye[1] + (p.from ?? 1); y <= eye[1] + (p.depth ?? 3); y++) for (let x = eye[0] - (p.back ?? 2); x <= eye[0] + (p.fwd ?? 4); x++) {
			if (!F.inCell(x)) continue;
			if (ALSO.has(F.kAt(x, y))) { F.put(x, y, c.mid); continue; } // a tusk / tooth under the beard
			if (!SKIN.has(F.kAt(x, y))) continue;
			const [r, g, b] = F.srcRgb(x, y), L = r + g + b;
			F.put(x, y, L >= (p.light ?? 540) ? c.hi : L >= (p.mid ?? 470) ? c.mid : c.dk);
		}
		F.lm.eye = eye;
	},
	...KIT
};

/** Is this frame skipped for a group of passes? H.skip[group][sheet] = first frame index from which it is skipped. */
export function skipped(F, H, group) {
	const from = H.skip?.[group]?.[F.anim];
	return from != null && F.f >= from;
}
