<script lang="ts" context="module">
	export type NkSplashKind = 'laugh' | 'steal' | 'swap' | 'doubt' | 'crack'
</script>

<script lang="ts">
	// NebKher's splash (DEMO, 2026-10-18 — on /splash-demo only, not in games yet): his laughing silver art in a slanted
	// band, storm light flickering behind it, and one line of what he just did to you. One per thing he does:
	// he laughs · steals your spell · swaps your cards · makes you discard a colour · cracks reality.
	// transform / opacity only; ~3.4 s, then gone.
	import art from '$lib/cards/images/cards/nebkher/Silver.webp'

	const COPY: Record<NkSplashKind, { kicker: string; title: string; sub: string }> = {
		laugh: { kicker: 'Diabolical Laughter', title: 'MWA-HA-HA!', sub: 'NebKher laughs diabolically' },
		steal: { kicker: 'Mind Grip', title: 'Your spell is mine', sub: 'NebKher steals {x}' },
		swap: { kicker: 'Diabolical Laughter', title: 'Fate, twisted', sub: 'NebKher swaps your cards' },
		doubt: { kicker: 'Imbue Doubt', title: 'Doubt creeps in', sub: 'Discard a {x} card' },
		crack: { kicker: 'Crack in Reality', title: 'Reality cracks', sub: 'The board splits in two' },
	}
	const GEM: Record<string, string> = { Gold: '#e8bd52', Silver: '#c9d2dc', Red: '#d6453a', Blue: '#3b7fe0', Green: '#41ae59' }

	export let phone = false
	let kind: NkSplashKind | null = null, detail = '', ult = false, run = 0
	let timer: ReturnType<typeof setTimeout> | null = null
	/** play one: `detail` = the stolen card's name / the colour named; `ult` = the laugh that makes them discard */
	export function play(k: NkSplashKind, d = '', u = false) {
		kind = null; detail = d; ult = u; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { kind = k; timer = setTimeout(() => (kind = null), 3400) })
		return 3400
	}
	$: c = kind ? COPY[kind] : null
	$: sub = c ? (kind === 'laugh' && ult ? 'Discard a card — or be defeated!' : c.sub.replace('{x}', detail || (kind === 'doubt' ? 'Red' : 'your spell'))) : ''
	$: gem = kind === 'doubt' ? GEM[detail || 'Red'] ?? null : null
</script>

