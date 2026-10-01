import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { newJournal, journalUpdate, isFullGame, gameRow, gameId } from './recorder'
import type { MatchState } from './match'

const base = (over: Partial<MatchState> = {}): MatchState => ({
	round: 1, turn: 1, seats: 2, mapId: 'fi', draftSystem: 'all-pick', lifeMax: 5, wavesMax: 5, waves: 5, lane: 1,
	life: { orange: 5, blue: 5 }, started: true, startFlip: { side: 'orange', at: 123 }, host: 'a',
	seatMap: { '0': { id: 'a', name: 'Zara' }, '1': { id: 'b', name: 'Priya' } },
	cards: { a: { hero: 'arien', level: 1, coins: 0, turns: [null, null, null, null] }, b: { hero: 'brogan', level: 1, coins: 0, turns: [null, null, null, null] } },
	draft: { picks: { a: 'arien', b: 'brogan' }, bans: [], order: [] },
	log: [], wonBy: null, ...over
} as unknown as MatchState)

describe('game recorder', () => {
	it('uses the same id on every client', () => {
		expect(gameId('ROOM', base())).toBe('ROOM-123')
	})
	it('keeps the whole log, one snapshot per turn, and the players', () => {
		let j = newJournal('ROOM', base())
		expect(j.fromStart).toBe(true)
		const logs = Array.from({ length: 80 }, (_, i) => ({ id: `l${i}`, by: 'x', text: `t${i}`, at: i }))
		j = journalUpdate(j, base({ log: logs.slice(0, 60) }))
		j = journalUpdate(j, base({ log: logs.slice(20, 80), turn: 2, cards: { ...base().cards!, a: { ...base().cards!.a, turns: [7, null, null, null], coins: 2 } } }))
		expect(j.log.map((e) => e.id)).toEqual(logs.map((e) => e.id))
		expect(j.turns).toHaveLength(1)
		expect(j.cur?.turn).toBe(2)
		expect(j.players.a).toEqual({ name: 'Zara', seat: 0, hero: 'arien' })
		expect(j.draft?.picks).toEqual({ a: 'arien', b: 'brogan' })
	})
	it('returns the same journal when nothing changed', () => {
		const j = journalUpdate(newJournal('ROOM', base()), base())
		expect(journalUpdate(j, base())).toBe(j)
	})
	it('a full game = seen from turn 1, won, two people seated', () => {
		let j = journalUpdate(newJournal('ROOM', base()), base())
		expect(isFullGame(j)).toBe(false)
		j = journalUpdate(j, base({ round: 4, wonBy: { team: 'blue', reason: 'won the Final Push' } }))
		expect(isFullGame(j)).toBe(true)
		const row = gameRow(j)
		expect(row).toMatchObject({ id: 'ROOM-123', winner: 'blue', reason: 'won the Final Push', rounds: 4, players: 2 })
		expect(row.data.turns.length).toBeGreaterThan(0)
	})
	it('joining mid-game, or playing alone, is a test run', () => {
		const late = journalUpdate(newJournal('ROOM', base({ round: 2 })), base({ round: 3, wonBy: { team: 'orange', reason: 'x' } }))
		expect(isFullGame(late)).toBe(false)
		const solo = base({ seatMap: { '0': { id: 'a', name: 'Zara' } } })
		const alone = journalUpdate(journalUpdate(newJournal('ROOM', solo), solo), { ...solo, wonBy: { team: 'orange', reason: 'x' } })
		expect(isFullGame(alone)).toBe(false)
	})
})
