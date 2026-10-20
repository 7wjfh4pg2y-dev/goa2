<script lang="ts">
	// Takahide's ultimate takes hold (in games since 2026-10-20, Effects → War): a violet sunburst turns in the middle of the
	// screen and his three golds fan out in front of it under 'Ready for War'. ~3 s; transform / opacity only.
	import { heroCards, backgroundSlug } from '$lib/cards/deck'
	export let phone = false
	const ART = import.meta.glob('$lib/cards/images/cards/takahide/*.webp', { eager: true, import: 'default' }) as Record<string, string>
	const arts = heroCards('takahide').filter((c) => c.color === 'GOLD' && !c.handicapped).map((c) => Object.entries(ART).find(([k]) => k.endsWith(`/${backgroundSlug(c)}.webp`))?.[1] ?? '')
	let on = false, run = 0, timer: ReturnType<typeof setTimeout> | null = null
	export function play() { on = false; run++; if (timer) clearTimeout(timer); requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), 3000) }) }
	const RAYS = Array.from({ length: 36 }, (_, i) => i * 10)
</script>

{#if on}
	{#key run}
		<div class="rfw" class:ph={phone} aria-live="polite">
			<span class="dim"></span>
			<span class="burst"><svg viewBox="-100 -100 200 200">{#each RAYS as a, i}<polygon points="-3,-30 3,-30 0,{i % 2 ? -78 : -98}" transform="rotate({a})" />{/each}</svg></span>
			<span class="fan">{#each arts as a, i}<span class="card" style="background-image:url({a});--i:{i - 1};animation-delay:{0.35 + i * 0.12}s"></span>{/each}</span>
			<b class="title">Ready for War</b>
			<small class="sub">Takahide · all three golds in hand</small>
		</div>
	{/key}
{/if}

<style>
	.rfw { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; align-content: center; pointer-events: none; animation: rfout 3s linear both; --s: clamp(240px, 36vmin, 360px); }
	@keyframes rfout { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.dim { position: absolute; inset: 0; background: radial-gradient(circle at 50% 46%, rgba(10, 4, 20, 0.7), rgba(10, 4, 20, 0.3) 55%, transparent 80%); animation: rffade 0.4s ease-out both; }
	@keyframes rffade { from { opacity: 0; } to { opacity: 1; } }
	.burst { position: absolute; width: calc(var(--s) * 1.5); height: calc(var(--s) * 1.5); left: 50%; top: 46%; margin: calc(var(--s) * -0.75) 0 0 calc(var(--s) * -0.75); animation: rfburst 0.6s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
	.burst svg { width: 100%; height: 100%; fill: rgba(185, 120, 255, 0.55); animation: rfspin 9s linear infinite; }
	@keyframes rfburst { from { opacity: 0; transform: scale(0.3); } to { opacity: 1; transform: none; } }
	@keyframes rfspin { to { transform: rotate(360deg); } }
	.fan { position: relative; width: var(--s); height: calc(var(--s) * 0.62); grid-area: 1 / 1; }
	.card { position: absolute; left: 50%; bottom: 0; width: calc(var(--s) * 0.36); aspect-ratio: 1192 / 1664; margin-left: calc(var(--s) * -0.18); border-radius: 7px; background: #000 center/cover; transform-origin: 50% 120%;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.7), 0 0 0 1.5px #ffd25e, 0 0 18px rgba(255, 210, 94, 0.5); animation: rffan 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
	@keyframes rffan { from { opacity: 0; transform: translateY(40px) rotate(0deg); } to { opacity: 1; transform: rotate(calc(var(--i) * 16deg)); } }
	.title { margin-top: 18px; font-weight: normal; font-size: clamp(28px, 4.4vmin, 44px); letter-spacing: 0.08em; text-transform: uppercase; color: #f1e2ff; -webkit-text-stroke: 1px #14081f; paint-order: stroke fill; text-shadow: 0 2px 0 #000, 0 0 18px rgba(185, 120, 255, 0.8); animation: rfslam 0.5s 0.7s cubic-bezier(0.2, 1.5, 0.4, 1) both; z-index: 1; }
	@keyframes rfslam { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: none; } }
	.sub { font-size: 14px; color: #e0cff5; text-shadow: 0 1px 3px #000; animation: rffade 0.4s 1s ease-out both; z-index: 1; }
</style>
