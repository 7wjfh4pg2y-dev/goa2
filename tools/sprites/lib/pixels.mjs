// Pixel plumbing for the sprite engine: colours as 24-bit keys, RGBA images, PNG in / out through ImageMagick
// (the sandbox has no working PIL / canvas; `convert … rgba:-` is everywhere), and 8-connected patches.
import { execFileSync } from 'child_process';

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const key = (r, g, b) => (r << 16) | (g << 8) | b;
export const K = (h) => key(...hex(h));
export const toHex = (k) => '#' + k.toString(16).padStart(6, '0');

/** Read a PNG as {w, h, d: RGBA bytes}. */
export function loadPng(path) {
	const [w, h] = execFileSync('identify', ['-format', '%w %h', path]).toString().split(' ').map(Number);
	const raw = execFileSync('convert', [path, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 28 });
	return { w, h, d: new Uint8Array(raw) };
}
export function savePng(img, path) {
	execFileSync('convert', ['-size', `${img.w}x${img.h}`, '-depth', '8', 'rgba:-', path], { input: Buffer.from(img.d) });
}
export const blank = (w, h) => ({ w, h, d: new Uint8Array(w * h * 4) });

/**
 * One frame of a strip, as the passes see it: the SOURCE (read-only, background already cleared) and the OUTPUT
 * being painted, both in sheet coordinates; the frame spans x0 … x0 + cw − 1. `kAt` deliberately has no per-cell
 * bounds (it reads the neighbouring cell / row like the original Silverarrow script did — kept for parity).
 */
export function frameOf(src, out, x0, cw, f, n, anim) {
	const at = (x, y) => (y * src.w + x) * 4;
	const sd = src.d, od = out.d;
	return {
		src, out, x0, cw, ch: src.h, f, n, anim, lm: {}, masks: {}, strip: {}, w: src.w,
		at,
		kAt(x, y) { const i = at(x, y); return sd[i + 3] ? key(sd[i], sd[i + 1], sd[i + 2]) : -1; },
		srcRgb(x, y) { const i = at(x, y); return [sd[i], sd[i + 1], sd[i + 2]]; },
		put(x, y, c) { if (x < 0 || y < 0 || x >= src.w || y >= src.h) return; const i = at(x, y); od[i] = c[0]; od[i + 1] = c[1]; od[i + 2] = c[2]; od[i + 3] = 255; },
		isSet(x, y) { return x >= 0 && y >= 0 && x < src.w && y < src.h && od[at(x, y) + 3]; },
		inCell(x) { return x >= x0 && x < x0 + cw; },
		q(x, y) { return y * src.w + x; }
	};
}

/** 8-connected patches of pixels matching `test(key)` inside the frame, in scan order. `touch(key)` marks a patch that borders such a pixel. */
export function patches(F, test, touch) {
	const seen = new Set(), out = [];
	for (let y = 0; y < F.ch; y++) for (let x = F.x0; x < F.x0 + F.cw; x++) {
		if (seen.has(F.q(x, y)) || !test(F.kAt(x, y))) continue;
		const px = [], st = [[x, y]]; seen.add(F.q(x, y)); let touches = false;
		while (st.length) {
			const [cx, cy] = st.pop(); px.push([cx, cy]);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < F.x0 || nx >= F.x0 + F.cw || ny < 0 || ny >= F.ch) continue;
				if (touch && touch(F.kAt(nx, ny))) touches = true;
				const q = F.q(nx, ny);
				if (!seen.has(q) && test(F.kAt(nx, ny))) { seen.add(q); st.push([nx, ny]); }
			}
		}
		out.push({ px, touches });
	}
	return out;
}
