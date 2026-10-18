<script lang="ts" context="module">
	export type NkSplashKind = 'laugh' | 'steal' | 'swap' | 'doubt' | 'crack'
</script>

<script lang="ts">
	// NebKher's splash (DEMO, 2026-10-18 — on /splash-demo only, not in games yet): his laughing silver art in a slanted
	// band, storm light flickering behind it, and one line of what he just did to you. One per thing he does:
	// he laughs · steals your spell · swaps your cards · makes you discard a colour · cracks reality.
	// Toast-sized (the user, 2026-10-18: the full-screen band was too intrusive): under the top bar, ~2.9 s.
	import art from '$lib/cards/images/cards/nebkher/Silver.webp'

	const COPY: Record<NkSplashKind, { kicker: string; title: string; sub: string }> = {
		laugh: { kicker: 'Diabolical Laughter', title: 'MWA-HA-HA!', sub: 'NebKher laughs diabolically' },
		steal: { kicker: 'Mind Grip', title: 'Your spells are mine!', sub: 'NebKher steals {x}' },
		swap: { kicker: 'Diabolical Laughter', title: 'I twist your fate!', sub: 'NebKher swaps your cards' },
		doubt: { kicker: 'Imbue Doubt', title: 'Doubt your choices!', sub: 'Discard a {x} card' },
		crack: { kicker: 'Crack in Reality', title: 'Reality bends to me!', sub: 'The board splits in two' },
	}
	const GEM: Record<string, string> = { Gold: '#e8bd52', Silver: '#c9d2dc', Red: '#d6453a', Blue: '#3b7fe0', Green: '#41ae59' }

	export let phone = false
	let kind: NkSplashKind | null = null, detail = '', ult = false, run = 0
	let timer: ReturnType<typeof setTimeout> | null = null
	/** play one: `detail` = the stolen card's name / the colour named; `ult` = the laugh that makes them discard */
	export function play(k: NkSplashKind, d = '', u = false) {
		kind = null; detail = d; ult = u; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { kind = k; timer = setTimeout(() => (kind = null), 2900) })
		return 2900
	}
	$: c = kind ? COPY[kind] : null
	$: sub = c ? (kind === 'laugh' && ult ? 'Discard a card — or be defeated!' : c.sub.replace('{x}', detail || (kind === 'doubt' ? 'Red' : 'your spell'))) : ''
	$: gem = kind === 'doubt' ? GEM[detail || 'Red'] ?? null : null
</script>

{#if kind && c}
	{#key run}
		<div class="nks" class:ph={phone} class:ult aria-live="polite">
			<div class="band">
				<span class="artbox"><span class="art" style="background-image:url('{art}')"></span><span class="flash"></span></span>
				<span class="edge"></span>
				<div class="copy">
					<small class="kick">{c.kicker}</small>
					<b class="title" class:long={(kind === 'laugh' ? 10 : c.title.length) > 17}>{kind === 'laugh' ? 'MWA-HA-HA!' : c.title}</b>
					<span class="sub">{#if gem}<i class="gem" style="--gc:{gem}"></i>{/if}{sub}</span>
				</div>
			</div>
		</div>
	{/key}
{/if}

<style>
	/* a toast-sized banner under the top bar: his laughing face in a slanted window, three lines beside it */
	.nks { position: fixed; left: 50%; top: 86px; z-index: 62; pointer-events: none; transform: translateX(-50%); animation: nkin 2.9s cubic-bezier(0.2, 1.2, 0.4, 1) both; }
	@keyframes nkin { 0% { opacity: 0; transform: translate(-50%, -24px) scale(0.92); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1); } 86% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -14px); } }
	.band { width: min(470px, 92vw); height: 96px; display: grid; grid-template-columns: 112px 1fr; align-items: center; overflow: hidden; border-radius: 12px;
		background: linear-gradient(90deg, rgba(10, 22, 12, 0.97), rgba(8, 16, 26, 0.97)); border: 1px solid rgba(201, 224, 74, 0.55); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 22px rgba(201, 224, 74, 0.18); }
	.ult .band { border-color: rgba(197, 140, 255, 0.65); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 22px rgba(162, 75, 255, 0.25); }
	.artbox { position: relative; height: 100%; overflow: hidden; clip-path: polygon(0 0, 100% 0, 84% 100%, 0 100%); }
	.art { position: absolute; inset: 0; background-size: 260%; background-position: 83% 24%; animation: nkart 2.9s ease-out both; }
	@keyframes nkart { from { transform: scale(1.18); } to { transform: scale(1); } }
	/* one flicker of storm light over his face as it lands */
	.flash { position: absolute; inset: 0; background: radial-gradient(circle at 60% 40%, rgba(235, 255, 160, 0.75), transparent 70%); opacity: 0; animation: nkfl 1.2s 0.15s steps(1) both; }
	@keyframes nkfl { 0% { opacity: 0; } 6% { opacity: 1; } 12% { opacity: 0.15; } 18% { opacity: 0.8; } 28%, 100% { opacity: 0; } }
	.edge { position: absolute; left: 92px; top: 0; bottom: 0; width: 3px; transform: skewX(-9deg); background: linear-gradient(180deg, #c9e04a, #3fd9c4); }
	.ult .edge { background: linear-gradient(180deg, #e3c2ff, #8c55d6); }
	.copy { display: flex; flex-direction: column; gap: 2px; padding: 0 16px 0 6px; min-width: 0; }
	.kick { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #c9e04a; }
	.ult .kick { color: #d7b0ff; }
	.title { font-weight: normal; font-size: 30px; line-height: 1; color: #f4f7e0; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		-webkit-text-stroke: 1px #0b1a10; paint-order: stroke fill; text-shadow: 0 0 14px rgba(201, 224, 74, 0.45), 2px 3px 0 #0b1a10; animation: nkslam 0.45s 0.2s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.title.long { font-size: 25px; }
	.ult .title { text-shadow: 0 0 14px rgba(197, 140, 255, 0.55), 2px 3px 0 #12081e; }
	@keyframes nkslam { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.sub { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: #d9e6c8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gem { width: 13px; height: 13px; border-radius: 50%; background: var(--gc); box-shadow: 0 0 0 1.5px #ebbd4f; flex: none; }
	/* phones: under the phone's top bar, a little smaller */
	.ph { top: 64px; }
	.ph .band { height: 80px; grid-template-columns: 92px 1fr; }
	.ph .edge { left: 76px; }
	.ph .title { font-size: 24px; }
	.ph .title.long { font-size: 20px; }
	.ph .sub { font-size: 12px; }
	@media (prefers-reduced-motion: reduce) { .nks *, .nks { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
