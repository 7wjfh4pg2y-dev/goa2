<script lang="ts">
	// Team-vs-Team splash shown once every hero is locked: each player's hero
	// hangs as a cloth war banner (art up top, sigil + name, stats and roles on
	// the cloth below). Orange hangs on the left, Blue on the right, a VS crest
	// between. The host starts the game from here.
	import { onDestroy } from 'svelte';
	import {
		heroById, heroSplash, heroLogo, statIcon, traitIcon, starIcon,
		STAT_LABELS, STAT_PIPS, TRAIT_LABELS, type Trait
	} from '$lib/heroes';

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

	$: dense = Math.max(orange.length, blue.length) >= 3;
	const pip = (stat: [number, number], i: number) => (i < stat[0] ? 2 : i < stat[1] ? 1 : 0);
	const roles = (traits: Trait[]) => [...traits].sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b]));
	// stagger the drop: orange from the centre outwards, then blue
	const delay = (team: 'orange' | 'blue', i: number, n: number) =>
		0.15 + (team === 'orange' ? n - 1 - i : n + i) * 0.13;
</script>

<div class="splash" class:dense role="dialog" aria-label="Team versus team">
	<div class="wash orange"></div>
	<div class="wash blue"></div>
	<div class="head">The battle lines are drawn</div>

	<div class="field">
		{#each [{ team: 'orange', ids: orange }, { team: 'blue', ids: blue }] as side, si (side.team)}
			{#if si === 1}
				<div class="crest"><span>VS</span></div>
			{/if}
			<div class="side {side.team}">
				<div class="teamname">{side.team === 'orange' ? 'Orange' : 'Blue'}</div>
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
											<div class="hname">{h.name}</div>
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
			<button class="begin" class:show={ready} disabled={!ready} on:click={onStart}>⚔ Begin the battle</button>
		{:else}
			<span class="wait" class:show={ready}>Waiting for the host to begin…</span>
		{/if}
	</div>
</div>

<style>
	.splash { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; overflow: hidden; color: #f6ead2;
		background: radial-gradient(120% 90% at 50% 45%, rgba(18,16,26,0.9), rgba(4,5,10,0.97)); animation: fade 0.45s ease both;
		--bw: 272px; --bh: 680px; }
	.splash.dense { --bw: 196px; --bh: 640px; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	.wash { position: absolute; top: 0; bottom: 0; width: 55%; pointer-events: none; opacity: 0; animation: fade 1.2s 0.3s ease forwards; }
	.wash.orange { left: 0; background: radial-gradient(70% 60% at 20% 45%, rgba(239,125,34,0.3), transparent 70%); }
	.wash.blue { right: 0; background: radial-gradient(70% 60% at 80% 45%, rgba(47,127,230,0.3), transparent 70%); }

	.head { position: relative; margin-top: 26px; font-family: 'Modesto Poster', serif; font-size: 1.5rem; letter-spacing: 0.22em; text-transform: uppercase; color: #cbb488;
		text-shadow: 0 2px 12px rgba(0,0,0,0.8); animation: fade 0.8s 0.1s ease both; }

	.field { position: relative; flex: 1; width: 100%; display: flex; align-items: flex-start; justify-content: center; gap: 26px; padding-top: 14px; }
	.side { display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.teamname { font-family: 'Modesto Poster', serif; font-size: 1.25rem; letter-spacing: 0.14em; text-transform: uppercase; animation: fade 0.8s 0.2s ease both; }
	.side.orange .teamname { color: #f5a261; text-shadow: 0 0 16px rgba(239,125,34,0.6); }
	.side.blue .teamname { color: #7fb3f5; text-shadow: 0 0 16px rgba(47,127,230,0.6); }
	.banners { display: flex; gap: 22px; }
	.dense .banners { gap: 14px; }
	.dense .field { gap: 18px; }

	/* VS crest */
	.crest { align-self: center; flex: none; margin-top: -40px; width: 120px; height: 120px; border-radius: 50%; display: grid; place-items: center;
		background: radial-gradient(circle at 50% 38%, #2a2130, #0c0a12 72%); border: 3px solid #d8b56a;
		box-shadow: 0 0 0 6px rgba(216,181,106,0.18), 0 0 40px rgba(216,181,106,0.35), inset 0 0 18px rgba(0,0,0,0.8); animation: crestIn 0.7s 0.5s cubic-bezier(0.2,0.9,0.2,1.3) both; }
	.crest span { font-family: 'Modesto Poster', serif; font-size: 2.8rem; color: #f6ead2; letter-spacing: 0.04em; text-shadow: 0 0 18px rgba(246,234,210,0.45); }
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

	.rod { position: relative; z-index: 2; height: 11px; margin: 0 -6px -3px; border-radius: 6px;
		background: linear-gradient(180deg, #8a6431, #4a3218 60%, #2e1f0e); box-shadow: 0 4px 10px rgba(0,0,0,0.6); }

	/* cloth: a gold trim (outer) around the team-coloured cloth (inner), swallowtail hem */
	.cloth { position: relative; height: var(--bh); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 91%, 0 100%);
		background: linear-gradient(180deg, #f0d48a, #b88a38 50%, #8a6424); filter: drop-shadow(0 18px 26px rgba(0,0,0,0.6)); }
	.cloth-in { position: absolute; inset: 0 4px 4px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), 50% calc(91% - 3px), 0 calc(100% - 4px));
		display: flex; flex-direction: column; align-items: center; padding-bottom: 60px;
		background: repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 6px), var(--cloth); }
	.cloth.orange { --cloth: linear-gradient(180deg, #b9561c 0%, #86380f 48%, #561f07 100%); }
	.cloth.blue { --cloth: linear-gradient(180deg, #2a64b8 0%, #1a4585 48%, #0d2a55 100%); }

	.art { position: relative; width: 100%; height: 44%; flex: none; overflow: hidden; }
	.art img { width: 100%; height: 100%; object-fit: cover; object-position: center 24%; display: block; }
	.art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%); }
	.art.empty { display: grid; place-items: center; background: rgba(0,0,0,0.25); font-family: 'Modesto Poster', serif; font-size: 3rem; color: rgba(255,255,255,0.3); }
	.sigil { position: relative; z-index: 1; width: 72px; height: 72px; object-fit: contain; margin-top: -38px; filter: drop-shadow(0 3px 7px rgba(0,0,0,0.8)); }
	.hname { margin-top: 2px; font-family: 'Modesto Poster', serif; font-size: 1.85rem; line-height: 1; text-align: center; padding: 0 8px; text-shadow: 0 2px 8px rgba(0,0,0,0.7); }
	.dense .hname { font-size: 1.4rem; }
	.dense .sigil { width: 60px; height: 60px; margin-top: -32px; }
	.htitle { margin-top: 3px; font-family: 'Modesto Poster', serif; font-size: 0.92rem; color: #f0dcae; opacity: 0.9; text-align: center; padding: 0 8px; }
	.who { margin-top: 9px; padding: 3px 12px; border-radius: 999px; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
		color: #fff; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.18); max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.who.me { border-color: rgba(246,234,210,0.7); box-shadow: 0 0 10px rgba(246,234,210,0.3); }
	.cx { display: flex; gap: 2px; margin-top: 7px; }
	.cx img { width: 17px; height: 17px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
	.stats { display: flex; flex-direction: column; gap: 5px; margin-top: 11px; }
	.srow { display: flex; align-items: center; gap: 6px; }
	.srow img { width: 19px; height: 15px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
	.pips { display: flex; gap: 2px; }
	.pips i { width: 12px; height: 12px; border-radius: 2px; background: rgba(0,0,0,0.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
	.dense .pips i { width: 9px; height: 9px; }
	.pips i.p2 { background: #f6ead2; box-shadow: 0 0 5px rgba(246,234,210,0.5); }
	.pips i.p1 { background: rgba(246,234,210,0.35); }
	.roles { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 8px; margin-top: 13px; padding: 0 8px; }
	.role { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 54px; }
	.dense .role { width: 44px; }
	.role img { width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
	.rdot { width: 28px; height: 28px; display: grid; place-items: center; color: #fbbf24; font-size: 0.9rem; }
	.role span { font-family: 'Modesto Poster', serif; font-size: 0.6rem; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; }

	.foot { position: relative; height: 92px; display: grid; place-items: center; }
	.begin { opacity: 0; transform: translateY(10px); transition: opacity 0.4s, transform 0.4s; padding: 0.9rem 2.4rem; border-radius: 14px; cursor: pointer;
		font-family: 'Modesto Poster', serif; font-size: 1.35rem; letter-spacing: 0.06em; color: #1c1206;
		background: linear-gradient(180deg, #f6dd98, #d4a64a 55%, #a87a2a); border: 1px solid #fbe7b0; box-shadow: 0 10px 30px rgba(0,0,0,0.55), 0 0 26px rgba(216,181,106,0.4); }
	.begin.show { opacity: 1; transform: none; }
	.begin:hover:not(:disabled) { filter: brightness(1.07); }
	.wait { opacity: 0; transition: opacity 0.4s; font-family: 'Modesto Poster', serif; font-size: 1.05rem; letter-spacing: 0.08em; color: #cbb488; }
	.wait.show { opacity: 1; animation: breathe 2.4s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
</style>
