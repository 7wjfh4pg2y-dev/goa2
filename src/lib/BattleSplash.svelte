<script lang="ts">
	// MINION BATTLE — drawn from the viewer's side: YOUR team charges in from the right
	// (your base is bottom-right), the enemy from the left. They collide in the middle and
	// the winner shoves straight through,
	// clean off the band ("Titans win — Atlanteans remove 2"). A tie grinds back and forth,
	// locks up and recoils over a purple glow: DEADLOCK. Played by every client from the shared `battleNews` (match.ts); the
	// removal step on the board waits until the slash has gone (`onDone`).
	import { teamName } from '$lib/teams';
	import { onDestroy } from 'svelte';
	import type { BattleNews, Team } from '$lib/match';

	export let news: BattleNews | null = null;
	export let mobile = false;
	export let onDone: () => void = () => {};
	export let myTeam: Team = 'blue'; // the viewer's team sits on the right (spectators: blue)

	const TIE_MS = 4300, WIN_MS = 3400;
	let seen = news?.id ?? null; // joining mid-game: don't replay an old battle
	let shown: BattleNews | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: if (news && news.id !== seen) {
		seen = news.id;
		if (Date.now() - news.at < 15000) play(news);
	}
	function play(n: BattleNews) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = n;
			timer = setTimeout(() => { shown = null; onDone(); }, n.loser ? WIN_MS : TIE_MS);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	$: L = (myTeam === 'orange' ? 'blue' : 'orange') as Team; // the enemy, on the left
	$: R = myTeam;
	$: winner = !shown?.loser ? null : shown.loser === 'orange' ? 'blue' : 'orange';
	$: outcome = !winner ? 'tie' : winner === L ? 'lwin' : 'rwin';
	const COL: Record<Team, [string, string, string]> = { orange: ['#ef7d22', '#ffb36b', '#ffd2a8'], blue: ['#2f7fe6', '#8cc0ff', '#cfe3ff'] };
	$: vars = `--l:${COL[L][0]};--l2:${COL[L][1]};--lt:${COL[L][2]};--r:${COL[R][0]};--r2:${COL[R][1]};--rt:${COL[R][2]}`;
</script>

