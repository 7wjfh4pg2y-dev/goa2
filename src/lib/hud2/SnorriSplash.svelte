<script lang="ts">
	// Snorri inscribes his runes (2026-10-20, the user's pick): everyone sees a banner under the top bar — his Inscribe the
	// Runes painting in a slanted window (like NebKher's and Emmitt's toasts), a frieze of the Elder Futhark drifting
	// behind the words, then four sockets I–IV: each rune slams in with a chisel flash and a spray of ice shards, and
	// once all four are in, a frost sheen runs along the band. Ice-blue like his rune circle. ~3.4 s; transform /
	// opacity only. Effects → Runes.
	import RuneMark from './RuneMark.svelte'
	import { RUNE_NAME, type Rune } from '$lib/heropower'
	import art from '$lib/cards/images/cards/snorri/Silver.webp'

	export let phone = false
	const ROMAN = ['I', 'II', 'III', 'IV']
	// the frieze: the 24 runes of his circle (10 × 16 stroke drawings), drawn twice so the drift loops seamlessly
	const FUTHARK = ['M3 0V16M3 4L9 0M3 8L9 4', 'M2 16V0L8 5V16', 'M3 0V16M3 4L8 8L3 12', 'M3 0V16M3 0L9 4M3 5L9 9', 'M2 16V0L8 4L2 8L8 16', 'M8 2L2 8L8 14', 'M1 2L9 14M9 2L1 14', 'M3 0V16M3 0L8 4L3 8',
		'M2 0V16M8 0V16M2 5L8 11', 'M5 0V16M2 5L8 11', 'M5 0V16', 'M4 2L1 6L4 10M6 6L9 10L6 14', 'M5 0V16M5 0L8 3M5 16L2 13', 'M2 1V15M2 1L6 5L8 2M2 15L6 11L8 14', 'M5 0V16M5 6L1 1M5 6L9 1', 'M7 0L2 6L8 10L3 16',
		'M5 0V16M5 0L1 5M5 0L9 5', 'M2 0V16M2 0L8 4L2 8L8 12L2 16', 'M1 16V0L5 6L9 0V16', 'M1 16V0L9 8M9 16V0L1 8', 'M3 16V0L8 5', 'M5 0L9 8L5 16L1 8Z', 'M1 0V16L9 0V16Z', 'M5 0L9 6L1 14M5 0L1 6L9 14']
	const STEP = 18, FRIEZE = FUTHARK.length * STEP
	// six ice shards per socket, flung out at even angles (a little turned per socket so they don't repeat)
	const SHARDS = Array.from({ length: 6 }, (_, k) => k)
	const MOTES = Array.from({ length: 9 }, (_, k) => ({ x: 8 + ((k * 37) % 84), d: (k * 0.29) % 2.2, s: 2 + (k % 3) }))
	let order: Rune[] = [], on = false, run = 0, timer: ReturnType<typeof setTimeout> | null = null
	export function play(o: Rune[], ms = 3400) {
		order = o; on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), ms) })
		return ms
	}
</script>

