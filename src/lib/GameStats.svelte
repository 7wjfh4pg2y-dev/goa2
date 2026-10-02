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
		/** hero defeats: the turn index (into tide) and the fallen hero's team. `id` (OPTIONAL) = the fallen
		 *  player's id; without it the player is found from `who` ("Name (Hero)"), else the mark is a plain dot. */
		falls: { turn: number; team: Team; who: string; id?: string }[];
	};
</script>

<script lang="ts">
	// THE SHIP'S LEDGER — the battle report after a game: one calm page.
	//  · the result as a headline, with how it was won and how long it took
	//  · the two teams as two short tables (wide: enemy left, yours right, like every splash;
	//    stacked: yours first)
	//  · ONE picture: the tide — the battle zone after every turn, between the two thrones
	//    ("up" is always the ENEMY throne), each hero defeat a face on the line at its turn
	//    (enemy heroes above the line, yours below).
	// Spectators watch as Titans. Static once drawn: one fade-in, nothing else moves.
	// It fills its parent (VictorySplash) and scales itself: the wide page is designed 1240 px
	// across in a 1440×900 window; windows under 1000 px get the stacked page.
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { HEROES } from '$lib/heroes';
	import { teamName, teamAdj } from '$lib/teams';

	export let data: GameStatsData;
	export let myTeam: Team | null = null;
	export let winner: Team;
	export let mobile = false;
	/** how it was won ("pushed into the Titan Throne") — the line under the headline */
	export let reason = '';
	/** the way back to the board; without it there is no button */
	export let onClose: (() => void) | null = null;

	let w = 1440, h = 900;
	$: stack = mobile || w < 1000;
	const WIDE = 1240;
	$: colW = Math.min(640, Math.max(300, w - 32)); // the stacked page's design width
	$: scale = stack ? (w - 32) / colW : Math.max(0.5, Math.min(w / 1440, h / 900, 2.2));

	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	const HI: Record<Team, string> = { orange: '#ffb878', blue: '#9ccbff' };
	$: mine = (myTeam ?? 'blue') as Team;
	$: enemy = (mine === 'orange' ? 'blue' : 'orange') as Team;
	$: order = (stack ? [mine, enemy] : [enemy, mine]) as Team[];
	$: lost = myTeam != null && myTeam !== winner;
	$: title = myTeam == null ? `${teamName(winner)} win` : lost ? 'Defeat' : 'Victory';
	$: why = !reason ? '' : /^(atlanteans|titans|orange|blue)\b/i.test(reason) ? reason : `${teamName(winner)} ${reason}`;
	const heroName = (id: string) => HEROES.find((x) => x.id === id)?.name ?? id;
	const fmtTime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

	type Key = 'level' | 'kills' | 'deaths' | 'assists' | 'minions' | 'coins';
	const COLS: { k: Key; label: string; short: string }[] = [
		{ k: 'level', label: 'Level', short: 'Lv' },
		{ k: 'kills', label: 'Kills', short: 'Kills' },
		{ k: 'deaths', label: 'Deaths', short: 'Dth' },
		{ k: 'assists', label: 'Assists', short: 'Ast' },
		{ k: 'minions', label: 'Minions', short: 'Min' },
		{ k: 'coins', label: 'Coins', short: 'Coins' }
	];
	$: rows = (t: Team) => data.players.filter((p) => p.team === t);
	// the game's best in a column reads in brass (not deaths: nobody is proud of those)
	$: best = (k: Key) => (k === 'deaths' ? -1 : Math.max(1, ...data.players.map((p) => p[k])));

	// ── the tide: one column per turn, three lanes (the beaches and the centre) between the throne edges ──
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const PT = 20, PB = 28;
	$: W = stack ? colW : WIDE;
	$: G = stack ? 70 : 176; // the margin: the two throne labels and "Round"
	$: L = stack ? 52 : 62; // lane height
	$: H = PT + 3 * L + PB;
	$: tide = data.tide.length ? data.tide : [1];
	$: n = tide.length;
	$: cw = (W - G) / n;
	$: X = (i: number) => G + i * cw;
	// 0 = your own throne (bottom edge) · 1 your beach · 2 centre · 3 their beach · 4 = the enemy throne (top edge)
	$: lvls = tide.map((z) => clamp(mine === 'orange' ? z + 1 : 3 - z, 0, 4));
	$: Y = (l: number) => PT + (l >= 4 ? 0 : l <= 0 ? 3 : 3.5 - l) * L;
	// stepped: the zone holds for the whole turn
	$: steps = (f: (l: number) => number) => lvls.map((l, i) => `${i ? 'V' : `M${G},`}${Y(f(l))}H${X(i + 1).toFixed(1)}`).join('');
	$: line = steps((l) => l);
	$: gain = `${steps((l) => Math.max(l, 2))}V${Y(2)}H${G}Z`; // above the centre: you are pushing
	$: loss = `${steps((l) => Math.min(l, 2))}V${Y(2)}H${G}Z`; // below it: they are
	$: roundCount = Math.ceil(n / 4);
	$: rounds = Array.from({ length: roundCount }, (_, r) => ({ r, x0: X(r * 4), mid: X((r * 4 + Math.min(n, r * 4 + 4)) / 2) }));

	// hero defeats: a face on the line at its turn — enemy heroes above the line, yours below
	type Fall = GameStatsData['falls'][number];
	$: fz = stack ? clamp(cw * 1.1, 13, 20) : clamp(cw * 0.8, 18, 24); // the face (its rings add 1.5 px)
	const playerOf = (f: Fall, ps: PlayerStat[]) =>
		(f.id ? ps.find((p) => p.id === f.id) : undefined) ??
		ps.find((p) => p.team === f.team && f.who.endsWith(`(${heroName(p.hero)})`)) ??
		ps.find((p) => p.team === f.team && (f.who === p.name || f.who.startsWith(`${p.name} (`))) ?? null;
	$: marks = (() => {
		const byTurn = new Map<number, Fall[]>();
		for (const f of data.falls) {
			const t = clamp(Math.round(f.turn), 0, n - 1);
			byTurn.set(t, [...(byTurn.get(t) ?? []), f]);
		}
		const out: { x: number; y: number; p: PlayerStat | null; team: Team; tip: string }[] = [];
		const off = fz / 2 + 4;
		for (const [turn, fs] of byTurn) {
			const y0 = Y(lvls[turn]);
			let above = fs.filter((f) => f.team === enemy), below = fs.filter((f) => f.team !== enemy);
			// the line is on a throne: no room beyond it, so both rows share the near side
			if (y0 - off - fz / 2 < PT) { below = [...above, ...below]; above = []; }
			else if (y0 + off + fz / 2 > PT + 3 * L) { above = [...above, ...below]; below = []; }
			for (const [row, y] of [[above, y0 - off], [below, y0 + off]] as [Fall[], number][]) {
				const gap = Math.min(fz + 5, (cw * 1.6) / row.length);
				row.forEach((f, j) => out.push({
					x: clamp(X(turn + 0.5) + (j - (row.length - 1) / 2) * gap, G + fz / 2 + 2, W - fz / 2 - 2), y,
					p: playerOf(f, data.players), team: f.team, tip: `${f.who} · Round ${Math.floor(turn / 4) + 1}, turn ${(turn % 4) + 1}`
				}));
			}
		}
		return out;
	})();
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />

