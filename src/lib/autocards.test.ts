import { describe, it, expect } from 'vitest'
import { applyCardReq, minionDefense, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'
import { hexNeighbour, hexNeighbours } from './board/hexgeo'
import { autoOn, behindRule, spacesBehind, heroesOn, leapSpaces, spawnPoints, swapMinions, auraRadius, immuneNow, AUTO_LIVE, saveCards, hexDist } from './autocards'

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

// ── Brogan ──
import { battleResult, zoneMinions, inZone } from './battle'
import { placeMinions } from './match'
import { saverFor, discardOffer, giftOffer } from './autocards'
import forgotten from './maps/forgotten_island.json'
import type { GameMap } from './maps'

describe('Brogan', () => {
	const M = forgotten as unknown as GameMap
	const cells = M.cells as Record<string, string>
	// a real board: Brogan (O, orange) stands in the Center among his minions; Wasp (W, blue) next to him
	function field(lab = true): MatchState {
		const s = { round: 1, turn: 2, seats: 2, host: 'H', labRules: lab, map: M, waves: 5, waveTok: Array(5).fill(true), lastPush: null, revealAt: 1,
			life: { orange: 6, blue: 6 }, pieces: {}, cards: { O: newPlayerCardState('brogan'), W: newPlayerCardState('wasp'), T: newPlayerCardState('sabina') } } as unknown as MatchState
		const pieces = placeMinions(s)
		const mine = zoneMinions({ ...s, pieces }, 'orange')
		const taken = (h: string) => Object.values(pieces).some((p) => p.hex === h)
		// a free space in the zone next to one of his light minions, with room beside it for Wasp
		const free = Object.keys(cells).find((h) => inZone(s, h) && cells[h] !== 'terrain' && !taken(h) && hexNeighbours(h).some((n) => mine.some((q) => q.hex === n && q.role !== 'heavy')) && hexNeighbours(h).some((n) => cells[n] && cells[n] !== 'terrain' && !taken(n)))!
		const wHex = hexNeighbours(free).find((n) => cells[n] && cells[n] !== 'terrain' && !taken(n))!
		return { ...s, pieces: { ...pieces, O: hero('O', 'orange', free, 'brogan'), W: hero('W', 'blue', wHex, 'wasp'), T: hero('T', 'orange', mine[0].hex === free ? '0_0' : hexNeighbour(wHex, 0), 'sabina') }, _mine: mine } as unknown as MatchState
	}
	it('One Man Army: with his ultimate he counts as a heavy minion in the battle — never removed', () => {
		let s = field()
		const blue = zoneMinions(s, 'blue')
		const p = { ...s.pieces }
		delete p[blue[0].id] // 6 v 5
		s = { ...s, pieces: p } as MatchState
		expect(battleResult(s)).toMatchObject({ orange: 6, blue: 5, loser: 'blue', remove: 1 })
		const ult = { ...s, cards: { ...s.cards, O: { ...s.cards!.O, ultimate: true } } } as MatchState
		expect(battleResult(ult)).toMatchObject({ orange: 7, blue: 5, loser: 'blue', remove: 2 })
		// orange down to 1 minion + Brogan vs 5: they lose 1 — the minion; then the zone is empty and the Titans push
		const few = { ...ult, pieces: Object.fromEntries(Object.entries(ult.pieces).filter(([, q]) => q.team !== 'orange' || q.kind !== 'minion' || q.id === zoneMinions(ult, 'orange')[0].id)) } as MatchState
		expect(battleResult(few)).toMatchObject({ orange: 2, blue: 5, loser: 'orange', remove: 1 })
		expect(battleResult({ ...ult, labRules: false } as MatchState)).toMatchObject({ orange: 6 }) // not without Lab rules
	})
	it('Shield: a friendly minion defeated in his radius waits; discarding the silver keeps it, × lets it fall', () => {
		const s0 = field()
		const shield = idx('brogan', 'Shield'), silver = heroCards('brogan').findIndex((c) => c.color === 'SILVER')
		const m = zoneMinions(s0, 'orange').filter((q) => q.role !== 'heavy').sort((a, b) => hexDist(a.hex, s0.pieces.O.hex) - hexDist(b.hex, s0.pieces.O.hex))[0]
		const s = { ...s0, effects: [{ id: 'e', pid: 'O', hero: 'brogan', idx: shield, name: 'Shield', dur: 'round', round: 1, turn: 2 }] } as unknown as MatchState
		expect(saverFor(s, m.id)).toMatchObject({ pid: 'O', kind: 'silver' })
		const a = { ...s, ...applyCardReq(s, { kind: 'defeatMinion', pid: 'W', piece: m.id }) } as MatchState
		expect(a.saving?.piece.id).toBe(m.id)
		expect(a.pieces[m.id]).toBeTruthy() // still there
		expect(a.cards!.W.coins).toBe(s.cards!.W.coins + 2) // the defeater is paid at once
		expect(applyCardReq(a, { kind: 'save', pid: 'W', idx: silver })).toEqual({}) // not his to save
		const kept = { ...a, ...applyCardReq(a, { kind: 'save', pid: 'O', idx: silver }) } as MatchState
		expect(kept.saving).toBeNull()
		expect(kept.pieces[m.id]).toBeTruthy()
		expect(kept.cards!.O.discard).toContain(silver)
		const fell = { ...a, ...applyCardReq(a, { kind: 'save', pid: 'O' }) } as MatchState
		expect(fell.pieces[m.id]).toBeUndefined()
		expect(fell.cards!.W.coins).toBe(s.cards!.W.coins + 2) // paid once
		// no answer before the turn moves on: it falls
		const adv = { ...a, ...applyCardReq(a, { kind: 'advance', pid: 'H' }) } as MatchState
		expect(adv.pieces[m.id]).toBeUndefined()
		expect(adv.saving).toBeNull()
		// no silver in hand / outside his radius / no effect / no Lab rules: it falls at once
		expect(saverFor({ ...s, cards: { ...s.cards, O: { ...s.cards!.O, hand: s.cards!.O.hand.filter((i) => i !== silver) } } } as MatchState, m.id)).toBeNull()
		expect(saverFor(s0, m.id)).toBeNull()
		expect(saverFor({ ...s, labRules: false } as MatchState, m.id)).toBeNull()
		const far = zoneMinions(s0, 'orange').find((q) => hexDist(q.hex, s0.pieces.O.hex) > 2)
		if (far) expect(saverFor(s, far.id)).toBeNull()
	})
	it('Fortify takes a basic card: the silver first, else the gold', () => {
		const cs = newPlayerCardState('brogan')
		const silver = heroCards('brogan').findIndex((c) => c.color === 'SILVER'), gold = heroCards('brogan').findIndex((c) => c.color === 'GOLD')
		expect(saveCards(cs, 'basic')).toEqual([silver, gold])
		expect(saveCards(cs, 'silver')).toEqual([silver])
	})
	it('Shield Bash / Counterattack: the adjacent enemies who played an attack card this turn', () => {
		const s = field()
		const atk = heroCards('wasp').findIndex((c) => c.primaryAction === 'ATTACK'), skill = heroCards('wasp').findIndex((c) => c.primaryAction === 'SKILL')
		const w = (i: number) => ({ ...s, cards: { ...s.cards, W: { ...s.cards!.W, pending: i } } }) as MatchState
		expect(discardOffer(w(atk), 'O', card('brogan', 'Shield Bash'))).toEqual({ targets: ['W'], die: false, card: 'Shield Bash' })
		expect(discardOffer(w(atk), 'O', card('brogan', 'Counterattack'))?.die).toBe(true)
		expect(discardOffer(w(skill), 'O', card('brogan', 'Shield Bash'))?.targets).toEqual([])
		expect(discardOffer(w(atk), 'O', card('brogan', 'Onslaught'))).toBeNull()
	})
	it('War Drummer / Master Skald: 1 / 2 coins to a friendly hero in range, 3 / 4 once a hero fell this round', () => {
		const s = field()
		const g = giftOffer(s, 'O', card('brogan', 'War Drummer'))!
		expect(g.amount).toBe(1)
		expect(g.targets).toContain('O') // himself too
		expect(g.targets).not.toContain('W') // never an enemy
		expect(giftOffer({ ...s, fallen: { round: 1, n: 1 } } as MatchState, 'O', card('brogan', 'War Drummer'))!.amount).toBe(3)
		expect(giftOffer({ ...s, fallen: { round: 0, n: 2 } } as MatchState, 'O', card('brogan', 'Master Skald'))!.amount).toBe(2) // last round's don't count
		// the request: once per acting card, only while that card acts
		const act = { ...s, cards: { ...s.cards, O: { ...s.cards!.O, pending: idx('brogan', 'War Drummer') } }, acting: { key: '1-2', idx: 0, pin: ['O'] } } as unknown as MatchState
		const a = { ...act, ...applyCardReq(act, { kind: 'gift', pid: 'O', target: 'O' }) } as MatchState
		expect(a.cards!.O.coins).toBe(act.cards!.O.coins + 1)
		expect(applyCardReq(a, { kind: 'gift', pid: 'O', target: 'O' })).toEqual({})
		expect(applyCardReq(act, { kind: 'gift', pid: 'O', target: 'W' })).toEqual({})
	})
	it('a hero defeat counts towards this round\'s fallen', () => {
		const s = field()
		const a = { ...s, ...applyCardReq(s, { kind: 'defeatHero', pid: 'W', target: 'T' }) } as MatchState
		expect(a.fallen).toEqual({ round: 1, n: 1 })
	})
})