{#if on}
	{#key run}
		<div class="sns" class:ph={phone} aria-live="polite">
			<div class="band">
				<span class="artbox"><span class="art" style="background-image:url('{art}')"></span>{#each [0, 1, 2, 3] as i}<span class="strike" style="--d:{0.55 + i * 0.2}s"></span>{/each}</span>
				<span class="edge"></span>
				<span class="frieze" aria-hidden="true">
					<svg viewBox="0 0 {FRIEZE * 2} 20" width={FRIEZE * 2} height="20">
						{#each [0, 1] as h}{#each FUTHARK as d, i}<path {d} transform="translate({h * FRIEZE + i * STEP + 4} 2)" />{/each}{/each}
					</svg>
				</span>
				<span class="motes" aria-hidden="true">{#each MOTES as m}<i style="left:{m.x}%;--md:{m.d}s;--ms:{m.s}px"></i>{/each}</span>
				<div class="copy">
					<small class="kick">Inscribe the Runes</small>
					<b class="title">The runes are carved!</b>
					<div class="row">
						{#each order as r, i (i)}
							<span class="slot" style="--d:{0.55 + i * 0.2}s;--t:{i * 17}deg">
								<span class="sock">
									<em>{ROMAN[i]}</em>
									<span class="rn"><RuneMark rune={r} size={phone ? 26 : 32} on /></span>
									<i class="chisel"></i>
									{#each SHARDS as k}<i class="shard" style="--a:{k * 60}deg"></i>{/each}
								</span>
								<b>{RUNE_NAME[r]}</b>
							</span>
						{/each}
					</div>
				</div>
				<span class="sheen"></span>
			</div>
		</div>
	{/key}
{/if}

<style>
	.sns { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 62; pointer-events: none; transform: translateX(-50%); animation: snin 3.4s cubic-bezier(0.2, 1.2, 0.4, 1) both; }
	@keyframes snin { 0% { opacity: 0; transform: translate(-50%, -20px) scale(0.94); } 9% { opacity: 1; transform: translate(-50%, 0) scale(1); } 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -12px); } }
	.band { position: relative; width: min(500px, 94vw); height: 128px; display: grid; grid-template-columns: 118px 1fr; align-items: center; overflow: hidden; border-radius: 12px;
		background: radial-gradient(120% 140% at 0% 50%, rgba(30, 70, 120, 0.55), transparent 60%), linear-gradient(90deg, rgba(8, 20, 36, 0.97), rgba(6, 12, 24, 0.97));
		border: 1px solid rgba(140, 200, 255, 0.6); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 24px rgba(110, 180, 255, 0.24); }
	/* his painting: the face and the raised hammer */
	.artbox { position: relative; height: 100%; overflow: hidden; clip-path: polygon(0 0, 100% 0, 84% 100%, 0 100%); }
	.art { position: absolute; inset: 0; background-size: 240%; background-position: 54% 22%; animation: snart 3.4s ease-out both; }
	@keyframes snart { from { transform: scale(1.18); } to { transform: scale(1); } }
	/* a cold flash over the painting with each hammer blow */
	.strike { position: absolute; inset: 0; background: radial-gradient(circle at 50% 30%, rgba(200, 240, 255, 0.7), transparent 65%); opacity: 0; animation: snstr 0.35s var(--d) ease-out both; }
	@keyframes snstr { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
	.edge { position: absolute; left: 0; top: 0; bottom: 0; width: 118px; background: linear-gradient(180deg, #e6f6ff, #5aa8ff); z-index: 2;
		clip-path: polygon(calc(100% - 3px) 0, 100% 0, 84% 100%, calc(84% - 3px) 100%); }
	/* the Elder Futhark drifting faintly behind the words */
	.frieze { position: absolute; left: 118px; right: 0; top: 50%; height: 20px; margin-top: -10px; overflow: hidden; opacity: 0.13; }
	.frieze svg { display: block; fill: none; stroke: #bfe4ff; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; animation: sndrift 14s linear infinite; }
	@keyframes sndrift { to { transform: translateX(-50%); } }
	/* frost motes rising */
	.motes { position: absolute; left: 118px; right: 0; top: 0; bottom: 0; overflow: hidden; }
	.motes i { position: absolute; bottom: -6px; width: var(--ms); height: var(--ms); border-radius: 50%; background: #dff3ff; box-shadow: 0 0 4px #9fd2ff; opacity: 0; animation: snmote 2.4s var(--md) ease-out infinite; }
	@keyframes snmote { 0% { opacity: 0; transform: translateY(0); } 20% { opacity: 0.8; } 100% { opacity: 0; transform: translateY(-120px); } }
	.copy { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 0 14px 0 6px; min-width: 0; }
	.kick { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #a8d8ff; }
	.title { font-weight: normal; font-size: 26px; line-height: 1; color: #f0f8ff; white-space: nowrap; -webkit-text-stroke: 1px #06101e; paint-order: stroke fill;
		text-shadow: 0 0 14px rgba(120, 190, 255, 0.55), 2px 3px 0 #06101e; animation: snslam 0.45s 0.2s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes snslam { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.row { display: flex; gap: 12px; margin-top: 4px; }
	.slot { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 62px; }
	.slot b { font-weight: normal; font-size: 11.5px; color: #e6f3ff; opacity: 0; animation: snfade 0.4s calc(var(--d) + 0.15s) ease-out both; }
	.sock { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(140, 200, 255, 0.35), inset 0 0 10px rgba(0, 0, 0, 0.6); }
	.sock em { position: absolute; top: -3px; left: -9px; font-style: normal; font-size: 10px; color: #8fb4d8; letter-spacing: 0.06em; }
	.rn { display: grid; animation: slam 0.42s var(--d) cubic-bezier(0.3, 1.6, 0.5, 1) both; }
	@keyframes slam { from { opacity: 0; transform: scale(2.3) rotate(-25deg); } to { opacity: 1; transform: none; } }
	/* the chisel's flash: a bright cross-glint where the rune lands */
	.chisel { position: absolute; inset: -55%; border-radius: 50%; background: radial-gradient(circle, rgba(235, 250, 255, 0.95) 0 8%, rgba(110, 180, 255, 0.45) 26%, transparent 60%); opacity: 0; animation: spk 0.55s calc(var(--d) + 0.16s) ease-out both; }
	.chisel::before, .chisel::after { content: ''; position: absolute; left: 50%; top: 50%; width: 70%; height: 2px; margin: -1px 0 0 -35%; background: linear-gradient(90deg, transparent, #fff, transparent); }
	.chisel::after { transform: rotate(90deg); }
	@keyframes spk { 0% { opacity: 0; transform: scale(0.3) rotate(0deg); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.25) rotate(45deg); } }
	/* ice shards flung off the stone */
	.shard { position: absolute; left: 50%; top: 50%; width: 3px; height: 9px; margin: -4.5px 0 0 -1.5px; background: linear-gradient(180deg, #ffffff, #8cc8ff); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
		opacity: 0; transform: rotate(calc(var(--a) + var(--t))) translateY(-8px); animation: shard 0.6s calc(var(--d) + 0.16s) cubic-bezier(0.1, 0.8, 0.3, 1) both; }
	@keyframes shard { 0% { opacity: 0; transform: rotate(calc(var(--a) + var(--t))) translateY(-8px) scale(0.6); } 15% { opacity: 1; } 100% { opacity: 0; transform: rotate(calc(var(--a) + var(--t))) translateY(-34px) scale(1); } }
	@keyframes snfade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
	/* once all four are in: a frost sheen runs along the band */
	.sheen { position: absolute; top: -20%; bottom: -20%; left: 0; width: 30%; z-index: 3; background: linear-gradient(100deg, transparent, rgba(210, 240, 255, 0.35), transparent); transform: translateX(-120%) skewX(-14deg); animation: snsh 0.8s 1.6s ease-in-out both; }
	@keyframes snsh { to { transform: translateX(420%) skewX(-14deg); } }
	/* phones: under the phone's top bar, smaller */
	.ph { top: 64px; }
	.ph .band { height: 108px; grid-template-columns: 84px 1fr; }
	.ph .edge { width: 84px; }
	.ph .frieze, .ph .motes { left: 84px; }
	.ph .title { font-size: 19px; }
	.ph .row { gap: 6px; }
	.ph .slot { width: 50px; }
	.ph .slot b { font-size: 10.5px; }
	.ph .sock { width: 32px; height: 32px; }
	.ph .sock em { left: -7px; font-size: 9px; }
	@media (prefers-reduced-motion: reduce) { .sns *, .sns { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
