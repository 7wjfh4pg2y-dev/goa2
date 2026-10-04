<script lang="ts">
	// THE HALL OF RECORDS — every finished game in `goa2_games`, added up (league.ts): the table of players
	// (rating, record, streaks, K/D/A, favourite heroes), each player's page (friends and foes, builds,
	// match history), the heroes and their level-up paths, and the silly records. `?sample=1` shows made-up
	// games, so the page can be seen before any are on record.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import {
		buildLeague, titlesOf, nemesisOf, victimOf, rivalOf, bestMateOf, worstMateOf, rowOfSelect,
		LEAGUE_SELECT, WIN_TYPES, WIN_LABEL, START_RATING,
		type League, type PlayerAgg, type HeroAgg, type PathTally, type GameRowIn, type LeagueGame, type Path, type Foe, type Mate
	} from '$lib/league';
	import { sampleRows } from '$lib/league.sample';
	import { heroById, portraitCss, traitIcon, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { teamName } from '$lib/teams';
	import Icon from '$lib/ui/Icon.svelte';

	type Tab = 'players' | 'heroes' | 'records' | 'games';
	let phase: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
	let errMsg = '';
	let sample = false;
	let league: League | null = null;
	let titles: Record<string, { title: string; blurb: string }[]> = {};
	let tab: Tab = 'players';
	let sel: string | null = null; // the player whose page is open
	let heroSel: string | null = null; // the hero whose builds are open
	let body: HTMLElement;

	function use(rows: GameRowIn[]) {
		league = buildLeague(rows);
		titles = titlesOf(league.players);
		phase = league.games.length ? 'ready' : 'empty';
	}
	async function load() {
		sample = new URLSearchParams(location.search).has('sample');
		if (sample) return use(sampleRows(24, 7));
		try {
			const rows: GameRowIn[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await supabase.from('goa2_games').select(LEAGUE_SELECT).order('ended_at', { ascending: true }).range(from, from + 999);
				if (error) throw error;
				rows.push(...(data ?? []).map(rowOfSelect));
				if (!data || data.length < 1000) break;
			}
			use(rows);
		} catch (e) {
			errMsg = (e as { message?: string })?.message ?? String(e);
			phase = 'error';
		}
	}
	onMount(load);

	const go = (t: Tab) => { tab = t; sel = null; body?.scrollTo(0, 0); };
	const openPlayer = (key: string) => { sel = key; tab = 'players'; body?.scrollTo(0, 0); };
	$: player = sel && league ? league.players.find((p) => p.key === sel) ?? null : null;
	$: rankOf = (key: string) => (league?.players.findIndex((p) => p.key === key) ?? -1) + 1;

	// ── little formatters ──
	const heroName = (id: string) => heroById(id)?.name ?? id;
	const pct = (w: number, g: number) => (g ? Math.round((100 * w) / g) : 0);
	const avg = (n: number, g: number, d = 1) => (g ? (n / g).toFixed(d) : '–');
	const day = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
	const streakTxt = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–');
	const kd = (p: PlayerAgg) => (p.kdaGames ? (p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills ? `${p.kills}.00` : '0.00') : '–');
	const kp = (p: PlayerAgg) => (p.teamKills ? `${pct(p.kills + p.assists, p.teamKills)}%` : '–');
	const favHeroes = (p: PlayerAgg, n = 3) => Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins).slice(0, n);
	const favRoles = (p: PlayerAgg, n = 3) => (Object.entries(p.roles) as [Trait, number][]).sort((a, b) => b[1] - a[1]).slice(0, n);
	const wl = (x: { games: number; wins: number }) => `${x.wins}–${x.games - x.wins}`;

	// the table's averages, per game (for "vs the table")
	$: table = (() => {
		const ps = league?.players ?? [];
		const sum = (f: (p: PlayerAgg) => number) => ps.reduce((s, p) => s + f(p), 0);
		const kg = sum((p) => p.kdaGames), cg = sum((p) => p.coinGames), g = sum((p) => p.games);
		return { k: kg ? sum((p) => p.kills) / kg : 0, d: kg ? sum((p) => p.deaths) / kg : 0, a: kg ? sum((p) => p.assists) / kg : 0, m: kg ? sum((p) => p.minions) / kg : 0, c: cg ? sum((p) => p.coins) / cg : 0, lv: g ? sum((p) => p.levels) / g : 0 };
	})();
	// above / below the table: ▲ / ▼ (low = fewer is better)
	const cmp = (mine: number, theirs: number, low = false) => (Math.abs(mine - theirs) < 0.05 ? '' : mine > theirs !== low ? 'up' : 'down');

	// ── a level-up path as card chips ──
	type Chip = { name: string; colour: string; tier: string };
	const TIER = ['', 'I', 'II', 'III', 'IV'];
	function chips(hero: string, path: Path): Chip[] {
		const deck = heroCards(hero);
		const out: Chip[] = path.cards.map((i) => ({ name: deck[i]?.name ?? '?', colour: (deck[i]?.color ?? '').toLowerCase(), tier: TIER[deck[i]?.level ?? 0] ?? '' }));
		if (path.ult) out.push({ name: deck.find((c) => c.level === 4)?.name ?? 'Ultimate', colour: 'purple', tier: 'IV' });
		return out;
	}

	// ── a hero's card picks: for each colour and tier, the two options — how often taken, how often won ──
	type Pick = { i: number; name: string; games: number; wins: number };
	function cardPicks(h: HeroAgg) {
		const deck = heroCards(h.hero);
		const tally = new Map<number, { games: number; wins: number }>();
		for (const t of h.paths) for (const i of t.path.cards) { const x = tally.get(i) ?? { games: 0, wins: 0 }; x.games += t.games; x.wins += t.wins; tally.set(i, x); }
		const ult = h.paths.filter((t) => t.path.ult).reduce((s, t) => ({ games: s.games + t.games, wins: s.wins + t.wins }), { games: 0, wins: 0 });
		const rows = [3, 2].map((tier) => ({
			tier,
			cols: ['RED', 'BLUE', 'GREEN'].map((colour) => ({
				colour: colour.toLowerCase(),
				opts: deck.map((c, i) => ({ c, i })).filter((x) => x.c.color === colour && x.c.level === tier)
					.map((x): Pick => ({ i: x.i, name: x.c.name, ...(tally.get(x.i) ?? { games: 0, wins: 0 }) }))
			}))
		}));
		return { rows, ult, ultName: deck.find((c) => c.level === 4)?.name ?? 'Ultimate' };
	}
	// the path most taken, and the one that wins most (2+ games, else none)
	const popular = (paths: PathTally[]) => paths[0] ?? null;
	const winning = (paths: PathTally[]) => [...paths].filter((t) => t.games >= 2).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] ?? null;

	// ── the rating journey ──
	function chart(hist: number[]) {
		const lo = Math.min(START_RATING, ...hist) - 10, hi = Math.max(START_RATING, ...hist) + 10;
		const x = (i: number) => (hist.length > 1 ? (i / (hist.length - 1)) * 600 : 300);
		const y = (v: number) => 150 - ((v - lo) / (hi - lo)) * 140;
		return { pts: hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), base: y(START_RATING), lo: Math.round(lo + 10), hi: Math.round(hi - 10), last: { x: x(hist.length - 1), y: y(hist[hist.length - 1]) } };
	}

	const relations = (p: PlayerAgg) => {
		const nem = nemesisOf(p), vic = victimOf(p), riv = rivalOf(p), best = bestMateOf(p), jinx = worstMateOf(p);
		return [
			best && { k: 'Best teammate', who: best.name, line: `${wl(best)} together`, good: true },
			jinx && jinx.key !== best?.key && { k: 'Jinx', who: jinx.name, line: `${wl(jinx)} together`, good: false },
			nem && { k: 'Nemesis', who: nem.name, line: `defeated you ${nem.killedBy}× · you're ${wl(nem)} vs them`, good: false },
			vic && { k: 'Favourite victim', who: vic.name, line: `you defeated them ${vic.killed}×`, good: true },
			riv && { k: 'Rival', who: riv.name, line: `met ${riv.games}× · you're ${wl(riv)}`, good: null }
		].filter(Boolean) as { k: string; who: string; line: string; good: boolean | null }[];
	};
	const SIDES = ['orange', 'blue'] as const;
	const teamOf = (g: LeagueGame, t: 'orange' | 'blue') => g.players.filter((p) => p.team === t);
