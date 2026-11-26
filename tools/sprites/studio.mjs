#!/usr/bin/env node
// Build the Animation studio's library (the GM page /studio):
//   node tools/sprites/studio.mjs [--reels <folder of preview GIFs>]
// Writes static/anim/library.json + the sheets it names:
//   heroes/<id>/<sheet>.png  — every hero built by the engine (rebuilt here), with the SHARED animation set composed
//   packs/<pack>/<file>.png  — every strip of every base pack (square cells, one clip per file)
//   reels/<id>.png           — preview GIFs (CraftPix's 600 × 370 reels: grey stage over a white banner) cut to the
//                              stage, background cleared, packed into a frame grid. Without --reels the reels already
//                              in library.json are kept (the GIFs themselves are not in the repo).
// Needs ImageMagick (convert / identify).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { ROOT, buildHero, loadBase } from './lib/engine.mjs';
import { loadPng, savePng, blank } from './lib/pixels.mjs';
import { compose, bodyOf } from './lib/anims.mjs';
import { splitReel } from './lib/reelsplit.mjs';

const OUT = path.resolve(ROOT, '..', '..', 'static', 'anim');
const LIB = path.join(OUT, 'library.json');
const args = process.argv.slice(2);
const reelDir = args.includes('--reels') ? args[args.indexOf('--reels') + 1] : null;
const old = fs.existsSync(LIB) ? JSON.parse(fs.readFileSync(LIB, 'utf8')) : { entries: [] };
const rel = (p) => path.relative(OUT, p).split(path.sep).join('/');
const slug = (s) => s.toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pretty = (s) => s.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** Shrink a sheet: ≤ 256 colours + 1-bit alpha is lossless for pixel art; keep the smaller file. */
function squeeze(p) {
	const t = p + '.8.png';
	try {
		execFileSync('convert', [p, '-define', 'png:compression-level=9', 'PNG8:' + t]);
		const a = loadPng(p), b = loadPng(t);
		let same = a.d.length === b.d.length;
		for (let i = 0; same && i < a.d.length; i += 4) same = !a.d[i + 3] === !b.d[i + 3] && (!a.d[i + 3] || (a.d[i] === b.d[i] && a.d[i + 1] === b.d[i + 1] && a.d[i + 2] === b.d[i + 2]));
		if (same && fs.statSync(t).size < fs.statSync(p).size) fs.renameSync(t, p); else fs.rmSync(t);
	} catch { fs.rmSync(t, { force: true }); }
}
/** Lowest opaque row of a strip (the feet) and each frame's box. */
function boxes(img, fw, n) {
	const out = [];
	for (let f = 0; f < n; f++) {
		let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
		for (let y = 0; y < img.h; y++) for (let x = f * fw; x < (f + 1) * fw; x++) if (img.d[(y * img.w + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x - f * fw); x1 = Math.max(x1, x - f * fw); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		out.push(x1 < 0 ? null : [x0, y0, x1, y1]);
	}
	return out;
}
// where the Defend ward stands: in front of the free hand of the pack's guard pose, else the renderer's default
const wardAt = (man, st) => { const p = man.sheets[st.s]?.palm?.[st.f]; return p ? { wx: p[0], wy: p[1] } : {}; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

const entries = [];

// 1 · heroes ----------------------------------------------------------------------------------------------------------
for (const id of fs.readdirSync(path.join(ROOT, 'heroes')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort()) {
	const dir = path.join(OUT, 'heroes', id), man = await buildHero(id, dir), B = await loadBase(man.base);
	fs.rmSync(path.join(dir, 'manifest.json'), { force: true });
	for (const p of Object.keys(man.projectiles)) fs.rmSync(path.join(dir, p + '.png'), { force: true });
	const body = bodyOf(man.sheets.idle.bbox, man.foot);
	const anims = compose(Object.fromEntries(Object.entries(man.sheets).map(([s, v]) => [s, v.frames])), man.attack, body.h, { attack: B.attackName }, man.guard);
	const sheets = {};
	for (const [s, v] of Object.entries(man.sheets)) { squeeze(path.join(dir, s + '.png')); sheets[s] = { src: rel(path.join(dir, s + '.png')), fw: man.cell, fh: man.cell, n: v.frames, cols: v.frames }; }
	const clips = anims.map((a) => ({ id: a.id, name: a.name, fps: a.fps, loop: a.loop, H: a.H || 0, steps: a.steps.map((st) => ({ s: st.s, f: st.f, d: st.d, ...(st.kx ? { kx: st.kx } : {}), ...(st.flash ? { flash: st.flash } : {}), ...(st.air ? { air: 1 } : {}), ...(st.guard ? { guard: true, ...wardAt(man, st) } : {}) })) }));
	// and the raw strips, frame by frame
	for (const [s, v] of Object.entries(man.sheets)) if (!v.gen) clips.push({ id: 'raw-' + s, name: pretty(s), raw: true, fps: 10, loop: true, steps: Array.from({ length: v.frames }, (_, f) => ({ s, f, d: 1 })) });
	entries.push({ id: 'hero-' + id, kind: 'hero', glow: man.glow, name: man.name, sub: `GoA2 hero · base ${B.name}`, blurb: man.blurb, chips: man.chips, base: B.id, ax: body.cx, ay: man.foot, bodyH: body.h, size: man.size, sheets, clips });
	console.log(`hero ${id}: ${clips.length} clips`);
}

// 2 · base packs ------------------------------------------------------------------------------------------------------
const PACKS = {
	'huntress-bow': 'Huntress (bow)', 'huntress-spear': 'Huntress (spear)', 'hero-knight': 'Hero Knight', 'fantasy-warrior': 'Fantasy Warrior',
	'martial-hero': 'Martial Hero', 'martial-hero-3': 'Martial Hero 3', 'medieval-warrior': 'Medieval Warrior',
	'evil-wizard': 'Evil Wizard', 'evil-wizard-2': 'Evil Wizard 2', 'evil-wizard-3': 'Evil Wizard 3'
};
const ORDER = ['idle', 'walk', 'move', 'run', 'attack', 'jump', 'going up', 'fall', 'going down', 'take hit', 'get hit', 'death'];
const rank = (n) => { const l = n.toLowerCase(); const i = ORDER.findIndex((o) => l.startsWith(o)); return i < 0 ? 99 : i; };
for (const pack of fs.readdirSync(path.join(ROOT, 'bases')).sort()) {
	const src = path.join(ROOT, 'bases', pack), files = [];
	const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.png$/i.test(f) && !/preview/i.test(f)) files.push(p); } };
	walk(src);
	const sheets = {}, clips = [];
	let foot = null, ax = null, bodyH = null;
	const char = files.filter((p) => { const [w, h] = execFileSync('identify', ['-format', '%w %h', p]).toString().split(' ').map(Number); return h >= 60 && w % h === 0; });
	char.sort((a, b) => rank(path.basename(a)) - rank(path.basename(b)) || a.localeCompare(b));
	for (const p of char) {
		const img = loadPng(p), fw = img.h, n = img.w / fw, name = path.basename(p, '.png'), id = slug(name);
		const out = path.join(OUT, 'packs', pack, id + '.png');
		fs.mkdirSync(path.dirname(out), { recursive: true });
		for (let i = 0; i < img.d.length; i += 4) if (img.d[i + 3] < 128) img.d[i + 3] = 0, img.d[i] = img.d[i + 1] = img.d[i + 2] = 0;
		savePng(img, out); squeeze(out);
		sheets[id] = { src: rel(out), fw, fh: fw, n, cols: n };
		clips.push({ id, name: pretty(name), fps: 10, loop: !/death/i.test(name), steps: Array.from({ length: n }, (_, f) => ({ s: id, f, d: 1 })) });
		if (foot == null && /idle/i.test(name)) { const b = boxes(img, fw, n).filter(Boolean); foot = Math.max(...b.map((x) => x[3])); ax = median(b.map((x) => (x[0] + x[2]) / 2)); bodyH = median(b.map((x) => foot - x[1] + 1)); }
	}
	if (!clips.length) continue;
	const any = Object.values(sheets)[0];
	entries.push({ id: 'pack-' + pack, kind: 'pack', name: PACKS[pack] || pretty(pack), sub: `Base pack · ${any.fw} px cells · ${clips.length} animations`, ax: ax ?? any.fw / 2, ay: foot ?? any.fh, bodyH: bodyH ?? any.fh / 2, sheets, clips });
	console.log(`pack ${pack}: ${clips.length} clips`);
}

// 3 · preview reels ---------------------------------------------------------------------------------------------------
const REEL_NAMES = {
	'dwarf-2d-pixel-art-sprite-pack': 'Dwarves', 'free-2d-pixel-prototype-character-pack-2-1': 'Prototype heroes 2', 'free-gorgon-pixel-art-character-sprite-sheets': 'Gorgons',
	'free-knight-character-sprites-pixel-art': 'Knights', 'free-minotaur-sprite-sheet-pixel-art-pack2': 'Minotaurs', 'free-necromancer-pixel-art-prototype-character-sprites': 'Necromancer (prototype)',
	'free-ninja-sprite-sheets-pixel-art': 'Ninjas', 'free-pixel-prototype-character-sprites-for-shooter': 'Shooter (prototype)', 'free-samurai-pixel-art-sprite-sheets': 'Samurai',
	'free-soldier-sprite-sheets-pixel-art': 'Soldiers', 'free-werewolf-sprite-sheets-pixel-art': 'Werewolves', 'free-wizard-sprite-sheets-pixel-art': 'Wizards',
	'free-yokai-pixel-art-character-sprites': 'Yokai', 'gladiator-sprite-sheets-pixel-art-set': 'Gladiators', 'orc-character-sprite-sheets-pixel-art': 'Orcs',
	'pet-pixel-art-character-sprite-sheets': 'Pets', 'pixel-art-prototype-character-sprites-8pack': 'Prototype heroes 8', 'pixel-art-prototype-medieval-character-pack-6': 'Medieval prototypes 6',
	'pixel-dark-elf-queen-animated-sprite-pack': 'Dark Elf Queen', 'pixel-prototype-medieval-character-sprites-pack-5': 'Medieval prototypes 5', 'priest-pixel-art-character-sprite-sheets-pack': 'Priests',
	'prototype-archer-pixel-sprite-sheet': 'Archer (prototype)', 'prototype-gunslinger-sprite-sheet-pixel-art-pack': 'Gunslinger (prototype)', 'prototype-pixel-hero-free-sprite-pack-3-1': 'Prototype heroes 3',
	'prototype-saber-fighter-pixel-sprite-sheet': 'Saber fighter (prototype)', 'soldier-character-sprite-sheets-pixel-art-pack': 'Soldiers 2', 'witch-pixel-character-sprite-sheets-pack': 'Witches'
};
if (reelDir) {
	const seen = new Set();
	for (const f of fs.readdirSync(reelDir).filter((x) => /\.gif$/i.test(x)).sort()) {
		const id = slug(f.replace(/\s*\(\d+\)(?=\.gif$)/i, ''));
		if (seen.has(id)) continue; // a second download of the same file
		seen.add(id);
		const p = path.join(reelDir, f);
		const info = execFileSync('identify', ['-format', '%T %W %H\n', p]).toString().trim().split('\n');
		const n = info.length, W = +info[0].split(' ')[1], Hh = +info[0].split(' ')[2], delays = info.map((l) => Math.max(2, +l.split(' ')[0]));
		const raw = execFileSync('convert', [p, '-coalesce', '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 30 }), fsz = W * Hh * 4;
		// the stage ends at the first all-white row (the banner); its background = the top-left pixel
		let stageH = Hh;
		for (let y = 0; y < Hh && stageH === Hh; y++) { let white = true; for (let x = 0; x < W && white; x++) { const i = (y * W + x) * 4; white = raw[i] === 255 && raw[i + 1] === 255 && raw[i + 2] === 255; } if (white && y > 0) stageH = y; }
		const bg = [raw[0], raw[1], raw[2]], isBg = (i) => raw[i] === bg[0] && raw[i + 1] === bg[1] && raw[i + 2] === bg[2];
		let x0 = W, y0 = stageH, x1 = -1, y1 = -1;
		for (let fr = 0; fr < n; fr++) for (let y = 0; y < stageH; y++) for (let x = 0; x < W; x++) if (!isBg(fr * fsz + (y * W + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(stageH - 1, y1 + 2);
		const fw = x1 - x0 + 1, fh = y1 - y0 + 1, cols = Math.max(1, Math.min(n, Math.floor(4096 / fw))), rows = Math.ceil(n / cols);
		const sheet = blank(cols * fw, rows * fh);
		for (let fr = 0; fr < n; fr++) {
			const ox = (fr % cols) * fw, oy = Math.floor(fr / cols) * fh;
			for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
				const i = fr * fsz + ((y0 + y) * W + x0 + x) * 4;
				if (isBg(i)) continue;
				sheet.d.set([raw[i], raw[i + 1], raw[i + 2], 255], ((oy + y) * sheet.w + ox + x) * 4);
			}
		}
		const out = path.join(OUT, 'reels', id + '.png');
		fs.mkdirSync(path.dirname(out), { recursive: true });
		savePng(sheet, out); squeeze(out);
		// the reel's pixel size: 2 when every 2 × 2 block (at some offset) is one colour
		let px = 1;
		for (let oy = 0; oy < 2 && px === 1; oy++) for (let ox = 0; ox < 2 && px === 1; ox++) {
			let bad = 0, tot = 0;
			for (let y = oy; y + 1 < fh; y += 2) for (let x = ox; x + 1 < fw; x += 2) {
				const a = (y * sheet.w + x) * 4, rest = [a + 4, a + sheet.w * 4, a + sheet.w * 4 + 4];
				for (const b of rest) { tot++; if (sheet.d[a] !== sheet.d[b] || sheet.d[a + 1] !== sheet.d[b + 1] || sheet.d[a + 2] !== sheet.d[b + 2] || sheet.d[a + 3] !== sheet.d[b + 3]) bad++; }
			}
			if (bad / tot < 0.0005) px = 2;
		}
		const name = REEL_NAMES[id] || pretty(id);
		// one clip: the whole reel at its own frame timing (fps 100 → d = the GIF delay in 1/100 s)
		entries.push({
			id: 'reel-' + id, kind: 'reel', name, sub: `Preview reel · ${n} frames`, credit: 'CraftPix.net', px,
			ax: fw / 2, ay: fh - 2, bodyH: fh * 0.6,
			sheets: { reel: { src: rel(out), fw, fh, n, cols } },
			clips: [{ id: 'reel', name: 'Whole reel', fps: 100, loop: true, steps: delays.map((d, f) => ({ s: 'reel', f, d })) }]
		});
		console.log(`reel ${id}: ${n} frames ${fw}×${fh} px${px} ${Math.round(fs.statSync(out).size / 1024)} KB`);
	}
} else entries.push(...old.entries.filter((e) => e.kind === 'reel'));

// 4 · the reels cut into characters and their actions (tools/sprites/reels.json) ------------------------------------
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'reels.json'), 'utf8'));
fs.rmSync(path.join(OUT, 'chars'), { recursive: true, force: true });
for (const r of entries.filter((e) => e.kind === 'reel')) {
	const key = r.id.replace(/^reel-/, ''), spec = SPEC[key];
	if (!spec) { console.log(`no cuts for ${key}`); continue; }
	const sh = r.sheets.reel, img = loadPng(path.join(OUT, sh.src)), delays = r.clips[0].steps.map((s) => s.d);
	const used = new Set();
	for (const c of splitReel(img, sh, delays, spec)) {
		let slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		while (used.has(slug)) slug += '-x';
		used.add(slug);
		const out = path.join(OUT, 'chars', key, slug + '.png');
		fs.mkdirSync(path.dirname(out), { recursive: true });
		savePng(c.img, out); squeeze(out);
		entries.push({
			id: `char-${key}-${slug}`, kind: c.group === 'general' ? 'general' : 'unique', name: c.name, sub: `${c.clips.length} actions · from ${r.name}`, credit: r.credit, px: r.px,
			ax: c.ax, ay: c.ay, bodyH: c.bodyH,
			sheets: { f: { src: rel(out), fw: c.fw, fh: c.fh, n: c.n, cols: c.cols } },
			clips: c.clips
		});
	}
	console.log(`cut ${key}: ${spec.chars.length} characters`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(LIB, JSON.stringify({ v: 1, entries }));
console.log(`library: ${entries.length} entries → ${LIB}`);
