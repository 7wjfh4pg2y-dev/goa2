// Hex geometry for the board: pointy-top hexes on an odd-row offset grid, ids "col_row".
// Pure functions (tested in hexgeo.test.ts) — the one place the drawing code gets hex maths from.

export const SQRT3 = Math.sqrt(3)
export type Pt = { x: number; y: number }

export function parseHex(id: string): [number, number] {
	const [c, r] = id.split('_').map(Number)
	return [c, r]
}

/** Centre of a hex in board units (`size` = centre → corner). */
export function hexCenter(id: string, size: number): Pt {
	const [c, r] = parseHex(id)
	return { x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r }
}

/** Corner `i` (0–5), clockwise on screen from the top: top, upper-right, lower-right, bottom, lower-left, upper-left. */
export function hexCorner(c: Pt, size: number, i: number): Pt {
	const a = (Math.PI / 180) * (60 * i - 90)
	return { x: c.x + size * Math.cos(a), y: c.y + size * Math.sin(a) }
}

/** "x,y x,y …" for an svg polygon. */
export function hexPoints(c: Pt, size: number): string {
	let s = ''
	for (let i = 0; i < 6; i++) { const p = hexCorner(c, size, i); s += `${p.x.toFixed(1)},${p.y.toFixed(1)} ` }
	return s.trimEnd()
}

// Edge k runs from corner k to corner k+1; the neighbour across it, as axial (dq, dr):
// 0 north-east, 1 east, 2 south-east, 3 south-west, 4 west, 5 north-west.
const EDGE_DIRS: ReadonlyArray<readonly [number, number]> = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]

/** The hex across edge `k` (it may not exist on the map). */
export function hexNeighbour(id: string, k: number): string {
	const [c, r] = parseHex(id)
	const q = c - (r - (r & 1)) / 2
	const nq = q + EDGE_DIRS[k][0], nr = r + EDGE_DIRS[k][1]
	return `${nq + (nr - (nr & 1)) / 2}_${nr}`
}
export const hexNeighbours = (id: string): string[] => [0, 1, 2, 3, 4, 5].map((k) => hexNeighbour(id, k))

/** A stable pseudo-random number in [0, 1) for a hex (same hex + salt → same number, on every client). */
export function hexHash(id: string, salt = 0): number {
	const [c, r] = parseHex(id)
	return intHash(c, r, salt)
}
export function intHash(x: number, y: number, salt = 0): number {
	let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041)) | 0
	n = Math.imul(n ^ (n >>> 13), 1274126177)
	n ^= n >>> 16
	return (n >>> 0) / 4294967296
}

/** The outline of a set of hexes, as closed loops of corner points. The outer edge of each
 *  connected group runs clockwise on screen; a hole inside a group gives its own loop. */
export function outlineLoops(ids: Iterable<string>, size: number): Pt[][] {
	const set = ids instanceof Set ? (ids as Set<string>) : new Set(ids)
	// hex corners sit on an exact lattice (x in half-widths, y in half-sizes), so they key cleanly
	const key = (p: Pt) => `${Math.round(p.x / (size * SQRT3 / 2))},${Math.round(p.y / (size / 2))}`
	const next = new Map<string, { from: Pt; toKey: string }>()
	for (const id of set) {
		const c = hexCenter(id, size)
		for (let k = 0; k < 6; k++) {
			if (set.has(hexNeighbour(id, k))) continue
			const a = hexCorner(c, size, k), b = hexCorner(c, size, (k + 1) % 6)
			next.set(key(a), { from: a, toKey: key(b) }) // every outline corner has exactly one edge leaving it
		}
	}
	const loops: Pt[][] = []
	while (next.size) {
		const start = next.keys().next().value as string
		const loop: Pt[] = []
		let k = start
		for (let guard = next.size + 1; guard > 0; guard--) {
			const e = next.get(k)
			if (!e) break
			next.delete(k)
			loop.push(e.from)
			k = e.toKey
			if (k === start) break
		}
		if (loop.length >= 3) loops.push(loop)
	}
	return loops
}

const f1 = (n: number) => n.toFixed(1)
/** A closed loop as an svg path with every corner rounded: `round` 0 = sharp corners,
 *  1 = each corner cut from edge midpoint to edge midpoint (a soft, scalloped line). */
export function smoothPath(loop: Pt[], round = 1): string {
	const n = loop.length
	if (n < 3) return ''
	const t = Math.max(0, Math.min(1, round)) / 2
	let d = ''
	for (let i = 0; i < n; i++) {
		const v = loop[i], p = loop[(i + n - 1) % n], q = loop[(i + 1) % n]
		const ax = v.x + (p.x - v.x) * t, ay = v.y + (p.y - v.y) * t
		const bx = v.x + (q.x - v.x) * t, by = v.y + (q.y - v.y) * t
		d += `${i ? 'L' : 'M'}${f1(ax)} ${f1(ay)}`
		d += t ? `Q${f1(v.x)} ${f1(v.y)} ${f1(bx)} ${f1(by)}` : ''
	}
	return d + 'Z'
}
export const loopsPath = (loops: Pt[][], round = 1): string => loops.map((l) => smoothPath(l, round)).join('')

/** The edges where two hexes of DIFFERENT groups meet (each edge once), as an svg path.
 *  `groupOf` returns undefined for a hex that isn't on the map. */
export function borderPath(ids: Iterable<string>, groupOf: (id: string) => string | undefined, size: number): string {
	let d = ''
	for (const id of ids) {
		const g = groupOf(id)
		if (g === undefined) continue
		const c = hexCenter(id, size)
		for (let k = 1; k <= 3; k++) { // east, south-east, south-west: the other three belong to the neighbour
			const og = groupOf(hexNeighbour(id, k))
			if (og === undefined || og === g) continue
			const a = hexCorner(c, size, k), b = hexCorner(c, size, (k + 1) % 6)
			d += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`
		}
	}
	return d
}
