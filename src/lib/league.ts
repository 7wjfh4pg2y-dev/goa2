// THE LEAGUE — everything the stats page shows, worked out from the finished games in `goa2_games`
// (one row per game, uploaded by the recorder). Pure: rows in, the league out — tested in league.test.ts.
//
// People are matched across games by NAME (trimmed, case and spacing ignored): the app has no accounts,
// so "Zara" in one game and "zara " in the next are the same player.
//
// What every number rests on:
//  · wins / losses / streaks / win types / heroes / roles / team-mates / opponents — every game
//  · kills, deaths, assists, minions, nemeses — games recorded with events (the release's recorder);
//    older games count for the rest and are left out of these (never guessed from the log's wording)
//  · coins earned / level — the final card state (every game)
//  · level-up paths — games recorded with build steps (in pick order); older games give the final build
//    only (`ordered: false`), in tier order
//  · rating — a team Elo: everyone starts at 1200, each game moves the winners up and the losers down by
//    how surprising the result was (the teams' average ratings), K = 32
import type { Team } from './match'
import type { BuildStep, GameEvent, Journal } from './recorder'
import { statsFromJournal, levelsPaid } from './gamestats'
import { HEROES, type Trait } from './heroes'
import { heroCards } from './cards/deck'

/** A row of `goa2_games` as it comes back from the backend. */
export type GameRowIn = {
	id: string
	room?: string
	started_at: string
	ended_at: string
	winner: Team | null
	reason: string | null
	rounds: number | null
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any
}

export type WinType = 'throne' | 'final' | 'life' | 'other'
export const WIN_TYPES: WinType[] = ['throne', 'final', 'life']
export const WIN_LABEL: Record<WinType, string> = { throne: 'Throne', final: 'Final push', life: 'Life', other: 'Other' }
export const winType = (reason: string | null | undefined): WinType =>
	/throne/i.test(reason ?? '') ? 'throne' : /final push/i.test(reason ?? '') ? 'final' : /life/i.test(reason ?? '') ? 'life' : 'other'

/** The same person in every game: their name, trimmed, spacing and case ignored. */
export const playerKey = (name: string) => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** A level-up path: the Tier II / III cards a hero took, in the order they were taken (indices into heroCards). */
export type Path = { cards: number[]; ult: boolean; ordered: boolean }
export const pathKey = (p: Path) => `${p.cards.join('.')}${p.ult ? '.U' : ''}`

export type GamePlayer = {
	key: string
	name: string
	id: string
	hero: string
	team: Team
	won: boolean
	level: number
	coins: number | null
	kills: number | null
	deaths: number | null
	assists: number | null
	minions: number | null
	/** minions this player defeated, by role (games recorded with events) */
	mRoles: { melee: number; ranged: number; heavy: number } | null
	path: Path
}
export type LeagueGame = {
	id: string
	room: string
	startedAt: number
	at: number
	minutes: number
	rounds: number
	winner: Team
	type: WinType
	players: GamePlayer[]
	/** hero defeats, by player key, with when (round / turn) */
	defeats: { by: string; v: string; a: string[]; r: number; t: number }[]
	events: boolean
}

const tierOf = (hero: string, i: number) => heroCards(hero)[i]?.level ?? 0
const colourOf = (hero: string, i: number) => heroCards(hero)[i]?.color ?? ''

/** The path out of a player's build steps: a card counts once taken and kept past the moment it was taken —
 *  one later swapped for its twin or put back (undo) does not; one replaced by a higher tier of the same
 *  colour does (it was a step on the way). */
export function pathOfSteps(hero: string, steps: BuildStep[]): Path {
	const picks: number[] = []
	let prev: number[] = []
	for (const st of steps) {
		const entered = st.keep.filter((k) => !prev.includes(k))
		const left = prev.filter((k) => !st.keep.includes(k))
		for (const k of left) {
			const promoted = entered.some((e) => colourOf(hero, e) === colourOf(hero, k) && tierOf(hero, e) > tierOf(hero, k))
			if (!promoted) picks.splice(picks.indexOf(k), 1)
		}
		for (const e of entered) if (!picks.includes(e)) picks.push(e)
		prev = st.keep
	}
	return { cards: picks, ult: !!steps[steps.length - 1]?.ult, ordered: true }
}

