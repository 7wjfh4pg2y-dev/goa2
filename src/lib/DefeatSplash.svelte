<script lang="ts">
	// A hero falls: a fast horizontal strike across the screen, drawn from the viewer's
	// side — YOUR team on the right (your base is bottom-right), the enemy on the left and
	// named first: "Enemy defeated by Mine" or "Enemy defeats Mine". The fallen hero is
	// greyed out, the killer in full colour; the strike comes from the killer's side.
	// What it paid out sits below.
	// Driven by the shared `lastDefeat` news (match.ts); it never blocks the board.
	import { teamName } from '$lib/teams';
	import { onDestroy } from 'svelte';
	import { heroById, heroSplash } from '$lib/heroes';
	import type { DefeatNews, Piece, Team } from '$lib/match';
	import type { PlayerCardState } from '$lib/cards/cardstate';

	export let news: DefeatNews | null = null;
	export let pieces: Record<string, Piece> = {};
	export let cards: Record<string, PlayerCardState> = {};
	export let defeated: Record<string, { piece: Piece }> = {};
	export let names: (id: string) => string = (id) => id;
	export let lifeArt: (t: Team, side: 'front' | 'back') => string;
	export let mobile = false;
	export let myTeam: Team = 'blue'; // the viewer's team sits on the right (spectators: blue)

	const HOLD_MS = 3600;
	let seen = news?.id ?? null; // joining mid-game: don't replay an old defeat
	let shown: DefeatNews | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: if (news && news.id !== seen) {
		seen = news.id;
		if (Date.now() - news.at < 15000) play(news);
	}
	function play(n: DefeatNews) {
		shown = null; // restart the animation for back-to-back defeats
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => { shown = n; timer = setTimeout(() => (shown = null), HOLD_MS); });
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });

	const heroOf = (pid: string) => defeated[pid]?.piece.hero ?? pieces[pid]?.hero ?? cards[pid]?.hero ?? '';
	const TEAM = { orange: '#ef7d22', blue: '#2f7fe6' };
	$: vTeam = (shown?.team ?? 'orange') as Team;
	$: kTeam = (vTeam === 'orange' ? 'blue' : 'orange') as Team;
	$: vHero = shown ? heroOf(shown.victim) : '';
	$: kHero = shown ? heroOf(shown.by) : '';
	$: L = (myTeam === 'orange' ? 'blue' : 'orange') as Team; // the enemy
	$: victimLeft = vTeam === L;
	$: left = shown ? (victimLeft ? { pid: shown.victim, hero: vHero, team: vTeam } : { pid: shown.by, hero: kHero, team: kTeam }) : null;
	$: right = shown ? (victimLeft ? { pid: shown.by, hero: kHero, team: kTeam } : { pid: shown.victim, hero: vHero, team: vTeam }) : null;
	const TINT = { orange: '#ffb27a', blue: '#8cc0ff' };
</script>

