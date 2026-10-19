import { describe, it, expect } from 'vitest'
import { applyCardReq, turnOrder, turnKey, actingIdx, type MatchState } from './match'
import { newPlayerCardState, type PlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { hasPower, takaHit, type TurnCtx } from './heropower'
import { FOUR_STAR_LAB, isLabHero } from './heroes'
import { BOOK, inBook, bookSpells, castOptions, gyMode, canPrepare, canWish, spellNums, othersGone, forceTargets, raiseSpots, canStrike, canDrink, guardNow, gyOf, castNow } from './gydion'
import { zoneTable } from './zones'
import map from './maps/forgotten_island.json'

const GC = heroCards('gydion'), AC = heroCards('arien')
const named = (n: string) => GC.findIndex((c) => c.name === n)
const SILVER = named('Prepare Spells'), CANTRIP = named('Cantrip'), CHEAP = named('Cheap Trick')
const EVO1 = named('Elementary Evocation'), ABJ1 = named('Elementary Abjuration'), LEVO = named('Lesser Evocation'), GEVO = named('Greater Evocation')
const LNEC = named('Lesser Necromancy'), GNEC = named('Greater Necromancy'), LTRA = named('Lesser Transmutation'), LCON = named('Lesser Conjuration'), GCON = named('Greater Conjuration')
const lowA = AC.reduce((a, _, i) => (!AC[i].handicapped && AC[i].color !== 'PURPLE' && (AC[i].initiative ?? 99) < (AC[a].initiative ?? 99) ? i : a), 0)

// a Center spawn point of the Atlanteans on the real map, and a space two away from it for Gydion
const cells = (map as { cells: Record<string, string> }).cells
const zones = zoneTable(map as never)
const SPAWN = Object.keys(cells).filter((h) => cells[h] === 'spawnOrange' && zones[h] === 'Center').sort()[0]

// G = Gydion (orange) · M his teammate · B / C enemies (blue) · H the host (no hero). Turn 2 of round 1, revealed.
function gg(gPending: number, gMore: Partial<PlayerCardState> = {}, extra: Partial<MatchState> = {}): MatchState {
	const g = { ...newPlayerCardState('gydion'), pending: gPending, ...gMore }
	const b = { ...newPlayerCardState('arien'), pending: lowA }
	return {
		round: 1, turn: 2, seats: 4, life: { orange: 4, blue: 6 }, lifeTok: { orange: [true, true, true, true, false, false], blue: [true, true, true, true, true, true] },
		tieBreaker: 'orange', revealAt: 0, host: 'H', map, lane: 1,
		pieces: { G: { id: 'G', hex: '9_9', team: 'orange', kind: 'hero', hero: 'gydion' }, M: { id: 'M', hex: '2_2', team: 'orange', kind: 'hero', hero: 'arien' },
			B: { id: 'B', hex: '10_9', team: 'blue', kind: 'hero', hero: 'arien' }, C: { id: 'C', hex: '16_16', team: 'blue', kind: 'hero', hero: 'arien' } },
		cards: { G: g, B: b, C: { ...b }, M: { ...b } }, ...extra
	} as unknown as MatchState
}
const actingAs = (s: MatchState, pid: string) => ({ ...s, acting: { key: turnKey(s), idx: turnOrder(s).indexOf(pid) } }) as MatchState
const tc = (s: MatchState): TurnCtx => ({ key: turnKey(s), round: s.round, turnIdx: s.turn - 1, order: turnOrder(s), at: actingIdx(s), tieBreaker: s.tieBreaker, revealed: true, teams: { G: 'orange', M: 'orange', B: 'blue', C: 'blue' } })
const pw = (s: MatchState, pid: string, op: string, more: Record<string, unknown> = {}) => applyCardReq(s, { kind: 'power', pid, op, ...more } as never)
const go = (s: MatchState, p: Partial<MatchState>) => ({ ...s, ...p }) as MatchState
/** Gydion's book prepared earlier (some spells already gone) */
const book = (gone: string[] = [], more: Record<string, unknown> = {}) => ({ power: { G: { gy: { prep: true, gone, ...more } } } }) as Partial<MatchState>

describe('Gydion: the spellbook', () => {
	it('is a lab hero with a power', () => {
		expect(hasPower('gydion')).toBe(true)
		expect(FOUR_STAR_LAB).toContain('gydion')
		expect(isLabHero('gydion')).toBe(true)
		expect(BOOK).toHaveLength(21)
		expect(SPAWN).toBeTruthy()
	})
	it('starts EMPTY: nothing to cast until Prepare Spells', () => {
		const s = actingAs(gg(GEVO), 'G')
		expect(bookSpells(s, 'G')).toEqual([])
		expect(castOptions(s, 'G', tc(s))).toEqual([])
		expect(gyMode(s, 'G', tc(s))).toBe(null)
		expect(pw(s, 'G', 'gyCast', { spell: 'fireball' })).toEqual({})
	})
	it('Prepare Spells (his silver, on his own acting turn) fills the book, once per card', () => {
		const s = actingAs(gg(SILVER), 'G')
		expect(gyMode(s, 'G', tc(s))).toBe('prepare')
		// not on someone else's turn
		const notMe = actingAs(gg(SILVER), 'B')
		expect(pw(notMe, 'G', 'gyPrepare')).toEqual({})
		const x = go(s, pw(s, 'G', 'gyPrepare'))
		expect(bookSpells(x, 'G')).toHaveLength(21)
		expect(canPrepare(x, 'G', tc(x))).toBe(false)
		expect(pw(x, 'G', 'gyPrepare')).toEqual({})
		expect(x.log?.at(-1)?.text ?? '').toBe('') // the log is the session's job, not the engine's
	})
	it('a casting card casts only the spells it names, still in the book, once', () => {
		const s = actingAs(gg(LEVO, {}, book(['burning-hands'])), 'G')
		expect(castOptions(s, 'G', tc(s))).toEqual(['fireball'])
		expect(pw(s, 'G', 'gyCast', { spell: 'burning-hands' })).toEqual({}) // gone
		expect(pw(s, 'G', 'gyCast', { spell: 'shield' })).toEqual({}) // not on this card
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'fireball' }))
		expect(inBook(x, 'G', 'fireball')).toBe(false)
		expect(gyOf(x, 'G').gone).toEqual(['burning-hands', 'fireball'])
		expect(castNow(x, 'G', tc(x))).toBe('fireball')
		expect(castOptions(x, 'G', tc(x))).toEqual([]) // once per card
		expect(pw(x, 'G', 'gyCast', { spell: 'fireball' })).toEqual({})
		expect(x.gyNews?.spell).toBe('fireball')
	})
	it('every casting card names real spells; Cheap Trick casts Expeditious Retreat; an empty pick does nothing', () => {
		const s = actingAs(gg(CHEAP, {}, book()), 'G')
		expect(castOptions(s, 'G', tc(s))).toEqual(['expeditious-retreat'])
		const c = actingAs(gg(CANTRIP, {}, book()), 'G')
		expect(castOptions(c, 'G', tc(c)).sort()).toEqual(['expeditious-retreat', 'magic-missile', 'shocking-grasp'])
		const empty = actingAs(gg(EVO1, {}, book(['burning-hands'])), 'G')
		expect(castOptions(empty, 'G', tc(empty))).toEqual([])
		expect(gyMode(empty, 'G', tc(empty))).toBe(null)
	})
	it('nothing before the reveal, nor on another acting card of his', () => {
		const s = gg(GEVO, {}, { ...book(), revealAt: Date.now() + 60000 })
		expect(castOptions(actingAs(s, 'G'), 'G', { ...tc(actingAs(s, 'G')), revealed: false })).toEqual([])
		expect(pw(actingAs(s, 'G'), 'G', 'gyCast', { spell: 'fireball' })).toEqual({})
	})
})

