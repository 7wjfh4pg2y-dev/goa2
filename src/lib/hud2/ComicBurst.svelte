<script lang="ts">
	// Razzle's comic bursts (DEMO on /splash-demo, 2026-10-20 — the user's picks: one shape, its own halftone dots,
	// the word): `play(moment, x, y, size)` pops one of that moment's bursts (never the same twice running) at the
	// upper right of a token — screen x / y = its centre, size = its width — holds it, then pops it away. Transform /
	// opacity only, on one span per burst; the art is a small static svg (comic.ts).
	import { onMount } from 'svelte'
	import { COMICS, COMIC_TIMING, pickComic, type Comic, type ComicMoment } from './comic'
	type Pop = { key: number; x: number; y: number; w: number; ms: number; c: Comic }
	let pops: Pop[] = []
	let n = 0
	const last: Partial<Record<ComicMoment, number>> = {}
	export function play(moment: ComicMoment, x: number, y: number, size = 48) {
		const i = pickComic(moment, last[moment] ?? -1)
		last[moment] = i
		const { scale, ms } = COMIC_TIMING[moment]
		const w = Math.max(96, Math.min(260, size * scale))
		const key = ++n
		// centred up and to the right of the token, so the token itself stays readable
		pops = [...pops, { key, x: x + size * 0.55 + w * 0.12, y: y - size * 0.45 - w * 0.2, w, ms, c: COMICS[moment][i] }]
		setTimeout(() => (pops = pops.filter((p) => p.key !== key)), ms + 60)
	}
	const EXT = [6, 5, 4, 3, 2, 1]
	// fetch the comic face up front, so the first burst never shows blank letters while it loads
	onMount(() => { document.fonts?.load("40px 'Bangers'").catch(() => {}) })
</script>

<div class="cbx" aria-hidden="true">
	{#each pops as p (p.key)}
		{@const id = `cb${p.key}`}
		<span class="at" style="left:{p.x}px;top:{p.y}px;--w:{p.w}px;--ms:{p.ms}ms">
			<span class="pop">
				<svg viewBox="0 0 400 300">
					<defs>
						<pattern id="{id}-d" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><circle cx="3.5" cy="3.5" r="2" fill={p.c.dot} /></pattern>
						<radialGradient id="{id}-rg"><stop offset="0.3" stop-color="#000" /><stop offset="1" stop-color="#fff" /></radialGradient>
						<mask id="{id}-m"><rect width="400" height="300" fill="url(#{id}-rg)" /></mask>
						<clipPath id="{id}-c">
							{#each p.c.polys as pts}<polygon points={pts} />{/each}
							{#each p.c.paths as d}<path {d} />{/each}
							{#each p.c.ells as e}<ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} />{/each}
						</clipPath>
						<linearGradient id="{id}-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stop-color={p.c.top} /><stop offset="0.95" stop-color={p.c.bot} /></linearGradient>
					</defs>
					<!-- the shape: drop shadow, ink outline, fill, then its halftone dots heavier towards the rim -->
					{#each [{ tf: 'translate(7 9)', fill: '#141014', sw: 10 }, { tf: '', fill: '#141014', sw: 10 }, { tf: '', fill: p.c.fill, sw: 0 }] as L}
						<g transform={L.tf || undefined} fill={L.fill} stroke={L.sw ? '#141014' : 'none'} stroke-width={L.sw} stroke-linejoin="miter" stroke-miterlimit="8">
							{#each p.c.polys as pts}<polygon points={pts} />{/each}
							{#each p.c.paths as d}<path {d} />{/each}
							{#each p.c.ells as e}<ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} />{/each}
						</g>
					{/each}
					<g clip-path="url(#{id}-c)"><rect width="400" height="300" fill="url(#{id}-d)" mask="url(#{id}-m)" opacity="0.85" /></g>
					<!-- the word: drop shadow, 3D extrusion, gradient face with an ink outline; each letter bounces and grows -->
					<g transform={p.c.tf} text-anchor="middle" class="word">
						{#each p.c.lines as l}
							<text y={l.y} transform="translate(5 7)" font-size={l.size} textLength={l.len} lengthAdjust="spacingAndGlyphs" fill="#141014" stroke="#141014" stroke-width="13" stroke-linejoin="round">{#each l.chars as c}<tspan font-size={c.s} dy={c.dy} rotate={c.r}>{c.t}</tspan>{/each}</text>
							{#each EXT as k}
								<text y={l.y} transform="translate({k * 1.15} {k * 1.35})" font-size={l.size} textLength={l.len} lengthAdjust="spacingAndGlyphs" fill={p.c.ext} stroke="#141014" stroke-width="7" stroke-linejoin="round" paint-order="stroke">{#each l.chars as c}<tspan font-size={c.s} dy={c.dy} rotate={c.r}>{c.t}</tspan>{/each}</text>
							{/each}
							<text y={l.y} font-size={l.size} textLength={l.len} lengthAdjust="spacingAndGlyphs" fill="url(#{id}-t)" stroke="#141014" stroke-width="7" stroke-linejoin="round" paint-order="stroke">{#each l.chars as c}<tspan font-size={c.s} dy={c.dy} rotate={c.r}>{c.t}</tspan>{/each}</text>
							<text y={l.y} transform="translate(-1.3 -1.7)" font-size={l.size} textLength={l.len} lengthAdjust="spacingAndGlyphs" fill="none" stroke={p.c.shine} stroke-width="1.5" opacity="0.6">{#each l.chars as c}<tspan font-size={c.s} dy={c.dy} rotate={c.r}>{c.t}</tspan>{/each}</text>
						{/each}
					</g>
				</svg>
			</span>
		</span>
	{/each}
</div>

<style>
	.cbx { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.at { position: absolute; width: 0; height: 0; }
	.pop { position: absolute; width: var(--w); height: calc(var(--w) * 0.75); left: calc(var(--w) * -0.5); top: calc(var(--w) * -0.375);
		animation: cbpop var(--ms) cubic-bezier(0.3, 1.4, 0.5, 1) both; transform-origin: 30% 70%; }
	.pop svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.word { font-family: 'Bangers', Impact, sans-serif; }
	/* slam in with a twist, settle, hold, then pop away */
	@keyframes cbpop {
		0% { opacity: 0; transform: scale(0.15) rotate(-14deg); }
		10% { opacity: 1; transform: scale(1.18) rotate(4deg); }
		18% { transform: scale(0.93) rotate(-1deg); }
		25% { transform: scale(1.03) rotate(0deg); }
		32% { transform: scale(1); }
		80% { opacity: 1; transform: scale(1); }
		100% { opacity: 0; transform: scale(1.22) translateY(-6%); }
	}
	@media (prefers-reduced-motion: reduce) { .pop { animation-duration: 0.01s; } }
</style>
