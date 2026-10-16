// Ignatia's Equilibrium ring (the user's pick, 2026-10-16): ten tomoe commas round her split coin, evenly spaced,
// five of fire on the Atlantean (left) half and five of water on the Titan (right) half, in the woodblock look — inked
// outline over a pale keyline, flat colour, a swirl in each head. Drawn once in a 200 × 200 box with the coin
// (radius 50) in the middle; each comma is its own small svg so its pulse runs on the GPU.
// The geometry makes a TRUE circle: every comma's inner edge lies on one circle just outside the coin's brass rim
// (the rim reaches ~57 at dash size), the heads sit on a circle a head's radius further out, and each tail tapers along
// the inner circle back to the comma behind it, its tip tucked just under that head — so the ring's inner edge is a
// clean circle and its outer edge is scalloped evenly by the ten heads.
export type Comma = { d: string; head: [number, number]; r: number; swirl: string; fire: boolean }
export const TOMOE_N = 10
export const TOMOE_INK = { fire: '#2a0d06', water: '#061232' }
export const TOMOE_BODY = { fire: '#e2452b', water: '#2e6fd6' }
export const TOMOE_MID = { fire: '#ffc35a', water: '#9cd0ff' }
/** a pale keyline under the ink, so both halves read on the dark dash */
export const TOMOE_KEY = 'rgba(255, 246, 228, 0.32)'
export const TOMOE_RIN = 59
export const TOMOE_HEAD = 11

const C = 100
const RC = TOMOE_RIN + TOMOE_HEAD // the heads' circle
const SPACING = 360 / TOMOE_N
const SWEEP = SPACING - 7 // the tail ends just tucked under the next head
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
/** one comma: a round head at angle a leading clockwise, its tail trailing back (anticlockwise) along the ring */
function comma(a: number, fire: boolean): Comma {
	const H = TOMOE_HEAD, N = 28
	const outer: string[] = [], inner: string[] = []
	for (let i = 0; i <= N; i++) {
		const t = i / N, ang = a - t * SWEEP
		// full near the head, tapering to a point on the inner circle (the tomoe's tail)
		outer.push(pt(at(ang, TOMOE_RIN + 2 * H * Math.pow(1 - Math.pow(t, 1.25), 1.15))))
		inner.push(pt(at(ang, TOMOE_RIN)))
	}
	// the outer edge from the head back to the tip, the inner circle forward again, then the head's leading half-circle
	const d = `M${outer.join(' L')} L${inner.reverse().join(' L')} A${H} ${H} 0 1 0 ${outer[0]} Z`
	const head = at(a, RC)
	return { d, head, r: H, swirl: spiral(head[0], head[1], H * 0.55, 1.35, a), fire }
}
/** evenly round the whole coin: none on the seam (top / bottom), half each side */
export const TOMOE: Comma[] = Array.from({ length: TOMOE_N }, (_, k) => {
	const a = SPACING / 2 + k * SPACING // 18°, 54°, … 342°
	return comma(a, a > 180)
})
