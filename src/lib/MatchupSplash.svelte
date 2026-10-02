<script lang="ts">
	// Team-vs-Team splash shown once every hero is locked: each player's hero
	// hangs as a cloth war banner (art up top, sigil + name, stats and roles on
	// the cloth below). The Atlanteans (orange) hang on the left, the Titans (blue) on the right, a VS crest
	// between. The host starts the game from here.
	import { teamName } from '$lib/teams';
	import { onDestroy, onMount } from 'svelte';
	import { heroCards } from '$lib/cards/deck';
	import { startingHand } from '$lib/cards/cardstate';
	import { prewarm, preloadArt } from '$lib/cards/render';
	import {
		heroById, heroSplash, heroLogo, statIcon, traitIcon, starIcon,
		STAT_LABELS, STAT_PIPS, TRAIT_LABELS, type Trait
	} from '$lib/heroes';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';

	export let orange: string[];
	export let blue: string[];
	export let picks: Record<string, string>;
	export let nameOf: (id: string) => string;
	export let clientId: string;
	export let iAmHost: boolean;
	export let onStart: () => void;

	// the host's button appears once the banners have dropped and settled
	let ready = false;
	const readyTimer = setTimeout(() => (ready = true), 1900);
	onDestroy(() => clearTimeout(readyTimer));

	// loading screen: download everyone's card art and paint your whole deck now,
	// so the board opens with every card ready
	let prep = { done: 0, total: 0 };
	onMount(() => {
		preloadArt([...new Set(Object.values(picks).filter(Boolean))]);
		const mine = picks[clientId];
		if (mine) {
			// your starting hand first (what the board shows immediately), then the rest of the deck
			const all = heroCards(mine), first = new Set(startingHand(mine));
			const order = [...first, ...all.map((_, i) => i).filter((i) => !first.has(i))].map((i) => all[i]).filter((c) => c && !c.handicapped);
			prewarm(mine, order, (done, total) => (prep = { done, total }));
		}
	});

	$: dense = Math.max(orange.length, blue.length) >= 3;
	$: packed = Math.max(orange.length, blue.length) >= 4; // 4–5 a side go most compact
	const pip = (stat: [number, number], i: number) => (i < stat[0] ? 2 : i < stat[1] ? 1 : 0);
	const roles = (traits: Trait[]) => [...traits].sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b]));
	// stagger the drop: orange from the centre outwards, then blue
	const delay = (team: 'orange' | 'blue', i: number, n: number) =>
		0.15 + (team === 'orange' ? n - 1 - i : n + i) * 0.13;
</script>

