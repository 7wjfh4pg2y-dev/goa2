// The Hall of Records' numbers for the charts and panels (pure; tested in hallstats.test.ts): trends over time,
// a hero's rank, its matchups (with / against, as win-rate points above or below its own rate), how it does by
// game size and side, who plays it, and a player's roles, trend and best / worst team-mates and opponents.
import type { League, LeagueGame, HeroAgg, PlayerAgg, MatchLine } from './league'
import { HEROES, type Trait } from './heroes'
import type { Team } from './match'

const dayLabel = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const rate = (w: number, g: number) => (g ? (100 * w) / g : 0)
const one = (n: number) => Math.round(n * 10) / 10

/** The games in at most `n` chronological chunks of about the same size (the x-axis of a trend). */
export function buckets<T extends { at: number }>(games: T[], n = 8): T[][] {
	const list = [...games].sort((a, b) => a.at - b.at)
	if (!list.length) return []
	const k = Math.min(n, list.length)
	return Array.from({ length: k }, (_, i) => list.slice(Math.floor((i * list.length) / k), Math.floor(((i + 1) * list.length) / k)))
}

export type Trend = { labels: string[]; win: (number | null)[]; pick: number[] }
/** A hero over time: its win rate so far (cumulative, so small samples stay readable) and its pick rate in each chunk. */
export function heroTrend(games: LeagueGame[], hero: string, n = 8): Trend {
	const out: Trend = { labels: [], win: [], pick: [] }
	let g = 0, w = 0
	for (const b of buckets(games, n)) {
		let picks = 0
		for (const x of b) for (const p of x.players) if (p.hero === hero) { picks++; g++; if (p.won) w++ }
		out.labels.push(dayLabel(b[b.length - 1].at))
		out.win.push(g ? one(rate(w, g)) : null)
		out.pick.push(one(rate(picks, b.length)))
	}
	return out
}

/** Every hero's place by win rate (ties: more games first) and by picks, out of how many heroes were played. */
export function heroRanks(heroes: HeroAgg[]): Map<string, { win: number; pick: number; of: number }> {
	const byWin = [...heroes].sort((a, b) => rate(b.wins, b.games) - rate(a.wins, a.games) || b.games - a.games)
	const byPick = [...heroes].sort((a, b) => b.games - a.games || b.wins - a.wins)
	return new Map(heroes.map((h) => [h.hero, { win: byWin.indexOf(h) + 1, pick: byPick.indexOf(h) + 1, of: heroes.length }]))
}

export type Matchup = { hero: string; games: number; wins: number; delta: number }
/** A hero's matchups: its win rate against (or with) each other hero, in points above / below its own win rate.
 *  The best and the worst three (only heroes met twice or more, when there are any). */
export function matchups(h: HeroAgg, side: 'against' | 'with'): { best: Matchup[]; worst: Matchup[] } {
	const base = rate(h.wins, h.games)
	const all = Object.entries(side === 'against' ? h.foes : h.mates).map(([hero, t]) => ({ hero, games: t.games, wins: t.wins, delta: one(rate(t.wins, t.games) - base) }))
	const pool = all.some((m) => m.games >= 2) ? all.filter((m) => m.games >= 2) : all
	return {
		best: pool.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || b.games - a.games).slice(0, 3),
		worst: pool.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || b.games - a.games).slice(0, 3)
	}
}

export type HeroMatchups = { games: number; strong: Matchup[]; weak: Matchup[]; partners: Matchup[] }
/** The hero page's Matchups from the records: strong against / struggles against (its best and worst foes) and
 *  best with (its best team-mates). Null when the hero has no recorded games. */
export function heroMatchups(league: League | null, hero: string): HeroMatchups | null {
	const h = league?.heroes.find((x) => x.hero === hero)
	if (!h || !h.games) return null
	const vs = matchups(h, 'against')
	return { games: h.games, strong: vs.best, weak: vs.worst, partners: matchups(h, 'with').best }
}

export type Split = {
	key: string; label: string; games: number; wins: number; share: number; win: number
	/** per game, over the games that kept the numbers (null when none did) */
	k: number | null; d: number | null; a: number | null; minions: number | null; gold: number | null
	players: { key: string; name: string; games: number; wins: number }[]
}
type Acc = { games: number; wins: number; kg: number; k: number; d: number; a: number; mg: number; m: number; cg: number; c: number; players: Map<string, { key: string; name: string; games: number; wins: number }> }
const acc = (): Acc => ({ games: 0, wins: 0, kg: 0, k: 0, d: 0, a: 0, mg: 0, m: 0, cg: 0, c: 0, players: new Map() })
const add = (x: Acc, p: LeagueGame['players'][number]) => {
	x.games++; if (p.won) x.wins++
	if (p.kills != null && p.deaths != null) { x.kg++; x.k += p.kills; x.d += p.deaths; x.a += p.assists ?? 0 }
	if (p.minions != null) { x.mg++; x.m += p.minions }
	if (p.coins != null) { x.cg++; x.c += p.coins }
	const pl = x.players.get(p.key) ?? { key: p.key, name: p.name, games: 0, wins: 0 }
	pl.games++; if (p.won) pl.wins++; pl.name = p.name
	x.players.set(p.key, pl)
}
const split = (key: string, label: string, x: Acc, total: number): Split => ({
	key, label, games: x.games, wins: x.wins, share: one(rate(x.games, total)), win: one(rate(x.wins, x.games)),
	k: x.kg ? one(x.k / x.kg) : null, d: x.kg ? one(x.d / x.kg) : null, a: x.kg ? one(x.a / x.kg) : null,
	minions: x.mg ? one(x.m / x.mg) : null, gold: x.cg ? one(x.c / x.cg) : null,
	players: [...x.players.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)
})