/** A path from the final card state alone (games recorded before build steps): the kept upgrades, in tier order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pathOfFinal(hero: string, c: any): Path {
	if (!c) return { cards: [], ult: false, ordered: false }
	const gone = new Set<number>([...(c.upgrade ?? []), ...(c.removed ?? [])])
	const held = new Set<number>([...(c.hand ?? []), ...(c.discard ?? []), ...((c.turns ?? []) as (number | null)[]).filter((x): x is number => x != null), ...(c.pending != null ? [c.pending] : [])])
	const keep = [...held].filter((i) => !gone.has(i) && (tierOf(hero, i) === 2 || tierOf(hero, i) === 3))
	keep.sort((a, b) => tierOf(hero, a) - tierOf(hero, b) || colourOf(hero, a).localeCompare(colourOf(hero, b)))
	return { cards: keep, ult: !!c.ultimate, ordered: false }
}

/** A row back into a journal (the shape the battle report reads). */
export function journalOfRow(row: GameRowIn): Journal {
	const d = row.data ?? {}
	return {
		v: 1, id: row.id, room: row.room ?? '', startedAt: Date.parse(row.started_at), lastAt: Date.parse(row.ended_at), fromStart: true,
		seats: d.seats ?? 0, mapId: d.mapId ?? '', draftSystem: d.draftSystem ?? '', lifeMax: d.lifeMax ?? 0, wavesMax: d.wavesMax ?? 0,
		players: d.players ?? {}, draft: d.draft ?? null, turns: Array.isArray(d.turns) ? d.turns : [], cur: null, log: Array.isArray(d.log) ? d.log : [],
		ev: Array.isArray(d.ev) ? d.ev : undefined, builds: d.builds ?? undefined, mark: null, done: true, uploaded: true, final: d.final ?? undefined
	}
}

const minionRoles = (ev: unknown, id: string) => {
	const out = { melee: 0, ranged: 0, heavy: 0 }
	for (const e of (Array.isArray(ev) ? ev : []) as GameEvent[]) if (e.k === 'minion' && e.by === id) { const r = e.role as keyof typeof out; if (r in out) out[r]++ }
	return out
}

