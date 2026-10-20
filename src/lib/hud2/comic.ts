// Razzle's comic bursts (the user's picks, 2026-10-20: SIMPLE — one shape, its own halftone dots, the word; variety
// comes from the shape, the colours and the lettering). Geometry is in a 400 × 300 box centred on 200, 150, and is
// worked out once, deterministically, so every screen draws the same burst. ComicBurst.svelte draws them.

export type ComicMoment = 'attacked' | 'attacks' | 'killHero' | 'killMinion' | 'defended' | 'blocked' | 'defeated' | 'twin' | 'poofIn' | 'poofOut'
export type ComicLine = { t: string; y: number; size: number; len: number; chars: { t: string; s: number; dy: number; r: number }[] }
export type Comic = {
	word: string
	polys: string[]; paths: string[]; ells: { cx: number; cy: number; rx: number; ry: number }[]
	fill: string; dot: string
	top: string; bot: string; ext: string; shine: string
	lines: ComicLine[]
	tf: string
}

const r1 = (n: number) => Math.round(n * 10) / 10
function rng(seed: number) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const D = Math.PI / 180

/** a jagged burst: 2n points, long spikes between inner notches, each a little off */
export function burstPoints(n: number, rx: number, ry: number, inner: number, seed: number): string {
	const r = rng(seed), out: string[] = []
	for (let i = 0; i < n * 2; i++) {
		const a = -90 * D + (i * Math.PI) / n + (r() - 0.5) * 0.55 * (Math.PI / n)
		const k = i % 2 === 0 ? 0.8 + r() * 0.26 : inner * (0.88 + r() * 0.24)
		out.push(`${r1(200 + Math.cos(a) * rx * k)},${r1(150 + Math.sin(a) * ry * k)}`)
	}
	return out.join(' ')
}
/** a puffy cloud: a fat middle plus a ring of round lobes */
export function cloudLobes(seed: number, lobes = 12, rx = 152, ry = 106, pr = 44) {
	const r = rng(seed), E = [{ cx: 200, cy: 150, rx: rx * 0.8, ry: ry * 0.74 }]
	for (let i = 0; i < lobes; i++) {
		const a = (i / lobes) * 2 * Math.PI + r() * 0.25, rr = r1(pr * (0.82 + r() * 0.36))
		E.push({ cx: r1(200 + Math.cos(a) * rx * 0.72), cy: r1(150 + Math.sin(a) * ry * 0.64), rx: rr, ry: rr })
	}
	return E
}
/** a lumpy blob: a smooth closed curve (Catmull-Rom) through wobbling points round an ellipse */
export function blobPath(seed: number, wob: number, rx = 150, ry = 100, n = 14): string {
	const r = rng(seed), P: [number, number][] = []
	for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI, k = 1 + (r() - 0.5) * wob; P.push([200 + Math.cos(a) * rx * k, 150 + Math.sin(a) * ry * k]) }
	let d = `M${r1(P[0][0])} ${r1(P[0][1])}`
	for (let i = 0; i < n; i++) {
		const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]
		d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`
	}
	return d + 'Z'
}
/** letters that grow along the word and bounce on and off the baseline */
function chars(t: string, size: number, grow: number, wave: number) {
	const n = t.length
	let prev = 0
	return Array.from(t).map((ch, i) => {
		const p = n > 1 ? i / (n - 1) : 0.5, w = wave * Math.sin(i * 2.2 + 0.6), dy = r1(w - prev)
		prev = w
		return { t: ch, s: r1(size * (1 + grow * (p - 0.5) * 2)), dy, r: r1(3 * Math.sin(i * 1.7 + 1)) }
	})
}

type Shape = { polys?: string[]; paths?: string[]; ells?: Comic['ells'] }
type Spec = Shape & { fill: string; dot: string; lines: [string, number, number, number?][]; top: string; bot: string; ext?: string; shine?: string; rot?: number; skew?: number; grow?: number; wave?: number }
const burst = (n: number, seed: number, rx = 160, ry = 110, inner = 0.64): Shape => ({ polys: [burstPoints(n, rx, ry, inner, seed)] })
const puff = (seed: number, lobes = 12): Shape => ({ ells: cloudLobes(seed, lobes) })
const lump = (seed: number, wob: number): Shape => ({ paths: [blobPath(seed, wob)] })
function make(s: Spec): Comic {
	return {
		word: s.lines.map((l) => l[0]).join(' '),
		polys: s.polys ?? [], paths: s.paths ?? [], ells: s.ells ?? [],
		fill: s.fill, dot: s.dot, top: s.top, bot: s.bot, ext: s.ext ?? '#141014', shine: s.shine ?? '#ffffff',
		lines: s.lines.map(([t, size, len, y]) => ({ t, y: y ?? 30, size, len, chars: chars(t, size, s.grow ?? 0.12, s.wave ?? 5) })),
		tf: `translate(200 150) rotate(${s.rot ?? -8}) skewX(${s.skew ?? -8})`
	}
}

export const COMICS: Record<ComicMoment, Comic[]> = {
	// Razzle is attacked (over the body hit, with the shuffle)
	attacked: [
		make({ ...burst(11, 11), fill: '#2ec4f0', dot: '#0b78b0', lines: [['WHOA!', 96, 240]], top: '#fff45c', bot: '#ffa21a', ext: '#d1121e', rot: -7 }),
		make({ ...puff(7), fill: '#86d42c', dot: '#4a9410', lines: [['YIKES!', 92, 254]], top: '#ffd23a', bot: '#ff3b1f', rot: -9 }),
		make({ ...burst(13, 21, 158, 108, 0.72), fill: '#ffffff', dot: '#3f8de0', lines: [['NOPE!', 98, 236]], top: '#ff4fc4', bot: '#c2006c', rot: -6 })
	],
	// Razzle attacks a hero (over the target)
	attacks: [
		make({ ...burst(14, 31, 162, 110, 0.7), fill: '#ffd83a', dot: '#ff8a00', lines: [['POW!', 106, 220, 32]], top: '#ff4a1c', bot: '#c90f0f', shine: '#ffd5a0', rot: -6, grow: 0.18 }),
		make({ ...burst(12, 41), fill: '#e52421', dot: '#a30d0d', lines: [['BAM!', 106, 214, 32]], top: '#fff23a', bot: '#ffc000', rot: -9, grow: 0.16 }),
		make({ ...puff(17, 13), fill: '#3b7ff0', dot: '#1a4cb8', lines: [['WHAM!', 94, 248, 28]], top: '#fff23a', bot: '#ffb000', ext: '#d1121e', rot: -8 })
	],
	// Razzle defeats a hero (over the fallen hero; bigger, held longer)
	killHero: [
		make({ ...burst(15, 51, 172, 116, 0.66), fill: '#ff7a1a', dot: '#c84400', lines: [['KA-POW!', 94, 292, 28]], top: '#ffffff', bot: '#ffe36b', rot: -7 }),
		make({ ...burst(13, 61, 166, 112, 0.7), fill: '#e5197e', dot: '#9c0052', lines: [['TA-DA!', 100, 252]], top: '#fff04a', bot: '#ff8a00', ext: '#5a0030', shine: '#fff6c0', rot: -6 }),
		make({ ...burst(12, 71, 166, 114, 0.62), fill: '#1a1620', dot: '#4d4560', lines: [['BOOM!', 104, 256, 32]], top: '#ffffff', bot: '#dbe7ff', ext: '#1b8fd0', rot: -8, grow: 0.16 })
	],
	// Razzle defeats a minion (over the minion; small, quick)
	killMinion: [
		make({ ...puff(81, 11), fill: '#43c24a', dot: '#1f7f2a', lines: [['BONK!', 98, 236]], top: '#ffc21a', bot: '#ff5a00', rot: -9 }),
		make({ ...burst(9, 91, 152, 116, 0.56), fill: '#2ea6f5', dot: '#0b62b0', lines: [['ZAP!', 114, 196, 36]], top: '#fff23a', bot: '#ffb300', ext: '#0b2d6b', rot: -8, grow: 0.2 }),
		make({ ...lump(101, 0.42), fill: '#ff4f1f', dot: '#b8250a', lines: [['SPLAT!', 94, 250]], top: '#fff23a', bot: '#ffb000', rot: -7 })
	],
	// the extras: she survives an attack · her attack is blocked · she is defeated · Twin Strike (her ultimate)
	defended: [make({ ...puff(111), fill: '#33d3f2', dot: '#0b8fb6', lines: [['MISSED', 78, 240, -16], ['ME!', 82, 130, 58]], top: '#ff6fd2', bot: '#d4007f', rot: -7 })],
	blocked: [make({ ...lump(121, 0.18), fill: '#8ea3c8', dot: '#5c6f94', lines: [['AWW!', 100, 208]], top: '#ffffff', bot: '#cfe0ff', ext: '#2a3550', rot: 6, skew: 4, wave: 3, grow: -0.1 })],
	defeated: [make({ ...burst(8, 131, 154, 96, 0.72), fill: '#7a4292', dot: '#4a2160', lines: [['OOF!', 100, 200, 32]], top: '#ffe0f3', bot: '#ff8fcf', rot: 4, skew: -4, wave: 3, grow: -0.08 })],
	// a double appears / vanishes: a smoke cloud CENTRED on the token (COMIC_OVER) that hides it while it pops in or out
	poofIn: [
		make({ ...puff(201, 10), fill: '#ffffff', dot: '#b9a7e6', lines: [['POOF!', 104, 230, 32]], top: '#ff3b2a', bot: '#c4100f', rot: -7, grow: 0.14 }),
		make({ ...puff(202, 11), fill: '#ecdcff', dot: '#a98be0', lines: [['PRESTO!', 88, 280]], top: '#ff4fc4', bot: '#9c0057', rot: -6 }),
		make({ ...puff(203, 10), fill: '#dcf6ff', dot: '#86c4e6', lines: [['TA-DAA!', 90, 272]], top: '#ffd23a', bot: '#ff7a00', rot: -8 })
	],
	poofOut: [
		make({ ...puff(211, 10), fill: '#ffffff', dot: '#b9a7e6', lines: [['POOF!', 104, 230, 32]], top: '#ff3b2a', bot: '#c4100f', rot: -7, grow: 0.14 }),
		make({ ...puff(212, 11), fill: '#dcf6ff', dot: '#86c4e6', lines: [['WHOOSH!', 86, 286]], top: '#2fb8f0', bot: '#0b5fb0', rot: -9 }),
		make({ ...puff(213, 10), fill: '#ecdcff', dot: '#a98be0', lines: [['GONE!', 100, 236, 32]], top: '#b56cff', bot: '#5d1fa8', rot: -6 })
	],
	twin: [make({ ...burst(18, 145, 176, 120, 0.74), fill: '#ffcf3a', dot: '#e0912a', lines: [['ENCORE!', 92, 290, 28]], top: '#ffffff', bot: '#ffe08a', ext: '#c2187a', rot: -5 })]
}

/** how big and how long each moment plays: width = `scale` × the token's width; `ms` on screen */
export const COMIC_TIMING: Record<ComicMoment, { scale: number; ms: number }> = {
	attacked: { scale: 2.6, ms: 1150 }, attacks: { scale: 2.6, ms: 1150 }, killHero: { scale: 3.2, ms: 1600 }, killMinion: { scale: 2.2, ms: 900 },
	defended: { scale: 2.8, ms: 1300 }, blocked: { scale: 2.5, ms: 1200 }, defeated: { scale: 2.8, ms: 1400 }, twin: { scale: 3, ms: 1400 },
	poofIn: { scale: 2.4, ms: 1050 }, poofOut: { scale: 2.4, ms: 1050 }
}
/** these burst CENTRED on the token (and hide it) instead of up and to its right */
export const COMIC_OVER: ComicMoment[] = ['poofIn', 'poofOut']
/** ms after `play` when a burst is at full size — swap a token in / out then, while the cloud covers it */
export const COMIC_COVER = 110

/** pick one of a moment's bursts at random, never the same one twice in a row */
export function pickComic(m: ComicMoment, last: number, rand = Math.random): number {
	const n = COMICS[m].length
	if (n < 2) return 0
	const i = Math.floor(rand() * (n - 1))
	return i >= last && last >= 0 ? i + 1 : i
}
