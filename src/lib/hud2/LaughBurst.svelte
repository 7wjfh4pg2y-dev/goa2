<script lang="ts">
	// NebKher's laugh as comic onomatopoeia (DEMO, 2026-10-18 — /splash-demo only for now): "HA!", "HA HA!" and a big
	// "MWAHAHA!" burst out of his token one after another, each a spiky comic balloon that pops in, hangs, then drifts
	// up and fades. Placed at a screen point (x, y = the token's centre, px); `size` = the token's size.
	// Each balloon = an outer span that drifts (transform + opacity) and an inner one that pops (transform): never two
	// animations of one property on one element.
	export let x = 0
	export let y = 0
	export let size = 48
	export let ult = false
	let run = 0, on = false
	let timer: ReturnType<typeof setTimeout> | null = null
	export function play() {
		on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), 2900) })
		return 2900
	}
	// a spiky burst: 14 points, the spikes uneven so it reads hand-drawn
	const burst = (n: number, seed: number) => Array.from({ length: n * 2 }, (_, i) => {
		const a = (Math.PI * i) / n - Math.PI / 2, j = ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1
		const r = i % 2 ? 0.74 + j * 0.05 : 0.92 + j * 0.08
		return `${(50 + 50 * r * Math.cos(a)).toFixed(1)},${(50 + 50 * r * Math.sin(a)).toFixed(1)}`
	}).join(' ')
	const BUBBLES = [
		{ t: 'HA!', dx: -1.25, dy: -0.5, s: 0.9, w: 1.7, r: -14, d: 0, p: burst(7, 1) },
		{ t: 'HA HA!', dx: 1.45, dy: -0.7, s: 1, w: 2.5, r: 10, d: 0.32, p: burst(9, 2) },
		{ t: 'MWAHAHA!', dx: 0, dy: -1.75, s: 1.25, w: 3.3, r: -4, d: 0.7, p: burst(11, 3) },
	]
</script>

{#if on}
	{#key run}
		<span class="lb" class:ult style="left:{x}px; top:{y}px; --u:{size}px" aria-hidden="true">
			<span class="ring"></span>
			{#each BUBBLES as b (b.t)}
				<span class="drift" style="--dx:{b.dx}; --dy:{b.dy}; --d:{b.d}s">
					<span class="pop" style="--s:{b.s}; --w:{b.w}; --r:{b.r}deg; --d:{b.d}s">
						<svg viewBox="-12 -2 124 104" preserveAspectRatio="none"><polygon points={b.p} class="sh" transform="translate(4 5)" /><polygon points={b.p} class="bg" /></svg>
						<b>{b.t}</b>
					</span>
				</span>
			{/each}
		</span>
	{/key}
{/if}

<style>
	.lb { position: fixed; width: 0; height: 0; z-index: 58; pointer-events: none; }
	/* a shock ring off the token as the laugh starts */
	.ring { position: absolute; left: calc(var(--u) * -0.6); top: calc(var(--u) * -0.6); width: calc(var(--u) * 1.2); height: calc(var(--u) * 1.2); border-radius: 50%;
		border: 3px solid #c9e04a; opacity: 0; animation: lbring 0.7s ease-out both; }
	.ult .ring { border-color: #c58cff; }
	@keyframes lbring { 0% { opacity: 0.9; transform: scale(0.6); } 100% { opacity: 0; transform: scale(2.2); } }
	.drift { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0;
		transform: translate(calc(var(--dx) * var(--u)), calc(var(--dy) * var(--u))); animation: lbdrift 2.9s var(--d) ease-out both; }
	@keyframes lbdrift {
		0% { opacity: 0; transform: translate(0, 0); }
		6% { opacity: 1; }
		16% { transform: translate(calc(var(--dx) * var(--u)), calc(var(--dy) * var(--u))); }
		75% { opacity: 1; transform: translate(calc(var(--dx) * var(--u)), calc(var(--dy) * var(--u) - var(--u) * 0.25)); }
		100% { opacity: 0; transform: translate(calc(var(--dx) * var(--u)), calc(var(--dy) * var(--u) - var(--u) * 0.6)); }
	}
	.pop { position: absolute; left: calc(var(--u) * -0.5 * var(--w) * var(--s)); top: calc(var(--u) * -0.7 * var(--s)); width: calc(var(--u) * var(--w) * var(--s)); height: calc(var(--u) * 1.4 * var(--s));
		display: grid; place-items: center; animation: lbpop 0.5s var(--d) cubic-bezier(0.2, 1.8, 0.4, 1) both; }
	@keyframes lbpop { 0% { transform: scale(0) rotate(calc(var(--r) - 30deg)); } 100% { transform: scale(1) rotate(var(--r)); } }
	.pop svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.bg { fill: #e7f56b; stroke: #0b1a10; stroke-width: 3.2; stroke-linejoin: round; }
	.sh { fill: #1f9c8c; }
	.ult .bg { fill: #e9d3ff; }
	.ult .sh { fill: #6d4a9c; }
	.pop b { position: relative; font-weight: normal; font-size: calc(var(--u) * 0.34 * var(--s)); line-height: 1; letter-spacing: 0.02em; color: #b8231b; white-space: nowrap;
		-webkit-text-stroke: calc(var(--u) * 0.035) #0b1a10; paint-order: stroke fill; transform: rotate(-3deg); }
	.ult .pop b { color: #5a1d9c; }
	@media (prefers-reduced-motion: reduce) { .lb * { animation-duration: 0.01s !important; } }
</style>
