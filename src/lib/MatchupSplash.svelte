<script lang="ts">
	// Team-vs-Team splash shown once every hero is locked: each hero is a leaning SLICE of
	// their painting that slashes in — the enemy from above on the left, the viewer's
	// team from below on the right — tinted in the team's colour, edged in the
	// player's own colour. A bright blade lands between the teams with the VS on it, and each
	// team's symbol (the tie-breaker coin's gear / star) looms faintly behind its heroes. On phones the slices lie
	// flat, Atlanteans above the blade and Titans below. The host starts the game from here.
	import { teamName } from '$lib/teams';
	import { onDestroy, onMount } from 'svelte';
	import { heroCards } from '$lib/cards/deck';
	import { startingHand } from '$lib/cards/cardstate';
	import { prewarm, preloadArt } from '$lib/cards/render';
	import {
		heroById, heroSplash, heroLogo, splashFace, traitIcon, TRAIT_LABELS, type Trait
	} from '$lib/heroes';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';

	export let orange: string[];
	export let blue: string[];
	export let picks: Record<string, string>;
	export let nameOf: (id: string) => string;
	/** a player's chosen colour (hex): the edges of their slice */
	export let colorOf: (id: string) => string = () => '#94a3b8';
	export let clientId: string;
	export let iAmHost: boolean;
	export let onStart: () => void;
	/** the widest a slice may be (design px; 0 = they share the row) — thinner slices, the row centred */
	export let slim = 0;
	/** whose screen this is: their team on the RIGHT, the enemy on the left (spectators watch as the Titans) */
	export let myTeam: 'orange' | 'blue' | null = null;

	// the host's button appears once the slices and the blade have landed
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

	$: n = Math.max(orange.length, blue.length, 1);
	$: dense = n >= 3;
	$: packed = n >= 4; // 4–5 a side go most compact
	const roles = (traits: Trait[]) => [...traits].sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b]));
	// the slices land one after another, alternating sides, from the outside in; then the blade
	$: leftTeam = myTeam === 'orange' ? 'blue' : 'orange';
	$: sides = leftTeam === 'orange'
		? [{ team: 'orange', ids: orange, pos: 'sl' }, { team: 'blue', ids: blue, pos: 'sr' }]
		: [{ team: 'blue', ids: blue, pos: 'sl' }, { team: 'orange', ids: orange, pos: 'sr' }];
	const rank = (pos: string, i: number, len: number) => (pos === 'sl' ? 2 * i : 2 * (len - 1 - i) + 1);
	const delay = (pos: string, i: number, len: number) => 0.15 + rank(pos, i, len) * 0.11;
	const RGB: Record<string, string> = { orange: '239,125,34', blue: '47,127,230' };
	$: seamAt = 0.15 + 2 * n * 0.11 + 0.12;

	// the measured row (one team's slices), for sizing names and framing the art
	let vw = 1440, rowW = 0, rowH = 0;
	$: phone = vw <= 760;
	$: sw = phone ? rowW || 370 : ((rowW || 616) - (n - 1) * 12) / n; // one slice's width
	$: sh = phone ? ((rowH || 280) - (n - 1) * 9) / n : rowH || 610; // … and height
	// the hero's big painting (2:1; never the small avatar art — it goes soft at this size) inside a box of
	// the given shape (width / height): zoomed, the face brought to (atX, atY) where the picture allows
	const c01 = (v: number) => Math.min(1, Math.max(0, v));
	function art(id: string, aspect: number, zoom: number, atY: number, atX: number) {
		const [fx, fy] = splashFace(id);
		const hi = Math.max(1, aspect / 2) * zoom, wi = 2 * hi; // the picture's size, in box heights
		const px = wi - aspect < 0.001 ? 0.5 : c01((atX * aspect - fx * wi) / (aspect - wi));
		const py = hi - 1 < 0.001 ? 0.5 : c01((atY - fy * hi) / (1 - hi));
		const size = aspect <= 2 ? `auto ${(hi * 100).toFixed(1)}%` : `${((wi / aspect) * 100).toFixed(1)}% auto`;
		return `background-image:url('${heroSplash(id)}');background-size:${size};background-position:${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%;`;
	}
	$: artOf = (id: string) => (phone ? art(id, sw / (sh + 32), 1.12, 0.45, 0.68) : art(id, (sw + 100) / sh, 1.08, 0.36, 0.5));

	// the teams' symbols: the tie-breaker coins themselves
	const coin = (team: string) => (team === 'orange' ? coinOrange : coinBlue);