describe('Gydion: numbers and scaling', () => {
	it('Sunburst: +1 attack and +1 range per OTHER spell gone; items add on', () => {
		const s = actingAs(gg(GEVO, { items: { atk: 1, range: 2 } }, book(['burning-hands', 'shield', 'suggestion'])), 'G')
		expect(spellNums(s, 'G', 'sunburst')).toEqual({ attack: 3 + 1, range: 3 + 2 })
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'sunburst' }))
		// once cast it's gone itself, but only OTHER spells count
		expect(othersGone(x, 'G', 'sunburst')).toBe(3)
		expect(spellNums(x, 'G', 'sunburst')).toEqual({ attack: 4, range: 5 })
		expect(spellNums(s, 'G', 'fireball')).toEqual({ attack: 5 + 1, range: 3 + 2 })
	})
	it('Dimension Door: radius = gone spells + Area items', () => {
		const s = actingAs(gg(LCON, { items: { radius: 1 } }, book(['shield', 'fireball'])), 'G')
		expect(spellNums(s, 'G', 'dimension-door').radius).toBe(0 + 1 + 2)
	})
	it("Midas' Touch pays a coin for every two OTHER spells gone", () => {
		const s = actingAs(gg(LTRA, { coins: 1 }, book(['shield', 'fireball', 'sunburst', 'suggestion', 'banishment'])), 'G')
		expect(spellNums(s, 'G', 'midas-touch').coins).toBe(2)
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'midas-touch' }))
		expect(x.cards!.G.coins).toBe(3)
		// with nothing gone, no coins (and no cards patch)
		const y = actingAs(gg(LTRA, { coins: 1 }, book()), 'G')
		expect(pw(y, 'G', 'gyCast', { spell: 'midas-touch' }).cards).toBeUndefined()
	})
})

