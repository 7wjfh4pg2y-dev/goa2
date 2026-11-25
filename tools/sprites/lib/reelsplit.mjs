// Cut a preview reel (a frame grid made by studio.mjs) into per-character action clips, following tools/sprites/reels.json:
//   "<reel id>": { group: 'unique' | 'general', chars: [...], acts?: [[name, first, last], …] }
// A char is a name (it takes the shared `acts` and the lane of its index) or an object:
//   { name, acts?, same?: k (reuse char k's acts), off?: n (shift them n frames), lane?: i, at?: frame, x?: 'all' | [x0, x1], group? }
// Lanes = the characters standing side by side at frame `at` (column runs ≥ 10 px apart), split half way between them.
// Every clip keeps the GIF's timing; a loop that the reel played twice is kept once, held frames become longer steps,
// and a character's frames are stored once in its own sheet (one box for all its clips, so they share an anchor).
import crypto from 'crypto';
import { blank } from './pixels.mjs';

export function splitReel(img, sheet, delays, spec) {
	const { fw, fh, cols } = sheet;
	const px = (f, x, y) => (((Math.floor(f / cols)) * fh + y) * img.w + (f % cols) * fw + x) * 4;
	const A = (f, x, y) => img.d[px(f, x, y) + 3];
	function lanesAt(f) {
		const runs = []; let s = -1, g = 0;
		for (let x = 0; x <= fw; x++) {
			let o = 0; if (x < fw) for (let y = 0; y < fh && !o; y++) o = A(f, x, y);
			if (o) { if (s < 0) s = x; g = 0; } else if (s >= 0) { g++; if (g >= 10 || x === fw) { runs.push([s, x - g]); s = -1; g = 0; } }
		}
		const cuts = runs.slice(0, -1).map((a, k) => Math.round((a[1] + runs[k + 1][0]) / 2));
		return [0, ...cuts].map((x, k) => [x, k < cuts.length ? cuts[k] : fw]);
	}
	// resolve chars
	const chars = spec.chars.map((c, i) => (typeof c === 'string' ? { name: c, lane: i, acts: spec.acts } : { lane: 0, ...c }));
	for (const c of chars) if (c.same != null) { const b = chars[c.same]; c.acts = b.acts.map(([n, a, z]) => [n, a + (c.off || 0), z + (c.off || 0)]); if (c.lane == null) c.lane = b.lane; }
	const out = [];
	for (const c of chars) {
		const at = c.at ?? c.acts[0][1];
		const [lx0, lx1] = c.x === 'all' ? [0, fw] : Array.isArray(c.x) ? c.x : (lanesAt(at)[c.lane] ?? [0, fw]);
		const frames = [...new Set(c.acts.flatMap(([, a, z]) => Array.from({ length: z - a + 1 }, (_, k) => a + k)))];
		let x0 = lx1, y0 = fh, x1 = lx0 - 1, y1 = -1;
		for (const f of frames) for (let y = 0; y < fh; y++) for (let x = lx0; x < lx1; x++) if (A(f, x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		if (x1 < x0) continue;
		x0 = Math.max(lx0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(lx1 - 1, x1 + 1); y1 = Math.min(fh - 1, y1 + 1);
		const w = x1 - x0 + 1, h = y1 - y0 + 1;
		// unique frames
		const crop = (f) => { const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) { const i = px(f, x0, y0 + y); b.set(img.d.subarray(i, i + w * 4), y * w * 4); } return b; };
		const ids = new Map(), bufs = [], fid = new Map();
		for (const f of frames) { const b = crop(f), k = crypto.createHash('md5').update(b).digest('hex'); if (!ids.has(k)) { ids.set(k, bufs.length); bufs.push(b); } fid.set(f, ids.get(k)); }
		const clips = [];
		for (const [name, a, z] of c.acts) {
			let seq = Array.from({ length: z - a + 1 }, (_, k) => ({ f: fid.get(a + k), d: Math.max(1, delays[a + k] || 10) }));
			// a loop played twice (or more) → once
			for (let p = 1; p <= seq.length / 2; p++) if (seq.length % p === 0 && seq.every((s, i) => s.f === seq[i % p].f)) { seq = seq.slice(0, p); break; }
			// held frames → one longer step
			const steps = [];
			for (const s of seq) { const l = steps[steps.length - 1]; if (l && l.f === s.f) l.d += s.d; else steps.push({ s: 'f', f: s.f, d: s.d }); }
			const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			clips.push({ id, name, fps: 100, loop: !/death|defeat/i.test(name), steps, src: [a, z] });
		}
		// anchor: the first clip's first frame — feet = its lowest pixel, centre = its middle
		const first = bufs[clips[0].steps[0].f];
		let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (first[(y * w + x) * 4 + 3]) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
		const n = bufs.length, gc = Math.max(1, Math.min(n, Math.floor(2048 / w))), rows = Math.ceil(n / gc), sh = blank(gc * w, rows * h);
		bufs.forEach((b, k) => { const ox = (k % gc) * w, oy = Math.floor(k / gc) * h; for (let y = 0; y < h; y++) sh.d.set(b.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * sh.w + ox) * 4); });
		out.push({ name: c.name, group: c.group || spec.group, img: sh, fw: w, fh: h, n, cols: gc, clips, ax: bx1 < 0 ? w / 2 : (bx0 + bx1 + 1) / 2, ay: by1 < 0 ? h : by1 + 1, bodyH: by1 < 0 ? h / 2 : by1 - by0 + 1 });
	}
	return out;
}
