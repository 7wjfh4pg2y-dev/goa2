#!/usr/bin/env node
// Turn a library CHARACTER (a CraftPix reel cut by reelsplit, static/anim/chars/…) into a base pack the engine can
// build heroes on:   node tools/sprites/charbase.mjs <library char id> <pack id> [cell]
// The reels were exported at 2× — every art pixel is a 2 × 2 block — so each frame is brought back to its NATIVE
// pixels (the block phase found per frame), the actions become strips (<Action>.png, square cells, feet on one line,
// in the library's frame order) under bases/<pack>/. Writes bases/<pack>/frames.json (action → frame count + foot);
// base.mjs is written by hand afterwards, as for any pack.
//
// Also cuts PARTS (kitbash): node tools/sprites/charbase.mjs --part <library char id> <frame> <out name> <x0,y0,x1,y1> [colours…]
// = the native frame's pixels inside the box (the listed colours only, plus outline pixels touching them) → parts/<name>.png.
import fs from 'fs';
import path from 'path';
import { ROOT } from './lib/engine.mjs';
import { loadPng, savePng, blank, key, K } from './lib/pixels.mjs';

const ANIM = path.resolve(ROOT, '..', '..', 'static', 'anim');
const lib = JSON.parse(fs.readFileSync(path.join(ANIM, 'library.json'), 'utf8'));

/** A library character's frame at native size: {w, h, d}, the 2 × 2 block phase picked per frame. */
export function nativeFrames(id) {
	const e = lib.entries.find((x) => x.id === id);
	if (!e) throw new Error('no library entry ' + id);
	const sh = e.sheets.f, img = loadPng(path.join(ANIM, sh.src)), out = [];
	for (let f = 0; f < sh.n; f++) {
		const x0 = (f % sh.cols) * sh.fw, y0 = Math.floor(f / sh.cols) * sh.fh;
		const px = (x, y) => { const i = ((y0 + y) * img.w + x0 + x) * 4; return img.d[i + 3] < 128 ? -1 : key(img.d[i], img.d[i + 1], img.d[i + 2]); };
		let best = null;
		for (const ox of [0, 1]) for (const oy of [0, 1]) {
			let bad = 0;
			for (let y = oy; y < sh.fh - 1; y += 2) for (let x = ox; x < sh.fw - 1; x += 2) { const a = px(x, y); if (a !== px(x + 1, y) || a !== px(x, y + 1) || a !== px(x + 1, y + 1)) bad++; }
			if (!best || bad < best.bad) best = { bad, ox, oy };
		}
		const w = sh.fw >> 1, h = sh.fh >> 1, n = blank(w, h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const sx = best.ox + 2 * x, sy = best.oy + 2 * y;
			if (sx >= sh.fw || sy >= sh.fh) continue;
			const i = ((y0 + sy) * img.w + x0 + sx) * 4, o = (y * w + x) * 4;
			if (img.d[i + 3] >= 128) { n.d[o] = img.d[i]; n.d[o + 1] = img.d[i + 1]; n.d[o + 2] = img.d[i + 2]; n.d[o + 3] = 255; }
		}
		out.push(n);
	}
	return { e, frames: out };
}

function strips(id, pack, cellArg) {
	const { e, frames } = nativeFrames(id), dir = path.join(ROOT, 'bases', pack);
	fs.mkdirSync(dir, { recursive: true });
	const fw = frames[0].w, fh = frames[0].h, cell = +cellArg || Math.max(fw, fh) + 2, dx = (cell - fw) >> 1, dy = cell - fh;
	const info = { from: id, cell, foot: Math.round(e.ay / 2) + dy, actions: {} };
	for (const c of e.clips) {
		const fs_ = [...new Set(c.steps.map((s) => s.f))];
		const img = blank(cell * fs_.length, cell);
		fs_.forEach((f, k) => { const F = frames[f]; for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const i = (y * fw + x) * 4; if (F.d[i + 3]) img.d.set(F.d.subarray(i, i + 4), ((y + dy) * img.w + k * cell + x + dx) * 4); } });
		savePng(img, path.join(dir, c.name + '.png'));
		info.actions[c.name] = fs_.length;
	}
	fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(info, null, '\t') + '\n');
	console.log(`${pack}: cell ${cell}, foot ${info.foot},`, info.actions);
}

function part(id, frame, name, box, cols) {
	// box = x0,y0,x1,y1 or e:cx,cy,rx,ry (an ellipse, e.g. a round shield in front of the body)
	const { frames } = nativeFrames(id), F = frames[+frame], ell = box.startsWith('e:'), v = box.replace('e:', '').split(',').map(Number);
	const [x0, y0, x1, y1] = ell ? [Math.floor(v[0] - v[2]), Math.floor(v[1] - v[3]), Math.ceil(v[0] + v[2]), Math.ceil(v[1] + v[3])] : v;
	const inside = (x, y) => !ell || ((x - v[0]) / v[2]) ** 2 + ((y - v[1]) / v[3]) ** 2 <= 1;
	const keep = new Set(cols.map(K)), at = (x, y) => (y * F.w + x) * 4;
	const kAt = (x, y) => { if (x < x0 || y < y0 || x > x1 || y > y1 || !inside(x, y)) return -1; const i = at(x, y); return F.d[i + 3] ? key(F.d[i], F.d[i + 1], F.d[i + 2]) : -1; };
	const out = blank(x1 - x0 + 1, y1 - y0 + 1);
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
		const k = kAt(x, y); if (k < 0) continue;
		let ok = !cols.length || keep.has(k);
		if (!ok) for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) if ((dx || dy) && keep.has(kAt(x + dx, y + dy)) && (k & 0xf0f0f0) === 0) ok = true; // dark outline round a kept colour
		if (ok) out.d.set(F.d.subarray(at(x, y), at(x, y) + 4), ((y - y0) * out.w + x - x0) * 4);
	}
	const dir = path.join(ROOT, 'parts');
	fs.mkdirSync(dir, { recursive: true });
	savePng(out, path.join(dir, name + '.png'));
	console.log(`part ${name}: ${out.w}×${out.h}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const a = process.argv.slice(2);
	if (a[0] === '--part') part(a[1], a[2], a[3], a[4], a.slice(5));
	else if (a[0] === '--png') { const { frames } = nativeFrames(a[1]); savePng(frames[+a[2]], a[3]); }
	else strips(a[0], a[1], a[2]);
}
