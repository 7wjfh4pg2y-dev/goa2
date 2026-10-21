import { describe, it, expect } from 'vitest'
import { applyCardReq, minionDefense, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { hexNeighbour } from './board/hexgeo'
import { autoOn, behindRule, spacesBehind, heroesOn, leapSpaces, spawnPoints, swapMinions, auraRadius, immuneNow, AUTO_LIVE } from './autocards'

const idx = (hero: string, name: string) => heroCards(hero).findIndex((c) => c.name === name)
const card = (hero: string, name: string) => heroCards(hero)[idx(hero, name)]
const hero = (id: string, team: 'orange' | 'blue', hex: string, h: string): Piece => ({ id, hex, team, kind: 'hero', hero: h })

// Arien (A, orange) next to Wasp (W, blue) with Brogan (B, blue) further along; Sabina (S, orange) is A's teammate
function game(lab = true): MatchState {
	const W = hexNeighbour('5_5', 0), B = hexNeighbour(W, 0)
	return {
		round: 1, turn: 2, seats: 4, host: 'H', labRules: lab, life: { orange: 6, blue: 6 }, revealAt: 1,
		map: { cells: Object.fromEntries(['5_5', W, B, '3_3', '4_4', '6_6', '7_7', '2_2'].map((h) => [h, 'centre'])) },
		pieces: { A: hero('A', 'orange', '5_5', 'arien'), W: hero('W', 'blue', W, 'wasp'), B: hero('B', 'blue', B, 'brogan'), S: hero('S', 'orange', '2_2', 'sabina') },
		cards: { A: newPlayerCardState('arien'), W: newPlayerCardState('wasp'), B: newPlayerCardState('brogan'), S: newPlayerCardState('sabina') }
	} as unknown as MatchState
}

describe('Lab rules', () => {
	it('automation runs only with Lab rules, or once a hero is live', () => {
		expect(autoOn(game(true), 'A')).toBe(true)
		expect(autoOn(game(false), 'A')).toBe(false)
		expect(AUTO_LIVE).toEqual([]) // nothing has left the lab yet
	})
})

describe('Arien', () => {
	it('reads the Torrent cards: 2 / 3 / 5 spaces behind the target, discard or be defeated', () => {
		expect(['Dangerous Current', 'Raging Stream', 'Violent Torrent'].map((n) => behindRule(card('arien', n)))).toEqual([{ n: 2, die: true }, { n: 3, die: true }, { n: 5, die: true }])
		expect(behindRule(card('arien', 'Noble Blade'))).toBeNull()
	})
	it('finds the enemy hero straight behind the unit he attacks', () => {
		const s = game()
		const line = spacesBehind('5_5', s.pieces.W.hex, 2)
		expect(line[0]).toBe(s.pieces.B.hex)
		expect(heroesOn(s, 'A', line).map((p) => p.id)).toEqual(['B'])
		expect(spacesBehind('5_5', '7_7', 2)).toEqual([]) // not next to him
		expect(heroesOn(s, 'A', [s.pieces.S.hex])).toEqual([]) // never his own team
	})
	it('Liquid Leap lands in range, never on or next to an empty spawn point; Stranger Tide only avoids the spawn points', () => {
		const s = game()
		const cs = { ...s.cards!.A, pending: idx('arien', 'Liquid Leap') }
		const sp = new Set([hexNeighbour('4_4', 3)]) // an empty spawn point next to 4_4
		const t = { ...s, cards: { ...s.cards, A: cs }, map: { cells: { ...s.map!.cells, [hexNeighbour('4_4', 3)]: 'spawnOrange' } } } as unknown as MatchState
		const leap = leapSpaces(t, 'A', card('arien', 'Liquid Leap'), sp)!
		expect(leap).not.toContain('5_5') // where he stands
		expect(leap).not.toContain(s.pieces.W.hex) // taken
		expect(leap).not.toContain('4_4') // next to the empty spawn point
		expect(leap.every((h) => !sp.has(h))).toBe(true)
		const tide = leapSpaces(t, 'A', card('arien', 'Stranger Tide'), sp)!
		expect(tide.length).toBeGreaterThanOrEqual(leap.length)
		expect(leapSpaces(t, 'A', card('arien', 'Noble Blade'), sp)).toBeNull()
	})
	it('Arcane Whirlpool lists the enemy minions in range', () => {
		const s = game()
		const t = { ...s, pieces: { ...s.pieces, m1: { id: 'm1', hex: '6_6', team: 'blue', kind: 'minion', role: 'melee' }, m2: { id: 'm2', hex: '4_4', team: 'orange', kind: 'minion', role: 'melee' } } } as unknown as MatchState
		expect(swapMinions(t, 'A', card('arien', 'Arcane Whirlpool'))).toEqual(['m1'])
	})
	it('Spell Break / Slippery Ground / Deluge show his radius (adjacent = 1)', () => {
		const cs = newPlayerCardState('arien')
		expect(auraRadius(cs, card('arien', 'Spell Break'))).toBe(3)
		expect(auraRadius(cs, card('arien', 'Slippery Ground'))).toBe(1)
		expect(auraRadius(cs, card('arien', 'Deluge'))).toBe(1)
		expect(auraRadius(cs, card('arien', 'Noble Blade'))).toBeNull()
	})

	// W attacks A; A defends with a Duelist
	function attacked(lab: boolean, name: string) {
		let s = game(lab)
		const d = idx('arien', name)
		s = { ...s, cards: { ...s.cards, A: { ...s.cards!.A, hand: [...s.cards!.A.hand, d] } }, pieces: { ...s.pieces, m: { id: 'm', hex: hexNeighbour('5_5', 3), team: 'blue', kind: 'minion', role: 'melee' } as Piece } } as MatchState
		s = { ...s, ...applyCardReq(s, { kind: 'attack', pid: 'W', target: 'A' }) } as MatchState
		const before = minionDefense(s, 'A').total
		s = { ...s, ...applyCardReq(s, { kind: 'defend', pid: 'A', idx: d }) } as MatchState
		return { s, before }
	}
	it('a Duelist defence ignores the minion modifiers', () => {
		const { s, before } = attacked(true, 'Aspiring Duelist')
		expect(before).toBe(-1)
		expect(minionDefense(s, 'A').total).toBe(0)
		expect(immuneNow(s, 'A')).toEqual([]) // Aspiring Duelist gives no immunity
		expect(minionDefense(attacked(false, 'Aspiring Duelist').s, 'A').total).toBe(-1) // not without Lab rules
	})
	it('Expert Duelist: immune to every other enemy this turn; Master Duelist: this round', () => {
		const { s } = attacked(true, 'Expert Duelist')
		expect(immuneNow(s, 'A')).toMatchObject([{ span: 'turn', except: 'W', card: 'Expert Duelist' }])
		const after = { ...s, ...applyCardReq(s, { kind: 'attackResolve', pid: 'A', target: 'A', result: 'defended' }) } as MatchState
		expect(applyCardReq(after, { kind: 'attack', pid: 'B', target: 'A' })).toEqual({}) // another enemy: refused
		expect(applyCardReq(after, { kind: 'attack', pid: 'W', target: 'A' }).attacks?.A).toBeTruthy() // the attacker may
		expect(applyCardReq({ ...after, turn: 3 } as MatchState, { kind: 'attack', pid: 'B', target: 'A' }).attacks?.A).toBeTruthy() // next turn: over
		const m = attacked(true, 'Master Duelist').s
		expect(immuneNow({ ...m, turn: 4 } as MatchState, 'A')).toHaveLength(1)
		expect(immuneNow({ ...m, round: 2 } as MatchState, 'A')).toHaveLength(0)
		expect(attacked(false, 'Expert Duelist').s.immune).toBeUndefined()
	})
	it('the defence card is the FIRST discard of the attack', () => {
		let { s } = attacked(true, 'Aspiring Duelist')
		const other = s.cards!.A.hand[0]
		s = { ...s, ...applyCardReq(s, { kind: 'defend', pid: 'A', idx: other }) } as MatchState
		expect(s.attacks?.A?.card).toBe(idx('arien', 'Aspiring Duelist'))
	})
})

describe('the spawn points', () => {
	it('minion spawn points and the heroes\' both count', () => {
		const sp = spawnPoints({ cells: { a: 'spawnOrange', b: 'spawnBlue', c: 'centre' } } as never, ['h1'])
		expect([...sp].sort()).toEqual(['a', 'b', 'h1'])
	})
})
