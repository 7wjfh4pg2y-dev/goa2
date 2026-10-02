// The battle report's numbers, worked out from this browser's own journal of the game
// (recorder.ts). Pure: a journal in, the report's data out — or null when the journal can't
// vouch for the whole game (joined late, away for a whole turn, begun before events were
// recorded). Never half a game's numbers shown as if they were all of it.
//
// Where each number comes from:
//  · rounds            the round the game ended in (the final state)                      — exact
//  · minutes           this browser's clock, from the first turn on screen to the win     — exact to the minute
//  · level             the final card state (1 + upgrade cards + the ultimate)            — exact
//  · coins (earned)    coins held at the end + what every level cost (level L → L+1
//                      costs L, and every level is paid): all the coins a hero took in    — exact (net of manual −)
//  · kills / deaths /  the journal's hero events: one per `lastDefeat` news id, with the
//    assists           killer, the fallen and the assisting team-mates by player id       — exact
//  · minions           the journal's minion events: a minion left the board in the same
//                      change that paid a player 2 coins (heavy 4)                        — exact on the host and whenever
//                      every change arrived on its own; best effort if two were merged
//  · tide              the battle zone in each turn's snapshot; a throne push ends it on
//                      the throne                                                         — exact
//  · falls             the hero events again: the turn, the fallen hero's team, who       — exact
import type { GameStatsData, PlayerStat } from './GameStats.svelte'
import type { GameEvent, Journal } from './recorder'
import { colorHex, type Team } from './match'
import { HEROES } from './heroes'

const TURNS = 4 // turns in a round (the report's chart counts in fours too)
const turnIndex = (round: number, turn: number) => (round - 1) * TURNS + (turn - 1)

/** What a hero has paid for its levels: 1 + 2 + … + (level − 1). */
export const levelsPaid = (level: number) => (Math.max(1, level) * (Math.max(1, level) - 1)) / 2

const seen = new WeakMap<Journal, GameStatsData | null>()

/** The battle report for a journal (the same object back for the same journal), or null. */
export function statsFromJournal(j: Journal | null | undefined): GameStatsData | null {
	if (!j) return null
	if (seen.has(j)) return seen.get(j) ?? null
	let out: GameStatsData | null = null
	try { out = build(j) } catch { out = null }
	seen.set(j, out)
	return out
}

function build(j: Journal): GameStatsData | null {
	// the whole game or nothing: seen from the first turn, with the structured events
	if (!j.fromStart || !Array.isArray(j.ev)) return null
	const snaps = j.cur ? [...(j.turns ?? []), j.cur] : (j.turns ?? [])
	const last = j.final ?? j.cur
	if (!last || !snaps.length) return null

	// ── the tide: the battle zone in every turn, first turn to last, none missing ──
	const n = turnIndex(last.round, last.turn) + 1
	if (!(n >= 1) || n > 400) return null
	const lanes = new Map<number, number>()
	for (const s of snaps) lanes.set(turnIndex(s.round, s.turn), s.lane ?? 1)
	const tide: number[] = []
	for (let i = 0; i < n; i++) {
		const l = lanes.get(i)
		if (l == null) return null // away for a whole turn: its defeats may be missing too
		tide.push(Math.max(0, Math.min(2, l)))
	}
	const won = j.final?.wonBy
	if (won) {
		tide[n - 1] = Math.max(0, Math.min(2, j.final?.lane ?? tide[n - 1]))
		// a push past the beach: the zone itself stays, the game ends on the throne
		if (/throne/i.test(won.reason)) tide[n - 1] = won.team === 'orange' ? 3 : -1
	}

	// ── the heroes: one per seat (a seat taken over mid-game keeps its numbers) ──
	const endCards = (j.final?.cards ?? {}) as Record<string, { coins?: number; level?: number; upgrade?: unknown[]; ultimate?: boolean }>
	const seatOf = new Map<string, number>()
	const owner = new Map<number, string>()
	for (const [id, p] of Object.entries(j.players ?? {})) {
		if (!p?.hero && !endCards[id]) continue
		seatOf.set(id, p.seat)
		if (!owner.has(p.seat) || endCards[id] || !endCards[owner.get(p.seat)!]) owner.set(p.seat, id)
	}
	if (!owner.size) return null
	const seats = [...owner.keys()].sort((a, b) => a - b)
	const count = (hit: (e: GameEvent) => boolean) => j.ev!.reduce((k, e) => k + (hit(e) ? 1 : 0), 0)
	const at = (id: string) => seatOf.get(id)
	const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id
	const players: PlayerStat[] = seats.map((seat) => {
		const id = owner.get(seat)!
		const p = j.players[id]
		const end = endCards[id]
		const cur = j.cur?.cards?.[id]
		const level = end ? 1 + (end.upgrade?.length ?? Math.max(0, (end.level ?? 1) - 1 - (end.ultimate ? 1 : 0))) + (end.ultimate ? 1 : 0) : (cur?.lv ?? 1)
		const held = end?.coins ?? cur?.coins ?? 0
		const team: Team = p.team ?? (seat < Math.floor((j.seats || 2) / 2) ? 'orange' : 'blue')
		return {
			id, name: p.name, color: colorHex(p.color ?? ''), hero: p.hero, team, level,
			kills: count((e) => e.k === 'hero' && at(e.by) === seat),
			deaths: count((e) => e.k === 'hero' && at(e.v) === seat),
			assists: count((e) => e.k === 'hero' && e.a.some((a) => at(a) === seat)),
			minions: count((e) => e.k === 'minion' && at(e.by) === seat),
			coins: held + levelsPaid(level)
		}
	})

	// ── the falls: every hero defeat, on its turn ──
	const bySeat = new Map(players.map((p) => [at(p.id), p]))
	const falls: GameStatsData['falls'] = []
	for (const e of j.ev) {
		if (e.k !== 'hero') continue
		const v = bySeat.get(at(e.v))
		const team = e.team ?? v?.team
		if (!team) continue
		falls.push({ turn: Math.max(0, Math.min(n - 1, turnIndex(e.r, e.t))), team, who: v ? `${v.name} (${heroName(v.hero)})` : 'A hero' })
	}
	falls.sort((a, b) => a.turn - b.turn)

	return { rounds: last.round, minutes: Math.max(1, Math.round((j.lastAt - j.startedAt) / 60000)), players, tide, falls }
}
