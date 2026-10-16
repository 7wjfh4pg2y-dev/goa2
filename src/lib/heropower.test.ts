import { describe, it, expect } from 'vitest'
import { applyCardReq, turnOrder, turnKey, actingIdx, actorOf, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { equilibrium, canFlip, flipUsed, hasPower, canInscribe, activeRune, runesOf, secondRune, heldGolds, deckGolds, takaSwapKind, mateOffer, canReverse, warpOffer, capsuleOffer, type Rune, type TurnCtx } from './heropower'
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
		// …but defending on someone else's turn is an action too (the Oaths read the runes)
		const atk = { ...actingAs(base, 'B'), attacks: { S: { by: 'B', defending: false, at: 0 } } } as MatchState
		expect(secondRune({ ...atk, ...second(atk, 'horn') } as MatchState, 'S', ctx(atk))).toBe('horn')
		const forced = { ...actingAs(base, 'B'), forced: { S: { by: 'B', die: false, at: 0 } } } as MatchState
		expect(second(forced, 'anvil')).not.toEqual({})
		// the ultimate taken back: the second rune no longer counts
		const noUlt = { ...after, cards: { ...after.cards, S: { ...after.cards!.S, ultimate: false } } } as MatchState
		expect(secondRune(noUlt, 'S', ctx(noUlt))).toBe(null)
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

describe('Emmitt: reversed turns, Time Warp, Time Capsule', () => {
	const EC = heroCards('emmitt'), AC = heroCards('arien')
	const named = (n: string) => EC.findIndex((c) => c.name === n)
	const reverse = named('Reverse Time'), warp = named('Time Warp'), capsule = named('Time Capsule')
	const tctx = (s: MatchState): TurnCtx => ({ ...ctx(s), teams: { E: 'orange', M: 'orange', B: 'blue' } })
	const ini = (i: number) => AC[i].initiative ?? 0
	// two Arien cards with different initiatives for M and B
	const hiA = AC.reduce((a, _, i) => (!AC[i].handicapped && (AC[i].initiative ?? 0) > (AC[a].initiative ?? 0) ? i : a), 0)
	const loA = AC.reduce((a, _, i) => (!AC[i].handicapped && AC[i].color !== 'PURPLE' && (AC[i].initiative ?? 99) < (AC[a].initiative ?? 99) ? i : a), 0)
	function eg(ePending: number, mPending = hiA, bPending = loA, turn = 2, extra: Partial<MatchState> = {}): MatchState {
		const e = { ...newPlayerCardState('emmitt'), pending: ePending }
		const m = { ...newPlayerCardState('arien'), pending: mPending }
		const b = { ...newPlayerCardState('arien'), pending: bPending }
		return {
			round: 1, turn, seats: 4, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0, host: 'H',
			pieces: { E: { id: 'E', hex: '1_1', team: 'orange', kind: 'hero', hero: 'emmitt' }, M: { id: 'M', hex: '1_2', team: 'orange', kind: 'hero', hero: 'arien' }, B: { id: 'B', hex: '5_5', team: 'blue', kind: 'hero', hero: 'arien' } },
			cards: { E: e, M: m, B: b }, ...extra
		} as unknown as MatchState
	}
	const pw = (s: MatchState, pid: string, op: string, more: Record<string, unknown> = {}) => applyCardReq(s, { kind: 'power', pid, op, ...more } as never)
	it('his gold acting: he may reverse the NEXT turn — then lower initiative acts first', () => {
		const s0 = actingAs(eg(reverse), 'E')
		// "After the attack": nothing until his attack lands — he defeats a minion with it
		expect(canReverse(s0, 'E', tctx(s0))).toBe(false)
		const minion = { id: 'x', hex: '1_3', team: 'blue', kind: 'minion', role: 'melee' }
		const sm = { ...s0, pieces: { ...s0.pieces, x: minion } } as unknown as MatchState
		const s = { ...sm, ...applyCardReq(sm, { kind: 'defeatMinion', pid: 'E', piece: 'x' }) } as MatchState
		expect(canReverse(s, 'E', tctx(s))).toBe(true)
		const p = pw(s, 'E', 'emReverse')
		expect(p.power?.E?.rev).toBe('1-3')
		// next turn: M (high) and B (low) — B goes first now
		const t3 = { ...eg(-1, hiA, loA, 3), power: p.power } as MatchState
		expect(ini(hiA)).toBeGreaterThan(ini(loA))
		expect(turnOrder(t3)).toEqual(['B', 'M'])
		// any other turn: high first as ever
		expect(turnOrder({ ...t3, turn: 4 } as MatchState)).toEqual(['M', 'B'])
		// not on the 4th turn (a "next turn" effect ends with the round), and not someone else's card
		const t40 = actingAs(eg(reverse, hiA, loA, 4), 'E')
		const t4 = { ...t40, power: { E: { hit: `${turnKey(t40)}:${actingIdx(t40)}` } } } as MatchState
		expect(canReverse(t4, 'E', tctx(t4))).toBe(false)
		expect(pw(actingAs(eg(reverse), 'M'), 'E', 'emReverse')).toEqual({})
	})
	it('Time Warp: Emmitt names an enemy whose card hasn\'t acted; they swap it for a resolved one; the order holds', () => {
		const resolved = AC.findIndex((c, i) => i !== hiA && i !== loA && !c.handicapped && c.color !== 'PURPLE' && c.color !== 'GOLD')
		const base = eg(warp, hiA, loA)
		const b = { ...base.cards!.B, turns: [resolved, null, null, null], hand: base.cards!.B.hand.filter((i) => i !== resolved && i !== loA) }
		const s0 = actingAs({ ...base, cards: { ...base.cards, B: b } } as MatchState, 'E')
		// Emmitt acts first only if his initiative is the highest — find his place
		const s = s0
		const at = turnOrder(s).indexOf('E'), bAt = turnOrder(s).indexOf('B')
		expect(bAt).toBeGreaterThan(at)
		expect(pw(s, 'E', 'emWarp', { target: 'M' })).toEqual({}) // not a teammate
		const w = { ...s, ...pw(s, 'E', 'emWarp', { target: 'B' }) } as MatchState
		expect(warpOffer(w, 'B', tctx(w))).toEqual({ by: 'E' })
		expect(w.power?.E?.shen).toBe(turnKey(w))
		const after = { ...w, ...pw(w, 'B', 'warpSwap', { idx: 0 }) } as MatchState
		expect(after.cards!.B.pending).toBe(resolved)
		expect(after.cards!.B.turns[0]).toBe(loA)
		expect(actorOf(after)).toBe('E')
		expect(warpOffer(after, 'B', tctx(after))).toBe(null)
	})
	it('Time Capsule: he and his friends take back what they discarded this turn (once), enemies don\'t', () => {
		const s0 = actingAs(eg(capsule), 'E')
		const mHand = s0.cards!.M.hand
		const s1 = { ...s0, ...applyCardReq(s0, { kind: 'defend', pid: 'M', idx: mHand[0] }) } as MatchState
		expect(s1.turnDisc?.by.M).toEqual([mHand[0]])
		expect(capsuleOffer(s1, 'M', tctx(s1))).toEqual([mHand[0]])
		expect(capsuleOffer(s1, 'B', tctx(s1))).toEqual([])
		const s2 = { ...s1, ...pw(s1, 'M', 'capsule') } as MatchState
		expect(s2.cards!.M.hand).toContain(mHand[0])
		expect(s2.cards!.M.discard).not.toContain(mHand[0])
		expect(s2.power?.E?.shen).toBe(turnKey(s2))
		expect(pw(s2, 'M', 'capsule')).toEqual({})
	})
})
