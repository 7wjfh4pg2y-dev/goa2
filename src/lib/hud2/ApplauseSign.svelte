<script lang="ts">
	// Razzle survives an attack with her silver (Crowd Control) — the crowd goes wild: a brightly lit APPLAUSE sign
	// pops up right above the body that survived (the user's pick, 2026-10-20: the red marquee box, no wires — a lit
	// sign): a red box with a dark panel and a gold rule, chase bulbs all round the frame, the word flicking on in gold,
	// a warm glow behind it; it holds, then pops away. The comic-burst style (ink outline + drop shadow, the comic face).
	// play(x, y, size) = the token's centre / width. Transform / opacity only, one animation per element.
	type Sign = { key: number; x: number; y: number; w: number }
	let signs: Sign[] = []
	let n = 0
	export const SIGN_MS = 2000
	export function play(x: number, y: number, size = 48) {
		const key = ++n
		const w = Math.max(100, Math.min(200, size * 2.4))
		// centred over the body, its foot just clear of the token's top
		signs = [...signs, { key, x, y: y - size * 0.55 - w * 0.2, w }]
		setTimeout(() => (signs = signs.filter((s) => s.key !== key)), SIGN_MS + 60)
	}
	// the box in a 400 × 150 svg, bulbs between the red frame and the dark panel, in two sets that light in turn
	const BOX = { x: 10, y: 10, w: 380, h: 124 }
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
			<span class="pop">
				<!-- the sign's light on the board round it (a still gradient; only its opacity breathes) -->
				<span class="glow"></span>
				<svg viewBox="0 0 400 150">
					<defs>
						<linearGradient id="ap{s.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stop-color="#fffbe0" /><stop offset="0.95" stop-color="#ffd23a" /></linearGradient>
					</defs>
					<!-- the box: drop shadow, ink outline + red, the dark panel with a gold rule -->
					<rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx="20" transform="translate(7 9)" fill="#141014" />
					<rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx="20" fill="#c8162f" stroke="#141014" stroke-width="7" />
					<rect x={BOX.x + 22} y={BOX.y + 22} width={BOX.w - 44} height={BOX.h - 44} rx="10" fill="#2a0a16" stroke="#ffcf3a" stroke-width="3" />
					<!-- chase lights: two sets, each its own group fading in turn -->
					<g class="set a">{#each bulbs.filter((b) => !b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.6" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
					<g class="set b">{#each bulbs.filter((b) => b.odd) as b}<circle cx={b.cx} cy={b.cy} r="5.6" fill="#fff6c0" stroke="#141014" stroke-width="1.6" />{/each}</g>
					<!-- the word: unlit underneath, lit on top (it flicks on) -->
					<g class="word" text-anchor="middle" transform="translate(200 92) skewX(-6)">
						<text font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="#5a2232">APPLAUSE!</text>
						<g class="lit">
							<text transform="translate(3 4)" font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="#c2187a" stroke="#141014" stroke-width="6" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
							<text font-size="58" textLength="272" lengthAdjust="spacingAndGlyphs" fill="url(#ap{s.key})" stroke="#141014" stroke-width="5" stroke-linejoin="round" paint-order="stroke">APPLAUSE!</text>
						</g>
					</g>
				</svg>
			</span>
		</span>
	{/each}
</div>

<style>
	.apx { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.at { position: absolute; width: 0; height: 0; }
	/* pops up like the comic bursts, holds, pops away */
	.pop { position: absolute; width: var(--w); height: calc(var(--w) * 0.375); left: calc(var(--w) * -0.5); top: calc(var(--w) * -0.19);
		animation: appop 2s cubic-bezier(0.3, 1.4, 0.5, 1) both; transform-origin: 50% 90%; }
	@keyframes appop {
		0% { opacity: 0; transform: scale(0.2); }
		9% { opacity: 1; transform: scale(1.12); }
		16% { transform: scale(0.96); }
		22% { transform: scale(1); }
		84% { opacity: 1; transform: scale(1); }
		100% { opacity: 0; transform: scale(1.15) translateY(-12%); }
	}
	.pop svg { position: relative; width: 100%; height: 100%; display: block; overflow: visible; }
	/* the warm light the sign throws: a still radial gradient, comes up as the word lights and breathes */
	.glow { position: absolute; left: -22%; right: -22%; top: -45%; bottom: -45%; border-radius: 50%;
		background: radial-gradient(closest-side, rgba(255, 214, 120, 0.55), rgba(255, 150, 60, 0.22) 55%, rgba(255, 120, 40, 0) 100%);
		animation: apglow 2s linear both; }
	@keyframes apglow { 0%, 14% { opacity: 0; } 18% { opacity: 1; } 22%, 25% { opacity: 0.2; } 28% { opacity: 1; } 45% { opacity: 0.75; } 60% { opacity: 1; } 75% { opacity: 0.75; } 100% { opacity: 0.9; } }
	.word { font-family: 'Bangers', Impact, sans-serif; }
	/* the chase: the two sets swap every 0.2 s */
	.set { animation: apchase 0.4s steps(1) infinite; }
	.set.b { animation-delay: 0.2s; }
	@keyframes apchase { 0% { opacity: 1; } 50% { opacity: 0.18; } }
	/* the word flicks on twice, then stays lit */
	.lit { animation: apflick 2s linear both; }
	@keyframes apflick { 0%, 14% { opacity: 0; } 16%, 20% { opacity: 1; } 22%, 25% { opacity: 0.1; } 27%, 100% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .pop, .glow, .set, .lit { animation-duration: 0.01s; animation-iteration-count: 1; } }
</style>