/** One game, ready to count — or null when the row can't say who won or who played. */
export function gameOfRow(row: GameRowIn): LeagueGame | null {
	const d = row.data ?? {}
	const winner = (row.winner ?? d.final?.wonBy?.team) as Team | null
	if (winner !== 'orange' && winner !== 'blue') return null
	const j = journalOfRow(row)
	const exact = statsFromJournal(j)
	const endCards = (d.final?.cards ?? {}) as Record<string, { coins?: number; level?: number; upgrade?: unknown[]; ultimate?: boolean }>
	const keyOf = new Map<string, string>()
	const players: GamePlayer[] = []
	for (const [id, p] of Object.entries((d.players ?? {}) as Record<string, { name: string; seat: number; hero: string; team?: Team }>)) {
		if (!p?.hero || !p.name) continue
		const st = exact?.players.find((x) => x.id === id)
		if (exact && !st) continue // a seat taken over mid-game: the report counts its last owner
		const team: Team = st?.team ?? p.team ?? (p.seat < Math.floor((d.seats || 2) / 2) ? 'orange' : 'blue')
		const end = endCards[id]
		const level = st?.level ?? (end ? 1 + (end.upgrade?.length ?? 0) + (end.ultimate ? 1 : 0) : 1)
		const steps = (d.builds?.[id] ?? null) as BuildStep[] | null
		const key = playerKey(p.name)
		keyOf.set(id, key)
		players.push({
			key, name: p.name.trim(), id, hero: p.hero, team, won: team === winner, level,
			coins: st?.coins ?? (end ? (end.coins ?? 0) + levelsPaid(level) : null),
			kills: st?.kills ?? null, deaths: st?.deaths ?? null, assists: st?.assists ?? null, minions: st?.minions ?? null,
			mRoles: exact ? minionRoles(d.ev, id) : null,
			path: steps?.length ? pathOfSteps(p.hero, steps) : pathOfFinal(p.hero, end)
		})
	}
	if (players.length < 2) return null
	const defeats = exact
		? ((d.ev ?? []) as GameEvent[]).filter((e): e is Extract<GameEvent, { k: 'hero' }> => e.k === 'hero' && keyOf.has(e.by) && keyOf.has(e.v))
			.map((e) => ({ by: keyOf.get(e.by)!, v: keyOf.get(e.v)!, a: e.a.filter((x) => keyOf.has(x)).map((x) => keyOf.get(x)!), r: e.r ?? 0, t: e.t ?? 0 }))
		: []
	const at = Date.parse(row.ended_at) || Date.parse(row.started_at) || 0
	const minutes = exact?.minutes ?? Math.max(1, Math.round((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 60000) || 0)
	return { id: row.id, room: row.room ?? '', startedAt: Date.parse(row.started_at) || at, at, minutes, rounds: row.rounds ?? d.final?.round ?? 0, winner, type: winType(row.reason ?? d.final?.wonBy?.reason), players, defeats, events: !!exact }
}

// ── the league ────────────────────────────────────────────────────────────────────────────────
type Tally = { games: number; wins: number }
export type Foe = { key: string; name: string; games: number; wins: number; killed: number; killedBy: number }
export type Mate = { key: string; name: string; games: number; wins: number }
export type PathTally = { hero: string; path: Path; games: number; wins: number; by: string[] }
/** Someone else at the table in one game, as the player's log shows them. */
export type TableMate = { key: string; name: string; hero: string; level: number; k: number | null; d: number | null; a: number | null }
/** One game from one player's side — everything the player log shows for it. */
export type MatchLine = { id: string; at: number; startedAt: number; room: string; minutes: number; hero: string; team: Team; won: boolean; type: WinType; rounds: number; level: number
	k: number | null; d: number | null; a: number | null; minions: number | null; mRoles: GamePlayer['mRoles']; coins: number | null; path: Path
	mates: TableMate[]; foes: TableMate[]
	/** who they defeated / who defeated them / whose defeats they assisted — round and turn */
	kills: { name: string; r: number; t: number }[]; deaths: { name: string; r: number; t: number }[]; assisted: { name: string; r: number; t: number }[]
	rating: number; delta: number }
export type PlayerAgg = {
	key: string
	name: string
	games: number
	wins: number
	losses: number
	rating: number
	/** the rating after each of their games, the first point = 1200 before any */
	ratingHist: number[]
	streak: number
	bestStreak: number
	worstStreak: number
	byType: Record<WinType, Tally>
	kills: number
	deaths: number
	assists: number
	/** games with kill / death / assist numbers */
	kdaGames: number
	/** their team's hero defeats in those games (kill participation = (kills + assists) / teamKills) */
	teamKills: number
	minions: number
	coins: number
	coinGames: number
	levels: number
	heroes: Record<string, Tally>
	roles: Record<string, number>
	mates: Mate[]
	foes: Foe[]
	paths: PathTally[]
	history: MatchLine[]
	firstAt: number
	lastAt: number
	peak: number
	minutes: number
	rounds: number
	ults: number
	maxLevel: number
	mRoles: { melee: number; ranged: number; heavy: number }
}
export type HeroAgg = { hero: string; games: number; wins: number; players: Record<string, number>; paths: PathTally[] }
export type Record_ = { id: string; title: string; blurb: string; who: string; value: string; at?: number }
export type League = { games: LeagueGame[]; players: PlayerAgg[]; heroes: HeroAgg[]; records: Record_[]; withEvents: number }

export const START_RATING = 1200
const K = 32
const heroTraits = (id: string) => (HEROES.find((h) => h.id === id)?.traits ?? []) as Trait[]

export function buildLeague(rows: GameRowIn[]): League {
	const games = rows.map((r) => { try { return gameOfRow(r) } catch { return null } }).filter((g): g is LeagueGame => !!g).sort((a, b) => a.at - b.at)
	const P = new Map<string, PlayerAgg & { _mates: Map<string, Mate>; _foes: Map<string, Foe>; _paths: Map<string, PathTally> }>()
	const H = new Map<string, HeroAgg & { _paths: Map<string, PathTally> }>()
	const get = (gp: GamePlayer) => {
		let p = P.get(gp.key)
		if (!p) {
			p = { key: gp.key, name: gp.name, games: 0, wins: 0, losses: 0, rating: START_RATING, ratingHist: [START_RATING], streak: 0, bestStreak: 0, worstStreak: 0,
				byType: { throne: { games: 0, wins: 0 }, final: { games: 0, wins: 0 }, life: { games: 0, wins: 0 }, other: { games: 0, wins: 0 } },
				kills: 0, deaths: 0, assists: 0, kdaGames: 0, teamKills: 0, minions: 0, coins: 0, coinGames: 0, levels: 0, heroes: {}, roles: {},
				mates: [], foes: [], paths: [], history: [], firstAt: 0, lastAt: 0, peak: START_RATING, minutes: 0, rounds: 0, ults: 0, maxLevel: 0, mRoles: { melee: 0, ranged: 0, heavy: 0 }, _mates: new Map(), _foes: new Map(), _paths: new Map() }
			P.set(gp.key, p)
		}
		p.name = gp.name // the latest spelling
		return p
	}
	const addPath = (m: Map<string, PathTally>, gp: GamePlayer) => {
		if (!gp.path.cards.length && !gp.path.ult) return
		const k = `${gp.hero}|${pathKey(gp.path)}`
		const t = m.get(k) ?? { hero: gp.hero, path: gp.path, games: 0, wins: 0, by: [] }
		t.games++
		if (gp.won) t.wins++
		if (!t.by.includes(gp.name)) t.by.push(gp.name)
		if (gp.path.ordered) t.path = gp.path // prefer an ordered example of the same build
		m.set(k, t)
	}
	for (const g of games) {
		// rating: the teams' averages before the game
		const avg = (t: Team) => { const ps = g.players.filter((x) => x.team === t).map((x) => get(x).rating); return ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length) }
		const ra = avg('orange'), rb = avg('blue')
		const expOrange = 1 / (1 + 10 ** ((rb - ra) / 400))
		for (const gp of g.players) {
			const p = get(gp)
			const exp = gp.team === 'orange' ? expOrange : 1 - expOrange
			const delta = Math.round(K * ((gp.won ? 1 : 0) - exp))
			p.rating += delta
			p.ratingHist.push(p.rating)
			p.games++
			if (gp.won) { p.wins++; p.streak = p.streak > 0 ? p.streak + 1 : 1 } else { p.losses++; p.streak = p.streak < 0 ? p.streak - 1 : -1 }
			p.bestStreak = Math.max(p.bestStreak, p.streak)
			p.worstStreak = Math.min(p.worstStreak, p.streak)
			p.byType[g.type].games++
			if (gp.won) p.byType[g.type].wins++
			if (gp.kills != null && gp.deaths != null && gp.assists != null) { p.kills += gp.kills; p.deaths += gp.deaths; p.assists += gp.assists; p.minions += gp.minions ?? 0; p.kdaGames++; p.teamKills += g.players.filter((o) => o.team === gp.team).reduce((n, o) => n + (o.kills ?? 0), 0) }
			if (gp.coins != null) { p.coins += gp.coins; p.coinGames++ }
			p.levels += gp.level
			p.heroes[gp.hero] = { games: (p.heroes[gp.hero]?.games ?? 0) + 1, wins: (p.heroes[gp.hero]?.wins ?? 0) + (gp.won ? 1 : 0) }
			for (const t of heroTraits(gp.hero)) p.roles[t] = (p.roles[t] ?? 0) + 1
			p.lastAt = Math.max(p.lastAt, g.at)
			p.firstAt = p.firstAt ? Math.min(p.firstAt, g.at) : g.at
			p.peak = Math.max(p.peak, p.rating)
			p.minutes += g.minutes
			p.rounds += g.rounds
			if (gp.path.ult) p.ults++
			p.maxLevel = Math.max(p.maxLevel, gp.level)
			if (gp.mRoles) { p.mRoles.melee += gp.mRoles.melee; p.mRoles.ranged += gp.mRoles.ranged; p.mRoles.heavy += gp.mRoles.heavy }
			for (const o of g.players) {
				if (o.key === gp.key) continue
				if (o.team === gp.team) {
					const m = p._mates.get(o.key) ?? { key: o.key, name: o.name, games: 0, wins: 0 }
					m.games++; if (gp.won) m.wins++; m.name = o.name
					p._mates.set(o.key, m)
				} else {
					const f = p._foes.get(o.key) ?? { key: o.key, name: o.name, games: 0, wins: 0, killed: 0, killedBy: 0 }
					f.games++; if (gp.won) f.wins++; f.name = o.name
					for (const dd of g.defeats) { if (dd.by === gp.key && dd.v === o.key) f.killed++; if (dd.by === o.key && dd.v === gp.key) f.killedBy++ }
					p._foes.set(o.key, f)
				}
			}
			addPath(p._paths, gp)
			const nameOf = (k: string) => g.players.find((o) => o.key === k)?.name ?? k
			const at = (x: { r: number; t: number }) => ({ r: x.r, t: x.t })
			const mate = (o: GamePlayer): TableMate => ({ key: o.key, name: o.name, hero: o.hero, level: o.level, k: o.kills, d: o.deaths, a: o.assists })
			p.history.push({ id: g.id, at: g.at, startedAt: g.startedAt, room: g.room, minutes: g.minutes, hero: gp.hero, team: gp.team, won: gp.won, type: g.type, rounds: g.rounds, level: gp.level,
				k: gp.kills, d: gp.deaths, a: gp.assists, minions: gp.minions, mRoles: gp.mRoles, coins: gp.coins, path: gp.path,
				mates: g.players.filter((o) => o.team === gp.team && o.key !== gp.key).map(mate),
				foes: g.players.filter((o) => o.team !== gp.team).map(mate),
				kills: g.defeats.filter((x) => x.by === gp.key).map((x) => ({ name: nameOf(x.v), ...at(x) })),
				deaths: g.defeats.filter((x) => x.v === gp.key).map((x) => ({ name: nameOf(x.by), ...at(x) })),
				assisted: g.defeats.filter((x) => x.a.includes(gp.key)).map((x) => ({ name: nameOf(x.v), ...at(x) })),
				rating: p.rating, delta })
			// heroes
			const h = H.get(gp.hero) ?? { hero: gp.hero, games: 0, wins: 0, players: {} as Record<string, number>, paths: [], _paths: new Map<string, PathTally>() }
			h.games++; if (gp.won) h.wins++
			h.players[gp.name] = (h.players[gp.name] ?? 0) + 1
			addPath(h._paths, gp)
			H.set(gp.hero, h)
		}
	}
	const byPop = (a: PathTally, b: PathTally) => b.games - a.games || b.wins - a.wins
	const players = [...P.values()].map(({ _mates, _foes, _paths, ...p }) => ({
		...p,
		mates: [..._mates.values()].sort((a, b) => b.games - a.games || b.wins - a.wins),
		foes: [..._foes.values()].sort((a, b) => b.killedBy - a.killedBy || b.games - a.games),
		paths: [..._paths.values()].sort(byPop),
		history: [...p.history].reverse()
	})).sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name))
	const heroes = [...H.values()].map(({ _paths, ...h }) => ({ ...h, paths: [..._paths.values()].sort(byPop) })).sort((a, b) => b.games - a.games || b.wins - a.wins)
	return { games, players, heroes, records: records(games, players), withEvents: games.filter((g) => g.events).length }
}

