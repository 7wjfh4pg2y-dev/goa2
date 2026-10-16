import { describe, it, expect } from 'vitest'
import { applyCardReq, turnOrder, turnKey, actingIdx, actorOf, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { equilibrium, canFlip, flipUsed, hasPower, canInscribe, activeRune, runesOf, secondRune, heldGolds, deckGolds, takaSwapKind, mateOffer, type Rune, type TurnCtx } from './heropower'
import { goldsOf, isHidden, type PlayerCardState } from './cards/cardstate'
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

describe('Ignatia: Equilibrium (her silver) — both halves of her cards while its effect is on', () => {
	const fx = (idx: number, endRound = 1, endTurn = 4) => ({ id: 'e1', pid: 'I', hero: 'ignatia', idx, name: 'Equilibrium', dur: 'round' as const, round: 1, turn: 1, endRound, endTurn })
	it('playing the silver alone does nothing: only switching its effect on (Activate effect) does', () => {
		const s = game([silver, red1, null, null])
		expect(equilibrium(s, 'I')).toBe(false)
		expect(equilibrium({ ...s, effects: [fx(silver)] } as MatchState, 'I')).toBe(true)
		// another of her cards' effects, or someone else's, doesn't count
		expect(equilibrium({ ...s, effects: [fx(red1)] } as MatchState, 'I')).toBe(false)
		expect(equilibrium({ ...s, effects: [{ ...fx(silver), pid: 'B' }] } as MatchState, 'I')).toBe(false)
	})
	it('ends with the effect: a This round effect is gone once the round ends', () => {
		const s = { ...game([silver, red1, null, null]), turn: 4, effects: [fx(silver)] } as MatchState
		const next = { ...s, ...applyCardReq(s, { kind: 'advance', pid: 'I' }) } as MatchState
		expect(next.round).toBe(2)
		expect(equilibrium(next, 'I')).toBe(false)
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

describe('Snorri: Inscribe the Runes (his silver) — a rune under each turn slot', () => {
	const sSilver = heroCards('snorri').findIndex((c) => c.color === 'SILVER' && !c.handicapped)
	const sRed = heroCards('snorri').findIndex((c) => c.color === 'RED' && (c.level ?? 0) === 1)
	// S = Snorri (orange) vs B (blue); turn 2, his card this turn is `pending`
	function sg(pending: number, ult = false, power?: Record<string, unknown>): MatchState {
		const sn = { ...newPlayerCardState('snorri'), turns: [sRed, null, null, null], pending, ultimate: ult }
		const b = { ...newPlayerCardState('arien'), pending: 0 }
		return {
			round: 1, turn: 2, seats: 2, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0, host: 'B',
			pieces: { S: hero('I', 'orange', 'snorri'), B: hero('B', 'blue', 'arien') },
			cards: { S: sn, B: b }, power
		} as unknown as MatchState
	}
	const order = ['horn', 'bird', 'anvil', 'axe'] as Rune[]
	const inscribe = (s: MatchState, pid = 'S', o: Rune[] = order, target?: string) => applyCardReq(s, { kind: 'power', pid, op: 'snorriInscribe', order: o, target })
	it('only while his silver is the card acting (his own turn, after the reveal)', () => {
		const s = actingAs(sg(sSilver), 'S')
		expect(canInscribe(s, 'S', ctx(s))).toBe(true)
		const p = inscribe(s)
		expect(p.power?.S?.runes).toEqual(order)
		// another card, or someone else acting, or before the reveal: refused
		const red = actingAs(sg(sRed === 0 ? 1 : 0), 'S')
		expect(inscribe(red)).toEqual({})
		const other = actingAs(sg(sSilver), 'B')
		expect(inscribe(other)).toEqual({})
		expect(canInscribe(s, 'S', { ...ctx(s), revealed: false })).toBe(false)
		// not a full set of four different runes: refused
		expect(inscribe(s, 'S', ['axe', 'axe', 'bird', 'horn'] as Rune[])).toEqual({})
	})
	it('the active rune is the one under this turn\'s slot; they stay through the round end', () => {
		const s = { ...actingAs(sg(sSilver), 'S'), power: { S: { runes: order } } } as MatchState
		expect(activeRune(s, 'S', 1)).toBe('bird')
		expect(activeRune(s, 'S', 3)).toBe('axe')
		expect(activeRune(sg(sSilver), 'S', 1)).toBe(null) // nothing before the first Inscribe
		const end = { ...s, turn: 4 } as MatchState
		const next = { ...end, ...applyCardReq(end, { kind: 'advance', pid: 'B' }) } as MatchState
		expect(next.round).toBe(2)
		expect(runesOf(next, 'S')).toEqual(order)
	})
	it('the host can fix them any time; nobody else can touch his', () => {
		const s = sg(sRed)
		expect(inscribe(s, 'B', order, 'S').power?.S?.runes).toEqual(order)
		expect(inscribe({ ...s, host: 'X' } as MatchState, 'B', order, 'S')).toEqual({})
	})
	it('Rune Mastery: an inactive rune as a second, on his own acting turn, for this turn only', () => {
		const base = { ...actingAs(sg(sRed, true), 'S'), power: { S: { runes: order } } } as MatchState
		const second = (s: MatchState, rune: Rune | null) => applyCardReq(s, { kind: 'power', pid: 'S', op: 'snorriSecond', rune })
		expect(second(base, 'bird')).toEqual({}) // bird is the active one
		const p = second(base, 'horn')
		const after = { ...base, ...p } as MatchState
		expect(secondRune(after, 'S', ctx(after))).toBe('horn')
		expect(secondRune({ ...after, turn: 3 } as MatchState, 'S', ctx({ ...after, turn: 3 } as MatchState))).toBe(null)
		expect(secondRune({ ...after, ...second(after, null) } as MatchState, 'S', ctx(after))).toBe(null)
		// no ultimate / not his turn: refused
		expect(second({ ...base, cards: { ...base.cards, S: { ...base.cards!.S, ultimate: false } } } as MatchState, 'horn')).toEqual({})
		expect(second(actingAs(base, 'B'), 'horn')).toEqual({})
	})
})

describe('Takahide: gold card swaps, Bushido face down, teammates swap, Ready for War', () => {
	const TC = heroCards('takahide')
	const [butterfly, sting, tiger] = goldsOf('takahide')
	const silver = TC.findIndex((c) => c.color === 'SILVER' && !c.handicapped)
	const setEx = TC.findIndex((c) => c.name === 'Set an Example')
	const sake = TC.findIndex((c) => c.name === 'Hold my Saké')
	const red1 = TC.findIndex((c) => c.color === 'RED' && (c.level ?? 0) === 1)
	const tctx = (s: MatchState): TurnCtx => ({ ...ctx(s), teams: { T: 'orange', M: 'orange', B: 'blue' } })
	// T = Takahide (orange) + M = mate Arien (orange) vs B (blue); turn 2
	function tg(tPending: number, mPending = 0, tExtra: Partial<PlayerCardState> = {}): MatchState {
		const base = newPlayerCardState('takahide')
		const t = { ...base, hand: base.hand.filter((i) => i !== tPending), pending: tPending, ...tExtra }
		const m = { ...newPlayerCardState('arien'), pending: mPending }
		m.hand = m.hand.filter((i) => i !== mPending)
		return {
			round: 1, turn: 2, seats: 4, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0, host: 'B',
			pieces: { T: { id: 'T', hex: '1_1', team: 'orange', kind: 'hero', hero: 'takahide' }, M: { id: 'M', hex: '1_2', team: 'orange', kind: 'hero', hero: 'arien' }, B: { id: 'B', hex: '5_5', team: 'blue', kind: 'hero', hero: 'arien' } },
			cards: { T: t, M: m, B: { ...newPlayerCardState('arien'), pending: 1 } }
		} as unknown as MatchState
	}
	const swap = (s: MatchState, idx: number, pid = 'T', target?: string) => applyCardReq(s, { kind: 'power', pid, op: 'takaSwap', idx, target })
	it('he starts holding Butterfly; the other two golds are in his deck', () => {
		const cs = newPlayerCardState('takahide')
		expect(heldGolds(cs)).toEqual([butterfly])
		expect(deckGolds(cs)).toEqual([sting, tiger])
	})
	it('after playing a gold, it turns into another in this turn\'s slot, face up', () => {
		const s = actingAs(tg(butterfly), 'T')
		expect(takaSwapKind(s, 'T', tctx(s))).toBe('gold')
		const cs = swap(s, tiger).cards!.T
		expect(cs.pending).toBe(tiger)
		expect(heldGolds(cs)).toEqual([tiger])
		expect(cs.hidden ?? []).toEqual([])
		expect(swap(actingAs(tg(butterfly), 'B'), tiger)).toEqual({})
		expect(swap(s, butterfly)).toEqual({})
	})
	it('the safeguard that returns lost cards follows his current gold (Butterfly stays in the deck)', () => {
		const s = actingAs(tg(butterfly), 'T')
		const after = { ...s, ...swap(s, sting), turn: 4 } as MatchState
		const next = { ...after, ...applyCardReq(after, { kind: 'advance', pid: 'B' }) } as MatchState
		expect(next.cards!.T.hand).toContain(sting)
		expect(next.cards!.T.hand).not.toContain(butterfly)
	})
	it('Bushido: his gold in the hand → the new one in the hand; in the discard → face down there', () => {
		const inHand = actingAs(tg(silver), 'T')
		expect(takaSwapKind(inHand, 'T', tctx(inHand))).toBe('bushido')
		const h = swap(inHand, sting).cards!.T
		expect(h.hand).toContain(sting)
		expect(h.hand).not.toContain(butterfly)
		expect(h.hidden ?? []).toEqual([])
		const base = newPlayerCardState('takahide')
		const disc = actingAs(tg(silver, 0, { hand: base.hand.filter((i) => i !== silver && i !== butterfly), discard: [butterfly] }), 'T')
		const d = swap(disc, tiger).cards!.T
		expect(d.discard).toEqual([tiger])
		expect(isHidden(d, tiger)).toBe(true)
		const end = { ...disc, cards: { ...disc.cards, T: d }, turn: 4 } as MatchState
		const next = applyCardReq(end, { kind: 'advance', pid: 'B' })
		expect(next.cards!.T.hand).toContain(tiger)
		expect(next.cards!.T.hidden).toBeUndefined()
	})
	it('one swap per card: after it, his card can\'t swap again this action', () => {
		const s = actingAs(tg(butterfly), 'T')
		const a = { ...s, ...swap(s, sting) } as MatchState
		expect(takaSwapKind(a, 'T', tctx(a))).toBe(null)
		expect(swap(a, tiger)).toEqual({})
		const b0 = actingAs(tg(silver), 'T')
		const b = { ...b0, ...swap(b0, sting) } as MatchState
		expect(swap(b, tiger)).toEqual({})
	})
	it('a gold swapped while it acts keeps his place in the order, whatever its new initiative', () => {
		// B (blue) plays Butterfly (8), between Sting (7) and Tiger (9); Takahide acts first on Tiger
		const s0 = tg(tiger, 0, { basics: [tiger, silver] })
		const bb = newPlayerCardState('takahide')
		const s1 = { ...s0, cards: { ...s0.cards, B: { ...bb, hand: bb.hand.filter((i) => i !== butterfly), pending: butterfly } } } as MatchState
		const s = actingAs(s1, 'T')
		const after = { ...s, ...swap(s, sting) } as MatchState
		expect(after.cards!.T.pending).toBe(sting)
		expect(actorOf(after)).toBe('T')
	})
	it('a face-down gold taken back from the discard is no longer face down', () => {
		const base = newPlayerCardState('takahide')
		const disc = actingAs(tg(silver, 0, { hand: base.hand.filter((i) => i !== silver && i !== butterfly), discard: [butterfly] }), 'T')
		const d = { ...disc, ...swap(disc, tiger) } as MatchState
		expect(isHidden(d.cards!.T, tiger)).toBe(true)
		// the host moves it back to his hand (a retrieve card): the mark goes with it
		const back = { ...d, cards: { ...d.cards, T: { ...d.cards!.T, discard: [], hand: [...d.cards!.T.hand, tiger] } } } as MatchState
		const p = applyCardReq(back, { kind: 'coins', pid: 'T', delta: 1 } as never)
		expect(isHidden({ ...back, ...p }.cards!.T, tiger)).toBe(false)
	})
	it('the host can swap it any time; nobody else can', () => {
		const s = tg(red1)
		expect(swap(s, tiger, 'B', 'T').cards!.T.hand).toContain(tiger)
		expect(swap(s, tiger, 'M', 'T')).toEqual({})
	})
	it('a teammate swaps their unresolved card once while Set an Example acts; the order keeps the acted cards first', () => {
		const arien = heroCards('arien')
		const low = arien.findIndex((c) => c.color === 'GREEN' && (c.level ?? 0) === 1)
		const s0 = actingAs(tg(setEx, low), 'T')
		// nothing before his attack lands
		expect(mateOffer(s0, 'M', tctx(s0))).toBe(null)
		// he defeats a minion with it: the swap opens
		const minion = { id: 'x', hex: '1_3', team: 'blue', kind: 'minion', role: 'melee' }
		const sm = { ...s0, pieces: { ...s0.pieces, x: minion } } as unknown as MatchState
		const s = { ...sm, ...applyCardReq(sm, { kind: 'defeatMinion', pid: 'T', piece: 'x' }) } as MatchState
		expect(mateOffer(s, 'M', tctx(s))).toEqual({ by: 'T', from: 'hand' })
		expect(mateOffer(s, 'B', tctx(s))).toBe(null)
		const high = s.cards!.M.hand.reduce((a, b) => ((arien[b].initiative ?? 0) > (arien[a].initiative ?? 0) ? b : a))
		const p = applyCardReq(s, { kind: 'power', pid: 'M', op: 'mateSwap', idx: high, src: 'hand' })
		const after = { ...s, ...p } as MatchState
		expect(after.cards!.M.pending).toBe(high)
		expect(after.cards!.M.hand).toContain(low)
		expect(actorOf(after)).toBe('T')
		expect(mateOffer(after, 'M', tctx(after))).toBe(null)
		expect(applyCardReq(s, { kind: 'power', pid: 'M', op: 'mateSwap', idx: high, src: 'discard' })).toEqual({})
		const sk0 = actingAs(tg(sake, low), 'T')
		const sk = { ...sk0, power: { T: { hit: `${turnKey(sk0)}:0` } } } as MatchState
		expect(mateOffer(sk, 'M', tctx(sk))?.from).toBe('both')
		const ended = { ...after, ...applyCardReq(after, { kind: 'endAct', pid: 'T' }) } as MatchState
		expect(turnOrder(ended)[0]).toBe('T')
	})
	it('Ready for War: the silver goes, all three golds come to hand; taken back, the other way', () => {
		const s = tg(red1)
		const on = { ...s, cards: { ...s.cards, T: { ...s.cards!.T, ultimate: true } } } as MatchState
		const p = applyCardReq(on, { kind: 'coins', pid: 'T', delta: 1 })
		const cs = p.cards!.T
		expect(cs.hand).toEqual(expect.arrayContaining([butterfly, sting, tiger]))
		expect(cs.hand).not.toContain(silver)
		expect(p.power!.T.war).toBe(true)
		const off = { ...on, ...p, cards: { ...p.cards, T: { ...cs, ultimate: false } } } as MatchState
		const q = applyCardReq(off, { kind: 'coins', pid: 'T', delta: 1 })
		expect(q.cards!.T.hand).toContain(silver)
		expect(heldGolds(q.cards!.T)).toHaveLength(1)
	})
})