describe('Gydion: the follow-ups', () => {
	it('Energy Drain: his team regains a spent Life counter (never past the full row) and an enemy in range discards a non-basic card', () => {
		const s = actingAs(gg(GNEC, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'energy-drain' }))
		expect(x.life.orange).toBe(5)
		expect(x.lifeTok.orange).toEqual([true, true, true, true, true, false])
		// B is next to him, C far away
		expect(forceTargets(x, 'G', tc(x))).toEqual(['B'])
		expect(pw(x, 'G', 'gyForce', { target: 'C' })).toEqual({})
		const y = go(x, pw(x, 'G', 'gyForce', { target: 'B' }))
		expect(y.forced?.B).toMatchObject({ by: 'G', die: false, only: 'nonbasic' })
		expect(forceTargets(y, 'G', tc(y))).toEqual([]) // once
		// a full Life row stays full
		const full = actingAs(gg(GNEC, {}, { ...book(), life: { orange: 6, blue: 6 }, lifeTok: { orange: Array(6).fill(true), blue: Array(6).fill(true) } }), 'G')
		const f = pw(full, 'G', 'gyCast', { spell: 'energy-drain' })
		expect(f.life).toBeUndefined()
	})
	it('Cloud Kill: a basic card, radius 3 + Area items', () => {
		const s = actingAs(gg(GCON, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'cloud-kill' }))
		const y = go(x, pw(x, 'G', 'gyForce', { target: 'B' }))
		expect(y.forced?.B?.only).toBe('basic')
		// a forced discard of any card clears it, as always
		const card = y.cards!.B.hand[0]
		const z = go(y, applyCardReq(y, { kind: 'defend', pid: 'B', idx: card }))
		expect(z.forced?.B).toBeUndefined()
	})
	it('Burning Hands: any enemy hero (adjacent to the target is his call), any card', () => {
		const s = actingAs(gg(EVO1, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'burning-hands' }))
		expect(forceTargets(x, 'G', tc(x)).sort()).toEqual(['B', 'C'])
		expect(go(x, pw(x, 'G', 'gyForce', { target: 'C' })).forced?.C?.only).toBeUndefined()
	})
	it('no forced discard from a spell that has none, or before casting', () => {
		const s = actingAs(gg(LEVO, {}, book()), 'G')
		expect(pw(s, 'G', 'gyForce', { target: 'B' })).toEqual({})
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'fireball' }))
		expect(pw(x, 'G', 'gyForce', { target: 'B' })).toEqual({})
	})
	it('Create Undead: a minion on an empty friendly spawn point of the battle zone in range; once', () => {
		// Gydion two spaces from the Center spawn point
		const s0 = actingAs(gg(LNEC, {}, book()), 'G')
		const near = Object.keys(cells).find((h) => h !== SPAWN && cells[h] !== 'terrain' && Math.abs(Number(h.split('_')[0]) - Number(SPAWN.split('_')[0])) + Math.abs(Number(h.split('_')[1]) - Number(SPAWN.split('_')[1])) === 2)!
		const s = go(s0, { pieces: { ...s0.pieces, G: { ...s0.pieces.G, hex: near } } })
		expect(raiseSpots(s, 'G', tc(s))).toEqual([]) // nothing cast yet
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'create-undead' }))
		const spots = raiseSpots(x, 'G', tc(x))
		expect(spots).toContain(SPAWN)
		// never an enemy spawn point, never outside the battle zone
		for (const h of spots) { expect(cells[h]).toBe('spawnOrange'); expect(zones[h]).toBe('Center') }
		const y = go(x, pw(x, 'G', 'gyRaise', { hex: SPAWN }))
		const fresh = Object.values(y.pieces).find((p) => p.kind === 'minion' && p.hex === SPAWN)
		expect(fresh).toMatchObject({ team: 'orange', kind: 'minion' })
		expect(raiseSpots(y, 'G', tc(y))).toEqual([])
		expect(pw(y, 'G', 'gyRaise', { hex: spots.find((h) => h !== SPAWN) ?? SPAWN })).toEqual({})
		// an occupied spawn point is not offered
		const occ = go(x, { pieces: { ...x.pieces, X: { id: 'X', hex: SPAWN, kind: 'minion', team: 'orange', role: 'melee' } } as MatchState['pieces'] })
		expect(raiseSpots(occ, 'G', tc(occ))).not.toContain(SPAWN)
	})
	it('Find Familiar strikes up to three OTHER spells (never Wish), once', () => {
		const s = actingAs(gg(LCON, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'find-familiar' }))
		expect(canStrike(x, 'G', tc(x))).toBe(true)
		expect(pw(x, 'G', 'gyStrike', { spells: ['fireball', 'shield', 'sunburst', 'polymorph'] })).toEqual({})
		expect(pw(x, 'G', 'gyStrike', { spells: ['wish'] })).toEqual({})
		expect(pw(x, 'G', 'gyStrike', { spells: ['find-familiar'] })).toEqual({}) // already gone
		const y = go(x, pw(x, 'G', 'gyStrike', { spells: ['fireball', 'shield', 'sunburst'] }))
		expect(gyOf(y, 'G').struck).toEqual(['fireball', 'shield', 'sunburst'])
		expect(gyOf(y, 'G').gone).toEqual(['find-familiar', 'fireball', 'shield', 'sunburst'])
		expect(canStrike(y, 'G', tc(y))).toBe(false)
		// striking none is allowed and closes it too
		const z = go(x, pw(x, 'G', 'gyStrike', { spells: [] }))
		expect(canStrike(z, 'G', tc(z))).toBe(false)
	})
	it('Vampiric Touch: one discard back, only after its attack ended', () => {
		const s = actingAs(gg(LNEC, { discard: [CANTRIP], hand: newPlayerCardState('gydion').hand.filter((i) => i !== CANTRIP) }, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'vampiric-touch' }))
		expect(canDrink(x, 'G', tc(x))).toBe(false)
		expect(pw(x, 'G', 'gyDrink', { idx: CANTRIP })).toEqual({})
		// he attacks B, the host says Defended → the attack is over: the hit mark opens the retrieve
		const a = go(x, applyCardReq(x, { kind: 'attack', pid: 'G', target: 'B' }))
		const d = go(a, applyCardReq(a, { kind: 'attackResolve', pid: 'H', target: 'B', result: 'defended' } as never))
		expect(canDrink(d, 'G', tc(d))).toBe(true)
		const y = go(d, pw(d, 'G', 'gyDrink', { idx: CANTRIP }))
		expect(y.cards!.G.hand).toContain(CANTRIP)
		expect(y.cards!.G.discard).not.toContain(CANTRIP)
		expect(canDrink(y, 'G', tc(y))).toBe(false)
	})
	it("the 'hit' mark is only for attack spells", () => {
		const s = actingAs(gg(LNEC, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'create-undead' }))
		const a = go(x, applyCardReq(x, { kind: 'attack', pid: 'G', target: 'B' }))
		const d = { ...a, ...applyCardReq(a, { kind: 'attackResolve', pid: 'H', target: 'B', result: 'defended' } as never) } as MatchState
		expect(takaHit(a, d, { kind: 'attackResolve', pid: 'H' }, tc(a))).toBe(null)
	})
	it('Shield / Invulnerability last the round; Prepare Spells ends Shield (it returns to the book)', () => {
		const s = actingAs(gg(ABJ1, {}, book()), 'G')
		const x = go(s, pw(s, 'G', 'gyCast', { spell: 'shield' }))
		expect(guardNow(x, 'G', 1)).toEqual(['shield'])
		expect(guardNow(x, 'G', 2)).toEqual([])
		// later this round his silver acts
		const later = actingAs(go(x, { turn: 3, cards: { ...x.cards, G: { ...x.cards!.G, pending: SILVER } } }), 'G')
		const y = go(later, pw(later, 'G', 'gyPrepare'))
		expect(guardNow(y, 'G', 1)).toEqual([])
		expect(inBook(y, 'G', 'shield')).toBe(true)
	})
})

