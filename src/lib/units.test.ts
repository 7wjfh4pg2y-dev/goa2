import { describe, it, expect } from 'vitest'
import { applyCardReq, canRespawn, lifeTier, type MatchState, type Piece } from './match'
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
