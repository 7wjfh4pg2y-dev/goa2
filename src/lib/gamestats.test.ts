import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { statsFromJournal, levelsPaid } from './gamestats'
import { newJournal, journalUpdate, gameRow, type Journal } from './recorder'
import { applyCardReq, transferSeat, colorHex, type CardReq, type MatchState, type Piece, type Team } from './match'
import { newPlayerCardState } from './cards/cardstate'

// ── a tiny table: the REAL engine applies every move, the REAL recorder watches every state ──
const hero = (id: string, team: Team, color: string): Piece => ({ id, hex: `${id}_0`, team, kind: 'hero', hero: 'arien', color })
const minion = (id: string, team: Team, role: 'melee' | 'ranged' | 'heavy' = 'melee'): Piece => ({ id, hex: `m_${id}`, team, kind: 'minion', role })
const COLORS = ['crimson', 'teal', 'yellow', 'purple']
const HEROES = ['arien', 'brogan', 'xargatha', 'wasp']
const NAMES = ['Zaheen', 'Priya', 'Mo', 'Sam']

function table(ids: string[], over: Partial<MatchState> = {}) {
	const half = ids.length / 2
	const pieces: Record<string, Piece> = {}
	const cards: NonNullable<MatchState['cards']> = {}
	const seatMap: NonNullable<MatchState['seatMap']> = {}
	ids.forEach((id, i) => {
		pieces[id] = { ...hero(id, i < half ? 'orange' : 'blue', COLORS[i]), hero: HEROES[i] }
		cards[id] = newPlayerCardState(HEROES[i])
		seatMap[String(i)] = { id, name: NAMES[i] }
	})
	let s = {
		round: 1, turn: 1, seats: ids.length, mapId: 'fi', map: null, draftSystem: 'all-pick', lifeMax: 6, wavesMax: 5, waves: 5, lane: 1,
		life: { orange: 6, blue: 6 }, started: true, startFlip: null, gameId: 'g1', host: ids[0], seatMap, cards, pieces,
		draft: null, log: [], wonBy: null, ...over
	} as unknown as MatchState
	let j: Journal = newJournal('ROOM', s)
	const see = () => { j = journalUpdate(j, s) }
	see()
	const t = {
		get s() { return s },
		get j() { return j },
		set j(next: Journal) { j = next },
		/** a state change the recorder sees */
		set(patch: Partial<MatchState>) { s = { ...s, ...patch }; see() },
		/** a state change the recorder does NOT see (merged into the next one, or the browser was away) */
		quiet(patch: Partial<MatchState>) { s = { ...s, ...patch } },
		req(r: CardReq, seen = true) { s = { ...s, ...applyCardReq(s, r) }; if (seen) see() },
		add(...ps: Piece[]) { const pieces = { ...s.pieces }; for (const p of ps) pieces[p.id] = p; t.set({ pieces }) },
		/** put a defeated hero back on the board (respawn needs a map; this is what it does) */
		back(id: string) {
			const d = { ...(s.defeated ?? {}) }
			const piece = d[id]?.piece
			delete d[id]
			if (piece) t.set({ pieces: { ...s.pieces, [id]: piece }, defeated: d })
		},
		/** pay for the next level (what a level-up does to the numbers the report reads) */
		level(id: string) {
			const c = s.cards![id]
			const lv = 1 + c.upgrade.length
			t.set({ cards: { ...s.cards, [id]: { ...c, coins: c.coins - lv, level: lv + 1, upgrade: [...c.upgrade, 100 + lv] } } })
		},
		next() { t.req({ kind: 'advance', pid: ids[0] }) },
		/** play to the given round / turn */
		to(round: number, turn: number) { while (s.round < round || (s.round === round && s.turn < turn)) t.next() },
		win(team: Team, reason: string) { t.set({ wonBy: { team, reason } }) },
		stats() { return statsFromJournal(j) }
	}
	return t
}
const row = (st: ReturnType<typeof statsFromJournal>, id: string) => st!.players.find((p) => p.id === id)!
const kdam = (st: ReturnType<typeof statsFromJournal>, id: string) => { const p = row(st, id); return [p.kills, p.deaths, p.assists, p.minions] }

