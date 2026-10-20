<script lang="ts">
	// Razzle survives an attack with her silver (Crowd Control) — the crowd goes wild: an APPLAUSE sign drops in on its
	// two wires up and to the right of her body, swings, its bulbs chase round the frame and the word flicks on, holds,
	// then lifts away. The comic-burst style (one shape with an ink outline and drop shadow, the word in the comic face).
	// play(x, y, size) = the token's centre / width. Transform / opacity only, one animation per element.
	type Sign = { key: number; x: number; y: number; w: number }
	let signs: Sign[] = []
	let n = 0
	export const SIGN_MS = 2000
	export function play(x: number, y: number, size = 48) {
		const key = ++n
		const w = Math.max(150, Math.min(300, size * 3.4))
		signs = [...signs, { key, x: x + size * 0.5 + w * 0.12, y: y - size * 0.75 - w * 0.2, w }]
		setTimeout(() => (signs = signs.filter((s) => s.key !== key)), SIGN_MS + 60)
	}
	// bulbs round the frame (between the red box and the dark panel), split into two sets that light in turn
	const BOX = { x: 20, y: 46, w: 360, h: 124 }
	const bulbs: { cx: number; cy: number; odd: boolean }[] = []
	{
		const ins = 11, x0 = BOX.x + ins, x1 = BOX.x + BOX.w - ins, y0 = BOX.y + ins, y1 = BOX.y + BOX.h - ins, cols = 14, rows = 4
		for (let i = 0; i <= cols; i++) { const x = x0 + ((x1 - x0) * i) / cols; bulbs.push({ cx: x, cy: y0, odd: i % 2 === 1 }, { cx: x, cy: y1, odd: i % 2 === 0 }) }
		for (let j = 1; j < rows; j++) { const y = y0 + ((y1 - y0) * j) / rows; bulbs.push({ cx: x0, cy: y, odd: j % 2 === 1 }, { cx: x1, cy: y, odd: j % 2 === 0 }) }
	}
</script>

<div class="apx" aria-hidden="true">
	{#each signs as s (s.key)}
		<span class="at" style="left:{s.x}px;top:{s.y}px;--w:{s.w}px">
			<span class="drop">
				<span class="swing">
					<svg viewBox="0 0 400 190">
						<defs>
							<linearGradient id="ap{s.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stop-color="#fffbe0" /><stop offset="0.95" stop-color="#ffd23a" /></linearGradient>
						</defs>
						<!-- the two wires it hangs from -->
						<path d="M120 46 L150 0 M280 46 L250 0" stroke="#141014" stroke-width="5" stroke-linecap="round" fill="none" />
						<!-- the box: drop shadow, ink outline + red, the dark panel with a gold rule -->
						<rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx="20" transform="translate(7 9)" fill="#141014" />
						<rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx="20" fill="#c8162f" stroke="#141014" stroke-width="7" />
						<rect x={BOX.x + 22} y={BOX.y + 22} width={BOX.w - 44} height={BOX.h - 44} rx="10" fill="#2a0a16" stroke="#ffcf3a" stroke-width="3" />
						<!-- chase lights: two sets, each its own group fading in turn -->
						<g class="set a">{#each bulbs.filter((b) => !b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.6" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
						<g class="set b">{#each bulbs.filter((b) => b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.6" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
						<!-- the word: unlit underneath, lit on top (it flicks on) -->
						<g class="word" text-anchor="middle" transform="translate(200 128) skewX(-6)">
							<text font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="#5a2232">APPLAUSE!</text>
							<g class="lit">
								<text transform="translate(3 4)" font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="#c2187a" stroke="#141014" stroke-width="6" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
								<text font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="url(#ap{s.key})" stroke="#141014" stroke-width="5" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
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
	/* outer: drops in on its wires, holds, lifts away */
	.drop { position: absolute; width: var(--w); height: calc(var(--w) * 0.475); left: calc(var(--w) * -0.5); top: calc(var(--w) * -0.24);
		animation: apdrop 2s cubic-bezier(0.3, 1.25, 0.5, 1) both; }
	@keyframes apdrop {
		0% { opacity: 0; transform: translateY(-80%); }
		8% { opacity: 1; }
		22% { transform: translateY(0); }
		84% { opacity: 1; transform: translateY(0); }
		100% { opacity: 0; transform: translateY(-55%); }
	}
	/* inner: swings on its wires, settling level */
	.swing { position: absolute; inset: 0; transform-origin: 50% 0; animation: apswing 2s ease-in-out both; }
	@keyframes apswing { 0% { transform: rotate(-12deg); } 22% { transform: rotate(9deg); } 34% { transform: rotate(-5deg); } 46% { transform: rotate(2.5deg); } 58%, 100% { transform: rotate(0deg); } }
	.swing svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.word { font-family: 'Bangers', Impact, sans-serif; }
	/* the chase: the two sets swap every 0.2 s while it hangs there */
	.set { animation: apchase 0.4s steps(1) infinite; }
	.set.b { animation-delay: 0.2s; }
	@keyframes apchase { 0% { opacity: 1; } 50% { opacity: 0.18; } }
	/* the word flicks on twice, then stays lit */
	.lit { animation: apflick 2s linear both; }
	@keyframes apflick { 0%, 14% { opacity: 0; } 16%, 20% { opacity: 1; } 22%, 25% { opacity: 0.1; } 27%, 100% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .drop, .swing, .set, .lit { animation-duration: 0.01s; animation-iteration-count: 1; } }
</style>