<div class="splash" class:dense class:packed style="--n:{Math.max(orange.length, blue.length, 1)}" role="dialog" aria-label="Team versus team">
	<div class="wash orange"></div>
	<div class="wash blue"></div>
	<div class="head"><i class="hrule"></i><span>The battle lines are drawn</span><i class="hrule r"></i></div>

	<div class="arena">
		{#each [{ team: 'orange', ids: orange }, { team: 'blue', ids: blue }] as side, si (side.team)}
			{#if si === 1}
				<div class="crest">
					<img class="coin" src={coinOrange} alt="" />
					<div class="disc"><span>VS</span></div>
					<img class="coin" src={coinBlue} alt="" />
				</div>
			{/if}
			<div class="side {side.team}">
				<div class="teamname">{teamName(side.team)}</div>
				<div class="banners">
					{#each side.ids as id, i (id)}
						{@const h = picks[id] ? heroById(picks[id]) : undefined}
						<div class="banner" style="--d:{delay(side.team === 'orange' ? 'orange' : 'blue', i, side.ids.length)}s">
							<div class="hang">
								<div class="rod"></div>
								<div class="cloth {side.team}">
									<div class="cloth-in">
										{#if h}
											<div class="art"><img src={heroSplash(h.id)} alt={h.name} /></div>
											<img class="sigil" src={heroLogo(h.id)} alt="" />
											<div class="hname" style="--nl:{h.name.length}">{h.name}</div>
											<div class="htitle">{h.title}</div>
											<div class="who" class:me={id === clientId}>{nameOf(id)}{id === clientId ? ' · you' : ''}</div>
											<div class="cx">{#each Array(h.stars) as _, s (s)}<img src={starIcon()} alt="★" />{/each}</div>
											<div class="stats">
												{#each h.stats as st, k (k)}
													<div class="srow" title="{STAT_LABELS[k]} {st[0]}{st[1] > st[0] ? ` → ${st[1]}` : ''}">
														<img src={statIcon(k)} alt={STAT_LABELS[k]} />
														<span class="pips">{#each Array(STAT_PIPS) as _, c (c)}<i class="p{pip(st, c)}"></i>{/each}</span>
													</div>
												{/each}
											</div>
											<div class="roles">
												{#each roles(h.traits) as t (t)}
													<div class="role" title={TRAIT_LABELS[t]}>
														{#if traitIcon(t)}<img src={traitIcon(t)} alt="" />{:else}<span class="rdot">◈</span>{/if}
														<span>{TRAIT_LABELS[t]}</span>
													</div>
												{/each}
											</div>
										{:else}
											<div class="art empty"><span>?</span></div>
											<div class="hname">—</div>
											<div class="who">{nameOf(id)}</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="foot">
		{#if iAmHost}
			<button class="btn btn-duo btn-lg begin" class:show={ready} disabled={!ready} on:click={onStart}>⚔ Begin the battle</button>
		{:else}
			<span class="wait" class:show={ready}>Waiting for the host to begin…</span>
		{/if}
		{#if prep.total}
			<span class="prep" class:done={prep.done >= prep.total}>
				{prep.done >= prep.total ? '✓ Your cards are ready' : `Preparing your cards… ${prep.done}/${prep.total}`}
				<i style="--p:{prep.done / prep.total}"></i>
			</span>
		{/if}
	</div>
</div>

<style>
	/* Colours, type sizes and the Begin button come from ui/tide.css (the draft's root carries .tide);
	   the hanging banners (rod + pointed cloth in the team's colour) are this screen's own. */
	.splash { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; overflow: hidden; color: var(--ink, #f5f1e8);
		background: radial-gradient(120% 90% at 50% 42%, #0e2a46, #04101d 78%, #030b15); animation: fade 0.45s ease both;
		--bw: min(272px, calc((100cqw - 200px) / (2 * var(--n)) - 22px)); --bh: 680px; }
	/* (the banners never ask for more width than the row has: 100cqw = the draft screen, which is a container) */
	.splash.dense { --bw: min(196px, calc((100cqw - 200px) / (2 * var(--n)) - 14px)); --bh: 640px; }
	/* 4–5 a side: as wide as the row allows */
	.splash.packed { --bw: min(168px, calc((100cqw - 250px) / (2 * var(--n)) - 10px)); --bh: 600px; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	.wash { position: absolute; top: 0; bottom: 0; width: 55%; pointer-events: none; opacity: 0; animation: fade 1.2s 0.3s ease forwards; }
	.wash.orange { left: 0; background: radial-gradient(70% 60% at 14% 45%, rgba(239,125,34,0.24), transparent 70%); }
	.wash.blue { right: 0; background: radial-gradient(70% 60% at 86% 45%, rgba(47,127,230,0.28), transparent 70%); }

	/* title: brass capitals between two rules */
	.head { position: relative; flex: none; margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 22px;
		font-size: 34px; line-height: 1.1; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; color: var(--brass-hi, #f4dfa8);
		text-shadow: 0 2px 14px rgba(0,0,0,0.7); animation: fade 0.8s 0.1s ease both; }
	.hrule { flex: none; width: 180px; height: 1px; background: linear-gradient(90deg, transparent, var(--brass, #d8b36a)); opacity: 0.6; }
	.hrule.r { transform: scaleX(-1); }

	.arena { position: relative; flex: 1; width: 100%; display: flex; align-items: flex-start; justify-content: center; gap: 26px; padding-top: 10px; }
	.side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.teamname { font-size: 24px; line-height: 1.15; letter-spacing: 0.14em; text-transform: uppercase; animation: fade 0.8s 0.2s ease both; }
	.side.orange .teamname { color: var(--orange-hi, #ffb878); text-shadow: 0 0 16px rgba(239,125,34,0.55); }
	.side.blue .teamname { color: var(--blue-hi, #9ccbff); text-shadow: 0 0 16px rgba(47,127,230,0.6); }
	.banners { display: flex; gap: 22px; }
	.dense .banners { gap: 14px; }
	.dense .arena { gap: 18px; }
	.packed .banners { gap: 10px; }
	/* desktop/iPad: three columns (orange · VS · blue) with equal outer columns, so the
	   VS crest sits dead centre whatever the team sizes — even with an empty side */
	@media (min-width: 761px) {
		.arena { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; }
		.side.orange { grid-column: 1; justify-self: end; }
		.crest { grid-column: 2; }
		.side.blue { grid-column: 3; justify-self: start; }
	}

	/* VS crest: the two coins either side of a navy disc with a brass ring */
	.crest { align-self: center; flex: none; margin-top: -40px; display: flex; flex-direction: column; align-items: center; gap: 12px; animation: crestIn 0.7s 0.5s cubic-bezier(0.2,0.9,0.2,1.3) both; }
	.coin { width: 56px; height: 56px; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)); }
	.disc { width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center;
		background: radial-gradient(circle at 50% 30%, #1d4468, #0a1f35 75%); border: 2px solid var(--brass, #d8b36a);
		box-shadow: 0 0 0 6px rgba(216,179,106,0.14), 0 0 40px rgba(216,179,106,0.28), inset 0 0 18px rgba(0,0,0,0.6); }
	.disc span { font-size: 40px; line-height: 1; color: var(--brass-hi, #f4dfa8); letter-spacing: 0.04em; text-shadow: 0 0 18px rgba(244,223,168,0.4); }
	@keyframes crestIn { from { opacity: 0; transform: scale(0.4) rotate(-20deg); } to { opacity: 1; transform: none; } }

	/* a banner drops in from above and swings to rest */
	.banner { width: var(--bw); transform-origin: top center; animation: drop 1s var(--d) cubic-bezier(0.25,0.9,0.3,1) both; }
	@keyframes drop {
		0% { transform: translateY(-115%) rotate(0); opacity: 0; }
		45% { opacity: 1; }
		62% { transform: translateY(3%) rotate(2.2deg); }
		80% { transform: translateY(-1%) rotate(-1.4deg); }
		100% { transform: translateY(0) rotate(0); opacity: 1; }
	}

	/* the rod: brass */
	.rod { position: relative; z-index: 2; height: 11px; margin: 0 -6px -3px; border-radius: 6px;
		background: linear-gradient(180deg, var(--brass-hi, #f4dfa8), var(--brass, #d8b36a) 42%, var(--brass-lo, #a8853f) 78%, #6f5622); box-shadow: 0 4px 10px rgba(0,0,0,0.6); }

	/* cloth: a brass trim (outer) around the team-coloured cloth (inner), swallowtail hem */
	.cloth { position: relative; height: var(--bh); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 91%, 0 100%);
		background: linear-gradient(180deg, var(--brass-hi, #f4dfa8), var(--brass, #d8b36a) 50%, var(--brass-lo, #a8853f)); filter: drop-shadow(0 18px 26px rgba(0,0,0,0.6)); }
	.cloth-in { position: absolute; inset: 0 4px 4px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), 50% calc(91% - 3px), 0 calc(100% - 4px));
		display: flex; flex-direction: column; align-items: center; padding-bottom: 60px;
		background: repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 6px), var(--cloth); }
	.cloth.orange { --cloth: linear-gradient(180deg, #b9561c 0%, #86380f 48%, #561f07 100%); }
	.cloth.blue { --cloth: linear-gradient(180deg, #2a64b8 0%, #1a4585 48%, #0d2a55 100%); }

	.art { position: relative; width: 100%; height: 40%; flex: none; overflow: hidden; }
	.art img { width: 100%; height: 100%; object-fit: cover; object-position: center 24%; display: block; }
	.art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%); }
	.art.empty { display: grid; place-items: center; background: rgba(0,0,0,0.25); font-size: 3rem; color: rgba(255,255,255,0.3); }
	.sigil { position: relative; z-index: 1; flex: none; width: 72px; height: 72px; object-fit: contain; margin-top: -38px; filter: drop-shadow(0 3px 7px rgba(0,0,0,0.8)); }
	.hname { margin-top: 2px; max-width: 100%; font-size: min(30px, calc(var(--bw) / (var(--nl, 8) * 0.66))); line-height: 1; text-align: center; padding: 0 8px; white-space: nowrap; text-shadow: 0 2px 8px rgba(0,0,0,0.7); }
	.dense .hname { font-size: min(23px, calc(var(--bw) / (var(--nl, 8) * 0.66))); }
	.dense .sigil { width: 60px; height: 60px; margin-top: -32px; }
	.htitle { margin-top: 3px; font-size: 16px; line-height: 1.15; color: var(--brass-hi, #f4dfa8); text-align: center; padding: 0 8px; white-space: nowrap; }
	.dense .htitle { font-size: 15px; padding: 0 4px; }
	.who { flex: none; margin-top: 8px; padding: 4px 13px; border-radius: 999px; font-size: 14px; line-height: 1.15; letter-spacing: 0.1em; text-transform: uppercase;
		color: #fff; background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.2); max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.who.me { border-color: var(--brass-hi, #f4dfa8); box-shadow: 0 0 10px rgba(244,223,168,0.32); }
	.cx { display: flex; gap: 2px; margin-top: 6px; }
	.cx img { width: 17px; height: 17px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
	.stats { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
	.srow { display: flex; align-items: center; gap: 6px; }
	.srow img { width: 19px; height: 15px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
	.pips { display: flex; gap: 2px; }
	.pips i { width: 12px; height: 12px; border-radius: 2px; background: rgba(0,0,0,0.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
	.dense .pips i { width: 9px; height: 9px; }
	.pips i.p2 { background: #f6ead2; box-shadow: 0 0 5px rgba(246,234,210,0.5); }
	.pips i.p1 { background: rgba(246,234,210,0.35); }
	.roles { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 4px; margin-top: 12px; padding: 0 6px; }
	.role { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 80px; }
	.role img { width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
	.rdot { width: 28px; height: 28px; display: grid; place-items: center; color: var(--brass-hi, #f4dfa8); font-size: 20px; line-height: 1; }
	.role span:not(.rdot) { font-size: 14px; line-height: 1.1; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; }
	/* 3+ a side: narrower banners, the roles as icons only (their names are in the tooltip) */
	.dense .roles { gap: 5px; }
	.dense .role { width: auto; }
	.dense .role img, .dense .rdot { width: 24px; height: 24px; }
	.dense .role span:not(.rdot) { display: none; }
	@media (min-width: 761px) {
		.dense .art { height: 45%; }
		.packed .htitle, .packed .stats { display: none; }
		.packed .hname { font-size: min(22px, calc(var(--bw) / (var(--nl, 8) * 0.6))); padding: 0 3px; }
		.packed .sigil { width: 48px; height: 48px; margin-top: -26px; }
		.packed .who { max-width: calc(100% - 8px); padding: 3px 8px; letter-spacing: 0.04em; }
	}

	/* a narrower desktop / a tablet held upright: the roles as icons only, long titles may wrap */
	@container (min-width: 761px) and (max-width: 1300px) {
		.roles { gap: 5px; }
		.role { width: auto; }
		.role img, .rdot { width: 24px; height: 24px; }
		.role span:not(.rdot) { display: none; }
		.htitle, .dense .htitle { white-space: normal; }
		.who { max-width: calc(100% - 8px); letter-spacing: 0.04em; }
	}

	.foot { position: relative; flex: none; min-height: 106px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
	/* card preparation progress (a small loading bar under the button) */
	.prep { display: flex; flex-direction: column; align-items: center; gap: 4px;
		font-size: var(--fs-small, 16px); line-height: 1.1; letter-spacing: 0.06em; color: var(--brass, #d8b36a); white-space: nowrap; }
	.prep i { width: 180px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, var(--brass, #d8b36a) calc(var(--p) * 100%), rgba(255,255,255,0.14) 0); }
	.prep.done { color: var(--ready-hi, #6ee7a0); }
	.prep.done i { opacity: 0; }
	/* the host's way in: the two teams meeting (tide's .btn-duo) */
	.splash .begin { min-width: 320px; opacity: 0; transform: translateY(10px); transition: opacity 0.4s, transform 0.4s, filter 0.12s; }
	.splash .begin.show { opacity: 1; transform: none; }
	.splash .begin.show:active { transform: translateY(1px); }
	.wait { opacity: 0; transition: opacity 0.4s; font-size: var(--fs-h3, 21px); letter-spacing: 0.08em; color: var(--brass-hi, #f4dfa8); }
	.wait.show { opacity: 1; animation: breathe 2.4s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

	/* ═══════════ phone (≤760px): the two teams side by side, banners share the
	   height between the title and a Begin bar that is always on screen ═══════════ */
	@media (max-width: 760px) {
		.splash { height: 100%; }
		.head { margin-top: 62px; font-size: 17px; letter-spacing: 0.12em; }
		.hrule { display: none; }
		.arena, .dense .arena { flex: 1 1 0; min-height: 0; flex-direction: row; align-items: stretch; gap: 12px; padding: 8px 10px 0; }
		.side { flex: 1 1 0; min-width: 0; min-height: 0; gap: 6px; align-items: stretch; text-align: center; }
		.teamname { flex: none; font-size: 17px; letter-spacing: 0.1em; }
		.banners, .dense .banners, .packed .banners { flex: 1 1 0; min-height: 0; flex-direction: column; justify-content: center; gap: 8px; }
		.banner { width: 100%; flex: 1 1 0; min-height: 0; max-height: 330px; }
		.hang { height: 100%; display: flex; flex-direction: column; }
		.rod { flex: none; height: 7px; margin: 0 -4px -2px; }
		.cloth { flex: 1; min-height: 0; height: auto; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 12px), 0 100%); filter: drop-shadow(0 8px 14px rgba(0,0,0,0.6)); }
		.cloth-in { inset: 0 3px 3px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 3px), 50% calc(100% - 14px), 0 calc(100% - 3px));
			justify-content: flex-end; padding: 0 4px 18px; }
		/* the hero art fills the whole cloth, fading into the team colour behind the text */
		.art { position: absolute; inset: 0; height: 100%; }
		.art img { object-position: center 22%; }
		.cloth.orange .art::after { background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 15%), linear-gradient(180deg, rgba(86,31,7,0) 18%, rgba(110,42,10,0.82) 52%, #561f07 100%); }
		.cloth.blue .art::after { background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 15%), linear-gradient(180deg, rgba(13,42,85,0) 18%, rgba(20,58,112,0.82) 52%, #0d2a55 100%); }
		.art.empty { font-size: 2rem; }
		.sigil, .hname, .htitle, .who, .cx, .stats { position: relative; z-index: 1; flex: none; }
		.sigil, .dense .sigil { width: 30px; height: 30px; margin-top: 0; }
		.hname, .dense .hname { font-size: min(22px, calc(160px / (var(--nl, 8) * 0.6))); max-width: 100%; white-space: nowrap; overflow: hidden; padding: 0 2px; }
		.htitle, .dense .htitle { font-size: 15px; padding: 0 2px; margin-top: 1px; }
		.who { margin-top: 4px; padding: 2px 9px; font-size: 13px; letter-spacing: 0.05em; max-width: calc(100% - 8px); }
		.cx { margin-top: 4px; }
		.cx img { width: 13px; height: 13px; }
		.stats { gap: 2px; margin-top: 5px; }
		.srow { gap: 4px; }
		.srow img { width: 13px; height: 11px; }
		.pips i, .dense .pips i { width: 8px; height: 8px; }
		/* role icons ride along the top of the banner, over the art — the text layout below is untouched */
		.roles, .dense .roles { position: absolute; top: 6px; left: 0; right: 0; z-index: 1; margin: 0; padding: 0; gap: 4px; flex-wrap: nowrap; }
		.role, .dense .role { width: auto; }
		.role span:not(.rdot) { display: none; }
		.role img, .rdot, .dense .role img, .dense .rdot { width: 20px; height: 20px; font-size: 14px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 4px rgba(0,0,0,0.6)); }
		.packed .roles { top: 4px; gap: 2px; }
		.packed .role img, .packed .rdot { width: 14px; height: 14px; }
		/* 3+ a side: shorter cards — name, player and stars only */
		.dense .htitle, .dense .stats { display: none; }
		.dense .sigil { width: 24px; height: 24px; }
		.packed .sigil { display: none; }
		.packed .cloth-in { padding-bottom: 12px; }
		.packed .hname { font-size: min(17px, calc(160px / (var(--nl, 8) * 0.6))); }
		.packed .who { margin-top: 2px; padding: 0 7px; font-size: 12px; }
		.packed .cx { margin-top: 2px; }
		.packed .cx img { width: 10px; height: 10px; }
		.crest { position: absolute; left: 50%; top: 50%; z-index: 3; margin: 0; transform: translate(-50%, -50%); animation: fade 0.6s 0.5s ease both; }
		.coin { display: none; }
		.disc { width: 48px; height: 48px; border-width: 2px; box-shadow: 0 0 0 4px rgba(216,179,106,0.16), 0 0 24px rgba(216,179,106,0.32), inset 0 0 12px rgba(0,0,0,0.6); }
		.disc span { font-size: 19px; }
		.foot { min-height: 0; gap: 6px; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); }
		.splash .begin { min-width: 0; padding: 0 28px; }
		.prep i { width: 150px; }
	}
</style>