describe('battle report — from the journal of a real game', () => {
	it('a short game: two heroes, three defeats, won on Life', () => {
		const t = table(['a', 'b'])
		t.add(minion('m1', 'blue'), minion('m2', 'blue', 'heavy'), minion('m3', 'orange'))
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm1' }) // +2
		t.next()
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm2' }) // +4
		t.req({ kind: 'defeatHero', pid: 'a', target: 'b' }) // +1 (b is level 1)
		t.win('orange', 'Titans ran out of Life Tokens')
		const st = t.stats()!
		expect(st.rounds).toBe(1)
		expect(st.minutes).toBe(1) // never "0m"
		expect(st.tide).toEqual([1, 1])
		expect(st.players.map((p) => p.id)).toEqual(['a', 'b'])
		expect(row(st, 'a')).toMatchObject({ name: 'Zaheen', hero: 'arien', team: 'orange', color: colorHex('crimson'), level: 1, kills: 1, deaths: 0, assists: 0, minions: 2, coins: 7 })
		expect(row(st, 'b')).toMatchObject({ name: 'Priya', hero: 'brogan', team: 'blue', color: colorHex('teal'), level: 1, kills: 0, deaths: 1, assists: 0, minions: 0, coins: 0 })
		expect(st.falls).toEqual([{ turn: 1, team: 'blue', who: 'Priya (Brogan)', id: 'b' }])
		// the same journal gives the same object back (the splash's prop stays put)
		expect(t.stats()).toBe(st)
	})

	it('a long game, back and forth: assists, levels, an undo, the tide, a throne push', () => {
		const t = table(['a', 'c', 'b', 'd']) // a + c Atlanteans, b + d Titans
		t.add(minion('o1', 'orange'), minion('o2', 'orange', 'ranged'), minion('oh', 'orange', 'heavy'), minion('b1', 'blue'), minion('b2', 'blue', 'ranged'), minion('bh', 'blue', 'heavy'))
		// round 1: a takes two minions; a card effect removes one (no coins); b gains 2 coins from a card
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'b1' })
		t.req({ kind: 'removeMinion', pid: 'd', piece: 'o1' })
		t.req({ kind: 'coins', pid: 'b', delta: 1 }); t.req({ kind: 'coins', pid: 'b', delta: 1 })
		t.to(1, 3)
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'b2' })
		t.req({ kind: 'defeatHero', pid: 'a', target: 'b' }) // a +1, c +1 assist
		t.to(1, 4)
		t.back('b')
		t.set({ lane: 2 }) // the Atlanteans push onto the Titan beach
		t.level('a') // a had 5 coins: level 2 costs 1
		t.to(2, 2)
		// round 2: the Titans answer — d defeats c, then a (an undo takes the second one back)
		t.req({ kind: 'defeatHero', pid: 'd', target: 'c' }) // d +1, b +1 assist
		const before = t.s
		t.req({ kind: 'defeatHero', pid: 'd', target: 'a' })
		expect(kdam(t.stats(), 'd')[0]).toBe(2)
		t.set({ ...before }) // the host's Undo: the whole state snaps back
		expect(kdam(t.stats(), 'd')[0]).toBe(1)
		// …and a minion defeat that is undone, then made by someone else
		const before2 = t.s
		t.req({ kind: 'defeatMinion', pid: 'd', piece: 'o2' })
		t.set({ ...before2 })
		t.req({ kind: 'defeatMinion', pid: 'b', piece: 'o2' })
		t.to(2, 3)
		t.back('c')
		t.set({ lane: 1 })
		t.to(3, 1)
		t.set({ lane: 0 })
		t.req({ kind: 'defeatHero', pid: 'b', target: 'c' }) // b +1, d +1 assist
		t.to(3, 2)
		t.req({ kind: 'defeatMinion', pid: 'd', piece: 'oh' }) // a heavy: +4
		t.win('blue', 'pushed into the Atlantean Throne')
		const st = t.stats()!
		expect(st.rounds).toBe(3)
		// one entry per turn, R1T1 … R3T2; the zone holds until the push; the game ends on the throne
		expect(st.tide).toEqual([1, 1, 1, 2, 2, 2, 1, 1, 0, -1])
		expect(st.players.map((p) => [p.id, p.team])).toEqual([['a', 'orange'], ['c', 'orange'], ['b', 'blue'], ['d', 'blue']])
		//                        K  D  A  minions
		expect(kdam(st, 'a')).toEqual([1, 0, 0, 2])
		expect(kdam(st, 'c')).toEqual([0, 2, 1, 0])
		expect(kdam(st, 'b')).toEqual([1, 1, 1, 1])
		expect(kdam(st, 'd')).toEqual([1, 0, 1, 1])
		// every coin a hero took in = what it holds + what its levels cost — whatever the source
		const held = (id: string) => t.s.cards![id].coins
		expect(row(st, 'a')).toMatchObject({ level: 2, coins: held('a') + 1 })
		expect(row(st, 'a').coins).toBe(2 + 2 + 1) // two minions and a hero — the coin spent on level 2 still counts as earned
		expect(row(st, 'b').coins).toBe(held('b'))
		expect(st.falls).toEqual([
			{ turn: 2, team: 'blue', who: 'Mo (Xargatha)', id: 'b' },
			{ turn: 5, team: 'orange', who: 'Priya (Brogan)', id: 'c' },
			{ turn: 8, team: 'orange', who: 'Priya (Brogan)', id: 'c' }
		])
		// team totals add up: every kill is someone's death
		const sum = (k: 'kills' | 'deaths') => st.players.reduce((n, p) => n + p[k], 0)
		expect(sum('kills')).toBe(sum('deaths'))
		// the upload row carries the events too, next to everything it had before
		const data = gameRow(t.j).data
		expect(data.ev).toHaveLength(7)
		expect(Object.keys(data)).toEqual(expect.arrayContaining(['players', 'draft', 'turns', 'log', 'final']))
	})

	it('a game with no defeats at all', () => {
		const t = table(['a', 'b'])
		t.to(2, 1)
		t.win('blue', 'won the Final Push')
		const st = t.stats()!
		expect(st.falls).toEqual([])
		expect(st.tide).toEqual([1, 1, 1, 1, 1])
		for (const p of st.players) expect([p.kills, p.deaths, p.assists, p.minions]).toEqual([0, 0, 0, 0])
		expect(st.players.map((p) => p.coins)).toEqual([0, 0]) // no level-up step ran, so no pity coin either
	})

	it('joined late, or away for a whole turn: no report rather than half the numbers', () => {
		const late = table(['a', 'b'], { round: 2, turn: 3 })
		late.req({ kind: 'defeatHero', pid: 'a', target: 'b' })
		late.win('orange', 'Titans ran out of Life Tokens')
		expect(late.j.fromStart).toBe(false)
		expect(late.stats()).toBeNull()

		const away = table(['a', 'b'])
		away.next()
		away.req({ kind: 'advance', pid: 'a' }, false) // turn 3 goes by unseen…
		away.req({ kind: 'defeatHero', pid: 'b', target: 'a' }, false)
		away.next() // …back in turn 4
		away.win('blue', 'Atlanteans ran out of Life Tokens')
		expect(away.j.fromStart).toBe(true)
		expect(away.stats()).toBeNull()
	})

	it('a reload mid-turn picks up where the saved journal left off', () => {
		const t = table(['a', 'b'])
		t.add(minion('m1', 'blue'), minion('m2', 'blue'))
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm1' })
		t.j = JSON.parse(JSON.stringify(t.j)) // saved, the tab reloads…
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm2' }, false) // …this happens meanwhile
		t.req({ kind: 'defeatHero', pid: 'b', target: 'a' })
		t.win('blue', 'Atlanteans ran out of Life Tokens')
		expect(kdam(t.stats(), 'a')).toEqual([0, 1, 0, 2])
		expect(kdam(t.stats(), 'b')).toEqual([1, 0, 0, 0])
	})

	it('two defeats merged into one snapshot are both counted; coins without a minion are not', () => {
		const t = table(['a', 'b'])
		t.add(minion('m1', 'blue'), minion('m2', 'blue', 'ranged'), minion('mh', 'blue', 'heavy'), minion('o1', 'orange'))
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm1' }, false)
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm2' }) // +4 in one look, two minions gone, no heavy among them
		expect(kdam(t.stats(), 'a')[3]).toBe(2)
		t.req({ kind: 'coins', pid: 'b', delta: 1 }, false)
		t.req({ kind: 'coins', pid: 'b', delta: 1 }) // +2 by hand: nothing left the board
		t.req({ kind: 'coins', pid: 'b', delta: 1 }, false)
		t.req({ kind: 'coins', pid: 'b', delta: 1 }, false)
		t.req({ kind: 'removeMinion', pid: 'b', piece: 'mh' }) // +2 by hand while a HEAVY is removed: 2 coins never buy a heavy
		expect(kdam(t.stats(), 'b')[3]).toBe(0)
		t.req({ kind: 'defeatMinion', pid: 'b', piece: 'o1' })
		expect(kdam(t.stats(), 'b')[3]).toBe(1)
	})

	it('a seat taken over mid-game keeps its numbers under the new player', () => {
		const t = table(['a', 'b'])
		t.add(minion('m1', 'blue'))
		t.req({ kind: 'defeatMinion', pid: 'a', piece: 'm1' })
		t.req({ kind: 'defeatHero', pid: 'a', target: 'b' })
		t.next()
		t.back('b')
		t.set(transferSeat(t.s, 'a', 'z', 'Lee', 0))
		t.req({ kind: 'defeatHero', pid: 'b', target: 'z' })
		t.win('orange', 'won the Final Push')
		const st = t.stats()!
		expect(st.players.map((p) => p.id)).toEqual(['z', 'b'])
		expect(row(st, 'z')).toMatchObject({ name: 'Lee', hero: 'arien', team: 'orange', kills: 1, deaths: 1, minions: 1, coins: 3 })
		expect(st.falls.map((f) => f.who)).toEqual(['Priya (Brogan)', 'Lee (Arien)'])
		expect(st.falls.map((f) => f.id)).toEqual(['b', 'z']) // the id is the report ROW's (the seat's player at the end)
	})

	it('a win the host undoes: the journal goes on and the report is the later, real one', () => {
		const t = table(['a', 'b'])
		const before = t.s
		t.win('orange', 'Titans ran out of Life Tokens')
		expect(t.j.done).toBe(true)
		t.set({ ...before }) // Undo
		expect(t.j.done).toBe(false)
		expect(t.j.final).toBeUndefined()
		t.next()
		t.req({ kind: 'defeatHero', pid: 'b', target: 'a' })
		t.win('blue', 'Atlanteans ran out of Life Tokens')
		const st = t.stats()!
		expect(st.tide).toHaveLength(2)
		expect(kdam(st, 'b')[0]).toBe(1)
	})

	it('missing fields never throw: no journal, an older journal, an empty or broken one', () => {
		expect(statsFromJournal(null)).toBeNull()
		expect(statsFromJournal(undefined)).toBeNull()
		const t = table(['a', 'b'])
		t.next()
		t.win('orange', 'won the Final Push')
		expect(t.stats()).not.toBeNull()
		const j = t.j
		// a journal begun before events were recorded has no `ev`: its defeats are unknown
		const old = { ...j }; delete old.ev; delete old.mark
		expect(statsFromJournal(old)).toBeNull()
		expect(journalUpdate({ ...old, done: false }, t.s).ev).toBeUndefined() // …and it stays without
		expect(statsFromJournal({ ...j, players: {} })).toBeNull()
		expect(statsFromJournal({ ...j, turns: [], cur: null })).toBeNull()
		expect(statsFromJournal({ ...j, final: undefined, cur: null })).toBeNull()
		expect(statsFromJournal({} as Journal)).toBeNull()
		expect(statsFromJournal({ fromStart: true, ev: [{ k: 'hero' }], turns: 'x', players: null } as unknown as Journal)).toBeNull()
		// players saved without a team or a colour (an older journal's shape): the seat decides the team
		const bare = { ...j, players: { a: { name: 'Zaheen', seat: 0, hero: 'arien' }, b: { name: 'Priya', seat: 1, hero: 'brogan' } } }
		expect(statsFromJournal(bare)!.players.map((p) => [p.team, p.color])).toEqual([['orange', '#94a3b8'], ['blue', '#94a3b8']])
		// a game still going (no final state yet) reads the latest snapshot
		const live = table(['a', 'b'])
		live.next()
		expect(live.stats()).toMatchObject({ rounds: 1, tide: [1, 1] })
	})

	it('levels cost 1 + 2 + … : what "coins earned" adds back', () => {
		expect([1, 2, 3, 8].map(levelsPaid)).toEqual([0, 1, 3, 28])
	})
})
