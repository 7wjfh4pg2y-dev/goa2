<script lang="ts">
	// THE HALL OF RECORDS — every finished game, added up (league.ts), as a stats site (2026-10-12 redesign, the
	// user's ask: like a MOBA stats page, its own look — `$lib/hall/hall.css`, scoped under `.hall`).
	// Two sets of player records: CURRENT (the online games in `goa2_games`) and LEGACY (the table games, from the
	// reports in `goa2_reports`), each with its own ratings and awards; the HEROES count both.
	// Tabs: Overview · Players (leaderboard / rating over time / rivalries → a player's page) · Heroes (the table →
	// a hero's page) · Matches · Awards · Reports.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { pushState } from '$app/navigation';
	import { page } from '$app/stores';
	import { goBack } from '$lib/nav';
	import { supabase } from '$lib/supabase';
	import {
		buildLeague, useAliases, leagueOf, gameOfReport, titlesOf, rowOfSelect, LEAGUE_SELECT, WIN_LABEL,
		type League, type PlayerAgg, type HeroAgg, type GameRowIn, type LeagueGame
	} from '$lib/league';
	import { heroById, portraitCss, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import { colorHex } from '$lib/match';
	import { heroRanks, overview, heroPlayers } from '$lib/hallstats';
	import OverTime from '$lib/hall/OverTime.svelte';
	import Rivalries from '$lib/hall/Rivalries.svelte';
	import AwardsHall from '$lib/hall/AwardsHall.svelte';
	import Reports from '$lib/hall/Reports.svelte';
	import HeroPage from '$lib/hall/HeroPage.svelte';
	import PlayerPage from '$lib/hall/PlayerPage.svelte';
	import MatchRow from '$lib/hall/MatchRow.svelte';
	import { role } from '$lib/role';
	import { REPORT_TABLE, reportOfRow, type Report } from '$lib/reports';
	import { loadAliases, resolveAliases } from '$lib/aliases';
	import { globalOf, globalWin, globalGames, GLOBAL_AS_OF } from '$lib/globalstats';
	import '$lib/hall/hall.css';

	type Tab = 'overview' | 'players' | 'heroes' | 'matches' | 'awards' | 'reports';
	const TABS: [Tab, string][] = [['overview', 'Overview'], ['players', 'Players'], ['heroes', 'Heroes'], ['matches', 'Matches'], ['awards', 'Awards'], ['reports', 'Reports']];
	// GMs only for now (the soft admin gate in role.ts; the link is in the GM tools)
	let phase: 'loading' | 'ready' | 'empty' | 'error' | 'locked' = 'loading';
	let errMsg = '';
	let currentL: League | null = null; // the online games
	let legacyL: League | null = null; // the table games (reports)
	let allL: League | null = null; // both (the Total scope)
	let rows: GameRowIn[] = []; // the raw games (the reports are drafted from them)
	// which records: Current (online), Legacy (table games) or Total (both) — remembered per browser
	type Scope = 'current' | 'legacy' | 'total';
	let scope: Scope = 'current';
	try { const v = localStorage.getItem('goa2-hall-scope'); if (v === 'legacy' || v === 'total') scope = v; } catch { /* ignore */ }
	function setScope(x: Scope) { scope = x; sel = null; try { localStorage.setItem('goa2-hall-scope', x); } catch { /* ignore */ } }
	$: league = scope === 'legacy' ? legacyL : scope === 'total' ? allL : currentL;
	$: titles = league ? titlesOf(league) : ({} as Record<string, { title: string; blurb: string }[]>);
	let tab: Tab = 'overview';
	let sel: string | null = null; // the player whose page is open
	let heroSel: string | null = null; // the hero whose page is open
	let body: HTMLElement;

	function use(got: GameRowIn[], table: Report[], names: Record<string, string>) {
		rows = got;
		useAliases(names); // the GM tools' merged names (aliases.ts)
		currentL = buildLeague(got);
		const legacy = table.filter((r) => r.kind === 'irl').map((r) => { try { return gameOfReport(r) } catch { return null } }).filter((g): g is LeagueGame => !!g);
		legacyL = leagueOf(legacy);
		allL = leagueOf([...currentL.games, ...legacy]);
		phase = allL.games.length ? 'ready' : 'empty';
	}
	// the table games: every saved report of kind 'irl' (no table yet / no access → none)
	async function loadTable(): Promise<Report[]> {
		try {
			const { data, error } = await supabase.from(REPORT_TABLE).select('id,kind,game_id,played_on,data,updated_at').eq('kind', 'irl');
			if (error) return [];
			return (data ?? []).map(reportOfRow).filter((r): r is Report => !!r && !r.deleted);
		} catch { return []; }
	}
	async function load() {
		if ($role !== 'admin') { phase = 'locked'; return; }
		try {
			const got: GameRowIn[] = [];
			const table = loadTable();
			for (let from = 0; ; from += 1000) {
				const { data, error } = await supabase.from('goa2_games').select(LEAGUE_SELECT).order('ended_at', { ascending: true }).range(from, from + 999);
				if (error) throw error;
				got.push(...(data ?? []).map(rowOfSelect));
				if (!data || data.length < 1000) break;
			}
			use(got, await table, resolveAliases((await loadAliases()).rows));
		} catch (e) {
			errMsg = (e as { message?: string })?.message ?? String(e);
			phase = 'error';
		}
	}
	onMount(load);

	const top = () => body?.scrollTo(0, 0);
	// every view (tab, player page, hero page) is its own history step: Back — the browser's or the pages' — goes one view back
	type View = { tab: Tab; sel: string | null; heroSel: string | null };
	const FIRST: View = { tab: 'overview', sel: null, heroSel: null };
	function show(v: View) {
		if (v.tab === tab && v.sel === sel && v.heroSel === heroSel) return;
		({ tab, sel, heroSel } = v);
		top();
		try { pushState('', { hall: v }); } catch { /* router not ready */ }
	}
	function seen(v: View | undefined) {
		const w = v ?? FIRST;
		if (w.tab === tab && w.sel === sel && w.heroSel === heroSel) return;
		({ tab, sel, heroSel } = w);
		top();
	}
	$: seen(($page.state as { hall?: View }).hall);
	const back = () => history.back();
	const go = (t: Tab) => show({ tab: t, sel: null, heroSel: null });
	const openPlayer = (key: string) => show({ tab: 'players', sel: key, heroSel: null });
	const openHero = (id: string) => show({ tab: 'heroes', sel: null, heroSel: id });
	$: player = sel && league ? league.players.find((p) => p.key === sel) ?? null : null;
	$: hero = heroSel && league ? league.heroes.find((h) => h.hero === heroSel) ?? null : null;
	$: ranks = league ? heroRanks(league.heroes) : new Map();
	$: rankOf = (key: string) => (league?.players.findIndex((p) => p.key === key) ?? -1) + 1;

	// ── formatters ──
	const heroName = (id: string) => heroById(id)?.name ?? id;
	const pct = (w: number, g: number) => (g ? (100 * w) / g : 0);
	const f1 = (n: number) => n.toFixed(1);
	const avg = (n: number, g: number) => (g ? (n / g).toFixed(1) : '–');
	const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
	const day = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
	const favHeroes = (p: PlayerAgg, n = 3) => Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins).slice(0, n).map(([h]) => h);
	const kdr = (p: PlayerAgg) => (p.kdaGames ? p.kills / Math.max(1, p.deaths) : -1);
	const pcol = (p: PlayerAgg) => (p.color ? colorHex(p.color) : 'var(--mu2)');

	// ── the players: sortable leaderboard (or the rating over time / rivalries) ──
	let pq = '', psort: 'rating' | 'games' | 'win' | 'kd' | 'kdm' | 'name' = 'rating', pflip = false, pview: 'board' | 'time' | 'rivals' = 'board';
	// a click on the sorted column flips its order; a click on another column sorts by it (its natural order first)
	const sortP = (k: string) => { if (psort === k) pflip = !pflip; else { psort = k as typeof psort; pflip = false; } };
	const sortH = (k: string) => { if (hsort === k) hflip = !hflip; else { hsort = k as typeof hsort; hflip = false; } };
	const flip = <T,>(xs: T[], f: boolean) => (f ? [...xs].reverse() : xs);
	const perG = (n: number, g: number) => (g ? n / g : -1);
	const has = (txt: string, q: string) => txt.toLowerCase().includes(q.trim().toLowerCase());
	$: rankByRating = new Map((league?.players ?? []).map((p, i) => [p.key, i + 1]));
	$: plist = flip((league?.players ?? []).filter((p) => !pq.trim() || has(p.name, pq)).sort((a, b) =>
		psort === 'games' ? b.games - a.games || b.rating - a.rating
		: psort === 'win' ? pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games
		: psort === 'kd' ? kdr(b) - kdr(a)
		: psort === 'kdm' ? perG(b.kills, b.kdaGames) - perG(a.kills, a.kdaGames) || perG(b.minions, b.kdaGames) - perG(a.minions, a.kdaGames)
		: psort === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		: b.rating - a.rating), pflip);
	// ── the heroes: sortable table (the scope's games) ──
	let hq = '', hsort: 'picks' | 'win' | 'kdm' | 'gold' | 'impact' | 'global' | 'name' = 'picks', hflip = false;
	// the community site's global win rate (globalstats.ts; shown with a GLOBAL tag), −1 = none
	const gwr = (id: string) => { const g = globalOf(id); return g ? globalWin(g) : -1; };
	$: hlist = flip((league?.heroes ?? []).filter((h) => !hq.trim() || has(heroName(h.hero), hq) || (heroById(h.hero)?.traits ?? []).some((t) => has(TRAIT_LABELS[t as Trait], hq))).sort((a, b) =>
		hsort === 'win' ? pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games
		: hsort === 'kdm' ? perG(b.kills, b.kdaGames) - perG(a.kills, a.kdaGames) || perG(b.minions, b.mGames) - perG(a.minions, a.mGames)
		: hsort === 'gold' ? (b.coinGames ? b.coins / b.coinGames : -1) - (a.coinGames ? a.coins / a.coinGames : -1)
		: hsort === 'impact' ? (b.impact ?? -999) - (a.impact ?? -999)
		: hsort === 'global' ? gwr(b.hero) - gwr(a.hero)
		: hsort === 'name' ? heroName(a.hero).localeCompare(heroName(b.hero))
		: b.games - a.games || b.wins - a.wins), hflip);
	// each hero's best player: most games AND the best success (hallstats byMastery)
	$: masters = league ? heroPlayers(league.games) : new Map();
	$: maxPick = Math.max(1, ...(league?.heroes ?? []).map((h) => h.games));
	$: totalGames = league?.games.length ?? 0;
	// ── the matches ──
	let gq = '', glimit = 30;
	$: glist = [...(league?.games ?? [])].reverse().filter((g) => !gq.trim() || g.players.some((p) => has(p.name, gq) || has(heroName(p.hero), gq)));
	// ── the overview ──
	$: ov = league ? overview(league) : null;
	$: bestHeroes = [...(league?.heroes ?? [])].filter((h) => h.games >= 3).sort((a, b) => pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games).slice(0, 5);
	$: popHeroes = [...(league?.heroes ?? [])].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 5);
