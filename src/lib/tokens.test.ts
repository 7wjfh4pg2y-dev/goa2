import { describe, it, expect } from 'vitest'
import { placeToken, moveToken, statusFrom, toggleStatusMarker, effectiveHex } from './tokens'
import { applyCardReq, type Piece, type MatchState } from './match'

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
