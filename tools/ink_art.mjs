// Bakes the INK & WASH art for the Ink & wash retheme (board/rethemes.ts): every hero portrait (square, framed by
// heroes.ts HERO_FACE like portraitRect), Razzle's double faces and every kit token / marker / rune, each with half
// its colour faded towards the paper, softened, and ink lines traced over its strong edges.
// Writes src/lib/images/ink/{heroes,doubles,tokens}/*.webp. Run from the repo root: node tools/ink_art.mjs
// (needs playwright-core's Chromium; set CHROMIUM=/path/to/chrome if it isn't at /opt/pw-browsers/chromium).
import fs from 'node:fs';
import path from 'node:path';
const L = 'src/lib';
const OUT = `${L}/images/ink`;
const { chromium } = await import(path.resolve('node_modules/playwright-core/index.mjs'));
const hsrc = fs.readFileSync(`${L}/heroes.ts`, 'utf8');
const FACE = {};
for (const m of hsrc.slice(hsrc.indexOf('const HERO_FACE')).matchAll(/(\w+): \[([\d.]+), ([\d.]+), ([\d.]+)\]/g)) if (!FACE[m[1]]) FACE[m[1]] = [+m[2], +m[3], +m[4]];
const ids = fs.readdirSync(`${L}/images/avatars`).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
const doubles = fs.readdirSync(`${L}/images/doubles`).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
const ART = fs.readdirSync(`${L}/cards/images`).filter((f) => /^(token_|marker_)|^rune_.*_marker/.test(f) && f.endsWith('.png')).map((f) => f.slice(0, -4));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
await pg.setContent('<canvas></canvas>');
const bake = (src, crop, out) => pg.evaluate(async ({ src, crop, out }) => {
	const img = new Image(); img.src = src; await img.decode();
	const W = crop ? out : out, H = crop ? out : Math.round(out * img.naturalHeight / img.naturalWidth); // keep the art's own shape (tokens are flat-topped hexes, wider than tall)
	const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
	g.imageSmoothingQuality = 'high';
	if (crop) { const [fx, fy, z] = crop, D = out, w = 2 * D * z, h = D * z; const x = Math.min(0, Math.max(D - w, D / 2 - fx * w)), y = Math.min(0, Math.max(D - h, D / 2 - fy * h)); g.drawImage(img, x, y, w, h); }
	else g.drawImage(img, 0, 0, W, H);
	const d = g.getImageData(0, 0, W, H), p = d.data, N = W * H;
	// INK & WASH: the colour faded towards the paper and softened, with ink lines traced over its edges
	const pale = new Float32Array(N * 3), L = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		const r = p[i * 4] / 255, gg = p[i * 4 + 1] / 255, b = p[i * 4 + 2] / 255;
		const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
		const c = [r, gg, b].map((v) => Math.pow(l + (v - l) * 0.5, 0.6)); // half the colour, the dark paintings lifted
		pale[i * 3] = c[0] * 0.78 + 0.2; pale[i * 3 + 1] = c[1] * 0.78 + 0.17; pale[i * 3 + 2] = c[2] * 0.74 + 0.12;
		L[i] = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	}
	const box = (src, ch) => { const out = new Float32Array(src.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < ch; k++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; s += src[(yy * W + xx) * ch + k]; n++; } out[(y * W + x) * ch + k] = s / n; } return out; };
	const soft = box(pale, 3), Lb = box(box(box(L, 1), 1), 1); // smooth well first, so only real edges get a line
	const INK = [59, 38, 20];
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const i = y * W + x;
		let lap = 0;
		if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { lap = 8 * Lb[i]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) lap -= Lb[i + dy * W + dx]; }
		const a = Math.min(1, Math.max(0, 22 * Math.max(0, -lap) - 0.3)) * 0.8; // ink on the dark side of strong edges only
		for (let k = 0; k < 3; k++) p[i * 4 + k] = Math.min(255, soft[i * 3 + k] * 255) * (1 - a) + INK[k] * a;
	}
	g.putImageData(d, 0, 0);
	return c.toDataURL('image/webp', 0.86);
}, { src, crop, out });
const save = (dir, name, url) => { fs.mkdirSync(`${OUT}/${dir}`, { recursive: true }); fs.writeFileSync(`${OUT}/${dir}/${name}.webp`, Buffer.from(url.split(',')[1], 'base64')); };
const b64 = (f) => fs.readFileSync(f).toString('base64');
for (const id of ids) save('heroes', id, await bake(`data:image/webp;base64,${b64(`${L}/images/avatars/${id}.webp`)}`, FACE[id] ?? [0.5, 0.3, 3], 240));
for (const id of doubles) save('doubles', id, await bake(`data:image/webp;base64,${b64(`${L}/images/doubles/${id}.webp`)}`, null, 240));
for (const a of ART) save('tokens', a, await bake(`data:image/png;base64,${b64(`${L}/cards/images/${a}.png`)}`, null, 260));
console.log(`${ids.length} heroes, ${doubles.length} doubles, ${ART.length} tokens → ${OUT}`);
await b.close();
