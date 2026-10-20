<script lang="ts">
	// Razzle survives an attack with her silver (Crowd Control) — the crowd goes wild: a little carnival marquee hangs
	// right above the body that survived (an arched sign with a red-and-white candy-stripe frame, chase bulbs round
	// the arch, a dark panel where APPLAUSE! flicks on in gold, a gold star). It drops in on its wires, swings,
	// holds, lifts away. The comic-burst style (ink outline + drop shadow, the word in the comic face).
	// play(x, y, size) = the token's centre / width. Transform / opacity only, one animation per element.
	type Sign = { key: number; x: number; y: number; w: number }
	let signs: Sign[] = []
	let n = 0
	export const SIGN_MS = 2000
	export function play(x: number, y: number, size = 48) {
		const key = ++n
		const w = Math.max(96, Math.min(190, size * 2.3))
		// centred over the body, its foot just clear of the token's top
		signs = [...signs, { key, x, y: y - size * 0.55 - w * 0.3, w }]
		setTimeout(() => (signs = signs.filter((s) => s.key !== key)), SIGN_MS + 60)
	}
	// the sign in a 300 × 180 box: an arched top, a square foot
	const SIGN = 'M20 66 Q150 -6 280 66 V150 Q280 166 264 166 H36 Q20 166 20 150 Z'
	const PANEL = 'M42 80 Q150 26 258 80 V138 Q258 146 250 146 H50 Q42 146 42 138 Z'
	// bulbs along the arch (the quadratic from 20,66 via 150,-6 to 280,66, pulled in a little) and down the sides
	const bulbs: { cx: number; cy: number; odd: boolean }[] = []
	for (let i = 0; i <= 12; i++) {
		const t = i / 12, x = (1 - t) ** 2 * 31 + 2 * (1 - t) * t * 150 + t * t * 269, y = (1 - t) ** 2 * 71 + 2 * (1 - t) * t * 6 + t * t * 71
		bulbs.push({ cx: x, cy: y, odd: i % 2 === 1 })
	}
	for (let j = 1; j <= 3; j++) { const y = 71 + j * 23; bulbs.push({ cx: 31, cy: y, odd: j % 2 === 0 }, { cx: 269, cy: y, odd: j % 2 === 1 }) }
	const STAR = (cx: number, cy: number, R: number) => Array.from({ length: 10 }, (_, i) => { const a = ((-90 + i * 36) * Math.PI) / 180, k = i % 2 ? R * 0.45 : R; return `${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k).toFixed(1)}` }).join(' ')
</script>

<div class="apx" aria-hidden="true">
	{#each signs as s (s.key)}
		{@const id = `ap${s.key}`}
		<span class="at" style="left:{s.x}px;top:{s.y}px;--w:{s.w}px">
			<span class="drop">
				<span class="swing">
					<svg viewBox="0 -40 300 220">
						<defs>
							<pattern id="{id}-st" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#fff4e0" /><rect width="8" height="16" fill="#d8172f" /></pattern>
							<linearGradient id="{id}-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stop-color="#fffbe0" /><stop offset="0.95" stop-color="#ffc72a" /></linearGradient>
						</defs>
						<!-- the wires it hangs from -->
						<path d="M104 30 L130 -38 M196 30 L170 -38" stroke="#141014" stroke-width="4" stroke-linecap="round" fill="none" />
						<!-- the sign: drop shadow, candy-stripe frame in ink, the dark panel with a gold rule -->
						<path d={SIGN} transform="translate(6 8)" fill="#141014" />
						<path d={SIGN} fill="url(#{id}-st)" stroke="#141014" stroke-width="6" stroke-linejoin="round" />
						<path d={PANEL} fill="#2a0a16" stroke="#141014" stroke-width="4" stroke-linejoin="round" />
						<path d={PANEL} fill="none" stroke="#ffcf3a" stroke-width="2.4" transform="translate(150 113) scale(0.94) translate(-150 -113)" />
						<!-- chase lights round the arch and down the sides: two sets lighting in turn -->
						<g class="set a">{#each bulbs.filter((b) => !b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.2" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
						<g class="set b">{#each bulbs.filter((b) => b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.2" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
						<polygon points={STAR(150, 46, 11)} fill="#ffcf3a" stroke="#141014" stroke-width="2.2" stroke-linejoin="round" />
						<!-- the word: unlit underneath, lit on top (it flicks on) -->
						<g class="word" text-anchor="middle" transform="translate(150 133) skewX(-6)">
							<text font-size="46" textLength="196" lengthAdjust="spacingAndGlyphs" fill="#5a2232">APPLAUSE!</text>
							<g class="lit">
								<text transform="translate(2.5 3)" font-size="46" textLength="196" lengthAdjust="spacingAndGlyphs" fill="#c2187a" stroke="#141014" stroke-width="5" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
								<text font-size="46" textLength="196" lengthAdjust="spacingAndGlyphs" fill="url(#{id}-t)" stroke="#141014" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
							</g>
						</g>
					</svg>
				</span>
			</span>
		</span>
	{/each}
</div>

<style>
	.apx { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.at { position: absolute; width: 0; height: 0; }
	/* outer: drops in on its wires, holds, lifts away (the box is 300 × 220 units: the sign plus the wires above it) */
	.drop { position: absolute; width: var(--w); height: calc(var(--w) * 0.733); left: calc(var(--w) * -0.5); top: calc(var(--w) * -0.4);
		animation: apdrop 2s cubic-bezier(0.3, 1.25, 0.5, 1) both; }
	@keyframes apdrop {
		0% { opacity: 0; transform: translateY(-70%); }
		8% { opacity: 1; }
		22% { transform: translateY(0); }
		84% { opacity: 1; transform: translateY(0); }
		100% { opacity: 0; transform: translateY(-45%); }
	}
	/* inner: swings on its wires (from the top), settling level */
	.swing { position: absolute; inset: 0; transform-origin: 50% 0; animation: apswing 2s ease-in-out both; }
	@keyframes apswing { 0% { transform: rotate(-14deg); } 22% { transform: rotate(10deg); } 34% { transform: rotate(-6deg); } 46% { transform: rotate(3deg); } 58%, 100% { transform: rotate(0deg); } }
	.swing svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.word { font-family: 'Bangers', Impact, sans-serif; }
	/* the chase: the two sets swap every 0.2 s */
	.set { animation: apchase 0.4s steps(1) infinite; }
	.set.b { animation-delay: 0.2s; }
	@keyframes apchase { 0% { opacity: 1; } 50% { opacity: 0.18; } }
	/* the word flicks on twice, then stays lit */
	.lit { animation: apflick 2s linear both; }
	@keyframes apflick { 0%, 14% { opacity: 0; } 16%, 20% { opacity: 1; } 22%, 25% { opacity: 0.1; } 27%, 100% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .drop, .swing, .set, .lit { animation-duration: 0.01s; animation-iteration-count: 1; } }
</style>