describe('Gydion: The Archwizard — Wish', () => {
	it('Wish is in the book only with the ultimate; his silver may cast it INSTEAD of preparing', () => {
		const noUlt = actingAs(gg(SILVER, {}, book(['fireball'])), 'G')
		expect(inBook(noUlt, 'G', 'wish')).toBe(false)
		expect(canWish(noUlt, 'G', tc(noUlt))).toBe(false)
		expect(pw(noUlt, 'G', 'gyWish')).toEqual({})
		const s = actingAs(gg(SILVER, { ultimate: true }, book(['fireball'])), 'G')
		expect(canWish(s, 'G', tc(s))).toBe(true)
		const x = go(s, pw(s, 'G', 'gyWish'))
		expect(gyOf(x, 'G').wish).toBe(1)
		expect(inBook(x, 'G', 'wish')).toBe(false) // Wish leaves the book
		expect(inBook(x, 'G', 'fireball')).toBe(false) // …and the book was NOT refilled
		expect(canPrepare(x, 'G', tc(x))).toBe(false) // the silver is used
		// a Wish opens one cast of any spell still in the book
		expect(castOptions(x, 'G', tc(x))).toHaveLength(20)
		expect(castOptions(x, 'G', tc(x))).not.toContain('fireball')
		const y = go(x, pw(x, 'G', 'gyCast', { spell: 'polymorph' }))
		expect(gyOf(y, 'G').cast).toMatchObject({ spell: 'polymorph', wish: true })
		expect(castOptions(y, 'G', tc(y))).toEqual([])
	})
	it('only an ordinary Prepare brings Wish back: Wish · Prepare · Wish · Prepare · Wish wins', () => {
		let s = actingAs(gg(SILVER, { ultimate: true }, book()), 'G')
		const silverTurn = (x: MatchState, round: number) => actingAs({ ...x, round, turn: 2 } as MatchState, 'G')
		const steps: string[] = []
		for (let r = 1; r <= 5; r++) {
			s = silverTurn(s, r)
			if (canWish(s, 'G', tc(s))) { s = go(s, pw(s, 'G', 'gyWish')); steps.push('wish') }
			else { expect(canPrepare(s, 'G', tc(s))).toBe(true); s = go(s, pw(s, 'G', 'gyPrepare')); steps.push('prepare') }
			if (s.wonBy) break
		}
		expect(steps).toEqual(['wish', 'prepare', 'wish', 'prepare', 'wish'])
		expect(s.wonBy).toEqual({ team: 'orange', reason: 'Gydion cast Wish three times' })
	})
})

