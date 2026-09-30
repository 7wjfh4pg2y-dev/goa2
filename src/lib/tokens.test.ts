import { describe, it, expect } from 'vitest'
import { placeToken, moveToken, statusFrom, toggleStatusMarker, effectiveHex } from './tokens'
import { applyCardReq, battlePatch, keepsThroughRound, type Piece, type MatchState } from './match'

const heroes: Record<string, Piece> = {
	bain: { id: 'bain', hex: '1_1', team: 'orange', kind: 'hero', hero: 'bain' },
	foe: { id: 'foe', hex: '5_5', team: 'blue', kind: 'hero', hero: 'arien' },
	ally: { id: 'ally', hex: '2_2', team: 'orange', kind: 'hero', hero: 'brogan' }
}
const tok = (id: string, token: string, hex: string, team: 'orange' | 'blue' = 'orange'): Piece => ({ id, hex, team, token, owner: 'bain' })

describe('tokens', () => {
	it('mines go down face down', () => {
		const p = placeToken(heroes, tok('m', 'token_blast', '3_3'))
		expect(p.m.faceDown).toBe(true)
		expect(placeToken(heroes, tok('g', 'token_grenade', '3_3')).g.faceDown).toBeUndefined()
	})
	it('bounty attaches to an enemy hero only, and follows them', () => {
		let p = placeToken(heroes, tok('b', 'marker_bounty', '5_5'))
		expect(p.b.attachedTo).toBe('foe')
		expect(statusFrom(p).foe.bounty).toBe(1)
		p = { ...p, foe: { ...p.foe, hex: '6_6' } }
		expect(effectiveHex(p, p.b)).toBe('6_6')
		expect(placeToken(heroes, tok('b', 'marker_bounty', '2_2')).b.attachedTo).toBeUndefined()
	})
	it('moving the marker off the hero ends the status', () => {
		let p = placeToken(heroes, tok('b', 'marker_bounty', '5_5'))
		p = moveToken(p, 'b', '4_4')
		expect(p.b.attachedTo).toBeUndefined()
		expect(statusFrom(p).foe).toBeUndefined()
	})
	it('there is only one of each marker', () => {
		let p = placeToken(heroes, tok('b1', 'marker_bounty', '4_4'))
		p = placeToken(p, tok('b2', 'marker_bounty', '5_5'))
		expect(p.b1).toBeUndefined()
		expect(p.b2.attachedTo).toBe('foe')
	})
	it('toggling from a player board attaches / removes the marker', () => {
		let p = toggleStatusMarker(heroes, 'poison', 'foe', 'tc', 'orange')
		expect(statusFrom(p).foe.poison).toBe(1)
		p = toggleStatusMarker(p, 'poison', 'foe', 'tc', 'orange')
		expect(statusFrom(p).foe).toBeUndefined()
	})
	it('the round end sweeps tokens but keeps trees, companions, runes and units', () => {
		const pieces: Record<string, Piece> = {
			...heroes,
			min1: { id: 'min1', hex: '0_0', team: 'blue', kind: 'minion', role: 'melee' },
			t: { ...tok('t', 'token_tree', '0_1'), kind: 'token' },
			c: { ...tok('c', 'companion', '0_2'), kind: 'token' },
			r: { ...tok('r', 'rune_axe_marker', '0_3'), kind: 'token' },
			x: { ...tok('x', 'token_ice', '0_4'), kind: 'token' },
			b: { ...tok('b', 'marker_bounty', '5_5'), kind: 'token', attachedTo: 'foe' }
		}
		const s = { turn: 4, round: 1, pieces, cards: {} } as unknown as MatchState
		const patch = applyCardReq(s, { kind: 'advance', pid: 'bain' })
		expect(Object.keys(patch.pieces!).sort()).toEqual(['ally', 'bain', 'c', 'foe', 'min1', 'r', 't'])
		expect(patch.round).toBe(2)
	})
})

describe('radius overlays', () => {
	it('clear when the turn advances', () => {
		const s = { turn: 2, round: 1, pieces: {}, cards: {}, radii: { a: 3 } } as unknown as MatchState
		expect(applyCardReq(s, { kind: 'advance', pid: 'a' }).radii).toEqual({})
	})
})

