<script lang="ts" context="module">
	export type PopKind = 'hit' | 'ko' | 'whiff'
</script>

<script lang="ts">
	// Razzle's comic hits (DEMO on /splash-demo, 2026-10-20 — after the user's comic-book sheets): a sticker-style sound
	// effect pops out over the hero she hits — a SPIKE star, a JAGGED blast or a bubbly CLOUD, flat colour with a
	// halftone shade, a white sticker edge inside an ink outline, a halftone dot halo, thin burst lines, little stars or
	// smoke puffs, and a skewed word in a contrasting colour with an ink drop shadow — BOP! POW! ZAP! on an attack,
	// SMASH! KA-POW! on a defeat, WHIFF! when they defend. Kept small (≈ 1.8 × the token; 2.2 × on a defeat) so the board
	// stays readable. ~1 s; several at once; transform / opacity only, each leaves the page when done.
	const WORDS: Record<PopKind, string[]> = {
		hit: ['BOP!', 'POW!', 'ZAP!', 'BAM!', 'WHAM!', 'BONK!', 'SNAP!', 'THWACK!'],
		ko: ['SMASH!', 'KA-POW!', 'KABOOM!', 'CRASH!', 'TA-DAA!'],
		whiff: ['WHIFF!', 'NOPE!', 'SWISH!', 'OOPS!']
	}
	// burst fill · its shade · word colour · accent (stars, lines, halftone tint)
	type Pal = { fill: string; shade: string; word: string; acc: string }
	const PALS: Pal[] = [
		{ fill: '#ffd42a', shade: '#f5a623', word: '#1e88e5', acc: '#1e88e5' }, // CRASH: blue on yellow
		{ fill: '#ffd42a', shade: '#f5a623', word: '#e53935', acc: '#e53935' }, // POW: red on yellow
		{ fill: '#e53935', shade: '#b71c1c', word: '#ffe14a', acc: '#ffe14a' }, // WOW: yellow on red
		{ fill: '#2fa8f0', shade: '#1976d2', word: '#ffe14a', acc: '#ffe14a' }, // ZAP: yellow on blue
		{ fill: '#8bd13a', shade: '#5ea524', word: '#ff5a1f', acc: '#ff5a1f' }, // OH: orange on green
		{ fill: '#e0237f', shade: '#a8125b', word: '#ff9a1f', acc: '#ff3b8a' } // OOH: orange on magenta
	]
	const WHIFF: Pal = { fill: '#e8fbff', shade: '#9fdcf0', word: '#1e88e5', acc: '#2fd6e6' }
	type Shape = 'spike' | 'jag' | 'cloud'
	type Bit = { x: number; y: number; r: number; star: boolean }
	type Pop = { key: number; x: number; y: number; s: number; word: string; kind: PopKind; tilt: number; side: number; path: string; pal: Pal; bits: Bit[]; lines: number[] }
	let pops: Pop[] = []
	let n = 0
	function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
	const f = (v: number) => v.toFixed(1)
	/** the outline of a burst in a 120 × 90 box round 0,0 */
	function shapePath(shape: Shape) {
		const pts: [number, number][] = []
		if (shape === 'cloud') {
			// lobes: arcs bulging outward between points on an ellipse
			const k = 9, out: string[] = []
			for (let i = 0; i <= k; i++) { const a = (i / k) * Math.PI * 2 + 0.2; pts.push([Math.cos(a) * 44, Math.sin(a) * 31]) }
			out.push(`M${f(pts[0][0])},${f(pts[0][1])}`)
			for (let i = 1; i <= k; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const r = Math.hypot(x1 - x0, y1 - y0) * (0.55 + Math.random() * 0.12); out.push(`A${f(r)},${f(r)} 0 0 1 ${f(x1)},${f(y1)}`) }
			return out.join('') + 'Z'
		}
		const k = shape === 'spike' ? 14 : 11
		for (let i = 0; i < k * 2; i++) {
			const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2
			const r = i % 2 ? 0.66 + Math.random() * 0.08 : shape === 'jag' ? 0.92 + Math.random() * 0.35 : 0.98 + Math.random() * 0.1
			pts.push([Math.cos(a) * 46 * r, Math.sin(a) * 33 * r])
		}
		return 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z'
	}
	/** screen x / y = the hero's centre, size = its token's width */
	export function play(x: number, y: number, size = 48, kind: PopKind = 'hit') {
		const key = ++n, side = Math.random() < 0.5 ? -1 : 1
		const shape: Shape = kind === 'whiff' ? 'cloud' : kind === 'ko' ? pick<Shape>(['jag', 'spike']) : pick<Shape>(['spike', 'jag', 'cloud'])
		const pal = kind === 'whiff' ? WHIFF : kind === 'ko' ? pick([PALS[2], PALS[1], PALS[0]]) : pick(PALS)
		// little stars (blasts) or smoke puffs (clouds) round the corners
		const bits: Bit[] = [[-0.52, -0.42], [0.55, -0.4], [0.5, 0.42], [-0.5, 0.44]].filter(() => Math.random() < 0.7).map(([bx, by]) => ({ x: bx, y: by, r: 0.07 + Math.random() * 0.05, star: shape !== 'cloud' }))
		const lines = Array.from({ length: 12 }, (_, i) => i * 30 + Math.random() * 14)
		const p: Pop = { key, x, y, s: Math.max(54, Math.min(120, size * (kind === 'ko' ? 2.2 : 1.8))), word: pick(WORDS[kind]), kind, tilt: side * (6 + Math.random() * 8), side, path: shapePath(shape), pal, bits, lines }
		pops = [...pops, p]
		setTimeout(() => (pops = pops.filter((q) => q.key !== key)), 1100)
	}
	const STAR = 'M0,-10 L2.9,-3.1 L9.5,-3.1 L4.2,1.2 L6.2,8.1 L0,4 L-6.2,8.1 L-4.2,1.2 L-9.5,-3.1 L-2.9,-3.1Z'
	const PUFF = 'M-8,4 A6,6 0 0 1 -6,-5 A7,7 0 0 1 6,-6 A6,6 0 0 1 9,4 Z'
