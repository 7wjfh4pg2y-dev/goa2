// The hero sprite engine (tools/sprites): the shared animation rules and the parts library, on synthetic frames
// (no PNG I/O here — the deploy build has no ImageMagick).
import { describe, it, expect } from 'vitest';
// the engine is plain untyped ESM outside src/ — load it by a computed path so svelte-check doesn't type-check it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = (name: string): Promise<any> => import(/* @vite-ignore */ new URL(`../../tools/sprites/lib/${name}.mjs`, import.meta.url).href);
const { compose, liftAt, bodyOf, FPS } = await tool('anims');
const { frameOf, blank, hex } = await tool('pixels');
const { PASSES, skipped } = await tool('parts');

const tag = (a: { steps: { s: string; f: number; d: number; kx?: number; flash?: boolean | number }[] }) =>
	a.steps.map((s) => `${s.s[0]}${s.f}x${s.d}${s.kx ? 'k' + s.kx : ''}${s.flash ? '!' + s.flash : ''}`).join(' ');

describe('shared animations', () => {
	const huntress = { idle: 10, run: 8, attack: 6, jump: 2, fall: 2, hit: 3, death: 10 };
	const A = compose(huntress, { holds: [0, 0, 0, 2, 0, 3], release: 4 }, 35);
	const by = (id: string) => A.find((a: { id: string }) => a.id === id);

	it('reproduces the timings approved on Silverarrow', () => {
		expect(A.map((a: { id: string }) => a.id)).toEqual(['idle', 'run', 'attack', 'defend', 'hit', 'defeat', 'jump']);
		expect(tag(by('defend'))).toBe('i0x2 h0x2k-1 h0x4k-2 h0x2k-1 i6x1 i7x1 i8x1 i9x3');
		expect(tag(by('attack'))).toBe('a0x1 a1x1 a2x1 a3x3 a4x1 a5x4');
		expect(by('attack').loose).toBe(4);
		expect(tag(by('jump'))).toBe('i0x2 j0x2 j1x3 f0x3 f1x2 i1x3');
		expect(by('jump').H).toBe(24);
		expect(tag(by('hit'))).toBe('i0x2 i1x1 h0x2k-3!true h1x2k-2 h2x2k-1 i4x1 i5x1 i6x1 i7x1 i8x1 i9x3');
		expect(tag(by('defeat'))).toBe('i0x2 i1x1 h0x3k-5!1.7 h1x2k-4 h2x1k-3 d0x1k-2 d1x1k-1 d2x1 d3x1 d4x1 d5x1 d6x1 d7x1 d8x1 d9x7');
		expect(by('defeat').loop).toBe(false);
		expect(FPS).toEqual({ idle: 8, run: 12, attack: 9, defend: 10, jump: 9, hit: 10, defeat: 9 });
	});

	it('composes any pack (other frame counts) by the same rules', () => {
		const B = compose({ idle: 8, run: 8, attack: 4, jump: 3, fall: 3, hit: 4, death: 7 }, { holds: [], release: 2 }, 50);
		const hit = B.find((a: { id: string }) => a.id === 'hit');
		expect(tag(hit)).toBe('i0x2 i1x1 h0x2k-3!true h1x2k-2 h2x2k-1 h3x2 i3x1 i4x1 i5x1 i6x1 i7x3');
		const jump = B.find((a: { id: string }) => a.id === 'jump');
		expect(tag(jump)).toBe('i0x2 j0x2 j1x3 j2x3 f0x3 f1x3 f2x2 i1x3');
		expect(jump.H).toBe(35);
		const d = B.find((a: { id: string }) => a.id === 'defeat');
		expect(d.steps.at(-1)).toMatchObject({ s: 'death', f: 6, d: 7 });
	});

	it('jumps on one parabola: on the ground before and after, highest mid-air', () => {
		const j = by('jump');
		expect(liftAt(j, 0, 0, 9)).toBe(0);
		expect(liftAt(j, 5, 0, 9)).toBe(0);
		const peak = Math.max(...[1, 2, 3, 4].flatMap((i) => [0, 0.1, 0.2, 0.3].map((t) => liftAt(j, i, t, 9))));
		expect(peak).toBeGreaterThan(23.5);
		expect(peak).toBeLessThanOrEqual(24);
	});

	it('measures the body from the idle boxes', () => {
		expect(bodyOf([[35, 31, 66, 66], [35, 33, 66, 66], [35, 32, 66, 66]], 66)).toEqual({ h: 35, cx: 50.5 });
	});
});