</script>

<svelte:head><title>GoA2 · Hall of Records</title></svelte:head>
<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) { if (heroSel || sel) back(); } }} />

{#snippet th(label: string, key: string, cur: string, set: (k: string) => void, right = false, flipped = false)}
	<th class="sortable" class:on={cur === key} class:flipped={cur === key && flipped} class:rt={right} on:click={() => set(key)} title="Sort (click again to reverse)">{label}</th>
{/snippet}
{#snippet winCell(w: number, g: number)}
	{@const r = pct(w, g)}
	<td class="barcell"><span class="bv"><b class:up={r >= 50} class:down={r < 50}>{f1(r)}%</b><span class="bar thin half" class:gr={r >= 50} class:rd={r < 50}><i style="--v:{g ? w / g : 0}"></i></span></span></td>
{/snippet}
{#snippet heroMini(h: HeroAgg, val: string, good: boolean | null)}
	<button class="hm" on:click={() => openHero(h.hero)}>
		<span class="face" style="--fs:36px; {portraitCss(h.hero)}"></span>
		<span class="hmn"><b>{heroName(h.hero)}</b><small>{h.games} games · {h.wins}–{h.games - h.wins}</small></span>
		<em class:up={good === true} class:down={good === false}>{val}</em>
	</button>
{/snippet}

<div class="hall tide">
	<header class="hh">
		<div class="hbar">
			<a class="home" href={base + '/?at=adminhub'} on:click|preventDefault={() => goBack('adminhub')} title="Back">←</a>
			<a class="home" href={base + '/'} title="Home" aria-label="Home"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg></a>
			<span class="brand"><span class="logo">◆</span><b>Hall of Records</b><small>Guards of Atlantis II</small></span>
			<nav class="tabs" aria-label="Sections">
				{#each TABS as [k, l] (k)}<button class:on={tab === k} on:click={() => go(k)}>{l}</button>{/each}
			</nav>
			<span class="sp"></span>
			{#if tab !== 'reports'}
				<span class="seg" role="group" aria-label="Player records">
					<button class:on={scope === 'current'} on:click={() => setScope('current')} title="The games played on the app">Current</button>
					<button class:on={scope === 'legacy'} on:click={() => setScope('legacy')} title="The table games (from the reports)">Legacy</button>
					<button class:on={scope === 'total'} on:click={() => setScope('total')} title="Every game: online and table">Total</button>
				</span>
			{/if}
		</div>
	</header>

	<main class="hbody" bind:this={body}>
		<div class="wrap">
			{#if phase === 'loading'}
				<p class="note">Opening the records…</p>
			{:else if phase === 'locked'}
				<section class="card msg"><h3>GMs only</h3><p class="muted">Sign in as Admin to open the Hall of Records.</p><a class="btn2" href={base + '/'}>Home</a></section>
			{:else if tab === 'reports'}
				<Reports {rows} />
			{:else if phase === 'error'}
				<section class="card msg"><h3>The records are locked</h3><p class="muted">Couldn't read the games table ({errMsg}).</p></section>
			{:else if tab === 'heroes' && league && league.games.length && phase === 'ready'}
				{#if hero}
					<HeroPage h={hero} games={league.games} rank={ranks.get(hero.hero) ?? null} onPlayer={openPlayer} onHero={openHero} onBack={back} />
				{:else}
					<div class="tbar">
						<label class="search"><span>⌕</span><input placeholder="Search heroes or roles…" bind:value={hq} /></label>
						<span class="muted cnt">{hlist.length} heroes · {totalGames} games</span>
					</div>
					<section class="card flush">
						<div class="scrollx">
							<table class="tbl heroes">
								<thead><tr>
									{@render th('Hero', 'name', hsort, sortH, false, hflip)}
									{@render th('Picks', 'picks', hsort, sortH, false, hflip)}
									<th>Pick rate</th>
									{@render th('Win rate', 'win', hsort, sortH, false, hflip)}
									{@render th('K / D / M', 'kdm', hsort, sortH, true, hflip)}
									{@render th('Gold', 'gold', hsort, sortH, true, hflip)}
									{@render th('Impact', 'impact', hsort, sortH, true, hflip)}
									<th class="sortable rt" class:on={hsort === 'global'} class:flipped={hsort === 'global' && hflip} on:click={() => sortH('global')} title="Worldwide win rate ({GLOBAL_AS_OF}) — not our games"><span class="gtag">GLOBAL</span> Win</th>
									<th title="Most games with the best success on this hero">Top player</th>
								</tr></thead>
								<tbody>
									{#each hlist as h (h.hero)}
										{@const top1 = masters.get(h.hero)?.[0]}
										{@const gw = gwr(h.hero)}
										<tr on:click={() => openHero(h.hero)}>
											<td><span class="hcell"><span class="face" style="--fs:38px; {portraitCss(h.hero)}"></span><span><b>{heroName(h.hero)}</b><small class="tr">{(heroById(h.hero)?.traits ?? []).map((t) => TRAIT_LABELS[t as Trait]).join(' · ')}</small></span></span></td>
											<td class="rt">{h.games}</td>
											<td class="barcell"><span class="bv"><b class="b">{f1(pct(h.games, totalGames))}%</b><span class="bar thin"><i style="--v:{h.games / maxPick}"></i></span></span></td>
											{@render winCell(h.wins, h.games)}
											<td class="rt">{h.kdaGames ? `${avg(h.kills, h.kdaGames)} / ${avg(h.deaths, h.kdaGames)} / ${avg(h.minions, h.mGames)}` : '–'}</td>
											<td class="rt au">{avg(h.coins, h.coinGames)}</td>
											<td class="rt" class:up={(h.impact ?? 0) > 0} class:down={(h.impact ?? 0) < 0}>{h.impact == null ? '–' : `${h.impact > 0 ? '+' : ''}${h.impact}`}</td>
											<td class="rt" class:up={gw >= 50} class:down={gw >= 0 && gw < 50} title={gw >= 0 ? `${globalGames(globalOf(h.hero)!)} games worldwide` : ''}>{gw >= 0 ? `${f1(gw)}%` : '–'}</td>
											<td>{#if top1}<button class="linky tp" on:click|stopPropagation={() => openPlayer(top1.key)}>{top1.name}</button> <small class="muted">{top1.wins}–{top1.games - top1.wins}</small>{/if}</td>
										</tr>
									{:else}<tr><td colspan="9" class="muted">No hero matches.</td></tr>{/each}
								</tbody>
							</table>
						</div>
					</section>
					<p class="fine">Impact = how much better its players do on it than they do overall (win-rate points; players with 2+ games).</p>
				{/if}
			{:else if phase === 'empty' || !league || !league.games.length}
				<section class="card msg">
					{#if scope === 'legacy' && phase !== 'empty'}
						<h3>No legacy games yet</h3><p class="muted">Table games come from the Reports tab: every table game with a winner counts here (a cancelled or void one doesn't).</p>
					{:else}
						<h3>No games on record yet</h3><p class="muted">A game lands here when it is won, was played from the first turn, and had at least two people at the table.</p>
					{/if}
				</section>
			{:else if tab === 'players' && player}
				<PlayerPage p={player} {league} rank={rankOf(player.key)} titles={titles[player.key] ?? []} onPlayer={openPlayer} onHero={openHero} onBack={back} />
			{:else if tab === 'players'}
				<div class="tbar">
					<span class="seg">
						<button class:on={pview === 'board'} on:click={() => (pview = 'board')}>Leaderboard</button>
						<button class:on={pview === 'time'} on:click={() => (pview = 'time')}>Rating over time</button>
						<button class:on={pview === 'rivals'} on:click={() => (pview = 'rivals')}>Rivalries</button>
					</span>
					{#if pview === 'board'}<label class="search grow"><span>⌕</span><input placeholder="Search players…" bind:value={pq} /></label>{/if}
				</div>
				{#if pview === 'time'}
					<div class="legacyui"><OverTime {league} onOpen={openPlayer} /></div>
				{:else if pview === 'rivals'}
					<div class="legacyui"><Rivalries {league} onOpen={openPlayer} /></div>
				{:else}
					<section class="card flush">
						<div class="scrollx">
							<table class="tbl board">
								<thead><tr>
									<th class="rt">#</th>
									{@render th('Player', 'name', psort, sortP, false, pflip)}
									{@render th('Rating', 'rating', psort, sortP, true, pflip)}
									{@render th('Games', 'games', psort, sortP, true, pflip)}
									{@render th('Win rate', 'win', psort, sortP, false, pflip)}
									{@render th('K / D / M', 'kdm', psort, sortP, true, pflip)}
									{@render th('K/D', 'kd', psort, sortP, true, pflip)}
									<th class="rt">Streak</th>
									<th>Heroes</th>
								</tr></thead>
								<tbody>
									{#each plist as p (p.key)}
										{@const r = rankByRating.get(p.key) ?? 0}
										<tr on:click={() => openPlayer(p.key)}>
											<td class="rt"><span class="rk" class:g1={r === 1} class:g2={r === 2} class:g3={r === 3}>{r}</span></td>
											<td><span class="pcell"><i class="pdot" style="background:{pcol(p)}"></i><b>{p.name}</b>{#if (titles[p.key] ?? []).length}<span class="aw" title={(titles[p.key] ?? []).map((t) => t.title).join(', ')}>🏅{(titles[p.key] ?? []).length}</span>{/if}</span></td>
											<td class="rt"><b class="au">{p.rating}</b></td>
											<td class="rt">{p.games}</td>
											{@render winCell(p.wins, p.games)}
											<td class="rt">{p.kdaGames ? `${avg(p.kills, p.kdaGames)} / ${avg(p.deaths, p.kdaGames)} / ${avg(p.minions, p.kdaGames)}` : '–'}</td>
											<td class="rt">{p.kdaGames ? (p.kills / Math.max(1, p.deaths)).toFixed(2) : '–'}</td>
											<td class="rt" class:up={p.streak > 0} class:down={p.streak < 0}>{p.streak > 0 ? `W${p.streak}` : p.streak < 0 ? `L${-p.streak}` : '–'}</td>
											<td><span class="hf">{#each favHeroes(p) as h (h)}<span class="face" style="--fs:28px; {portraitCss(h)}" title={heroName(h)}></span>{/each}</span></td>
										</tr>
									{:else}<tr><td colspan="9" class="muted">Nobody by that name.</td></tr>{/each}
								</tbody>
							</table>
						</div>
					</section>
				{/if}
			{:else if tab === 'awards'}
				<div class="legacyui"><AwardsHall {league} onOpen={openPlayer} /></div>
			{:else if tab === 'matches'}
				<div class="tbar"><label class="search grow"><span>⌕</span><input placeholder="Search by player or hero…" bind:value={gq} /></label><span class="muted cnt">{glist.length} games</span></div>
				<section class="card flush mlist">
					{#each glist.slice(0, glimit) as g (g.id)}<MatchRow {g} onPlayer={openPlayer} onHero={openHero} onReport={g.legacy ? null : () => go('reports')} />{:else}<p class="muted pad">No game matches.</p>{/each}
				</section>
				{#if glist.length > glimit}<button class="btn2 more" on:click={() => (glimit += 30)}>Show more ({glist.length - glimit} left)</button>{/if}
			{:else if ov}
				<!-- ── the overview ── -->
				<div class="kpis">
					<div class="card kpi"><span>Games</span><b>{ov.games}</b><small>{day(ov.first)} – {day(ov.last)}</small></div>
					<div class="card kpi"><span>Players</span><b>{ov.players}</b><small>{ov.heroes} heroes played</small></div>
					<div class="card kpi"><span>Avg game</span><b>{ov.avgMinutes != null ? hm(ov.avgMinutes) : '–'}</b><small>{ov.avgRounds != null ? `${ov.avgRounds} rounds` : 'no times for table games'}</small></div>
					<div class="card kpi"><span>Kills / game</span><b>{ov.killsPerGame ?? '–'}</b><small>hero defeats</small></div>
					<div class="card kpi wide">
						<span>Side wins</span>
						<div class="sw"><b class="team-o">{ov.sideWins.orange}</b><span class="swb"><i class="o" style="flex:{ov.sideWins.orange || 0.0001}"></i><i class="b2" style="flex:{ov.sideWins.blue || 0.0001}"></i></span><b class="team-b">{ov.sideWins.blue}</b></div>
						<small><span class="team-o">Atlanteans</span> {Math.round(pct(ov.sideWins.orange, ov.games))}% · <span class="team-b">Titans</span> {Math.round(pct(ov.sideWins.blue, ov.games))}%</small>
					</div>
				</div>
				<div class="row c3">
					<section class="card">
						<div class="ch">Top players <button class="r linky more2" on:click={() => go('players')}>All →</button></div>
						{#each league.players.slice(0, 6) as p, i (p.key)}
							<button class="prow" on:click={() => openPlayer(p.key)}>
								<span class="rk" class:g1={i === 0} class:g2={i === 1} class:g3={i === 2}>{i + 1}</span>
								<span class="hf">{#each favHeroes(p, 1) as h (h)}<span class="face" style="--fs:34px; {portraitCss(h)}"></span>{/each}</span>
								<span class="hmn"><b>{p.name}</b><small>{p.wins}–{p.losses} · {Math.round(pct(p.wins, p.games))}%</small></span>
								<em class="au">{p.rating}</em>
							</button>
						{/each}
					</section>
					<section class="card">
						<div class="ch">Best heroes <small>win rate · 3+ games</small><button class="r linky more2" on:click={() => go('heroes')}>All →</button></div>
						{#each bestHeroes as h (h.hero)}{@render heroMini(h, `${f1(pct(h.wins, h.games))}%`, pct(h.wins, h.games) >= 50)}{:else}<p class="muted">Not enough games yet.</p>{/each}
					</section>
					<section class="card">
						<div class="ch">Most picked <small>every game</small></div>
						{#each popHeroes as h (h.hero)}{@render heroMini(h, `${f1(pct(h.games, totalGames))}%`, null)}{/each}
					</section>
				</div>
				<div class="row c21">
					<section class="card flush">
						<div class="ch padh">Recent matches <button class="r linky more2" on:click={() => go('matches')}>All →</button></div>
						{#each [...league.games].reverse().slice(0, 6) as g (g.id)}<MatchRow {g} onPlayer={openPlayer} onHero={openHero} />{/each}
					</section>
					<section class="card">
						<div class="ch">How games end</div>
						<div class="ends">
							{#each (['throne', 'final', 'life', 'other'] as const) as t (t)}
								{#if ov.byType[t]}<div class="end"><span>{t === 'other' ? 'Other / table' : WIN_LABEL[t]}</span><span class="bar"><i style="--v:{ov.byType[t] / Math.max(1, ov.games)}"></i></span><b>{ov.byType[t]}</b></div>{/if}
							{/each}
						</div>
						<div class="sub sp2">Records held</div>
						<div class="recs">
							{#each league.awards.filter((a) => !a.hidden && !a.extra && a.holders.length).slice(0, 6) as a (a.id)}
								<button class="rec" on:click={() => go('awards')}><span>{a.title}</span><b>{a.holders.map((h) => h.name).join(', ')}</b><small>{a.value}</small></button>
							{/each}
						</div>
					</section>
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
	.hall { position: fixed; inset: 0; display: flex; flex-direction: column; }
	.hh { flex: none; border-bottom: 1px solid var(--ln); background: rgba(10, 12, 16, 0.96); }
	.hbar { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; gap: 18px; padding: 0 20px; height: 60px; }
	.home { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--ln); color: var(--tx2); text-decoration: none; font-size: 16px; }
	.home:hover { border-color: var(--bl); color: var(--tx); }
	.brand { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
	.brand .logo { color: var(--au); font-size: 15px; }
	.brand b { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
	.brand small { font-size: 12px; color: var(--mu); }
	.tabs { display: flex; align-self: stretch; gap: 2px; }
	.tabs button { position: relative; padding: 0 14px; border: 0; background: none; color: var(--mu); font-size: 14.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
	.tabs button:hover { color: var(--tx); }
	.tabs button.on { color: var(--tx); }
	.tabs button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--bl); }
	.sp { flex: 1; }
	.hbody { flex: 1; min-height: 0; overflow-y: auto; scrollbar-color: #2a313c transparent; }
	.wrap { max-width: 1400px; margin: 0 auto; padding: 22px 20px 60px; }
	.note { text-align: center; color: var(--mu); margin-top: 20vh; }
	.msg { max-width: 520px; margin: 12vh auto 0; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
	.msg h3 { margin: 0; }
	.msg p { margin: 0; }
	.tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
	.tbar .search { width: 320px; max-width: 100%; }
	.tbar .grow { flex: 1; }
	.cnt { font-size: 13px; }
	.card.flush { padding: 6px 0; }
	.card.flush .scrollx { margin: 0; padding: 0 10px; }
	.padh { padding: 12px 20px 2px; }
	.pad { padding: 16px 20px; }
	.more { margin: 16px auto 0; display: flex; }
	.more2 { font-size: 13px; font-weight: 600; color: var(--bl); }
	/* tables */
	.hcell { display: flex; align-items: center; gap: 12px; }
	.hcell > span:last-child { display: flex; flex-direction: column; gap: 4px; }
	.hcell b { font-size: 14.5px; }
	.tr { font-size: 12px; color: var(--mu); }
	.heroes td:last-child { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
	.tp { font-weight: 600; }
	.rk { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 6px; font-size: 12.5px; font-weight: 800; background: var(--p3); color: var(--tx2); }
	.rk.g1 { background: var(--au); color: #241a00; } .rk.g2 { background: #c9d1dc; color: #10141a; } .rk.g3 { background: #cd8a4f; color: #1f1005; }
	.pcell { display: inline-flex; align-items: center; gap: 9px; }
	.pcell b { font-size: 14.5px; }
	.pdot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
	.aw { font-size: 12px; color: var(--au); }
	.hf { display: inline-flex; gap: 4px; }
	/* overview */
	.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.6fr); gap: 16px; margin-bottom: 16px; }
	.kpi { display: flex; flex-direction: column; gap: 6px; }
	.kpi > span { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mu); }
	.kpi > b { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
	.kpi > small { font-size: 12.5px; color: var(--mu); }
	.sw { display: flex; align-items: center; gap: 12px; }
	.sw b { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.swb { flex: 1; display: flex; height: 10px; border-radius: 3px; overflow: hidden; gap: 2px; }
	.swb .o { background: var(--or); } .swb .b2 { background: var(--ti); }
	.prow, :global(.hall) .hm { width: 100%; display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 12px; padding: 8px 0; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: none; color: inherit; text-align: left; cursor: pointer; }
	.prow:last-child { border-bottom: 0; }
	.prow:hover, :global(.hall) .hm:hover { background: rgba(255, 255, 255, 0.02); }
	:global(.hall) .hm { grid-template-columns: auto 1fr auto; }
	.hmn, :global(.hall) .hmn { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	:global(.hall) .hmn b { font-size: 14.5px; }
	:global(.hall) .hmn small { font-size: 12px; color: var(--mu); }
	.prow em, :global(.hall) .hm em { font-style: normal; font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.ends { display: flex; flex-direction: column; gap: 10px; }
	.end { display: grid; grid-template-columns: 110px 1fr 34px; align-items: center; gap: 10px; font-size: 13.5px; }
	.end b { text-align: right; }
	.sp2 { margin-top: 20px; }
	.recs { display: flex; flex-direction: column; gap: 8px; }
	.rec { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 10px; padding: 8px 10px; border-radius: 8px; border: 0; border-left: 3px solid var(--au); background: var(--p2); color: inherit; text-align: left; cursor: pointer; }
	.rec span { font-size: 12px; font-weight: 700; color: var(--au); text-transform: uppercase; letter-spacing: 0.04em; }
	.rec b { grid-row: 2; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rec small { grid-row: 1 / 3; grid-column: 2; align-self: center; font-size: 13px; color: var(--tx2); }
	/* the older components (awards, reports, rating over time, rivalries) keep their own look on a dark stage */
	.legacyui { font-family: inherit; }
	@media (max-width: 1100px) {
		.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.kpi.wide { grid-column: 1 / -1; }
		.brand small { display: none; }
	}
	@media (max-width: 760px) {
		.hbar { flex-wrap: wrap; height: auto; gap: 8px 10px; padding: 8px 12px; }
		.tabs { order: 3; width: 100%; overflow-x: auto; height: 40px; }
		.tabs button { padding: 0 10px; }
		.wrap { padding: 14px 12px 40px; }
		.kpi > b { font-size: 24px; }
	}
</style>
