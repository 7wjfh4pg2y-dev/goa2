<script lang="ts" context="module">
	import type { Team } from '$lib/match';
	export type PlayerStat = {
		id: string; name: string; color: string; hero: string; team: Team;
		level: number; kills: number; deaths: number; assists: number; minions: number; coins: number;
	};
	export type GameStatsData = {
		rounds: number;
		minutes: number;
		players: PlayerStat[];
		/** the battle zone after every turn: -1 Atlantean Throne · 0 Atlantean Beach · 1 Center · 2 Titan Beach · 3 Titan Throne */
		tide: number[];
		/** hero defeats: the turn index (into tide) and the fallen hero's team */
		falls: { turn: number; team: Team; who: string }[];
	};
</script>

<script lang="ts">
	// The battle report after a game (MOCKUP — fed sample data on /splash-demo for now; later it is
	// computed from the recorder journal: defeats / assists / minions from the log, coins + levels
	// from the per-turn snapshots, the tide from each snapshot's lane). Viewer-relative: your team's
	// table first, and on the tide chart "up" is always towards the enemy throne.
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { HEROES } from '$lib/heroes';
	import { teamName, teamAdj } from '$lib/teams';

	export let data: GameStatsData;
	export let myTeam: Team | null = null;
	export let winner: Team;
	export let mobile = false;

	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	$: mine = (myTeam ?? 'blue') as Team;
	$: enemy = (mine === 'orange' ? 'blue' : 'orange') as Team;
	$: order = [mine, enemy] as Team[];
	const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id;
	const fmtTime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

	type Col = { k: keyof PlayerStat; label: string; short: string };
	const COLS: Col[] = [
		{ k: 'level', label: 'Level', short: 'Lv' },
		{ k: 'kills', label: 'Hero kills', short: 'Kills' },
		{ k: 'deaths', label: 'Deaths', short: 'Deaths' },
		{ k: 'assists', label: 'Assists', short: 'Ast' },
		{ k: 'minions', label: 'Minion kills', short: 'Mins' },
		{ k: 'coins', label: 'Coins Earned', short: 'Coins' }
	];
	$: rows = (t: Team) => data.players.filter((p) => p.team === t);
	$: total = (t: Team, k: keyof PlayerStat) => rows(t).reduce((n, p) => n + (p[k] as number), 0);
	// the game's best in a column (gold) — not for deaths, nobody is proud of that
	$: best = (k: keyof PlayerStat) => (k === 'deaths' ? Infinity : Math.max(...data.players.map((p) => p[k] as number)));
	$: totalKills = data.players.reduce((n, p) => n + p.kills, 0);
	$: totalMinions = data.players.reduce((n, p) => n + p.minions, 0);

	// ── the tide of battle: the battle zone after every turn ──
	const W = 560, H = 300, PL = 112, PR = 12, PT = 10, PB = 44;
	const iw = W - PL - PR, ih = H - PT - PB;
	// level 0 = your own throne (bottom) … 4 = the enemy throne (top)
	$: lvl = (z: number) => (mine === 'orange' ? z + 1 : 3 - z);
	$: n = data.tide.length;
	$: x = (i: number) => PL + (n <= 1 ? 0 : (i / (n - 1)) * iw);
	const y = (l: number) => PT + ih - (l / 4) * ih;
	$: pts = data.tide.map((z, i) => [x(i), y(lvl(z))] as const);
	// stepped: the zone holds until the push
	$: line = pts.map(([px, py], i) => (i === 0 ? `M${px},${py}` : `H${px}V${py}`)).join('');
	$: area = `${line}H${x(n - 1)}V${y(2)}H${x(0)}Z`;
	$: zoneLabels = [
		{ l: 4, t: `${teamAdj(enemy)} Throne` }, { l: 3, t: `${teamAdj(enemy)} Beach` }, { l: 2, t: 'Center' },
		{ l: 1, t: `${teamAdj(mine)} Beach` }, { l: 0, t: `${teamAdj(mine)} Throne` }
	];
	const zoneName = (z: number) => ['Atlantean Throne', 'Atlantean Beach', 'Center', 'Titan Beach', 'Titan Throne'][z + 1];
	let hover: number | null = null;
	function move(e: PointerEvent) {
		const svg = e.currentTarget as SVGSVGElement;
		const r = svg.getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * W;
		const i = Math.round(((px - PL) / iw) * (n - 1));
		hover = i >= 0 && i < n ? i : null;
	}
	$: hoverFalls = hover == null ? [] : data.falls.filter((f) => f.turn === hover);
