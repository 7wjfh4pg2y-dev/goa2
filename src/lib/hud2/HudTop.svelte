<script lang="ts">
	// The 2.0 top bar (design px; it sits in GameView's zoomed layer): Round + turn pips · the enemy's Life · the
	// tie-breaker coin · your Life · Wave N + the wave tokens. Viewer-relative: the enemy on the LEFT. Every token
	// flips on a click (the shared change makes everyone see the flip). Under the bar, round the coin, the BEAM (see
	// beam.ts): the minion tug of war in the battle zone; Effects → Beam adds the spark and the pulses.
	import { afterUpdate } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Team } from '$lib/match';
	import { clashAt, restAt } from './beam';

	export let W = 1440; // the design canvas width
	export let round = 1;
	export let turn = 1;
	export let lifeTok: Record<Team, boolean[]> = { orange: [], blue: [] };
	export let waveTok: boolean[] = [];
	export let tieBreaker: Team = 'orange';
	export let flips: Record<string, boolean> = {};
	export let tieFlip = false;
	export let left: Team = 'blue'; // the viewer's enemy
	export let zone = 1;
	export let zones = 3;
	export let counts: Record<Team, number> = { orange: 0, blue: 0 };
	export let starts: Record<Team, number> = { orange: 0, blue: 0 };
	export let won: Team | null = null;
	export let fx = false;
	export let lifeArt: (t: Team, side: 'front' | 'back') => string;
	export let tieArt: (t: Team) => string;
	export let onLife: (t: Team, i: number) => void = () => {};
	export let onWave: (i: number) => void = () => {};
	export let onTie: () => void = () => {};

	$: right = (left === 'orange' ? 'blue' : 'orange') as Team;
	$: waveNo = waveTok.length - waveTok.filter(Boolean).length + 1;
	const TEAMNAME: Record<Team, string> = { orange: 'Atlanteans', blue: 'Titans' };

	// geometry (design px)
	const SIDE = 150, BH = 56, COIN = 74, MID = COIN + 26;
	$: BW = Math.max(1100, W - 176);
	$: LIFEW = (BW - SIDE * 2 - MID) / 2;
	$: CX = SIDE + LIFEW + MID / 2;
	const CY = BH / 2, BR = COIN / 2 + 7, BY = BH + 5;
	$: BX0 = SIDE;
	$: BX1 = SIDE + LIFEW * 2 + MID;
	const th1 = Math.acos((BY - CY) / BR) * 0.62;
	const ex = BR * Math.sin(th1), ey = CY + BR * Math.cos(th1);
	const fc = ex + ((ey - BY) / Math.sin(th1)) * Math.cos(th1);
	$: beamD = `M ${BX0} ${BY} L ${CX - fc - 14} ${BY} Q ${CX - fc} ${BY} ${CX - ex} ${ey} A ${BR} ${BR} 0 0 0 ${CX + ex} ${ey} Q ${CX + fc} ${BY} ${CX + fc + 14} ${BY} L ${BX1} ${BY}`;
	// a token size that fits however many Life tokens the game started with
	$: nLife = Math.max(lifeTok.orange.length, lifeTok.blue.length, 1);
	$: TK = Math.min(42, (LIFEW - 28 - (nLife - 1) * 8) / nLife);

	// the beam: measured once per shape, the clash glides to its new place
	let beamEl: SVGPathElement;
	let BL = 0, measured = '';
	const cl = tweened(0, { duration: 900, easing: cubicOut });
	let clash = { x: 0, y: 0 }, marks: { x: number; y: number }[] = [], ticks: { x: number; y: number }[] = [];
	const at = (len: number) => { const p = beamEl.getPointAtLength(Math.max(0, Math.min(BL, len))); return { x: p.x, y: p.y }; };
	afterUpdate(() => {
		if (!beamEl || measured === beamD) return;
		measured = beamD;
		BL = beamEl.getTotalLength();
		const g = { L: BL, lifeW: LIFEW, left, zones };
		marks = [at(restAt(g, 0)), at(restAt(g, zones - 1))];
		ticks = Array.from({ length: Math.max(0, zones - 2) }, (_, i) => at(restAt(g, i + 1)));
		cl.set(target, { duration: 0 });
	});
	$: target = BL ? clashAt({ L: BL, lifeW: LIFEW, left, zone, zones, orange: counts.orange, blue: counts.blue, startO: starts.orange, startB: starts.blue, won }) : 0;
	$: if (BL) cl.set(target);
	$: clash = BL && beamEl ? at($cl) : clash;
	$: leftTeam = left;
	$: cA = left === 'blue' ? '#2f7fe6' : '#ef7d22';
	$: cB = left === 'blue' ? '#ef7d22' : '#2f7fe6';
	$: hA = left === 'blue' ? '#5aa8ff' : '#ff9a3c';
	$: hB = left === 'blue' ? '#ff9a3c' : '#5aa8ff';
