<script lang="ts">
	// Equilibrium (DEMO on /splash-demo, 2026-10-20 — the user's ask): a toast under the top bar in the NebKher / Emmitt /
	// Snorri frame — 'Controlled Chaos · Ignatia has achieved Equilibrium' — with her Equilibrium painting in the slanted
	// window, BROUGHT TO LIFE: her hair burns (copies of the hair cut out of the painting sway from its roots under a
	// flickering heat glow, embers rising off it), both orbs swirl with energy, then she draws them together — the two lights pull to
	// the middle, an arc crackles between them and they fuse in a white-violet flash. ~3.3 s; transform / opacity only.
	// Everything over the painting is placed in the painting's own pixels (775 × 1071) inside one scaled box.
	import art from '$lib/cards/images/cards/ignatia/Silver.webp'
	export let phone = false
	const DUR = 3300
	let on = false, run = 0, timer: ReturnType<typeof setTimeout> | null = null
	export function play() {
		on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), DUR) })
		return DUR
	}
	// the painting's landmarks (px of the 775 × 1071 art)
	const HAIR = 'polygon(282px 350px, 284px 250px, 300px 150px, 338px 62px, 398px 0, 474px 0, 528px 84px, 538px 204px, 522px 304px, 484px 350px)'
	const WATER = { x: 345, y: 482 }, FIRE = { x: 440, y: 412 }, MID = { x: 392, y: 447 }
	// embers drifting up off the crown
	const EMBERS = Array.from({ length: 10 }, (_, i) => ({ x: 300 + ((i * 53) % 230), y: 60 + ((i * 71) % 160), d: (i * 0.23) % 1.6, dx: ((i % 5) - 2) * 14 }))
	// three jagged arcs between the orbs, flickering in turn
	const ARCS = [0, 1, 2].map((j) => {
		const pts: string[] = []
		for (let t = 0; t <= 6; t++) {
			const u = t / 6, x = WATER.x + (FIRE.x - WATER.x) * u, y = WATER.y + (FIRE.y - WATER.y) * u
			const off = t === 0 || t === 6 ? 0 : Math.sin((t + 1) * (j * 2.3 + 1.7)) * 18
			pts.push(`${(x + off * 0.6).toFixed(0)},${(y + off).toFixed(0)}`)
		}
		return pts.join(' ')
	})
</script>

