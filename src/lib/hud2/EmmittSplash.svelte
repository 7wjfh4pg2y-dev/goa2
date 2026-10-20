<script lang="ts">
	// Emmitt's toast, for everyone (2026-10-20, the user's ask): when his Reverse Time / Tear in Time turns the NEXT turn
	// round (match.ts emNews, once per id). The same toast frame as NebKher's: his Fast Forward painting in a slanted
	// window, a card-green kicker, one slammed title and one line. ~3.2 s; transform / opacity only.
	import art from '$lib/cards/images/cards/emmitt/GreenIIA.webp'

	export let phone = false
	let on = false, run = 0, dur = 3200
	let timer: ReturnType<typeof setTimeout> | null = null
	export function play(ms = 3200) {
		dur = ms; on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), ms) })
		return ms
	}
</script>

{#if on}
	{#key run}
		<div class="ems" class:ph={phone} aria-live="polite" style="--dur:{dur}ms">
			<div class="band">
				<span class="artbox"><span class="art" style="background-image:url('{art}')"></span><span class="sweep"></span></span>
				<span class="edge"></span>
				<div class="copy">
					<small class="kick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 4 6 5 9-1 3-5 4-5 9M17 3c0 5-4 6-5 9 1 3 5 4 5 9" /></svg>Reverse Time</small>
					<b class="title">The sands will turn!</b>
					<span class="sub">Next turn — initiative is reversed</span>
				</div>
			</div>
		</div>
	{/key}
{/if}

<style>
	.ems { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 62; pointer-events: none; transform: translateX(-50%); animation: emin var(--dur, 3.2s) cubic-bezier(0.2, 1.2, 0.4, 1) both; }
	@keyframes emin { 0% { opacity: 0; transform: translate(-50%, -24px) scale(0.92); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1); } 86% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -14px); } }
	.band { position: relative; width: min(500px, 92vw); height: 96px; display: grid; grid-template-columns: 112px 1fr; align-items: center; overflow: hidden; border-radius: 12px;
		background: linear-gradient(90deg, rgba(8, 26, 16, 0.97), rgba(26, 10, 28, 0.97)); border: 1px solid rgba(143, 240, 164, 0.55); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 22px rgba(65, 174, 89, 0.22); }
	.artbox { position: relative; height: 100%; overflow: hidden; clip-path: polygon(0 0, 100% 0, 84% 100%, 0 100%); }
	.art { position: absolute; inset: 0; background-size: 230%; background-position: 66% 24%; /* his face and the time sigil (the user, 2026-10-20) */ animation: emart var(--dur, 3.2s) ease-out both; }
	@keyframes emart { from { transform: scale(1.2); } to { transform: scale(1); } }
	/* a band of light runs BACKWARDS across the painting (right to left), the way time is about to go */
	.sweep { position: absolute; top: 0; bottom: 0; left: 0; width: 40%; background: linear-gradient(100deg, transparent, rgba(255, 160, 230, 0.55), transparent); transform: translateX(260%) skewX(-12deg); animation: emsw 1s 0.3s ease-in-out both; }
	@keyframes emsw { to { transform: translateX(-160%) skewX(-12deg); } }
	.edge { position: absolute; left: 0; top: 0; bottom: 0; width: 112px; background: linear-gradient(180deg, #8ff0a4, #e040c0); clip-path: polygon(calc(100% - 3px) 0, 100% 0, 84% 100%, calc(84% - 3px) 100%); }
	.copy { display: flex; flex-direction: column; gap: 2px; padding: 0 16px 0 6px; min-width: 0; }
	.kick { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8ff0a4; }
	.kick svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
	.title { font-weight: normal; font-size: 29px; line-height: 1; color: #f2fff4; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		-webkit-text-stroke: 1px #08180c; paint-order: stroke fill; text-shadow: 0 0 14px rgba(224, 64, 192, 0.45), 2px 3px 0 #08180c; animation: emslam 0.45s 0.2s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes emslam { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.sub { font-size: 12.5px; color: #d6e6da; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-block: 3px; }
	.ph { top: 64px; }
	.ph .band { height: 80px; grid-template-columns: 92px 1fr; }
	.ph .edge { width: 92px; }
	.ph .title { font-size: 22px; }
	.ph .sub { font-size: 11px; white-space: normal; line-height: 1.2; }
	@media (prefers-reduced-motion: reduce) { .ems *, .ems { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