// ── nemesis / partner picks for one player ─────────────────────────────────────────────────────
/** The one who defeated you most (ties: the one you've faced most, then the one you lose to most). */
export const nemesisOf = (p: PlayerAgg): Foe | null =>
	[...p.foes].filter((f) => f.killedBy > 0).sort((a, b) => b.killedBy - a.killedBy || b.games - a.games || a.wins / a.games - b.wins / b.games)[0] ?? null
/** The one you defeated most. */
export const victimOf = (p: PlayerAgg): Foe | null => [...p.foes].filter((f) => f.killed > 0).sort((a, b) => b.killed - a.killed || b.games - a.games)[0] ?? null
/** The opponent you've met most (the rivalry), and the team-mate you win most with (2+ games together if any). */
export const rivalOf = (p: PlayerAgg): Foe | null => [...p.foes].sort((a, b) => b.games - a.games || b.killed + b.killedBy - (a.killed + a.killedBy))[0] ?? null
export const bestMateOf = (p: PlayerAgg): Mate | null => {
	const pool = p.mates.some((m) => m.games >= 2) ? p.mates.filter((m) => m.games >= 2) : p.mates
	return [...pool].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] ?? null
}
export const worstMateOf = (p: PlayerAgg): Mate | null => {
	const pool = p.mates.filter((m) => m.games >= 2)
	const w = [...pool].sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games)[0]
	return w && w.wins < w.games ? w : null
}

