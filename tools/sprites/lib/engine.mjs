// The sprite engine: base pack + hero spec → the hero's strips (native size, same cells as the base), its
// projectiles and a manifest. Every frame runs the hero's passes (parts.mjs) in order.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPng, savePng, blank, frameOf, K, key, hex } from './pixels.mjs';
import { PASSES } from './parts.mjs';
import { buildPoses } from './pose.mjs';
import { bodyOf } from './anims.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadBase(id) { return (await import(path.join(ROOT, 'bases', id, 'base.mjs'))).default; }
export async function loadHero(id) { return (await import(path.join(ROOT, 'heroes', id + '.mjs'))).default; }

/** Clear the pack's background colours (and half-transparent pixels) in place. */
export function clearBg(img, B) {
	const bg = new Set((B.bg || []).map(K)), d = img.d;
	for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 128 || bg.has(key(d[i], d[i + 1], d[i + 2]))) d[i + 3] = 0;
	return img;
}

/** One strip: run every pass on every frame. Returns {img, frames, bbox}. */
export function buildStrip(src, B, H, sheet) {
	const cw = B.cell, n = Math.round(src.w / cw), out = blank(src.w, src.h), strip = {}, bbox = [], lm = [];
	for (let f = 0; f < n; f++) {
		const F = frameOf(src, out, f * cw, cw, f, n, sheet);
		F.strip = strip;
		for (const [name, p] of H.passes) {
			if (!PASSES[name]) throw new Error(`unknown pass ${name} in ${H.id}`);
			PASSES[name](F, B, H, p);
		}
		let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
		for (let y = 0; y < src.h; y++) for (let x = f * cw; x < f * cw + cw; x++) if (out.d[(y * src.w + x) * 4 + 3]) { x0 = Math.min(x0, x - f * cw); x1 = Math.max(x1, x - f * cw); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		bbox.push([x0, y0, x1, y1]);
		lm.push({ eye: F.lm.eye && [F.lm.eye[0] - f * cw, F.lm.eye[1]], tie: F.lm.tie && [F.lm.tie[0] - f * cw, F.lm.tie[1]], shoulder: F.lm.shoulder && [F.lm.shoulder.left - f * cw, F.lm.shoulder.top] });
	}
	return { img: out, frames: n, bbox, lm };
}

/** Recolour a projectile sprite: listed source colours → their new colour, anything else → `other`. */
export function buildProjectile(img, H) {
	const map = new Map(Object.entries(H.projectile?.map || {}).map(([a, b]) => [K(a), hex(b)]));
	const other = H.projectile?.other ? hex(H.projectile.other) : null;
	for (let i = 0; i < img.d.length; i += 4) {
		if (!img.d[i + 3]) continue;
		const c = map.get(key(img.d[i], img.d[i + 1], img.d[i + 2])) ?? other;
		if (c) img.d.set(c, i);
	}
	return img;
}

/** Build a hero into `outDir`: <sheet>.png per base sheet, <projectile>.png, manifest.json. Returns the manifest. */
export async function buildHero(heroId, outDir) {
	const H = await loadHero(heroId), B = await loadBase(H.base);
	fs.mkdirSync(outDir, { recursive: true });
	const man = { hero: H.id, name: H.name, base: B.id, cell: B.cell, foot: B.foot, attack: B.attack, sheets: {}, projectiles: {}, chips: H.chips, blurb: H.blurb, glow: H.projectile?.glow, size: H.size || 1 };
	const outs = {}, srcs = {};
	for (const [sheet, file] of Object.entries(B.sheets)) {
		const src = clearBg(loadPng(path.join(ROOT, 'bases', B.id, file)), B);
		const r = buildStrip(src, B, H, sheet);
		savePng(r.img, path.join(outDir, sheet + '.png'));
		man.sheets[sheet] = { frames: r.frames, bbox: r.bbox, lm: r.lm };
		outs[sheet] = r.img; srcs[sheet] = src;
	}
	// the pose stage (lib/pose.mjs): new Hit / Death / Defend frames for packs with a rig
	const charH = bodyOf(man.sheets.idle.bbox, B.foot).h;
	for (const [name, g] of Object.entries(buildPoses(B, H, outs, srcs, charH))) {
		savePng(g.img, path.join(outDir, name + '.png'));
		man.sheets[name] = { frames: g.frames, bbox: [], palm: g.palm, gen: true };
	}
	for (const [id, file] of Object.entries(B.projectiles || {})) {
		const img = buildProjectile(clearBg(loadPng(path.join(ROOT, 'bases', B.id, file)), B), H);
		savePng(img, path.join(outDir, id + '.png'));
		man.projectiles[id] = { w: img.w, h: img.h };
	}
	fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(man));
	return man;
}

/** The base pack's own strips with the background cleared (the 'before' of the viewer's before / after). */
export async function buildBase(baseId, outDir) {
	const B = await loadBase(baseId);
	fs.mkdirSync(outDir, { recursive: true });
	for (const [sheet, file] of Object.entries(B.sheets)) savePng(clearBg(loadPng(path.join(ROOT, 'bases', B.id, file)), B), path.join(outDir, sheet + '.png'));
}
