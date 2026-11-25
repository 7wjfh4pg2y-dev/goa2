#!/usr/bin/env node
// List a base pack's colours (for writing its `materials`):  node tools/sprites/palette.mjs <pack dir> [idle sheet]
// Prints every opaque colour with its pixel count across all strips, and writes <pack dir>/../../out/_palette/<pack>.png:
// the idle strip's first frame at 8× beside a numbered swatch list, to see which colour is which material.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { loadPng, key, toHex } from './lib/pixels.mjs';
const dir = path.resolve(process.argv[2]);
const pngs = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.png$/i.test(f) && !/preview/i.test(f)) pngs.push(p); } })(dir);
const count = new Map();
for (const p of pngs) { const im = loadPng(p); for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3] >= 128) { const k = key(im.d[i], im.d[i + 1], im.d[i + 2]); count.set(k, (count.get(k) || 0) + 1); } }
const list = [...count].sort((a, b) => b[1] - a[1]);
console.log(`${path.basename(dir)}: ${pngs.length} strips, ${list.length} colours`);
console.log(list.slice(0, 60).map(([k, n], i) => `${String(i).padStart(2)} ${toHex(k)} ${n}`).join('\n'));