{#if kind && c}
	{#key run}
		<div class="nks" class:ph={phone} class:ult aria-live="polite">
			<span class="scrim"></span>
			<span class="flash f1"></span><span class="flash f2"></span>
			<div class="shk"><div class="band">
				<span class="artbox"><span class="art" style="background-image:url('{art}')"></span></span>
				<span class="edge"></span>
				<div class="copy">
					<svg class="eye" viewBox="0 0 100 100" aria-hidden="true">
						<path d="M12 40 Q32 18 62 31 Q74 37 90 37" fill="none" stroke-width="5" stroke-linecap="round" />
						<path d="M14 52 Q40 28 78 50 Q44 68 14 52 Z" fill="none" stroke-width="4.4" stroke-linejoin="round" />
						<circle cx="46" cy="50" r="9" /><path d="M78 50 L93 56 M40 63 L37 84 M52 63 Q67 71 63 83 Q59 90 52 84 Q52 78 57 79" fill="none" stroke-width="4.4" stroke-linecap="round" />
					</svg>
					<small class="kick">{c.kicker}</small>
					<b class="title">{kind === 'laugh' ? 'MWA-HA-HA!' : c.title}</b>
					<span class="sub">{#if gem}<i class="gem" style="--gc:{gem}"></i>{/if}{sub}</span>
				</div>
			</div></div>
		</div>
	{/key}
{/if}

<style>
	.nks { position: fixed; inset: 0; z-index: 62; pointer-events: none; display: grid; place-items: center; overflow: hidden; animation: nkout 3.4s linear forwards; }
	@keyframes nkout { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.scrim { position: absolute; inset: 0; background: radial-gradient(ellipse at 40% 50%, rgba(40, 60, 10, 0.55), rgba(2, 8, 4, 0.82) 70%); animation: nkfade 0.35s ease-out both; }
	.ult .scrim { background: radial-gradient(ellipse at 40% 50%, rgba(60, 20, 90, 0.6), rgba(6, 2, 12, 0.85) 70%); }
	@keyframes nkfade { from { opacity: 0; } to { opacity: 1; } }
	/* storm light: two flickers, like the lightning in his painting */
	.flash { position: absolute; inset: 0; opacity: 0; }
	.f1 { background: radial-gradient(ellipse at 30% 30%, rgba(235, 255, 160, 0.55), transparent 60%); animation: nkfl 1.6s 0.15s steps(1) both; }
	.f2 { background: radial-gradient(ellipse at 70% 60%, rgba(120, 255, 220, 0.4), transparent 60%); animation: nkfl 1.6s 0.5s steps(1) both; }
	@keyframes nkfl { 0% { opacity: 0; } 4% { opacity: 1; } 8% { opacity: 0.2; } 12% { opacity: 0.9; } 20%, 100% { opacity: 0; } }
	/* the band: slanted, the art on the left sliding in, the words on the right */
	.band { position: relative; width: min(1180px, 96vw); height: min(420px, 50vh); transform: skewX(-10deg); display: grid; grid-template-columns: 46% 1fr; align-items: center;
		background: linear-gradient(90deg, rgba(10, 22, 12, 0.96), rgba(8, 16, 26, 0.96)); border-top: 2px solid #c9e04a; border-bottom: 2px solid #3fd9c4;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 20px 60px rgba(0, 0, 0, 0.6); animation: nkband 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
	/* the shake is on a wrapper: two animations of one property on one element would leave the GPU */
	.shk { animation: nkshake 0.4s 0.55s linear both; }
	.ult .band { border-top-color: #c58cff; border-bottom-color: #8c55d6; }
	@keyframes nkband { from { transform: skewX(-10deg) translateX(-110vw); } to { transform: skewX(-10deg) translateX(0); } }
	@keyframes nkshake { 0%, 100% { transform: none; } 20% { transform: translate(-6px, 3px); } 40% { transform: translate(5px, -4px); } 60% { transform: translate(-4px, 2px); } 80% { transform: translate(3px, -1px); } }
	.artbox { position: relative; height: 100%; overflow: hidden; }
	.art { position: absolute; inset: -6% -10% -6% -14%; background-size: cover; background-position: 66% 24%; transform: skewX(10deg); animation: nkart 3.4s ease-out both; }
	@keyframes nkart { from { transform: skewX(10deg) scale(1.22) translateX(-4%); } to { transform: skewX(10deg) scale(1.06) translateX(2%); } }
	.edge { position: absolute; left: calc(46% - 3px); top: 0; bottom: 0; width: 6px; background: linear-gradient(180deg, #c9e04a, #3fd9c4); box-shadow: 0 0 18px rgba(201, 224, 74, 0.6); }
	.ult .edge { background: linear-gradient(180deg, #e3c2ff, #8c55d6); box-shadow: 0 0 18px rgba(197, 140, 255, 0.7); }
	.copy { position: relative; transform: skewX(10deg); padding: 0 6% 0 9%; display: flex; flex-direction: column; gap: 10px; }
	.eye { position: absolute; right: 4%; top: 50%; width: 46%; transform: translateY(-50%); opacity: 0.08; stroke: #c9e04a; fill: #c9e04a; }
	.kick { font-size: 18px; letter-spacing: 0.24em; text-transform: uppercase; color: #c9e04a; animation: nkin 0.4s 0.35s both; }
	.ult .kick { color: #d7b0ff; }
	.title { font-weight: normal; font-size: clamp(40px, 6.4vw, 92px); line-height: 0.95; color: #f4f7e0; letter-spacing: 0.02em;
		-webkit-text-stroke: 2px #0b1a10; paint-order: stroke fill; text-shadow: 0 0 22px rgba(201, 224, 74, 0.55), 4px 5px 0 #0b1a10; animation: nkslam 0.5s 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.ult .title { text-shadow: 0 0 22px rgba(197, 140, 255, 0.65), 4px 5px 0 #12081e; }
	@keyframes nkslam { from { opacity: 0; transform: scale(1.8) rotate(-4deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
	.sub { display: inline-flex; align-items: center; gap: 10px; font-size: clamp(16px, 1.8vw, 24px); color: #d9e6c8; animation: nkin 0.45s 0.85s both; }
	.gem { width: 22px; height: 22px; border-radius: 50%; background: var(--gc); box-shadow: 0 0 0 2px #ebbd4f, 0 0 12px var(--gc); flex: none; }
	@keyframes nkin { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
	/* phones: the band stands tall, the art on top, the words under it */
	.ph .band { width: 100vw; height: min(560px, 74vh); transform: skewY(-6deg); grid-template-columns: 1fr; grid-template-rows: 58% 1fr; border: 0; border-left: 0; }
	.ph .band { animation: nkbandp 0.55s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
	@keyframes nkbandp { from { transform: skewY(-6deg) translateY(110vh); } to { transform: skewY(-6deg); } }
	.ph .art { transform: skewY(6deg); background-position: 66% 20%; animation: none; inset: -8%; }
	.ph .edge { left: 0; right: 0; top: calc(58% - 3px); bottom: auto; width: auto; height: 6px; }
	.ph .copy { transform: skewY(6deg); padding: 0 8%; align-items: center; text-align: center; }
	.ph .kick { font-size: 13px; }
	.ph .title { font-size: 44px; }
	.ph .sub { font-size: 16px; }
	@media (prefers-reduced-motion: reduce) { .nks *, .nks { animation-duration: 0.01s !important; animation-delay: 0s !important; } .nks { animation: nkout 3.4s linear forwards !important; } }
</style>