</script>

<svelte:window bind:innerWidth={vw} />

{#snippet slices(side: { team: string; ids: string[]; pos: string })}
	<!-- the team's symbol, looming behind its heroes (it shows in the gaps; each slice carries the same drawing over its art) -->
	<img class="loom" src={coin(side.team)} alt="" aria-hidden="true" />
	{#each side.ids as id, i (id)}
		{@const h = picks[id] ? heroById(picks[id]) : undefined}
		<article class="slice" class:me={id === clientId} style="--pc:{colorOf(id)}; --i:{i}; --d:{delay(side.pos, i, side.ids.length)}s">
			<div class="slice-in">
				{#if h}<div class="fill" style={artOf(h.id)}></div>{:else}<div class="fill empty"><span>?</span></div>{/if}
				<div class="shade"></div>
				<img class="loom in" src={coin(side.team)} alt="" aria-hidden="true" />
				<div class="top"><span class="who" class:me={id === clientId}><i></i>{nameOf(id)}{#if id === clientId}<b>you</b>{/if}</span></div>
				<div class="body">
					{#if h}
						<img class="sigil" src={heroLogo(h.id)} alt="" />
						<div class="txt">
							<div class="hname" style="--nl:{h.name.length}">{h.name}</div>
							<div class="htitle">{h.title}</div>
						</div>
						<div class="roles">
							{#each roles(h.traits) as t (t)}
								{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} title={TRAIT_LABELS[t]} />{:else}<em title={TRAIT_LABELS[t]}>◈</em>{/if}
							{/each}
						</div>
					{:else}
						<div class="txt"><div class="hname">—</div></div>
					{/if}
				</div>
			</div>
		</article>
	{/each}
{/snippet}

<div class="splash" class:dense class:packed class:slim={slim > 0} style="--n:{n}; --sw:{sw}px; --seam:{seamAt}s; --slim:{slim}px; --lrgb:{RGB[leftTeam]}; --rrgb:{RGB[leftTeam === 'orange' ? 'blue' : 'orange']}" role="dialog" aria-label="Team versus team">
	<div class="wash sl"></div>
	<div class="wash sr"></div>
	<div class="head"><i class="hrule"></i><span>The battle lines are drawn</span><i class="hrule r"></i></div>

	<div class="arena">
		{#each sides as side, si (side.team)}
			{#if si === 1}
				<div class="seam"><i></i><div class="disc"><svg viewBox="-50 -50 100 100" aria-label="versus"><defs><linearGradient id="mvs-o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb46a" /><stop offset=".55" stop-color="#ef7d22" /><stop offset="1" stop-color="#7a3208" /></linearGradient><linearGradient id="mvs-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccbff" /><stop offset=".55" stop-color="#2f7fe6" /><stop offset="1" stop-color="#0f3474" /></linearGradient><linearGradient id="mvs-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset=".45" stop-color="#fff2c9" /><stop offset="1" stop-color="#f0bb55" /></linearGradient><linearGradient id="mvs-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3a6" /><stop offset=".5" stop-color="#c8963f" /><stop offset="1" stop-color="#7d5418" /></linearGradient><radialGradient id="mvs-v" cx=".5" cy=".38" r=".62"><stop offset=".55" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".5" /></radialGradient><clipPath id="mvs-c"><circle r="44" /></clipPath></defs><circle r="49.5" fill="#06101c" /><g clip-path="url(#mvs-c)"><rect x="-50" y="-50" width="100" height="100" fill="url(#mvs-{leftTeam === 'orange' ? 'b' : 'o'})" /><polygon points="-50,-50 7,-50 -7,50 -50,50" fill="url(#mvs-{leftTeam === 'orange' ? 'o' : 'b'})" /><g fill="#fff4dc" fill-opacity=".26" stroke="#000" stroke-opacity=".35" stroke-width="1.2"><g transform="rotate(-38)"><path d="M-2.4 -38 L0 -45 L2.4 -38 L2.4 18 L-2.4 18 Z M-11 18 H11 V22.5 H-11 Z M-1.9 22.5 H1.9 V33 H-1.9 Z" /><circle cy="36" r="3.2" /></g><g transform="rotate(38)"><path d="M-2.4 -38 L0 -45 L2.4 -38 L2.4 18 L-2.4 18 Z M-11 18 H11 V22.5 H-11 Z M-1.9 22.5 H1.9 V33 H-1.9 Z" /><circle cy="36" r="3.2" /></g></g><line x1="7" y1="-50" x2="-7" y2="50" stroke="#fff6dc" stroke-width="2.4" /><circle r="44" fill="url(#mvs-v)" /></g><circle r="45.5" fill="none" stroke="url(#mvs-r)" stroke-width="3.4" /><g transform="skewX(-10)" font-size="42" text-anchor="middle" letter-spacing="-1"><text class="vs-x" x="3" y="17.5" fill="#1a0b02" stroke="#1a0b02" stroke-width="6" stroke-linejoin="round">VS</text><text class="vs-x" x="0" y="14" fill="url(#mvs-t)" stroke="#1a0b02" stroke-width="4.6" stroke-linejoin="round" paint-order="stroke">VS</text></g></svg></div></div>
			{/if}
			<div class="mteam {side.team} {side.pos}">
				<div class="teamname">{teamName(side.team)}</div>
				{#if si === 0}
					<div class="row" bind:clientWidth={rowW} bind:clientHeight={rowH}>{@render slices(side)}</div>
				{:else}
					<div class="row">{@render slices(side)}</div>
				{/if}
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
	/* Colours, type sizes and the Begin button come from ui/tide.css (the draft's root carries .tide). */
	.splash { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; overflow: hidden; color: var(--ink, #f5f1e8);
		background: radial-gradient(120% 90% at 50% 42%, #0e2a46, #04101d 78%, #030b15); animation: fade 0.45s ease both; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	.wash { position: absolute; top: 0; bottom: 0; width: 55%; pointer-events: none; opacity: 0; animation: fade 1.2s 0.3s ease forwards; }
	.wash.sl { left: 0; background: radial-gradient(70% 60% at 14% 45%, rgba(var(--lrgb), 0.26), transparent 70%); }
	.wash.sr { right: 0; background: radial-gradient(70% 60% at 86% 45%, rgba(var(--rrgb), 0.26), transparent 70%); }

	/* title: brass capitals between two rules */
	.head { position: relative; z-index: 4; flex: none; margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 22px;
		font-size: 34px; line-height: 1.1; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; color: var(--brass-hi, #f4dfa8);
		text-shadow: 0 2px 14px rgba(0,0,0,0.7); animation: fade 0.8s 0.1s ease both; }
	.hrule { flex: none; width: 180px; height: 1px; background: linear-gradient(90deg, transparent, var(--brass, #d8b36a)); opacity: 0.6; }
	.hrule.r { transform: scaleX(-1); }

	/* team colours */
	.mteam.orange { --t: #ef7d22; --t-hi: #ffb878; --t-mid: #9a4514; --t-deep: #4a1c06; --t-rgb: 239, 125, 34; }
	.mteam.blue { --t: #2f7fe6; --t-hi: #9ccbff; --t-mid: #1c4a8f; --t-deep: #0a2148; --t-rgb: 47, 127, 230; }

	/* the arena: the enemy left of the blade, your team right; it shudders once as the blade lands */
	.arena { position: relative; flex: 1; min-height: 0; width: 100%; animation: shudder 0.32s var(--seam) linear both; }
	@keyframes shudder { 0%, 100% { transform: none; } 20% { transform: translate(-5px, 3px); } 40% { transform: translate(5px, -3px); } 60% { transform: translate(-3px, -2px); } 80% { transform: translate(2px, 2px); } }
	.mteam { position: absolute; top: 4px; bottom: 0; display: flex; flex-direction: column; gap: 10px; }
	.mteam.sl { left: 5%; right: calc(50% + 34px); }
	.mteam.sr { left: calc(50% + 34px); right: 5%; }
	.teamname { position: relative; z-index: 2; flex: none; font-size: 24px; line-height: 1.15; letter-spacing: 0.14em; text-transform: uppercase; text-align: center;
		color: var(--t-hi); text-shadow: 0 0 16px rgba(var(--t-rgb), 0.6); animation: fade 0.8s 0.2s ease both; }
	.row { position: relative; flex: 1; min-height: 0; display: flex; gap: 12px; margin-bottom: 26px; }
	/* slim: the slices keep at most --slim wide and each row (and its team name) shrinks round them, drawn in to the
	   blade — so the symbols still line up */
	.slim .sl .row, .slim .sl .teamname { align-self: flex-end; }
	.slim .sr .row, .slim .sr .teamname { align-self: flex-start; }
	.slim .row, .slim .teamname { width: min(100%, calc(var(--n) * var(--slim) + (var(--n) - 1) * 12px)); }

	/* the team's symbol: huge and faint behind the row … */
	.loom { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;
		transform: scale(1.1); opacity: 0; animation: loom 2.2s calc(var(--seam) + 0.1s) ease forwards; --lo: 0.34; }
	/* … and the very same drawing again over each slice's art (placed from the slice's own box, so the pieces line up into one symbol) */
	.loom.in { left: calc(50px - var(--i) * (100% - 88px)); width: calc(var(--n) * (100% - 100px) + (var(--n) - 1) * 12px); --lo: 0.22; mix-blend-mode: screen;
		-webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 40%, #000 80%); mask-image: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 40%, #000 80%); }
	@keyframes loom { from { opacity: 0; transform: scale(1.3); } to { opacity: var(--lo); transform: scale(1.1); } }

	/* a slice: leaning, the painting inside it upright; its long edges are the player's colour */
	.slice { flex: 1 1 0; min-width: 0; position: relative; z-index: 1; overflow: hidden; transform: skewX(-8deg); background: #07111f;
		border-left: 4px solid var(--pc); border-right: 4px solid var(--pc);
		box-shadow: 0 0 26px rgba(var(--t-rgb), 0.38), 0 18px 26px rgba(0,0,0,0.6); animation: slashDown 0.42s var(--d) cubic-bezier(0.16, 0.9, 0.25, 1) both; }
	.sr .slice { animation-name: slashUp; }
	/* they travel along their own lean: 8° over the height is ~14% sideways */
	@keyframes slashDown { 0% { opacity: 0; transform: translate(126px, -900px) skewX(-8deg); filter: brightness(2.6); } 30% { opacity: 1; } 78% { filter: brightness(1.9); } 100% { opacity: 1; transform: skewX(-8deg); filter: brightness(1); } }
	@keyframes slashUp { 0% { opacity: 0; transform: translate(-126px, 900px) skewX(-8deg); filter: brightness(2.6); } 30% { opacity: 1; } 78% { filter: brightness(1.9); } 100% { opacity: 1; transform: skewX(-8deg); filter: brightness(1); } }
	/* a glint runs down (up) the slice as it lands */
	.slice::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 45%; pointer-events: none; opacity: 0;
		background: linear-gradient(180deg, transparent, rgba(255,255,255,0.5) 50%, transparent); animation: glintDown 0.5s calc(var(--d) + 0.3s) ease-out both; }
	.sr .slice::after { animation-name: glintUp; }
	@keyframes glintDown { 0% { opacity: 1; transform: translateY(-100%); } 100% { opacity: 0; transform: translateY(240%); } }
	@keyframes glintUp { 0% { opacity: 1; transform: translateY(240%); } 100% { opacity: 0; transform: translateY(-100%); } }
	.slice-in { position: absolute; top: 0; bottom: 0; left: -50px; right: -50px; transform: skewX(8deg); }
	.fill { position: absolute; inset: 0; background-repeat: no-repeat; background-color: #07111f; }
	.fill.empty { display: grid; place-items: center; font-size: 4rem; color: rgba(255,255,255,0.3); }
	.shade { position: absolute; inset: 0; background:
		linear-gradient(180deg, rgba(4,12,22,0.55) 0%, rgba(4,12,22,0) 15%),
		linear-gradient(180deg, rgba(var(--t-rgb), 0) 50%, color-mix(in srgb, var(--t-deep) 80%, transparent) 73%, var(--t-deep) 100%),
		linear-gradient(180deg, rgba(var(--t-rgb), 0.1), rgba(var(--t-rgb), 0.1)); }

	/* the player: a dark chip with a dot of their colour */
	.top { position: absolute; left: 0; right: 0; top: 16px; display: flex; justify-content: center; padding-left: 70px; }
	.who { display: inline-flex; align-items: center; gap: 7px; max-width: calc(var(--sw) - 16px); padding: 4px 12px 4px 8px; border-radius: 999px; font-size: 15px; line-height: 1.15; letter-spacing: 0.1em;
		text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; background: rgba(4,12,22,0.74); border: 1px solid rgba(255,255,255,0.22); }
	.who i { flex: none; width: 11px; height: 11px; border-radius: 50%; background: var(--pc); box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 6px var(--pc); }
	.who b { flex: none; font-weight: normal; font-size: 12px; color: #1c1408; background: var(--brass, #d8b36a); border-radius: 999px; padding: 1px 7px; letter-spacing: 0.06em; }
	.who.me { border-color: var(--brass-hi, #f4dfa8); box-shadow: 0 0 10px rgba(244,223,168,0.3); }

	/* symbol, name, title, roles — along the foot (the lean puts the foot a little to the left) */
	.body { position: absolute; left: 50px; right: 50px; bottom: 0; padding: 0 0 20px; display: flex; flex-direction: column; align-items: center; transform: translateX(-34px); }
	.sigil { width: calc(40px + 88px / var(--n)); height: calc(40px + 88px / var(--n)); object-fit: contain; filter: drop-shadow(0 3px 7px rgba(0,0,0,0.8)); }
	.txt { text-align: center; }
	.hname { font-size: min(calc(88px / var(--n) + 2px), calc(var(--sw) / (var(--nl, 8) * 0.68))); line-height: 1; white-space: nowrap; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
	.htitle { margin-top: 4px; font-size: 17px; line-height: 1.15; white-space: nowrap; color: var(--brass-hi, #f4dfa8); text-shadow: 0 1px 6px rgba(0,0,0,0.8); }
	.roles { display: flex; gap: 9px; align-items: center; margin-top: 12px; }
	.roles img, .roles em { width: 34px; height: 34px; object-fit: contain; filter: brightness(1.5) saturate(1.15) drop-shadow(0 0 1px rgba(255,238,200,0.95)) drop-shadow(0 0 7px rgba(255,214,140,0.45)) drop-shadow(0 2px 3px rgba(0,0,0,0.9)); }
	.roles em { display: grid; place-items: center; font-style: normal; font-size: 24px; color: var(--brass-hi, #f4dfa8); }
	.packed .htitle { font-size: 13px; }
	.dense .roles { gap: 6px; }
	.dense .roles img, .dense .roles em { width: 28px; height: 28px; font-size: 20px; }
	.packed .roles { gap: 3px; }
	.packed .roles img, .packed .roles em { width: 22px; height: 22px; font-size: 16px; }
	.packed .who { font-size: 13px; padding: 3px 9px 3px 6px; letter-spacing: 0.05em; }
	.packed .who b { display: none; }
	.packed .top { padding-left: 62px; }

	/* the blade between the teams, the VS on it */
	.seam { position: absolute; z-index: 3; left: 50%; top: 30px; bottom: 14px; width: 0; }
	.seam > i { display: none; position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; transform: skewX(-8deg); transform-origin: 50% 0; border-radius: 3px;
		background: linear-gradient(180deg, transparent, #ffe9b8 18%, #fff 50%, #ffe9b8 82%, transparent); box-shadow: 0 0 24px 6px rgba(244,223,168,0.5); animation: blade 0.22s var(--seam) cubic-bezier(0.3, 0, 0.2, 1) both; }
	@keyframes blade { from { opacity: 0; transform: skewX(-8deg) scaleY(0); } to { opacity: 1; transform: skewX(-8deg) scaleY(1); } }
	/* the VS: an emblem split along the slices' lean — Atlantean orange | Titan blue — crossed blades behind,
	   the letters in pale gold with a heavy outline; each side glows in its team's colour */
	.disc { position: absolute; left: -54px; top: calc(50% - 54px); width: 108px; height: 108px; border-radius: 50%;
		box-shadow: -14px 0 34px rgba(var(--lrgb),0.58), 14px 0 34px rgba(var(--rrgb),0.58), 0 10px 24px rgba(0,0,0,0.6);
		animation: crestIn 0.5s calc(var(--seam) + 0.16s) cubic-bezier(0.2,0.9,0.2,1.3) both; }
	.disc svg { display: block; width: 100%; height: 100%; overflow: visible; }
	.vs-x { font-family: inherit; }
	@keyframes crestIn { from { opacity: 0; transform: scale(2.2); } to { opacity: 1; transform: none; } }

	.foot { position: relative; z-index: 4; flex: none; min-height: 106px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
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

	@media (prefers-reduced-motion: reduce) {
		.slice, .slice::after, .arena, .seam > i, .disc, .loom { animation-duration: 0.01s; animation-delay: 0s; }
	}

	/* ═══════════ phone (≤760px): the slices lie flat — the Atlanteans above the blade, the Titans
	   below — and slash in from the sides; the Begin bar is always on screen ═══════════ */
	@keyframes lieL { 0% { opacity: 0; transform: translate(-110%, 7.5%) skewY(-4deg); filter: brightness(2.6); } 30% { opacity: 1; } 78% { filter: brightness(1.9); } 100% { opacity: 1; transform: skewY(-4deg); filter: brightness(1); } }
	@keyframes lieR { 0% { opacity: 0; transform: translate(110%, -7.5%) skewY(-4deg); filter: brightness(2.6); } 30% { opacity: 1; } 78% { filter: brightness(1.9); } 100% { opacity: 1; transform: skewY(-4deg); filter: brightness(1); } }
	@keyframes glintR { 0% { opacity: 1; transform: translateX(-100%); } 100% { opacity: 0; transform: translateX(260%); } }
	@keyframes glintL { 0% { opacity: 1; transform: translateX(260%); } 100% { opacity: 0; transform: translateX(-100%); } }
	@keyframes loomFlat { from { opacity: 0; transform: scale(1.35); } to { opacity: var(--lo); transform: scale(1.15); } }
	@keyframes bladeX { from { opacity: 0; transform: skewY(-4deg) scaleX(0); } to { opacity: 1; transform: skewY(-4deg) scaleX(1); } }
	@media (max-width: 760px) {
		.splash { height: 100%; }
		.head { margin-top: 62px; font-size: 17px; letter-spacing: 0.12em; }
		.hrule { display: none; }
		.arena { display: flex; flex-direction: column; padding-top: 8px; }
		.mteam, .mteam.sl, .mteam.sr { position: relative; left: auto; right: auto; top: auto; bottom: auto; flex: 1 1 0; min-height: 0; gap: 4px; }
		.mteam.sr { flex-direction: column-reverse; }
		.teamname { font-size: 16px; letter-spacing: 0.1em; }
		.row { flex-direction: column; gap: 9px; margin: 8px 0; }
		.slice { transform: skewY(-4deg); border: 0; border-top: 3px solid var(--pc); border-bottom: 3px solid var(--pc); animation-name: lieL; box-shadow: 0 0 18px rgba(var(--t-rgb), 0.35), 0 8px 14px rgba(0,0,0,0.5); }
		.sr .slice { animation-name: lieR; }
		.slice::after { top: 0; bottom: 0; left: 0; right: auto; width: 40%; height: auto; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5) 50%, transparent); animation-name: glintR; }
		.sr .slice::after { animation-name: glintL; }
		.slice-in { left: 0; right: 0; top: -16px; bottom: -16px; transform: skewY(4deg); }
		.shade { background:
			linear-gradient(90deg, var(--t-deep) 0%, color-mix(in srgb, var(--t-deep) 72%, transparent) 34%, rgba(var(--t-rgb), 0) 62%),
			linear-gradient(180deg, rgba(var(--t-rgb), 0.1), rgba(var(--t-rgb), 0.1)); }
		.loom { transform: scale(1.15); animation-name: loomFlat; }
		.loom.in { left: 0; width: 100%; top: calc(16px - var(--i) * (100% - 23px)); height: calc(var(--n) * (100% - 32px) + (var(--n) - 1) * 9px);
			-webkit-mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.35) 80%); mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.35) 80%); }
		.top { left: auto; right: 10px; top: 24px; padding: 0; }
		.who { max-width: 150px; font-size: 12px; padding: 2px 8px 2px 5px; gap: 5px; letter-spacing: 0.05em; }
		.who i { width: 8px; height: 8px; }
		.who b { font-size: 10px; padding: 0 5px; }
		.body { left: 12px; right: auto; top: 16px; bottom: 16px; padding: 0; transform: none; max-width: 62%; flex-direction: row; flex-wrap: wrap; align-items: center; align-content: center; gap: 4px 8px; }
		.sigil { width: 44px; height: 44px; }
		.txt { text-align: left; }
		.hname { font-size: min(26px, calc(190px / (var(--nl, 8) * 0.6))); }
		.htitle { font-size: 13px; margin-top: 1px; }
		.roles { margin: 0; flex-basis: 100%; gap: 4px; }
		.roles img, .roles em { width: 21px; height: 21px; font-size: 15px; }
		.dense .sigil { width: 32px; height: 32px; }
		.dense .hname { font-size: min(22px, calc(190px / (var(--nl, 8) * 0.6))); }
		.dense .roles { display: none; }
		.packed .hname { font-size: min(19px, calc(190px / (var(--nl, 8) * 0.6))); }
		.packed .htitle { display: none; }
		.packed .top { top: 20px; padding: 0; }
		.seam { position: relative; left: 0; top: 0; bottom: auto; width: 100%; height: 0; flex: none; }
		.seam > i { display: block; left: 0; right: 0; width: auto; top: -2px; bottom: auto; height: 4px; transform: skewY(-4deg); transform-origin: 0 50%;
			background: linear-gradient(90deg, transparent, #ffe9b8 18%, #fff 50%, #ffe9b8 82%, transparent); animation-name: bladeX; }
		.disc { left: calc(50% - 27px); top: -27px; width: 54px; height: 54px; box-shadow: -7px 0 18px rgba(var(--lrgb),0.58), 7px 0 18px rgba(var(--rrgb),0.58), 0 5px 12px rgba(0,0,0,0.6); }
		.foot { min-height: 0; gap: 6px; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); }
		.splash .begin { min-width: 0; padding: 0 28px; }
		.prep i { width: 150px; }
	}
</style>