</script>

<div class="cp" aria-hidden="true">
	{#each pops as p (p.key)}
		<!-- up and to one side of the hero, so their token stays in sight -->
		<span class="pop {p.kind}" style="left:{p.x + p.side * p.s * 0.2}px;top:{p.y - p.s * 0.4}px;--s:{p.s}px;--t:{p.tilt}deg;--fill:{p.pal.fill};--shade:{p.pal.shade};--word:{p.pal.word};--acc:{p.pal.acc}">
			{#each p.lines as a, j}<i class="ln" class:acc={j % 3 === 0} style="--a:{a}deg"></i>{/each}
			<span class="body">
				<i class="dots"></i>
				<svg viewBox="-58 -43 116 86">
					<path class="edge" d={p.path} />
					<path class="fill" d={p.path} />
					<path class="shd" d={p.path} transform="translate(4 5) scale(.78)" />
					<path class="fill2" d={p.path} transform="scale(.78)" />
					{#each p.bits as b}
						{#if b.star}<path class="star" d={STAR} transform="translate({b.x * 120} {b.y * 104}) scale({b.r * 14})" />
						{:else}<path class="puff" d={PUFF} transform="translate({b.x * 120} {b.y * 104}) scale({b.r * 18})" />{/if}
					{/each}
				</svg>
				<b class:long={p.word.length > 5}>{p.word}</b>
			</span>
		</span>
	{/each}
</div>

<style>
	.cp { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.pop { position: absolute; width: var(--s); height: calc(var(--s) * 0.75); margin: calc(var(--s) * -0.375) 0 0 calc(var(--s) * -0.5); }
	/* the sticker: punch in past full size with a tilt, a quick wobble, then puff away */
	.body { position: absolute; inset: 0; display: grid; place-items: center; animation: cpin 1.05s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes cpin {
		0% { opacity: 0; transform: scale(0.1) rotate(calc(var(--t) * -2)); }
		18% { opacity: 1; transform: scale(1.16) rotate(var(--t)); }
		28% { transform: scale(0.94) rotate(calc(var(--t) * 0.6)); }
		36% { transform: scale(1.03) rotate(var(--t)); }
		78% { opacity: 1; transform: scale(1) rotate(var(--t)); }
		100% { opacity: 0; transform: scale(1.18) rotate(var(--t)) translateY(-8%); }
	}
	.body svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	/* ink outline + a white sticker edge, then the flat fill with a halftone-ish shade offset inside */
	.edge { fill: #fff; stroke: #15101c; stroke-width: 5; stroke-linejoin: round; }
	.fill { fill: var(--fill); stroke: #15101c; stroke-width: 2; stroke-linejoin: round; transform: scale(0.86); }
	.shd { fill: var(--shade); opacity: 0.55; }
	.fill2 { fill: var(--fill); }
	.star { fill: var(--acc); stroke: #15101c; stroke-width: 1.6; stroke-linejoin: round; }
	.puff { fill: #fff; stroke: #15101c; stroke-width: 1.8; stroke-linejoin: round; }
	/* a halftone dot halo behind the sticker */
	.dots { position: absolute; inset: -16% -12%; border-radius: 50%; background: radial-gradient(circle, var(--acc) 32%, transparent 36%) 0 0 / 6px 6px;
		-webkit-mask: radial-gradient(closest-side, transparent 52%, #000 70%, transparent 100%); mask: radial-gradient(closest-side, transparent 52%, #000 70%, transparent 100%); opacity: 0.6; }
	.ko .dots { background-image: radial-gradient(circle, var(--acc) 32%, transparent 36%); opacity: 0.8; }
	/* the word: skewed comic lettering, ink outline, a hard ink drop shadow */
	.body b { position: relative; font-weight: normal; font-size: calc(var(--s) * 0.21); line-height: 1; color: var(--word); letter-spacing: 0.01em; transform: skewX(-10deg) rotate(-4deg);
		-webkit-text-stroke: calc(var(--s) * 0.024) #15101c; paint-order: stroke fill; text-shadow: calc(var(--s) * 0.03) calc(var(--s) * 0.035) 0 #15101c; }
	.body b.long { font-size: calc(var(--s) * 0.165); }
	/* thin burst lines shooting out, every third in the accent colour */
	.ln { position: absolute; left: 50%; top: 50%; width: 2px; height: calc(var(--s) * 0.14); margin-left: -1px; border-radius: 1px; background: #15101c; transform-origin: 50% 0;
		opacity: 0; animation: cpln 0.42s 0.05s ease-out both; }
	.ln.acc { width: 3px; background: var(--acc); }
	@keyframes cpln { 0% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.3)) scaleY(0.3); } 30% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.68)) scaleY(1); } }
	.whiff .ln { display: none; }
	@media (prefers-reduced-motion: reduce) { .cp * { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