</script>

<div class="gs" class:mob={mobile}>
	<div class="body">
		<div class="tiles">
			<div class="tile"><b>{data.rounds}</b><span>Rounds</span></div>
			<div class="tile"><b>{fmtTime(data.minutes)}</b><span>Time played</span></div>
			<div class="tile"><b>{totalKills}</b><span>Hero kills</span></div>
			<div class="tile"><b>{totalMinions}</b><span>Minion kills</span></div>
		</div>

		<div class="tables">
			{#each order as t (t)}
				<section class="team" style="--tc:{C[t]}">
					<header>
						<span class="tn">{teamName(t)}</span>
						{#if t === winner}<span class="won">Victors</span>{/if}
					</header>
					<table>
						<thead>
							<tr>
								<th class="who">Hero</th>
								{#each COLS as c (c.k)}<th title={c.label}>{mobile ? c.short : c.label}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each rows(t) as p (p.id)}
								<tr>
									<td class="who">
										<div class="pc">
											<PlayerIcon hero={p.hero} team={p.team} color={p.color} size={mobile ? '1.9rem' : '2.1rem'} ring={2} ult={p.level >= 8} />
											<span class="nm"><b>{p.name}</b><em>{heroName(p.hero)}</em></span>
										</div>
									</td>
									{#each COLS as c (c.k)}<td class:best={p[c.k] === best(c.k)}>{p[c.k]}</td>{/each}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td class="who">Team</td>
								<td></td>
								{#each COLS.slice(1) as c (c.k)}<td>{total(t, c.k)}</td>{/each}
							</tr>
						</tfoot>
					</table>
				</section>
			{/each}
		</div>

		<section class="tide">
			<header><span class="tn">Tide of battle</span><span class="hint">Where the battle zone stood after every turn</span></header>
			<div class="legend">
				<span><i class="sw" style="background:{C[mine]}"></i>{teamName(mine)} pushing</span>
				<span><i class="sw" style="background:{C[enemy]}"></i>{teamName(enemy)} pushing</span>
				<span><i class="dot"></i>A hero fell (in their team's colour)</span>
			</div>
			<div class="chart">
				<svg viewBox="0 0 {W} {H}" role="img" aria-label="Battle zone after every turn" on:pointermove={move} on:pointerleave={() => (hover = null)}>
					<defs>
						<clipPath id="gs-up"><rect x="0" y="0" width={W} height={y(2)} /></clipPath>
						<clipPath id="gs-down"><rect x="0" y={y(2)} width={W} height={H} /></clipPath>
					</defs>
					{#each zoneLabels as z (z.l)}
						<line class="grid" class:mid={z.l === 2} x1={PL} x2={W - PR} y1={y(z.l)} y2={y(z.l)} />
						<text class="ylab" x={PL - 8} y={y(z.l) + 4} text-anchor="end">{z.t}</text>
					{/each}
					{#each Array.from({ length: data.rounds }, (_, r) => r) as r (r)}
						{#if r > 0}<line class="rgrid" x1={x(r * 4 - 0.5)} x2={x(r * 4 - 0.5)} y1={PT} y2={PT + ih} />{/if}
						<text class="xlab" x={x(Math.min(n - 1, r * 4 + 1.5))} y={H - 26} text-anchor="middle">R{r + 1}</text>
					{/each}
					<path d={area} fill={C[mine]} opacity=".32" clip-path="url(#gs-up)" />
					<path d={area} fill={C[enemy]} opacity=".32" clip-path="url(#gs-down)" />
					<path d={line} class="ln" />
					<!-- hero defeats on a track under the plot -->
					{#each data.falls as f, i (i)}
						<circle class="fall" cx={x(f.turn)} cy={H - 8} r="4.5" fill={C[f.team]} />
					{/each}
					{#if hover != null}
						<line class="cross" x1={x(hover)} x2={x(hover)} y1={PT} y2={H - 2} />
						<circle class="hpt" cx={x(hover)} cy={y(lvl(data.tide[hover]))} r="5" />
					{/if}
				</svg>
				{#if hover != null}
					<div class="tip" style="left:{(x(hover) / W) * 100}%">
						<b>Round {Math.floor(hover / 4) + 1} · Turn {(hover % 4) + 1}</b>
						<span>Battle zone: {zoneName(data.tide[hover])}</span>
						{#each hoverFalls as f, i (i)}<span>{f.who} fell</span>{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>

<style>
	.gs { color: #e9eef6; }
	.tiles { grid-area: tiles; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
	.tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px; border-radius: 12px;
		background: rgba(12, 18, 32, .55); border: 1px solid rgba(255, 255, 255, .1); }
	.tile b { font-size: 1.7rem; font-weight: normal; color: #fbe7b0; line-height: 1.1; }
	.tile span { font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: #93a3b8; }

	.body { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); grid-template-areas: 'tab tiles' 'tab tide'; grid-template-rows: auto 1fr;
		gap: 12px 14px; align-items: stretch; }
	.tables { grid-area: tab; display: flex; flex-direction: column; gap: 12px; }
	.tables section { flex: 1; }
	/* the tide panel stretches so its bottom lines up with the last team table */
	.tide { grid-area: tide; display: flex; flex-direction: column; }
	.tide .chart { flex: 1; display: flex; flex-direction: column; justify-content: center; }
	section { border-radius: 14px; background: rgba(12, 18, 32, .55); border: 1px solid rgba(255, 255, 255, .1); padding: 10px 12px 8px; }
	.team { border-top: 3px solid var(--tc); }
	header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
	.tn { font-size: 1.15rem; letter-spacing: .06em; }
	.team .tn { color: color-mix(in srgb, var(--tc) 55%, #fff); }
	.won { font-size: .68rem; letter-spacing: .18em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; color: #2a1c05;
		background: linear-gradient(180deg, #ffe7a6, #d9a845); }
	.hint { font-size: .74rem; color: #93a3b8; }

	table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	th { font-weight: normal; font-size: .64rem; line-height: 1.2; letter-spacing: .06em; text-transform: uppercase; color: #93a3b8; padding: 2px 4px 4px; text-align: center; vertical-align: bottom; }
	td { padding: 3px 4px; text-align: center; font-size: 1.05rem; color: #dbe3ee; border-top: 1px solid rgba(255, 255, 255, .06); }
	.who { text-align: left; }
	.pc { display: flex; align-items: center; gap: 9px; }
	.nm { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
	.nm b { font-weight: normal; font-size: 1rem; color: #fff; }
	.nm em { font-style: normal; font-size: .72rem; color: #93a3b8; }
	td.best { color: #ffd77a; text-shadow: 0 0 10px rgba(255, 200, 100, .45); }
	tfoot td { color: #93a3b8; font-size: .9rem; border-top: 1px solid rgba(255, 255, 255, .14); }
	tfoot td.who { font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; padding-left: 8px; }

	.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .74rem; color: #b7c3d3; margin: 2px 0 6px; }
	.legend span { display: inline-flex; align-items: center; gap: 6px; }
	.sw { width: 12px; height: 12px; border-radius: 3px; opacity: .8; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: #c9d2de; }
	.chart { position: relative; }
	svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
	.grid { stroke: rgba(255, 255, 255, .08); stroke-width: 1; }
	.grid.mid { stroke: rgba(255, 255, 255, .28); stroke-dasharray: 3 4; }
	.rgrid { stroke: rgba(255, 255, 255, .06); stroke-width: 1; }
	.ylab, .xlab { fill: #93a3b8; font-size: 11px; }
	.ln { fill: none; stroke: #f3e6c8; stroke-width: 2; stroke-linejoin: round; }
	.fall { stroke: #0c1220; stroke-width: 2; }
	.cross { stroke: rgba(255, 255, 255, .35); stroke-width: 1; }
	.hpt { fill: #f3e6c8; stroke: #0c1220; stroke-width: 2; }
	.tip { position: absolute; top: 0; transform: translateX(-50%); pointer-events: none; display: flex; flex-direction: column; gap: 1px; white-space: nowrap;
		padding: 6px 9px; border-radius: 8px; font-size: .74rem; color: #c9d2de; background: rgba(6, 9, 16, .94); border: 1px solid rgba(255, 255, 255, .16); }
	.tip b { font-weight: normal; color: #fff; }

	/* phones: one column, compact table headers */
	.mob .body { grid-template-columns: 1fr; grid-template-areas: 'tiles' 'tab' 'tide'; grid-template-rows: none; }
	.mob td { font-size: .95rem; padding: 4px 3px; }
	.mob th { padding: 4px 3px; white-space: nowrap; }
	.mob .nm em { display: none; }
	.mob .tide header { flex-wrap: wrap; row-gap: 0; }
	.mob .tide .tn { white-space: nowrap; }
</style>
