import { describe, it, expect } from 'vitest'
import { applyCardReq, transferSeat, turnOrder, turnKey, actingIdx, actorOf, minionDefense, respawnHero, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { equilibrium, canFlip, flipUsed, hasPower, canInscribe, activeRune, runesOf, secondRune, heldGolds, deckGolds, takaSwapKind, mateOffer, canReverse, warpOffer, capsuleOffer, nkPower, canLaugh, laughTargets, nkSwapsLeft, nkSlots, doubtNow, crackNow, lineHexes, rzPower, rzRemoves, rzTwin, crowdField, wantsSecond, facesInUse, rzSpawnsLeft, rzLeft, bodiesOf, isDouble, heroPidOf, crowdBonus, pieceDist, type Rune, type TurnCtx } from './heropower'
import { goldsOf, isHidden, repairCards, revealTurn, endRound, type PlayerCardState } from './cards/cardstate'
import { draftable, isLabHero, FOUR_STAR_LAB, FOUR_STAR_LIVE, HEROES } from './heroes'
import { isFullGame, type Journal } from './recorder'
import { statusFrom } from './tokens'

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

describe('NebKher: Diabolical Laughter, What the Hell Are You?, card swaps, a named colour, the Crack, Illusionary Force', () => {
	const NC = heroCards('nebkher'), AC = heroCards('arien')
	const named = (n: string) => NC.findIndex((c) => c.name === n)
	const laughC = named('Diabolical Laughter'), doubtC = named('Imbue Doubt'), crackC = named('Crack in Reality'), grip = named('Mind Grip'), forceC = named('Illusionary Force')
	const lowA = AC.reduce((a, _, i) => (!AC[i].handicapped && AC[i].color !== 'PURPLE' && (AC[i].initiative ?? 99) < (AC[a].initiative ?? 99) ? i : a), 0)
	// N (NebKher, orange) at 5_5 · B and C (blue) at 2 and 7 spaces away · M his teammate
	function ng(nPending: number, ult = false, extra: Partial<MatchState> = {}, turn = 3): MatchState {
		const n = { ...newPlayerCardState('nebkher'), pending: nPending, ultimate: ult }
		const b = { ...newPlayerCardState('arien'), pending: lowA, turns: [3, 4, null, null] }
		const c = { ...newPlayerCardState('arien'), pending: lowA }
		const m = { ...newPlayerCardState('arien'), pending: lowA }
		return {
			round: 1, turn, seats: 4, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0, host: 'H',
			pieces: { N: { id: 'N', hex: '5_5', team: 'orange', kind: 'hero', hero: 'nebkher' }, M: { id: 'M', hex: '5_6', team: 'orange', kind: 'hero', hero: 'arien' },
				B: { id: 'B', hex: '7_5', team: 'blue', kind: 'hero', hero: 'arien' }, C: { id: 'C', hex: '12_5', team: 'blue', kind: 'hero', hero: 'arien' } },
			cards: { N: n, B: b, C: c, M: m }, ...extra
		} as unknown as MatchState
	}
	const pw = (s: MatchState, pid: string, op: string, more: Record<string, unknown> = {}) => applyCardReq(s, { kind: 'power', pid, op, ...more } as never)
	const tc = (s: MatchState): TurnCtx => ({ ...ctx(s), teams: { N: 'orange', M: 'orange', B: 'blue', C: 'blue' } })
	it('is a lab hero with a power', () => {
		expect(hasPower('nebkher')).toBe(true)
		expect(FOUR_STAR_LAB).toContain('nebkher')
	})
	it('the card acting decides the button: laugh · grip · name · crack', () => {
		expect(nkPower(actingAs(ng(laughC), 'N'), 'N', tc(ng(laughC)))).toBe(null) // not his turn to act unless acting
		expect(nkPower(actingAs(ng(laughC), 'N'), 'N', tc(actingAs(ng(laughC), 'N')))).toBe('laugh')
		expect(nkPower(actingAs(ng(grip), 'N'), 'N', tc(actingAs(ng(grip), 'N')))).toBe('grip')
		expect(nkPower(actingAs(ng(doubtC), 'N'), 'N', tc(actingAs(ng(doubtC), 'N')))).toBe('name')
		expect(nkPower(actingAs(ng(crackC), 'N'), 'N', tc(actingAs(ng(crackC), 'N')))).toBe('crack')
		expect(nkPower(actingAs(ng(forceC), 'N'), 'N', tc(actingAs(ng(forceC), 'N')))).toBe(null)
	})
	it('he laughs once per card; without the ultimate nobody has to discard', () => {
		const s = actingAs(ng(laughC), 'N')
		const p = pw(s, 'N', 'nkLaugh')
		expect(p.power?.N?.laugh).toBeTruthy()
		expect(p.forced).toBeUndefined()
		const s2 = { ...s, ...p } as MatchState
		expect(canLaugh(s2, 'N', tc(s2))).toBe(false)
		expect(pw(s2, 'N', 'nkLaugh')).toEqual({})
		// not while another card acts, and not for someone else
		expect(pw(actingAs(ng(laughC), 'B'), 'N', 'nkLaugh')).toEqual({})
		expect(pw(s, 'B', 'nkLaugh')).toEqual({})
	})
	it('with the ultimate, every enemy hero in radius (5 + Area items) must discard or be defeated; each can be called off', () => {
		const s = actingAs(ng(laughC, true), 'N')
		expect(laughTargets(s, 'N', tc(s))).toEqual(['B']) // C is 7 away, M is a friend
		const p = pw(s, 'N', 'nkLaugh')
		expect(Object.keys(p.forced ?? {})).toEqual(['B'])
		expect(p.forced?.B).toMatchObject({ by: 'N', die: true })
		// two Area items reach C
		const far = actingAs(ng(laughC, true), 'N')
		far.cards!.N = { ...far.cards!.N, items: { radius: 2 } }
		expect(laughTargets(far, 'N', tc(far)).sort()).toEqual(['B', 'C'])
		const p2 = pw(far, 'N', 'nkLaugh')
		const s3 = { ...far, ...p2 } as MatchState
		// he calls one off (an immune hero): the other still has to answer
		const s4 = { ...s3, ...applyCardReq(s3, { kind: 'forceResolve', pid: 'N', target: 'C', result: 'cancel' }) } as MatchState
		expect(Object.keys(s4.forced ?? {})).toEqual(['B'])
	})
	it('swaps two resolved cards of an enemy hero, up to three times a Laughter — only once he has laughed', () => {
		const s0 = actingAs(ng(laughC), 'N')
		expect(pw(s0, 'N', 'nkSwap', { target: 'B', slots: [0, 1] })).toEqual({})
		const s = { ...s0, ...pw(s0, 'N', 'nkLaugh') } as MatchState
		const p = pw(s, 'N', 'nkSwap', { target: 'B', slots: [0, 1] })
		expect(p.cards?.B?.turns).toEqual([4, 3, null, null])
		let x = { ...s, ...p } as MatchState
		expect(nkSwapsLeft(x, 'N', tc(x))).toBe(2)
		expect(p.nkNews).toMatchObject({ kind: 'swap', to: ['B'] })
		// the second swap on the same hero this turn: no second toast
		const p2 = pw(x, 'N', 'nkSwap', { target: 'B', slots: [0, 1] })
		expect(p2.nkNews).toBeUndefined()
		x = { ...x, ...p2 } as MatchState
		x = { ...x, ...pw(x, 'N', 'nkSwap', { target: 'B', slots: [0, 1] }) } as MatchState
		expect(pw(x, 'N', 'nkSwap', { target: 'B', slots: [0, 1] })).toEqual({})
		// only earlier turn slots that hold a card, only an enemy, two different slots
		expect(pw(s, 'N', 'nkSwap', { target: 'B', slots: [0, 3] })).toEqual({})
		expect(pw(s, 'N', 'nkSwap', { target: 'M', slots: [0, 1] })).toEqual({})
		expect(pw(s, 'N', 'nkSwap', { target: 'B', slots: [1, 1] })).toEqual({})
	})
	it("a card that already acted this turn counts as resolved: it can trade places with an earlier slot", () => {
		const hiA = AC.reduce((a, _, i) => (!AC[i].handicapped && (AC[i].initiative ?? 0) > (AC[a].initiative ?? 0) ? i : a), 0)
		const base = ng(laughC)
		base.cards!.B = { ...base.cards!.B, pending: hiA }
		const s0 = actingAs(base, 'N')
		expect(turnOrder(s0).indexOf('B')).toBeLessThan(turnOrder(s0).indexOf('N'))
		expect(nkSlots(s0, 'B', tc(s0))).toEqual([0, 1, 2])
		const s = { ...s0, ...pw(s0, 'N', 'nkLaugh') } as MatchState
		const p = pw(s, 'N', 'nkSwap', { target: 'B', slots: [2, 0] })
		expect(p.cards?.B?.pending).toBe(3)
		expect(p.cards?.B?.turns[0]).toBe(hiA)
		expect(p.acting?.pin).toEqual(turnOrder(s0).slice(0, actingIdx(s0) + 1))
		// a card that hasn't acted yet is not resolved: once the order passes him, nothing of this turn counts
		const early = { ...s0, acting: { key: turnKey(s0), idx: 0 } } as MatchState
		expect(nkSlots(early, 'B', tc(early))).toEqual([0, 1])
	})
	it('Mind Grip: steals an enemy hero’s previous card (a log line; performing it is the player’s)', () => {
		const s = actingAs(ng(grip), 'N')
		expect(pw(s, 'N', 'nkGrip', { target: 'B' }).power?.N?.grip?.target).toBe('B')
		expect(pw(s, 'N', 'nkGrip', { target: 'C' })).toEqual({}) // nothing in C's previous slot
		expect(pw(s, 'N', 'nkGrip', { target: 'M' })).toEqual({}) // a friend
		expect(pw(actingAs(ng(laughC), 'N'), 'N', 'nkGrip', { target: 'B' })).toEqual({})
	})
	it('names a colour: seen this turn and the next, then gone', () => {
		const s = actingAs(ng(doubtC), 'N')
		const p = pw(s, 'N', 'nkName', { color: 'RED' })
		const x = { ...s, ...p } as MatchState
		expect(doubtNow(x, 'N', tc(x))).toBe('RED')
		const t4 = { ...x, turn: 4 } as MatchState
		expect(doubtNow(t4, 'N', tc(t4))).toBe('RED')
		const r2 = { ...x, round: 2, turn: 1 } as MatchState
		expect(doubtNow(r2, 'N', tc(r2))).toBe(null)
		// naming it switches the card's Next-turn effect on (the ring's Effect? ask is answered); naming again adds none
		expect((x.effects ?? []).filter((e) => e.pid === 'N' && e.idx === doubtC).map((e) => e.dur)).toEqual(['next'])
		const y = { ...x, ...pw(x, 'N', 'nkName', { color: 'BLUE' }) } as MatchState
		expect((y.effects ?? []).filter((e) => e.pid === 'N').length).toBe(1)
		expect(pw(actingAs(ng(laughC), 'N'), 'N', 'nkName', { color: 'RED' })).toEqual({})
	})
	it('the Crack: a straight line through his space, this turn only', () => {
		const s = actingAs(ng(crackC), 'N')
		const x = { ...s, ...pw(s, 'N', 'nkCrack', { dir: 1 }) } as MatchState
		expect(crackNow(x, tc(x))).toEqual({ pid: 'N', hex: '5_5', dir: 1 })
		expect((x.effects ?? []).map((e) => e.dur)).toEqual(['turn'])
		const line = lineHexes('5_5', 1, (h) => { const [c, r] = h.split('_').map(Number); return c >= 0 && c < 10 && r >= 0 && r < 10 })
		expect(line).toContain('0_5'); expect(line).toContain('9_5'); expect(line.every((h) => h.endsWith('_5'))).toBe(true)
		expect(crackNow({ ...x, turn: 4 } as MatchState, tc({ ...x, turn: 4 } as MatchState))).toBe(null)
	})
	it('Illusionary Force: his Illusions next to the hero he attacks lower its defence; not when he is attacked', () => {
		const ill = { id: 'i1', hex: '6_5', team: 'orange', kind: 'token', token: 'token_illusion', owner: 'N' }
		const fx = { id: 'e1', pid: 'N', hero: 'nebkher', idx: forceC, name: 'Illusionary Force', dur: 'round', round: 1, turn: 3, endRound: 1, endTurn: 4 }
		const base = ng(laughC, false, {}) as MatchState
		const s = { ...base, pieces: { ...base.pieces, i1: ill }, effects: [fx], attacks: { B: { by: 'N', defending: false, at: 0 } } } as unknown as MatchState
		expect(minionDefense(s, 'B').mods).toContainEqual({ id: 'i1', d: -1 })
		// the effect off: nothing
		expect(minionDefense({ ...s, effects: [] } as MatchState, 'B').mods.find((m) => m.id === 'i1')).toBeUndefined()
		// B attacks N: his Illusions give him nothing
		const back = { ...s, pieces: { ...s.pieces, i1: { ...ill, hex: '5_4' } }, attacks: { N: { by: 'B', defending: false, at: 0 } } } as unknown as MatchState
		expect(minionDefense(back, 'N').mods.find((m) => m.id === 'i1')).toBeUndefined()
	})
})

describe('Razzle: her doubles — spawn, faces, remove / promote, Crowd Control, Rummage / Ransack, defeat clears every body', () => {
	const RC = heroCards('razzle'), AC = heroCards('arien')
	const named = (n: string) => RC.findIndex((c) => c.name === n)
	const gold = named('Stunt Doubles'), crowd = named('Crowd Control'), rummage = named('Rummage'), ransack = named('Ransack'), phantom = named('Phantom Strike')
	const lowA = AC.reduce((a, _, i) => (!AC[i].handicapped && AC[i].color !== 'PURPLE' && (AC[i].initiative ?? 99) < (AC[a].initiative ?? 99) ? i : a), 0)
	// R (Razzle, orange) at 5_5 · B (blue) next to her · M her teammate · H the host (no hero)
	function rg(rPending: number, extra: Partial<MatchState> = {}, rMore: Partial<PlayerCardState> = {}): MatchState {
		const r = { ...newPlayerCardState('razzle'), pending: rPending, ...rMore }
		const b = { ...newPlayerCardState('arien'), pending: lowA }
		const m = { ...newPlayerCardState('arien'), pending: lowA }
		return {
			round: 1, turn: 2, seats: 4, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt: 0, host: 'H',
			pieces: { R: { id: 'R', hex: '5_5', team: 'orange', kind: 'hero', hero: 'razzle' }, M: { id: 'M', hex: '9_9', team: 'orange', kind: 'hero', hero: 'arien' },
				B: { id: 'B', hex: '6_5', team: 'blue', kind: 'hero', hero: 'arien' } },
			cards: { R: r, B: b, M: m }, ...extra
		} as unknown as MatchState
	}
	const pw = (s: MatchState, pid: string, op: string, more: Record<string, unknown> = {}) => applyCardReq(s, { kind: 'power', pid, op, ...more } as never)
	const tc = (s: MatchState): TurnCtx => ({ ...ctx(s), teams: { R: 'orange', M: 'orange', B: 'blue' } })
	const go = (s: MatchState, p: Partial<MatchState>) => ({ ...s, ...p }) as MatchState
	// her gold attacks B, the host says Defended: the attack is over → the gold's "after the attack" opens
	const afterAttack = (s: MatchState) => { const a = go(s, applyCardReq(s, { kind: 'attack', pid: 'R', target: 'B' })); return go(a, applyCardReq(a, { kind: 'attackResolve', pid: 'H', target: 'B', result: 'defended' } as never)) }
	it('is a lab hero with a power', () => {
		expect(hasPower('razzle')).toBe(true)
		expect(FOUR_STAR_LAB).toContain('razzle')
	})
	it('Stunt Doubles: nothing to spawn until the attack has ended (defended counts), then up to 3 doubles, each with its own face', () => {
		const s = actingAs(rg(gold), 'R')
		expect(rzPower(s, 'R', tc(s))).toBe(null)
		expect(pw(s, 'R', 'rzSpawn', { hex: '3_3', face: 1 })).toEqual({})
		let x = afterAttack(s)
		expect(rzPower(x, 'R', tc(x))).toBe('spawn')
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_3', face: 1 }))
		expect(bodiesOf(x, 'R').map((p) => p.face ?? 0)).toEqual([0, 1])
		expect(isDouble(x.pieces['R~1'])).toBe(true)
		expect(heroPidOf(x.pieces['R~1'])).toBe('R')
		// the same face twice, an occupied space, a face out of range: refused
		expect(pw(x, 'R', 'rzSpawn', { hex: '3_4', face: 1 })).toEqual({})
		expect(pw(x, 'R', 'rzSpawn', { hex: '6_5', face: 2 })).toEqual({})
		expect(pw(x, 'R', 'rzSpawn', { hex: '3_4', face: 4 })).toEqual({})
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_4', face: 2 }))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_5', face: 3 }))
		expect(bodiesOf(x, 'R').length).toBe(4)
		expect(rzPower(x, 'R', tc(x))).toBe(null) // four of her: no more
		expect(rzSpawnsLeft(x, 'R', tc(x))).toBe(0)
		// not on someone else's turn, not for another player
		expect(pw(afterAttack(actingAs(rg(gold), 'R')), 'M', 'rzSpawn', { hex: '3_3', face: 1 })).toEqual({})
	})
	it('a double can be attacked; defeating it defeats her: every body leaves, markers on them come off, she respawns as one with a random face', () => {
		let x = afterAttack(actingAs(rg(gold), 'R'))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_3', face: 1 }))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_4', face: 2 }))
		x = { ...x, pieces: { ...x.pieces, pz: { id: 'pz', hex: '3_3', team: 'blue', kind: 'token', token: 'token_poison', owner: 'B', attachedTo: 'R~1' } } } as MatchState
		const a = go(x, applyCardReq(x, { kind: 'attack', pid: 'B', target: 'R', body: 'R~2' }))
		expect(a.attacks?.R?.body).toBe('R~2')
		const d = go(a, applyCardReq(a, { kind: 'attackResolve', pid: 'R', target: 'R', result: 'defeated' } as never))
		expect(Object.keys(d.pieces).sort()).toEqual(['B', 'M'])
		expect(d.defeated?.R?.piece.id).toBe('R')
		// the minions next to the BODY attacked count (not her own piece's)
		const mx = { ...a, pieces: { ...a.pieces, m1: { id: 'm1', hex: '3_5', team: 'blue', kind: 'minion', role: 'melee' } } } as MatchState
		expect(minionDefense(mx, 'R').total).toBe(-1)
		// respawn: one body, any of her four faces
		const r = { ...d, turn: 3, cards: { ...d.cards, R: { ...d.cards!.R, pending: phantom } }, acting: undefined } as unknown as MatchState
		const back = respawnHero(actingAs(r, 'R'), 'R', '1_1')
		expect(back.pieces).toBeTruthy()
		expect([0, 1, 2, 3]).toContain(back.pieces!.R.face ?? 0)
		expect(Object.values(back.pieces!).filter((p) => p.kind === 'hero' && heroPidOf(p) === 'R').length).toBe(1)
	})
	it('Remove one body: a double just goes; her own piece hands its place to a double; never the last one; Remove (her hero) takes them all', () => {
		let x = afterAttack(actingAs(rg(gold), 'R'))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_3', face: 1 }))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '3_4', face: 2 }))
		x = { ...x, pieces: { ...x.pieces, bt: { id: 'bt', hex: '3_3', team: 'blue', kind: 'token', token: 'marker_bounty', owner: 'B', attachedTo: 'R~1' } } } as MatchState
		expect(statusFrom(x.pieces).R?.bounty).toBe(1) // a marker on a double is on HER
		expect(pw(x, 'R', 'rzRemove', { id: 'R~1' })).toEqual({}) // her gold doesn't take bodies off
		// Hit and Gone after its attack: as many as she likes, never the last
		const hg = afterAttack(actingAs(rg(named('Hit and Gone')), 'R'))
		x = { ...hg, pieces: x.pieces } as MatchState
		const one = go(x, pw(x, 'R', 'rzRemove', { id: 'R~1' }))
		expect(bodiesOf(one, 'R').length).toBe(2)
		expect(one.pieces.bt.attachedTo).toBe('R') // the marker stays on HER
		const promo = go(one, pw(one, 'R', 'rzRemove', { id: 'R' }))
		expect(bodiesOf(promo, 'R').length).toBe(1)
		expect(promo.pieces.R.hex).toBe('3_4')
		expect(promo.pieces.R.face).toBe(2)
		expect(pw(promo, 'R', 'rzRemove', { id: 'R' })).toEqual({}) // the last one: that's Remove (her hero)
		expect(pw(one, 'B', 'rzRemove', { id: 'R~2' })).toEqual({}) // not an enemy's to remove
		expect(pw(one, 'H', 'rzRemove', { id: 'R~2' }).pieces).toBeTruthy() // the host may
		const all = go(x, applyCardReq(x, { kind: 'removeHero', pid: 'R' } as never))
		expect(Object.keys(all.pieces).filter((k) => k.startsWith('R'))).toEqual([])
		expect(all.defeated?.R).toBeTruthy()
		// Phantom Strike: ONE of her
		const ph = afterAttack(actingAs(rg(phantom), 'R'))
		const p3 = { ...ph, pieces: { ...ph.pieces, 'R~1': { ...ph.pieces.R, id: 'R~1', hex: '3_3', face: 1, owner: 'R' }, 'R~2': { ...ph.pieces.R, id: 'R~2', hex: '3_4', face: 2, owner: 'R' } } } as MatchState
		const p1 = go(p3, pw(p3, 'R', 'rzRemove', { id: 'R~1' }))
		expect(bodiesOf(p1, 'R').length).toBe(2)
		expect(rzRemoves(p1, 'R', tc(p1))).toBe(null)
		expect(pw(p1, 'R', 'rzRemove', { id: 'R~2' })).toEqual({})
		// her portrait went with her own piece: it is back on the shelf for the next Stunt Doubles
		const sd = afterAttack(actingAs(rg(gold), 'R'))
		const back = { ...sd, pieces: promo.pieces } as MatchState
		expect(facesInUse(back, 'R')).toEqual([2])
		expect(go(back, pw(back, 'R', 'rzSpawn', { hex: '4_4', face: 0 })).pieces['R~1']?.face).toBe(0)
	})
	it('none of her board moves touch her cards (hand, turn slots, discard stay put)', () => {
		const played = { turns: [named('Alleyoop'), named('Tightrope'), null, null], discard: [named('Rummage')] } as Partial<PlayerCardState>
		const hg = afterAttack(actingAs(rg(named('Hit and Gone'), {}, played), 'R'))
		let x = { ...hg, pieces: { ...hg.pieces, 'R~1': { ...hg.pieces.R, id: 'R~1', hex: '3_3', face: 1, owner: 'R' }, 'R~2': { ...hg.pieces.R, id: 'R~2', hex: '3_4', face: 2, owner: 'R' } } } as MatchState
		const before = JSON.stringify(x.cards!.R)
		x = go(x, pw(x, 'R', 'rzRemove', { id: 'R' })) // her own piece: a double takes over
		x = go(x, pw(x, 'R', 'rzRemove', { id: 'R~2' }))
		expect(JSON.stringify(x.cards!.R)).toBe(before)
		expect(bodiesOf(x, 'R').length).toBe(1)
	})
	it('Twin Strike (her ultimate): after an attack another of her repeats it once, on a different unit', () => {
		const into = { ultimate: true } as Partial<PlayerCardState>
		const two = (x: MatchState) => ({ ...x, pieces: { ...x.pieces, 'R~1': { ...x.pieces.R, id: 'R~1', hex: '6_6', face: 1, owner: 'R' }, C: { id: 'C', hex: '7_6', team: 'blue', kind: 'hero', hero: 'arien' } } }) as MatchState
		const s0 = two(actingAs(rg(phantom, {}, into), 'R'))
		expect(rzTwin(s0, 'R', tc(s0))).toBe(null) // not before the attack
		const x = go(s0, applyCardReq(s0, { kind: 'attack', pid: 'R', target: 'B' }))
		const y = go(x, applyCardReq(x, { kind: 'attackResolve', pid: 'H', target: 'B', result: 'defended' } as never))
		expect(rzTwin(y, 'R', tc(y))).toBe('offer')
		const t = go(y, pw(y, 'R', 'rzTwin'))
		expect(rzTwin(t, 'R', tc(t))).toBe('live')
		expect(applyCardReq(t, { kind: 'attack', pid: 'R', target: 'B' })).toEqual({}) // not the same unit
		const t2 = go(t, applyCardReq(t, { kind: 'attack', pid: 'R', target: 'C', body: 'R~1' } as never))
		expect(t2.attacks?.C?.by).toBe('R')
		expect(rzTwin(t2, 'R', tc(t2))).toBe(null) // spent
		// without the ultimate, or alone on the board: nothing
		const solo = afterAttack(actingAs(rg(phantom, {}, into), 'R'))
		expect(rzTwin(solo, 'R', tc(solo))).toBe(null)
	})
	it('Crowd Control: as a skill every other one of her leaves; as a defence +2 for each other one within 3 — only while it is in her hand', () => {
		let x = afterAttack(actingAs(rg(gold), 'R'))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '5_6', face: 1 }))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '15_15', face: 2 }))
		// the silver in her hand: 2 × the doubles within 3 of the body attacked
		expect(crowdBonus(x, 'R', 'R')).toBe(x.cards!.R.hand.includes(crowd) ? 2 : 0)
		const inHand = { ...x, cards: { ...x.cards, R: { ...x.cards!.R, hand: [...x.cards!.R.hand.filter((i) => i !== crowd), crowd] } } } as MatchState
		expect(crowdBonus(inHand, 'R', 'R')).toBe(2)
		expect(crowdBonus(inHand, 'R', 'R~2')).toBe(0)
		const out = { ...x, cards: { ...x.cards, R: { ...x.cards!.R, hand: x.cards!.R.hand.filter((i) => i !== crowd) } } } as MatchState
		expect(crowdBonus(out, 'R', 'R')).toBe(0)
		// discarded as THIS attack's defence: the reminder stays on (Defended +2)
		const used = { ...out, attacks: { R: { by: 'B', defending: true, at: 1, discarded: true } }, cards: { ...out.cards, R: { ...out.cards!.R, discard: [...out.cards!.R.discard, crowd] } } } as MatchState
		expect(crowdBonus(used, 'R', 'R')).toBe(2)
		// on the board (public): her others in radius of the body attacked; lit once the silver is this attack's discard
		expect(crowdField(x, 'R', 'R').ids).toEqual(['R~1']) // R~2 is far away
		expect(crowdField(x, 'R', 'R').played).toBe(false)
		expect(crowdField(used, 'R', 'R').played).toBe(true)
		// as a skill: her silver acting → Remove doubles
		const sk = actingAs({ ...x, cards: { ...x.cards, R: { ...x.cards!.R, pending: crowd, hand: x.cards!.R.hand.filter((i) => i !== crowd) } } } as MatchState, 'R')
		expect(rzPower(sk, 'R', tc(sk))).toBe('clear')
		const cl = go(sk, pw(sk, 'R', 'rzClear'))
		expect(bodiesOf(cl, 'R').map((p) => p.id)).toEqual(['R'])
	})
	it('her reds offer the Remove pills only after their attack: Phantom Strike / Hit and Gone some of her, Into Thin Air all of her', () => {
		const into = named('Into Thin Air'), hit = named('Hit and Gone')
		const two = (x: MatchState) => ({ ...x, pieces: { ...x.pieces, 'R~1': { ...x.pieces.R, id: 'R~1', hex: '5_6', face: 1, owner: 'R' } } }) as MatchState
		for (const [card, want] of [[phantom, 'some'], [hit, 'some'], [into, 'all']] as const) {
			const s = two(actingAs(rg(card), 'R'))
			expect(rzRemoves(s, 'R', tc(s))).toBe(null) // before the attack
			const x = two(afterAttack(actingAs(rg(card), 'R')))
			expect(rzRemoves(x, 'R', tc(x))).toBe(want)
		}
		// one body: Phantom Strike has nothing to take, Into Thin Air still takes her off (not a defeat)
		const one = afterAttack(actingAs(rg(phantom), 'R'))
		expect(rzRemoves(one, 'R', tc(one))).toBe(null)
		const oneAll = afterAttack(actingAs(rg(into), 'R'))
		expect(rzRemoves(oneAll, 'R', tc(oneAll))).toBe('all')
		// any other card of hers: nothing
		const g = two(afterAttack(actingAs(rg(gold), 'R')))
		expect(rzRemoves(g, 'R', tc(g))).toBe(null)
	})
	it('a seat handed to a new id takes her doubles along (they follow their owner)', () => {
		let x = afterAttack(actingAs(rg(gold), 'R'))
		x = go(x, pw(x, 'R', 'rzSpawn', { hex: '5_6', face: 2 }))
		const t = go(x, transferSeat(x, 'R', 'R2', 'Zara', 0))
		expect(bodiesOf(t, 'R2').map((p) => p.id)).toEqual(['R2', 'R~1'])
		expect(heroPidOf(t.pieces['R~1'])).toBe('R2')
		expect(isDouble(t.pieces.R2)).toBe(false)
	})
	it('Rummage: after the attack, one discarded card back if another one of her is in radius; Ransack: one per other in radius', () => {
		const disc = { discard: [1, 3, 4] }
		let x = afterAttack(actingAs(rg(rummage, {}, disc), 'R'))
		expect(rzPower(x, 'R', tc(x))).toBe(null) // nobody else of her near
		x = { ...x, pieces: { ...x.pieces, 'R~1': { ...x.pieces.R, id: 'R~1', hex: '5_6', face: 1, owner: 'R' }, 'R~2': { ...x.pieces.R, id: 'R~2', hex: '4_5', face: 2, owner: 'R' } } } as MatchState
		expect(rzLeft(x, 'R', tc(x))).toBe(1)
		const r1 = go(x, pw(x, 'R', 'rzRetrieve', { idx: 3 }))
		expect(r1.cards!.R.hand).toContain(3)
		expect(r1.cards!.R.discard).not.toContain(3)
		expect(pw(r1, 'R', 'rzRetrieve', { idx: 4 })).toEqual({})
		let y = afterAttack(actingAs(rg(ransack, {}, disc), 'R'))
		y = { ...y, pieces: x.pieces } as MatchState
		expect(rzLeft(y, 'R', tc(y))).toBe(2)
	})
	it('distances to her count from her nearest body', () => {
		const x = { ...rg(gold), pieces: { ...rg(gold).pieces, 'R~1': { id: 'R~1', hex: '9_8', team: 'orange', kind: 'hero', hero: 'razzle', owner: 'R', face: 1 } } } as MatchState
		expect(pieceDist(x, 'M', 'R')).toBe(1)
	})
})

