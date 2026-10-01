<script lang="ts">
	// A hero falls: a fast horizontal strike across the screen for everyone —
	// "Victim (Player) is defeated by Hero (Player)", with what it paid out below.
	// Driven by the shared `lastDefeat` news (match.ts); it never blocks the board.
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
	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
	$: vTeam = (shown?.team ?? 'orange') as Team;
	$: kTeam = (vTeam === 'orange' ? 'blue' : 'orange') as Team;
	$: vHero = shown ? heroOf(shown.victim) : '';
	$: kHero = shown ? heroOf(shown.by) : '';
</script>

{#if shown}
	<div class="ds" class:mob={mobile} style="--vc:{TEAM[vTeam]}; --kc:{TEAM[kTeam]}" aria-live="polite">
		<div class="band">
			<div class="streaks"></div>
			{#if vHero}<img class="art victim" src={heroSplash(vHero)} alt="" />{/if}
			{#if kHero}<img class="art killer" src={heroSplash(kHero)} alt="" />{/if}
			<div class="flash"></div>
			<div class="txt">
				<div class="l1"><span class="vh">{heroById(vHero)?.name ?? 'A hero'}</span> <small>({names(shown.victim)})</small></div>
				<div class="l2">is defeated by</div>
				<div class="l3"><span class="kh">{heroById(kHero)?.name ?? 'a hero'}</span> <small>({names(shown.by)})</small></div>
				<div class="rew">
					<span class="r"><i class="coin"></i>+{shown.coins} <em>{names(shown.by)}</em></span>
					{#each shown.assists as a (a)}<span class="r"><i class="coin"></i>+{shown.assist} <em>{names(a)}</em></span>{/each}
					<span class="r loss"><img src={lifeArt(vTeam, 'back')} alt="" />−{shown.lives} <em>{cap(vTeam)}</em></span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.ds { position: fixed; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; }
	.band { position: absolute; left: -12%; width: 124%; top: 50%; height: 230px; zoom: var(--uis, 1);
		transform: translateY(-50%) skewY(-4deg); overflow: hidden;
		background: linear-gradient(90deg, color-mix(in srgb, var(--vc) 55%, #05070c) 0%, #070a12 38%, #070a12 62%, color-mix(in srgb, var(--kc) 55%, #05070c) 100%);
		border-top: 3px solid color-mix(in srgb, var(--kc) 70%, #fff); border-bottom: 3px solid color-mix(in srgb, var(--vc) 70%, #fff);
		box-shadow: 0 0 60px rgba(0, 0, 0, 0.8), 0 0 40px color-mix(in srgb, var(--kc) 40%, transparent);
		animation: strike 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	/* speed lines racing across */
	.streaks { position: absolute; inset: 0; opacity: .55; mix-blend-mode: screen;
		background: repeating-linear-gradient(180deg, transparent 0 9px, rgba(255, 255, 255, .07) 9px 10px, transparent 10px 23px, rgba(255, 255, 255, .13) 23px 24px),
			repeating-linear-gradient(90deg, transparent 0 140px, rgba(255, 255, 255, .12) 140px 260px, transparent 260px 420px);
		animation: race .5s linear infinite; }
	.art { position: absolute; top: 50%; height: 175%; transform: translateY(-50%) skewY(4deg); object-fit: cover; pointer-events: none; }
	.art.victim { left: 6%; width: 34%; filter: grayscale(.85) brightness(.7) contrast(1.1); opacity: .75;
		mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent);
		animation: slideL 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	.art.killer { right: 6%; width: 34%; filter: saturate(1.2) brightness(.95); opacity: .85;
		mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent); -webkit-mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent);
		animation: slideR 3.6s cubic-bezier(.16, .9, .2, 1) forwards; }
	.flash { position: absolute; inset: 0; background: #fff; opacity: 0; animation: flash .5s ease-out .18s; }
	.txt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
		transform: skewY(4deg); color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .6), 0 0 22px rgba(0, 0, 0, .9); }
	.l1 { font-size: 2.7rem; line-height: 1; animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .12s both; }
	.l1 .vh { color: color-mix(in srgb, var(--vc) 65%, #fff); }
	.l2 { font-size: .95rem; letter-spacing: .35em; text-transform: uppercase; color: #d9c79a; animation: fade .3s ease .3s both; }
	.l3 { font-size: 1.75rem; line-height: 1.05; animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .34s both; }
	.l3 .kh { color: color-mix(in srgb, var(--kc) 60%, #fff); }
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
	@keyframes race { to { background-position: 0 0, -420px 0; } }
	@keyframes slideL { from { translate: -60px 0; } to { translate: 20px 0; } }
	@keyframes slideR { from { translate: 60px 0; } to { translate: -20px 0; } }
	@keyframes flash { 0% { opacity: .55; } 100% { opacity: 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.8); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	/* phones: a slimmer strike */
	.ds.mob .band { height: 160px; zoom: 1; }
	.ds.mob .l1 { font-size: 1.6rem; } .ds.mob .l3 { font-size: 1.1rem; } .ds.mob .l2 { font-size: .7rem; }
	.ds.mob .rew { font-size: .8rem; gap: 4px 10px; margin-top: 6px; }
	.ds.mob .art { width: 40%; }
</style>