/** How a hero does by game size (2 v 2, 3 v 3 …) and by side (Atlanteans / Titans). */
export function heroSplits(games: LeagueGame[], hero: string): { sizes: Split[]; sides: Split[]; all: Split } {
	const size = new Map<number, Acc>(), side: Record<Team, Acc> = { orange: acc(), blue: acc() }, all = acc()
	for (const g of games) for (const p of g.players) {
		if (p.hero !== hero) continue
		const s = size.get(g.side) ?? acc()
		add(s, p); size.set(g.side, s); add(side[p.team], p); add(all, p)
	}
	return {
		sizes: [...size.entries()].sort((a, b) => a[0] - b[0]).map(([n, x]) => split(`${n}v${n}`, `${n} v ${n}`, x, all.games)),
		sides: (['orange', 'blue'] as Team[]).filter((t) => side[t].games).map((t) => split(t, t === 'orange' ? 'Atlanteans' : 'Titans', side[t], all.games)),
		all: split('all', 'All', all, all.games)
	}
}

/** A player's roles: every role of every hero they played, with games and wins. */
export function playerRoles(p: PlayerAgg): { trait: Trait; games: number; wins: number; share: number }[] {
	const m = new Map<Trait, { games: number; wins: number }>()
	for (const x of p.history) for (const t of (HEROES.find((h) => h.id === x.hero)?.traits ?? []) as Trait[]) {
		const r = m.get(t) ?? { games: 0, wins: 0 }
		r.games++; if (x.won) r.wins++
		m.set(t, r)
	}
	return [...m.entries()].map(([trait, r]) => ({ trait, ...r, share: one(rate(r.games, p.games)) })).sort((a, b) => b.games - a.games || b.wins - a.wins)
}

/** A player's win rate after each of their games, oldest first (the history is newest first). */
export function winTrend(history: MatchLine[]): number[] {
	let w = 0
	return [...history].reverse().map((m, i) => { if (m.won) w++; return one(rate(w, i + 1)) })
}

export type PeopleMatch = { key: string; name: string; games: number; wins: number; delta: number }
/** A player's best and worst team-mates (with) and opponents (against), in win-rate points against their own rate. */
export function peopleMatchups(p: PlayerAgg, side: 'with' | 'against'): { best: PeopleMatch[]; worst: PeopleMatch[] } {
	const base = rate(p.wins, p.games)
	const all = (side === 'with' ? p.mates : p.foes).map((m) => ({ key: m.key, name: m.name, games: m.games, wins: m.wins, delta: one(rate(m.wins, m.games) - base) }))
	const pool = all.some((m) => m.games >= 2) ? all.filter((m) => m.games >= 2) : all
	return {
		best: pool.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || b.games - a.games).slice(0, 3),
		worst: pool.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || b.games - a.games).slice(0, 3)
	}
}

/** The whole league at a glance. */
export function overview(L: League) {
	const g = L.games
	const timed = g.filter((x) => x.minutes > 0)
	const sideWins: Record<Team, number> = { orange: g.filter((x) => x.winner === 'orange').length, blue: g.filter((x) => x.winner === 'blue').length }
	const byType = { throne: 0, final: 0, life: 0, other: 0 }
	for (const x of g) byType[x.type]++
	const kills = g.reduce((s, x) => s + x.players.reduce((n, p) => n + (p.kills ?? 0), 0), 0)
	const kgames = g.filter((x) => x.players.some((p) => p.kills != null)).length
	return {
		games: g.length, players: L.players.length, heroes: L.heroes.length, sideWins, byType,
		avgMinutes: timed.length ? Math.round(timed.reduce((s, x) => s + x.minutes, 0) / timed.length) : null,
		avgRounds: timed.length ? one(timed.reduce((s, x) => s + x.rounds, 0) / timed.length) : null,
		killsPerGame: kgames ? one(kills / kgames) : null,
		first: g[0]?.at ?? 0, last: g[g.length - 1]?.at ?? 0
	}
}

/** Mastery on a hero: games won, minus half the games lost — playing a lot AND winning a lot both count
 *  (4–0 beats 5–5, 3–3 beats 1–0, 8–2 beats 3–0). */
export const mastery = (wins: number, games: number) => wins - (games - wins) / 2
export type HeroPlayer = { key: string; name: string; games: number; wins: number }
/** Every hero's players (games + wins), from every game. */
export function heroPlayers(games: LeagueGame[]): Map<string, HeroPlayer[]> {
	const m = new Map<string, Map<string, HeroPlayer>>()
	for (const g of games) for (const p of g.players) {
		const h = m.get(p.hero) ?? new Map<string, HeroPlayer>()
		const x = h.get(p.key) ?? { key: p.key, name: p.name, games: 0, wins: 0 }
		x.games++; if (p.won) x.wins++; x.name = p.name
		h.set(p.key, x); m.set(p.hero, h)
	}
	return new Map([...m].map(([hero, h]) => [hero, [...h.values()].sort(byMastery)]))
}
/** The best on a hero: the highest mastery, then the better win rate, then more games. */
export const byMastery = (a: HeroPlayer, b: HeroPlayer) => mastery(b.wins, b.games) - mastery(a.wins, a.games) || b.wins / b.games - a.wins / a.games || b.games - a.games

/** A player's record on each side of the board. */
export function sideRecord(history: MatchLine[]): Record<Team, { games: number; wins: number }> {
	const out: Record<Team, { games: number; wins: number }> = { orange: { games: 0, wins: 0 }, blue: { games: 0, wins: 0 } }
	for (const m of history) { out[m.team].games++; if (m.won) out[m.team].wins++ }
	return out
}