describe('Gydion: the host fix, and nothing for other heroes', () => {
	it('the host puts a spell back / takes one out / sets the Wish count; nobody else can', () => {
		const s = actingAs(gg(GEVO, {}, book(['fireball'])), 'G')
		expect(pw(s, 'B', 'gyFix', { target: 'G', spell: 'fireball', on: true })).toEqual({})
		const x = go(s, pw(s, 'H', 'gyFix', { target: 'G', spell: 'fireball', on: true }))
		expect(inBook(x, 'G', 'fireball')).toBe(true)
		const y = go(x, pw(x, 'H', 'gyFix', { target: 'G', spell: 'sunburst', on: false }))
		expect(inBook(y, 'G', 'sunburst')).toBe(false)
		const z = go(y, pw(y, 'H', 'gyFix', { target: 'G', wish: 5 }))
		expect(gyOf(z, 'G').wish).toBe(2) // never a win by hand
	})
	it("another hero's gy requests are refused", () => {
		const s = actingAs(gg(GEVO, {}, book()), 'B')
		expect(pw(s, 'B', 'gyPrepare')).toEqual({})
		expect(pw(s, 'B', 'gyCast', { spell: 'fireball' })).toEqual({})
	})
	it('casting never touches his cards (only Midas / Vampiric Touch do, as asked)', () => {
		const s = actingAs(gg(GEVO, {}, book()), 'G')
		for (const sp of ['burning-hands', 'fireball', 'sunburst']) expect(pw(s, 'G', 'gyCast', { spell: sp }).cards).toBeUndefined()
	})
})
