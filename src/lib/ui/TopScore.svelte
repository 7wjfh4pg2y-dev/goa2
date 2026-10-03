<script lang="ts">
	// The scoreline (desktop / tablet): both teams' Life, the round with its four turns, the lane with the
	// battle zone and the waves left, and the tie-breaker coin on the end of the team that holds it.
	// Drawn from the VIEWER's side like every splash: the enemy on the left, your team on the right.
	import { teamName, teamAdj, placeName } from '$lib/teams';
	import { LANE } from '$lib/battle';
	import type { Team } from '$lib/match';

	export let view: Team; // the team on the right
	export let round = 1;
	export let turn = 1;
	export let lane = 1;
	export let life: Record<Team, number>;
	export let lifeTok: Record<Team, boolean[]> | undefined;
	export let waveTok: boolean[] = [];
	export let tie: Team;
	/** tokens playing their flip right now (`l<team><i>`, `w<i>`) */
	export let flips: Record<string, boolean> = {};
	export let tieFlip = false;
	export let lifeArt: (t: Team, side: 'front' | 'back') => string;
	export let tieArt: (t: Team) => string;
	export let onLife: (t: Team, i: number) => void;
	export let onWave: (i: number) => void;
	export let onTie: () => void;
	/** phone: ONE row (enemy Life · coin · round + turns · lane · waves · your Life); Life and waves open the sheet */
	export let compact = false;
	export let onSheet: () => void = () => {};

	const ROMAN = ['I', 'II', 'III', 'IV'];
	const ZONE_TEAM = ['is-orange', '', 'is-blue']; // LANE order: Orange Beach, Center, Blue Beach
	$: enemy = (view === 'orange' ? 'blue' : 'orange') as Team;
	$: zones = view === 'orange' ? [2, 1, 0] : [0, 1, 2]; // enemy beach · centre · your beach
	$: waves = waveTok.filter(Boolean).length;
</script>