{#if on}
	{#key run}
		<div class="igs" class:ph={phone} aria-live="polite">
			<div class="band">
				<span class="artbox">
					<span class="zoom">
						<span class="pic">
							<span class="paint" style="background-image:url('{art}')"></span>
							<!-- her hair, alive: two cut-outs of it swaying from the roots, out of step -->
							<span class="hair h1" style="background-image:url('{art}');clip-path:{HAIR}"></span>
							<span class="hair h2" style="background-image:url('{art}');clip-path:{HAIR}"></span>
							<span class="heat"></span><span class="heat k2"></span>
							{#each EMBERS as e}<span class="ember" style="left:{e.x}px;top:{e.y}px;--d:{e.d}s;--dx:{e.dx}px"></span>{/each}
							<!-- the orbs swirl -->
							<span class="orb water" style="left:{WATER.x}px;top:{WATER.y}px"><i class="glow"></i><i class="sw"></i><i class="sw s2"></i></span>
							<span class="orb fire" style="left:{FIRE.x}px;top:{FIRE.y}px"><i class="glow"></i><i class="sw"></i><i class="sw s2"></i></span>
							<!-- …and she draws them together -->
							<span class="pull water" style="left:{WATER.x}px;top:{WATER.y}px;--tx:{MID.x - WATER.x}px;--ty:{MID.y - WATER.y}px"></span>
							<span class="pull fire" style="left:{FIRE.x}px;top:{FIRE.y}px;--tx:{MID.x - FIRE.x}px;--ty:{MID.y - FIRE.y}px"></span>
							<svg class="arcs" viewBox="0 0 775 1071" width="775" height="1071">{#each ARCS as p, j}<polyline points={p} class="arc a{j}" />{/each}</svg>
							<span class="fuse" style="left:{MID.x}px;top:{MID.y}px"></span>
							<span class="fring" style="left:{MID.x}px;top:{MID.y}px"></span>
						</span>
					</span>
				</span>
				<span class="edge"></span>
				<div class="copy">
					<small class="kick">Fire and water, as one</small>
					<b class="title">Controlled Chaos</b>
					<span class="sub">Ignatia has achieved <em>Equilibrium</em></span>
				</div>
				<span class="sheen"></span>
			</div>
		</div>
	{/key}
{/if}

<style>
	.igs { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 62; pointer-events: none; transform: translateX(-50%); animation: igin 3.3s cubic-bezier(0.2, 1.2, 0.4, 1) both;
		--w: 172px; --h: 130px; --k: 0.244; --cx: 404px; }
	@keyframes igin { 0% { opacity: 0; transform: translate(-50%, -20px) scale(0.94); } 9% { opacity: 1; transform: translate(-50%, 0) scale(1); } 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -12px); } }
	.band { position: relative; width: min(500px, 94vw); height: var(--h); display: grid; grid-template-columns: var(--w) 1fr; align-items: center; overflow: hidden; border-radius: 12px; border: 1px solid transparent;
		background: radial-gradient(90% 140% at 0% 50%, rgba(140, 40, 20, 0.45), transparent 60%) padding-box, radial-gradient(90% 140% at 100% 50%, rgba(20, 110, 130, 0.35), transparent 60%) padding-box,
			linear-gradient(90deg, rgba(28, 10, 8, 0.97), rgba(6, 18, 26, 0.97)) padding-box, linear-gradient(90deg, #ef7d22, #c58cff 50%, #2fd0e6) border-box;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 12px 30px rgba(0, 0, 0, 0.55), -8px 0 24px rgba(239, 125, 34, 0.18), 8px 0 24px rgba(47, 208, 230, 0.18); }
	.artbox { position: relative; height: 100%; overflow: hidden; clip-path: polygon(0 0, 100% 0, 84% 100%, 0 100%); background: #050308; }
	/* a slow push in towards the orbs */
	.zoom { position: absolute; inset: 0; transform-origin: 56% 82%; animation: igzoom 3.3s ease-out both; }
	@keyframes igzoom { from { transform: scale(1.1); } to { transform: scale(1); } }
	.pic { position: absolute; left: 0; top: 0; width: 775px; height: 1071px; transform-origin: 0 0; transform: translate(calc(var(--w) / 2 - var(--cx) * var(--k)), -4px) scale(var(--k)); }
	.pic > span, .pic > svg { position: absolute; }
	.paint, .hair { left: 0; top: 0; width: 775px; height: 1071px; background-size: 100% 100%; }
	/* the burning hair: two cut-outs swaying from the roots (the head), out of step, so the flames lick and shift */
	.hair { transform-origin: 404px 345px; }
	.h1 { animation: igsway 0.42s ease-in-out infinite alternate; }
	.h2 { opacity: 0.6; animation: igsway2 0.31s ease-in-out infinite alternate; }
	@keyframes igsway { from { transform: skewX(-6deg) scale(0.99, 0.96); } to { transform: skewX(5deg) scale(1.02, 1.09); } }
	@keyframes igsway2 { from { transform: skewX(6deg) scale(1.02, 1.07); } to { transform: skewX(-4deg) scale(0.98, 0.97); } }
	/* the fire burns brighter and dimmer over the hair, flickering out of step */
	.heat { left: 250px; top: -30px; width: 320px; height: 400px; border-radius: 50%; mix-blend-mode: screen; background: radial-gradient(50% 50% at 50% 60%, rgba(255, 200, 80, 0.55), rgba(255, 90, 20, 0.25) 50%, transparent 72%);
		transform-origin: 50% 100%; animation: igheat 0.23s steps(2, jump-none) infinite alternate; }
	.heat.k2 { left: 300px; top: 30px; width: 220px; height: 280px; animation-duration: 0.17s; background: radial-gradient(50% 50% at 50% 55%, rgba(255, 240, 170, 0.5), transparent 70%); }
	@keyframes igheat { from { opacity: 0.35; transform: scale(0.96, 0.94); } to { opacity: 0.9; transform: scale(1.03, 1.08); } }
	.ember { width: 9px; height: 9px; margin: -4.5px; border-radius: 50%; background: radial-gradient(circle, #fff6c0, #ff9a2a 50%, transparent 72%); mix-blend-mode: screen; opacity: 0; animation: igember 1.3s var(--d) ease-out infinite; }
	@keyframes igember { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), -190px); } }
	/* the orbs: a glow that breathes and two rings of energy turning opposite ways */
	.orb { width: 0; height: 0; }
	.orb i { position: absolute; border-radius: 50%; mix-blend-mode: screen; }
	.glow { width: 170px; height: 170px; left: -85px; top: -85px; animation: igglow 0.5s ease-in-out infinite alternate; }
	.water .glow { background: radial-gradient(circle, rgba(220, 250, 255, 0.85) 0 14%, rgba(80, 200, 255, 0.6) 34%, transparent 66%); }
	.fire .glow { background: radial-gradient(circle, rgba(255, 250, 210, 0.85) 0 14%, rgba(255, 140, 30, 0.6) 34%, transparent 66%); }
	@keyframes igglow { from { opacity: 0.55; transform: scale(0.9); } to { opacity: 1; transform: scale(1.08); } }
	.sw { width: 132px; height: 132px; left: -66px; top: -66px; -webkit-mask: radial-gradient(circle, transparent 50%, #000 54%, #000 68%, transparent 72%); mask: radial-gradient(circle, transparent 50%, #000 54%, #000 68%, transparent 72%); animation: igspin 0.7s linear infinite; }
	.sw.s2 { width: 104px; height: 104px; left: -52px; top: -52px; animation-duration: 0.5s; animation-direction: reverse; }
	.water .sw { background: conic-gradient(from 0deg, transparent, rgba(150, 235, 255, 0.95) 18%, transparent 34%, rgba(90, 190, 255, 0.85) 62%, transparent 78%); }
	.fire .sw { background: conic-gradient(from 0deg, transparent, rgba(255, 220, 120, 0.95) 18%, transparent 34%, rgba(255, 120, 30, 0.85) 62%, transparent 78%); }
	.fire .sw { animation-direction: reverse; } .fire .sw.s2 { animation-direction: normal; }
	@keyframes igspin { to { transform: rotate(360deg); } }
	/* the pull: each orb's light drawn to the middle */
	.pull { width: 90px; height: 90px; margin: -45px; border-radius: 50%; mix-blend-mode: screen; opacity: 0; animation: igpull 0.7s 1.55s cubic-bezier(0.5, 0, 0.8, 0.6) both; }
	.pull.water { background: radial-gradient(circle, #e8fbff 0 18%, rgba(80, 200, 255, 0.8) 40%, transparent 70%); }
	.pull.fire { background: radial-gradient(circle, #fff8d8 0 18%, rgba(255, 140, 30, 0.8) 40%, transparent 70%); }
	@keyframes igpull { 0% { opacity: 0; transform: none; } 20% { opacity: 1; } 100% { opacity: 1; transform: translate(var(--tx), var(--ty)) scale(0.6); } }
	/* the arc crackling between them while they close in */
	.arcs { left: 0; top: 0; overflow: visible; }
	.arc { fill: none; stroke: #f2e8ff; stroke-width: 5; stroke-linejoin: round; mix-blend-mode: screen; opacity: 0; }
	.arc.a0 { animation: igarc 0.18s 1.25s steps(1) 6 both; }
	.arc.a1 { animation: igarc 0.18s 1.31s steps(1) 6 both; stroke: #9fe6ff; }
	.arc.a2 { animation: igarc 0.18s 1.37s steps(1) 6 both; stroke: #ffc070; }
	@keyframes igarc { 0% { opacity: 1; } 34% { opacity: 0; } 100% { opacity: 0; } }
	/* fusion: a white-violet flash where they meet, a ring rolling out */
	.fuse { width: 260px; height: 260px; margin: -130px; border-radius: 50%; mix-blend-mode: screen; opacity: 0; background: radial-gradient(circle, #ffffff 0 12%, rgba(214, 160, 255, 0.9) 30%, rgba(140, 70, 230, 0.4) 50%, transparent 70%);
		animation: igfuse 0.9s 2.2s ease-out both; }
	@keyframes igfuse { 0% { opacity: 0; transform: scale(0.2); } 18% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.6); } }
	.fring { width: 200px; height: 200px; margin: -100px; border-radius: 50%; border: 10px solid #e7d0ff; opacity: 0; animation: igfring 0.8s 2.25s ease-out both; }
	@keyframes igfring { 0% { opacity: 0; transform: scale(0.2); } 15% { opacity: 0.9; } 100% { opacity: 0; transform: scale(2.6); } }
	.edge { position: absolute; left: 0; top: 0; bottom: 0; width: var(--w); background: linear-gradient(180deg, #ffb060, #c58cff 50%, #4fe0f0); z-index: 2;
		clip-path: polygon(calc(100% - 3px) 0, 100% 0, 84% 100%, calc(84% - 3px) 100%); }
	.copy { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 0 14px 0 0; min-width: 0; }
	.kick { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; background: linear-gradient(90deg, #ffb070, #8fe6f2); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.title { font-weight: normal; font-size: 30px; line-height: 1; color: #fff6f0; white-space: nowrap; -webkit-text-stroke: 1px #12060a; paint-order: stroke fill;
		text-shadow: -6px 0 14px rgba(239, 125, 34, 0.55), 6px 0 14px rgba(47, 208, 230, 0.55), 2px 3px 0 #12060a; animation: igslam 0.45s 0.2s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes igslam { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.sub { font-size: 13px; color: #eadcf2; }
	.sub em { font-style: normal; color: #d8b4ff; }
	/* the fusion's light runs along the band */
	.sheen { position: absolute; top: -20%; bottom: -20%; left: 0; width: 30%; z-index: 3; background: linear-gradient(100deg, transparent, rgba(230, 200, 255, 0.35), transparent); transform: translateX(-120%) skewX(-14deg); animation: igsh 0.8s 2.3s ease-in-out both; }
	@keyframes igsh { to { transform: translateX(420%) skewX(-14deg); } }
	.ph { top: 64px; --w: 118px; --h: 100px; --k: 0.19; }
	.ph .title { font-size: 23px; }
	.ph .sub { font-size: 12px; }
	@media (prefers-reduced-motion: reduce) { .igs *, .igs { animation-duration: 0.01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
</style>
