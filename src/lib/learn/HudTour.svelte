<script lang="ts">
	// How to play → the HUD chapters: the game's REAL HUD parts (HudTop, HudOrder, HudBoard, Chronicle, HudDash /
	// PhoneTop, PhoneDash) laid out like a game in progress, fed made-up data, over the real island. Numbered markers
	// point at the parts the step's text lists (`spots`: a CSS selector inside this box each); a tap on a marker (or
	// on its row in the text) lights that part. Nothing here talks to a game — every button is a no-op.
	import { onMount, tick } from 'svelte';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import Card from '$lib/cards/Card.svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import HudTop from '$lib/hud2/HudTop.svelte';
	import HudOrder, { type OrderEntry } from '$lib/hud2/HudOrder.svelte';
	import HudBoard from '$lib/hud2/HudBoard.svelte';
	import Chronicle from '$lib/hud2/Chronicle.svelte';
	import HudDash from '$lib/hud2/HudDash.svelte';
	import PhoneTop from '$lib/hud2/PhoneTop.svelte';
	import PhoneDash from '$lib/hud2/PhoneDash.svelte';
	import StatBubbles from '$lib/hud2/StatBubbles.svelte';
	import { LEARN_MAP, type ScenePiece } from '$lib/learn';
	import { throneHex, type LogEntry } from '$lib/match';
	import { heroById, portraitCss } from '$lib/heroes';
	import { heroCards, heroName, pathRank } from '$lib/cards/deck';
	import { newPlayerCardState, commitCard, revealTurn, takeUpgrade, levelOf, type PlayerCardState } from '$lib/cards/cardstate';

	type Team = 'orange' | 'blue';
	export let mode: 'desktop' | 'phone' = 'desktop';
	export let pieces: ScenePiece[] = [];
	export let spots: { sel: string }[] = [];
	export let active = -1;
	export let pills = false; // show the actions round your hero (the board step)
	export let close = false; // close-up of your dashboard (the dashboard step)
	export let onSpot: (n: number) => void = () => {};

	const art = import.meta.glob('../images/hud/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
	const lifeArt = (t: Team, side: 'front' | 'back') => art[`../images/hud/life_${t}_${side}.webp`];
	const tieArt = (t: Team) => art[`../images/hud/tiebreaker_${t}.webp`];
	const markArt = () => '';
	const nop = () => {};

	// ── a made-up 2 v 2: you are Wasp (Titans), turn 2 of round 2 (everyone levelled once: one item each), the cards are face up and yours acts first ──
	const P = [
		{ id: 'p1', name: 'Zara', hero: 'wasp', team: 'blue' as Team, color: '#eab308', t1: 'GREEN', t2: 'BLUE' },
		{ id: 'p2', name: 'Priya', hero: 'xargatha', team: 'blue' as Team, color: '#22c55e', t1: 'GREEN', t2: 'RED' },
		{ id: 'p3', name: 'Mo', hero: 'arien', team: 'orange' as Team, color: '#dc2626', t1: 'GREEN', t2: 'BLUE' },
		{ id: 'p4', name: 'Sam', hero: 'brogan', team: 'orange' as Team, color: '#a855f7', t1: 'GREEN', t2: 'RED' }
	];
	const tierOne = (h: string, c: string) => heroCards(h).findIndex((x) => x.level === 1 && x.color === c);
	const tierTwo = (h: string, c: string) => heroCards(h).findIndex((x) => x.level === 2 && x.color === c && !x.handicapped && pathRank(x) === 1);
	function stateOf(p: (typeof P)[number]): PlayerCardState {
		let s = takeUpgrade(newPlayerCardState(p.hero), tierTwo(p.hero, 'RED'));
		s = { ...s, level: levelOf(s) };
		s = revealTurn(commitCard(s, tierOne(p.hero, p.t1)), 0);
		s = revealTurn(commitCard(s, tierOne(p.hero, p.t2)), 1);
		return { ...s, coins: p.id === 'p1' ? 2 : 1 };
	}
	const CS: Record<string, PlayerCardState> = Object.fromEntries(P.map((p) => [p.id, stateOf(p)]));
	const me = P[0], mine = CS.p1;
	const ini = (p: (typeof P)[number]) => heroCards(p.hero)[CS[p.id].turns[1] ?? 0]?.initiative ?? 0;
	const order: OrderEntry[] = [...P].sort((a, b) => ini(b) - ini(a)).map((p) => ({ pid: p.id, hero: p.hero, heroName: heroName(p.hero), player: p.name, team: p.team,
		idx: CS[p.id].turns[1] ?? 0, ini: ini(p), tied: false, portrait: portraitCss(p.hero), color: p.color }));
	const acting = Math.max(0, order.findIndex((o) => o.pid === me.id));
	const log: LogEntry[] = [
		{ id: 'l1', by: 'Mo', text: 'moved Arien', at: 1 },
		{ id: 'l2', by: 'Sam', text: 'defeated a Titan melee minion (+2 coins)', at: 2 },
		{ id: 'l3', by: 'Zara', text: 'moved Wasp', at: 3 },
		{ id: 'l4', by: 'Priya', text: 'moved Xargatha', at: 4 }
	];
	const who = (name: string) => { const p = P.find((x) => x.name === name); return p ? { hero: heroName(p.hero), color: p.color, team: p.team } : null; };
	const life = { orange: Array(6).fill(false), blue: Array(6).fill(false) };
	const waves = Array(5).fill(false);
	waves[0] = true;
	const enemies = P.filter((p) => p.team !== me.team), allies = P.filter((p) => p.team === me.team && p.id !== me.id);
	const thrones = (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(LEARN_MAP, t), team: t })).filter((t): t is { hex: string; team: Team } => !!t.hex);
	const handCards = mine.hand.slice(0, 5);
	const dots = P.map((p) => ({ pid: p.id, team: p.team, color: p.color, ok: true, portrait: portraitCss(p.hero), hero: heroName(p.hero) }));
	const TEAM_VARS: Record<Team, string> = { orange: '--tc:#ef7d22; --tcr:239 125 34; --tcl:255 196 140;', blue: '--tc:#2f7fe6; --tcr:47 127 230; --tcl:165 205 255;' };
	const lvArc = (i: number, r = 22) => {
		const a0 = ((i * 45 + 5) * Math.PI) / 180, a1 = ((i * 45 + 40) * Math.PI) / 180;
		return `M ${(25 + r * Math.sin(a0)).toFixed(2)} ${(25 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(25 + r * Math.sin(a1)).toFixed(2)} ${(25 - r * Math.cos(a1)).toFixed(2)}`;
	};

	// ── fit the design canvas into the box ──
	let bw = 800, bh = 500;
	$: DW = mode === 'desktop' ? 1440 : 390;
	$: DH = mode === 'desktop' ? 900 : 800;
	$: z = Math.max(0.1, Math.min(bw / DW, bh / DH));
	$: fw = DW * z;
	$: fh = DH * z;
	$: inset = mode === 'desktop' ? { t: 128 * z, b: 170 * z, l: 384 * z, r: 384 * z } : { t: 128 * z, b: 104 * z, l: 4 * z, r: 4 * z };

	// ── the markers: measured from the parts themselves ──
	let frame: HTMLElement;
	let board: BoardCanvas;
	let marks: { n: number; x: number; y: number; w: number; h: number }[] = [];
	let pill: { x: number; y: number; r: number } | null = null;
	function measure() {
		if (!frame) return;
		const f = frame.getBoundingClientRect();
		marks = spots.map((s, n) => {
			const el = frame.querySelector(s.sel);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { n, x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height };
		}).filter((m): m is NonNullable<typeof m> => !!m);
		const at = pills ? board?.clientPos('h_wasp') : null;
		pill = at ? { x: (at.x - f.left) / z, y: (at.y - f.top) / z, r: at.r / z } : null;
	}
	// the pieces step: close in on your hero so its actions read at their real size
	let zoomed = false;
	function zoomIn() {
		if (!board) return;
		if (pills && !zoomed) {
			const at = board.clientPos('h_wasp');
			if (!at) return;
			board.zoomAround(2.3, at.x, at.y);
			zoomed = true;
		} else if (!pills && zoomed) { board.reset(); zoomed = false; }
	}
	let timer: ReturnType<typeof setTimeout>;
	function later() { clearTimeout(timer); timer = setTimeout(() => { zoomIn(); setTimeout(measure, 40); }, 60); }
	$: if (frame) { void spots; void pills; void close; void z; void mode; tick().then(later); setTimeout(later, 420); }
	onMount(() => {
		const ro = new ResizeObserver(later);
		ro.observe(frame);
		const t2 = setTimeout(later, 700); // card art and fonts arrive late
		return () => { ro.disconnect(); clearTimeout(timer); clearTimeout(t2); };
	});
