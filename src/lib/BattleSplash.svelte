<script lang="ts">
	// MINION BATTLE — the blade band slashes in, orange charges from the left and blue
	// from the right, they collide in the middle and the winner shoves straight through,
	// clean off the band ("Blue wins — Orange removes 2"). A tie grinds back and forth,
	// locks up and recoils over a purple glow: DEADLOCK. Played by every client from the shared `battleNews` (match.ts); the
	// removal step on the board waits until the slash has gone (`onDone`).
	import { onDestroy } from 'svelte';
	import type { BattleNews } from '$lib/match';

	export let news: BattleNews | null = null;
	export let mobile = false;
	export let onDone: () => void = () => {};

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
	$: outcome = !shown ? 'tie' : shown.loser === 'orange' ? 'blue' : shown.loser === 'blue' ? 'orange' : 'tie';
	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
</script>

{#if shown}
	{#key shown.id}
		<div class="bs {outcome}" class:mob={mobile} aria-live="polite">
			<div class="band">
				<div class="side o"><span class="front"></span></div>
				<div class="side b"></div>
				<div class="impact"></div>
			</div>
			<div class="txt title">
				<span class="kick">Minion Battle</span>
				<span class="score"><b class="so">{shown.orange}</b><i>⚔</i><b class="sb">{shown.blue}</b></span>
			</div>
			<div class="txt result">
				{#if outcome === 'tie'}
					<span class="big dead">Deadlock</span>
					<span class="sub">No minions removed</span>
				{:else}
					<span class="big win">{cap(outcome)} wins</span>
					<span class="sub">{cap(shown.loser ?? '')} removes <b>{shown.remove}</b> minion{shown.remove === 1 ? '' : 's'}</span>
				{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.bs { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; display: grid; place-items: center;
		--o: #ef7d22; --o2: #ffb36b; --b: #2f7fe6; --b2: #8cc0ff; --T: 4.3s; }

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

	/* the two armies: each a colour wall; orange's leading edge is the battle front */
	.side { position: absolute; top: 0; bottom: 0; }
	.side.o { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--o) 55%, #000), var(--o) 70%, var(--o2)); }
	.side.b { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--b) 55%, #000), var(--b) 70%, var(--b2)); }
	.front { position: absolute; right: -6px; top: -20%; bottom: -20%; width: 12px; background: linear-gradient(180deg, transparent, #fff 30%, #fff 70%, transparent);
		box-shadow: 0 0 26px 10px rgba(255, 255, 255, .7), 0 0 60px 20px rgba(255, 220, 160, .45); opacity: 0; transform: skewX(-12deg);
		animation: front var(--T) linear both; }
	@keyframes front { 0%, 13% { opacity: 0; } 15% { opacity: 1; } 62% { opacity: 1; } 70%, 100% { opacity: .0; } }

	/* WIN (3.4 s): charge in (7–18%) · slam together · the winner shoves straight through (24–40%) */
	.orange, .blue { --T: 3.4s; }
	.orange .side.o, .blue .side.b { animation: win var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	.orange .side.b, .blue .side.o { animation: lose var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	@keyframes win  { 0%, 7% { width: 0; } 18% { width: 50%; } 21% { width: 47%; } 24% { width: 50%; } 40%, 100% { width: 100%; } }
	@keyframes lose { 0%, 7% { width: 0; } 18% { width: 50%; } 21% { width: 53%; } 24% { width: 50%; } 40%, 100% { width: 0; } }
	.orange .front, .blue .front { animation: frontW var(--T) linear both; }
	@keyframes frontW { 0%, 16% { opacity: 0; } 18%, 38% { opacity: 1; } 44%, 100% { opacity: 0; } }
	.orange .impact, .blue .impact { animation: impactW var(--T) ease-out both; }
	@keyframes impactW { 0%, 17% { opacity: 0; } 19% { opacity: .9; } 26% { opacity: 0; } 38% { opacity: 0; } 40.5% { opacity: .55; } 48%, 100% { opacity: 0; } }
	.orange .band, .blue .band { animation: band var(--T) cubic-bezier(.16, .9, .2, 1) both, shakeW var(--T) linear both; }
	@keyframes shakeW { 0%, 18% { translate: 0 0; } 19% { translate: 7px -3px; } 20% { translate: -5px 2px; } 21% { translate: 3px 0; } 22%, 39% { translate: 0 0; } 40.5% { translate: 9px -2px; } 41.5% { translate: -6px 3px; } 42.5% { translate: 2px 0; } 43.5%, 100% { translate: 0 0; } }

	/* DEADLOCK (4.3 s): they grind back and forth, lock up, and both recoil — the gap glows purple */
	.tie .band { background: radial-gradient(ellipse at center, #b07ad6 0%, #7a4292 38%, #3b1f52 75%, #1c1028 100%);
		animation: band var(--T) cubic-bezier(.16, .9, .2, 1) both, shake var(--T) linear both; }
	.tie .side.o { animation: oTie var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	.tie .side.b { animation: bTie var(--T) cubic-bezier(.3, .8, .3, 1) both; }
	@keyframes oTie  { 0%, 6% { width: 0; } 15% { width: 50%; } 20% { width: 46%; } 26% { width: 54%; } 32% { width: 47%; } 38% { width: 53%; } 44% { width: 49%; } 52% { width: 50%; } 60%, 100% { width: 38%; } }
	@keyframes bTie  { 0%, 6% { width: 0; } 15% { width: 50%; } 20% { width: 54%; } 26% { width: 46%; } 32% { width: 53%; } 38% { width: 47%; } 44% { width: 51%; } 52% { width: 50%; } 60%, 100% { width: 38%; } }
	.tie .front { animation: frontTie var(--T) linear both; }
	@keyframes frontTie { 0%, 13% { opacity: 0; } 15%, 52% { opacity: 1; } 60%, 100% { opacity: 0; } }
	.tie .impact { animation: impact var(--T) ease-out both; }
	@keyframes impact { 0%, 14% { opacity: 0; } 15.5% { opacity: .9; } 22% { opacity: 0; } 58% { opacity: 0; } 60% { opacity: .55; } 68%, 100% { opacity: 0; } }
	@keyframes shake { 0%, 15% { translate: 0 0; } 16% { translate: 6px -3px; } 17% { translate: -5px 2px; } 18% { translate: 3px 0; } 19%, 59% { translate: 0 0; } 60% { translate: 8px -2px; } 61% { translate: -6px 3px; } 62% { translate: 2px 0; } 63%, 100% { translate: 0 0; } }
	.impact { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255, 255, 255, .9), rgba(255, 255, 255, 0) 55%); opacity: 0; }

	/* words */
	.txt { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1); transform: skewY(-3deg);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .65), 0 0 24px rgba(0, 0, 0, .95), 0 0 50px rgba(0, 0, 0, .8); }
	.title { animation: title var(--T) ease both; }
	.orange .title, .blue .title { animation-name: titleW; }
	@keyframes titleW { 0%, 16% { opacity: 0; transform: skewY(-3deg) scale(1.8); filter: blur(4px); } 21% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 36% { opacity: 1; } 41%, 100% { opacity: 0; transform: skewY(-3deg) scale(.9); } }
	@keyframes title { 0%, 13% { opacity: 0; transform: skewY(-3deg) scale(1.8); filter: blur(4px); } 18% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 46% { opacity: 1; } 52%, 100% { opacity: 0; transform: skewY(-3deg) scale(.9); } }
	.kick { font-size: .95rem; letter-spacing: .45em; text-transform: uppercase; color: #ecd9a8; }
	.score { display: flex; align-items: center; gap: 18px; font-size: 4rem; line-height: 1; }
	.score b { font-weight: normal; } .score .so { color: #ffd2a8; } .score .sb { color: #cfe3ff; }
	.score i { font-style: normal; font-size: .5em; color: #f6ead2; }
	.result { animation: result var(--T) ease both; }
	.orange .result, .blue .result { animation-name: resultW; }
	@keyframes resultW { 0%, 40% { opacity: 0; transform: skewY(-3deg) scale(1.9); filter: blur(5px); } 46% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 90% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes result { 0%, 58% { opacity: 0; transform: skewY(-3deg) scale(1.9); filter: blur(5px); } 63% { opacity: 1; transform: skewY(-3deg) scale(1); filter: blur(0); } 90% { opacity: 1; } 100% { opacity: 0; } }
	.big { font-size: 4.4rem; line-height: 1; letter-spacing: .03em; text-transform: uppercase; }
	.orange .win { color: #fff2e4; text-shadow: 0 3px 0 #7a3608, 0 0 30px rgba(255, 140, 50, .9), 0 0 60px rgba(0, 0, 0, .8); }
	.blue .win { color: #eef6ff; text-shadow: 0 3px 0 #123f7a, 0 0 30px rgba(80, 150, 255, .9), 0 0 60px rgba(0, 0, 0, .8); }
	.dead { color: #f3e8ff; text-shadow: 0 3px 0 #3b1f52, 0 0 30px rgba(190, 130, 240, .9), 0 0 60px rgba(0, 0, 0, .9); animation: rattle .35s linear 2.6s 2; }
	@keyframes rattle { 25% { translate: -4px 0; } 75% { translate: 4px 0; } }
	.sub { font-size: 1.15rem; letter-spacing: .12em; color: #f6ead2; }
	.sub b { font-weight: normal; color: #ffd27a; }

	/* phones: a slimmer band and smaller words */
	.mob .band { height: 130px; zoom: 1; }
	.mob .txt { zoom: 1; }
	.mob .score { font-size: 2.6rem; } .mob .big { font-size: 2.5rem; } .mob .sub { font-size: .8rem; } .mob .kick { font-size: .7rem; }
</style>