{#if shown}
	{#key shown.id}
		<div class="bs {outcome}" class:mob={mobile} style={vars} aria-live="polite">
			<div class="band">
				<div class="side l"><span class="front"></span></div>
				<div class="side r"></div>
				<div class="impact"></div>
			</div>
			<div class="txt title">
				<span class="kick">Minion Battle</span>
				<span class="score"><b class="sl">{shown[L]}</b><i>⚔</i><b class="sr">{shown[R]}</b></span>
			</div>
			<div class="txt result">
				{#if outcome === 'tie'}
					<span class="big dead">Deadlock</span>
					<span class="sub">No minions removed</span>
				{:else}
					<span class="big win">{teamName(winner)} win</span>
					<span class="sub">{teamName(shown.loser)} remove <b>{shown.remove}</b> minion{shown.remove === 1 ? '' : 's'}</span>
				{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.bs { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; display: grid; place-items: center;
		--T: 4.3s; }

	/* the blade band: slashes in from the left, holds, slashes out to the right */
	.band { position: absolute; left: -8%; width: 116%; top: 50%; height: 190px; zoom: var(--uis, 1); overflow: hidden;
		transform: translateY(-50%) skewY(-3deg); background: #070a12;
		border-top: 3px solid #d9a845; border-bottom: 3px solid #d9a845; box-shadow: 0 0 70px rgba(0, 0, 0, .85);
		animation: band var(--T) cubic-bezier(.16, .9, .2, 1) both; }
	@keyframes band {
		0% { transform: translateY(-50%) skewY(-3deg) translateX(-105%); filter: blur(6px); }
		7% { transform: translateY(-50%) skewY(-3deg) translateX(0); filter: blur(0); }
		91% { transform: translateY(-50%) skewY(-3deg) translateX(0); opacity: 1; filter: blur(0); }
		100% { transform: translateY(-50%) skewY(-3deg) translateX(105%); opacity: .3; filter: blur(6px); }
	}

	/* the two armies: each a colour wall; the left army's leading edge is the battle front */
	.side { position: absolute; top: 0; bottom: 0; }
	.side.l { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--l) 55%, #000), var(--l) 70%, var(--l2)); }
	.side.r { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--r) 55%, #000), var(--r) 70%, var(--r2)); }
	.front { position: absolute; right: -6px; top: -20%; bottom: -20%; width: 12px; background: linear-gradient(180deg, transparent, #fff 30%, #fff 70%, transparent);
		box-shadow: 0 0 26px 10px rgba(255, 255, 255, .7), 0 0 60px 20px rgba(255, 220, 160, .45); opacity: 0; transform: skewX(-12deg);
		animation: front var(--T) linear both; }
	@keyframes front { 0%, 13% { opacity: 0; } 15% { opacity: 1; } 62% { opacity: 1; } 70%, 100% { opacity: .0; } }

	/* WIN (3.4 s): charge in (7–18%) · slam together · the winner shoves straight through (24–40%) */
	.lwin, .rwin { --T: 3.4s; }
	.lwin .side.l, .rwin .side.r { animation: win var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	.lwin .side.r, .rwin .side.l { animation: lose var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	@keyframes win  { 0%, 7% { width: 0; } 18% { width: 50%; } 21% { width: 47%; } 24% { width: 50%; } 40%, 100% { width: 100%; } }
	@keyframes lose { 0%, 7% { width: 0; } 18% { width: 50%; } 21% { width: 53%; } 24% { width: 50%; } 40%, 100% { width: 0; } }
	.lwin .front, .rwin .front { animation: frontW var(--T) linear both; }
	@keyframes frontW { 0%, 16% { opacity: 0; } 18%, 38% { opacity: 1; } 44%, 100% { opacity: 0; } }
	.lwin .impact, .rwin .impact { animation: impactW var(--T) ease-out both; }
	@keyframes impactW { 0%, 17% { opacity: 0; } 19% { opacity: .9; } 26% { opacity: 0; } 38% { opacity: 0; } 40.5% { opacity: .55; } 48%, 100% { opacity: 0; } }
	.lwin .band, .rwin .band { animation: band var(--T) cubic-bezier(.16, .9, .2, 1) both, shakeW var(--T) linear both; }
	@keyframes shakeW { 0%, 18% { translate: 0 0; } 19% { translate: 7px -3px; } 20% { translate: -5px 2px; } 21% { translate: 3px 0; } 22%, 39% { translate: 0 0; } 40.5% { translate: 9px -2px; } 41.5% { translate: -6px 3px; } 42.5% { translate: 2px 0; } 43.5%, 100% { translate: 0 0; } }

	/* DEADLOCK (4.3 s): they grind back and forth, lock up, and both recoil — the gap glows purple */
	.tie .band { background: radial-gradient(ellipse at center, #b07ad6 0%, #7a4292 38%, #3b1f52 75%, #1c1028 100%);
		animation: band var(--T) cubic-bezier(.16, .9, .2, 1) both, shake var(--T) linear both; }
	.tie .side.l { animation: oTie var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	.tie .side.r { animation: bTie var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	@keyframes oTie  { 0%, 6% { width: 0; } 15% { width: 50%; } 20% { width: 46%; } 26% { width: 54%; } 32% { width: 47%; } 38% { width: 53%; } 44% { width: 49%; } 52% { width: 50%; } 60%, 100% { width: 38%; } }
	@keyframes bTie  { 0%, 6% { width: 0; } 15% { width: 50%; } 20% { width: 54%; } 26% { width: 46%; } 32% { width: 53%; } 38% { width: 47%; } 44% { width: 51%; } 52% { width: 50%; } 60%, 100% { width: 38%; } }
	.tie .front { display: none; } /* no white seam over the purple */
	.tie .impact { animation: impact var(--T) ease-out both; }
	@keyframes impact { 0%, 14% { opacity: 0; } 15.5% { opacity: .9; } 22%, 100% { opacity: 0; } }
	@keyframes shake { 0%, 15% { translate: 0 0; } 16% { translate: 6px -3px; } 17% { translate: -5px 2px; } 18% { translate: 3px 0; } 19%, 59% { translate: 0 0; } 60% { translate: 8px -2px; } 61% { translate: -6px 3px; } 62% { translate: 2px 0; } 63%, 100% { translate: 0 0; } }
	.impact { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255, 255, 255, .9), rgba(255, 255, 255, 0) 55%); opacity: 0; }

	/* words */
	.txt { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1); transform: skewY(-3deg);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .65), 0 0 24px rgba(0, 0, 0, .95), 0 0 50px rgba(0, 0, 0, .8); }
	.title { animation: title var(--T) ease both; }
	.lwin .title, .rwin .title { animation-name: titleW; }
	@keyframes titleW { 0%, 16% { opacity: 0; transform: skewY(-3deg) scale(1.8); filter: blur(4px); } 21% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 36% { opacity: 1; } 41%, 100% { opacity: 0; transform: skewY(-3deg) scale(.9); } }
	@keyframes title { 0%, 13% { opacity: 0; transform: skewY(-3deg) scale(1.8); filter: blur(4px); } 18% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 46% { opacity: 1; } 52%, 100% { opacity: 0; transform: skewY(-3deg) scale(.9); } }
	.kick { font-size: .95rem; letter-spacing: .45em; text-transform: uppercase; color: #ecd9a8; }
	.score { display: flex; align-items: center; gap: 18px; font-size: 4rem; line-height: 1; }
	.score b { font-weight: normal; } .score .sl { color: var(--lt); } .score .sr { color: var(--rt); }
	.score i { font-style: normal; font-size: .5em; color: #f6ead2; }
	.result { animation: result var(--T) ease both; }
	.lwin .result, .rwin .result { animation-name: resultW; }
	@keyframes resultW { 0%, 40% { opacity: 0; transform: skewY(-3deg) scale(1.9); filter: blur(5px); } 46% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 90% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes result { 0%, 58% { opacity: 0; transform: skewY(-3deg) scale(1.9); filter: blur(5px); } 63% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 90% { opacity: 1; } 100% { opacity: 0; } }
	.big { font-size: 4.4rem; line-height: 1; letter-spacing: .03em; text-transform: uppercase; }
	.lwin .win { color: #fff; text-shadow: 0 3px 0 color-mix(in srgb, var(--l) 45%, #000), 0 0 30px var(--l), 0 0 60px rgba(0, 0, 0, .8); }
	.rwin .win { color: #fff; text-shadow: 0 3px 0 color-mix(in srgb, var(--r) 45%, #000), 0 0 30px var(--r), 0 0 60px rgba(0, 0, 0, .8); }
	.dead { color: #f3e8ff; text-shadow: 0 3px 0 #3b1f52, 0 0 30px rgba(190, 130, 240, .9), 0 0 60px rgba(0, 0, 0, .9); animation: rattle .35s linear 2.6s 2; }
	@keyframes rattle { 25% { translate: -4px 0; } 75% { translate: 4px 0; } }
	.sub { font-size: 1.15rem; letter-spacing: .12em; color: #f6ead2; }
	.sub b { font-weight: normal; color: #ffd27a; }

	/* phones: a slimmer band and smaller words */
	.mob .band { height: 130px; zoom: 1; }
	.mob .txt { zoom: 1; }
	.mob .score { font-size: 2.6rem; } .mob .big { font-size: min(2.5rem, 7.6vw); white-space: nowrap; } .mob .sub { font-size: .8rem; } .mob .kick { font-size: .7rem; }
</style>
