import { describe, it, expect } from 'vitest'
import { applyCardReq, canRespawn, lifeTier, cardInitiative, cardResolved, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'

// A (orange) + C (orange, A's teammate) vs B (blue, level 3) and D (blue)
const hero = (id: string, team: 'orange' | 'blue', hex: string): Piece => ({ id, hex, team, kind: 'hero', hero: 'arien' })
function game(): MatchState {
	const lvl = (n: number) => ({ ...newPlayerCardState('arien'), coins: 5, upgrade: Array.from({ length: n - 1 }, (_, i) => 100 + i) })
	return {
		round: 1, turn: 2, seats: 4, life: { orange: 6, blue: 6 },
		pieces: {
			A: hero('A', 'orange', '1_1'), C: hero('C', 'orange', '1_2'), B: hero('B', 'blue', '5_5'), D: hero('D', 'blue', '6_6'),
			m1: { id: 'm1', hex: '3_3', team: 'blue', kind: 'minion', role: 'melee' },
			m2: { id: 'm2', hex: '3_4', team: 'blue', kind: 'minion', role: 'heavy' }
		},
		cards: { A: lvl(2), C: lvl(1), B: { ...lvl(3), pending: 4 }, D: lvl(1) }
	} as unknown as MatchState
}

describe('defeating and removing units', () => {
	it('the level tiers: 1–3 → 1, 4–6 → 2, 7–8 → 3', () => {
		expect([1, 3, 4, 6, 7, 8].map(lifeTier)).toEqual([1, 1, 2, 2, 3, 3])
	})

	it('a defeated minion pays its defeater 2 coins (heavy 4); a removed one pays nothing', () => {
		const s = game()
		const a = applyCardReq(s, { kind: 'defeatMinion', pid: 'A', piece: 'm1' })
		expect(a.pieces!.m1).toBeUndefined()
		expect(a.cards!.A.coins).toBe(7)
		expect(applyCardReq(s, { kind: 'defeatMinion', pid: 'A', piece: 'm2' }).cards!.A.coins).toBe(9)
		const r = applyCardReq(s, { kind: 'removeMinion', pid: 'A', piece: 'm1' })
		expect(r.pieces!.m1).toBeUndefined()
		expect(r.cards).toBeUndefined() // no coins
	})

	it('A defeats B (level 3): A +3, teammate C +1 assist, Blue −1 life, B’s face-down card is discarded', () => {
		const p = applyCardReq(game(), { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.cards!.A.coins).toBe(5 + 3)
		expect(p.cards!.C.coins).toBe(5 + 1)
		expect(p.cards!.D.coins).toBe(5) // the victim's team gets nothing
		expect(p.cards!.B.coins).toBe(5) // the reward comes from the game, not B's bank
		expect(p.life).toEqual({ orange: 6, blue: 5 })
		expect(p.pieces!.B).toBeUndefined()
		expect(p.cards!.B.pending).toBeNull()
		expect(p.cards!.B.discard).toContain(4)
		expect(p.defeated!.B.turn).toBe(2)
	})

	it('a level 7 hero with the Bounty costs 3 + 1 lives and pays 3 per assist; the marker comes off', () => {
		const s = game()
		s.cards!.B = { ...s.cards!.B, upgrade: [1, 2, 3, 4, 5, 6] } // level 7
		s.pieces!.bnty = { id: 'bnty', hex: '5_5', team: 'orange', kind: 'token', token: 'marker_bounty', owner: 'A', attachedTo: 'B' }
		const p = applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.life!.blue).toBe(6 - 4)
		expect(p.cards!.A.coins).toBe(5 + 7)
		expect(p.cards!.C.coins).toBe(5 + 3)
		expect(p.pieces!.bnty).toBeUndefined()
	})

	it('keeps the hand; keeps this turn\'s card only if it had already resolved', () => {
		const s = game()
		const p = applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.cards!.B.hand).toEqual(s.cards!.B.hand)
		const kept = applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B', keepCard: true })
		expect(kept.cards!.B.pending).toBe(4)
		expect(kept.cards!.B.discard).not.toContain(4)
	})

	it('respawns in a later turn once they play a card (possibly next round)', () => {
		let s = { ...game() }
		s = { ...s, ...applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' }) } as MatchState
		expect(canRespawn(s, 'B')).toBe(false) // same turn
		expect(applyCardReq(s, { kind: 'respawn', pid: 'B', hex: '9_9' })).toEqual({})
		s = { ...s, turn: 3 }
		expect(canRespawn(s, 'B')).toBe(false) // next turn, but no card played yet
		s = { ...s, cards: { ...s.cards, B: { ...s.cards!.B, pending: s.cards!.B.hand[0] } } } as MatchState
		expect(canRespawn(s, 'B')).toBe(true)
		const back = applyCardReq(s, { kind: 'respawn', pid: 'B', hex: '9_9' })
		expect(back.pieces!.B).toMatchObject({ kind: 'hero', team: 'blue', hex: '9_9' })
		expect(back.defeated!.B).toBeUndefined()
		// passed / nothing to play this turn → wait (possibly until the next round)
		expect(canRespawn({ ...s, cards: { ...s.cards, B: { ...s.cards!.B, pending: -1 } } } as MatchState, 'B')).toBe(false)
	})
})

describe('attacking heroes', () => {
	const g = () => ({ ...game(), host: 'H' }) as MatchState
	it('attack → the defender says no → defeated (rewards dealt, news for the splash)', () => {
		let s = g()
		const a = applyCardReq(s, { kind: 'attack', pid: 'A', target: 'B' })
		expect(a.attacks!.B).toMatchObject({ by: 'A', defending: false })
		expect(applyCardReq(s, { kind: 'attack', pid: 'A', target: 'C' })).toEqual({}) // own team
		s = { ...s, ...a }
		expect(applyCardReq(s, { kind: 'attackResolve', pid: 'D', target: 'B', result: 'defeated' })).toEqual({}) // not theirs to answer
		const d = applyCardReq(s, { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defeated' })
		expect(d.pieces!.B).toBeUndefined()
		expect(d.cards!.A.coins).toBe(8)
		expect(d.attacks!.B).toBeUndefined()
		expect(d.lastDefeat).toMatchObject({ victim: 'B', by: 'A', coins: 3, assist: 1, assists: ['C'], lives: 1, team: 'blue' })
	})
	it('defend → defended ends the attack with no rewards; the attacker can call it off', () => {
		let s = { ...g(), ...applyCardReq(g(), { kind: 'attack', pid: 'A', target: 'B' }) } as MatchState
		s = { ...s, ...applyCardReq(s, { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defend' }) }
		expect(s.attacks!.B.defending).toBe(true)
		const ok = applyCardReq(s, { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defended' })
		expect(ok.attacks).toEqual({})
		expect(ok.cards).toBeUndefined()
		expect(applyCardReq(s, { kind: 'attackResolve', pid: 'A', target: 'B', result: 'cancel' }).attacks).toEqual({})
	})
	it('the defender\'s card stays if it already resolved (higher initiative than the attacker\'s)', () => {
		const s = g()
		// B (pending 4) vs A playing a card with lower / higher initiative
		const cards = (aIdx: number) => ({ ...s, cards: { ...s.cards, A: { ...s.cards!.A, pending: aIdx } } }) as MatchState
		const initB = cardInitiative(s, 'B')!
		const lower = [0, 1, 2, 3, 5, 6, 7, 8].find((i) => (cardInitiative(cards(i), 'A') ?? 99) < initB)
		if (lower != null) expect(cardResolved(cards(lower), 'A', 'B')).toBe(true)
		expect(cardResolved(s, 'A', 'B')).toBe(false) // attacker has no card out
	})
})

describe('entering the board', () => {
	it('a hero waiting at game start is placed on a hex; respawn works the same way', () => {
		const s = { ...game(), toSpawn: { E: { id: 'E', hex: '', team: 'orange', kind: 'hero', hero: 'arien' } } } as unknown as MatchState
		const p = applyCardReq(s, { kind: 'spawn', pid: 'E', hex: '2_2' })
		expect(p.pieces!.E.hex).toBe('2_2')
		expect(p.toSpawn).toEqual({})
		expect(applyCardReq(s, { kind: 'spawn', pid: 'A', hex: '2_2' })).toEqual({}) // already on the board
	})
})
