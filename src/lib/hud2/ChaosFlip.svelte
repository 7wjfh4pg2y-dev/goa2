<script lang="ts">
	// Chaos Incarnate (DEMO on /splash-demo, 2026-10-20; the user wanted it far more pronounced — energy FUSION, not
	// sparkles): two plasma cores, fire and water, spiral in round the middle of the screen trailing light, collide in a
	// white-violet fusion flash (shockwaves, a burst of streaks, lightning), the tie-breaker coin spins seven half-turns
	// inside a turning plasma corona, then lands on its new face with a blast in that team's colour:
	// 'Chaos Incarnate · The coin turns to the Titans'. ~3 s; transform / opacity only (the face swaps at each edge-on).
	import { teamName } from '$lib/teams'
	export let phone = false
	export let art: (t: 'orange' | 'blue') => string = () => ''
	const DUR = 3000, SPIN0 = 800, HALF = 140
	let on = false, run = 0, face: 'orange' | 'blue' = 'orange', to: 'orange' | 'blue' = 'blue'
	let timers: ReturnType<typeof setTimeout>[] = []
	/** flip to `t` (the side the coin lands on) */
	export function play(t: 'orange' | 'blue') {
		timers.forEach(clearTimeout); timers = []
		to = t; face = t === 'blue' ? 'orange' : 'blue'; on = false; run++
		requestAnimationFrame(() => {
			on = true
			// 7 half-turns: the face swaps at every edge-on moment and ends on `to`
			for (let k = 1; k <= 7; k++) timers.push(setTimeout(() => (face = face === 'orange' ? 'blue' : 'orange'), SPIN0 + k * HALF - HALF / 2))
			timers.push(setTimeout(() => (face = to), SPIN0 + 7 * HALF))
			timers.push(setTimeout(() => (on = false), DUR))
		})
	}
	const TRAIL = [0, 1, 2, 3, 4, 5]
	// the fusion's streaks: long rays flung out, fire and water alternating
	const STREAKS = Array.from({ length: 18 }, (_, i) => ({ a: i * 20 + (i % 2 ? 6 : 0), fire: i % 2 === 0, l: 0.7 + ((i * 7) % 5) * 0.12 }))
	// lightning round the corona: jagged bolts at a few angles
	const BOLT = 'M0 -38 L6 -52 L-3 -60 L5 -74 L-2 -86 L4 -100'
	const BOLTS = [20, 95, 160, 230, 300]
</script>

