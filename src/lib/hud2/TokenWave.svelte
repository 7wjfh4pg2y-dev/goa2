<script lang="ts">
	// A wave of light off a hero's token (DEMO on /splash-demo, 2026-10-20 — Takahide's gold swap): three rings in the
	// colour roll out from the token one after another over a bright flash. Screen x / y = the token's centre, size = its
	// width. Fixed layer; transform / opacity only.
	type W = { key: number; x: number; y: number; s: number; c: string }
	let waves: W[] = []
	export function play(x: number, y: number, size = 48, color = '#ffd25e') {
		const w = { key: Date.now() + Math.random(), x, y, s: size, c: color }
		waves = [...waves, w]
		setTimeout(() => (waves = waves.filter((v) => v !== w)), 1800)
	}
</script>

<div class="tw" aria-hidden="true">
	{#each waves as w (w.key)}
		<span class="w" style="left:{w.x}px;top:{w.y}px;--s:{w.s}px;--c:{w.c}">
			<i class="flash"></i>{#each [0, 1, 2] as k}<i class="r" style="animation-delay:{k * 0.22}s"></i>{/each}
		</span>
	{/each}
</div>

<style>
	.tw { position: fixed; inset: 0; z-index: 58; pointer-events: none; }
	.w { position: absolute; width: 0; height: 0; }
	.w i { position: absolute; left: calc(var(--s) * -0.5); top: calc(var(--s) * -0.5); width: var(--s); height: var(--s); border-radius: 50%; }
	.flash { background: radial-gradient(circle, rgba(255, 250, 225, 0.95) 0, color-mix(in srgb, var(--c) 70%, transparent) 40%, transparent 70%); opacity: 0; animation: twf 0.7s ease-out both; }
	@keyframes twf { 0% { opacity: 0; transform: scale(0.6); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.5); } }
	.r { border: 3px solid var(--c); box-shadow: 0 0 10px var(--c), inset 0 0 8px color-mix(in srgb, var(--c) 60%, transparent); opacity: 0; animation: twr 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
	@keyframes twr { 0% { opacity: 0.95; transform: scale(0.9); } 100% { opacity: 0; transform: scale(3.2); } }
</style>
