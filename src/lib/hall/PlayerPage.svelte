<script lang="ts">
	// One player, stats-site style: the banner (their main hero's art), rating and win rate over time, matchups
	// with / against people, their roles, heroes, combat numbers against the table, feats, friends & foes, and
	// every game (tap a row for the full record). Download CSV = the whole log as a spreadsheet.
	import type { League, PlayerAgg, MatchLine, Path, TableMate } from '$lib/league';
	import { WIN_LABEL, WIN_TYPES, START_RATING, nemesisOf, victimOf, rivalOf, bestMateOf, worstMateOf, momentsOf } from '$lib/league';
	import { heroById, heroSplash, splashFace, portraitCss, traitIcon, TRAIT_LABELS } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { teamName } from '$lib/teams';
	import { colorHex } from '$lib/match';
	import { playerRoles, winTrend, peopleMatchups, sideRecord } from '$lib/hallstats';
	import Line from './Line.svelte';

	export let p: PlayerAgg;
	export let league: League;
	export let rank = 0;
	export let titles: { title: string; blurb: string }[] = [];
	export let onPlayer: (key: string) => void = () => {};
	export let onHero: (id: string) => void = () => {};
	export let onBack: () => void = () => {};

	const heroName = (id: string) => heroById(id)?.name ?? id;
	const pct = (w: number, g: number) => (g ? (100 * w) / g : 0);
	const f1 = (n: number) => n.toFixed(1);
	const avg = (n: number, g: number) => (g ? (n / g).toFixed(1) : '–');
	const wl = (x: { games: number; wins: number }) => `${x.wins}–${x.games - x.wins}`;
	const day = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
	const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
	const streak = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–');

	$: main = Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)[0]?.[0] ?? '';
	$: [fx, fy] = main ? splashFace(main) : [0.5, 0.4];
	$: wr = pct(p.wins, p.games);
	$: wt = winTrend(p.history);
	let mside: 'with' | 'against' = 'with';
	$: mu = peopleMatchups(p, mside);
	$: roles = playerRoles(p).slice(0, 5);
	$: heroes = (() => {
		const m = new Map<string, { hero: string; games: number; wins: number; k: number; d: number; mn: number; ev: number; coins: number; cg: number }>();
		for (const x of p.history) {
			const r = m.get(x.hero) ?? { hero: x.hero, games: 0, wins: 0, k: 0, d: 0, mn: 0, ev: 0, coins: 0, cg: 0 };
			r.games++; if (x.won) r.wins++;
			if (x.k != null && x.d != null) { r.ev++; r.k += x.k; r.d += x.d; r.mn += x.minions ?? 0; }
			if (x.coins != null) { r.coins += x.coins; r.cg++; }
			m.set(x.hero, r);
		}
		return [...m.values()];
	})();
	// the heroes table: sortable both ways (a click on the sorted column reverses it)
	let hs: 'games' | 'win' | 'kdm' | 'gold' | 'name' = 'games', hflip = false;
	const sortHs = (k: typeof hs) => { if (hs === k) hflip = !hflip; else { hs = k; hflip = false; } };
	const per = (n: number, g: number) => (g ? n / g : -1);
	$: heroesSorted = [...heroes].sort((a, b) => hs === 'win' ? pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games
		: hs === 'kdm' ? per(b.k, b.ev) - per(a.k, a.ev) || per(b.mn, b.ev) - per(a.mn, a.ev)
		: hs === 'gold' ? per(b.coins, b.cg) - per(a.coins, a.cg)
		: hs === 'name' ? heroName(a.hero).localeCompare(heroName(b.hero))
		: b.games - a.games || b.wins - a.wins);
	$: heroRows = hflip ? [...heroesSorted].reverse() : heroesSorted;
	// career totals and the side record
	$: sides = sideRecord(p.history);
	let allTitles = false;
	// the table's averages per game ("vs the table")
	$: table = (() => {
		const ps = league.players;
		const sum = (f: (q: PlayerAgg) => number) => ps.reduce((s, q) => s + f(q), 0);
		const kg = sum((q) => q.kdaGames), cg = sum((q) => q.coinGames), lg = sum((q) => q.levelGames);
		return { k: kg ? sum((q) => q.kills) / kg : 0, d: kg ? sum((q) => q.deaths) / kg : 0, a: kg ? sum((q) => q.assists) / kg : 0, m: kg ? sum((q) => q.minions) / kg : 0, c: cg ? sum((q) => q.coins) / cg : 0, lv: lg ? sum((q) => q.levels) / lg : 0 };
	})();
	const cmp = (mine: number, theirs: number, low = false) => (Math.abs(mine - theirs) < 0.05 ? '' : mine > theirs !== low ? 'up' : 'down');
	$: combat = [
		{ k: 'Kills', v: avg(p.kills, p.kdaGames), c: cmp(p.kills / Math.max(1, p.kdaGames), table.k), t: f1(table.k) },
		{ k: 'Deaths', v: avg(p.deaths, p.kdaGames), c: cmp(p.deaths / Math.max(1, p.kdaGames), table.d, true), t: f1(table.d) },
		{ k: 'Assists', v: avg(p.assists, p.kdaGames), c: cmp(p.assists / Math.max(1, p.kdaGames), table.a), t: f1(table.a) },
		{ k: 'Minions', v: avg(p.minions, p.kdaGames), c: cmp(p.minions / Math.max(1, p.kdaGames), table.m), t: f1(table.m) },
		{ k: 'Gold', v: avg(p.coins, p.coinGames), c: cmp(p.coins / Math.max(1, p.coinGames), table.c), t: f1(table.c) },
		{ k: 'Level', v: avg(p.levels, p.levelGames), c: cmp(p.levels / Math.max(1, p.levelGames), table.lv), t: f1(table.lv) }
	];
	$: kd = p.kdaGames ? (p.deaths ? (p.kills / p.deaths).toFixed(2) : `${p.kills}.00`) : '–';
	$: kp = p.teamKills ? `${Math.round(pct(p.kills + p.assists, p.teamKills))}%` : '–';
	$: rels = [
		bestMateOf(p) && { k: 'Best teammate', x: bestMateOf(p)!, line: `${wl(bestMateOf(p)!)} together`, good: true },
		nemesisOf(p) && { k: 'Nemesis', x: nemesisOf(p)!, line: `killed you ${nemesisOf(p)!.killedBy}×`, good: false },
		victimOf(p) && { k: 'Favourite victim', x: victimOf(p)!, line: `you killed them ${victimOf(p)!.killed}×`, good: true },
		rivalOf(p) && { k: 'Rival', x: rivalOf(p)!, line: `met ${rivalOf(p)!.games}× · ${wl(rivalOf(p)!)}`, good: null },
		worstMateOf(p) && { k: 'Jinx', x: worstMateOf(p)!, line: `${wl(worstMateOf(p)!)} together`, good: false }
	].filter(Boolean) as { k: string; x: { key: string; name: string }; line: string; good: boolean | null }[];
	$: feats = [
		{ k: 'First bloods', v: p.xGames ? p.ex.firstBlood : null }, { k: 'Rampages', v: p.xGames ? p.ex.wipe : null }, { k: 'Aces', v: p.clashGames ? p.ex.aces : null },
		{ k: 'Shutdowns', v: p.xGames ? p.ex.shutdowns : null }, { k: 'Eye for an Eye', v: p.xGames ? p.ex.paybacks : null }, { k: 'Double kills', v: p.xGames ? p.ex.multis : null },
		{ k: 'Heavies', v: p.xGames ? p.ex.heavies : null }, { k: 'Flawless wins', v: p.kdaGames ? p.flawless : null }, { k: 'Comebacks', v: p.brinks },
		{ k: 'Defended', v: p.clashGames ? p.ex.defends : null }, { k: 'Ultimates', v: p.ults }, { k: 'Best level', v: p.maxLevel || null }
	];

	// a level-up path as chips
	const TIER = ['', 'I', 'II', 'III', 'IV'];
	function chips(hero: string, path: Path) {
		const deck = heroCards(hero);
		const out = path.cards.map((i) => ({ name: deck[i]?.name ?? '?', colour: (deck[i]?.color ?? '').toLowerCase(), tier: TIER[deck[i]?.level ?? 0] ?? '' }));
		if (path.ult) out.push({ name: deck.find((c) => c.level === 4)?.name ?? 'Ultimate', colour: 'purple', tier: 'IV' });
		return out;
	}
	let open: Record<string, boolean> = {};
	let limit = 25;
	const rt = (x: { r: number; t: number }) => (x.r ? `R${x.r}·T${x.t}` : '');
	// K / D / M = kills / deaths / minions (the user's pick over K / D / A)
	const kda = (x: { k: number | null; d: number | null; m?: number | null; minions?: number | null }) => (x.k != null ? `${x.k}/${x.d}/${x.m ?? x.minions ?? '–'}` : '–');
	function badges(m: MatchLine) {
		const x = m.x, b: string[] = [];
		if (x?.firstBlood) b.push('First blood');
		if (x?.wipe) b.push('Rampage');
		if (m.won && m.d === 0) b.push('Flawless');
		if (m.brink) b.push('Comeback');
		if (x?.aces) b.push('Ace');
		if (x?.multis) b.push('Double kill');
		if (x?.shutdowns) b.push('Shutdown');
		for (const mo of momentsOf(x)) b.push(mo.n > 1 ? `${mo.title} ×${mo.n}` : mo.title);
		if (m.ultRound != null) b.push(`Ultimate R${m.ultRound}`);
		return b;
	}
	function downloadCsv() {
		const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const head = ['Date', 'Room', 'Result', 'Win type', 'Team', 'Hero', 'Level', 'Kills', 'Deaths', 'Assists', 'Minions', 'Coins earned', 'Rounds', 'Minutes', 'Rating', 'Change', 'Teammates', 'Opponents', 'Build'];
		const rows = [...p.history].reverse().map((m) => [new Date(m.at).toISOString(), m.legacy ? 'table' : m.room, m.won ? 'Win' : 'Loss', WIN_LABEL[m.type], teamName(m.team), heroName(m.hero), m.level || '', m.k ?? '', m.d ?? '', m.a ?? '', m.minions ?? '', m.coins ?? '', m.rounds || '', m.minutes || '', m.rating, m.delta,
			m.mates.map((x) => `${x.name} (${heroName(x.hero)})`).join('; '), m.foes.map((x) => `${x.name} (${heroName(x.hero)})`).join('; '), chips(m.hero, m.path).map((c) => `${c.tier} ${c.name}`).join(' > ')]);
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
		a.download = `goa2-${p.name.replace(/[^\w-]+/g, '_')}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	$: pc = p.color ? colorHex(p.color) : 'var(--au)';
</script>

{#snippet seats(lbl: string, list: TableMate[])}
	<div>
		<div class="sub">{lbl}</div>
		{#each list as x (x.key)}
			<button class="seat linky" on:click={() => onPlayer(x.key)}><span class="face" style="--fs:26px; {portraitCss(x.hero)}"></span><span><b>{x.name}</b><small>{heroName(x.hero)}{x.level ? ` · Lv ${x.level}` : ''}</small></span><em>{kda(x)}</em></button>
		{:else}<span class="muted">alone</span>{/each}
	</div>
{/snippet}

<div class="pp">
	<header class="ban" style="--img:url({main ? heroSplash(main) : ''}); --fx:{fx * 100}%; --fy:{fy * 100}%; --pc:{pc}">
		<div class="btop"><button class="btn2" on:click={onBack}>← Back</button><button class="btn2" on:click={downloadCsv} title="Every game as a spreadsheet">Download CSV</button></div>
		<div class="bt">
			{#if main}<span class="face big" style="--fs:84px; {portraitCss(main)}"></span>{/if}
			<div class="bn">
				<span class="rkc" class:g1={rank === 1} class:g2={rank === 2} class:g3={rank === 3}>#{rank}</span>
				<h2>{p.name}</h2>
				<span class="bs">{p.games} games · since {day(p.firstAt)} · last {day(p.lastAt)}{#if p.minutes} · {hm(p.minutes)} played{/if}</span>
				{#if titles.length}<span class="tt">{#each allTitles ? titles : titles.slice(0, 6) as t (t.title)}<span class="chip au" title={t.blurb}>{t.title}</span>{/each}{#if titles.length > 6}<button class="chip more" on:click={() => (allTitles = !allTitles)} title={allTitles ? 'Show fewer' : 'Show every award they hold'}>{allTitles ? 'Less' : `+${titles.length - 6}`}</button>{/if}</span>{/if}
			</div>
			<div class="bk">
				<div class="kv"><span>Rating</span><b>{p.rating}<small> peak {p.peak}</small></b></div>
				<div class="kv"><span>Record</span><b><span class="up">{p.wins}</span>–<span class="down">{p.losses}</span></b></div>
				<div class="kv"><span>Streak</span><b class:up={p.streak > 0} class:down={p.streak < 0}>{streak(p.streak)}<small> best {p.bestStreak ? `W${p.bestStreak}` : '–'}</small></b></div>
				<div class="kv"><span>K/D · kill share</span><b>{kd}<small> {kp}</small></b></div>
			</div>
		</div>
	</header>

	<div class="row c3">
		<section class="card">
			<div class="rate"><h3>Rating</h3><span class="big au">{p.rating}</span><span class="rk">#{rank} · start {START_RATING}</span></div>
			<Line series={[{ values: p.ratingHist, color: '#f3c454' }]} ref={START_RATING} labels={p.ratingHist.length > 1 ? ['start', `${p.games} games`] : []} lastHot={false} />
		</section>
		<section class="card">
			<div class="rate"><h3>Win Rate</h3><span class="big" class:g={wr >= 50} class:r-={wr < 50}>{f1(wr)}%</span><span class="rk">{p.wins}–{p.losses}</span></div>
			<Line series={[{ values: wt, color: wr >= 50 ? '#35d07a' : '#ef4f5c' }]} ref={50} min={0} max={100} labels={wt.length > 1 ? ['first game', 'now'] : []} />
		</section>
		<section class="card mu">
			<div class="ch">Matchups<span class="r seg"><button class:on={mside === 'with'} on:click={() => (mside = 'with')}>With</button><button class:on={mside === 'against'} on:click={() => (mside = 'against')}>Against</button></span></div>
			<div class="mus">
				<div class="mg">{#each mu.best as m (m.key)}<button class="mp" on:click={() => onPlayer(m.key)} title="{m.wins}–{m.games - m.wins} ({m.games} games)"><b>{m.name}</b><span class="up">+{f1(m.delta)}</span><small>{m.wins}–{m.games - m.wins}</small></button>{:else}<span class="none">—</span>{/each}</div>
				<span class="div"></span>
				<div class="mg">{#each mu.worst as m (m.key)}<button class="mp" on:click={() => onPlayer(m.key)} title="{m.wins}–{m.games - m.wins} ({m.games} games)"><b>{m.name}</b><span class="down">{f1(m.delta)}</span><small>{m.wins}–{m.games - m.wins}</small></button>{:else}<span class="none">—</span>{/each}</div>
			</div>
			<div class="mfoot"><span>Best {mside === 'with' ? 'teammates' : 'to face'}</span><span class="dot"></span><span>Worst {mside === 'with' ? 'teammates' : 'to face'}</span></div>
		</section>
	</div>

	<div class="row c21">
		<section class="card">
			<div class="ch">Career <small>every game on record{p.kdaGames < p.games ? ` · kills, deaths and minions from the ${p.kdaGames} games that kept them` : ''}</small></div>
			<div class="career">
				<div class="kv big"><span>Hero kills</span><b class="up">{p.kdaGames ? p.kills : '–'}</b></div>
				<div class="kv big"><span>Deaths</span><b class="down">{p.kdaGames ? p.deaths : '–'}</b></div>
				<div class="kv big"><span>Minions</span><b class="b">{p.kdaGames ? p.minions : '–'}</b></div>
				<div class="kv big"><span>Gold collected</span><b class="au">{p.coinGames ? p.coins : '–'}</b></div>
				<div class="kv big"><span>Ultimates</span><b class="vi">{p.ults}</b></div>
				<div class="kv big"><span>Assists</span><b>{p.kdaGames ? p.assists : '–'}</b></div>
			</div>
		</section>
		<section class="card">
			<div class="ch">By side <small>do they win more as Atlanteans or Titans?</small></div>
			{#each [['orange', 'Atlanteans'], ['blue', 'Titans']] as [t, label] (t)}
				{@const r = sides[t === 'orange' ? 'orange' : 'blue']}
				{@const w = pct(r.wins, r.games)}
				<div class="sd">
					<span class="sdn" class:team-o={t === 'orange'} class:team-b={t === 'blue'}>{label}</span>
					<span class="bar half" class:gr={w >= 50} class:rd={w < 50}><i style="--v:{r.games ? r.wins / r.games : 0}"></i></span>
					<b class:up={r.games > 0 && w >= 50} class:down={r.games > 0 && w < 50}>{r.games ? `${Math.round(w)}%` : '–'}</b>
					<small>{r.wins}–{r.games - r.wins}</small>
				</div>
			{/each}
		</section>
	</div>

	{#if roles.length}
		<div class="row roles" style="grid-template-columns: repeat({roles.length}, minmax(0, 1fr))">
			{#each roles as r, i (r.trait)}
				<section class="card rl">
					<div class="ch">{#if traitIcon(r.trait)}<img src={traitIcon(r.trait)} alt="" />{/if}{TRAIT_LABELS[r.trait]}{#if i === 0}<span class="r mpl">Most played</span>{/if}</div>
					<div class="bl"><b>{f1(r.share)}%</b><span class="bar"><i style="--v:{r.share / 100}"></i></span></div>
					<div class="bl"><b>{f1(pct(r.wins, r.games))}%</b><span class="bar half" class:gr={pct(r.wins, r.games) >= 50} class:rd={pct(r.wins, r.games) < 50}><i style="--v:{r.wins / r.games}"></i></span></div>
					<div class="rw"><span><i class="up">W</i>{r.wins}</span><span><i class="down">L</i>{r.games - r.wins}</span><span><i class="b">G</i>{r.games}</span></div>
				</section>
			{/each}
		</div>
	{/if}

	<div class="row c21">
		<section class="card">
			<div class="ch">Heroes <small>{heroes.length} played</small></div>
			<div class="scrollx">
				<table class="tbl">
					<thead><tr>
						{#each [['name', 'Hero', false], ['games', 'Games', true], ['win', 'Win %', false], ['kdm', 'K / D / M', true], ['gold', 'Gold', true]] as [k, l, rt] (k)}
							<th class="sortable" class:rt={!!rt} class:on={hs === k} class:flipped={hs === k && hflip} on:click={() => sortHs(k as typeof hs)}>{l}</th>
						{/each}
					</tr></thead>
					<tbody>
						{#each heroRows as h (h.hero)}
							{@const w = pct(h.wins, h.games)}
							<tr on:click={() => onHero(h.hero)}>
								<td><span class="hc"><span class="face" style="--fs:30px; {portraitCss(h.hero)}"></span>{heroName(h.hero)}</span></td>
								<td class="rt">{h.games}</td>
								<td class="barcell"><span class="bv"><b class:up={w >= 50} class:down={w < 50}>{Math.round(w)}%</b><span class="bar thin half" class:gr={w >= 50} class:rd={w < 50}><i style="--v:{h.wins / h.games}"></i></span></span></td>
								<td class="rt">{h.ev ? `${avg(h.k, h.ev)} / ${avg(h.d, h.ev)} / ${avg(h.mn, h.ev)}` : '–'}</td>
								<td class="rt">{avg(h.coins, h.cg)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
		<section class="card">
			<div class="ch">Combat <small>per game · ▲▼ vs the table</small></div>
			{#if p.kdaGames}
				<div class="kdab"><b class="up">{p.kills}</b><i>/</i><b class="down">{p.deaths}</b><i>/</i><b class="b">{p.minions}</b><span>K / D / M{p.kdaGames < p.games ? ` · ${p.kdaGames} of ${p.games} games` : ''}</span></div>
				<div class="cgrid">
					{#each combat as c (c.k)}<div class="kv"><span>{c.k}</span><b>{c.v}<em class={c.c}>{c.c === 'up' ? '▲' : c.c === 'down' ? '▼' : ''}</em><small> {c.t}</small></b></div>{/each}
				</div>
			{:else}
				<p class="muted">No kill numbers for these games.</p>
			{/if}
			<div class="sub sp">How they won</div>
			<div class="types">
				{#each WIN_TYPES as t (t)}
					{#if p.byType[t].games}<div class="ty"><span>{WIN_LABEL[t]}</span><span class="bar gr"><i style="--v:{p.byType[t].wins / Math.max(1, p.wins)}"></i></span><b>{p.byType[t].wins}</b></div>{/if}
				{/each}
			</div>
		</section>
	</div>

	<div class="row c2">
		<section class="card">
			<div class="ch">Friends &amp; foes</div>
			<div class="rels">
				{#each rels as r (r.k)}
					<button class="rel" class:good={r.good === true} class:bad={r.good === false} on:click={() => onPlayer(r.x.key)}><span>{r.k}</span><b>{r.x.name}</b><small>{r.line}</small></button>
				{:else}<p class="muted">Play a few more games.</p>{/each}
			</div>
		</section>
		<section class="card">
			<div class="ch">Feats</div>
			<div class="fgrid">{#each feats as f (f.k)}<div class="kv"><span>{f.k}</span><b>{f.v ?? '–'}</b></div>{/each}</div>
		</section>
	</div>

	<section class="card">
		<div class="ch">Match history <small>newest first · tap a game for the full record</small></div>
		<div class="hist">
			{#each p.history.slice(0, limit) as m (m.id)}
				<div class="hr" class:openr={open[m.id]}>
					<button class="hl" on:click={() => (open = { ...open, [m.id]: !open[m.id] })} aria-expanded={!!open[m.id]}>
						<span class="wl" class:w={m.won}>{m.won ? 'W' : 'L'}</span>
						<span class="face" style="--fs:34px; {portraitCss(m.hero)}"></span>
						<span class="hn"><b>{heroName(m.hero)}</b><small>{day(m.at)} · <span class:team-o={m.team === 'orange'} class:team-b={m.team === 'blue'}>{teamName(m.team)}</span></small></span>
						<span class="hk"><small>K/D/M</small><b>{kda(m)}</b></span>
						<span class="hk hidem"><small>Gold</small><b>{m.coins ?? '–'}</b></span>
						<span class="hk hidem"><small>{m.legacy ? 'Table' : WIN_LABEL[m.type]}</small><b>{m.legacy ? '—' : `R${m.rounds}`}</b></span>
						<span class="hvs hidem"><small>with</small> {m.mates.map((x) => x.name).join(', ') || '—'}<br /><small>vs</small> {m.foes.map((x) => x.name).join(', ')}</span>
						<span class="dl" class:up={m.delta > 0} class:down={m.delta < 0}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
					</button>
					{#if open[m.id]}
						<div class="hb">
							<div class="facts">
								<div class="kv"><span>Result</span><b>{m.won ? 'Victory' : 'Defeat'}</b></div>
								<div class="kv"><span>How</span><b>{m.legacy ? 'Table game' : WIN_LABEL[m.type]}</b></div>
								{#if !m.legacy}<div class="kv"><span>Length</span><b>{m.rounds} rounds <small>{hm(m.minutes)}</small></b></div>{/if}
								<div class="kv"><span>Rating</span><b>{m.rating - m.delta} → {m.rating}</b></div>
								<div class="kv"><span>Level</span><b>{m.level || '–'}</b></div>
								<div class="kv"><span>Minions</span><b>{m.minions ?? '–'}{#if m.mRoles}<small> {m.mRoles.melee}m {m.mRoles.ranged}r {m.mRoles.heavy}h</small>{/if}</b></div>
							</div>
							{#if badges(m).length}<div class="bdg">{#each badges(m) as b (b)}<span class="chip au">{b}</span>{/each}</div>{/if}
							{#if m.kills.length || m.deaths.length || m.assisted.length}
								<div class="evs">
									<div><div class="sub">Killed</div>{#each m.kills as x, i (i)}<span class="ev up">{x.name} <small>{rt(x)}</small></span>{:else}<span class="muted">—</span>{/each}</div>
									<div><div class="sub">Fell to</div>{#each m.deaths as x, i (i)}<span class="ev down">{x.name} <small>{rt(x)}</small></span>{:else}<span class="muted">—</span>{/each}</div>
									<div><div class="sub">Assisted</div>{#each m.assisted as x, i (i)}<span class="ev b">{x.name} <small>{rt(x)}</small></span>{:else}<span class="muted">—</span>{/each}</div>
								</div>
							{/if}
							{#if m.path.cards.length || m.path.ult}
								<div class="sub">Build</div>
								<div class="path">{#each chips(m.hero, m.path) as c, i (i)}{#if i && m.path.ordered}<span class="arr">›</span>{/if}<span class="cc c-{c.colour}"><i>{c.tier}</i>{c.name}</span>{/each}</div>
							{/if}
							<div class="teams">{@render seats('With', m.mates)}{@render seats('Against', m.foes)}</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if p.history.length > limit}<button class="btn2 more" on:click={() => (limit += 25)}>Show more ({p.history.length - limit} left)</button>{/if}
	</section>
</div>

<style>
	.pp { display: flex; flex-direction: column; }
	.ban { position: relative; margin-bottom: 16px; padding: 18px 22px 20px; border-radius: 14px; overflow: hidden; border: 1px solid var(--ln); border-top: 3px solid var(--pc); min-height: 200px; display: flex; flex-direction: column; justify-content: space-between;
		background: linear-gradient(0deg, rgba(10, 12, 16, 0.92) 0%, rgba(10, 12, 16, 0.2) 70%), linear-gradient(90deg, rgba(10, 12, 16, 0.97) 0%, rgba(10, 12, 16, 0.72) 45%, rgba(10, 12, 16, 0.45) 100%), var(--img) var(--fx) var(--fy) / cover no-repeat; }
	.btop { display: flex; justify-content: space-between; gap: 10px; }
	.bt { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin-top: 18px; }
	.bn { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
	.bn h2 { margin: 0; font-size: 36px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
	.rkc { align-self: flex-start; padding: 2px 8px; border-radius: 6px; font-size: 13px; font-weight: 800; background: var(--p3); color: var(--tx2); }
	.rkc.g1 { background: var(--au); color: #241a00; } .rkc.g2 { background: #c9d1dc; color: #10141a; } .rkc.g3 { background: #cd8a4f; color: #1f1005; }
	.bs { font-size: 14px; color: var(--tx2); }
	.tt { display: flex; flex-wrap: wrap; gap: 6px; }
	.bk { margin-left: auto; display: flex; gap: 28px; flex-wrap: wrap; }
	.mus { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; }
	.mg { display: flex; flex-direction: column; gap: 8px; }
	.mp { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 8px; padding: 7px 10px; border-radius: 8px; border: 0; background: var(--p2); color: inherit; text-align: left; cursor: pointer; }
	.mp:hover { background: var(--p3); }
	.mp b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mp span { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.mp small { grid-column: 1 / -1; font-size: 11.5px; color: var(--mu); }
	.div { width: 1px; background: var(--ln2); }
	.none { color: var(--mu2); padding: 10px 0; text-align: center; }
	.mfoot { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 13px; color: var(--mu); }
	.mfoot .dot { flex: 1; height: 1px; background: var(--ln2); }
	.roles { display: grid; }
	@media (max-width: 1100px) { .roles { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
	.rl .ch { font-size: 15.5px; }
	.rl .ch img { width: 20px; height: 20px; }
	.mpl { font-size: 12.5px; font-weight: 700; color: var(--bl); }
	.bl { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 10px; margin-bottom: 12px; }
	.bl b { font-size: 14px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
	.rw { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; }
	.rw span { display: flex; flex-direction: column; gap: 3px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.rw i { font-style: normal; font-size: 12px; font-weight: 800; }
	.hc { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; }
	.career { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
	.career .kv b { font-size: 26px; font-weight: 800; }
	.vi { color: var(--vi); }
	.sd { display: grid; grid-template-columns: 90px 1fr 46px 44px; align-items: center; gap: 12px; margin-bottom: 14px; }
	.sd:last-child { margin-bottom: 0; }
	.sdn { font-size: 14px; font-weight: 700; }
	.sd b { text-align: right; font-size: 16px; font-variant-numeric: tabular-nums; }
	.sd small { font-size: 12px; color: var(--mu); text-align: right; }
	.chip.more { cursor: pointer; }
	.chip.more:hover { border-color: var(--au); color: var(--tx); }
	@media (max-width: 1100px) { .career { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.kdab { display: flex; align-items: baseline; gap: 6px; margin-bottom: 14px; font-variant-numeric: tabular-nums; }
	.kdab b { font-size: 30px; font-weight: 800; }
	.kdab i { font-style: normal; color: var(--mu2); font-size: 22px; }
	.kdab span { margin-left: 10px; font-size: 12px; color: var(--mu); }
	.cgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 12px; }
	.cgrid em { font-style: normal; font-size: 11px; margin-left: 4px; }
	.cgrid em.up { color: var(--gr); } .cgrid em.down { color: var(--rd); }
	.sub.sp { margin-top: 20px; }
	.types { display: flex; flex-direction: column; gap: 8px; }
	.ty { display: grid; grid-template-columns: 90px 1fr 34px; align-items: center; gap: 10px; font-size: 13px; }
	.ty span:first-child { color: var(--tx2); }
	.ty b { text-align: right; }
	.rels { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
	.rel { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--ln); border-left: 3px solid var(--mu2); background: var(--p2); color: inherit; text-align: left; cursor: pointer; }
	.rel.good { border-left-color: var(--gr); } .rel.bad { border-left-color: var(--rd); }
	.rel span { font-size: 11.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--mu); }
	.rel b { font-size: 16px; }
	.rel small { font-size: 12px; color: var(--tx2); }
	.fgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 12px; }
	.fgrid .kv b { font-size: 18px; }
	.hist { display: flex; flex-direction: column; }
	.hr { border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
	.hr.openr { background: rgba(255, 255, 255, 0.02); }
	.hl { width: 100%; display: grid; grid-template-columns: 24px 34px minmax(120px, 1.2fr) 80px 56px 90px minmax(160px, 2fr) 44px; align-items: center; gap: 12px; padding: 9px 4px; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
	.hl:hover { background: rgba(255, 255, 255, 0.025); }
	.hn { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.hn b { font-size: 14.5px; }
	.hn small { font-size: 12px; color: var(--mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hk { display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
	.hk small { font-size: 11px; color: var(--mu); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hk b { font-size: 14px; }
	.hvs { font-size: 12.5px; line-height: 1.45; color: var(--tx2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hvs small { color: var(--mu2); }
	.dl { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--mu); }
	.hb { padding: 4px 6px 16px 40px; display: flex; flex-direction: column; gap: 12px; }
	.facts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
	.facts .kv b { font-size: 15px; }
	.bdg { display: flex; flex-wrap: wrap; gap: 6px; }
	.evs, .teams { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
	.teams { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.ev { display: inline-flex; gap: 4px; margin: 0 6px 4px 0; padding: 2px 8px; border-radius: 6px; background: var(--p3); font-size: 12.5px; }
	.ev small { color: var(--mu); }
	.seat { width: 100%; display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 4px 0; }
	.seat span { display: flex; flex-direction: column; min-width: 0; }
	.seat b { font-size: 13.5px; }
	.seat small { font-size: 11.5px; color: var(--mu); }
	.seat em { font-style: normal; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--tx2); }
	.path { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
	.arr { color: var(--mu2); }
	.cc { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 3px; border-radius: 999px; font-size: 12.5px; background: var(--p3); }
	.cc i { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 3px; border-radius: 999px; font-style: normal; font-size: 10.5px; font-weight: 800; color: #fff; background: #555; }
	.cc.c-red i { background: #b8322f; } .cc.c-blue i { background: #2a64c4; } .cc.c-green i { background: #2b8a43; } .cc.c-purple i { background: #7b45c9; }
	.more { margin: 14px auto 0; display: flex; }
	@media (max-width: 1100px) { .hl { grid-template-columns: 24px 34px minmax(0, 1fr) 76px 44px; } .hidem { display: none; } .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 760px) {
		.bk { margin-left: 0; gap: 18px; } .bn h2 { font-size: 28px; }
		.fgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.hb { padding-left: 6px; } .evs, .teams { grid-template-columns: minmax(0, 1fr); }
	}
</style>