<div class="tide gs" class:stack class:lost style="--mc:{C[mine]}; --mh:{HI[mine]}; --ec:{C[enemy]}; --eh:{HI[enemy]}">
	<div class="page" style="width:{stack ? colW : WIDE}px; zoom:{scale.toFixed(3)}">
		<header class="head">
			<h1 class="ttl">{title}</h1>
			<p class="sub">
				{#if why}<span>{why}</span>{/if}
				<span class="facts">{data.rounds} {data.rounds === 1 ? 'round' : 'rounds'} · {fmtTime(data.minutes)}</span>
			</p>
		</header>

		<div class="sides">
			{#each order as t (t)}
				<table style="--tc:{C[t]}; --th:{HI[t]}">
					<thead>
						<tr>
							<th class="tn">{teamName(t)}</th>
							{#each COLS as c (c.k)}<th>{stack ? c.short : c.label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows(t) as p (p.id)}
							<tr>
								<td class="who">
									<div class="pc">
										<PlayerIcon hero={p.hero} team={p.team} color={p.color} size={stack ? '30px' : '36px'} ring={2} />
										<span class="nm"><b>{p.name}</b><em>{heroName(p.hero)}</em></span>
									</div>
								</td>
								{#each COLS as c (c.k)}<td class:best={p[c.k] === best(c.k)} class:zero={p[c.k] === 0}>{p[c.k]}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{/each}
		</div>

		<div class="chart">
			<svg viewBox="0 0 {W} {H}" role="img" aria-label="The battle zone after every turn">
				<defs>
					<linearGradient id="gs-gain" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={Y(2)} y2={Y(4)}>
						<stop offset="0" stop-color={C[mine]} stop-opacity=".16" /><stop offset="1" stop-color={C[mine]} stop-opacity=".7" />
					</linearGradient>
					<linearGradient id="gs-loss" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={Y(2)} y2={Y(0)}>
						<stop offset="0" stop-color={C[enemy]} stop-opacity=".16" /><stop offset="1" stop-color={C[enemy]} stop-opacity=".7" />
					</linearGradient>
				</defs>
				{#each rounds as r (r.r)}
					{#if r.r > 0}<line class="rsep" x1={r.x0} x2={r.x0} y1={PT} y2={PT + 3 * L} />{/if}
					<text class="rnd" x={r.mid} y={H - 6} text-anchor="middle">{r.r + 1}</text>
				{/each}
				<text class="rnd" x="0" y={H - 6}>Round</text>
				<line class="rsep" x1={G} x2={G} y1={PT} y2={PT + 3 * L} />
				<path d={gain} fill="url(#gs-gain)" />
				<path d={loss} fill="url(#gs-loss)" />
				<line class="edge e" x1="0" x2={W} y1={Y(4)} y2={Y(4)} />
				<line class="edge m" x1="0" x2={W} y1={Y(0)} y2={Y(0)} />
				{#if stack}
					<text class="thr e" x="0" y={PT + 15}>{teamAdj(enemy)}<tspan x="0" dy="12">Throne</tspan></text>
					<text class="thr m" x="0" y={PT + 3 * L - 19}>{teamAdj(mine)}<tspan x="0" dy="12">Throne</tspan></text>
				{:else}
					<text class="thr e" x="0" y={PT + 20}>{teamAdj(enemy)} Throne</text>
					<text class="thr m" x="0" y={PT + 3 * L - 10}>{teamAdj(mine)} Throne</text>
				{/if}
				<path class="ln" d={line} />
			</svg>
			{#each marks as m, i (i)}
				<span class="mark" title={m.tip} style="left:{((m.x / W) * 100).toFixed(2)}%; top:{((m.y / H) * 100).toFixed(2)}%">
					{#if m.p}
						<PlayerIcon hero={m.p.hero} team={m.team} color={m.p.color} size="{fz.toFixed(1)}px" ring={1.5} />
					{:else}
						<i class="dot" style="background:{C[m.team]}"></i>
					{/if}
				</span>
			{/each}
		</div>

		{#if onClose && !stack}<button class="btn btn-primary back" on:click={onClose}>View the board</button>{/if}
	</div>
	{#if onClose && stack}<div class="bar"><button class="btn btn-primary btn-block" on:click={onClose}>View the board</button></div>{/if}
</div>

<style>
	/* a page of its own over the title card: deep water, no panels — type and hairlines only */
	.gs { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; overflow: auto; scrollbar-width: thin;
		background: radial-gradient(120% 90% at 50% 0%, #0e2f4d, #06182a 58%, #030b15); animation: in .4s ease .15s both; }
	@keyframes in { from { opacity: 0; } to { opacity: 1; } }
	.page { margin: auto; flex: none; display: flex; flex-direction: column; gap: 30px; padding: 24px 0; }

	.head { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
	.ttl { margin: 0; font-weight: normal; font-size: 68px; line-height: 1; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #b98e42 92%); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.lost .ttl { background-image: linear-gradient(180deg, #f1f2f4 8%, #a9b4c0 50%, #5d6875 92%); }
	.sub { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 22px; text-wrap: balance; font-size: var(--fs-body); letter-spacing: .06em; color: var(--ink); }
	.facts { color: var(--ink-3); }

	/* the two teams */
	.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 56px; align-items: start; }
	table { width: 100%; border-collapse: collapse; table-layout: fixed; }
	th { font-weight: normal; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); text-align: center;
		width: 70px; padding: 0 0 8px; vertical-align: bottom; border-bottom: 2px solid var(--tc); }
	th.tn { width: auto; text-align: left; font-size: var(--fs-h3); letter-spacing: .14em; line-height: 1; color: var(--th); }
	td { padding: 7px 0; text-align: center; font-size: 22px; line-height: 1; color: var(--ink); border-bottom: 1px solid var(--hair); }
	td.zero { color: var(--ink-3); }
	td.best { color: var(--brass-hi); }
	.pc { display: flex; align-items: center; gap: 12px; text-align: left; }
	.nm { display: flex; flex-direction: column; gap: 3px; min-width: 0; line-height: 1; }
	.nm b { font-weight: normal; font-size: var(--fs-body); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.nm em { font-style: normal; font-size: 15px; color: var(--ink-3); white-space: nowrap; }

	/* the tide */
	.chart { position: relative; }
	svg { display: block; width: 100%; height: auto; overflow: visible; }
	.rsep { stroke: rgba(255, 255, 255, .08); }
	.edge { stroke-width: 2; }
	.edge.e { stroke: var(--ec); }
	.edge.m { stroke: var(--mc); }
	.ln { fill: none; stroke: var(--brass-hi); stroke-width: 2.5; stroke-linejoin: round; }
	.thr { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; }
	.thr.e { fill: var(--eh); }
	.thr.m { fill: var(--mh); }
	.rnd { font-size: 14px; letter-spacing: .08em; fill: var(--ink-3); }
	.mark { position: absolute; translate: -50% -50%; line-height: 0; }
	.mark :global(.face) { filter: grayscale(1); } /* fallen: the face greyed, the rings still say who */
	.dot { display: block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #06182a; }

	.back { align-self: center; }

	/* stacked (phones, narrow windows): your team first, the way back pinned under the page */
	.stack .page { margin: 0 auto; gap: 24px; padding: 22px 0 18px; }
	.stack .ttl { font-size: 46px; }
	.stack .sub { flex-direction: column; align-items: center; }
	.stack .sides { grid-template-columns: 1fr; }
	.stack th { width: 38px; font-size: 11px; letter-spacing: .04em; }
	.stack th.tn { width: auto; }
	.stack td { font-size: 19px; padding: 6px 0; }
	.stack .pc { gap: 9px; }
	.stack .nm em { font-size: 13px; }
	.stack .thr { font-size: 10px; letter-spacing: .08em; }
	.stack .rnd { font-size: 12px; }
	.bar { position: sticky; bottom: 0; flex: none; margin-top: auto; padding: 10px 16px 14px; background: linear-gradient(180deg, rgba(3, 11, 21, 0), #030b15 38%); }
</style>
