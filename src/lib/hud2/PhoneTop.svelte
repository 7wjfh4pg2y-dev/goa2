<script lang="ts">
	// The phone's top bar (2.0, 44 px): ☰ · R{n} + the gold turn card (its number is the turn) · the tie-breaker coin ·
	// the waves · both teams' Life (the split token, the enemy's count on the LEFT) · your coins (tap: − / +) · the
	// control wheel. Under it the BEAM (beam.ts, the desktop's rules on a straight line): the enemy's throne at the
	// left end, yours at the right, a tick at each zone's resting point; the clash glides with the minions' health.
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Team } from '$lib/match';
	import { clashAt, restAt } from './beam';

	export let round = 1;
	export let turn = 1;
	export let tieBreaker: Team = 'orange';
	export let tieArt: (t: Team) => string;
	export let tieFlip = false;
	export let waves = 0;
	export let life: Record<Team, number> = { orange: 0, blue: 0 };
	export let lifeSplit = '';
	export let left: Team = 'blue'; // the viewer's enemy
	export let coins: number | null = null;
	export let conn = 'connected';
	export let badge = 0; // seat requests waiting (host)
	// the beam
	export let zone = 1;
	export let zones = 3;
	export let counts: Record<Team, number> = { orange: 0, blue: 0 };
	export let starts: Record<Team, number> = { orange: 0, blue: 0 };
	export let won: Team | null = null;
	export let fx = true;
	export let onMenu: () => void = () => {};
	export let onWheel: () => void = () => {};
	export let onTie: () => void = () => {};
	export let onSheet: () => void = () => {}; // waves / Life: the sheet where tokens flip
	export let onCoins: (d: number) => void = () => {};
	/** the turn's state for the free middle: planning dots (player colours, filled = in) or the acting order (lit = acting) */
	export let status: { planning: boolean; countdown: boolean; dots: { color: string; ok: boolean }[]; order: { portrait: string; color: string; team: string }[]; acting: number } | null = null;

	$: right = (left === 'orange' ? 'blue' : 'orange') as Team;
	const TC: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	let purse = false;

	// the beam, in px along its width
	let L = 0;
	$: lifeW = L * 0.3;
	$: ticks = L ? [0, ...Array.from({ length: zones }, (_, z) => restAt({ L, lifeW, left, zones }, z)), L] : [];
	const cl = tweened(0, { duration: 900, easing: cubicOut });
	$: if (L) cl.set(clashAt({ L, lifeW, left, zone, zones, orange: counts.orange, blue: counts.blue, startO: starts.orange, startB: starts.blue, won }));
</script>