describe('parts', () => {
	// a 20 × 20 one-frame strip
	const B = { materials: { hair: ['#ffffff', '#cccccc'], shaft: ['#202020'], skin: ['#f0c0a0'], tie: ['#00ff00'], eye: ['#000000'] } };
	const H = { palette: { hair: ['#ff8800', '#cc4400', '#882200', '#551100'], glint: ['#eeffee', '#bbddbb'], tie: ['#00aaaa', '#006666'] } };
	function strip(px: [number, number, string][]) {
		const src = blank(20, 20);
		for (const [x, y, c] of px) src.d.set([...hex(c), 255], (y * 20 + x) * 4);
		const out = blank(20, 20);
		return { src, out, F: frameOf(src, out, 0, 20, 0, 1, 'idle') };
	}
	const col = (out: { d: Uint8Array }, x: number, y: number) => '#' + [...out.d.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3)].map((v) => v.toString(16).padStart(2, '0')).join('');

	it('hair: a small hair-coloured patch touching an arrow shaft is fletching, not hair', () => {
		const head: [number, number, string][] = [];
		for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) head.push([x, y, '#ffffff']);
		const { F, out } = strip([...head, [12, 10, '#ffffff'], [13, 10, '#202020']]);
		PASSES.hair(F, B, H, {});
		PASSES.recolor(F, B, H);
		expect(F.masks.hair.size).toBe(16);
		expect(col(out, 3, 3)).toBe('#ff8800');
		expect(col(out, 12, 10)).toBe('#eeffee'); // glint, not hair
		expect(col(out, 13, 10)).toBe('#202020'); // unlisted material keeps its colour
	});

	it('ponytail: drawn only behind the sprite, tied off in the tie colour', () => {
		const px: [number, number, string][] = [];
		for (let y = 4; y < 8; y++) for (let x = 10; x < 14; x++) px.push([x, y, '#ffffff']);
		px.push([9, 6, '#00ff00']); // the hair tie
		const { F, out } = strip(px);
		PASSES.hair(F, B, H, {});
		PASSES.recolor(F, B, H);
		PASSES.landmarks(F, B, H, {});
		expect(F.lm.tie).toEqual([8, 6]);
		const before = col(out, 11, 5);
		PASSES.ponytail(F, B, H, { byAnim: { idle: { L: 8, dx: -0.4, dy: 1, amp: 0.5 } } });
		expect(col(out, 11, 5)).toBe(before); // never over the sprite
		let tail = 0;
		for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (out.d[(y * 20 + x) * 4 + 3]) tail++;
		expect(tail).toBeGreaterThan(6);
	});

	it('skips a pass group from the given frame on', () => {
		const F = { anim: 'death', f: 6 };
		expect(skipped(F, { skip: { gear: { death: 6 } } }, 'gear')).toBe(true);
		expect(skipped({ ...F, f: 5 }, { skip: { gear: { death: 6 } } }, 'gear')).toBe(false);
		expect(skipped(F, {}, 'gear')).toBe(false);
	});
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import(/* @vite-ignore */ 'node:' + 'fs');
describe('animation studio library (static/anim, written by tools/sprites/studio.mjs)', () => {
	const dir = new URL('../../static/anim/', import.meta.url);
	const lib = JSON.parse(fs.readFileSync(new URL('library.json', dir), 'utf8'));
	it('every sheet exists and every step points at a real frame', () => {
		expect(lib.entries.length).toBeGreaterThan(10);
		for (const e of lib.entries) {
			for (const s of Object.values(e.sheets) as { src: string; n: number }[]) expect(fs.existsSync(new URL(s.src, dir)), s.src).toBe(true);
			for (const c of e.clips) for (const st of c.steps) {
				expect(e.sheets[st.s], `${e.id}/${c.id}`).toBeTruthy();
				expect(st.f).toBeLessThan(e.sheets[st.s].n);
				expect(st.d).toBeGreaterThan(0);
			}
		}
	});
	it('the reels are cut into characters, unique and general, every action named once', () => {
		const ch = lib.entries.filter((e: { kind: string }) => e.kind === 'unique' || e.kind === 'general');
		expect(ch.length).toBeGreaterThan(50);
		expect(ch.some((e: { kind: string }) => e.kind === 'general')).toBe(true);
		for (const e of ch) { const ids = e.clips.map((c: { id: string }) => c.id); expect(new Set(ids).size, e.id).toBe(ids.length); }
	});
	it('heroes carry the shared animation set', () => {
		for (const e of lib.entries.filter((x: { kind: string }) => x.kind === 'hero')) expect(e.clips.filter((c: { raw?: boolean }) => !c.raw).map((c: { id: string }) => c.id).slice(0, 6)).toEqual(['idle', 'run', 'attack', 'defend', 'hit', 'defeat']);
	});
});
