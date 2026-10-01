<script lang="ts">
	// THE WAVE ADVANCES — a lane push: an arrow-shaped band in the pushing team's colour
	// storms across in the push direction, drawn from the viewer's side: your base is
	// bottom-right, so YOUR team pushes right → left and the enemy pushes left → right
	// (same sides as the battle splash), chevrons streaming through it. A game-winning push reads
	// THE THRONE FALLS / FINAL PUSH instead. Played by every client from `pushNews`.
	import { onDestroy } from 'svelte';
	import type { PushNews } from '$lib/battle';
	import type { Team } from '$lib/match';

	export let news: PushNews | null = null;
	export let mobile = false;
	export let myTeam: Team = 'blue'; // the viewer's team sits on the right (spectators: blue)

	let seen = news?.id ?? null; // joining mid-game: don't replay an old push
	let shown: PushNews | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: if (news && news.id !== seen) {
		seen = news.id;
		if (Date.now() - news.at < 20000) play(news);
	}
	function play(n: PushNews) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = n;
			timer = setTimeout(() => (shown = null), n.won ? 4800 : 3300);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
	const CHEVS = Array.from({ length: 28 }, (_, i) => i);
	$: loser = shown?.winner === 'orange' ? 'blue' : 'orange';
</script>

{#if shown}
	{#key shown.id}
		<div class="ps {shown.winner}" class:won={!!shown.won} class:fromR={shown.winner === myTeam} class:mob={mobile} aria-live="polite">
			<!-- one plain arrow: a body + an SVG head, pointing the way the wave moves -->
			<div class="arrow">
				<div class="body">
					<div class="chevs">{#each CHEVS as i (i)}<i></i>{/each}</div>
					<div class="glint"></div>
				</div>
				<svg class="head" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,0 60,50 0,100" /></svg>
			</div>
			<div class="txt">
				<span class="kick">{cap(shown.winner)} pushes</span>
				{#if shown.won}
					<span class="big">{shown.to === null && shown.won.includes('throne') ? 'The throne falls' : 'Final push'}</span>
					<span class="sub">{cap(shown.winner)} wins the game!</span>
				{:else}
					<span class="big">The wave advances</span>
					<span class="sub">Battle zone → <b>{shown.to}</b> · Waves {shown.wavesBefore} → {shown.wavesAfter}</span>
				{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.ps { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; display: grid; place-items: center; --T: 3.3s; }
	.ps.won { --T: 4.8s; }
	.ps.orange { --c: #ef7d22; --c2: #ffb36b; --cd: #6b2d06; }
	.ps.blue { --c: #2f7fe6; --c2: #8cc0ff; --cd: #0f2f63; }

	/* the arrow: storms in from behind, holds while the chevrons race, then shoots off ahead.
	   Built from plain boxes + an SVG head and animated with transform only — no clip-path,
	   no blur, no `scale: -1` mirroring (iOS Safari drew those differently). Your team
	   pushes right → left (.fromR: head on the left, its own keyframes). */
	.arrow { position: absolute; left: -3vw; right: 5vw; top: calc(50% - var(--h) / 2); height: var(--h); display: flex; --h: calc(200px * var(--uis, 1)); --hw: calc(110px * var(--uis, 1));
		animation: stormL var(--T) cubic-bezier(.2, .85, .25, 1) both; }
	.fromR .arrow { left: 5vw; right: -3vw; flex-direction: row-reverse; animation-name: stormR; }
	@keyframes stormL { 0% { transform: translateX(-110vw); } 12% { transform: translateX(0); } 86% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(110vw); opacity: .3; } }
	@keyframes stormR { 0% { transform: translateX(110vw); } 12% { transform: translateX(0); } 86% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(-110vw); opacity: .3; } }
	.body { position: relative; flex: 1; min-width: 0; overflow: hidden; background: linear-gradient(90deg, var(--cd) 0%, var(--c) 45%, var(--c2) 100%); }
	.fromR .body { background: linear-gradient(270deg, var(--cd) 0%, var(--c) 45%, var(--c2) 100%); }
	.head { flex: none; width: var(--hw); height: 100%; margin-left: -1px; fill: var(--c2); }
	.fromR .head { margin: 0 -1px 0 0; transform: scaleX(-1); }
	.won .body { box-shadow: inset 0 4px 0 #ffd27a, inset 0 -4px 0 #ffd27a; }
	.won .head polygon { stroke: #ffd27a; stroke-width: 4; vector-effect: non-scaling-stroke; }
	/* a row of chevrons streaming in the push direction */
	.chevs { position: absolute; top: 50%; left: 0; display: flex; gap: 46px; margin-top: -35px; animation: streamL .55s linear infinite; }
	.chevs i { flex: none; width: 70px; height: 70px; border-top: 16px solid rgba(255, 255, 255, .22); border-right: 16px solid rgba(255, 255, 255, .22);
		transform: rotate(45deg); box-sizing: border-box; }
	.fromR .chevs { left: auto; right: 0; animation-name: streamR; }
	.fromR .chevs i { transform: rotate(-135deg); }
	@keyframes streamL { from { transform: translateX(-116px); } to { transform: translateX(0); } }
	@keyframes streamR { from { transform: translateX(116px); } to { transform: translateX(0); } }
	.glint { position: absolute; top: 0; bottom: 0; width: 30%; left: -30%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .45), transparent); animation: glintL 1.1s ease-out .25s both; }
	.fromR .glint { animation-name: glintR; }
	@keyframes glintL { from { left: -30%; } to { left: 110%; } }
	@keyframes glintR { from { left: 110%; } to { left: -30%; } }

	.txt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1); text-align: center;
		color: #fff; text-shadow: 0 3px 0 var(--cd), 0 0 26px rgba(0, 0, 0, .85), 0 0 50px rgba(0, 0, 0, .6); }
	.kick { font-size: 1rem; letter-spacing: .45em; text-transform: uppercase; color: #fff4e0; animation: fade .3s ease .25s both, out var(--T) ease both; }
	.big { font-size: 4.2rem; line-height: 1; text-transform: uppercase; letter-spacing: .03em; animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .2s both, out var(--T) ease both; }
	.sub { font-size: 1.1rem; letter-spacing: .1em; color: #fff4e0; animation: fade .3s ease .45s both, out var(--T) ease both; }
	.sub b { font-weight: normal; color: #fff; }
	.won .big { font-size: 5rem; color: #ffe3a0; text-shadow: 0 4px 0 #5a3a08, 0 0 30px rgba(255, 210, 120, .9), 0 0 70px rgba(0, 0, 0, .8); }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }

	/* phones: the title always fits one line; smaller arrow + chevrons (loop = 48 + 30 px) */
	.mob .arrow { --h: 150px; --hw: 70px; }
	.mob .txt { zoom: 1; padding: 0 10px; }
	.mob .big { font-size: min(2.2rem, 7vw); white-space: nowrap; } .mob.won .big { font-size: min(2.6rem, 7.6vw); }
	.mob .sub { font-size: .74rem; letter-spacing: .04em; } .mob .kick { font-size: .7rem; letter-spacing: .3em; }
	.mob .chevs { gap: 30px; margin-top: -24px; animation-name: streamLM; } .mob.fromR .chevs { animation-name: streamRM; }
	/* only top + right: preflight makes every border solid, so a bare `border-width` drew all four sides (a diamond) */
	.mob .chevs i { width: 48px; height: 48px; border-top-width: 11px; border-right-width: 11px; }
	@keyframes streamLM { from { transform: translateX(-78px); } to { transform: translateX(0); } }
	@keyframes streamRM { from { transform: translateX(78px); } to { transform: translateX(0); } }
</style>
