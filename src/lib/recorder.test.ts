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
		expect(same.ev).toEqual([{ k: 'hero', id: 'd1', r: 1, t: 2, by: 'a', v: 'b', a: [], c: 1, ac: 1, l: 1, team: 'blue', kl: 1, i: -1 }])
		expect(gameRow(same).data.ev).toHaveLength(1)
	})
	it('records how attacks end (defended / died / …) and an ACE when a whole team is down — and follows Undo', () => {
		const clash = (id: string, out: string, disc = false) => ({ id, kind: 'attack', by: 'a', v: 'b', out, disc, at: 1 })
		const kill = { lastDefeat: { id: 'd1', victim: 'b', by: 'a', coins: 1, assist: 0, assists: [], lives: 1, team: 'blue', at: 1 }, defeated: { b: { round: 1, turn: 2, piece: {} } } }
		let j = journalUpdate(newJournal('ROOM', base()), base({ lastClash: clash('old', 'defended') } as unknown as Partial<MatchState>))
		expect(j.evv).toBe(3)
		j = journalUpdate(j, base({ lastClash: clash('c1', 'defended', true) } as unknown as Partial<MatchState>))
		expect(j.ev!.filter((e) => e.k === 'clash')).toEqual([{ k: 'clash', id: 'c1', r: 1, t: 1, kind: 'attack', by: 'a', v: 'b', out: 'defended', disc: true, i: -1 }])
		// turn 2: a defended-and-still-died; B is Blue's only hero → an ace for Orange
		j = journalUpdate(j, base({ turn: 2, lastClash: clash('c2', 'died', true), ...kill } as unknown as Partial<MatchState>))
		expect(j.ev!.map((e) => e.k)).toEqual(['clash', 'hero', 'clash', 'ace'])
		expect(j.ev!.find((e) => e.k === 'ace')).toMatchObject({ team: 'orange', r: 1, t: 2 })
		// the host undoes it: back to c1, nobody down
		j = journalUpdate(j, base({ turn: 2, lastClash: clash('c1', 'defended', true) } as unknown as Partial<MatchState>))
		expect(j.ev!.map((e) => e.id)).toEqual(['c1']) // the defeat, its clash and the ace all come off
		expect(gameRow({ ...j, done: true }).data.evv).toBe(3)
	})
	it('joining mid-game, or playing alone, is a test run', () => {
		const late = journalUpdate(newJournal('ROOM', base({ round: 2 })), base({ round: 3, wonBy: { team: 'orange', reason: 'x' } }))
		expect(isFullGame(late)).toBe(false)
		const solo = base({ seatMap: { '0': { id: 'a', name: 'Zara' } } })
		const alone = journalUpdate(journalUpdate(newJournal('ROOM', solo), solo), { ...solo, wonBy: { team: 'orange', reason: 'x' } })
		expect(isFullGame(alone)).toBe(false)
	})
	it('records the board after every card (evv 3): moves per segment, piece tags, zones — and an undo back into the turn', () => {
		const map = { cells: { '1_1': 'middle', '2_1': 'middle', '3_1': 'forest' } }
		const hero = (id: string, hex: string, team: string) => ({ id, hex, team, kind: 'hero', hero: id === 'a' ? 'arien' : 'brogan' })
		const c = base().cards!
		// planning (nothing in play) → then both cards revealed: a (init higher?) acts first, whoever the order says
		const plan = base({ map, pieces: { a: hero('a', '1_1', 'orange'), b: hero('b', '2_1', 'blue') } } as unknown as Partial<MatchState>)
		let j = journalUpdate(newJournal('ROOM', plan), plan)
		expect(j.zones?.['1_1']).toBe('Center')
		expect(j.pcs?.a).toMatchObject({ k: 'hero', tm: 'orange', h: 'arien' })
		expect(j.bcur).toMatchObject({ r: 1, t: 1, i: -1 })
		const played = { ...c, a: { ...c.a, pending: 0, hand: [], upgrade: [] }, b: { ...c.b, pending: 0, hand: [], upgrade: [] } }
		const at = (idx: number, pieces: object, extra: object = {}) => base({ map, cards: played, tieBreaker: 'orange', revealAt: 1, acting: { key: '1-1', idx }, pieces, ...extra } as unknown as Partial<MatchState>)
		j = journalUpdate(j, at(0, { a: hero('a', '1_1', 'orange'), b: hero('b', '2_1', 'blue') }))
		expect(j.shots).toHaveLength(1) // planning closed
		const first = j.bcur!.pid!
		// the first card moves its hero and drops a zombie
		j = journalUpdate(j, at(0, { a: hero('a', '3_1', 'orange'), b: hero('b', '2_1', 'blue'), z1: { id: 'z1', hex: '1_1', team: 'orange', kind: 'token', token: 'token_zombie', owner: 'a' } }))
		expect(j.bcur!.p).toMatchObject({ a: '3_1', z1: '1_1' })
		expect(j.pcs?.z1).toMatchObject({ k: 'token', tk: 'token_zombie', o: 'a' })
		j = journalUpdate(j, at(1, { a: hero('a', '3_1', 'orange'), b: hero('b', '2_1', 'blue'), z1: { id: 'z1', hex: '1_1', team: 'orange', kind: 'token', token: 'token_zombie', owner: 'a' } }))
		expect(j.shots!.map((x) => [x.i, x.pid])).toEqual([[-1, null], [0, first]])
		expect(j.shots![1].card).toBe(0)
		// the host undoes the end of that card: back to segment 0 — the closed shot comes off and the segment goes on
		j = journalUpdate(j, at(0, { a: hero('a', '3_1', 'orange'), b: hero('b', '2_1', 'blue') }))
		expect(j.shots!.map((x) => x.i)).toEqual([-1])
		expect(j.bcur).toMatchObject({ i: 0 })
		// the row carries the board, still-open segment included
		const row = gameRow(j)
		expect(row.data.shots).toHaveLength(2)
		expect(row.data.zones?.['3_1']).toBe('Orange Jungle')
	})
	it('records effects, discards (and why), and the host notes — merged by id, never dropped', () => {
		const c = base().cards!
		let j = journalUpdate(newJournal('ROOM', base()), base())
		const fx = { id: 'f1', pid: 'a', hero: 'arien', idx: 5, name: 'X', dur: 'round', round: 1, turn: 1, endRound: 1, endTurn: 4 }
		j = journalUpdate(j, base({ effects: [fx], attacks: { b: { by: 'a', defending: true, at: 1 } } } as unknown as Partial<MatchState>))
		// b discards to defend; the attack closes in the same change
		j = journalUpdate(j, base({ effects: [fx], cards: { ...c, b: { ...c.b, discard: [3] } } } as unknown as Partial<MatchState>))
		expect(j.ev!.map((e) => e.k)).toEqual(['fx', 'disc'])
		expect(j.ev![1]).toMatchObject({ by: 'b', card: 3, why: 'attack' })
		const n1 = { id: 'n1', r: 1, t: 1, at: 5, text: 'Zara misread her card', by: 'Zara' }
		j = journalUpdate(j, base({ notes: [n1] } as unknown as Partial<MatchState>))
		j = journalUpdate(j, base({ notes: [] } as unknown as Partial<MatchState>)) // a snapshot that lost it
		expect(j.notes!.map((n) => n.id)).toEqual(['n1'])
		j = journalUpdate(j, base({ notes: [{ ...n1, del: true }] } as unknown as Partial<MatchState>))
		expect(j.notes![0].del).toBe(true)
		expect(gameRow(j).data.notes).toHaveLength(1)
	})
})