<div class="ptop">
	<div class="bar">
		<button class="ib menu" on:click={onMenu} aria-label="Room"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg><i class="cdot {conn}"></i>{#if badge}<em>{badge}</em>{/if}</button>
		<span class="rt" title="Round {round}, turn {turn}"><b>R{round}</b><span class="tcard">{turn}</span></span>
		<button class="ib coin" on:click={onTie} title="Tie-breaker — tap to flip" aria-label="Tie-breaker"><img src={tieArt(tieBreaker)} class:flip={tieFlip} alt="" /></button>
		<button class="pill" on:click={onSheet} aria-label="Waves">
			<svg class="wv" viewBox="0 0 24 24" aria-hidden="true">
				<defs><linearGradient id="pt-wt-split" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f08a34" /><stop offset="0.5" stop-color="#d0681a" /><stop offset="0.5" stop-color="#2a74d6" /><stop offset="1" stop-color="#1a4f9e" /></linearGradient></defs>
				<circle cx="12" cy="12" r="11" fill="url(#pt-wt-split)" stroke="#0a1a2c" stroke-width="1.2" />
				<circle cx="12" cy="12" r="9.6" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" />
				<path d="M4.6 15.2c2.2 0 3.2-1.6 4.4-3.8 1.2-2.3 2.8-4.2 5.6-4.2 2.4 0 4.2 1.5 4.2 3.6 0 1.6-1.1 2.7-2.6 2.7-1.1 0-1.9-.7-1.9-1.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />
				<path d="M4.6 18.4c1.4 0 2-.9 3.3-.9s1.9.9 3.3.9 2-.9 3.3-.9 1.9.9 3.3.9" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
			</svg><b>{waves}</b>
		</button>
		<button class="pill life" on:click={onSheet} aria-label="Life"><b style="color:{TC[left]}">{life[left]}</b><img src={lifeSplit} alt="" class:mir={left === 'blue'} /><b style="color:{TC[right]}">{life[right]}</b></button>
		<span class="mid">
			{#if status?.planning}
				{#if status.countdown}<em class="rv">Revealing</em>
				{:else}<span class="dots">{#each status.dots as d, i (i)}<i class:ok={d.ok} style="--c:{d.color}"></i>{/each}</span>{/if}
			{:else if status}
				<span class="ord">{#each status.order as o, k (k)}<i class="f" class:now={k === status.acting} class:done={k < status.acting} style="--pc:{o.color}; {o.portrait}"></i>{/each}</span>
			{/if}
		</span>
		{#if coins != null}
			<span class="purse">
				<button class="gold" on:click={() => (purse = !purse)} aria-label="Coins"><i class="gc"><b>{coins}</b></i></button>
				{#if purse}<span class="pm"><button on:click={() => onCoins(-1)} aria-label="Remove a coin">−</button><button on:click={() => onCoins(1)} aria-label="Add a coin">+</button></span>{/if}
			</span>
		{/if}
		<button class="ib wheel" on:click={onWheel} aria-label="Controls"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></svg></button>
	</div>
	<div class="beam" bind:clientWidth={L} style="--l:{TC[left]}; --r:{TC[right]}; --x:{$cl}px">
		<span class="seg l"></span><span class="seg r"></span>
		{#each ticks as x, i (i)}<i class="tick" class:end={i === 0 || i === ticks.length - 1} style="left:{x}px"></i>{/each}
		<span class="clash" class:fx></span>
	</div>
</div>

<style>
	.ptop { position: absolute; top: 0; left: 0; right: 0; z-index: 14; color: #f5f1e8; pointer-events: none; }
	.bar { height: 44px; display: flex; align-items: center; gap: 4px; padding: 0 6px; box-sizing: border-box; pointer-events: auto;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.98), rgba(6, 21, 38, 0.98)); border-bottom: 1px solid rgba(216, 179, 106, 0.4); }
	button { font: inherit; color: inherit; padding: 0; cursor: pointer; }
	.ib { position: relative; flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(216, 179, 106, 0.4); }
	.ib svg { width: 18px; height: 18px; fill: none; stroke: #f4dfa8; stroke-width: 1.8; stroke-linecap: round; }
	.cdot { position: absolute; right: 1px; top: 1px; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 1.5px #0a1a2c; }
	.cdot.connected { background: #22c55e; } .cdot.closed { background: #ef4444; }
	.menu em { position: absolute; left: -3px; bottom: -3px; min-width: 14px; height: 14px; border-radius: 7px; font-style: normal; font-size: 9px; display: grid; place-items: center; background: #b42318; }
	.rt { flex: none; display: inline-flex; align-items: center; gap: 4px; }
	.rt b { font-weight: 400; font-size: 14px; color: #f4dfa8; }
	/* the gold turn card: its number is the turn */
	.tcard { width: 20px; height: 27px; border-radius: 3px; display: grid; place-items: center; font-size: 14px; color: #3a2606; text-shadow: 0 1px 0 rgba(255, 240, 200, 0.7);
		background: linear-gradient(160deg, #fff1c4, #e2b453 55%, #a8792a); box-shadow: inset 0 0 0 1.5px rgba(122, 86, 24, 0.6), 0 2px 4px rgba(0, 0, 0, 0.5); }
	.coin { border: 0; background: none; width: 30px; height: 30px; }
	.coin img { width: 30px; height: 30px; border-radius: 50%; }
	.coin img.flip { transform: rotateY(180deg); transition: transform 0.4s; }
	.pill { flex: none; height: 28px; display: inline-flex; align-items: center; gap: 3px; padding: 0 7px; border-radius: 999px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.12); }
	.pill b { font-weight: 400; font-size: 14px; min-width: 1ch; text-align: center; font-variant-numeric: tabular-nums; }
	.wv { width: 20px; height: 20px; }
	.life img { width: 22px; height: 22px; object-fit: contain; }
	.life img.mir { transform: scaleX(-1); }
	.purse { position: relative; flex: none; }
	/* the free middle: the turn's state */
	.mid { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
	.dots { display: flex; gap: 4px; }
	.dots i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--c); box-sizing: border-box; opacity: 0.55; }
	.dots i.ok { background: var(--c); opacity: 1; }
	.rv { font-style: normal; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #f4dfa8; }
	.ord { display: flex; align-items: center; }
	.ord .f { width: 18px; height: 18px; margin-left: -3px; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 1.5px var(--pc), 0 0 0 2.5px #0a1a2c; }
	.ord .f:first-child { margin-left: 0; }
	.ord .f.done { opacity: 0.4; filter: grayscale(0.7); }
	.ord .f.now { position: relative; z-index: 1; width: 24px; height: 24px; margin: 0 2px; box-shadow: 0 0 0 2px #f4dfa8, 0 0 8px 2px rgba(244, 223, 168, 0.6); }
	.gold { border: 0; background: none; padding: 0; }
	.gold .gc { width: 28px; height: 28px; display: grid; place-items: center; }
	.gc b { font-weight: 400; font-size: 14px; line-height: 1; color: #3a2606; text-shadow: 0 1px 0 rgba(255, 244, 200, 0.6); font-variant-numeric: tabular-nums; }
	.gc { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff2c0, #e8bd58 55%, #a8792a); box-shadow: inset 0 0 0 1.5px rgba(122, 86, 24, 0.55); }
	.pm { position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 5px; border-radius: 999px; background: #0a1a2c; border: 1px solid rgba(216, 179, 106, 0.5); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.6); }
	.pm button { width: 30px; height: 30px; border-radius: 50%; font-size: 18px; line-height: 1; color: #f4dfa8; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(216, 179, 106, 0.4); }
	.wheel { margin-left: 0; }
	/* the beam: a thin line under the bar, each side in its team's colour up to the clash */
	.beam { position: relative; height: 10px; }
	.seg { position: absolute; top: 4px; height: 2px; }
	.seg.l { left: 0; width: var(--x); background: linear-gradient(90deg, color-mix(in srgb, var(--l) 60%, #000), var(--l)); }
	.seg.r { left: var(--x); right: 0; background: linear-gradient(90deg, var(--r), color-mix(in srgb, var(--r) 60%, #000)); }
	.tick { position: absolute; top: 2px; width: 2px; height: 6px; margin-left: -1px; background: rgba(244, 223, 168, 0.7); border-radius: 1px; }
	.tick.end { height: 8px; top: 1px; background: #f4dfa8; }
	.clash { position: absolute; top: 5px; left: var(--x); width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 4px 1px rgba(255, 220, 160, 0.8); }
	.clash.fx { animation: flick 0.6s steps(3) infinite; }
	@keyframes flick { 0% { opacity: 1; } 33% { opacity: 0.6; } 66% { opacity: 0.9; } }
	@media (prefers-reduced-motion: reduce) { .clash.fx { animation: none; } }
</style>