</script>

<div class="tour" bind:clientWidth={bw} bind:clientHeight={bh}>
	<div class="frame {mode}" bind:this={frame} style="width:{fw}px; height:{fh}px; --z:{z}">
		<div class="lens" class:close style="--k:{mode === 'desktop' ? 1.5 : 1}">
		<div class="sea"></div>
		<BoardCanvas bind:this={board} map={LEARN_MAP} look="island" {pieces} {thrones} glowZone="Center" activeZone="Center" interactive={false} effects={false} {inset} />

		<div class="hud" style="zoom:{z}">
			{#if mode === 'desktop'}
				<button class="corner menu t-menu" aria-label="Game lobby" on:click={nop}><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
				<div class="bar t-bar">
					<HudTop W={1440} round={2} turn={2} lifeTok={life} waveTok={waves} tieBreaker="blue" left="orange" zone={1} zones={3}
						counts={{ orange: 5, blue: 6 }} starts={{ orange: 6, blue: 6 }} {lifeArt} {tieArt} />
				</div>
				<button class="corner ctl t-wheel" aria-label="Control centre" on:click={nop}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5l1.6 4 4 1.5-4 1.5-1.6 4-1.6-4-4-1.5 4-1.5z" /></svg></button>
				<div class="order t-order">
					<HudOrder planning={false} {dots} {order} tieArt={tieArt('blue')} me={me.id} {acting} />
				</div>
				<div class="col l t-enemies">
					{#each enemies as p (p.id)}<HudBoard cs={CS[p.id]} name={p.name} color={p.color} team={p.team} turnIdx={1} revealed ready />{/each}
				</div>
				<div class="col r">
					<div class="t-allies">{#each allies as p (p.id)}<HudBoard cs={CS[p.id]} name={p.name} color={p.color} team={p.team} turnIdx={1} revealed ready />{/each}</div>
					<div class="t-log"><Chronicle {log} {who} team={me.team} /></div>
				</div>
				<div class="tray t-hand">
					{#each handCards as idx, k (idx)}
						<span class="hc" style="--k:{k - (handCards.length - 1) / 2}"><Card heroId={me.hero} card={heroCards(me.hero)[idx]} /></span>
					{/each}
				</div>
				<div class="dash t-dash">
					<HudDash cs={mine} name={me.name} color={me.color} team={me.team} turnIdx={1} revealed ini={ini(me)} {markArt}
						deckCount={13} order={{ label: 'End turn', kind: 'go', run: nop }} hand={mine.hand} radius={radiusBtn} tokens={tokenBtn} />
				</div>
				{#if pill}
					<div class="pills" style="left:{pill.x}px; top:{pill.y}px; --r:{pill.r + 6}px">
						<div class="pside top"><button class="pp bad">Attack</button><button class="pp force">Forced discard</button></div>
						<div class="pside right"><button class="pp move">Move</button><button class="pp swap">Swap</button></div>
						<div class="pside bottom"><button class="pp rem">Remove</button><button class="pp bad">Defeated</button></div>
						<div class="pside left"><button class="pp">Clear 1</button></div>
					</div>
				{/if}
			{:else}
				<div class="ptop t-ptop">
					<PhoneTop round={2} turn={2} tieBreaker="blue" {tieArt} waves={4} life={{ orange: 6, blue: 6 }} left="orange" coins={mine.coins} zone={1} zones={3}
						counts={{ orange: 5, blue: 6 }} starts={{ orange: 6, blue: 6 }} me={me.id}
						status={{ planning: false, countdown: false, dots, order: order.map((o) => ({ pid: o.pid, portrait: o.portrait, color: o.color, team: o.team })), acting }} />
				</div>
				<div class="mstrip t-strip">
					{#each [...enemies, ...allies] as p (p.id)}
						{@const cs = CS[p.id]}
						<div class="mpc" style={TEAM_VARS[p.team]}>
							<span class="mpic"><svg class="lring" viewBox="0 0 50 50" aria-hidden="true">{#each Array(8) as _, i (i)}<path d={lvArc(i)} class:on={i < levelOf(cs)} class:ult={i === 7} />{/each}</svg><PlayerIcon hero={cs.hero} team={p.team} color={p.color} size="24px" ring={2} /></span>
							<span class="mpn"><b>{p.name}</b><small>{heroById(p.hero)?.name}</small></span>
							<span class="mcard"><TurnSlot heroId={cs.hero} played={cs.turns[1]} isCurrent revealed /></span>
							<span class="msb"><StatBubbles {cs} size={17} /></span>
						</div>
					{/each}
				</div>
				<div class="ptray t-phand">
					{#each handCards as idx, k (idx)}
						<span class="hc" style="--k:{k - (handCards.length - 1) / 2}"><Card heroId={me.hero} card={heroCards(me.hero)[idx]} /></span>
					{/each}
				</div>
				<div class="t-pdash">
					<PhoneDash cs={mine} color={me.color} team={me.team} turnIdx={1} revealed ini={ini(me)} deckCount={13}
						order={{ label: 'End turn', kind: 'go', run: nop }} radius={radiusBtn} tokens={tokenBtn} />
				</div>
			{/if}
		</div>

		</div>
		<!-- the markers (real px, over everything) -->
		{#each marks as m (m.n)}
			{#if m.n === active}<span class="ring" style="left:{m.x - 4}px; top:{m.y - 4}px; width:{m.w + 8}px; height:{m.h + 8}px"></span>{/if}
			<button class="mk" class:on={m.n === active} style="left:{Math.max(2, m.x - 9)}px; top:{Math.max(2, m.y - 9)}px" on:click={() => onSpot(m.n)} aria-label="Point {m.n + 1}">{m.n + 1}</button>
		{/each}
	</div>
</div>

{#snippet radiusBtn()}
	<button class="radbtn" aria-label="Area radius"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2.4" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></svg><b>–</b></button>
{/snippet}
{#snippet tokenBtn()}
	<button class="tokbtn" aria-label="Tokens and markers"><span class="tg">◈</span></button>
{/snippet}

<style>
	.tour { position: absolute; inset: 0; display: grid; place-items: center; }
	.frame { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6); background: #0b2f4f; }
	.frame.phone { border-radius: 26px; border: 3px solid #1d2a3a; }
	.lens { position: absolute; inset: 0; transform-origin: 50% 100%; transition: transform 0.35s ease; }
	.lens.close { transform: scale(var(--k)); }
	.sea { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, #1d5d86, #0b2f4f 70%); }
	.frame :global(.board-wrap) { position: absolute; inset: 0; }
	.hud { position: absolute; left: 0; top: 0; pointer-events: none; color: #f5f1e8; --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); }
	.desktop .hud { width: 1440px; height: 900px; }
	.phone .hud { width: 390px; height: 800px; }
	.hud :global(button) { pointer-events: none; }

	/* desktop: the game's own places (design px) */
	.corner { position: absolute; top: 26px; width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; padding: 0; color: var(--brass-hi);
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); box-sizing: border-box; }
	.corner svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.corner.menu { left: 20px; } .corner.ctl { right: 20px; }
	.bar { position: absolute; top: 24px; left: 50%; transform: translateX(-50%); }
	.order { position: absolute; top: 100px; left: 0; right: 0; }
	.col { position: absolute; top: 194px; width: 344px; display: flex; flex-direction: column; gap: 24px; }
	.col.l { left: 20px; } .col.r { right: 20px; }
	.t-allies { display: flex; flex-direction: column; gap: 24px; }
	.dash { position: absolute; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center; }
	.tray { position: absolute; left: 50%; bottom: 128px; width: 0; height: 0; }
	.hc { position: absolute; bottom: -128px; left: calc(var(--k) * 92px - 60px); width: 120px; transform: rotate(calc(var(--k) * 4deg)); transform-origin: 50% 120%; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5)); }
	.hc :global(.cardface) { width: 100%; display: block; border-radius: 6px; }
	.pills { position: absolute; width: 0; height: 0; }
	.pside { position: absolute; display: flex; gap: 6px; }
	.pside.left, .pside.right { flex-direction: column; top: 0; transform: translateY(-50%); }
	.pside.right { left: var(--r); align-items: flex-start; }
	.pside.left { right: var(--r); align-items: flex-end; }
	.pside.top, .pside.bottom { left: 0; flex-direction: row; transform: translateX(-50%); }
	.pside.top { bottom: max(var(--r), 44px); }
	.pside.bottom { top: max(var(--r), 44px); }
	.pp { display: inline-flex; align-items: center; height: 32px; padding: 0 13px; border-radius: 999px; font: inherit; font-size: 14px; line-height: 1; white-space: nowrap;
		color: #f5f1e8; background: rgba(8, 22, 38, 0.95); border: 1px solid var(--line); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55); }
	.pp.bad { color: #ffc9c2; border-color: rgba(229, 72, 77, 0.7); background: rgba(70, 16, 18, 0.95); }
	.pp.move { color: #c8fbf2; border-color: rgba(64, 214, 190, 0.75); background: rgba(10, 58, 56, 0.96); }
	.pp.force { color: #ffe2b8; border-color: rgba(240, 160, 70, 0.75); background: rgba(70, 36, 8, 0.96); }
	.pp.swap { color: #e3f0ff; border-color: rgba(140, 180, 255, 0.75); background: rgba(16, 36, 72, 0.96); }
	.pp.rem { color: #e6d6ff; border-color: rgba(166, 120, 236, 0.75); background: rgba(44, 24, 78, 0.96); }
	.radbtn svg { width: 16px; height: 16px; }
	.tg { font-size: 15px; color: var(--brass-hi); }

	/* phone (390 wide): the strip of the other players under the top bar, the hand tips over the dash */
	.mstrip { position: absolute; top: 54px; left: 0; right: 0; height: 70px; z-index: 12; display: flex; gap: 6px; padding: 5px 8px; overflow: hidden; box-sizing: border-box;
		background: linear-gradient(180deg, rgba(10, 30, 52, 0.96), rgba(6, 21, 38, 0.94)); border-bottom: 1px solid rgba(216, 179, 106, 0.35); }
	.mpc { flex: none; width: 170px; height: 60px; display: grid; grid-template-columns: 32px 1fr 40px; grid-template-rows: 32px 1fr; column-gap: 4px; row-gap: 2px; box-sizing: border-box;
		padding: 3px 5px 3px 7px; border-radius: 10px; background: linear-gradient(180deg, rgb(var(--tcr) / .14), rgba(6, 21, 38, .6)); border: 1px solid rgba(216, 179, 106, .3); box-shadow: inset 0 2px 0 var(--tc); }
	.mpic { position: relative; width: 32px; height: 32px; display: grid; place-items: center; }
	.lring { position: absolute; inset: 0; width: 100%; height: 100%; }
	.lring path { fill: none; stroke: rgba(255, 255, 255, .16); stroke-width: 4; stroke-linecap: round; }
	.lring path.on { stroke: #d8b36a; }
	.lring path.ult { stroke: rgba(138, 79, 209, .45); }
	.mpn { min-width: 0; align-self: center; display: flex; flex-direction: column; line-height: 1.08; }
	.mpn b { font-weight: normal; font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mpn small { font-size: 9.5px; color: rgb(var(--tcl)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mcard { grid-column: 3; grid-row: 1 / 3; align-self: center; width: 40px; }
	.msb { grid-column: 1 / 3; grid-row: 2; align-self: end; }
	.ptray { position: absolute; left: 50%; bottom: 100px; width: 0; height: 0; }
	.ptray .hc { width: 74px; bottom: -64px; left: calc(var(--k) * 56px - 37px); }

	/* markers */
	.mk { position: absolute; z-index: 30; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; padding: 0; font: inherit; font-size: 13px; line-height: 1; cursor: pointer;
		color: #1b1204; background: linear-gradient(180deg, #f4dfa8, #d8b36a); border: 1px solid #6b4a14; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6); }
	.mk.on { background: #fff3c4; transform: scale(1.2); box-shadow: 0 0 0 3px rgba(255, 215, 94, 0.5), 0 2px 8px rgba(0, 0, 0, 0.6); }
	.ring { position: absolute; z-index: 29; border-radius: 12px; border: 2px solid #ffd75e; box-shadow: 0 0 0 9999px rgba(3, 10, 20, 0.45), 0 0 18px rgba(255, 215, 94, 0.55); pointer-events: none; }
</style>
