<script lang="ts">
	// Chaos Incarnate (DEMO on /splash-demo, 2026-10-20): Ignatia flips the tie-breaker — a big coin spins in the middle
	// of the screen, flinging fire and water commas out as it turns, then lands on its new face with a ring of light:
	// 'Chaos Incarnate · The coin turns to the Titans'. ~2.6 s; transform / opacity (the face swaps at each edge-on).
	import { TOMOE, TOMOE_BODY, TOMOE_INK, TOMOE_MID } from './tomoe'
	import { teamName } from '$lib/teams'
	export let phone = false
	export let art: (t: 'orange' | 'blue') => string = () => ''
	let on = false, run = 0, face: 'orange' | 'blue' = 'orange', to: 'orange' | 'blue' = 'blue'
	let timers: ReturnType<typeof setTimeout>[] = []
	/** flip to `t` (the side the coin lands on) */
	export function play(t: 'orange' | 'blue') {
		timers.forEach(clearTimeout); timers = []
		to = t; face = t === 'blue' ? 'orange' : 'blue'; on = false; run++
		requestAnimationFrame(() => {
			on = true
			// 7 half-turns, each 140 ms: the face swaps at every edge-on moment and ends on `to`
			for (let k = 1; k <= 7; k++) timers.push(setTimeout(() => (face = face === 'orange' ? 'blue' : 'orange'), 300 + k * 140 - 70))
			timers.push(setTimeout(() => (face = to), 300 + 7 * 140))
			timers.push(setTimeout(() => (on = false), 2600))
		})
	}
	const FLING = Array.from({ length: 12 }, (_, i) => ({ a: i * 30 + 15, fire: i % 2 === 0, d: 0.35 + (i % 6) * 0.12 }))
</script>

{#if on}
	{#key run}
		<div class="cf" class:ph={phone} aria-live="polite">
			<span class="stage">
				{#each FLING as f, i (i)}{@const e = f.fire ? 'fire' : 'water'}{@const c = TOMOE[i % TOMOE.length]}
					<span class="fl" style="--a:{f.a}deg;animation-delay:{f.d}s"><svg viewBox="0 0 200 200"><g transform="translate(100 100) scale(2.6) translate({-c.head[0]} {-c.head[1]})"><path d={c.d} fill={TOMOE_BODY[e]} stroke={TOMOE_INK[e]} stroke-width="2.4" /><circle cx={c.head[0]} cy={c.head[1]} r={c.r * 0.55} fill={TOMOE_MID[e]} /></g></svg></span>
				{/each}
				<i class="ring"></i>
				<span class="coin"><img src={art(face)} alt="" /></span>
			</span>
			<b class="title">Chaos Incarnate</b>
			<small class="sub t-{to}">The coin turns to the {teamName(to)}</small>
		</div>
	{/key}
{/if}

<style>
	.cf { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; align-content: center; gap: 10px; pointer-events: none; animation: cfout 2.6s linear both; --s: clamp(150px, 22vmin, 220px); }
	@keyframes cfout { 0%, 84% { opacity: 1; } 100% { opacity: 0; } }
	.stage { position: relative; width: var(--s); height: var(--s); animation: cfpop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes cfpop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }
	/* 7 flat half-turns: scaleX 1 → 0 → 1, then a settle */
	.coin { position: absolute; inset: 0; display: grid; animation: cfspin 0.98s 0.3s linear both, cfland 0.4s 1.28s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.coin img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.7)); }
	@keyframes cfspin { 0%, 14.3%, 28.6%, 42.9%, 57.1%, 71.4%, 85.7%, 100% { transform: scaleX(1); } 7.1%, 21.4%, 35.7%, 50%, 64.3%, 78.6%, 92.9% { transform: scaleX(0.04); } }
	@keyframes cfland { from { scale: 1.18; } to { scale: 1; } }
	.ring { position: absolute; inset: 4%; border-radius: 50%; border: 3px solid #fff1c8; box-shadow: 0 0 18px rgba(255, 230, 160, 0.8); opacity: 0; animation: cfring 0.8s 1.3s ease-out both; }
	@keyframes cfring { 0% { opacity: 1; transform: scale(0.9); } 100% { opacity: 0; transform: scale(1.9); } }
	/* a comma flung off the spinning coin: out along its angle, tumbling, fading */
	.fl { position: absolute; left: 50%; top: 50%; width: calc(var(--s) * 0.34); height: calc(var(--s) * 0.34); margin: calc(var(--s) * -0.17); opacity: 0; animation: cffling 0.95s ease-out both; }
	.fl svg { width: 100%; height: 100%; overflow: visible; display: block; }
	@keyframes cffling { 0% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * -0.2)) scale(0.5); } 15% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * -1.25)) rotate(200deg) scale(1.1); } }
	.title { font-weight: normal; font-size: clamp(26px, 4vmin, 40px); letter-spacing: 0.08em; text-transform: uppercase; color: #fff4e0; -webkit-text-stroke: 1px #120a04; paint-order: stroke fill; text-shadow: 0 2px 0 #000, 0 0 16px rgba(239, 125, 34, 0.6), 0 0 22px rgba(47, 127, 230, 0.5); animation: cfslam 0.5s 1.3s cubic-bezier(0.2, 1.5, 0.4, 1) both; }
	@keyframes cfslam { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: none; } }
	.sub { font-size: 15px; text-shadow: 0 1px 3px #000; opacity: 0; animation: cffade 0.4s 1.6s ease-out both; }
	.sub.t-orange { color: #ffb878; } .sub.t-blue { color: #9ccbff; }
	@keyframes cffade { to { opacity: 1; } }
</style>
