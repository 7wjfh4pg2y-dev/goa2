<script lang="ts">
	// Ignatia's Equilibrium switches on (in games since 2026-10-20, Effects → Swirl — kept quiet on purpose): her ten tomoe commas
	// swirl in from a wide circle round her token, fire on the left and water on the right, settle into a ring hugging
	// the token and fade. No dimming, no words. ~1.8 s; transform / opacity only (each comma its own small svg).
	import { TOMOE, TOMOE_BODY, TOMOE_INK, TOMOE_MID, TOMOE_KEY } from './tomoe'
	type S = { key: number; x: number; y: number; s: number }
	let swirls: S[] = []
	export function play(x: number, y: number, size = 48) {
		const w = { key: Date.now() + Math.random(), x, y, s: size }
		swirls = [...swirls, w]
		setTimeout(() => (swirls = swirls.filter((v) => v !== w)), 1900)
	}
</script>

<div class="eqs" aria-hidden="true">
	{#each swirls as w (w.key)}
		<span class="sw" style="left:{w.x}px;top:{w.y}px;--s:{w.s * 2.3}px">
			<span class="spin">
				{#each TOMOE as c, k (k)}{@const e = c.fire ? 'fire' : 'water'}
					<svg viewBox="0 0 200 200" style="animation-delay:{k * 0.03}s">
						<path d={c.d} fill="none" stroke={TOMOE_KEY} stroke-width="5" stroke-linejoin="round" />
						<path d={c.d} fill={TOMOE_BODY[e]} stroke={TOMOE_INK[e]} stroke-width="2.4" stroke-linejoin="round" />
						<circle cx={c.head[0]} cy={c.head[1]} r={c.r * 0.55} fill={TOMOE_MID[e]} />
					</svg>
				{/each}
			</span>
			<i class="glow"></i>
		</span>
	{/each}
</div>

<style>
	.eqs { position: fixed; inset: 0; z-index: 58; pointer-events: none; }
	.sw { position: absolute; width: 0; height: 0; animation: eqout 1.8s linear both; }
	@keyframes eqout { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }
	.spin { position: absolute; left: calc(var(--s) * -0.5); top: calc(var(--s) * -0.5); width: var(--s); height: var(--s); animation: eqin 1.3s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
	@keyframes eqin { from { transform: scale(2.6) rotate(-220deg); opacity: 0; } 30% { opacity: 0.9; } to { transform: scale(1) rotate(0deg); opacity: 0.9; } }
	.spin svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.glow { position: absolute; left: calc(var(--s) * -0.5); top: calc(var(--s) * -0.5); width: var(--s); height: var(--s); border-radius: 50%;
		background: radial-gradient(circle, transparent 42%, rgba(239, 125, 34, 0.35) 55%, transparent 70%), radial-gradient(circle at 70% 50%, rgba(47, 127, 230, 0.3), transparent 60%);
		opacity: 0; animation: eqglow 0.8s 1s ease-out both; }
	@keyframes eqglow { 0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 0; } }
</style>
