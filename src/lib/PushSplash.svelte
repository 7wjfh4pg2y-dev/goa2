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
			<div class="band">
				<div class="chevs">{#each CHEVS as i (i)}<i></i>{/each}</div>
				<div class="glint"></div>
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

	/* the arrow band: storms in from behind, holds while the chevrons race, then shoots off ahead */
	/* one plain arrow: flat tail off-screen, the head on-screen pointing the way the wave moves */
	.band { position: absolute; left: -14%; width: 106%; top: 50%; height: 200px; zoom: var(--uis, 1); overflow: hidden;
		clip-path: polygon(0 0, calc(100% - 130px) 0, 100% 50%, calc(100% - 130px) 100%, 0 100%);
		background: linear-gradient(90deg, var(--cd) 0%, var(--c) 45%, var(--c2) 92%);
		animation: storm var(--T) cubic-bezier(.2, .85, .25, 1) both; }
	.fromR .band { left: auto; right: -14%; transform-origin: center; scale: -1 1; } /* your team pushes from the right */
	@keyframes storm {
		0% { transform: translateY(-50%) translateX(-110%); filter: blur(8px); }
		12% { transform: translateY(-50%) translateX(0); filter: blur(0); }
		86% { transform: translateY(-50%) translateX(0); opacity: 1; filter: blur(0); }
		100% { transform: translateY(-50%) translateX(115%); opacity: .4; filter: blur(8px); }
	}
	/* a row of chevrons streaming in the push direction */
	.chevs { position: absolute; top: 50%; left: 0; display: flex; gap: 46px; transform: translateY(-50%); animation: stream .55s linear infinite; }
	.chevs i { flex: none; width: 70px; height: 70px; border-top: 16px solid rgba(255, 255, 255, .22); border-right: 16px solid rgba(255, 255, 255, .22);
		transform: rotate(45deg); box-sizing: border-box; }
	@keyframes stream { from { translate: -116px 0; } to { translate: 0 0; } }
	.glint { position: absolute; top: 0; bottom: 0; width: 30%; left: -30%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .45), transparent); animation: glint 1.1s ease-out .25s both; }
	@keyframes glint { to { left: 110%; } }

	.txt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1); text-align: center;
		color: #fff; text-shadow: 0 3px 0 var(--cd), 0 0 26px rgba(0, 0, 0, .85), 0 0 50px rgba(0, 0, 0, .6); }
	.kick { font-size: 1rem; letter-spacing: .45em; text-transform: uppercase; color: #fff4e0; animation: fade .3s ease .25s both, out var(--T) ease both; }
	.big { font-size: 4.2rem; line-height: 1; text-transform: uppercase; letter-spacing: .03em; animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .2s both, out var(--T) ease both; }
	.sub { font-size: 1.1rem; letter-spacing: .1em; color: #fff4e0; animation: fade .3s ease .45s both, out var(--T) ease both; }
	.sub b { font-weight: normal; color: #fff; }
	.won .big { font-size: 5rem; color: #ffe3a0; text-shadow: 0 4px 0 #5a3a08, 0 0 30px rgba(255, 210, 120, .9), 0 0 70px rgba(0, 0, 0, .8); }
	.won .band { box-shadow: inset 0 0 0 4px #ffd27a; }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }

	/* phones: the title always fits one line, a bold arrow head, and the chevron loop
	   matches the smaller chevron spacing (48 + 30 px) */
	.mob .band { height: 150px; zoom: 1; left: -16%; width: 110%; clip-path: polygon(0 0, calc(100% - 80px) 0, 100% 50%, calc(100% - 80px) 100%, 0 100%); }
	.mob .txt { zoom: 1; padding: 0 10px; }
	.mob .big { font-size: min(2.2rem, 7vw); white-space: nowrap; } .mob.won .big { font-size: min(2.6rem, 7.6vw); }
	.mob .sub { font-size: .74rem; letter-spacing: .04em; } .mob .kick { font-size: .7rem; letter-spacing: .3em; }
	.mob.fromR .band { left: auto; right: -16%; }
	.mob .chevs { gap: 30px; animation-name: streamM; }
	.mob .chevs i { width: 48px; height: 48px; border-width: 11px; }
	@keyframes streamM { from { translate: -78px 0; } to { translate: 0 0; } }
</style>
