<script lang="ts">
	// Razzle's Crowd Control (DEMO on /splash-demo, 2026-10-20 — the user liked the carnival tickets): when her silver
	// adds +2 for a double, a ticket flutters down onto that double, stamps down where its +2 shield sits (above the
	// token), then shrinks away into it as the shield lights up. In the comic-burst style: ONE shape (a notched ticket,
	// ink outline + drop shadow), a big +2 in the comic face. `play(x, y, size, delay)` = the token's centre / width;
	// returns when it lands (ms) so the shield can light then. Transform / opacity only, one animation per element.
	type Tk = { key: number; x: number; y: number; w: number; delay: number; tilt: number }
	let tks: Tk[] = []
	let n = 0
	/** the whole flight (ms) and when it lands, both measured from its start */
	export const TICKET_MS = 1300
	export const TICKET_LAND = 760
	export function play(x: number, y: number, size = 48, delay = 0): number {
		const key = ++n
		const w = Math.max(54, Math.min(120, size * 1.35))
		// it settles where the +2 shield sits: just above the token
		tks = [...tks, { key, x, y: y - size * 0.95, w, delay, tilt: -10 + (key % 3) * 7 }]
		setTimeout(() => (tks = tks.filter((t) => t.key !== key)), delay + TICKET_MS + 60)
		return delay + TICKET_LAND
	}
	// the ticket: 120 × 64 with a round notch in the middle of each end, a perforated stub on the right
	const TICKET = 'M8 0 H112 A8 8 0 0 0 120 8 V23 A9 9 0 0 0 120 41 V56 A8 8 0 0 0 112 64 H8 A8 8 0 0 0 0 56 V41 A9 9 0 0 0 0 23 V8 A8 8 0 0 0 8 0 Z'
	const STAR = (cx: number, cy: number, R: number) => Array.from({ length: 10 }, (_, i) => { const a = ((-90 + i * 36) * Math.PI) / 180, k = i % 2 ? R * 0.45 : R; return `${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k).toFixed(1)}` }).join(' ')
</script>

<div class="ctx" aria-hidden="true">
	{#each tks as t (t.key)}
		<span class="at" style="left:{t.x}px;top:{t.y}px;--w:{t.w}px;--d:{t.delay}ms;--tilt:{t.tilt}deg">
			<span class="fall">
				<span class="sway">
					<svg viewBox="-8 -8 140 84">
						<path d={TICKET} transform="translate(4 5)" fill="#141014" stroke="#141014" stroke-width="5" stroke-linejoin="round" />
						<path d={TICKET} fill="#fff3d6" stroke="#141014" stroke-width="5" stroke-linejoin="round" />
						<rect x="9" y="8" width="102" height="48" rx="4" fill="none" stroke="#e5383b" stroke-width="2.6" />
						<line x1="86" y1="10" x2="86" y2="54" stroke="#e5383b" stroke-width="2.4" stroke-dasharray="4 4" />
						<polygon points={STAR(99, 32, 8)} fill="#ffcf3a" stroke="#141014" stroke-width="2" stroke-linejoin="round" />
						<g class="word" text-anchor="middle" transform="translate(46 47) skewX(-8)">
							<text transform="translate(2.5 3)" font-size="44" fill="#141014" stroke="#141014" stroke-width="7" stroke-linejoin="round">+2</text>
							<text font-size="44" fill="#e5383b" stroke="#141014" stroke-width="5" stroke-linejoin="round" paint-order="stroke">+2</text>
						</g>
					</svg>
				</span>
			</span>
		</span>
	{/each}
</div>

<style>
	.ctx { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
	.at { position: absolute; width: 0; height: 0; }
	/* outer: the fall, the stamp and the shrink into the shield (translate + scale) */
	.fall { position: absolute; width: var(--w); height: calc(var(--w) * 0.6); left: calc(var(--w) * -0.5); top: calc(var(--w) * -0.3);
		animation: tkfall 1.3s var(--d) cubic-bezier(0.25, 0.7, 0.35, 1) both; }
	@keyframes tkfall {
		0% { opacity: 0; transform: translateY(-260%) scale(0.9); }
		8% { opacity: 1; }
		56% { transform: translateY(0) scale(1); }
		60% { transform: translateY(4%) scale(1.14, 0.88); }
		66% { transform: translateY(0) scale(0.96, 1.04); }
		72% { transform: translateY(0) scale(1); }
		86% { opacity: 1; transform: translateY(0) scale(1); }
		100% { opacity: 0; transform: translateY(10%) scale(0.35); }
	}
	/* inner: the flutter as it falls, settling on its own small tilt */
	.sway { position: absolute; inset: 0; animation: tksway 1.3s var(--d) ease-in-out both; }
	@keyframes tksway {
		0% { transform: rotate(-30deg); }
		16% { transform: rotate(22deg); }
		32% { transform: rotate(-16deg); }
		46% { transform: rotate(10deg); }
		58%, 100% { transform: rotate(var(--tilt)); }
	}
	.sway svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.word { font-family: 'Bangers', Impact, sans-serif; }
	@media (prefers-reduced-motion: reduce) { .fall, .sway { animation-duration: 0.01s; animation-delay: 0s; } }
</style>
