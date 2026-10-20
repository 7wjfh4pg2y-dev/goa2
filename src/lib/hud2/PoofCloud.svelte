<script lang="ts">
	// Razzle's doubles appear / vanish (DEMO on /splash-demo, 2026-10-20 — the user's idea): a cartoon POOF — a burst of
	// round, ink-outlined smoke puffs (white with a lilac / cyan shade) that billow out over the token, hold it covered
	// for a beat, then drift off and shrink away, with a few twinkling stars and a little 'POOF!'. The token is swapped
	// while the cloud covers it (`coverAt` ms after play), so it pops in / out of nowhere. ~0.95 s; transform / opacity only.
	type Puff = { x: number; y: number; r: number; d: number; tint: string }
	type Cloud = { key: number; x: number; y: number; s: number; puffs: Puff[]; out: boolean }
	let clouds: Cloud[] = []
	let n = 0
	const TINTS = ['#c9b6ff', '#9ff0ff', '#ffb6e6']
	/** ms after `play` when the cloud fully covers the token (swap it then) */
	export const coverAt = 170
	/** screen x / y = the token's centre, size = its width; out = vanishing (else appearing) */
	export function play(x: number, y: number, size = 48, out = false) {
		const key = ++n
		// a ring of puffs round a fat middle one, jittered, each with its own shade and a little stagger
		const puffs: Puff[] = [{ x: 0, y: 0, r: 0.42, d: 0, tint: TINTS[0] }]
		const k = 9
		for (let i = 0; i < k; i++) {
			const a = (i / k) * Math.PI * 2 + Math.random() * 0.4, rr = 0.36 + Math.random() * 0.12
			puffs.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.85, r: 0.22 + Math.random() * 0.1, d: Math.random() * 60, tint: TINTS[i % TINTS.length] })
		}
		clouds = [...clouds, { key, x, y, s: Math.max(48, Math.min(120, size * 1.9)), puffs, out }]
		setTimeout(() => (clouds = clouds.filter((c) => c.key !== key)), 1100)
	}
	const STARS = [[-0.55, -0.45], [0.6, -0.35], [0.5, 0.5], [-0.5, 0.45]]
</script>

<div class="pf" aria-hidden="true">
	{#each clouds as c (c.key)}
		<span class="cloud" class:out={c.out} style="left:{c.x}px;top:{c.y}px;--s:{c.s}px">
			{#each c.puffs as p}
				<!-- outer span drifts outward, inner one billows and shrinks: two transforms, two elements -->
				<span class="pw" style="--x:{p.x};--y:{p.y};--d:{p.d}ms"><i style="--r:{p.r};--tint:{p.tint}"></i></span>
			{/each}
			{#each STARS as [sx, sy], j}<b class="st" style="--x:{sx};--y:{sy};--d:{120 + j * 60}ms">✦</b>{/each}
			<em>POOF!</em>
		</span>
	{/each}
</div>

<style>
	.pf { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.cloud { position: absolute; width: 0; height: 0; }
	.pw { position: absolute; left: 0; top: 0; width: 0; height: 0; animation: pfdrift 0.95s var(--d) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
	@keyframes pfdrift { 0% { transform: translate(calc(var(--x) * var(--s) * 0.3), calc(var(--y) * var(--s) * 0.3)); } 30% { transform: translate(calc(var(--x) * var(--s)), calc(var(--y) * var(--s))); } 100% { transform: translate(calc(var(--x) * var(--s) * 1.6), calc(var(--y) * var(--s) * 1.6 - var(--s) * 0.25)); } }
	.pw i { position: absolute; width: calc(var(--s) * var(--r) * 2); height: calc(var(--s) * var(--r) * 2); left: calc(var(--s) * var(--r) * -1); top: calc(var(--s) * var(--r) * -1); border-radius: 50%;
		background: radial-gradient(circle at 36% 32%, #ffffff 0 38%, color-mix(in srgb, var(--tint) 55%, #fff) 70%, var(--tint) 100%);
		box-shadow: 0 0 0 2.5px #2a1838; animation: pfpuff 0.95s var(--d) cubic-bezier(0.3, 1.5, 0.5, 1) both; }
	@keyframes pfpuff { 0% { opacity: 0; transform: scale(0.15); } 14% { opacity: 1; } 30% { transform: scale(1.12); } 55% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.35); } }
	/* twinkling stars thrown off the cloud */
	.st { position: absolute; left: 0; top: 0; font-size: calc(var(--s) * 0.2); line-height: 1; margin: calc(var(--s) * -0.1) 0 0 calc(var(--s) * -0.07); color: #fff36b; -webkit-text-stroke: 1.5px #2a1838; paint-order: stroke fill;
		opacity: 0; animation: pfstar 0.6s var(--d) ease-out both; }
	.st:nth-of-type(even) { color: #ff6fd2; }
	@keyframes pfstar { 0% { opacity: 0; transform: translate(0, 0) scale(0.2) rotate(0deg); } 40% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(var(--x) * var(--s) * 1.1), calc(var(--y) * var(--s) * 1.1)) scale(1.2) rotate(120deg); } }
	/* the little POOF! riding the cloud */
	.cloud em { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); font-style: normal; font-size: calc(var(--s) * 0.24); color: #ff3bb4; letter-spacing: 0.02em; white-space: nowrap;
		-webkit-text-stroke: calc(var(--s) * 0.02) #2a1838; paint-order: stroke fill; text-shadow: 2px 2px 0 #2a1838; animation: pfword 0.85s 0.08s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.out em { color: #2fd6e6; }
	@keyframes pfword { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(-12deg); } 25% { opacity: 1; transform: translate(-50%, -60%) scale(1.15) rotate(-6deg); } 70% { opacity: 1; transform: translate(-50%, -85%) scale(1) rotate(-6deg); } 100% { opacity: 0; transform: translate(-50%, -115%) scale(0.9) rotate(-6deg); } }
	@media (prefers-reduced-motion: reduce) { .pf * { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
