// Ignatia's Equilibrium ring (the user's pick, 2026-10-16): ten tomoe commas round her split coin, evenly spaced,
// five of fire on the Atlantean (left) half and five of water on the Titan (right) half, in the woodblock look — inked
// outline over a pale keyline, flat colour, a swirl in each head. Drawn once in a 200 × 200 box with the coin
// (radius 50) in the middle; each comma is its own small svg so its pulse runs on the GPU.
// The rigging: the heads sit evenly on one circle, 36° apart; each comma is a pointed flame tongue — its tail narrows
// to a point while curving back (anticlockwise) and in towards the coin, ending just under the head of the comma behind
// it; the tip stays outside the coin's brass rim (~57 at dash size), so nothing hides under the coin.
export type Comma = { d: string; head: [number, number]; r: number; swirl: string; fire: boolean }
export const TOMOE_N = 10
export const TOMOE_INK = { fire: '#2a0d06', water: '#061232' }
export const TOMOE_BODY = { fire: '#e2452b', water: '#2e6fd6' }
export const TOMOE_MID = { fire: '#ffc35a', water: '#9cd0ff' }
/** a pale keyline under the ink, so both halves read on the dark dash */
export const TOMOE_KEY = 'rgba(255, 246, 228, 0.32)'
export const TOMOE_HEAD = 11.5
const C = 100
const RH = 69 // the heads' circle
const RT = 61 // where the tails end (just outside the brass rim)
const SPACING = 360 / TOMOE_N
const SWEEP = SPACING // each tail reaches back to the next head, tucked under it
const rad = (d: number) => (d * Math.PI) / 180
const f = (n: number) => n.toFixed(1)
/** a point at angle a (degrees, 0 = up, clockwise) and radius r round (cx, cy) */
const at = (a: number, r: number, cx = C, cy = C): [number, number] => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))]
const pt = (p: [number, number]) => `${f(p[0])} ${f(p[1])}`
function spiral(cx: number, cy: number, r: number, turns: number, a0: number) {
	const pts: string[] = []
	for (let i = 0; i <= 32; i++) { const t = i / 32; pts.push(pt(at(a0 + t * turns * 360, r * (1 - t * 0.9), cx, cy))) }
	return 'M' + pts.join(' L')
}
/** one comma: a round head at angle a leading clockwise; the tail, a flame's point, sweeping back and in */
function comma(a: number, fire: boolean): Comma {
	const H = TOMOE_HEAD, N = 26
	const mid = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; return { p: at(a - t * SWEEP, RH - t * (RH - RT)), w: H * Math.pow(1 - t, 1.25) } })
	const side = (s: number) => mid.map((q, i) => {
		const n = mid[Math.min(i + 1, N)].p, pv = mid[Math.max(i - 1, 0)].p
		const dx = n[0] - pv[0], dy = n[1] - pv[1], l = Math.hypot(dx, dy) || 1
		return [q.p[0] - (dy / l) * q.w * s, q.p[1] + (dx / l) * q.w * s] as [number, number]
	})
	const A = side(1), B = side(-1).reverse()
	const d = `M${A.map(pt).join(' L')} L${B.map(pt).join(' L')} A${H} ${H} 0 1 0 ${pt(A[0])} Z`
	const head = mid[0].p
	return { d, head, r: H, swirl: spiral(head[0], head[1], H * 0.5, 1.3, a), fire }
}
/** evenly round the whole coin: none on the seam (top / bottom), half each side */
export const TOMOE: Comma[] = Array.from({ length: TOMOE_N }, (_, k) => {
	const a = SPACING / 2 + k * SPACING // 18°, 54°, … 342°
	return comma(a, a > 180)
})
