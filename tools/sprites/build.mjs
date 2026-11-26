#!/usr/bin/env node
// Build hero sprites:  node tools/sprites/build.mjs [heroId …]   (no ids = every hero in tools/sprites/heroes/)
// Writes tools/sprites/out/<hero>/ (strips, projectiles, manifest.json, contact.png), out/_base/<base>/ (the pack with
// its background cleared — the viewer's "before") and out/viewer.html (every built hero, one page, self-contained).
// Needs ImageMagick (convert / identify / montage).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { ROOT, buildHero, buildBase, loadBase } from './lib/engine.mjs';

const OUT = path.join(ROOT, 'out');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'heroes')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const uri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const heroes = [];
for (const id of ids) {
	const dir = path.join(OUT, id), man = await buildHero(id, dir), B = await loadBase(man.base), bdir = path.join(OUT, '_base', B.id);
	if (!fs.existsSync(bdir)) await buildBase(B.id, bdir);
	// contact sheet: every strip at 4×, on the viewer's dark ground
	const rows = Object.keys(man.sheets).map((s) => path.join(dir, s + '.png'));
	execFileSync('convert', [...rows, '-background', '#1b2521', '-append', '-scale', '400%', '-background', '#1b2521', '-flatten', path.join(dir, 'contact.png')]);
	heroes.push({
		id: man.hero, name: man.name, scale: man.scale, blurb: man.blurb, chips: man.chips, base: B.id, baseName: B.name, cell: man.cell, foot: man.foot, attack: { ...man.attack, name: B.attackName }, guard: man.guard, glow: man.glow,
		sheets: Object.fromEntries(Object.entries(man.sheets).map(([s, v]) => [s, { frames: v.frames, bbox: v.bbox, palm: v.palm }])),
		art: Object.fromEntries(Object.keys(man.sheets).map((s) => [s, uri(path.join(dir, s + '.png'))])),
		orig: Object.fromEntries(Object.entries(man.sheets).map(([s, v]) => [s, uri(path.join(v.gen ? dir : bdir, s + '.png'))])), // posed sheets have no pack original
		proj: Object.fromEntries(Object.keys(man.projectiles).map((p) => [p, uri(path.join(dir, p + '.png'))]))
	});
	console.log(`${id}: ${Object.entries(man.sheets).map(([s, v]) => `${s} ${v.frames}`).join(' · ')}`);
}
const lib = fs.readFileSync(path.join(ROOT, 'lib', 'anims.mjs'), 'utf8').replace(/^export /gm, '');
let page = fs.readFileSync(path.join(ROOT, 'viewer.html'), 'utf8');
page = page.replace('/*ANIMS*/', () => lib).replace('/*HEROES*/', () => JSON.stringify(heroes)).replace('/*VIEWER*/', () => fs.readFileSync(path.join(ROOT, 'viewer.js'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'viewer.html'), page);
console.log(`viewer: ${path.join(OUT, 'viewer.html')} (${Math.round(page.length / 1024)} KB, ${heroes.length} hero${heroes.length === 1 ? '' : 'es'})`);
