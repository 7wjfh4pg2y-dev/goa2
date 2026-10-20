<script lang="ts" context="module">
	export type PopKind = 'hit' | 'ko' | 'whiff'
</script>

<script lang="ts">
	// Razzle's comic hits (DEMO on /splash-demo, 2026-10-20 — the user's idea): a carnival-poster starburst with a random
	// word pops out over the hero she hits — BOP! POW! ZAP! on an attack, SMASH! KA-POW! on a defeat, WHIFF! when they
	// defend. Yellow burst with a magenta / cyan misprint behind it, speed lines shooting out, a tilt and an overshoot.
	// ~1 s; several can be on screen at once; transform / opacity only, each one leaves the page when it is done.
	const WORDS: Record<PopKind, string[]> = {
		hit: ['BOP!', 'POW!', 'ZAP!', 'BAM!', 'WHAM!', 'BONK!', 'ZING!', 'THWACK!'],
		ko: ['SMASH!', 'KA-POW!', 'KABOOM!', 'KER-SPLAT!', 'TA-DAA!'],
		whiff: ['WHIFF!', 'NOPE!', 'SWISH!']
	}
	type Pop = { key: number; x: number; y: number; s: number; word: string; kind: PopKind; tilt: number; side: number; burst: string; ink: string; mis: string }
	let pops: Pop[] = []
	let n = 0
	function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
	/** a jagged starburst: 14 spikes, alternating radii with a little jitter */
	function burstPath() {
		const pts: string[] = [], k = 14
		for (let i = 0; i < k * 2; i++) {
			const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 31 + Math.random() * 6 : 46 + Math.random() * 6
			pts.push(`${(r * Math.cos(a) * 1.25).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`)
		}
		return `M${pts.join('L')}Z`
	}
	/** screen x / y = the hero's centre, size = its token's width */
	export function play(x: number, y: number, size = 48, kind: PopKind = 'hit') {
		const key = ++n, side = Math.random() < 0.5 ? -1 : 1
		const pal = kind === 'ko' ? pick([['#ff3b3b', '#fff36b'], ['#ffe23a', '#ff3b8a']]) : kind === 'whiff' ? ['#d9f6ff', '#2fd6e6'] : pick([['#ffe23a', '#ff3bb4'], ['#ffe23a', '#2fd6e6'], ['#7df9ff', '#ff3bb4']])
		const p: Pop = { key, x, y, s: Math.max(64, Math.min(150, size * (kind === 'ko' ? 2.6 : 2.1))), word: pick(WORDS[kind]), kind, tilt: side * (8 + Math.random() * 10), side, burst: burstPath(), ink: pal[0], mis: pal[1] }
		pops = [...pops, p]
		setTimeout(() => (pops = pops.filter((q) => q.key !== key)), 1100)
	}
	const LINES = Array.from({ length: 10 }, (_, i) => i * 36 + (i % 2 ? 12 : 0))
</script>

<div class="cp" aria-hidden="true">
	{#each pops as p (p.key)}
		<!-- up and to one side of the hero, so their token stays in sight -->
		<span class="pop {p.kind}" style="left:{p.x + p.side * p.s * 0.22}px;top:{p.y - p.s * 0.42}px;--s:{p.s}px;--t:{p.tilt}deg;--ink:{p.ink};--mis:{p.mis}">
			{#each LINES as a}<i class="ln" style="--a:{a}deg"></i>{/each}
			<span class="body">
				<svg viewBox="-70 -55 140 110"><path class="mis" d={p.burst} transform="translate(5 5)" /><path class="bst" d={p.burst} /></svg>
				<b class:long={p.word.length > 6}>{p.word}</b>
			</span>
		</span>
	{/each}
</div>

<style>
	.cp { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.pop { position: absolute; width: var(--s); height: calc(var(--s) * 0.8); margin: calc(var(--s) * -0.4) 0 0 calc(var(--s) * -0.5); }
	/* the burst + word: punch in past full size with a tilt, a quick wobble, then puff away */
	.body { position: absolute; inset: 0; display: grid; place-items: center; animation: cpin 1.05s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes cpin {
		0% { opacity: 0; transform: scale(0.1) rotate(calc(var(--t) * -2)); }
		18% { opacity: 1; transform: scale(1.18) rotate(var(--t)); }
		28% { transform: scale(0.94) rotate(calc(var(--t) * 0.6)); }
		36% { transform: scale(1.04) rotate(var(--t)); }
		78% { opacity: 1; transform: scale(1) rotate(var(--t)); }
		100% { opacity: 0; transform: scale(1.25) rotate(var(--t)) translateY(-10%); }
	}
	.ko .body { animation-duration: 1.1s; }
	.body svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.bst { fill: var(--ink); stroke: #1a0b24; stroke-width: 3.5; stroke-linejoin: round; }
	.mis { fill: var(--mis); stroke: #1a0b24; stroke-width: 3; stroke-linejoin: round; }
	.body b { position: relative; font-weight: normal; font-size: calc(var(--s) * 0.27); line-height: 1; color: #fff; letter-spacing: 0.02em; transform: skewX(-8deg);
		-webkit-text-stroke: calc(var(--s) * 0.022) #1a0b24; paint-order: stroke fill; text-shadow: calc(var(--s) * 0.025) calc(var(--s) * 0.03) 0 #1a0b24; }
	.body b.long { font-size: calc(var(--s) * 0.2); }
	.ko .body b { color: #fff6c8; }
	.whiff .bst { fill: #eafcff; }
	.whiff .body b { color: #2fd6e6; }
	/* speed lines shooting out from the hit */
	.ln { position: absolute; left: 50%; top: 50%; width: 3px; height: calc(var(--s) * 0.18); margin-left: -1.5px; border-radius: 2px; background: #1a0b24; transform-origin: 50% 0;
		opacity: 0; animation: cpln 0.42s 0.05s ease-out both; }
	.ln:nth-child(odd) { background: var(--mis); }
	@keyframes cpln { 0% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.25)) scaleY(0.3); } 30% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.7)) scaleY(1); } }
	.whiff .ln { display: none; }
	@media (prefers-reduced-motion: reduce) { .cp * { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
