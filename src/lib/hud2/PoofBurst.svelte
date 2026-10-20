<script lang="ts">
	// Razzle's doubles appear / vanish (DEMO on /splash-demo, 2026-10-20 — the user's reference): a comic POOF! cloud —
	// a white scalloped cloud with a thick ink outline (heavier bottom-right), motion arcs round it and POOF! in red —
	// pops over the token FIRST; the token appears / is taken off while the cloud covers it (`coverAt` ms after play),
	// then the cloud lingers a beat and puffs away. ~1 s; transform / opacity only, three animated spans per burst.
	type Burst = { key: number; x: number; y: number; w: number; tilt: number }
	let bursts: Burst[] = []
	let n = 0
	/** ms after `play` when the cloud fully covers the token (show / hide it then) */
	export const coverAt = 150
	/** screen x / y = the token's centre, size = its width */
	export function play(x: number, y: number, size = 48) {
		const key = ++n
		bursts = [...bursts, { key, x, y, w: Math.max(110, Math.min(190, size * 2.6)), tilt: -9 + Math.random() * 5 }]
		setTimeout(() => (bursts = bursts.filter((b) => b.key !== key)), 1150)
	}
	// the cloud = a union of circles: ink circles (r + 6) under white ones, plus an ink copy nudged down-right as its shadow
	const PUFFS: [number, number, number][] = [
		[58, 46, 25], [90, 32, 30], [128, 36, 28], [158, 54, 23], [34, 72, 22], [172, 82, 20],
		[52, 98, 22], [86, 106, 24], [122, 104, 24], [154, 98, 21], [100, 70, 46]
	]
	// motion arcs outside the cloud: [cx, cy, r, from°, to°] (0° = right, clockwise, svg y down)
	const ARCS: [number, number, number, number, number][] = [
		[90, 32, 46, 228, 292], [96, 30, 58, 240, 268], [150, 46, 44, 290, 330],
		[24, 74, 38, 150, 205], [16, 78, 50, 162, 192], [182, 88, 34, 345, 395],
		[100, 112, 44, 62, 110], [104, 114, 56, 76, 100]
	]
	const rad = (d: number) => (d * Math.PI) / 180
	const arc = ([cx, cy, r, a, b]: [number, number, number, number, number]) =>
		`M${(cx + r * Math.cos(rad(a))).toFixed(1)} ${(cy + r * Math.sin(rad(a))).toFixed(1)} A${r} ${r} 0 0 1 ${(cx + r * Math.cos(rad(b))).toFixed(1)} ${(cy + r * Math.sin(rad(b))).toFixed(1)}`
</script>

<div class="pb" aria-hidden="true">
	{#each bursts as b (b.key)}
		<span class="at" style="left:{b.x}px;top:{b.y}px;--w:{b.w}px;--tilt:{b.tilt}deg">
			<span class="ar">
				<svg viewBox="-34 -34 268 206"><g fill="none" stroke="#141014" stroke-width="5" stroke-linecap="round">{#each ARCS as a}<path d={arc(a)} />{/each}</g></svg>
			</span>
			<span class="cl">
				<svg viewBox="-34 -34 268 206">
					<g fill="#141014" transform="translate(5 6)">{#each PUFFS as [x, y, r]}<circle cx={x} cy={y} r={r + 6} />{/each}</g>
					<g fill="#141014">{#each PUFFS as [x, y, r]}<circle cx={x} cy={y} r={r + 6} />{/each}</g>
					<g fill="#fff">{#each PUFFS as [x, y, r]}<circle cx={x} cy={y} r={r} />{/each}</g>
				</svg>
			</span>
			<span class="wd"><b>POOF!</b></span>
		</span>
	{/each}
</div>

<style>
	.pb { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.at { position: absolute; width: 0; height: 0; }
	/* the svg box is 268 × 206 units; the cloud itself ~200 of them wide → the box is 1.34 × --w */
	.ar, .cl { position: absolute; width: calc(var(--w) * 1.34); height: calc(var(--w) * 1.03); left: calc(var(--w) * -0.67); top: calc(var(--w) * -0.52); }
	.ar svg, .cl svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.cl { animation: pbcloud 1s cubic-bezier(0.3, 1.4, 0.5, 1) both; }
	@keyframes pbcloud { 0% { opacity: 0; transform: scale(0.2) rotate(-6deg); } 12% { opacity: 1; transform: scale(1.12) rotate(2deg); } 22% { transform: scale(0.96) rotate(-1deg); } 30% { transform: scale(1) rotate(0deg); } 72% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.12) translateY(-6%); } }
	.ar { animation: pbarcs 1s ease-out both; }
	@keyframes pbarcs { 0%, 8% { opacity: 0; transform: scale(0.8); } 20% { opacity: 1; transform: scale(1); } 34% { transform: scale(1.04); } 46% { transform: scale(1); } 60% { opacity: 1; } 78% { opacity: 0; transform: scale(1.14); } 100% { opacity: 0; } }
	.wd { position: absolute; left: 0; top: 0; transform: translate(-50%, -54%) rotate(var(--tilt)); }
	.wd b { display: block; font-weight: normal; font-size: calc(var(--w) * 0.225); line-height: 1; letter-spacing: 0.02em; color: #d3261c; white-space: nowrap;
		animation: pbword 1s 0.05s cubic-bezier(0.3, 1.6, 0.5, 1) both; }
	@keyframes pbword { 0% { opacity: 0; transform: scale(2.2); } 14% { opacity: 1; transform: scale(0.9); } 24% { transform: scale(1.04); } 32% { transform: scale(1); } 70% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.1); } }
	@media (prefers-reduced-motion: reduce) { .pb * { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
