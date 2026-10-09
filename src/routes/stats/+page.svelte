<script lang="ts">
	// THE HALL OF RECORDS — every finished game in `goa2_games`, added up (league.ts): the table of players
	// (rating, record, streaks, K/D/A, favourite heroes), each player's page (friends and foes, builds,
	// match history), the heroes and their level-up paths, the silly records, and the PLAYER LOG (everyone who has
	// played a recorded game, A–Z, each with their whole record and every match in full).
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import {
		buildLeague, titlesOf, nemesisOf, victimOf, rivalOf, bestMateOf, worstMateOf, rowOfSelect,
		LEAGUE_SELECT, WIN_TYPES, WIN_LABEL, START_RATING,
		type League, type PlayerAgg, type HeroAgg, type MatchLine, type Award, type PathTally, type GameRowIn, type LeagueGame, type Path, type Foe, type Mate
	} from '$lib/league';
	import { heroById, portraitCss, traitIcon, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { teamName } from '$lib/teams';
	import Icon from '$lib/ui/Icon.svelte';
	import PlayerCard from '$lib/hall/PlayerCard.svelte';
	import HeroCard from '$lib/hall/HeroCard.svelte';
	import GameCard from '$lib/hall/GameCard.svelte';
	import OverTime from '$lib/hall/OverTime.svelte';
	import Rivalries from '$lib/hall/Rivalries.svelte';
	import Glyph from '$lib/hall/Glyph.svelte';
	import { role } from '$lib/role';

	type Tab = 'players' | 'log' | 'awards' | 'heroes' | 'games';
	// GMs only for now (the soft admin gate in role.ts; the link is in the GM tools)
	let phase: 'loading' | 'ready' | 'empty' | 'error' | 'locked' = 'loading';
	let errMsg = '';
	let league: League | null = null;
	let titles: Record<string, { title: string; blurb: string }[]> = {};
	let tab: Tab = 'players';
	let sel: string | null = null; // the player whose page is open
	let heroSel: string | null = null; // the hero whose builds are open
	let body: HTMLElement;

	function use(rows: GameRowIn[]) {
		league = buildLeague(rows);
		titles = titlesOf(league);
		phase = league.games.length ? 'ready' : 'empty';
	}
	async function load() {
		if ($role !== 'admin') { phase = 'locked'; return; }
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
	// ── the player log: everyone A–Z, one player's whole record ──
	let logSel: string | null = null;
	let openMatch: Record<string, boolean> = {};
	$: logList = league ? [...league.players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : [];
	$: logP = logList.find((p) => p.key === logSel) ?? logList[0] ?? null;
	const openLog = (key: string) => { logSel = key; tab = 'log'; openMatch = {}; body?.scrollTo(0, 0); };
	const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');
	const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
	const rt = (x: { r: number; t: number }) => (x.r ? `R${x.r}·T${x.t}` : '');
	const kda = (x: { k: number | null; d: number | null; a: number | null }) => (x.k != null ? `${x.k}/${x.d}/${x.a}` : '–');
	// per hero, from the match lines (totals + averages)
	function heroRows(p: PlayerAgg) {
		const m = new Map<string, { hero: string; games: number; wins: number; k: number; d: number; a: number; ev: number; lv: number; coins: number; cg: number; minions: number }>();
		for (const x of p.history) {
			const r = m.get(x.hero) ?? { hero: x.hero, games: 0, wins: 0, k: 0, d: 0, a: 0, ev: 0, lv: 0, coins: 0, cg: 0, minions: 0 };
			r.games++; if (x.won) r.wins++; r.lv += x.level;
			if (x.k != null) { r.ev++; r.k += x.k; r.d += x.d ?? 0; r.a += x.a ?? 0; r.minions += x.minions ?? 0; }
			if (x.coins != null) { r.coins += x.coins; r.cg++; }
			m.set(x.hero, r);
		}
		return [...m.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
	}
	// the whole log as a spreadsheet (one row per game)
	function downloadCsv(p: PlayerAgg) {
		const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const head = ['Date', 'Room', 'Result', 'Win type', 'Team', 'Hero', 'Level', 'Kills', 'Deaths', 'Assists', 'Minions', 'Coins earned', 'Rounds', 'Minutes', 'Rating', 'Change', 'Teammates', 'Opponents', 'Build'];
		const rows = [...p.history].reverse().map((m) => [new Date(m.at).toISOString(), m.room, m.won ? 'Win' : 'Loss', WIN_LABEL[m.type], teamName(m.team), heroName(m.hero), m.level, m.k ?? '', m.d ?? '', m.a ?? '', m.minions ?? '', m.coins ?? '', m.rounds, m.minutes, m.rating, m.delta,
			m.mates.map((x) => `${x.name} (${heroName(x.hero)})`).join('; '), m.foes.map((x) => `${x.name} (${heroName(x.hero)})`).join('; '), chips(m.hero, m.path).map((c) => `${c.tier} ${c.name}`).join(' > ')]);
		const csv = [head, ...rows].map((r) => r.map(q).join(',')).join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		a.download = `goa2-${p.name.replace(/[^\w-]+/g, '_')}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	// ── the lists: search + sort (players / heroes), search (games); players also as a chart or a grid ──
	let pq = '', psort: 'rating' | 'games' | 'win' | 'kd' | 'name' = 'rating', pview: 'cards' | 'time' | 'rivals' = 'cards';
	let hq = '', hsort: 'picks' | 'win' | 'impact' | 'name' = 'picks';
	let gq = '';
	const has = (txt: string, q: string) => txt.toLowerCase().includes(q.trim().toLowerCase());
	const kdOf = (p: PlayerAgg) => (p.kdaGames ? p.kills / Math.max(1, p.deaths) : -1);
	$: rankByRating = new Map((league?.players ?? []).map((p, i) => [p.key, i + 1]));
	$: plist = (league?.players ?? []).filter((p) => !pq.trim() || has(p.name, pq)).sort((a, b) =>
		psort === 'games' ? b.games - a.games || b.rating - a.rating
		: psort === 'win' ? b.wins / b.games - a.wins / a.games || b.games - a.games
		: psort === 'kd' ? kdOf(b) - kdOf(a)
		: psort === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		: b.rating - a.rating);
	$: hlist = (league?.heroes ?? []).filter((h) => !hq.trim() || has(heroName(h.hero), hq) || (heroById(h.hero)?.traits ?? []).some((t) => has(TRAIT_LABELS[t as Trait], hq))).sort((a, b) =>
		hsort === 'win' ? b.wins / b.games - a.wins / a.games || b.games - a.games
		: hsort === 'impact' ? (b.impact ?? -999) - (a.impact ?? -999)
		: hsort === 'name' ? heroName(a.hero).localeCompare(heroName(b.hero))
		: b.games - a.games || b.wins - a.wins);
	$: glist = [...(league?.games ?? [])].reverse().filter((g) => !gq.trim() || g.players.some((p) => has(p.name, gq) || has(heroName(p.hero), gq)));

	// ── feats and defences (the extras) for one player ──
	function featRows(p: PlayerAgg) {
		const n = (v: number, ok: number) => (ok ? String(v) : '–');
		return [
			{ k: 'First bloods', v: n(p.ex.firstBlood, p.xGames), tip: 'The first hero kill of a game' },
			{ k: 'Rampages', v: n(p.ex.wipe, p.xGames), tip: 'Games where they killed every enemy hero at least once' },
			{ k: 'Aces', v: n(p.ex.aces, p.clashGames), tip: 'Every enemy hero down at the same time' },
			{ k: 'Shutdowns', v: n(p.ex.shutdowns, p.xGames), tip: 'Killed a hero on a 3-kill streak' },
			{ k: 'Payback kills', v: n(p.ex.paybacks, p.xGames), tip: 'Killed the hero who last killed them' },
			{ k: 'Double-kill turns', v: n(p.ex.multis, p.xGames), tip: 'Two or more kills in one turn' },
			{ k: 'Giants slain', v: p.xGames && p.ex.giants ? String(p.ex.giants) : '–', tip: 'Kills on heroes 2+ levels above them' },
			{ k: 'Heavy minions', v: n(p.ex.heavies, p.xGames), tip: 'Heavy minions defeated' },
			{ k: 'Bounty gold', v: n(p.ex.bounty, p.xGames), tip: 'Gold from hero kills and assists' },
			{ k: 'Flawless wins', v: n(p.flawless, p.kdaGames), tip: 'Won without dying' },
			{ k: 'Peaceful wins', v: n(p.pacifist, p.kdaGames), tip: 'Won without a hero kill' },
			{ k: 'Comebacks', v: String(p.brinks), tip: 'Won after the battle zone reached their own beach, or with one Life left' },
			{ k: 'Throne wins', v: String(p.byType.throne.wins), tip: 'Won by pushing into the enemy throne' },
			{ k: 'Earliest ultimate', v: p.fastUlt != null ? `Round ${p.fastUlt}` : '–', tip: 'The earliest round their ultimate came on' },
			{ k: 'Attacks defended', v: n(p.ex.defends, p.clashGames), tip: 'Survived an attack by defending' },
			{ k: 'Fell defending', v: n(p.ex.defDied, p.clashGames), tip: 'Defended and still died' },
			{ k: 'Took the hit', v: n(p.ex.noDefDied, p.clashGames), tip: 'Died without discarding a card' },
			{ k: 'Beat a defence', v: n(p.ex.beatDefended, p.clashGames), tip: 'Killed a hero who had defended' },
			{ k: 'Relentless kills', v: n(p.ex.relentless, p.clashGames), tip: 'Killed a hero they had already attacked that round' }
		];
	}
	// the little badges on one game in the log
	function matchBadges(m: MatchLine) {
		const x = m.x, b: string[] = [];
		if (x?.firstBlood) b.push('First blood');
		if (x?.wipe) b.push('Rampage');
		if (m.won && m.d === 0) b.push('Flawless');
		if (m.won && m.k === 0) b.push('Pacifist');
		if (m.brink) b.push('Comeback');
		if (x?.aces) b.push(x.aces > 1 ? `Ace ×${x.aces}` : 'Ace');
		if (x?.multis) b.push(x.multis > 1 ? `Double ×${x.multis}` : 'Double kill');
		if (x?.shutdowns) b.push(x.shutdowns > 1 ? `Shutdown ×${x.shutdowns}` : 'Shutdown');
		if (x?.paybacks) b.push(x.paybacks > 1 ? `Payback ×${x.paybacks}` : 'Payback');
		if (m.ultRound != null) b.push(`Ultimate R${m.ultRound}`);
		return b;
	}
	// the awards, grouped
	$: awardGroups = league ? [
		{ k: 'Single game', list: league.awards.filter((a) => !a.hidden && !a.extra && a.scope === 'game') },
		{ k: 'Career', list: league.awards.filter((a) => !a.hidden && !a.extra && a.scope === 'career') },
		{ k: 'More awards', list: league.awards.filter((a) => !a.hidden && a.extra) }
	] : [];
	const SIDES = ['orange', 'blue'] as const;
	const teamOf = (g: LeagueGame, t: 'orange' | 'blue') => g.players.filter((p) => p.team === t);
</script>

<svelte:head><title>GoA2 · Hall of Records</title></svelte:head>
<svelte:window on:keydown={(e) => { if (e.key === 'Escape') { if (heroSel) heroSel = null; else if (sel) sel = null; } }} />

{#snippet lwho(x: { key: string; name: string })}
	<button class="who" on:click={() => openLog(x.key)}>{x.name}</button>
{/snippet}
{#snippet seat(x: { key: string; name: string; hero: string; level: number; k: number | null; d: number | null; a: number | null })}
	<span class="lseat">{@render face(x.hero, 24)}<span class="lsn">{@render lwho(x)}<small>{heroName(x.hero)} · Lv {x.level}</small></span><b>{kda(x)}</b></span>
{/snippet}
{#snippet toolbar(q: string, setQ: (v: string) => void, ph: string, opts: [string, string][], cur: string, setSort: (v: string) => void)}
	<div class="panel tbar">
		<label class="srch"><Glyph name="search" size={16} /><input placeholder={ph} value={q} on:input={(e) => setQ(e.currentTarget.value)} /></label>
		{#if opts.length}<div class="sorts" role="group" aria-label="Sort">{#each opts as [k, l] (k)}<button class:on={cur === k} on:click={() => setSort(k)}>{l}</button>{/each}</div>{/if}
	</div>
{/snippet}
{#snippet feats(p: PlayerAgg)}
	<div class="lgrid">
		{#each featRows(p) as f (f.k)}<div class="st" title={f.tip}><span>{f.k}</span><b>{f.v}</b></div>{/each}
	</div>
	{#if p.clashGames < p.games}<p class="fine">Defences and aces count the {p.clashGames} of {p.games} games recorded with them{p.clashGames ? '' : ' — they start with the next game'}.</p>{/if}
{/snippet}
{#snippet awardCard(a: Award)}
	<div class="panel award" class:open={!a.holders.length}>
		<span class="at">{a.title}</span>
		<span class="ab">{a.blurb}</span>
		{#if a.holders.length}
			<span class="av">{a.value}</span>
			<span class="aw">{#each a.holders as h, i (h.key)}{#if i}<i>&amp;</i>{/if}<button class="who" on:click={() => openLog(h.key)}>{h.name}</button>{/each}{#if a.at}<small>&nbsp;· {day(a.at)}</small>{/if}</span>
		{:else}
			<span class="av none2">Up for grabs</span>
		{/if}
	</div>
{/snippet}
{#snippet matchCard(m: MatchLine)}
	<article class="panel lm is-{m.team}" class:won={m.won}>
		<button class="lmh" on:click={() => (openMatch = { ...openMatch, [m.id]: !openMatch[m.id] })} aria-expanded={!!openMatch[m.id]}>
			<span class="res" class:w={m.won}>{m.won ? 'W' : 'L'}</span>
			{@render face(m.hero, 34)}
			<span class="lmt"><b>{heroName(m.hero)}</b><small>{when(m.at)}{m.room ? ` · room ${m.room}` : ''}</small></span>
			<span class="lmk"><small>K/D/A</small><b>{kda(m)}</b></span>
			<span class="lmk"><small>Level</small><b>{m.level}</b></span>
			<span class="lmk hidem"><small>Coins</small><b>{m.coins ?? '–'}</b></span>
			<span class="dl" class:up={m.delta > 0} class:down={m.delta < 0}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
			<span class="chev" aria-hidden="true">{openMatch[m.id] ? '▴' : '▾'}</span>
		</button>
		{#if openMatch[m.id]}
			<div class="lmb">
				<div class="lfacts">
					<span><small>Result</small>{m.won ? 'Victory' : 'Defeat'} · {WIN_LABEL[m.type]}</span>
					<span><small>Side</small><em class="t-{m.team}">{teamName(m.team)}</em></span>
					<span><small>Length</small>{m.rounds} round{m.rounds === 1 ? '' : 's'} · {hm(m.minutes)}</span>
					<span><small>Rating</small>{m.rating - m.delta} → {m.rating}</span>
					<span><small>Coins earned</small>{m.coins ?? '–'}</span>
					<span><small>Defences</small>{#if m.x?.defends != null}{m.x.defends} held{#if m.x.defDied} · {m.x.defDied} fell{/if}{#if m.x.noDefDied} · {m.x.noDefDied} took the hit{/if}{:else}–{/if}</span>
					<span><small>Minions</small>{#if m.mRoles}{m.minions ?? 0} <i class="mr">{m.mRoles.melee} melee · {m.mRoles.ranged} ranged · {m.mRoles.heavy} heavy</i>{:else}–{/if}</span>
				</div>
				{#if matchBadges(m).length}<div class="mbadges">{#each matchBadges(m) as b (b)}<span class="mbadge">{b}</span>{/each}</div>{/if}
				{#if m.k != null}
					<div class="lev">
						<div><h4 class="sub">Defeated</h4>{#each m.kills as x, i (i)}<span class="evc k">{x.name}<small>{rt(x)}</small></span>{:else}<span class="none">—</span>{/each}</div>
						<div><h4 class="sub">Fell to</h4>{#each m.deaths as x, i (i)}<span class="evc d">{x.name}<small>{rt(x)}</small></span>{:else}<span class="none">—</span>{/each}</div>
						<div><h4 class="sub">Assisted on</h4>{#each m.assisted as x, i (i)}<span class="evc a">{x.name}<small>{rt(x)}</small></span>{:else}<span class="none">—</span>{/each}</div>
					</div>
				{/if}
				{#if m.path.cards.length || m.path.ult}<div class="lbuild"><h4 class="sub">Build</h4>{@render pathRow(m.hero, m.path)}</div>{/if}
				<div class="cols tight">
					<div><h4 class="sub">With</h4><div class="lseats">{#each m.mates as x (x.key)}{@render seat(x)}{:else}<span class="none">alone</span>{/each}</div></div>
					<div><h4 class="sub">Against</h4><div class="lseats">{#each m.foes as x (x.key)}{@render seat(x)}{/each}</div></div>
				</div>
			</div>
		{/if}
	</article>
{/snippet}

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
		<nav class="tabs" aria-label="Sections">
			{#each [['players', 'Players'], ['log', 'Player log'], ['awards', 'Awards'], ['heroes', 'Heroes'], ['games', 'Games']] as [k, l] (k)}
				<button class="tab" class:on={tab === k && !(k === 'players' && sel)} class:crumb={tab === k && k === 'players' && !!sel} on:click={() => go(k as Tab)}>{l}</button>
			{/each}
		</nav>
	</header>

	<main class="body" bind:this={body}>
		{#if phase === 'loading'}
			<p class="note">Opening the records…</p>
		{:else if phase === 'locked'}
			<section class="panel msg">
				<h2 class="t-h2">GMs only</h2>
				<p class="t-body c-muted">Sign in as Admin to open the Hall of Records.</p>
				<a class="btn btn-ghost" href={base + '/'}>Home</a>
			</section>
		{:else if phase === 'error'}
			<section class="panel msg">
				<h2 class="t-h2">The records are locked</h2>
				<p class="t-body c-muted">Couldn't read the games table ({errMsg}).</p>
			</section>
		{:else if phase === 'empty' || !league}
			<section class="panel msg">
				<h2 class="t-h2">No games on record yet</h2>
				<p class="t-body c-muted">A game lands here when it is won, was played from the first turn, and had at least two people at the table.</p>
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

				<section class="panel">
					<h3 class="t-label">Feats &amp; defence</h3>
					{@render feats(p)}
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
			<!-- ── the players: cards, the rating over time, or every rivalry at once ── -->
			<div class="views" role="group" aria-label="View">
				<button class:on={pview === 'cards'} on:click={() => (pview = 'cards')}>Cards</button>
				<button class:on={pview === 'time'} on:click={() => (pview = 'time')}>Over time</button>
				<button class:on={pview === 'rivals'} on:click={() => (pview = 'rivals')}>Rivalries</button>
			</div>
			{#if pview === 'time'}
				<OverTime {league} onOpen={openPlayer} />
			{:else if pview === 'rivals'}
				<Rivalries {league} onOpen={openPlayer} />
			{:else}
				{@render toolbar(pq, (v) => (pq = v), 'Search players…', [['rating', 'Rating'], ['games', 'Games'], ['win', 'Win %'], ['kd', 'K/D'], ['name', 'Name']], psort, (v) => (psort = v as typeof psort))}
				<div class="pgrid">
					{#each plist as p (p.key)}<PlayerCard {p} rank={rankByRating.get(p.key) ?? 0} titles={titles[p.key] ?? []} onOpen={() => openPlayer(p.key)} />{:else}<p class="note">Nobody by that name.</p>{/each}
				</div>
			{/if}
			{#if league.withEvents < league.games.length}<p class="fine c">K/D/A counts the {league.withEvents} game{league.withEvents === 1 ? '' : 's'} recorded with kill events; the rest count for everything else.</p>{/if}
		{:else if tab === 'log'}
			<!-- ── the player log: everyone A–Z · one player's whole record, every match in full ── -->
			<div class="plog">
				<nav class="panel lgl" aria-label="Players">
					<span class="t-label">{logList.length} player{logList.length === 1 ? '' : 's'}</span>
					{#each logList as p (p.key)}
						<button class="lgi" class:on={logP?.key === p.key} on:click={() => openLog(p.key)}>
							<span class="lgn">{p.name}</span><small>{p.games} game{p.games === 1 ? '' : 's'} · {wl(p)} · {day(p.lastAt)}</small>
						</button>
					{/each}
				</nav>
				{#if logP}
					{@const p = logP}
					{@const roles = p.mRoles}
					<div class="lgr">
						<section class="panel lhead">
							<div class="lht">
								<h2 class="pn">{p.name}</h2>
								<span class="lsince">First game {when(p.firstAt)} · last {when(p.lastAt)}</span>
								<button class="btn btn-ghost btn-sm csv" on:click={() => downloadCsv(p)} title="Every game as a spreadsheet">Download CSV</button>
							</div>
							<div class="lgrid">
								<div class="st"><span>Games</span><b>{p.games}</b></div>
								<div class="st"><span>Wins – losses</span><b>{p.wins} – {p.losses}</b></div>
								<div class="st"><span>Win rate</span><b>{pct(p.wins, p.games)}%</b></div>
								<div class="st"><span>Rating · peak</span><b>{p.rating} <small>· {p.peak}</small></b></div>
								<div class="st"><span>Streak · best · worst</span><b>{streakTxt(p.streak)} <small>· {p.bestStreak ? `W${p.bestStreak}` : '–'} · {p.worstStreak ? `L${-p.worstStreak}` : '–'}</small></b></div>
								<div class="st"><span>Time played</span><b>{hm(p.minutes)} <small>· {p.rounds} rounds</small></b></div>
								<div class="st"><span>Heroes defeated</span><b>{p.kdaGames ? p.kills : '–'}</b></div>
								<div class="st"><span>Times defeated</span><b>{p.kdaGames ? p.deaths : '–'}</b></div>
								<div class="st"><span>Assists</span><b>{p.kdaGames ? p.assists : '–'}</b></div>
								<div class="st"><span>K/D · kill share</span><b>{kd(p)} <small>· {kp(p)}</small></b></div>
								<div class="st"><span>Minions defeated</span><b>{p.kdaGames ? p.minions : '–'}</b>{#if p.kdaGames}<i class="mr">{roles.melee} melee · {roles.ranged} ranged · {roles.heavy} heavy</i>{/if}</div>
								<div class="st"><span>Coins earned · per game</span><b>{p.coinGames ? p.coins : '–'} <small>· {avg(p.coins, p.coinGames)}</small></b></div>
								<div class="st"><span>Level · avg · best</span><b>{avg(p.levels, p.games)} <small>· {p.maxLevel}</small></b></div>
								<div class="st"><span>Ultimates unlocked</span><b>{p.ults}</b></div>
								{#each WIN_TYPES as t (t)}<div class="st"><span>{WIN_LABEL[t]} games · won</span><b>{p.byType[t].games} <small>· {p.byType[t].wins}</small></b></div>{/each}
							</div>
							{#if p.kdaGames < p.games}<p class="fine">Kills, defeats, assists and minions count the {p.kdaGames} of {p.games} games recorded with those events.</p>{/if}
						</section>

						<section class="panel">
							<h3 class="t-label">Feats &amp; defence</h3>
							{@render feats(p)}
						</section>

						<section class="panel">
							<h3 class="t-label">By hero</h3>
							<div class="lhero">
								<div class="lhr th"><span></span><span class="hn">Hero</span><span>Games</span><span>W–L</span><span>K/D/A</span><span>Minions</span><span>Avg level</span><span>Avg coins</span></div>
								{#each heroRows(p) as h (h.hero)}
									<div class="lhr">{@render face(h.hero, 26)}<span class="hn">{heroName(h.hero)}</span><span>{h.games}</span><span>{wl(h)}</span><span>{h.ev ? `${h.k}/${h.d}/${h.a}` : '–'}</span><span>{h.ev ? h.minions : '–'}</span><span>{avg(h.lv, h.games)}</span><span>{avg(h.coins, h.cg)}</span></div>
								{/each}
							</div>
						</section>

						<section class="panel">
							<h3 class="t-label">With &amp; against</h3>
							<div class="cols tight">
								<div class="tbl">
									<div class="tr th"><span>Teammate</span><span class="n">Games</span><span class="n">W–L</span><span></span></div>
									{#each p.mates as m (m.key)}<div class="tr">{@render lwho(m)}<span class="n">{m.games}</span><span class="n">{wl(m)}</span><span class="bar"><i style="transform:scaleX({m.wins / m.games})"></i></span></div>{/each}
								</div>
								<div class="tbl">
									<div class="tr th"><span>Opponent</span><span class="n">W–L</span><span class="n k">Beat</span><span class="n d">Fell</span></div>
									{#each [...p.foes].sort((a, b) => b.games - a.games) as f (f.key)}<div class="tr">{@render lwho(f)}<span class="n">{wl(f)}</span><span class="n k">{f.killed}</span><span class="n d">{f.killedBy}</span></div>{/each}
								</div>
							</div>
						</section>

						<h3 class="t-label lmh3">Every game <small>· newest first · tap one for the full record</small></h3>
						{#each p.history as m (m.id)}{@render matchCard(m)}{/each}
					</div>
				{/if}
			</div>
		{:else if tab === 'heroes'}
			<!-- ── heroes: win rate, impact, how their games ended, who they win with / beat / lose to ── -->
			{@render toolbar(hq, (v) => (hq = v), 'Search heroes or roles…', [['picks', 'Picks'], ['win', 'Win %'], ['impact', 'Impact'], ['name', 'Name']], hsort, (v) => (hsort = v as typeof hsort))}
			<div class="hgrid">
				{#each hlist as h (h.hero)}<HeroCard {h} onBuilds={() => (heroSel = h.hero)} />{:else}<p class="note">No hero matches.</p>{/each}
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
		{:else if tab === 'awards'}
			<!-- ── the awards: who holds each one now ── -->
			{#each awardGroups as grp (grp.k)}
				<h3 class="t-label sp c">{grp.k}</h3>
				<div class="recs">{#each grp.list as a (a.id)}{@render awardCard(a)}{/each}</div>
			{/each}
			{#if league.withClashes < league.games.length}<p class="fine c">Defences and aces count the {league.withClashes} game{league.withClashes === 1 ? '' : 's'} recorded with them{league.withClashes ? '' : ' — they start with the next game'}.</p>{/if}
		{:else}
			<!-- ── every game, newest first ── -->
			{@render toolbar(gq, (v) => (gq = v), 'Search by player or hero…', [], '', () => {})}
			<div class="glist">
				{#each glist as g (g.id)}<GameCard {g} onPlayer={openLog} />{:else}<p class="note">No game matches.</p>{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	/* ── lists: toolbar, views, grids ── */
	.tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px; margin-bottom: 14px; }
	.srch { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 40px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); color: var(--ink-3); }
	.srch input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; padding: 0; }
	.srch:focus-within { border-color: var(--brass-line); }
	.sorts, .views { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); }
	.sorts button, .views button { padding: 6px 12px; border-radius: 8px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; }
	.sorts button.on, .views button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.views { width: max-content; margin: 0 auto 14px; border-radius: 999px; }
	.views button { border-radius: 999px; padding: 6px 18px; }
	.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 22px 18px; padding-top: 6px; }
	.hgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
	.glist { display: flex; flex-direction: column; gap: 14px; }
	/* ── the player log ── */
	.plog { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
	.lgl { position: sticky; top: 0; display: flex; flex-direction: column; gap: 4px; padding: 12px; max-height: calc(100dvh - 120px); overflow-y: auto; }
	.lgl .t-label { margin-bottom: 4px; }
	.lgi { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 10px; border-radius: 8px; border: 1px solid transparent; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.lgi:hover { background: var(--raise); }
	.lgi.on { border-color: var(--brass-line); background: var(--well); }
	.lgi.on .lgn { color: var(--brass-hi); }
	.lgn { font-size: 16px; }
	.lgi small { font-size: 11.5px; color: var(--ink-3); }
	.lgr { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.lhead { display: flex; flex-direction: column; gap: 12px; }
	.lht { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; }
	.lsince { font-size: 13px; color: var(--ink-3); }
	.csv { margin-left: auto; }
	.lgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
	.lgrid .st b small { font-size: 13px; color: var(--ink-3); }
	.mr { display: block; font-style: normal; font-size: 11.5px; color: var(--ink-3); }
	.st .mr { position: static; }
	.lhero { display: flex; flex-direction: column; gap: 4px; overflow-x: auto; }
	.lhr { display: grid; grid-template-columns: 26px minmax(110px, 1fr) repeat(6, minmax(58px, 80px)); align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; background: var(--raise); font-size: 14px; min-width: 620px; }
	.lhr > span:not(.hn):not(.face) { text-align: right; color: var(--ink-2); }
	.lhr.th { background: none; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
	.lhr.th span { color: var(--ink-3) !important; }
	.lmh3 { margin: 6px 0 0; }
	.lmh3 small { text-transform: none; letter-spacing: 0; color: var(--ink-3); }
	.lm { padding: 0; overflow: hidden; border-left: 3px solid var(--tc, var(--brass-line)); }
	.lm.is-orange { --tc: #ef7d22; } .lm.is-blue { --tc: #2f7fe6; }
	.lmh { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.lmh:hover { background: var(--raise); }
	.lmt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.lmt b { font-weight: 400; font-size: 16px; }
	.lmt small { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.lmk { flex: none; display: flex; flex-direction: column; align-items: center; min-width: 56px; }
	.lmk small { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.lmk b { font-weight: 400; font-size: 16px; }
	.chev { flex: none; color: var(--ink-3); }
	.lmb { display: flex; flex-direction: column; gap: 4px; padding: 4px 16px 16px; border-top: 1px solid var(--hair); }
	.lfacts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px 16px; padding-top: 10px; font-size: 14px; }
	.lfacts small { display: block; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.lfacts em { font-style: normal; } .t-orange { color: #ffae6e; } .t-blue { color: #8cc0ff; }
	.lev { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
	.evc { display: inline-flex; align-items: baseline; gap: 5px; margin: 0 6px 6px 0; padding: 3px 9px; border-radius: 999px; font-size: 13px; background: var(--well); border: 1px solid var(--hair); }
	.evc small { font-size: 11px; color: var(--ink-3); }
	.evc.k { border-color: rgba(74, 222, 128, 0.4); } .evc.d { border-color: rgba(248, 113, 113, 0.45); } .evc.a { border-color: var(--brass-line); }
	.none { color: var(--ink-3); font-size: 13px; }
	.lseats { display: flex; flex-direction: column; gap: 4px; }
	.lseat { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; background: var(--raise); }
	.lsn { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.lsn small { font-size: 11.5px; color: var(--ink-3); }
	.lsn :global(.who) { align-self: flex-start; text-align: left; font-size: 15px; }
	.lseat b { font-weight: 400; font-size: 14px; color: var(--ink-2); }
	@media (max-width: 760px) {
		.plog { grid-template-columns: 1fr; }
		.lgl { position: static; flex-direction: row; max-height: none; overflow-x: auto; padding: 8px; }
		.lgl .t-label { display: none; }
		.lgi { flex: none; }
		.lev { grid-template-columns: 1fr; }
		.lmh { gap: 8px; padding: 8px 10px; }
		.lmk { min-width: 42px; }
		.csv { margin-left: 0; }
		.lgrid { grid-template-columns: 1fr 1fr; }
		.lgrid .st b { font-size: 17px; }
		.tabs { max-width: 100%; overflow-x: auto; }
		.tab { padding: 6px 10px; font-size: 13.5px; }
	}
	.stats { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); }
	.top { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid var(--brass-line); background: rgba(3, 11, 21, 0.72); }
	.ttl { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 0.04em; color: var(--brass-hi); white-space: nowrap; }
	.tabs { margin-left: auto; display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--well); border: 1px solid var(--hair); }
	.tab { white-space: nowrap; padding: 6px 16px; border-radius: 999px; font-size: 15px; color: var(--ink-2); background: none; border: 0; cursor: pointer; }
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
	.g { color: var(--ready-hi) !important; }
	.r { color: var(--danger-hi) !important; }
	.role img { width: 22px; height: 22px; object-fit: contain; }
	.rel .rk2 { letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; }
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
	.hs { font-size: 13px; color: var(--ink-2); }
	.hs b { font-weight: 400; color: var(--ink); }
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
	.award { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding: 14px 12px; }
	.award .at { font-size: 21px; color: var(--brass-hi); }
	.award .ab { font-size: 12.5px; color: var(--ink-3); min-height: 2.4em; }
	.award .av { font-size: 24px; margin-top: 2px; }
	.award .aw { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 2px 6px; font-size: 15px; color: var(--ink-2); }
	.award .aw i { font-style: normal; color: var(--ink-3); }
	.award .aw small { font-size: 12px; color: var(--ink-3); }
	.award.open { opacity: 0.55; }
	.award .none2 { font-size: 15px; color: var(--ink-3); letter-spacing: 0.06em; text-transform: uppercase; }
	.mbadges { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 10px; }
	.mbadge { padding: 2px 10px; border-radius: 999px; font-size: 12.5px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }

	/* games */

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
		.recs, .pgrid, .hgrid { grid-template-columns: 1fr; }
		.sorts { overflow-x: auto; max-width: 100%; }
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
		.rating b { font-size: 28px; }
	}
</style>
