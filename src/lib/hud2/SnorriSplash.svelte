<script lang="ts">
	// Snorri inscribes his runes (2026-10-20, the user's pick): everyone sees a banner under the top bar — four sockets
	// I–IV, the runes slamming into them one after another with a spark each, their names under them. Ice-blue like his
	// rune circle. ~3.4 s; transform / opacity only. Effects → Runes.
	import RuneMark from './RuneMark.svelte'
	import { RUNE_NAME, type Rune } from '$lib/heropower'

	export let phone = false
	const ROMAN = ['I', 'II', 'III', 'IV']
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
				<small class="kick">Snorri inscribes the runes</small>
				<div class="row">
					{#each order as r, i (i)}
						<span class="slot" style="--d:{0.35 + i * 0.22}s">
							<em>{ROMAN[i]}</em>
							<span class="sock"><span class="rn"><RuneMark rune={r} size={phone ? 34 : 44} on /></span><i class="spark"></i></span>
							<b>{RUNE_NAME[r]}</b>
						</span>
					{/each}
				</div>
			</div>
		</div>
	{/key}
{/if}

<style>
	.sns { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 62; pointer-events: none; transform: translateX(-50%); animation: snin 3.4s cubic-bezier(0.2, 1.2, 0.4, 1) both; }
	@keyframes snin { 0% { opacity: 0; transform: translate(-50%, -20px) scale(0.94); } 9% { opacity: 1; transform: translate(-50%, 0) scale(1); } 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -12px); } }
	.band { width: min(440px, 92vw); padding: 10px 16px 12px; box-sizing: border-box; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;
		background: linear-gradient(180deg, rgba(10, 22, 36, 0.97), rgba(6, 14, 26, 0.97)); border: 1px solid rgba(140, 200, 255, 0.55);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 22px rgba(110, 180, 255, 0.2); }
	.kick { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #a8d8ff; }
	.row { display: flex; gap: 22px; }
	.slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.slot em { font-style: normal; font-size: 12px; color: #8fb4d8; letter-spacing: 0.08em; }
	.slot b { font-weight: normal; font-size: 13px; color: #e6f3ff; opacity: 0; animation: snfade 0.4s calc(var(--d) + 0.15s) ease-out both; }
	.sock { position: relative; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(140, 200, 255, 0.35); }
	.ph .sock { width: 40px; height: 40px; }
	.rn { display: grid; animation: slam 0.42s var(--d) cubic-bezier(0.3, 1.6, 0.5, 1) both; }
	@keyframes slam { from { opacity: 0; transform: scale(2.1) rotate(-25deg); } to { opacity: 1; transform: none; } }
	.spark { position: absolute; inset: -40%; border-radius: 50%; background: radial-gradient(circle, rgba(200, 235, 255, 0.85) 0, rgba(110, 180, 255, 0.4) 30%, transparent 62%); opacity: 0; animation: spk 0.6s calc(var(--d) + 0.18s) ease-out both; }
	@keyframes spk { 0% { opacity: 0; transform: scale(0.3); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.3); } }
	@keyframes snfade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
	.ph { top: 64px; }
	.ph .row { gap: 14px; }
	@media (prefers-reduced-motion: reduce) { .sns *, .sns { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