{#if shown}
	<div class="ds" class:mob={mobile} class:fromR={victimLeft} style="--vc:{TEAM[vTeam]}; --kc:{TEAM[kTeam]}; --lc:{TEAM[left?.team ?? 'orange']}; --rc:{TEAM[right?.team ?? 'blue']}" aria-live="polite">
		<div class="band">
			{#if left?.hero}<img class="art left" class:dead={victimLeft} src={heroSplash(left.hero)} alt="" />{/if}
			{#if right?.hero}<img class="art right" class:dead={!victimLeft} src={heroSplash(right.hero)} alt="" />{/if}
			<div class="flash"></div>
			<div class="txt">
				{#if left && right}
					<div class="nm a" class:fell={victimLeft}><span style:color={TINT[left.team]}>{heroById(left.hero)?.name ?? 'A hero'}</span> <small>({names(left.pid)})</small></div>
					<div class="l2">{victimLeft ? 'defeated by' : 'defeats'}</div>
					<div class="nm b" class:fell={!victimLeft}><span style:color={TINT[right.team]}>{heroById(right.hero)?.name ?? 'a hero'}</span> <small>({names(right.pid)})</small></div>
				{/if}
				<div class="rew">
					<span class="r"><i class="coin"></i>+{shown.coins} <em>{names(shown.by)}</em></span>
					{#each shown.assists as a (a)}<span class="r"><i class="coin"></i>+{shown.assist} <em>{names(a)}</em></span>{/each}
					<span class="r loss"><img src={lifeArt(vTeam, 'back')} alt="" />−{shown.lives} <em>{teamName(vTeam)}</em></span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.ds { position: fixed; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; }
	.band { position: absolute; left: -12%; width: 124%; top: 50%; height: 230px; zoom: var(--uis, 1);
		transform: translateY(-50%) skewY(-4deg); overflow: hidden;
		background: linear-gradient(90deg, color-mix(in srgb, var(--lc) 55%, #05070c) 0%, #070a12 38%, #070a12 62%, color-mix(in srgb, var(--rc) 55%, #05070c) 100%);
		border-top: 3px solid color-mix(in srgb, var(--kc) 70%, #fff); border-bottom: 3px solid color-mix(in srgb, var(--vc) 70%, #fff);
		box-shadow: 0 0 60px rgba(0, 0, 0, 0.8), 0 0 40px color-mix(in srgb, var(--kc) 40%, transparent);
		animation: strike 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	.art { position: absolute; top: 50%; height: 175%; transform: translateY(-50%) skewY(4deg); object-fit: cover; pointer-events: none; }
	.art.left { left: 6%; width: 34%; mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent);
		animation: slideL 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	.art.right { right: 6%; width: 34%; mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent); -webkit-mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent);
		animation: slideR 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	.art { filter: saturate(1.2) brightness(.95); opacity: .85; }
	.art.dead { filter: grayscale(.85) brightness(.7) contrast(1.1); opacity: .75; }
	.flash { position: absolute; inset: 0; background: #fff; opacity: 0; animation: flash .5s ease-out .18s; }
	.txt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
		transform: skewY(4deg); color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .6), 0 0 22px rgba(0, 0, 0, .9); }
	/* both names the same size, bigger than the words between them */
	.nm { font-size: 2.5rem; line-height: 1.05; }
	.nm.a { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .12s both; }
	.nm.b { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .34s both; }
	.l2 { font-size: .95rem; letter-spacing: .35em; text-transform: uppercase; color: #d9c79a; animation: fade .3s ease .3s both; }
	small { font-size: .55em; color: #cbd5e1; }
	.rew { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; margin-top: 10px; font-size: 1rem; animation: fade .3s ease .6s both; }
	.r { display: inline-flex; align-items: center; gap: 5px; color: #ffe7a1; }
	.r em { font-style: normal; font-size: .8em; color: #cbd5e1; }
	.r.loss { color: #ffb4a8; }
	.coin { width: 17px; height: 17px; border-radius: 50%; display: inline-block; background: radial-gradient(circle at 35% 30%, #ffe7a1, #d4a64a 60%, #9a6f22); border: 1px solid #fbe7b0; }
	.r img { width: 20px; height: 20px; object-fit: contain; }
	@keyframes strike {
		0% { transform: translateY(-50%) skewY(-4deg) translateX(-105%); filter: blur(6px); }
		9% { transform: translateY(-50%) skewY(-4deg) translateX(1.5%); filter: blur(0); }
		12% { transform: translateY(-50%) skewY(-4deg) translateX(0); }
		88% { transform: translateY(-50%) skewY(-4deg) translateX(0); opacity: 1; filter: blur(0); }
		100% { transform: translateY(-50%) skewY(-4deg) translateX(105%); opacity: .2; filter: blur(6px); }
	}
	/* a killer on the right (your team) strikes from the right */
	.fromR .band { animation-name: strikeR; }
	@keyframes strikeR {
		0% { transform: translateY(-50%) skewY(-4deg) translateX(105%); filter: blur(6px); }
		9% { transform: translateY(-50%) skewY(-4deg) translateX(-1.5%); filter: blur(0); }
		12% { transform: translateY(-50%) skewY(-4deg) translateX(0); }
		88% { transform: translateY(-50%) skewY(-4deg) translateX(0); opacity: 1; filter: blur(0); }
		100% { transform: translateY(-50%) skewY(-4deg) translateX(-105%); opacity: .2; filter: blur(6px); }
	}
	@keyframes slideL { from { translate: -60px 0; } to { translate: 20px 0; } }
	@keyframes slideR { from { translate: 60px 0; } to { translate: -20px 0; } }
	@keyframes flash { 0% { opacity: .55; } 100% { opacity: 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.8); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	/* phones: a slimmer strike */
	.ds.mob .band { height: 160px; zoom: 1; }
	.ds.mob .nm { font-size: 1.45rem; } .ds.mob .l2 { font-size: .7rem; }
	.ds.mob .rew { font-size: .8rem; gap: 4px 10px; margin-top: 6px; }
	.ds.mob .art { width: 40%; }
</style>
