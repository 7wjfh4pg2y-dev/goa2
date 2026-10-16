import { describe, it, expect } from 'vitest'
import { applyCardReq, turnOrder, turnKey, actingIdx, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { equilibrium, canFlip, flipUsed, hasPower, type TurnCtx } from './heropower'
import { draftable, isLabHero, FOUR_STAR_LAB, FOUR_STAR_LIVE, HEROES } from './heroes'
import { isFullGame, type Journal } from './recorder'

// I = Ignatia (orange) vs B (blue, Arien); turn 2 of round 1, both cards revealed
const silver = heroCards('ignatia').findIndex((c) => c.color === 'SILVER' && !c.handicapped)
const red1 = heroCards('ignatia').findIndex((c) => c.color === 'RED' && (c.level ?? 0) === 1)
const hero = (id: string, team: 'orange' | 'blue', h: string): Piece => ({ id, hex: id === 'I' ? '1_1' : '5_5', team, kind: 'hero', hero: h })
// turns = her slots; this turn's card (turn 2) is `pending` until the turn ends
function game(turns: (number | null)[] = [null, null, null, null], ult = false): MatchState {
	const ig = { ...newPlayerCardState('ignatia'), turns: [turns[0], null, null, null], pending: turns[1], ultimate: ult }
	const b = { ...newPlayerCardState('arien'), pending: 0 }
	return {
		round: 1, turn: 2, seats: 2, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0,
		pieces: { I: hero('I', 'orange', 'ignatia'), B: hero('B', 'blue', 'arien') },
		cards: { I: ig, B: b }
	} as unknown as MatchState
}
const ctx = (s: MatchState): TurnCtx => ({ key: turnKey(s), round: s.round, turnIdx: s.turn - 1, order: turnOrder(s), at: actingIdx(s), tieBreaker: s.tieBreaker, revealed: true })
const actingAs = (s: MatchState, pid: string) => ({ ...s, acting: { key: turnKey(s), idx: turnOrder(s).indexOf(pid) } }) as MatchState

describe('Ignatia: Equilibrium (her silver) — both halves of her cards for the rest of the round', () => {
	it('takes hold once her silver has acted, and lasts until the round ends — through the minion battle', () => {
		// her silver in turn 1's slot: any card action now marks the round
		let s = game([silver, red1, null, null])
		const p = applyCardReq(s, { kind: 'coins', pid: 'I', delta: 1 })
		expect(p.power?.I?.eq).toBe(1)
		s = { ...s, ...p }
		expect(equilibrium(s, 'I', 1)).toBe(true)
		// the minion battle empties the slots; the mark stays for the round
		s = { ...s, cards: { ...s.cards, I: { ...s.cards!.I, turns: [null, null, null, null], pending: null } } }
		expect(equilibrium(s, 'I', 1)).toBe(true)
		// a new round: over (the coin shows the real coin again)
		expect(equilibrium({ ...s, round: 2 } as MatchState, 'I', 2)).toBe(false)
	})
	it('this turn: only once revealed, and from the moment her card acts', () => {
		let s = game([red1, silver, null, null])
		expect(applyCardReq({ ...s, revealAt: null } as MatchState, { kind: 'coins', pid: 'I', delta: 1 }).power).toBeUndefined()
		const order = turnOrder(s)
		if (order[0] !== 'I') {
			// B acts first: nothing yet
			expect(applyCardReq(s, { kind: 'coins', pid: 'I', delta: 1 }).power).toBeUndefined()
		}
		s = actingAs(s, 'I')
		expect(applyCardReq(s, { kind: 'coins', pid: 'I', delta: 1 }).power?.I?.eq).toBe(1)
	})
	it('no silver this round, nothing marked; heroes without a power never get one', () => {
		expect(applyCardReq(game([red1, null, null, null]), { kind: 'coins', pid: 'I', delta: 1 }).power).toBeUndefined()
		expect(hasPower('ignatia')).toBe(true)
		expect(hasPower('arien')).toBe(false)
	})
})

describe('Ignatia: Chaos Incarnate (her ultimate) — flip the tie-breaker once a turn', () => {
	it('needs the ultimate, her own acting turn and her card in play', () => {
		const base = game([red1, red1 === 0 ? 1 : 0, null, null], true)
		expect(canFlip(actingAs(base, 'I'), 'I', ctx(actingAs(base, 'I')))).toBe(true)
		expect(canFlip(actingAs(base, 'B'), 'I', ctx(actingAs(base, 'B')))).toBe(false)
		const noUlt = actingAs(game([red1, 0, null, null], false), 'I')
		expect(canFlip(noUlt, 'I', ctx(noUlt))).toBe(false)
		expect(applyCardReq(noUlt, { kind: 'power', pid: 'I', op: 'ignatiaFlip' })).toEqual({})
	})
	it('flips the real coin, keeps this turn\'s order, and only once a turn', () => {
		const s = actingAs(game([red1, 0, null, null], true), 'I')
		const before = turnOrder(s)
		const p = applyCardReq(s, { kind: 'power', pid: 'I', op: 'ignatiaFlip' })
		expect(p.tieBreaker).toBe('blue')
		expect(p.tieTurn).toEqual({ key: turnKey(s), coin: 'orange' })
		const after = { ...s, ...p } as MatchState
		expect(turnOrder(after)).toEqual(before)
		expect(flipUsed(after, 'I', ctx(after))).toBe(true)
		expect(applyCardReq(after, { kind: 'power', pid: 'I', op: 'ignatiaFlip' })).toEqual({})
		// the next turn: free again
		const next = { ...after, turn: 3 } as MatchState
		expect(flipUsed(next, 'I', ctx(next))).toBe(false)
	})
})

describe('the 4★ lab', () => {
	it('a 4★ hero is offered only when live, or in a GM\'s lab room while being tested', () => {
		const ig = HEROES.find((h) => h.id === 'ignatia')!
		const razzle = HEROES.find((h) => h.id === 'razzle')!
		const arien = HEROES.find((h) => h.id === 'arien')!
		expect(draftable(arien, [1, 2, 3])).toBe(true)
		expect(draftable(ig, [1, 2, 3, 4])).toBe(FOUR_STAR_LIVE.includes('ignatia'))
		expect(draftable(ig, [1, 2, 3, 4], true)).toBe(true)
		expect(draftable(ig, [1, 2, 3], true)).toBe(false)
		expect(draftable(razzle, [1, 2, 3, 4], true)).toBe(FOUR_STAR_LAB.includes('razzle') || FOUR_STAR_LIVE.includes('razzle'))
	})
	it('a game with a hero still in the lab is a test game: never uploaded', () => {
		const j = { fromStart: true, done: true, players: { a: { name: 'Zara', seat: 0, hero: 'arien' }, b: { name: 'Mo', seat: 1, hero: 'ignatia' } } } as unknown as Journal
		expect(isFullGame(j)).toBe(!isLabHero('ignatia'))
		expect(isFullGame({ ...j, players: { ...j.players, b: { name: 'Mo', seat: 1, hero: 'brogan' } } } as Journal)).toBe(true)
	})
})