// ── a title or two for each player: the per-game stat they lead the table in ─────────────────────
const TITLES: { title: string; blurb: string; val: (p: PlayerAgg) => number | null; low?: boolean }[] = [
	{ title: 'Headhunter', blurb: 'Most hero kills a game', val: (p) => (p.kdaGames ? p.kills / p.kdaGames : null) },
	{ title: 'Guardian Angel', blurb: 'Most assists a game', val: (p) => (p.kdaGames ? p.assists / p.kdaGames : null) },
	{ title: 'Frequent Flyer', blurb: 'Most respawns a game', val: (p) => (p.kdaGames ? p.deaths / p.kdaGames : null) },
	{ title: 'Survivor', blurb: 'Fewest defeats a game', val: (p) => (p.kdaGames >= 2 ? p.deaths / p.kdaGames : null), low: true },
	{ title: 'Minion Farmer', blurb: 'Most minions a game', val: (p) => (p.kdaGames ? p.minions / p.kdaGames : null) },
	{ title: 'Banker', blurb: 'Most coins a game', val: (p) => (p.coinGames ? p.coins / p.coinGames : null) },
	{ title: 'Lucky Charm', blurb: 'Best win rate (3+ games)', val: (p) => (p.games >= 3 ? p.wins / p.games : null) },
	{ title: 'Veteran', blurb: 'Most games played', val: (p) => p.games }
]
/** player key → the titles they hold (only with 2+ players to compare; a tie goes to nobody) */
export function titlesOf(players: PlayerAgg[]): Record<string, { title: string; blurb: string }[]> {
	const out: Record<string, { title: string; blurb: string }[]> = {}
	if (players.length < 2) return out
	for (const t of TITLES) {
		const vals = players.map((p) => ({ p, v: t.val(p) })).filter((x): x is { p: PlayerAgg; v: number } => x.v != null)
		if (vals.length < 2) continue
		vals.sort((a, b) => (t.low ? a.v - b.v : b.v - a.v))
		if (vals[0].v === vals[1].v || (!t.low && vals[0].v <= 0)) continue
		;(out[vals[0].p.key] ??= []).push({ title: t.title, blurb: t.blurb })
	}
	return out
}