describe('minion battle', () => {
	it('returns every card to hand, like a round end', () => {
		const cs = { hero: 'arien', level: 1, coins: 0, ultimate: false, hand: [5], turns: [0, 1, 2, null], pending: 3, discard: [4], upgrade: [], removed: [] }
		const s = { turn: 4, round: 1, pieces: {}, cards: { a: cs } } as unknown as MatchState
		const p = battlePatch(s)
		expect(p.battlePhase).toBe(true)
		expect(p.cards!.a.hand).toEqual([0, 1, 2, 3, 4, 5])
		expect(p.cards!.a.turns).toEqual([null, null, null, null])
		expect(p.cards!.a.pending).toBeNull()
		// the round advance afterwards has nothing left to return
		const after = applyCardReq({ ...s, cards: p.cards, battlePhase: true } as MatchState, { kind: 'advance', pid: 'a' })
		expect(after.cards!.a.hand).toEqual([0, 1, 2, 3, 4, 5])
		expect(after.round).toBe(2)
		expect(after.cards!.a.coins).toBe(1) // no level-up this round → pity coin
	})

	it('only allows level-ups in the phase after the battle', () => {
		const cs = { hero: 'arien', level: 1, coins: 3, ultimate: false, hand: [], turns: [null, null, null, null], pending: null, discard: [], upgrade: [], removed: [], items: {} }
		const s = { turn: 4, round: 1, pieces: {}, cards: { a: cs } } as unknown as MatchState
		const red2 = 2 // any card index works for the gate check
		expect(applyCardReq(s, { kind: 'take', pid: 'a', idx: red2 })).toEqual({})
	})
})

describe('token supply, lifetime and removal', async () => {
	const T = await import('./tokens')
	const tk = (id: string, token: string, owner = 'o', extra: Partial<Piece> = {}): Piece => ({ id, hex: '1_1', team: 'orange', kind: 'token', token, owner, ...extra })

	it('limits each hero to their supply', () => {
		let pieces: Record<string, Piece> = {}
		expect(T.tokensLeft(pieces, 'o', 'token_rock')).toBe(3)
		pieces = { a: tk('a', 'token_rock'), b: tk('b', 'token_rock'), c: tk('c', 'token_rock', 'other') }
		expect(T.tokensLeft(pieces, 'o', 'token_rock')).toBe(1) // another hero's rocks don't count
		expect(T.tokensLeft({ g: tk('g', 'token_grenade') }, 'o', 'token_grenade')).toBe(0)
		expect(T.tokensLeft({}, 'o', 'token_magma')).toBe(4)
		expect(T.tokensLeft({ f: tk('f', 'token_familiar') }, 'o', 'token_familiar')).toBe(0)
		expect(T.tokensLeft({}, 'o', 'token_unknown')).toBe(Infinity) // no known limit
	})

	it('clears Glitch/Grenade at end of turn, the rest at end of round; zombies, trees, companions, runes stay', () => {
		const pieces = {
			g: tk('g', 'token_glitch'), n: tk('n', 'token_grenade'), r: tk('r', 'token_rock'), p: tk('p', 'marker_poison'),
			z: tk('z', 'token_zombie'), t: tk('t', 'token_tree'), c: tk('c', 'companion'), u: tk('u', 'rune_axe_marker'),
			h: { id: 'h', hex: '2_2', team: 'blue', kind: 'hero' } as Piece
		}
		expect(Object.keys(T.sweepTokens(pieces, 'turn')).sort()).toEqual(['c', 'h', 'p', 'r', 't', 'u', 'z'])
		expect(Object.keys(T.sweepTokens(pieces, 'round')).sort()).toEqual(['c', 'h', 't', 'u', 'z'])
		expect(keepsThroughRound(tk('z', 'token_zombie'))).toBe(true)
	})

	it('removes a token with a reason, and a mine reveals what it was', () => {
		const mine = tk('m', 'token_blast', 'min', { faceDown: true })
		expect(T.removalOptions(mine).map((o) => o.id)).toEqual(['trigger', 'remove'])
		expect(T.removalLog(mine, 'trigger', 'Arien')).toContain('Blast! Arien discards a card')
		expect(T.removalLog(tk('d', 'token_dud', 'min', { faceDown: true }), 'trigger', 'Arien')).toContain('Dud')
		expect(T.removalLog(mine, 'remove')).toBe('removed a mine') // no peeking via the log
		expect(T.applyRemoval({ m: mine }, 'm', 'trigger')).toEqual({})
	})

	it('Close Call moves the Bounty marker onto Bain', () => {
		const pieces: Record<string, Piece> = {
			bainP: { id: 'bainP', hex: '4_4', team: 'orange', kind: 'hero', hero: 'bain' },
			foe: { id: 'foe', hex: '6_6', team: 'blue', kind: 'hero', hero: 'arien' },
			b: tk('b', 'marker_bounty', 'bainP', { hex: '6_6', attachedTo: 'foe' })
		}
		const next = T.applyRemoval(pieces, 'b', 'toowner')
		expect(next.b.attachedTo).toBe('bainP')
		expect(T.statusFrom(next).bainP?.bounty).toBe(1)
		expect(T.statusFrom(next).foe).toBeUndefined()
	})

	it('only the owner or the host removes a token; anyone removes a minion', () => {
		expect(T.canRemove(tk('r', 'token_rock', 'o'), 'o', false)).toBe(true)
		expect(T.canRemove(tk('r', 'token_rock', 'o'), 'x', false)).toBe(false)
		expect(T.canRemove(tk('r', 'token_rock', 'o'), 'x', true)).toBe(true)
		expect(T.canRemove({ id: 'm', hex: '1_1', team: 'blue', kind: 'minion', role: 'melee' }, 'x', false)).toBe(true)
	})
})
