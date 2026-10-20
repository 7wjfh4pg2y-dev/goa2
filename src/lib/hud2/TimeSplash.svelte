<script lang="ts">
	// The reversed turn begins (2026-10-20, the user's ask): once the cards of a turn Emmitt reversed are revealed, his
	// hourglass clock fills the middle of every screen — card-green, the face creeping ANTICLOCKWISE (a clock face reads
	// backwards: that is time going on as normal) — then it stalls, the hourglass turns over, the clock goes magenta and
	// spins CLOCKWISE, faster and faster, before it fades. The drawing is the dash button's (EmmittClock), large.
	// ~4 s; transform / opacity only (two coloured copies cross-fade instead of animating a colour).
	export let phone = false
	let run = 0, on = false
	let timer: ReturnType<typeof setTimeout> | null = null
	const DURATION = 4200
	export function play() {
		on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), DURATION) })
		return DURATION
	}
	const pt = (a: number, r: number) => { const t = ((a - 90) * Math.PI) / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)] }
	const ROM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
	const NUMS = ROM.map((n, i) => { const [x, y] = pt(i * 30, 73); return { n, x, y, a: i * 30 } })
	const TICKS = Array.from({ length: 60 }, (_, i) => { const big = i % 5 === 0; const [x1, y1] = pt(i * 6, 84), [x2, y2] = pt(i * 6, big ? 91 : 88); return { x1, y1, x2, y2, big } })
	const PAL = { g: { c: '#8ff0a4', c2: '#41ae59' }, m: { c: '#ffa0e6', c2: '#d04cb4' } }
</script>