// ── the silly records ───────────────────────────────────────────────────────────────────────────
function records(games: LeagueGame[], players: PlayerAgg[]): Record_[] {
	const out: Record_[] = []
	const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id
	const best = (title: string, blurb: string, val: (gp: GamePlayer, g: LeagueGame) => number | null, fmt: (n: number) => string, min = 1) => {
		let top: { gp: GamePlayer; g: LeagueGame; v: number } | null = null
		for (const g of games) for (const gp of g.players) {
			const v = val(gp, g)
			if (v != null && v >= min && (!top || v > top.v)) top = { gp, g, v }
		}
		if (top) out.push({ id: title, title, blurb, who: `${top.gp.name} (${heroName(top.gp.hero)})`, value: fmt(top.v), at: top.g.at })
	}
	best('Bloodthirsty', 'Most heroes defeated in one game', (gp) => gp.kills, (n) => `${n} kills`)
	best('Respawn Enthusiast', 'Most times defeated in one game', (gp) => gp.deaths, (n) => `${n} deaths`)
	best('Wingman', 'Most assists in one game', (gp) => gp.assists, (n) => `${n} assists`)
	best('Minion Menace', 'Most minions defeated in one game', (gp) => gp.minions, (n) => `${n} minions`)
	best('Dragon\'s Hoard', 'Most coins earned in one game', (gp) => gp.coins, (n) => `${n} coins`)
	best('Untouchable', 'Won without being defeated once — most kills while at it', (gp) => (gp.won && gp.deaths === 0 ? gp.kills ?? 0 : null), (n) => `${n} kills, 0 deaths`, 0)
	best('Pacifist', 'Won without defeating a single hero — the most assists while at it', (gp) => (gp.won && gp.kills === 0 ? gp.assists ?? 0 : null), (n) => `0 kills, ${n} assists`, 0)
	// whole games
	const fast = [...games].filter((g) => g.rounds > 0).sort((a, b) => a.rounds - b.rounds || a.minutes - b.minutes)[0]
	if (fast) out.push({ id: 'speedrun', title: 'Speedrun', blurb: 'The quickest win', who: fast.players.filter((p) => p.won).map((p) => p.name).join(' & '), value: `${fast.rounds} round${fast.rounds === 1 ? '' : 's'}`, at: fast.at })
	const long = [...games].sort((a, b) => b.minutes - a.minutes)[0]
	if (long && long.minutes > 1) out.push({ id: 'marathon', title: 'Marathon', blurb: 'The longest game', who: long.players.map((p) => p.name).join(', '), value: long.minutes >= 60 ? `${Math.floor(long.minutes / 60)}h ${long.minutes % 60}m` : `${long.minutes}m`, at: long.at })
	// careers
	const top = (title: string, blurb: string, val: (p: PlayerAgg) => number, fmt: (n: number, p: PlayerAgg) => string, min = 1) => {
		const p = [...players].sort((a, b) => val(b) - val(a))[0]
		if (p && val(p) >= min) out.push({ id: title, title, blurb, who: p.name, value: fmt(val(p), p) })
	}
	top('On Fire', 'The longest winning streak', (p) => p.bestStreak, (n) => `${n} in a row`, 2)
	top('Cursed', 'The longest losing streak', (p) => -p.worstStreak, (n) => `${n} in a row`, 2)
	top('Hero Hopper', 'The most different heroes played', (p) => Object.keys(p.heroes).length, (n) => `${n} heroes`, 2)
	top('One-Trick', 'Most games on one hero', (p) => Math.max(0, ...Object.values(p.heroes).map((h) => h.games)), (n, p) => {
		const h = Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games)[0]
		return `${heroName(h[0])} × ${n}`
	}, 3)
	return out
}

// ── reading the table ───────────────────────────────────────────────────────────────────────────
// Only the parts of `data` the league reads (not the whole log or the draft), each as its own column.
const DATA_KEYS = ['seats', 'mapId', 'draftSystem', 'lifeMax', 'wavesMax', 'players', 'turns', 'final', 'ev', 'builds'] as const
export const LEAGUE_SELECT = `id,room,started_at,ended_at,winner,reason,rounds,${DATA_KEYS.map((k) => `d_${k}:data->${k}`).join(',')}`
/** A row fetched with LEAGUE_SELECT back into the uploaded shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowOfSelect(r: any): GameRowIn {
	const data: Record<string, unknown> = {}
	for (const k of DATA_KEYS) if (r[`d_${k}`] != null) data[k] = r[`d_${k}`]
	return { id: r.id, room: r.room, started_at: r.started_at, ended_at: r.ended_at, winner: r.winner, reason: r.reason, rounds: r.rounds, data }
}
