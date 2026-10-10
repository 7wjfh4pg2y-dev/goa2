import { describe, it, expect } from 'vitest'
import { applyCardReq, canRespawn, turnOrder, turnPlan, claimable, reclaimableSeat, transferSeat, nameKey, turnKey, actorOf, lifeTier, cardInitiative, cardResolved, clearable, minionDefense, boardLookOf, zoneGlowOf, boardFxOf, type MatchState, type Piece } from './match'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards as heroCardsOf } from './cards/deck'

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

describe('the host\'s board options', () => {
	it('default to the island with the battle zone outlined; old or odd values fall back to the defaults', () => {
		expect(boardLookOf({})).toBe('island')
		expect(boardLookOf({ boardLook: 'classic' })).toBe('classic')
		expect(boardLookOf({ boardLook: 'nonsense' as never })).toBe('island')
		expect(zoneGlowOf({})).toBe(true)
		expect(zoneGlowOf({ zoneGlow: false })).toBe(false)
		expect(boardFxOf({})).toBe(true)
		expect(boardFxOf({ boardFx: false })).toBe(false)
	})
})

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

	it('A defeats B (level 3): A +3, teammate C +1 assist, Blue −1 life, B’s face-down card stays in its slot', () => {
		const p = applyCardReq(game(), { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.cards!.A.coins).toBe(5 + 3)
		expect(p.cards!.C.coins).toBe(5 + 1)
		expect(p.cards!.D.coins).toBe(5) // the victim's team gets nothing
		expect(p.cards!.B.coins).toBe(5) // the reward comes from the game, not B's bank
		expect(p.life).toEqual({ orange: 6, blue: 5 })
		expect(p.pieces!.B).toBeUndefined()
		expect(p.cards!.B.pending).toBe(4)
		expect(p.cards!.B.discard).not.toContain(4)
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

	it('keeps the hand, and this turn\'s card stays in its slot (never discarded)', () => {
		const s = game()
		const p = applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.cards!.B.hand).toEqual(s.cards!.B.hand)
		expect(p.cards!.B.pending).toBe(4)
		expect(p.cards!.B.discard).not.toContain(4)
	})

	it('leaves the fallen hero\'s tokens on the board (rulebook p.19) — only the markers riding on them come off', () => {
		const s = game()
		const tok = (id: string, token: string, owner: string, extra: Partial<Piece> = {}): Piece => ({ id, hex: '7_7', team: 'blue', kind: 'token', token, owner, ...extra })
		s.pieces = { ...s.pieces, tree: tok('tree', 'token_tree', 'B'), pyro: tok('pyro', 'companion', 'B', { label: 'Pyro' }),
			turret: tok('turret', 'companion', 'B', { label: 'Turret' }), other: tok('other', 'token_rock', 'C'),
			poison: tok('poison', 'marker_poison', 'A', { attachedTo: 'B' }) }
		const p = applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' })
		expect(p.pieces!.B).toBeUndefined()
		expect(p.pieces!.tree).toBeDefined()
		expect(p.pieces!.pyro).toBeDefined()
		expect(p.pieces!.turret).toBeDefined()
		expect(p.pieces!.other).toBeDefined()
		expect(p.pieces!.poison).toBeUndefined() // a marker the fallen hero carried is returned
	})

	it('taking your own hero off the board: no rewards, tokens stay, back with the next card', () => {
		const s = game()
		s.pieces!.tree = { id: 'tree', hex: '7_7', team: 'blue', kind: 'token', token: 'token_tree', owner: 'B' }
		const p = applyCardReq(s, { kind: 'removeHero', pid: 'B' })
		expect(p.pieces!.B).toBeUndefined()
		expect(p.pieces!.tree).toBeDefined()
		expect(p.defeated!.B).toMatchObject({ round: 1, turn: 2 })
		expect(p.life).toBeUndefined()
		expect(p.cards).toBeUndefined()
	})

	it('Clear: the player chooses among the tokens next to their hero — friend or foe, never further away, never the Turret', () => {
		const s = game() // A stands on 1_1
		const tok = (id: string, hex: string, owner: string, extra: Partial<Piece> = {}): Piece => ({ id, hex, team: 'blue', kind: 'token', token: 'token_rock', owner, ...extra })
		s.pieces = { ...s.pieces, near: tok('near', '2_1', 'B'), near2: tok('near2', '1_0', 'D'), far: tok('far', '3_1', 'B'), mine: tok('mine', '0_1', 'C'),
			turret: tok('turret', '0_1', 'D', { token: 'companion', label: 'Turret' }), ride: tok('ride', '2_1', 'B', { token: 'marker_poison', attachedTo: 'C' }) }
		expect(clearable(s, 'A').map((p) => p.id).sort()).toEqual(['mine', 'near', 'near2']) // an ally's token (mine) can go too
		// only what was chosen leaves; ids that aren't adjacent tokens are ignored
		const p = applyCardReq(s, { kind: 'clearAround', pid: 'A', ids: ['near', 'mine', 'far', 'turret', 'ride', 'm1'] })
		expect(p.pieces!.near).toBeUndefined()
		expect(p.pieces!.mine).toBeUndefined()
		expect(p.pieces!.near2).toBeDefined() // not chosen
		expect(p.pieces!.far).toBeDefined()
		expect(p.pieces!.turret).toBeDefined()
		expect(p.pieces!.ride).toBeDefined()
		expect(p.pieces!.m1).toBeDefined()
		expect(applyCardReq(s, { kind: 'clearAround', pid: 'A', ids: [] })).toEqual({}) // nothing chosen
		expect(applyCardReq(s, { kind: 'clearAround', pid: 'A', ids: ['far'] })).toEqual({}) // nothing legal chosen
	})

	it('respawns in a later turn once they play a card (possibly next round)', () => {
		let s = { ...game() }
		s = { ...s, ...applyCardReq(s, { kind: 'defeatHero', pid: 'A', target: 'B' }) } as MatchState
		expect(canRespawn(s, 'B')).toBe(false) // same turn
		expect(applyCardReq(s, { kind: 'respawn', pid: 'B', hex: '9_9' })).toEqual({})
		s = { ...s, ...applyCardReq(s, { kind: 'advance', pid: 'A' }) } as MatchState // the card locks into its slot
		expect(s.turn).toBe(3)
		expect(canRespawn(s, 'B')).toBe(false) // next turn, but no card played yet
		s = { ...s, cards: { ...s.cards, B: { ...s.cards!.B, pending: s.cards!.B.hand[0] } } } as MatchState
		// active turns: only once B's card is the one acting
		const bAt = turnOrder(s).indexOf('B')
		s = { ...s, acting: { key: turnKey(s), idx: bAt === 0 ? 1 : 0 } } as MatchState
		expect(canRespawn(s, 'B')).toBe(false) // someone else is acting
		s = { ...s, acting: { key: turnKey(s), idx: bAt } } as MatchState
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
		expect(applyCardReq(s, { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defended' })).toEqual({}) // no card discarded yet
		s = { ...s, ...applyCardReq(s, { kind: 'defend', pid: 'B', idx: s.cards!.B.hand.find((i) => i !== s.cards!.B.pending)! }) } as MatchState // B discards: the defence
		expect(s.attacks!.B).toMatchObject({ defending: true, discarded: true })
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

describe('how a clash ended (lastClash, for the Hall of Records)', () => {
	const g = () => ({ ...game(), host: 'H' }) as MatchState
	const atk = () => ({ ...g(), ...applyCardReq(g(), { kind: 'attack', pid: 'A', target: 'B' }) }) as MatchState
	const disc = (s: MatchState) => ({ ...s, ...applyCardReq(s, { kind: 'defend', pid: 'B', idx: s.cards!.B.hand.find((i) => i !== s.cards!.B.pending)! }) }) as MatchState
	it('an attack: died without a discard · defended · discarded and still died · called off', () => {
		expect(applyCardReq(atk(), { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defeated' }).lastClash).toMatchObject({ kind: 'attack', by: 'A', v: 'B', out: 'died', disc: false })
		expect(applyCardReq(disc(atk()), { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defended' }).lastClash).toMatchObject({ out: 'defended', disc: true })
		expect(applyCardReq(disc(atk()), { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defeated' }).lastClash).toMatchObject({ out: 'died', disc: true })
		expect(applyCardReq(atk(), { kind: 'attackResolve', pid: 'A', target: 'B', result: 'cancel' }).lastClash).toMatchObject({ out: 'cancel' })
		expect(applyCardReq(atk(), { kind: 'attackResolve', pid: 'B', target: 'B', result: 'defend' }).lastClash).toBeUndefined() // still going
	})
	it('a forced discard: discarded · or die and died · nothing to discard', () => {
		const f = (die: boolean) => ({ ...g(), ...applyCardReq(g(), { kind: 'force', pid: 'A', target: 'B', die }) }) as MatchState
		expect(applyCardReq(f(false), { kind: 'defend', pid: 'B', idx: f(false).cards!.B.hand.find((i) => i !== f(false).cards!.B.pending)! }).lastClash).toMatchObject({ kind: 'force', out: 'defended', disc: true })
		expect(applyCardReq(f(true), { kind: 'forceResolve', pid: 'B', target: 'B', result: 'defeated' }).lastClash).toMatchObject({ kind: 'force', out: 'died', disc: false })
		expect(applyCardReq(f(false), { kind: 'forceResolve', pid: 'B', target: 'B', result: 'none' }).lastClash).toMatchObject({ out: 'none' })
	})
})

describe('forced discards', () => {
	const g = () => ({ ...game(), host: 'H' }) as MatchState
	it('discard: any card answers it; the forcer can call it off; only an enemy can force', () => {
		expect(applyCardReq(g(), { kind: 'force', pid: 'A', target: 'C', die: false })).toEqual({})
		let s = { ...g(), ...applyCardReq(g(), { kind: 'force', pid: 'A', target: 'B', die: false }) } as MatchState
		expect(s.forced!.B).toMatchObject({ by: 'A', die: false })
		expect(applyCardReq(s, { kind: 'forceResolve', pid: 'B', target: 'B', result: 'defeated' })).toEqual({}) // plain discard: no defeat
		const d = applyCardReq(s, { kind: 'defend', pid: 'B', idx: s.cards!.B.hand.find((i) => i !== s.cards!.B.pending)! })
		expect(d.forced).toEqual({})
		expect(d.cards!.B.discard.length).toBe(1)
		expect(applyCardReq(s, { kind: 'forceResolve', pid: 'A', target: 'B', result: 'cancel' }).forced).toEqual({})
		expect(applyCardReq(s, { kind: 'forceResolve', pid: 'D', target: 'B', result: 'cancel' })).toEqual({})
	})
	it('discard or die: not discarding defeats them, the rewards go to the forcer', () => {
		const s = { ...g(), ...applyCardReq(g(), { kind: 'force', pid: 'A', target: 'B', die: true }) } as MatchState
		const d = applyCardReq(s, { kind: 'forceResolve', pid: 'B', target: 'B', result: 'defeated' })
		expect(d.pieces!.B).toBeUndefined()
		expect(d.forced).toEqual({})
		expect(d.lastDefeat).toMatchObject({ victim: 'B', by: 'A', coins: 3 })
	})
})

describe('minion modifiers on a defence', () => {
	it('enemy melee / heavy next to the hero −1, enemy ranged within 2 −1, friendly melee +1, friendly ranged nothing', () => {
		const s = game()
		// B (blue) at 5_5: put minions round it
		const pieces = { ...s.pieces,
			e1: { id: 'e1', hex: '5_4', team: 'orange', kind: 'minion', role: 'melee' },
			e2: { id: 'e2', hex: '5_3', team: 'orange', kind: 'minion', role: 'ranged' },
			e3: { id: 'e3', hex: '5_2', team: 'orange', kind: 'minion', role: 'heavy' }, // too far
			f1: { id: 'f1', hex: '5_6', team: 'blue', kind: 'minion', role: 'heavy' },
			f2: { id: 'f2', hex: '6_5', team: 'blue', kind: 'minion', role: 'ranged' }
		} as Record<string, Piece>
		const r = minionDefense({ ...s, pieces: Object.fromEntries(Object.entries(pieces).filter(([id]) => !['m1', 'm2'].includes(id))) } as MatchState, 'B')
		expect(Object.fromEntries(r.mods.map((m) => [m.id, m.d]))).toEqual({ e1: -1, e2: -1, f1: 1 })
		expect(r.total).toBe(-1)
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

describe('active turns (after the reveal the cards act one at a time)', () => {
	// everyone has a card out; A, C, D play the same card (a tie), B plays another
	function play(coin: 'orange' | 'blue' = 'orange'): MatchState {
		const s = game()
		const c = s.cards!
		return { ...s, host: 'H', tieBreaker: coin, cards: { ...c, A: { ...c.A, pending: 0 }, C: { ...c.C, pending: 0 }, D: { ...c.D, pending: 0 } } } as MatchState
	}
	it('orders the cards by initiative; a tie across teams goes card by card, the coin flipping after each contested pick', () => {
		for (const coin of ['orange', 'blue'] as const) {
			const s = play(coin)
			const order = turnOrder(s)
			expect([...order].sort()).toEqual(['A', 'B', 'C', 'D'])
			const ini = order.map((p) => cardInitiative(s, p)!)
			for (let i = 1; i < ini.length; i++) expect(ini[i]).toBeLessThanOrEqual(ini[i - 1])
			// A, C (orange) and D (blue) tie
			const tied = order.filter((p) => p !== 'B')
			const { flips } = turnPlan(s)
			if (coin === 'orange') {
				// an Atlantean (A, their pick) → flip → D → flip → C (alone: no flip)
				expect(tied).toEqual(['A', 'D', 'C'])
				expect(flips.map((k) => order[k])).toEqual(['A', 'D'])
			} else {
				// D → flip → the Atlanteans in the order they choose, no more flips (teammates only)
				expect(tied).toEqual(['D', 'A', 'C'])
				expect(flips.map((k) => order[k])).toEqual(['D'])
			}
		}
		expect(turnOrder({ ...play(), cards: { ...play().cards, D: { ...play().cards!.D, pending: -1 } } } as MatchState)).not.toContain('D') // a pass doesn't act
	})
	it('only the acting player (or the host) ends a turn; the next card acts', () => {
		let s = play()
		const [first, second] = turnOrder(s)
		expect(actorOf(s)).toBe(first)
		expect(applyCardReq(s, { kind: 'endAct', pid: second })).toEqual({})
		s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: first }) } as MatchState
		expect(actorOf(s)).toBe(second)
		s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: 'H' }) } as MatchState // the host skips someone away
		expect(actorOf(s)).toBe(turnOrder(s)[2])
		expect(applyCardReq(s, { kind: 'setAct', pid: first, idx: 0 })).toEqual({}) // only the host points
		s = { ...s, ...applyCardReq(s, { kind: 'setAct', pid: 'H', idx: 0 }) } as MatchState
		expect(actorOf(s)).toBe(first)
		// a new turn starts from the first card again
		expect(actorOf({ ...s, turn: 3 } as MatchState)).toBe(turnOrder({ ...s, turn: 3 } as MatchState)[0])
	})
	it('the coin flips by itself after each contested pick — without reshuffling the order', () => {
		let s = play('orange')
		const order = turnOrder(s), { flips } = turnPlan(s)
		for (let k = 0; k < order.length; k++) {
			const before = s.tieBreaker
			s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: order[k] }) } as MatchState
			expect(s.tieBreaker).toBe(flips.includes(k) ? (before === 'orange' ? 'blue' : 'orange') : before)
			expect(turnOrder(s)).toEqual(order) // the turn's order never changes
		}
		expect(s.tieBreaker).toBe('orange') // flipped twice
		// teammates alone tied: no coin, no flip
		const t = { ...play('orange'), cards: { ...play().cards, D: { ...play().cards!.D, pending: -1 } } } as MatchState
		let u = t
		for (const p of turnOrder(t)) u = { ...u, ...applyCardReq(u, { kind: 'endAct', pid: p }) } as MatchState
		expect(u.tieBreaker).toBe('orange')
	})
	it('tied teammates choose who goes first: one of them claims it', () => {
		let s = play('blue')
		const order = turnOrder(s)
		while (actorOf(s) !== 'D') s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: actorOf(s)! }) } as MatchState
		s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: 'D' }) } as MatchState
		expect(actorOf(s)).toBe('A')
		expect(claimable(s)).toEqual(['C'])
		expect(applyCardReq(s, { kind: 'claim', pid: 'B' })).toEqual({}) // not in the tie
		s = { ...s, ...applyCardReq(s, { kind: 'claim', pid: 'C' }) } as MatchState
		expect(actorOf(s)).toBe('C')
		expect(turnOrder(s).filter((p) => p !== 'B')).toEqual(['D', 'C', 'A'])
		expect(claimable(s)).toEqual(['A']) // A can take it back while C hasn't finished
		s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: 'C' }) } as MatchState
		expect(actorOf(s)).toBe('A')
		expect(claimable(s)).toEqual([])
		expect(s.tieBreaker).toBe('orange') // one flip only (after D)
		expect(order.length).toBe(4)
	})
	it('after the last card ends its turn nobody acts and the turn waits for the host (Next turn / minion battle)', () => {
		let s = play()
		for (const p of turnOrder(play())) s = { ...s, ...applyCardReq(s, { kind: 'endAct', pid: p }) } as MatchState
		expect(s.turn).toBe(2)
		expect(actorOf(s)).toBeNull()
		expect(applyCardReq(s, { kind: 'endAct', pid: 'H' })).toEqual({})
		s = { ...s, ...applyCardReq(s, { kind: 'advance', pid: 'H' }) } as MatchState
		expect(s.turn).toBe(3)
		expect(s.cards!.A.turns[1]).toBe(0) // the card locked into its slot
		let t = { ...play(), turn: 4 } as MatchState
		for (const p of turnOrder(t)) t = { ...t, ...applyCardReq(t, { kind: 'endAct', pid: p }) } as MatchState
		expect(t.turn).toBe(4)
		expect(actorOf(t)).toBeNull()
		expect(applyCardReq(t, { kind: 'endAct', pid: 'H' })).toEqual({})
	})
})

describe('coming back to your seat under the same name (a new device, the app vs the browser)', () => {
	const pl = (id: string, name: string, seat = -1) => ({ id, name, color: 'spectator', ready: false, seat })
	const s = () => ({ ...game(), seatMap: { '0': { id: 'A', name: 'Avery' }, '2': { id: 'B', name: 'Harper' } } }) as MatchState
	it('hands the seat back only when its owner has gone and nobody else sits there', () => {
		expect(nameKey('  aVeRy ')).toBe('avery')
		expect(reclaimableSeat(s(), [pl('A2', 'avery')], pl('A2', 'avery'))).toBe(0)
		expect(reclaimableSeat(s(), [pl('A', 'Avery', 0), pl('A2', 'Avery')], pl('A2', 'Avery'))).toBeNull() // the owner is still here
		expect(reclaimableSeat(s(), [pl('X', 'Quinn', 0), pl('A2', 'Avery')], pl('A2', 'Avery'))).toBeNull() // someone sits in it
		expect(reclaimableSeat(s(), [pl('A2', 'Avery', 1)], pl('A2', 'Avery', 1))).toBeNull() // already seated
		expect(reclaimableSeat(s(), [pl('Q', 'Stranger')], pl('Q', 'Stranger'))).toBeNull()
	})
	it('the hand-back carries the hero, cards and tokens over to the new id', () => {
		const st = s()
		const p = transferSeat(st, 'A', 'A2', 'Avery', 0)
		expect(p.seatMap!['0']).toEqual({ id: 'A2', name: 'Avery' })
		expect(p.cards!.A2).toBeTruthy()
		expect(p.cards!.A).toBeUndefined()
		expect(p.pieces!.A2?.id).toBe('A2')
	})
})


describe('the host edits a player\'s deck (free level up / down)', () => {
	it('only the host, on another player\'s cards, without coins', () => {
		const s = { ...game(), host: 'H', cards: { ...game().cards, D: { ...newPlayerCardState('arien'), coins: 0 } } } as MatchState
		const cards = heroCardsOf('arien')
		const r2 = cards.findIndex((c) => c.color === 'RED' && c.level === 2)
		expect(applyCardReq(s, { kind: 'hostMove', pid: 'A', target: 'D', idx: r2, to: 'hand' })).toEqual({})
		const up = applyCardReq(s, { kind: 'hostMove', pid: 'H', target: 'D', idx: r2, to: 'hand' })
		expect(up.cards!.D.level).toBe(2)
		expect(up.cards!.D.coins).toBe(0)
		expect(up.cards!.D.hand).toContain(r2)
		const down = applyCardReq({ ...s, cards: up.cards } as MatchState, { kind: 'hostMove', pid: 'H', target: 'D', idx: r2, to: 'deck' })
		expect(down.cards!.D.level).toBe(1)
		expect(down.cards!.D.hand).not.toContain(r2)
	})
})