{#snippet face(p: { c: string; c2: string })}
	<svg viewBox="0 0 200 200" aria-hidden="true">
		<circle cx="100" cy="100" r="60" fill="none" stroke={p.c2} stroke-width="2" />
		{#each NUMS as n}<text x={n.x} y={n.y} transform="rotate({n.a} {n.x} {n.y})" text-anchor="middle" dominant-baseline="central" font-size="13" fill={p.c}>{n.n}</text>{/each}
		{#each TICKS as t}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={p.c2} stroke-width={t.big ? 2.2 : 1.2} />{/each}
	</svg>
{/snippet}
{#snippet glass(p: { c: string; c2: string })}
	<svg viewBox="0 0 100 100" aria-hidden="true">
		<rect x="22" y="8" width="56" height="7" rx="3" fill={p.c2} /><rect x="22" y="85" width="56" height="7" rx="3" fill={p.c2} />
		<path d="M28 15 C28 38 46 44 47 50 C46 56 28 62 28 85 L72 85 C72 62 54 56 53 50 C54 44 72 38 72 15 Z" fill="rgba(160,220,255,.08)" stroke={p.c} stroke-width="2.6" stroke-linejoin="round" />
		<path d="M34 24 L66 24 C64 36 54 42 50 47 C46 42 36 36 34 24 Z" fill={p.c} opacity=".85" />
		<path d="M32 83 C34 72 44 68 50 66 C56 68 66 72 68 83 Z" fill={p.c} opacity=".85" />
		<rect x="49" y="47" width="2" height="20" fill={p.c} />
		<line x1="25" y1="15" x2="25" y2="85" stroke={p.c2} stroke-width="2.4" /><line x1="75" y1="15" x2="75" y2="85" stroke={p.c2} stroke-width="2.4" />
	</svg>
{/snippet}

{#if on}
	{#key run}
		<div class="ts" class:ph={phone} aria-live="polite">
			<span class="dim"></span>
			<div class="clock">
				<span class="halo g"></span><span class="halo m"></span>
				<span class="ring"></span>
				<span class="rot"><span class="lay g">{@render face(PAL.g)}</span><span class="lay m">{@render face(PAL.m)}</span></span>
				<span class="disc"></span>
				<span class="hg"><span class="lay g">{@render glass(PAL.g)}</span><span class="lay m">{@render glass(PAL.m)}</span></span>
			</div>
			<div class="cap">
				<b class="c1">The hourglass turns…</b>
				<b class="c2">Time runs backwards</b>
				<small class="c3">This turn the lowest initiative acts first</small>
			</div>
		</div>
	{/key}
{/if}

<style>
	.ts { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; align-content: center; gap: 18px; pointer-events: none; --s: clamp(220px, 34vmin, 340px); animation: tsout 4.2s linear both; }
	.ts.ph { --s: min(62vw, 260px); }
	@keyframes tsout { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.dim { position: absolute; inset: 0; background: radial-gradient(circle at 50% 46%, rgba(4, 10, 18, 0.72), rgba(4, 10, 18, 0.35) 55%, transparent 80%); animation: fadein 0.5s ease-out both; }
	@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
	.clock { position: relative; width: var(--s); height: var(--s); animation: pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: none; } }
	.clock > span { position: absolute; }
	.lay { position: absolute; inset: 0; display: block; }
	.lay :global(svg) { width: 100%; height: 100%; display: block; overflow: visible; }
	/* green until the turn-over, magenta after (cross-faded copies) */
	.lay.m, .halo.m { opacity: 0; animation: tom 0.5s 1.75s ease-out both; }
	.lay.g, .halo.g { animation: tog 0.5s 1.75s ease-in both; }
	@keyframes tom { to { opacity: 1; } }
	@keyframes tog { to { opacity: 0; } }
	/* the face: anticlockwise at a walk → a stall → clockwise, faster and faster */
	.rot { inset: 0; animation: spin 3.9s both; }
	@keyframes spin {
		0% { transform: rotate(0deg); animation-timing-function: linear; }
		36% { transform: rotate(-95deg); animation-timing-function: ease-out; }
		46% { transform: rotate(-112deg); animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6); }
		100% { transform: rotate(640deg); }
	}
	.disc { left: 25%; top: 25%; width: 50%; height: 50%; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 2px rgba(216, 179, 106, 0.55), 0 6px 18px rgba(0, 0, 0, 0.6); }
	.hg { left: 31.5%; top: 31.5%; width: 37%; height: 37%; animation: flip 0.75s 1.5s cubic-bezier(0.5, -0.35, 0.45, 1.35) both; }
	@keyframes flip { from { transform: rotate(0deg); } to { transform: rotate(180deg); } }
	.halo { inset: -6%; border-radius: 50%; }
	.halo.g { background: radial-gradient(circle, transparent 52%, rgba(65, 174, 89, 0.55) 62%, transparent 74%); }
	.halo.m { background: radial-gradient(circle, transparent 52%, rgba(224, 64, 192, 0.6) 62%, transparent 74%); }
	/* the turn-over sends a magenta shock ring out */
	.ring { inset: 18%; border-radius: 50%; border: 3px solid #ffa0e6; opacity: 0; animation: shock 0.9s 1.85s ease-out both; }
	@keyframes shock { 0% { opacity: 0.9; transform: scale(0.6); } 100% { opacity: 0; transform: scale(1.9); } }
	.cap { position: relative; display: grid; justify-items: center; text-align: center; min-height: 64px; }
	.cap b { grid-area: 1 / 1; font-weight: normal; font-size: clamp(22px, 3.4vmin, 34px); letter-spacing: 0.06em; text-transform: uppercase; -webkit-text-stroke: 1px #0a0610; paint-order: stroke fill; text-shadow: 0 2px 0 #000, 0 0 16px currentColor; }
	.c1 { color: #b8f7c6; animation: cap1 1.9s 0.2s ease both; }
	@keyframes cap1 { 0% { opacity: 0; transform: translateY(8px); } 25%, 75% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-6px); } }
	.c2 { color: #ffc4ef; animation: cap2 0.6s 1.95s cubic-bezier(0.2, 1.5, 0.4, 1) both; }
	@keyframes cap2 { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.c3 { grid-area: 2 / 1; margin-top: 4px; font-size: 14px; color: #f2d9ec; text-shadow: 0 1px 3px #000; animation: fadein 0.5s 2.3s ease-out both; }
	.ph .c3 { font-size: 12px; }
	@media (prefers-reduced-motion: reduce) { .ts *, .ts { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
