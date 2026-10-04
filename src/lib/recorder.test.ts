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
	it('logs each player\'s build: one step per change, in order — kept upgrades, items, the ultimate', () => {
		const c = base().cards!
		// arien: 7 = Expert Duelist (BLUE II, twin 10), 13 = Master Duelist (BLUE III, twin 16); 4 = the BLUE I card
		const at = (over: object, turn = 1, round = 1) => base({ round, turn, cards: { ...c, a: { ...c.a, hand: [0, 4, 5, 6], upgrade: [], ...over } } } as Partial<MatchState>)
		let j = journalUpdate(newJournal('ROOM', base()), at({}))
		expect(j.builds?.a).toEqual([{ r: 1, t: 1, lv: 1, keep: [], up: [], ult: false }])
		j = journalUpdate(j, at({ level: 2, hand: [0, 7, 5, 6], upgrade: [10] }, 4))
		j = journalUpdate(j, at({ level: 2, hand: [0, 7, 5, 6], upgrade: [10] }, 4)) // nothing new
		// round 2: the Tier III blue, played this turn (still counts as kept), the Tier II twin goes to the items
		j = journalUpdate(j, at({ level: 3, hand: [0, 5, 6], turns: [13, null, null, null], upgrade: [10, 7, 16] }, 1, 2))
		expect(j.builds?.a.map((b) => [b.lv, b.keep, b.up])).toEqual([[1, [], []], [2, [7], [10]], [3, [13], [7, 10, 16]]])
		expect(gameRow({ ...j, done: true }).data.builds?.a).toHaveLength(3)
	})
	it('uses the same id on every client', () => {
		expect(gameId('ROOM', base())).toBe('ROOM-123')
		expect(gameId('ROOM', base({ gameId: 'g1', startFlip: null } as Partial<MatchState>))).toBe('ROOM-g1')
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
		expect(j.players.a).toEqual({ name: 'Zara', seat: 0, hero: 'arien', team: 'orange' })
		expect(j.draft?.picks).toEqual({ a: 'arien', b: 'brogan' })
		// turn 1's card is filled in when the turn moves on
		expect(j.turns[0].cards.a.played).toBe(7)
	})
	it('records the committed (pending) card during the turn', () => {
		const c = base().cards!
		const j = journalUpdate(newJournal('ROOM', base()), base({ cards: { ...c, b: { ...c.b, pending: 3 } } }))
		expect(j.cur?.cards.b.played).toBe(3)
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
	it('keeps structured events: one per hero-defeat news id (a stale one in the room is not this game\'s)', () => {
		const news = (id: string) => ({ id, victim: 'b', by: 'a', coins: 1, assist: 1, assists: [], lives: 1, team: 'blue', at: 1 })
		const stale = base({ lastDefeat: news('old') } as Partial<MatchState>)
		let j = journalUpdate(newJournal('ROOM', stale), stale)
		expect(j.ev).toEqual([])
		j = journalUpdate(j, base({ turn: 2, lastDefeat: news('d1'), defeated: { b: { round: 1, turn: 2, piece: {} } } } as unknown as Partial<MatchState>))
		const same = journalUpdate(j, base({ turn: 2, lastDefeat: news('d1') } as Partial<MatchState>))
		expect(same.ev).toEqual([{ k: 'hero', id: 'd1', r: 1, t: 2, by: 'a', v: 'b', a: [], c: 1, ac: 1, l: 1, team: 'blue' }])
		expect(gameRow(same).data.ev).toHaveLength(1)
	})
	it('joining mid-game, or playing alone, is a test run', () => {
		const late = journalUpdate(newJournal('ROOM', base({ round: 2 })), base({ round: 3, wonBy: { team: 'orange', reason: 'x' } }))
		expect(isFullGame(late)).toBe(false)
		const solo = base({ seatMap: { '0': { id: 'a', name: 'Zara' } } })
		const alone = journalUpdate(journalUpdate(newJournal('ROOM', solo), solo), { ...solo, wonBy: { team: 'orange', reason: 'x' } })
		expect(isFullGame(alone)).toBe(false)
	})
})