{#snippet wing(t: Team, right: boolean)}
	{@const toks = lifeTok?.[t] ?? []}
	<div class="wing is-{t}" class:is-right={right}>
		<span class="col">
			<span class="nm">{teamName(t)}</span>
			<span class="lives" class:two={toks.length > 5} style="--per:{Math.ceil(toks.length / 2)}">
				{#each toks as full, i}
					<button class="lt" class:lost={!full} class:flip={flips[`l${t}${i}`]} style="background-image:url({lifeArt(t, full ? 'front' : 'back')})"
						on:click={() => onLife(t, i)} aria-label="{teamAdj(t)} Life token"></button>
				{/each}
			</span>
		</span>
		<b class="n">{life[t]}</b>
	</div>
{/snippet}

{#if compact}
	<div class="score ph is-{view}">
		<button class="pteam is-{enemy}" on:click={onSheet} aria-label="{teamAdj(enemy)} Life {life[enemy]}"><img src={lifeArt(enemy, 'front')} alt="" /><b>{life[enemy]}</b></button>
		<button class="tie" on:click={onTie} aria-label="Tie-breaker: {teamName(tie)}"><img src={tieArt(tie)} class:flip={tieFlip} alt="" /></button>
		<span class="rd">R{round}</span>
		<span class="tpips">{#each ROMAN as r, i}<i class:is-done={i + 1 < turn} class:is-now={i + 1 === turn}>{r}</i>{/each}</span>
		<span class="track" aria-label="Battle zone: {placeName(LANE[lane])}">
			{#each zones as z, k}{#if k}<i class="seg"></i>{/if}<i class="zone {ZONE_TEAM[z]}" class:is-now={z === lane}></i>{/each}
		</span>
		<button class="waves" on:click={onSheet} aria-label="Waves left: {waves}"><i class="wv"></i><b>{waves}</b></button>
		<button class="pteam is-{view} is-right" on:click={onSheet} aria-label="{teamAdj(view)} Life {life[view]}"><b>{life[view]}</b><img src={lifeArt(view, 'front')} alt="" /></button>
	</div>
{:else}
<div class="score is-{view}">
	{@render wing(enemy, false)}
	<div class="mid">
		<div class="turnrow">
			<span class="rd">Round {round}</span>
			<span class="tpips">{#each ROMAN as r, i}<i class:is-done={i + 1 < turn} class:is-now={i + 1 === turn}>{r}</i>{/each}</span>
		</div>
		<div class="lanerow">
			<span class="track" title="Battle zone: {placeName(LANE[lane])}">
				{#each zones as z, k}{#if k}<i class="seg"></i>{/if}<i class="zone {ZONE_TEAM[z]}" class:is-now={z === lane}></i>{/each}
			</span>
			<span class="waves" title="Waves left: {waves}">
				{#each waveTok as full, i}<button class="wv" class:spent={!full} class:flip={flips[`w${i}`]} on:click={() => onWave(i)} aria-label="Wave token"></button>{/each}
			</span>
		</div>
	</div>
	{@render wing(view, true)}
	<button class="tie" class:is-right={tie === view} on:click={onTie} title="Tie-breaker: {teamName(tie)}" aria-label="Tie-breaker: {teamName(tie)}">
		<img src={tieArt(tie)} class:flip={tieFlip} alt="" />
	</button>
</div>
{/if}

<style>
	/* ── phone: one row inside the top bar (GameView's .p-top), no box of its own ── */
	.score.ph { position: static; flex: 1; min-width: 0; width: auto; height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 2px;
		background: none; border: 0; border-radius: 0; box-shadow: none; }
	.score.ph::after { display: none; }
	.ph .pteam { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 40px; padding: 0 2px; border: 0; background: none; color: var(--tc-hi); }
	.ph .pteam img { width: 22px; height: 22px; object-fit: contain; }
	.ph .pteam b { font-weight: 400; font-size: 26px; line-height: 1; min-width: 15px; text-align: center; font-variant-numeric: tabular-nums; }
	.ph .tie { position: static; flex: none; width: 26px; height: 26px; box-shadow: 0 0 0 1.5px var(--brass), 0 2px 5px rgba(0, 0, 0, 0.6); }
	.ph .rd { flex: none; font-size: 13px; line-height: 1; letter-spacing: 0.06em; color: var(--brass); }
	.ph .tpips { flex: none; gap: 2px; }
	.ph .tpips i { width: 17px; height: 19px; font-size: 11px; border-radius: 4px; }
	.ph .track { flex: none; }
	.ph .seg { width: 4px; }
	.ph .zone { width: 12px; height: 14px; }
	.ph .zone.is-now { width: 16px; height: 19px; }
	.ph .waves { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 40px; padding: 0 2px 0 5px; border: 0; border-left: 1px solid var(--brass-faint); background: none; color: var(--brass-hi); }
	.ph .waves .wv { width: 12px; height: 12px; }
	.ph .waves b { font-weight: 400; font-size: 17px; line-height: 1; min-width: 10px; font-variant-numeric: tabular-nums; }
	@media (max-width: 370px) { .ph .tpips i { width: 15px; } .ph .pteam b { font-size: 23px; } }

	.score { position: absolute; left: calc(50% - 280px); top: 0; z-index: 6; width: 560px; height: 64px;
		display: grid; grid-template-columns: 184px 192px 184px;
		background: var(--hull); border: 1px solid var(--brass-line); border-top: 0; border-radius: 0 0 22px 22px; box-shadow: var(--sh-hud); }
	/* the tide line: where the two teams meet (enemy colour on the left) */
	.score::after { content: ''; position: absolute; left: 22px; right: 22px; bottom: -1px; height: 2px; border-radius: 2px;
		background: linear-gradient(90deg, var(--orange), var(--brass) 50%, var(--blue)); }
	.score.is-orange::after { background: linear-gradient(90deg, var(--blue), var(--brass) 50%, var(--orange)); }

	/* a team: its name over its Life tokens, the count beside them; the outer 46px is the coin's dock */
	.wing { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 0 8px 0 46px; }
	.wing.is-right { flex-direction: row-reverse; padding: 0 46px 0 8px; }
	.col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
	.is-right .col { align-items: flex-start; }
	.nm { font-size: 13px; line-height: 1; letter-spacing: 0.07em; text-transform: uppercase; color: var(--tc-hi); white-space: nowrap; }
	.n { flex: none; width: 28px; text-align: center; font-weight: 400; font-size: 40px; line-height: 1; color: var(--tc-hi); }
	.lives { display: flex; flex-direction: row-reverse; gap: 1px; } /* token 0 sits nearest the middle on both sides */
	.is-right .lives { flex-direction: row; }
	.lives.two { display: grid; grid-template-columns: repeat(var(--per), 15px); direction: rtl; }
	.is-right .lives.two { direction: ltr; }
	.lt { width: 17px; height: 17px; padding: 0; border: 0; background: transparent no-repeat center / contain; }
	.two .lt { width: 15px; height: 15px; }
	.lt.lost { opacity: 0.62; }
	.lt:hover, .wv:hover { transform: scale(1.18); }
	.lt.flip, .wv.flip, .tie img.flip { animation: flip 0.45s ease-in-out; }
	@keyframes flip { from { transform: rotateY(0); } to { transform: rotateY(360deg); } }

	.mid { display: flex; flex-direction: column; justify-content: center; gap: 7px; padding: 0 6px;
		border-left: 1px solid var(--brass-faint); border-right: 1px solid var(--brass-faint); }
	.turnrow, .lanerow { display: flex; align-items: center; justify-content: center; white-space: nowrap; }
	.turnrow { gap: 8px; }
	.rd { font-size: 14px; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass); }
	.tpips { display: flex; gap: 4px; }
	.tpips i { font-style: normal; display: grid; place-items: center; width: 23px; height: 19px; border-radius: 5px; font-size: 12px; line-height: 1;
		color: var(--ink-3); border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(2, 11, 22, 0.5); }
	.tpips i.is-done { color: var(--ink-dark); background: linear-gradient(180deg, #cdb276, #a8853f); border-color: #8a6a2c; }
	.tpips i.is-now { color: var(--ink-dark); background: linear-gradient(180deg, #fff3cf, var(--brass-hi) 50%, var(--brass)); border-color: #fff3cf; box-shadow: 0 0 10px rgba(244, 223, 168, 0.6); }

	/* the lane: enemy beach · centre · your beach, the battle zone marked; then the waves left */
	.lanerow { gap: 9px; max-width: 100%; }
	.track { flex: none; display: flex; align-items: center; }
	.seg { width: 10px; height: 2px; background: var(--brass-line); }
	.zone { position: relative; width: 15px; height: 17px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: #cdb98a; opacity: 0.7; }
	.zone.is-blue { background: #9fcdf5; }
	.zone.is-orange { background: #d98548; }
	.zone.is-now { opacity: 1; width: 21px; height: 24px; background: linear-gradient(180deg, #fff3cf, var(--brass)); }
	.zone.is-now::after { content: ''; position: absolute; inset: 3px; clip-path: inherit; background: #cdb98a; }
	.zone.is-now.is-blue::after { background: #9fcdf5; }
	.zone.is-now.is-orange::after { background: #d98548; }
	.waves { display: flex; align-items: center; gap: 3px; min-width: 0; padding-left: 9px; border-left: 1px solid var(--brass-faint); }
	.wv { flex: 0 1 auto; width: 12px; min-width: 4px; height: 12px; padding: 0; border: 0; border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, #fff3cf, var(--brass) 55%, #8a6a2c); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5); }
	.wv.spent { background: rgba(2, 11, 22, 0.6); box-shadow: inset 0 0 0 1px rgba(216, 179, 106, 0.4); }

	/* the tie-breaker coin, docked on the holder's end */
	.tie { position: absolute; top: 15px; left: 7px; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; background: none;
		box-shadow: 0 0 0 2px #06182a, 0 0 0 3px var(--brass), 0 3px 8px rgba(0, 0, 0, 0.6); }
	.tie.is-right { left: auto; right: 7px; }
	.tie img { display: block; width: 100%; height: 100%; border-radius: 50%; }
</style>
