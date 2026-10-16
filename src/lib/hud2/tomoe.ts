// Ignatia's Equilibrium ring (the user's pick, 2026-10-16): ten tomoe commas round her split coin, evenly spaced,
// five of fire on the Atlantean (left) half and five of water on the Titan (right) half, in the woodblock look — inked
// outline, flat colour, a swirl in each head. Drawn once in a 200 × 200 box with the coin (radius 50) in the middle;
// each comma is its own small svg so its pulse runs on the GPU.
export type Comma = { d: string; head: [number, number]; r: number; swirl: string; fire: boolean }
export const TOMOE_N = 10
export const TOMOE_INK = { fire: '#2a0d06', water: '#07132e' }
export const TOMOE_BODY = { fire: '#e2452b', water: '#1d3f8f' }
export const TOMOE_MID = { fire: '#f39a2b', water: '#3f7fd8' }

const C = 100, R = 50
const rad = (d: number) => (d * Math.PI) / 180
const f = (n: number) => n.toFixed(1)
/** a point at angle a (degrees, 0 = up, clockwise) and radius r round (cx, cy) */
const at = (a: number, r: number, cx = C, cy = C): [number, number] => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))]
function spiral(cx: number, cy: number, r: number, turns: number, a0: number) {
	const pts: string[] = []
	for (let i = 0; i <= 32; i++) { const t = i / 32; pts.push(at(a0 + t * turns * 360, r * (1 - t * 0.9), cx, cy).map(f).join(' ')) }
	return 'M' + pts.join(' L')
}
/** one comma: the head at angle a on the ring, the tail sweeping back (anticlockwise) and in towards the coin */
function comma(a: number, fire: boolean): Comma {
	const HEAD = 11.5, SWEEP = 38, N = 24
	const pts = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return { p: at(a - t * SWEEP, R * 1.34 - t * 9), w: HEAD * Math.pow(1 - t, 1.25) } })
	const side = (s: number) => pts.map((q, i) => {
		const n = pts[Math.min(i + 1, N)].p, pv = pts[Math.max(i - 1, 0)].p
		const dx = n[0] - pv[0], dy = n[1] - pv[1], l = Math.hypot(dx, dy) || 1
		return [q.p[0] - (dy / l) * q.w * s, q.p[1] + (dx / l) * q.w * s] as [number, number]
	})
	const A = side(1), B = side(-1).reverse()
	const d = `M${A.map((p) => p.map(f).join(' ')).join(' L')} L${B.map((p) => p.map(f).join(' ')).join(' L')} A${HEAD} ${HEAD} 0 1 1 ${f(A[0][0])} ${f(A[0][1])} Z`
	const head = pts[0].p
	return { d, head, r: HEAD, swirl: spiral(head[0], head[1], HEAD * 0.5, 1.3, a), fire }
}
/** evenly round the whole coin: none on the seam (top / bottom), half each side */
export const TOMOE: Comma[] = Array.from({ length: TOMOE_N }, (_, k) => {
	const a = 360 / TOMOE_N / 2 + (k * 360) / TOMOE_N // 18°, 54°, … 342°
	return comma(a, a > 180)
})