describe("Emmitt's ultimate (Alternative Timelines): two cards face down, both revealed, he keeps one before anyone acts", () => {
	const EC = heroCards('emmitt'), AC = heroCards('arien')
	const hand = newPlayerCardState('emmitt').hand
	const [c1, c2] = hand
	function g(ult = true, revealAt: number | null = null): MatchState {
		const e = { ...newPlayerCardState('emmitt'), ultimate: ult, hand: hand.filter((i) => i !== c1), pending: c1 }
		const b = { ...newPlayerCardState('arien'), pending: 0 }
		return {
			round: 1, turn: 2, seats: 2, life: { orange: 6, blue: 6 }, tieBreaker: 'orange', revealAt, host: 'H',
			pieces: { E: { id: 'E', hex: '1_1', team: 'orange', kind: 'hero', hero: 'emmitt' }, B: { id: 'B', hex: '5_5', team: 'blue', kind: 'hero', hero: 'arien' } },
			cards: { E: e, B: b }
		} as unknown as MatchState
	}
	const pw = (s: MatchState, pid: string, op: string, more: Record<string, unknown> = {}) => applyCardReq(s, { kind: 'power', pid, op, ...more } as never)
	const go = (s: MatchState, p: Partial<MatchState>) => ({ ...s, ...p }) as MatchState
	it('the second card goes face down only with the ultimate, after the first, before the reveal', () => {
		expect(pw(g(false), 'E', 'emCommit2', { idx: c2 })).toEqual({})
		expect(pw(g(true, 0), 'E', 'emCommit2', { idx: c2 })).toEqual({}) // already revealed
		const s = go(g(), pw(g(), 'E', 'emCommit2', { idx: c2 }))
		expect(s.cards!.E.pending2).toBe(c2)
		expect(s.cards!.E.hand).not.toContain(c2)
		expect(pw(s, 'E', 'emCommit2', { idx: hand[2] })).toEqual({}) // only one more
		// taking the second back, or the first (both go back), before the reveal
		expect(go(s, pw(s, 'E', 'emUncommit2')).cards!.E.hand).toContain(c2)
		const un = go(s, applyCardReq(s, { kind: 'uncommit', pid: 'E' } as never))
		expect(un.cards!.E.pending).toBe(null)
		expect(un.cards!.E.pending2 ?? null).toBe(null)
		expect(un.cards!.E.hand).toEqual(expect.arrayContaining([c1, c2]))
	})
	it("the reveal waits for his second card — or his 'just one'", () => {
		const s = g()
		const c = { key: turnKey(s), revealed: false } as TurnCtx
		expect(wantsSecond(s, 'E', c)).toBe(true)
		const one = go(s, pw(s, 'E', 'emOne'))
		expect(wantsSecond(one, 'E', c)).toBe(false)
		const two = go(s, pw(s, 'E', 'emCommit2', { idx: c2 }))
		expect(wantsSecond(two, 'E', c)).toBe(false)
		expect(wantsSecond(g(false), 'E', c)).toBe(false) // no ultimate: never asked
	})
	it('revealed: nobody acts until he keeps one; the other goes back to his hand', () => {
		const s0 = go(g(), pw(g(), 'E', 'emCommit2', { idx: c2 }))
		const s = { ...s0, revealAt: 0 } as MatchState
		expect(actorOf(s)).toBe(null)
		expect(applyCardReq(s, { kind: 'endAct', pid: 'H' } as never)).toEqual({})
		expect(pw(s, 'B', 'emKeep', { which: 1 })).toEqual({}) // not B's
		const k = go(s, pw(s, 'E', 'emKeep', { which: 2 }))
		expect(k.cards!.E.pending).toBe(c2)
		expect(k.cards!.E.pending2 ?? null).toBe(null)
		expect(k.cards!.E.hand).toContain(c1)
		expect(actorOf(k)).not.toBe(null)
		// the host may choose for someone away
		expect(go(s, pw(s, 'H', 'emKeep', { which: 1, target: 'E' })).cards!.E.pending).toBe(c1)
	})
	it('no card is ever lost: the round end, the turn lock and the repair all know the second card', () => {
		const s = go(g(), pw(g(), 'E', 'emCommit2', { idx: c2 })).cards!.E
		const all = (x: typeof s) => [...x.hand, ...x.turns.filter((i) => i != null), ...(x.pending != null && x.pending >= 0 ? [x.pending] : []), ...(x.pending2 != null ? [x.pending2] : []), ...x.discard] as number[]
		expect(all(repairCards(s)).sort()).toEqual(all(s).sort())
		const locked = revealTurn(s, 1)
		expect(locked.turns[1]).toBe(c1)
		expect(locked.hand).toContain(c2)
		expect(endRound(s).hand).toEqual(expect.arrayContaining([c1, c2]))
	})
	void EC; void AC
})