</script>

{#snippet lifebox(t: Team)}
	<div class="hs life is-{t}" title={TEAMNAME[t]}>
		{#each lifeTok[t] as full, i (i)}
			<button class="ltok" class:dep={!full} class:flip={flips[`l${t}${i}`]} on:click={() => onLife(t, i)} aria-label="{TEAMNAME[t]} Life token" style="--tk:{TK}px">
				<img src={lifeArt(t, full ? 'front' : 'back')} alt="" />
			</button>
		{/each}
	</div>
{/snippet}

<div class="helm" style="width:{BW}px; --side:{SIDE}px; --bl:{LIFEW}px; --bm:{MID}px; --bh:{BH}px; --coin:{COIN}px">
	<div class="hs round"><b>Round {round}</b><span class="dash">{#each [1, 2, 3, 4] as t (t)}<i class:done={t < turn} class:on={t === turn}></i>{/each}</span></div>
	{@render lifebox(leftTeam)}
	<div class="hs mid"></div>
	{@render lifebox(right)}
	<div class="hs wavebox">
		<b>Wave {waveNo}</b>
		<span class="wtoks">{#each waveTok as f, i (i)}<button class="wtok" class:dep={!f} class:flip={flips[`w${i}`]} on:click={() => onWave(i)} aria-label="Wave token"><svg viewBox="0 0 24 24"><use href="#h2-wavetok" /></svg></button>{/each}</span>
	</div>
	<svg class="beam" viewBox="0 0 {BW} 120" width={BW} height="120" aria-hidden="true">
		<defs>
			<linearGradient id="h2-bm-l" gradientUnits="userSpaceOnUse" x1={BX0} x2={BX1} y1="0" y2="0"><stop offset="0" stop-color={left === 'blue' ? '#1d5fc0' : '#c85a0e'} /><stop offset="1" stop-color={left === 'blue' ? '#8fd0ff' : '#ffd08a'} /></linearGradient>
			<linearGradient id="h2-bm-r" gradientUnits="userSpaceOnUse" x1={BX0} x2={BX1} y1="0" y2="0"><stop offset="0" stop-color={right === 'orange' ? '#ffd08a' : '#8fd0ff'} /><stop offset="1" stop-color={right === 'orange' ? '#c85a0e' : '#1d5fc0'} /></linearGradient>
			<symbol id="h2-wavetok" viewBox="0 0 24 24">
				<linearGradient id="h2-wt-split" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f08a34" /><stop offset="0.5" stop-color="#d0681a" /><stop offset="0.5" stop-color="#2a74d6" /><stop offset="1" stop-color="#1a4f9e" /></linearGradient>
				<circle cx="12" cy="12" r="11" fill="url(#h2-wt-split)" stroke="#0a1a2c" stroke-width="1.2" />
				<circle cx="12" cy="12" r="9.6" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" />
				<path d="M4.6 15.2c2.2 0 3.2-1.6 4.4-3.8 1.2-2.3 2.8-4.2 5.6-4.2 2.4 0 4.2 1.5 4.2 3.6 0 1.6-1.1 2.7-2.6 2.7-1.1 0-1.9-.7-1.9-1.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
				<path d="M4.6 18.4c1.4 0 2-.9 3.3-.9s1.9.9 3.3.9 2-.9 3.3-.9 1.9.9 3.3.9" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
			</symbol>
		</defs>
		<path bind:this={beamEl} d={beamD} class="track" />
		<path d={beamD} class="bglow" stroke={cA} stroke-dasharray="{$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bglow" stroke={cB} stroke-dasharray="0 {$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bglow2" stroke={hA} stroke-dasharray="{$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bglow2" stroke={hB} stroke-dasharray="0 {$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bmid" stroke="url(#h2-bm-l)" stroke-dasharray="{$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bmid" stroke="url(#h2-bm-r)" stroke-dasharray="0 {$cl} {BL * 2 + 1}" />
		<path d={beamD} class="bcore" stroke-dasharray="{$cl} {BL * 2 + 1}" stroke={left === 'blue' ? '#e6f4ff' : '#fff1dc'} />
		<path d={beamD} class="bcore" stroke-dasharray="0 {$cl} {BL * 2 + 1}" stroke={left === 'blue' ? '#fff1dc' : '#e6f4ff'} />
		{#if fx && BL}
			<mask id="h2-bm-ml" maskUnits="userSpaceOnUse"><path d={beamD} fill="none" stroke="#fff" stroke-width="22" stroke-dasharray="{$cl} {BL * 2 + 1}" /></mask>
			<mask id="h2-bm-mr" maskUnits="userSpaceOnUse"><path d={beamD} fill="none" stroke="#fff" stroke-width="22" stroke-dasharray="0 {$cl} {BL * 2 + 1}" /></mask>
			<path d={beamD} class="pulse l" mask="url(#h2-bm-ml)" />
			<path d={beamD} class="pulse r" mask="url(#h2-bm-mr)" />
		{/if}
		{#each ticks as t, i (i)}<circle cx={t.x} cy={t.y} r="2.2" class="tick" />{/each}
		{#each marks as m, i (i)}<rect x={m.x - 4.5} y={m.y - 4.5} width="9" height="9" transform="rotate(45 {m.x} {m.y})" class="bmark" />{/each}
		<circle cx={BX0} cy={BY} r="5" fill={cA} class="src" /><circle cx={BX1} cy={BY} r="5" fill={cB} class="src" />
	</svg>
	{#if fx && BL}<span class="clash" style="left:{clash.x}px; top:{clash.y}px"><i class="fl"></i><i class="sp a"></i><i class="sp b"></i><i class="sp c"></i></span>{/if}
	<button class="tiecoin" class:flip={tieFlip} style="left:{CX}px; top:{CY}px" on:click={onTie} title="Tie-breaker — the {TEAMNAME[tieBreaker]} win ties (click to flip)"><img src={tieArt(tieBreaker)} alt="Tie-breaker" /></button>
</div>

<style>
	.helm { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); --ink: #f5f1e8; --ink2: #bccbd9; --ink3: #8a9fb3;
		position: relative; display: grid; grid-template-columns: var(--side) var(--bl) var(--bm) var(--bl) var(--side); height: var(--bh); border-radius: 16px; color: var(--ink);
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); box-sizing: border-box; pointer-events: auto; }
	.hs { display: flex; align-items: center; justify-content: center; min-width: 0; }
	.round, .wavebox { flex-direction: column; gap: 5px; }
	.round b, .wavebox b { font-weight: 400; font-size: 16px; line-height: 1; white-space: nowrap; }
	.dash { display: flex; gap: 3px; height: 18px; align-items: center; }
	.dash i { width: 13px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.15); }
	.dash i.done { background: var(--brass); opacity: 0.6; }
	.dash i.on { background: var(--brass-hi); }
	.life { gap: 8px; }
	.life.is-blue { background: linear-gradient(180deg, #2b6fd2, #173f88); box-shadow: inset 0 0 0 1px rgba(140, 195, 255, 0.4); }
	.life.is-orange { background: linear-gradient(180deg, #d0701f, #8a400f); box-shadow: inset 0 0 0 1px rgba(255, 190, 120, 0.42); }
	.ltok, .wtok, .tiecoin { padding: 0; border: 0; background: none; cursor: pointer; }
	.ltok img { display: block; width: var(--tk); height: var(--tk); }
	.ltok.dep img { opacity: 0.4; filter: grayscale(0.6); }
	.wtoks { display: flex; gap: 4px; height: 18px; align-items: center; }
	.wtok svg { display: block; width: 18px; height: 18px; }
	.wtok.dep svg { opacity: 0.28; filter: grayscale(1); }
	.flip { animation: coinflip 0.45s ease-in-out; }
	@keyframes coinflip { from { transform: rotateY(0); } to { transform: rotateY(360deg); } }
	.tiecoin { position: absolute; z-index: 2; width: var(--coin); height: var(--coin); margin: calc(var(--coin) / -2) 0 0 calc(var(--coin) / -2); border-radius: 50%; }
	.tiecoin img { display: block; width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 0 0 3px #0a1a2c, 0 0 0 4.5px var(--brass), 0 8px 18px rgba(0, 0, 0, 0.6); }
	.beam { position: absolute; left: -1px; top: -1px; overflow: visible; pointer-events: none; z-index: 1; }
	.beam path { fill: none; stroke-linecap: round; }
	.beam .track { stroke: rgba(0, 0, 0, 0.5); stroke-width: 10; }
	.beam .bglow { stroke-width: 16; opacity: 0.3; }
	.beam .bglow2 { stroke-width: 9; opacity: 0.55; }
	.beam .bmid { stroke-width: 6; }
	.beam .bcore { stroke-width: 2.2; }
	.beam .tick { fill: rgba(255, 255, 255, 0.55); }
	.beam .bmark { fill: var(--brass-hi); stroke: #0a1a2c; stroke-width: 1.5; }
	.beam .src { stroke: #fff; stroke-width: 2; }
	.beam .pulse { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 8 44; opacity: 0.85; animation: flowL 1.2s linear infinite; }
	.beam .pulse.r { animation-name: flowR; }
	@keyframes flowL { to { stroke-dashoffset: -52; } }
	@keyframes flowR { to { stroke-dashoffset: 52; } }
	.clash { position: absolute; z-index: 3; width: 0; height: 0; pointer-events: none; }
	.clash i { position: absolute; left: 0; top: 0; border-radius: 50%; }
	.fl { width: 44px; height: 44px; margin: -22px 0 0 -22px; background: radial-gradient(circle, #fff 0 14%, rgba(255, 240, 214, 0.95) 24%, rgba(200, 160, 255, 0.5) 46%, transparent 70%); animation: clash 0.9s ease-in-out infinite alternate; }
	.sp { width: 6px; height: 6px; margin: -3px 0 0 -3px; background: #fff; box-shadow: 0 0 6px 2px rgba(255, 220, 170, 0.8); opacity: 0; animation: spark 1.1s ease-out infinite; }
	.sp.a { --dx: -20px; --dy: -14px; } .sp.b { --dx: 22px; --dy: -10px; animation-delay: 0.35s; } .sp.c { --dx: 3px; --dy: 20px; animation-delay: 0.7s; }
	@keyframes clash { from { transform: scale(0.8); opacity: 0.8; } to { transform: scale(1.15); opacity: 1; } }
	@keyframes spark { 0% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .fl, .sp, .beam .pulse { animation: none; } }
</style>