{#if on}
	{#key run}
		<div class="cf" class:ph={phone} aria-live="polite" style="--land:{to === 'blue' ? '#5aa8ff' : '#ff8a2a'};--land2:{to === 'blue' ? '#cfe6ff' : '#ffe0b8'}">
			<span class="stage">
				<!-- two plasma cores spiralling in -->
				{#each ['fire', 'water'] as e, side}
					<span class="orbit" style="--o:{side * 180}deg">
						{#each TRAIL as k}<span class="arm" style="--k:{k}"><i class="core {e}"></i></span>{/each}
					</span>
				{/each}
				<!-- fusion -->
				<i class="flash"></i>
				<i class="wave w1"></i><i class="wave w2"></i><i class="wave w3"></i>
				{#each STREAKS as s}<span class="streak" style="--a:{s.a}deg;--l:{s.l}"><i class:fire={s.fire}></i></span>{/each}
				<!-- the corona the coin spins in -->
				<span class="corona"><i class="rays"></i><i class="rays r2"></i></span>
				<svg class="bolts" viewBox="-110 -110 220 220">{#each BOLTS as a, j}<path d={BOLT} transform="rotate({a})" class="bolt b{j % 3}" />{/each}</svg>
				<span class="coin"><img src={art(face)} alt="" /></span>
				<!-- landing blast in the new team's colour -->
				<i class="land l1"></i><i class="land l2"></i><i class="landglow"></i>
			</span>
			<b class="title">Chaos Incarnate</b>
			<small class="sub t-{to}">The coin turns to the {teamName(to)}</small>
		</div>
	{/key}
{/if}

<style>
	.cf { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; align-content: center; gap: 12px; pointer-events: none; animation: cfout 3s linear both; --s: clamp(170px, 25vmin, 250px); }
	.cf::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 46%, rgba(10, 4, 20, 0.7), rgba(10, 4, 20, 0.3) 45%, transparent 75%); }
	@keyframes cfout { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.stage { position: relative; width: var(--s); height: var(--s); }
	.stage > * { position: absolute; }
	/* ── the cores: the orbit turns (fast, then faster) while each arm reels in from wide to the centre ── */
	.orbit { left: 50%; top: 50%; width: 0; height: 0; transform: rotate(var(--o)); }
	.arm { position: absolute; left: 0; top: 0; width: 0; height: 0; animation: cforb 0.8s calc(var(--k) * 22ms) cubic-bezier(0.5, 0, 0.9, 0.7) both; }
	@keyframes cforb { 0% { opacity: 0; transform: rotate(0deg) translateX(calc(var(--s) * 0.95)); } 12% { opacity: 1; } 96% { opacity: 1; transform: rotate(560deg) translateX(calc(var(--s) * 0.04)); } 100% { opacity: 0; transform: rotate(600deg) translateX(0); } }
	.core { position: absolute; border-radius: 50%; mix-blend-mode: screen; width: calc(var(--s) * (0.36 - var(--k) * 0.04)); height: calc(var(--s) * (0.36 - var(--k) * 0.04)); transform: translate(-50%, -50%); opacity: calc(1 - var(--k) * 0.15); }
	.core.fire { background: radial-gradient(circle, #fffbe0 0 14%, #ffc040 26%, rgba(255, 90, 20, 0.7) 44%, transparent 70%); }
	.core.water { background: radial-gradient(circle, #f0feff 0 14%, #7fe6ff 26%, rgba(30, 130, 255, 0.7) 44%, transparent 70%); }
	/* ── the fusion ── */
	.flash { left: 50%; top: 50%; width: calc(var(--s) * 2.4); height: calc(var(--s) * 2.4); margin: calc(var(--s) * -1.2); border-radius: 50%; mix-blend-mode: screen; opacity: 0;
		background: radial-gradient(circle, #ffffff 0 10%, rgba(230, 200, 255, 0.95) 20%, rgba(160, 90, 255, 0.55) 38%, transparent 66%); animation: cfflash 0.7s 0.76s ease-out both; }
	@keyframes cfflash { 0% { opacity: 0; transform: scale(0.15); } 14% { opacity: 1; transform: scale(0.75); } 100% { opacity: 0; transform: scale(1.15); } }
	.wave { left: 50%; top: 50%; width: var(--s); height: var(--s); margin: calc(var(--s) * -0.5); border-radius: 50%; opacity: 0; animation: cfwave 0.9s 0.8s cubic-bezier(0.1, 0.7, 0.3, 1) both; }
	.w1 { border: 6px solid #f4e6ff; box-shadow: 0 0 22px rgba(200, 150, 255, 0.9), inset 0 0 22px rgba(200, 150, 255, 0.9); }
	.w2 { border: 4px solid #ffb060; box-shadow: 0 0 18px rgba(255, 140, 40, 0.8); animation-delay: 0.88s; }
	.w3 { border: 4px solid #6fd8ff; box-shadow: 0 0 18px rgba(60, 170, 255, 0.8); animation-delay: 0.96s; }
	@keyframes cfwave { 0% { opacity: 0; transform: scale(0.2); } 10% { opacity: 1; } 100% { opacity: 0; transform: scale(3.2); } }
	.streak { left: 50%; top: 50%; width: 0; height: 0; transform: rotate(var(--a)); }
	.streak i { position: absolute; left: -3px; top: 0; width: 6px; height: calc(var(--s) * 0.5 * var(--l)); border-radius: 3px; transform-origin: 50% 0; mix-blend-mode: screen; opacity: 0;
		background: linear-gradient(180deg, #ffffff, #8fe0ff 30%, rgba(40, 140, 255, 0)); animation: cfstreak 0.65s 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) both; }
	.streak i.fire { background: linear-gradient(180deg, #ffffff, #ffc060 30%, rgba(255, 80, 20, 0)); }
	@keyframes cfstreak { 0% { opacity: 0; transform: translateY(calc(var(--s) * 0.08)) scaleY(0.2); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(calc(var(--s) * 0.95)) scaleY(1.3); } }
	/* the corona: two sets of plasma rays turning opposite ways behind the spinning coin */
	.corona { left: 50%; top: 50%; width: calc(var(--s) * 1.7); height: calc(var(--s) * 1.7); margin: calc(var(--s) * -0.85); opacity: 0; animation: cfcor 1.9s 0.78s ease-out both; }
	@keyframes cfcor { 0% { opacity: 0; transform: scale(0.4); } 12% { opacity: 1; transform: scale(1.05); } 60% { opacity: 0.85; transform: scale(1); } 100% { opacity: 0; transform: scale(0.9); } }
	.rays { position: absolute; inset: 0; border-radius: 50%; mix-blend-mode: screen; animation: cfspinr 1.4s linear infinite;
		background: repeating-conic-gradient(from 0deg, rgba(255, 150, 50, 0.75) 0 4deg, transparent 4deg 15deg, rgba(90, 190, 255, 0.75) 15deg 19deg, transparent 19deg 30deg);
		-webkit-mask: radial-gradient(circle, transparent 26%, #000 32%, rgba(0, 0, 0, 0.6) 52%, transparent 70%); mask: radial-gradient(circle, transparent 26%, #000 32%, rgba(0, 0, 0, 0.6) 52%, transparent 70%); }
	.rays.r2 { animation-duration: 2.1s; animation-direction: reverse; opacity: 0.7; transform: scale(0.8);
		background: repeating-conic-gradient(from 7deg, rgba(220, 170, 255, 0.85) 0 3deg, transparent 3deg 24deg); }
	@keyframes cfspinr { to { transform: rotate(360deg); } }
	.bolts { left: 50%; top: 50%; width: calc(var(--s) * 2); height: calc(var(--s) * 2); margin: calc(var(--s) * -1); overflow: visible; animation: cfspinr 2.4s linear infinite; }
	.bolt { fill: none; stroke: #f6ecff; stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; opacity: 0; }
	.b0 { animation: cfbolt 0.16s 0.85s steps(1) 7 both; }
	.b1 { animation: cfbolt 0.16s 0.9s steps(1) 7 both; stroke: #9fe6ff; }
	.b2 { animation: cfbolt 0.16s 0.95s steps(1) 7 both; stroke: #ffc070; }
	@keyframes cfbolt { 0% { opacity: 1; } 40% { opacity: 0; } 100% { opacity: 0; } }
	/* the coin: appears out of the fusion, 7 flat half-turns, then a settle */
	.coin { inset: 0; display: grid; opacity: 0; animation: cfin 0.25s 0.76s ease-out both, cfspin 0.98s 0.8s linear both, cfland 0.45s 1.78s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.coin img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.7)); }
	@keyframes cfin { from { opacity: 0; } to { opacity: 1; } }
	@keyframes cfspin { 0%, 14.3%, 28.6%, 42.9%, 57.1%, 71.4%, 85.7%, 100% { transform: scaleX(1); } 7.1%, 21.4%, 35.7%, 50%, 64.3%, 78.6%, 92.9% { transform: scaleX(0.04); } }
	@keyframes cfland { from { scale: 1.25; } to { scale: 1; } }
	/* landing: the new team's colour blasts out */
	.land { left: 50%; top: 50%; width: var(--s); height: var(--s); margin: calc(var(--s) * -0.5); border-radius: 50%; border: 5px solid var(--land2); box-shadow: 0 0 26px var(--land), inset 0 0 20px var(--land); opacity: 0; animation: cfwave 0.9s 1.78s cubic-bezier(0.1, 0.7, 0.3, 1) both; }
	.l2 { border-width: 3px; animation-delay: 1.9s; }
	.landglow { left: 50%; top: 50%; width: calc(var(--s) * 2); height: calc(var(--s) * 2); margin: calc(var(--s) * -1); border-radius: 50%; mix-blend-mode: screen; opacity: 0;
		background: radial-gradient(circle, transparent 22%, color-mix(in srgb, var(--land) 70%, transparent) 30%, transparent 60%); animation: cflg 1s 1.78s ease-out both; }
	@keyframes cflg { 0% { opacity: 0; transform: scale(0.5); } 20% { opacity: 1; } 100% { opacity: 0; transform: scale(1.3); } }
	.title { position: relative; font-weight: normal; font-size: clamp(28px, 4.4vmin, 44px); letter-spacing: 0.08em; text-transform: uppercase; color: #fff4e0; -webkit-text-stroke: 1px #120a04; paint-order: stroke fill;
		text-shadow: 0 2px 0 #000, -8px 0 18px rgba(239, 125, 34, 0.75), 8px 0 18px rgba(47, 127, 230, 0.7), 0 0 30px rgba(190, 130, 255, 0.6); animation: cfslam 0.5s 1.8s cubic-bezier(0.2, 1.5, 0.4, 1) both; }
	@keyframes cfslam { from { opacity: 0; transform: scale(1.6); } to { opacity: 1; transform: none; } }
	.sub { position: relative; font-size: 15px; text-shadow: 0 1px 3px #000; opacity: 0; animation: cffade 0.4s 2.05s ease-out both; }
	.sub.t-orange { color: #ffb878; } .sub.t-blue { color: #9ccbff; }
	@keyframes cffade { to { opacity: 1; } }
	.ph { --s: min(46vw, 190px); }
	@media (prefers-reduced-motion: reduce) { .cf *, .cf { animation-duration: 0.01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
</style>