</script>

<svelte:head><title>GoA2 · Hall of Records</title></svelte:head>
<svelte:window on:keydown={(e) => { if (e.key === 'Escape') { if (heroSel) heroSel = null; else if (sel) sel = null; } }} />

{#snippet face(hero: string, size = 34)}
	<span class="face" style="--fs:{size}px; {portraitCss(hero)}" title={heroName(hero)}></span>
{/snippet}
{#snippet pathRow(hero: string, path: Path)}
	<span class="path" class:loose={!path.ordered}>
		{#each chips(hero, path) as c, i}
			{#if i && path.ordered}<span class="arr" aria-hidden="true">›</span>{/if}
			<span class="cc c-{c.colour}"><b>{c.tier}</b>{c.name}</span>
		{/each}
	</span>
{/snippet}
{#snippet who(name: string)}
	{@const k = league?.players.find((p) => p.name === name)?.key}
	{#if k}<button class="who" on:click={() => openPlayer(k)}>{name}</button>{:else}<span>{name}</span>{/if}
{/snippet}

<div class="stats tide">
	<header class="top">
		<a class="btn btn-ghost btn-sm back" href={base + '/'}><Icon name="back" /> <span class="hidem">Home</span></a>
		<h1 class="ttl">Hall of Records</h1>
		{#if sample}<span class="samp" title="Made-up games, to show the page">Sample</span>{/if}
		<nav class="tabs" aria-label="Sections">
			{#each [['players', 'Players'], ['heroes', 'Heroes'], ['records', 'Records'], ['games', 'Games']] as [k, l] (k)}
				<button class="tab" class:on={tab === k && !(k === 'players' && sel)} class:crumb={tab === k && k === 'players' && !!sel} on:click={() => go(k as Tab)}>{l}</button>
			{/each}
		</nav>
	</header>

	<main class="body" bind:this={body}>
		{#if phase === 'loading'}
			<p class="note">Opening the records…</p>
		{:else if phase === 'error'}
			<section class="panel msg">
				<h2 class="t-h2">The records are locked</h2>
				<p class="t-body c-muted">Couldn't read the games table ({errMsg}).</p>
				<a class="btn btn-ghost" href="?sample=1">See it with sample games</a>
			</section>
		{:else if phase === 'empty' || !league}
			<section class="panel msg">
				<h2 class="t-h2">No games on record yet</h2>
				<p class="t-body c-muted">A game lands here when it is won, was played from the first turn, and had at least two people at the table.</p>
				<a class="btn btn-ghost" href="?sample=1">See it with sample games</a>
			</section>
		{:else if tab === 'players' && player}
			{@const p = player}
			{@const rank = rankOf(p.key)}
			{@const ch = chart(p.ratingHist)}
			{@const main = favHeroes(p, 1)[0]}
			<!-- ── one player's page ── -->
			<div class="detail">
				<section class="panel phead">
					<button class="btn btn-ghost btn-sm" on:click={() => (sel = null)}><Icon name="back" /> All players</button>
					<div class="who-big">
						{#if main}{@render face(main[0], 76)}{/if}
						<div class="namecol">
							<span class="rk" class:gold={rank === 1} class:silver={rank === 2} class:bronze={rank === 3}>#{rank}</span>
							<h2 class="pn">{p.name}</h2>
							<span class="tchips">{#each titles[p.key] ?? [] as t (t.title)}<span class="tchip" title={t.blurb}>{t.title}</span>{/each}</span>
						</div>
						<div class="rating"><b>{p.rating}</b><span>rating</span></div>
					</div>
					<div class="tiles">
						<div class="tile"><b>{p.games}</b><span>Games</span></div>
						<div class="tile good"><b>{p.wins}</b><span>Wins</span></div>
						<div class="tile bad"><b>{p.losses}</b><span>Losses</span></div>
						<div class="tile"><b>{pct(p.wins, p.games)}%</b><span>Win rate</span></div>
						<div class="tile"><b>{Object.keys(p.heroes).length}</b><span>Heroes</span></div>
						<div class="tile" class:good={p.streak > 0} class:bad={p.streak < 0}><b>{streakTxt(p.streak)}</b><span>Streak</span></div>
						<div class="tile"><b>{p.bestStreak ? `W${p.bestStreak}` : '–'}</b><span>Best</span></div>
					</div>
				</section>

				<div class="cols">
					<section class="panel">
						<h3 class="t-label">Combat {#if p.kdaGames < p.games}<small>· {p.kdaGames} of {p.games} games</small>{/if}</h3>
						{#if p.kdaGames}
							<div class="kdabig"><b class="k">{p.kills}</b>/<b class="d">{p.deaths}</b>/<b class="a">{p.assists}</b><span>K / D / A</span></div>
							<div class="grid3">
								<div class="st"><span>K/D</span><b>{kd(p)}</b></div>
								<div class="st"><span>Kill share</span><b>{kp(p)}</b></div>
								<div class="st"><span>Avg level</span><b>{avg(p.levels, p.games)}</b><i class={cmp(p.levels / p.games, table.lv)}></i></div>
								<div class="st"><span>Kills / game</span><b>{avg(p.kills, p.kdaGames)}</b><i class={cmp(p.kills / p.kdaGames, table.k)}></i></div>
								<div class="st"><span>Defeats / game</span><b>{avg(p.deaths, p.kdaGames)}</b><i class={cmp(p.deaths / p.kdaGames, table.d, true)}></i></div>
								<div class="st"><span>Assists / game</span><b>{avg(p.assists, p.kdaGames)}</b><i class={cmp(p.assists / p.kdaGames, table.a)}></i></div>
								<div class="st"><span>Minions / game</span><b>{avg(p.minions, p.kdaGames)}</b><i class={cmp(p.minions / p.kdaGames, table.m)}></i></div>
								<div class="st"><span>Coins / game</span><b>{avg(p.coins, p.coinGames)}</b><i class={cmp(p.coins / Math.max(1, p.coinGames), table.c)}></i></div>
								<div class="st"><span>Minions</span><b>{p.minions}</b></div>
							</div>
							<p class="fine">▲ ▼ = above / below the table's average</p>
						{:else}
							<p class="t-small c-muted">No kill numbers yet — those come from games played on this version.</p>
						{/if}
					</section>

					<section class="panel">
						<h3 class="t-label">Rating journey</h3>
						<svg class="chart" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
							<line x1="0" x2="600" y1={ch.base} y2={ch.base} class="base" />
							<polyline points={ch.pts} class="line" />
						</svg>
						<div class="chartlbl"><span>{ch.lo}</span><span>start {START_RATING}</span><span>{ch.hi}</span></div>
						<h3 class="t-label sp">How they won</h3>
						<div class="types">
							{#each WIN_TYPES as t (t)}
								<div class="ty"><span>{WIN_LABEL[t]}</span><b>{p.byType[t].wins}<small> / {p.byType[t].games}</small></b></div>
							{/each}
						</div>
					</section>
				</div>

				<section class="panel">
					<h3 class="t-label">Friends &amp; foes</h3>
					<div class="rels">
						{#each relations(p) as r (r.k)}
							<div class="rel" class:good={r.good === true} class:bad={r.good === false}><span class="rk2">{r.k}</span>{@render who(r.who)}<span class="rl">{r.line}</span></div>
						{:else}
							<p class="t-small c-muted">Play a few more games.</p>
						{/each}
					</div>
					<div class="cols tight">
						<div>
							<h4 class="sub">With</h4>
							<div class="tbl">
								{#each p.mates as m (m.key)}
									<div class="tr">{@render who(m.name)}<span class="n">{m.games} games</span><span class="n">{wl(m)}</span><span class="bar"><i style="transform:scaleX({m.wins / m.games})"></i></span></div>
								{/each}
							</div>
						</div>
						<div>
							<h4 class="sub">Against</h4>
							<div class="tbl">
								<div class="tr th"><span></span><span class="n">You</span><span class="n k">Kills</span><span class="n d">Died</span></div>
								{#each [...p.foes].sort((a, b) => b.games - a.games) as f (f.key)}
									<div class="tr">{@render who(f.name)}<span class="n">{wl(f)}</span><span class="n k">{f.killed}</span><span class="n d">{f.killedBy}</span></div>
								{/each}
							</div>
						</div>
					</div>
				</section>

				<div class="cols">
					<section class="panel">
						<h3 class="t-label">Heroes</h3>
						<div class="tbl">
							{#each Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins) as [h, t] (h)}
								<div class="tr hero">{@render face(h, 28)}<span class="hn">{heroName(h)}</span><span class="n">{t.games}</span><span class="n">{wl(t)}</span><span class="bar"><i style="transform:scaleX({t.wins / t.games})"></i></span></div>
							{/each}
						</div>
						<h3 class="t-label sp">Roles</h3>
						<div class="roles">
							{#each favRoles(p, 10) as [t, n] (t)}
								<span class="role">{#if traitIcon(t)}<img src={traitIcon(t)} alt="" />{/if}{TRAIT_LABELS[t]} <b>{n}</b></span>
							{/each}
						</div>
					</section>
					<section class="panel">
						<h3 class="t-label">Builds</h3>
						<div class="builds">
							{#each p.paths.slice(0, 12) as b (b.hero + b.path.cards.join('.') + b.path.ult)}
								<div class="build">{@render face(b.hero, 28)}<div class="bcol"><span class="bh">{heroName(b.hero)} <small>{b.games > 1 ? `${b.games} games · ` : ''}{wl(b)}</small></span>{@render pathRow(b.hero, b.path)}</div></div>
							{:else}
								<p class="t-small c-muted">No level-ups on record.</p>
							{/each}
						</div>
					</section>
				</div>

				<section class="panel">
					<h3 class="t-label">Match history</h3>
					<div class="hist">
						{#each p.history as m (m.id)}
							<div class="mrow">
								<span class="res" class:w={m.won}>{m.won ? 'W' : 'L'}</span>
								<span class="dt">{day(m.at)}</span>
								{@render face(m.hero, 28)}
								<span class="hn">{heroName(m.hero)} <small>Lv {m.level}</small></span>
								<span class="kda3">{m.k != null ? `${m.k}/${m.d}/${m.a}` : '–'}</span>
								<span class="ty2">{WIN_LABEL[m.type]} · R{m.rounds}</span>
								<span class="vs"><small>with</small> {m.mates.map((x) => x.name).join(', ') || '—'} <small>vs</small> {m.foes.map((x) => x.name).join(', ')}</span>
								<span class="dl" class:up={m.delta > 0} class:down={m.delta < 0}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
							</div>
						{/each}
					</div>
				</section>
			</div>
		{:else if tab === 'players'}
			<!-- ── the table of players ── -->
			<div class="cards">
				{#each league.players as p, i (p.key)}
					{@const nem = nemesisOf(p)}
					{@const mate = bestMateOf(p)}
					<button class="panel pcard" on:click={() => openPlayer(p.key)}>
						<div class="pc-top">
							<span class="rk" class:gold={i === 0} class:silver={i === 1} class:bronze={i === 2}>{i === 0 ? '' : `#${i + 1}`}{#if i === 0}<Icon name="crown" fill />{/if}</span>
							<span class="pc-name">{p.name}</span>
							<span class="rating sm"><b>{p.rating}</b><span>rating</span></span>
						</div>
						<span class="tchips">{#each (titles[p.key] ?? []).slice(0, 2) as t (t.title)}<span class="tchip" title={t.blurb}>{t.title}</span>{/each}</span>
						<div class="wr"><span class="bar big"><i style="transform:scaleX({p.games ? p.wins / p.games : 0})"></i></span><b>{pct(p.wins, p.games)}%</b></div>
						<div class="trio"><span><b class="g">{p.wins}</b> W</span><span><b class="r">{p.losses}</b> L</span><span><b>{p.games}</b> games</span><span>streak <b class:g={p.streak > 0} class:r={p.streak < 0}>{streakTxt(p.streak)}</b></span></div>
						<div class="mini">
							<span><small>K/D/A</small><b>{p.kdaGames ? `${p.kills}/${p.deaths}/${p.assists}` : '–'}</b></span>
							<span><small>K/D</small><b>{kd(p)}</b></span>
							<span><small>Coins</small><b>{avg(p.coins, p.coinGames)}</b></span>
						</div>
						<div class="favs">
							{#each favHeroes(p) as [h, t] (h)}<span class="fav">{@render face(h, 30)}<small>{t.games}</small></span>{/each}
							<span class="froles">{#each favRoles(p) as [t] (t)}{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} title={TRAIT_LABELS[t]} />{/if}{/each}</span>
						</div>
						<div class="pc-rel">
							{#if mate}<span class="good"><small>Best mate</small> {mate.name}</span>{/if}
							{#if nem}<span class="bad"><small>Nemesis</small> {nem.name}</span>{/if}
						</div>
					</button>
				{/each}
			</div>
			{#if league.withEvents < league.games.length}<p class="fine c">K/D/A and nemeses count the {league.withEvents} game{league.withEvents === 1 ? '' : 's'} recorded with kill events; the rest count for everything else.</p>{/if}
		{:else if tab === 'heroes'}
			<!-- ── heroes and their builds ── -->
			<div class="heroes">
				{#each league.heroes as h (h.hero)}
					{@const top = popular(h.paths)}
					<button class="panel hcard" class:on={heroSel === h.hero} on:click={() => (heroSel = heroSel === h.hero ? null : h.hero)}>
						{@render face(h.hero, 44)}
						<span class="hcol">
							<span class="hn">{heroName(h.hero)}</span>
							<span class="hs"><b>{h.games}</b> picks · <b>{pct(h.wins, h.games)}%</b> wins</span>
							<span class="hp">{Object.entries(h.players).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ''}`).join(', ')}</span>
						</span>
						<span class="bar"><i style="transform:scaleX({h.wins / h.games})"></i></span>
						{#if top}<span class="hpath">{@render pathRow(h.hero, top.path)}</span>{/if}
					</button>
				{/each}
			</div>
			{#if heroSel}
				{@const h = league.heroes.find((x) => x.hero === heroSel)}
				{#if h}
					{@const cp = cardPicks(h)}
					{@const pop = popular(h.paths)}
					{@const win = winning(h.paths)}
					<div class="scrim" role="presentation" on:click|self={() => (heroSel = null)}>
						<div class="panel hdet" role="dialog" aria-modal="true" tabindex="-1" aria-label={heroName(h.hero)}>
							<header class="hdh">{@render face(h.hero, 56)}<div><h2 class="pn">{heroName(h.hero)}</h2><span class="hs"><b>{h.games}</b> picks · <b>{wl(h)}</b> · {pct(h.wins, h.games)}% wins</span></div><button class="btn btn-ghost btn-icon x" on:click={() => (heroSel = null)} aria-label="Close"><Icon name="x" /></button></header>
							<h3 class="t-label">Card picks <small>· taken · won with</small></h3>
							<div class="picks">
								{#each cp.rows as row (row.tier)}
									<span class="tierlbl">{TIER[row.tier]}</span>
									{#each row.cols as col (col.colour)}
										<div class="pk c-{col.colour}">
											{#each col.opts as o (o.i)}
												{@const all = col.opts.reduce((s, x) => s + x.games, 0)}
												<div class="opt" class:hot={all > 0 && o.games === Math.max(...col.opts.map((x) => x.games)) && o.games > 0}>
													<span class="on">{o.name}</span>
													<span class="ob">{all ? pct(o.games, all) : 0}% <small>· {o.games ? `${pct(o.wins, o.games)}% wins` : '—'}</small></span>
												</div>
											{/each}
										</div>
									{/each}
								{/each}
								<span class="tierlbl">IV</span>
								<div class="pk c-purple ult"><div class="opt" class:hot={cp.ult.games > 0}><span class="on">{cp.ultName}</span><span class="ob">{cp.ult.games} game{cp.ult.games === 1 ? '' : 's'} <small>· {cp.ult.games ? `${pct(cp.ult.wins, cp.ult.games)}% wins` : '—'}</small></span></div></div>
							</div>
							<div class="cols tight">
								{#if pop}<div class="best"><h4 class="sub">Most popular build <small>· {pop.games}× · {wl(pop)}</small></h4>{@render pathRow(h.hero, pop.path)}</div>{/if}
								{#if win}<div class="best"><h4 class="sub">Most successful <small>· {pct(win.wins, win.games)}% of {win.games}</small></h4>{@render pathRow(h.hero, win.path)}</div>{/if}
							</div>
							<h3 class="t-label sp">Every build</h3>
							<div class="builds">
								{#each h.paths as b (b.path.cards.join('.') + b.path.ult)}
									<div class="build"><div class="bcol"><span class="bh">{b.by.join(', ')} <small>{b.games > 1 ? `${b.games} games · ` : ''}{wl(b)}</small></span>{@render pathRow(h.hero, b.path)}</div></div>
								{:else}
									<p class="t-small c-muted">No level-ups on record.</p>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{/if}
		{:else if tab === 'records'}
			<!-- ── the silly records ── -->
			<div class="recs">
				{#each league.records as r (r.id)}
					<div class="panel rec">
						<span class="rt">{r.title}</span>
						<span class="rb">{r.blurb}</span>
						<span class="rv">{r.value}</span>
						<span class="rw">{r.who}{#if r.at}<small>&nbsp;· {day(r.at)}</small>{/if}</span>
					</div>
				{/each}
			</div>
			{#if Object.keys(titles).length}
				<h3 class="t-label sp c">Titles held</h3>
				<div class="recs">
					{#each league.players.filter((p) => titles[p.key]) as p (p.key)}
						{#each titles[p.key] as t (t.title)}
							<div class="panel rec small"><span class="rt">{t.title}</span><span class="rb">{t.blurb}</span><span class="rw">{@render who(p.name)}</span></div>
						{/each}
					{/each}
				</div>
			{/if}
		{:else}
			<!-- ── every game ── -->
			<div class="games">
				{#each [...league.games].reverse() as g (g.id)}
					<div class="panel game">
						<div class="gh"><span class="dt">{day(g.at)}</span><span class="gw is-{g.winner}">{teamName(g.winner)} win</span><span class="ty2">{WIN_LABEL[g.type]} · {g.rounds} round{g.rounds === 1 ? '' : 's'} · {g.minutes}m</span></div>
						<div class="gt">
							{#each SIDES as t (t)}
								<div class="side is-{t}" class:won={g.winner === t}>
									{#each teamOf(g, t) as gp (gp.id)}
										<span class="gp">{@render face(gp.hero, 26)}{@render who(gp.name)}{#if gp.kills != null}<small>{gp.kills}/{gp.deaths}/{gp.assists}</small>{/if}</span>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.stats { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); }
	.top { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid var(--brass-line); background: rgba(3, 11, 21, 0.72); }
	.ttl { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 0.04em; color: var(--brass-hi); white-space: nowrap; }
	.samp { padding: 2px 10px; border-radius: 999px; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-dark); background: var(--brass); }
	.tabs { margin-left: auto; display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--well); border: 1px solid var(--hair); }
	.tab { padding: 6px 16px; border-radius: 999px; font-size: 15px; color: var(--ink-2); background: none; border: 0; cursor: pointer; }
	.tab:hover { color: var(--ink); }
	.tab.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.tab.crumb { color: var(--brass-hi); box-shadow: inset 0 0 0 1px var(--brass-line); }
	.body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; scrollbar-color: rgba(216, 179, 106, 0.4) transparent; }
	.body > * { max-width: 1280px; margin-left: auto; margin-right: auto; }
	.note { text-align: center; color: var(--ink-3); margin-top: 20vh; }
	.msg { max-width: 520px; margin-top: 12vh; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
	.fine { font-size: 12px; color: var(--ink-3); margin: 8px 0 0; }
	.fine.c, .c { text-align: center; }
	small { font-size: 0.78em; color: var(--ink-3); font-weight: 400; }
	.sp { margin-top: 16px; }
	h3.t-label { margin: 0 0 10px; }
	h3.t-label.sp { margin-top: 18px; }
	.sub { margin: 12px 0 6px; font-size: 14px; font-weight: 400; color: var(--brass-hi); }

	/* a hero's face in a small round frame */
	.face { flex: none; display: inline-block; width: var(--fs); height: var(--fs); border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--brass-line), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.who { padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: var(--brass-line); text-underline-offset: 3px; }
	.who:hover { color: var(--brass-hi); }

	/* bars: transform, never width */
	.bar { position: relative; display: block; height: 6px; border-radius: 3px; background: rgba(229, 72, 77, 0.35); overflow: hidden; }
	.bar i { position: absolute; inset: 0; background: var(--ready); transform-origin: left; }
	.bar.big { height: 8px; }

	/* rank badges */
	.rk { display: inline-grid; place-items: center; min-width: 34px; height: 34px; padding: 0 6px; border-radius: 10px; font-size: 16px; color: var(--ink-2); background: var(--well); border: 1px solid var(--hair); }
	.rk.gold { color: #2a1d08; background: linear-gradient(180deg, #f6e2a6, #d8b36a); border-color: #fff1c8; }
	.rk.silver { color: #1d2430; background: linear-gradient(180deg, #eef2f7, #aab5c4); border-color: #fff; }
	.rk.bronze { color: #2a1406; background: linear-gradient(180deg, #e8b27c, #b06f3a); border-color: #f6d1a8; }
	.rk :global(.ico) { width: 20px; height: 20px; }
	.rating { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; }
	.rating b { font-size: 34px; font-weight: 400; color: var(--brass-hi); }
	.rating span { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	.rating.sm b { font-size: 24px; }
	.tchips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
	.tchip { padding: 1px 8px; border-radius: 999px; font-size: 12px; color: var(--brass-hi); border: 1px solid var(--brass-line); background: var(--brass-faint); white-space: nowrap; }

	/* the table of players */
	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
	.pcard { display: flex; flex-direction: column; gap: 10px; text-align: left; cursor: pointer; color: inherit; font: inherit; transition: border-color 0.12s, transform 0.12s; }
	.pcard:hover { border-color: var(--brass); transform: translateY(-2px); }
	.pc-top { display: flex; align-items: center; gap: 10px; }
	.pc-name { flex: 1; min-width: 0; font-size: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.wr { display: flex; align-items: center; gap: 10px; }
	.wr .bar { flex: 1; }
	.wr b { font-size: 18px; font-weight: 400; min-width: 44px; text-align: right; }
	.trio { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-2); }
	.trio b { font-weight: 400; font-size: 16px; color: var(--ink); }
	.g { color: var(--ready-hi) !important; }
	.r { color: var(--danger-hi) !important; }
	.mini { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 6px; }
	.mini span { display: flex; flex-direction: column; align-items: center; padding: 6px 4px; border-radius: 8px; background: var(--well); }
	.mini small { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
	.mini b { font-weight: 400; font-size: 16px; }
	.favs { display: flex; align-items: center; gap: 8px; }
	.fav { position: relative; display: inline-flex; }
	.fav small { position: absolute; right: -6px; bottom: -4px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 8px; display: grid; place-items: center; font-size: 11px; color: var(--ink-dark); background: var(--brass); }
	.froles { margin-left: auto; display: flex; gap: 4px; }
	.froles img, .role img { width: 22px; height: 22px; object-fit: contain; }
	.pc-rel { display: flex; justify-content: space-between; gap: 8px; min-height: 18px; font-size: 13px; }
	.pc-rel small, .rel .rk2 { letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; }
	.good { color: var(--ready-hi); }
	.bad { color: var(--danger-hi); }

	/* one player's page */
	.detail { display: flex; flex-direction: column; gap: 14px; }
	.phead { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
	.who-big { align-self: stretch; display: flex; align-items: center; gap: 16px; }
	.namecol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
	.pn { margin: 0; font-size: 36px; font-weight: 400; line-height: 1; }
	.tiles { align-self: stretch; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
	.tile { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); }
	.tile b { font-size: 24px; font-weight: 400; }
	.tile span { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.tile.good b { color: var(--ready-hi); }
	.tile.bad b { color: var(--danger-hi); }
	.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
	.cols.tight { gap: 20px; }
	.kdabig { display: flex; align-items: baseline; gap: 6px; font-size: 22px; color: var(--ink-3); margin-bottom: 10px; }
	.kdabig b { font-size: 38px; font-weight: 400; }
	.kdabig span { margin-left: 10px; font-size: 12px; letter-spacing: 0.1em; }
	.k { color: var(--ready-hi); }
	.d { color: var(--danger-hi); }
	.a { color: var(--blue-hi); }
	.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.st { position: relative; display: flex; flex-direction: column; padding: 8px 10px; border-radius: 8px; background: var(--well); }
	.st span { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
	.st b { font-size: 20px; font-weight: 400; }
	.st i { position: absolute; right: 8px; bottom: 8px; font-style: normal; font-size: 12px; }
	.st i.up::after { content: '▲'; color: var(--ready-hi); }
	.st i.down::after { content: '▼'; color: var(--danger-hi); }
	.chart { display: block; width: 100%; height: 150px; border-radius: 8px; background: var(--well); }
	.chart .base { stroke: var(--brass-line); stroke-dasharray: 6 6; vector-effect: non-scaling-stroke; }
	.chart .line { fill: none; stroke: var(--brass-hi); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
	.chartlbl { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-3); margin-top: 4px; }
	.types { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.ty { display: flex; flex-direction: column; align-items: center; padding: 8px; border-radius: 8px; background: var(--well); }
	.ty span { font-size: 12px; color: var(--ink-3); }
	.ty b { font-size: 22px; font-weight: 400; }
	.rels { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
	.rel { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); color: var(--ink); }
	.rel.good { border-color: rgba(22, 163, 74, 0.5); }
	.rel.bad { border-color: rgba(229, 72, 77, 0.5); }
	.rel .rk2 { color: var(--ink-3); }
	.rel.good .rk2 { color: var(--ready-hi); }
	.rel.bad .rk2 { color: var(--danger-hi); }
	.rel :global(.who), .rel > span:nth-child(2) { font-size: 20px; text-align: left; }
	.rl { font-size: 13px; color: var(--ink-2); }
	.tbl { display: flex; flex-direction: column; gap: 4px; }
	.tr { display: grid; grid-template-columns: 1fr 70px 50px 70px; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; background: var(--raise); font-size: 14px; text-align: left; }
	.tr.hero { grid-template-columns: 28px 1fr 30px 50px 70px; }
	.tr .n { text-align: right; color: var(--ink-2); }
	.tr > :global(.who), .tr > span:first-child { justify-self: start; text-align: left; }
	.tr.th { background: none; padding-top: 0; padding-bottom: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
	.tr.th .n { color: var(--ink-3); }
	.tr .n.k, .tr .n.d { text-align: center; }
	.tr .n.k { color: var(--ready-hi); }
	.tr .n.d { color: var(--danger-hi); }
	.hn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.roles { display: flex; flex-wrap: wrap; gap: 6px; }
	.role { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 4px; border-radius: 999px; background: var(--well); font-size: 13px; }
	.role b { font-weight: 400; color: var(--brass-hi); }
	.builds { display: flex; flex-direction: column; gap: 8px; }
	.build { display: flex; align-items: flex-start; gap: 10px; }
	.bcol { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.bh { font-size: 14px; }

	/* a level-up path: one chip per card, coloured as the card */
	.path { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 4px; }
	.arr { color: var(--ink-3); font-size: 14px; }
	.cc { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 3px; border-radius: 999px; font-size: 12px; white-space: nowrap; color: #fff; background: var(--cc); border: 1px solid rgba(255, 255, 255, 0.25); }
	.cc b { display: inline-grid; place-items: center; min-width: 18px; height: 16px; padding: 0 3px; border-radius: 8px; font-size: 10px; font-weight: 400; background: rgba(0, 0, 0, 0.35); }
	.c-red { --cc: #a3282c; }
	.c-blue { --cc: #1f5fb0; }
	.c-green { --cc: #2b7a3a; }
	.c-purple { --cc: #6d3a9c; }

	.hist { display: flex; flex-direction: column; gap: 4px; }
	.mrow { display: grid; grid-template-columns: 26px 54px 28px minmax(110px, 1fr) 64px 110px minmax(160px, 2fr) 44px; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; background: var(--raise); font-size: 14px; }
	.res { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; font-size: 13px; color: #fff; background: #8f2c2f; }
	.res.w { background: #1c7a3d; }
	.dt { color: var(--ink-3); font-size: 13px; }
	.kda3 { text-align: center; }
	.ty2 { color: var(--ink-2); font-size: 13px; }
	.vs { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
	.dl { text-align: right; }
	.dl.up { color: var(--ready-hi); }
	.dl.down { color: var(--danger-hi); }

	/* heroes */
	.heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px; }
	.hcard { display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto auto; gap: 6px 12px; align-items: center; text-align: left; cursor: pointer; color: inherit; font: inherit; padding: 12px; }
	.hcard:hover, .hcard.on { border-color: var(--brass); }
	.hcard > .face { grid-row: 1; }
	.hcol { display: flex; flex-direction: column; min-width: 0; }
	.hcol .hn { font-size: 18px; }
	.hs { font-size: 13px; color: var(--ink-2); }
	.hs b { font-weight: 400; color: var(--ink); }
	.hp { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hcard > .bar { grid-column: 1 / -1; }
	.hpath { grid-column: 1 / -1; }
	.scrim { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; background: rgba(3, 11, 21, 0.72); }
	.hdet { width: min(980px, 100%); max-height: 100%; overflow-y: auto; }
	.hdh { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
	.hdh > div { flex: 1; }
	.hdh .pn { font-size: 30px; }
	.picks { display: grid; grid-template-columns: 30px repeat(3, 1fr); gap: 6px; align-items: stretch; }
	.tierlbl { display: grid; place-items: center; color: var(--brass-hi); font-size: 16px; }
	.pk { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 8px; background: color-mix(in srgb, var(--cc) 22%, transparent); border: 1px solid color-mix(in srgb, var(--cc) 60%, transparent); }
	.pk.ult { grid-column: 2 / -1; }
	.opt { display: flex; flex-direction: column; padding: 4px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.25); border: 1px solid transparent; }
	.opt.hot { border-color: var(--brass); background: rgba(216, 179, 106, 0.12); }
	.opt .on { font-size: 14px; }
	.opt .ob { font-size: 13px; color: var(--ink-2); }
	.best { padding: 10px; border-radius: 10px; background: var(--well); }
	.best .sub { margin-top: 0; }

	/* records */
	.recs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
	.rec { display: flex; flex-direction: column; gap: 4px; text-align: center; align-items: center; }
	.rt { font-size: 22px; color: var(--brass-hi); }
	.rb { font-size: 13px; color: var(--ink-3); }
	.rv { font-size: 28px; margin-top: 4px; }
	.rw { font-size: 15px; color: var(--ink-2); }
	.rec.small .rt { font-size: 18px; }

	/* games */
	.games { display: flex; flex-direction: column; gap: 10px; }
	.gh { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
	.gw { font-size: 18px; }
	.gw.is-orange { color: var(--orange-hi); }
	.gw.is-blue { color: var(--blue-hi); }
	.gt { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.side { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--hair); opacity: 0.75; }
	.side.is-orange { background: var(--orange-glass); }
	.side.is-blue { background: var(--blue-glass); }
	.side.won { opacity: 1; border-color: var(--brass-line); }
	.gp { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }

	@media (max-width: 1000px) {
		.cols { grid-template-columns: 1fr; }
		.tiles { grid-template-columns: repeat(4, 1fr); }
		.mrow { grid-template-columns: 26px 48px 28px 1fr 60px 44px; }
		.mrow .ty2, .mrow .vs { display: none; }
	}
	@media (max-width: 760px) {
		.top { flex-wrap: wrap; gap: 8px 10px; padding: 8px 12px; }
		.ttl { font-size: 22px; }
		.hidem { display: none; }
		.tabs { margin-left: 0; width: 100%; justify-content: space-between; }
		.tab { flex: 1; padding: 6px 4px; font-size: 14px; }
		.body { padding: 12px; }
		.body :global(.panel) { padding: 14px; }
		.cards, .heroes, .recs { grid-template-columns: 1fr; }
		.pn { font-size: 28px; }
		.tiles { grid-template-columns: repeat(4, 1fr); gap: 6px; }
		.tile b { font-size: 20px; }
		.tiles .tile:nth-child(n + 5) { display: none; }
		.grid3 { grid-template-columns: 1fr 1fr; }
		.tr { grid-template-columns: 1fr 60px 44px 50px; font-size: 13px; }
		.tr.hero { grid-template-columns: 28px 1fr 24px 44px 50px; }
		.picks { grid-template-columns: 22px repeat(3, 1fr); gap: 4px; }
		.opt { padding: 3px 5px; }
		.opt .on { font-size: 12px; }
		.opt .ob { font-size: 11px; }
		.gt { grid-template-columns: 1fr; }
		.rating b { font-size: 28px; }
	}
</style>
