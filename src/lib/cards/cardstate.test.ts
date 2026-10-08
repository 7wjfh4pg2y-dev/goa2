import { describe, it, expect } from 'vitest'
import {
	startingHand,
	ultimateIndex,
	newPlayerCardState,
	initCards,
	commitCard,
	uncommit,
	revealTurn,
	discardCard,
	undiscard,
	endRound,
	addCoins,
	applyLevelUp,
	unlockUltimate,
	levelUp,
	canPick,
	mustLevel,
	pickTier,
	swapPick,
	swapSource,
	twinOf,
	closeLevelPhase,
	allowedMoves,
	manualMove,
	lockPicks,
	levelCost,
	takeUpgrade,
	levelOf,
	statColors,
	TURNS_PER_ROUND
} from './cardstate'
import { heroCards } from './deck'

describe('startingHand', () => {
	it('is the gold + silver basics plus the three Tier-I colours', () => {
		const hand = startingHand('arien')
		expect(hand).toHaveLength(5)
		const cards = heroCards('arien')
		const colors = hand.map((i) => cards[i].color).sort()
		expect(colors).toEqual(['BLUE', 'GOLD', 'GREEN', 'RED', 'SILVER'])
		// the coloured ones are all Tier I
		for (const i of hand) {
			const c = cards[i]
			if (['BLUE', 'RED', 'GREEN'].includes(c.color)) expect(c.level).toBe(1)
		}
	})

	it('works for every hero (5 starting cards)', () => {
		for (const hero of ['brogan', 'xargatha', 'sabina', 'wasp', 'trinkets', 'emmitt']) {
			expect(startingHand(hero)).toHaveLength(5)
		}
	})
})

describe('ultimateIndex', () => {
	it('points at the PURPLE card', () => {
		const idx = ultimateIndex('arien')
		expect(idx).toBeGreaterThanOrEqual(0)
		expect(heroCards('arien')[idx].color).toBe('PURPLE')
	})
})

describe('round loop', () => {
	it('commits, reveals into the turn slot and removes from hand', () => {
		let s = newPlayerCardState('arien')
		const card = s.hand[2]
		s = commitCard(s, card)
		expect(s.pending).toBe(card)
		s = revealTurn(s, 0)
		expect(s.turns[0]).toBe(card)
		expect(s.pending).toBeNull()
		expect(s.hand).not.toContain(card)
	})

	it('ignores commit of a card not in hand', () => {
		const s = newPlayerCardState('arien')
		expect(commitCard(s, 999).pending).toBeNull()
	})

	it('uncommit clears the pending card', () => {
		let s = commitCard(newPlayerCardState('arien'), newPlayerCardState('arien').hand[0])
		s = uncommit(s)
		expect(s.pending).toBeNull()
	})

	it('discard moves a card out of hand into discard, undiscard reverses it', () => {
		let s = newPlayerCardState('arien')
		const card = s.hand[1]
		s = discardCard(s, card)
		expect(s.hand).not.toContain(card)
		expect(s.discard).toContain(card)
		s = undiscard(s, card)
		expect(s.hand).toContain(card)
		expect(s.discard).not.toContain(card)
	})

	it('endRound returns played + discarded cards to hand and clears slots', () => {
		let s = newPlayerCardState('arien')
		const start = [...s.hand]
		// play two turns and defend once
		s = revealTurn(commitCard(s, s.hand[0]), 0)
		s = revealTurn(commitCard(s, s.hand[0]), 1)
		s = discardCard(s, s.hand[0])
		expect(s.hand.length).toBe(2)
		s = endRound(s)
		expect(s.hand.sort((a, b) => a - b)).toEqual(start.sort((a, b) => a - b))
		expect(s.turns).toEqual(Array(TURNS_PER_ROUND).fill(null))
		expect(s.discard).toEqual([])
		expect(s.pending).toBeNull()
	})
})

describe('progression', () => {
	it('addCoins never goes below zero', () => {
		let s = newPlayerCardState('arien')
		s = addCoins(s, 3)
		expect(s.coins).toBe(3)
		s = addCoins(s, -10)
		expect(s.coins).toBe(0)
	})

	it('applyLevelUp removes the old card, keeps the new, and adds a stat item', () => {
		let s = newPlayerCardState('arien')
		const from = s.hand.find((i) => heroCards('arien')[i].color === 'BLUE')!
		const keep = heroCards('arien').findIndex((c) => c.color === 'BLUE' && c.level === 2)
		s = applyLevelUp(s, from, keep, 'def')
		expect(s.level).toBe(2)
		expect(s.removed).toContain(from)
		expect(s.hand).toContain(keep)
		expect(s.hand).not.toContain(from)
		expect(s.items.def).toBe(1)
	})

	it('unlockUltimate flags the ult — a passive, never in hand', () => {
		let s = newPlayerCardState('arien')
		s = unlockUltimate(s)
		expect(s.ultimate).toBe(true)
		expect(s.hand).not.toContain(ultimateIndex('arien'))
	})
})

describe('initCards', () => {
	it('builds a state per drafted player, skipping empties', () => {
		const cards = initCards({ p1: 'arien', p2: 'brogan', p3: '' })
		expect(Object.keys(cards).sort()).toEqual(['p1', 'p2'])
		expect(cards.p1.hero).toBe('arien')
	})
})

describe('takeUpgrade (level-up pick)', () => {
	const cards = heroCards('arien')
	const of = (color: string, lvl: number) => cards.map((c, i) => ({ c, i })).filter((x) => x.c.color === color && (x.c.level ?? 1) === lvl && !x.c.handicapped).map((x) => x.i)
	it('takes the card, turns its twin into an item and removes the older card', () => {
		const s = newPlayerCardState('arien')
		const [a, b] = of('RED', 2)
		const [red1] = of('RED', 1)
		const n = takeUpgrade(s, a)
		expect(n.hand).toContain(a)
		expect(n.hand).not.toContain(red1)
		expect(n.removed).toEqual([red1])
		expect(n.upgrade).toEqual([b])
		expect(levelOf(n)).toBe(2)
	})
	it('pulls the older card out of a played turn too', () => {
		let s = newPlayerCardState('arien')
		const [blue1] = of('BLUE', 1)
		s = revealTurn(commitCard(s, blue1), 0)
		const [x] = of('BLUE', 2)
		const n = takeUpgrade(s, x)
		expect(n.turns[0]).toBeNull()
		expect(n.removed).toContain(blue1)
		expect(n.hand).toContain(x)
	})
})

describe('level-up rules', () => {
	const H = 'arien'
	const cards = heroCards(H)
	const at = (color: string, level: number) => cards.map((c, i) => ({ c, i })).filter(({ c }) => c.color === color && (c.level ?? 1) === level && !c.handicapped).map(({ i }) => i)
	const rich = (coins: number) => ({ ...newPlayerCardState(H), coins })

	it('levels 2–4 take a Tier II in a new colour, paying the current level', () => {
		let s = rich(10)
		expect(pickTier(s)).toBe(2)
		expect(canPick(s, at('RED', 3)[0])).toBe(false) // no Tier III yet
		const [r2] = at('RED', 2)
		s = levelUp(s, r2)
		expect(levelOf(s)).toBe(2)
		expect(s.coins).toBe(9) // level 1 → 2 costs 1
		expect(s.hand).toContain(r2)
		expect(s.upgrade).toContain(twinOf(H, r2))
		expect(s.removed).toContain(at('RED', 1)[0])
		expect(canPick(s, at('RED', 3)[0])).toBe(false) // still need blue + green Tier II
		expect(canPick(s, twinOf(H, r2))).toBe(false) // red is done for Tier II
		s = levelUp(s, at('BLUE', 2)[0])
		s = levelUp(s, at('GREEN', 2)[1])
		expect(levelOf(s)).toBe(4)
		expect(s.coins).toBe(10 - 1 - 2 - 3)
		expect(pickTier(s)).toBe(3)
		expect(canPick(s, at('RED', 3)[0])).toBe(true)
	})

	it('is forced only when affordable, and the ultimate needs all three Tier III', () => {
		let s = rich(0)
		expect(mustLevel(s)).toBe(false)
		s = rich(100)
		for (const col of ['RED', 'BLUE', 'GREEN']) s = levelUp(s, at(col, 2)[0])
		for (const col of ['RED', 'BLUE', 'GREEN']) s = levelUp(s, at(col, 3)[0])
		expect(levelOf(s)).toBe(7)
		expect(s.hand.filter((i) => ['RED', 'BLUE', 'GREEN'].includes(cards[i].color))).toHaveLength(3)
		const ult = ultimateIndex(H)
		expect(canPick(s, ult)).toBe(true)
		s = levelUp(s, ult)
		expect(s.ultimate).toBe(true)
		expect(levelOf(s)).toBe(8)
		expect(s.hand).not.toContain(ult)
		expect(mustLevel(s)).toBe(false)
		expect(s.coins).toBe(100 - (1 + 2 + 3 + 4 + 5 + 6 + 7))
	})

	it("lets this round's pick swap for its twin, then locks it at round end", () => {
		let s = rich(5)
		const [a, b] = at('RED', 2)
		s = levelUp(s, a)
		expect(swapSource(s, b)).toBe(a)
		s = swapPick(s, b)
		expect(s.hand).toContain(b)
		expect(s.upgrade).toContain(a)
		expect(s.upgrade).not.toContain(b)
		expect(levelOf(s)).toBe(2)
		s = closeLevelPhase(s)
		expect(s.roundPicks).toEqual([])
		expect(swapSource(s, a)).toBe(null)
		expect(swapPick(s, a)).toBe(s)
	})

	it('gives a pity coin only to heroes who did not level up', () => {
		expect(closeLevelPhase(rich(0)).coins).toBe(1)
		const s = levelUp(rich(1), at('RED', 2)[0])
		expect(closeLevelPhase(s).coins).toBe(0)
	})
})

describe('manual moves', () => {
	const H = 'arien'
	const cards = heroCards(H)
	const at = (color: string, level: number) => cards.map((c, i) => ({ c, i })).filter(({ c }) => c.color === color && (c.level ?? 1) === level && !c.handicapped).map(({ i }) => i)

	it('Tier I only leaves the hand to Removed, and only comes back to the hand', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [r1] = at('RED', 1)
		expect(allowedMoves(s, r1)).toEqual(['removed'])
		expect(manualMove(s, r1, 'upgrade')).toBe(s)
		expect(manualMove(s, r1, 'deck')).toBe(s)
		s = manualMove(s, r1, 'removed')
		expect(s.removed).toContain(r1)
		expect(allowedMoves(s, r1)).toEqual(['hand'])
	})

	it('Tier II moves between hand and upgrades only; sent to hand it keeps one card per colour', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [a, b] = at('RED', 2)
		expect(allowedMoves(s, a)).toEqual(['hand', 'upgrade'])
		s = manualMove(s, a, 'hand')
		expect(s.hand).toContain(a)
		expect(s.upgrade).toContain(b)
		expect(s.removed).toContain(at('RED', 1)[0])
		expect(allowedMoves(s, a)).toEqual(['upgrade', 'deck']) // held: swap or undo, no manual Remove
		expect(manualMove(s, a, 'removed')).toBe(s)
		expect(allowedMoves(s, b)).toEqual(['hand', 'deck'])
	})

	it('sending a Tier II to upgrades brings its twin to hand and removes the Tier I', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [a, b] = at('RED', 2)
		s = manualMove(s, a, 'upgrade')
		expect(s.upgrade).toContain(a)
		expect(s.hand).toContain(b)
		expect(s.removed).toContain(at('RED', 1)[0])
		expect(s.hand).not.toContain(at('RED', 1)[0])
		// and back: the held one goes up, the other path comes down
		s = manualMove(s, b, 'upgrade')
		expect(s.hand).toContain(a)
		expect(s.upgrade).toContain(b)
		expect(s.upgrade).not.toContain(a)
	})

	it('Tier III does the same against the Tier II', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [r2] = at('RED', 2)
		const [c, d] = at('RED', 3)
		s = manualMove(s, r2, 'hand')
		expect(manualMove(s, c, 'hand')).toBe(s) // no Tier III until every colour is on Tier II
		s = manualMove(s, at('BLUE', 2)[0], 'hand')
		s = manualMove(s, at('GREEN', 2)[0], 'hand')
		s = manualMove(s, c, 'hand')
		expect(s.hand).toContain(c)
		expect(s.upgrade).toContain(d)
		expect(s.removed).toContain(r2)
		expect(s.hand.filter((i) => cards[i].color === 'RED')).toEqual([c])
		s = manualMove(s, c, 'upgrade')
		expect(s.hand).toContain(d)
		expect(s.upgrade).toContain(c)
		expect(s.hand.filter((i) => cards[i].color === 'RED')).toEqual([d])
	})

	it('a removed Tier I back to hand undoes that colour this round, then locks at round end', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [r1] = at('RED', 1)
		const [a, b] = at('RED', 2)
		s = manualMove(s, a, 'hand')
		expect(levelOf(s)).toBe(2)
		expect(allowedMoves(s, r1)).toEqual(['hand'])
		const undone = manualMove(s, r1, 'hand')
		expect(undone.hand).toContain(r1)
		expect(undone.hand).not.toContain(a)
		expect(undone.upgrade).not.toContain(b)
		expect(undone.removed).not.toContain(r1)
		expect(levelOf(undone)).toBe(1)
		expect(undone.coins).toBe(50) // the level is refunded
		// next round: the choice is locked — no undo, no swap
		s = lockPicks(s)
		expect(allowedMoves(s, r1)).toEqual([])
		expect(allowedMoves(s, a)).toEqual([])
		expect(allowedMoves(s, b)).toEqual([])
	})

	it('undoing a paid level-up refunds it', () => {
		let s = { ...newPlayerCardState(H), coins: 5 }
		s = levelUp(s, at('RED', 2)[0])
		expect(s.coins).toBe(4)
		s = manualMove(s, at('RED', 1)[0], 'hand')
		expect(s.coins).toBe(5)
		expect(levelOf(s)).toBe(1)
	})

	it('every level-up costs coins; no coins, no pick', () => {
		let s = { ...newPlayerCardState(H), coins: 2 }
		expect(allowedMoves(s, at('RED', 2)[0])).toEqual(['hand', 'upgrade'])
		s = manualMove(s, at('RED', 2)[0], 'hand') // 1 → 2 costs 1
		expect(s.coins).toBe(1)
		expect(allowedMoves(s, at('BLUE', 2)[0])).toEqual([]) // 2 → 3 costs 2
	})

	it('Deck undoes this round\'s pick so another colour can be picked, refunded', () => {
		let s = { ...newPlayerCardState(H), coins: 1 }
		const [a, b] = at('RED', 2)
		s = manualMove(s, a, 'hand')
		expect(s.coins).toBe(0)
		s = manualMove(s, b, 'deck') // from the upgrade side works too
		expect(s.coins).toBe(1)
		expect(s.hand).toContain(at('RED', 1)[0])
		expect(s.hand).not.toContain(a)
		expect(s.upgrade).toEqual([])
		expect(s.removed).toEqual([])
		expect(levelOf(s)).toBe(1)
		s = manualMove(s, at('BLUE', 2)[0], 'hand')
		expect(s.hand).toContain(at('BLUE', 2)[0])
		expect(s.coins).toBe(0)
	})

	it('the ultimate unlocks at level 7 for 7 coins, and can be undone this round', () => {
		let s = { ...newPlayerCardState(H), coins: 1 + 2 + 3 + 4 + 5 + 6 + 7 }
		for (const col of ['RED', 'BLUE', 'GREEN']) s = manualMove(s, at(col, 2)[0], 'hand')
		for (const col of ['RED', 'BLUE', 'GREEN']) s = manualMove(s, at(col, 3)[0], 'hand')
		expect(levelOf(s)).toBe(7)
		expect(s.coins).toBe(7)
		const ult = ultimateIndex(H)
		expect(allowedMoves(s, ult)).toEqual(['hand'])
		s = manualMove(s, ult, 'hand')
		expect(s.ultimate).toBe(true)
		expect(levelOf(s)).toBe(8)
		expect(s.coins).toBe(0)
		expect(s.hand).not.toContain(ult)
		// undoing a Tier III this round relocks it and refunds both levels
		const undone = manualMove(s, at('RED', 3)[0], 'deck')
		expect(undone.ultimate).toBe(false)
		expect(levelOf(undone)).toBe(6)
		expect(undone.coins).toBe(7 + 6)
		// after the round it's locked in
		expect(allowedMoves(lockPicks(s), ult)).toEqual([])
	})

	it('costs follow the rules: level L → L+1 costs L', () => {
		expect([1, 2, 3, 4, 5, 6, 7].map(levelCost)).toEqual([1, 2, 3, 4, 5, 6, 7])
		let s = { ...newPlayerCardState(H), coins: 28 }
		const order: Array<[string, number]> = [['RED', 2], ['BLUE', 2], ['GREEN', 2], ['RED', 3], ['BLUE', 3], ['GREEN', 3]]
		for (const [col, tier] of order) {
			const before = s.coins, lvl = levelOf(s)
			s = manualMove(s, at(col, tier)[0], 'hand')
			expect(before - s.coins).toBe(lvl)
		}
		expect(s.coins).toBe(28 - 21)
	})

	it('red 2a → Deck refunds the 1 coin, and it can buy blue instead', () => {
		let s = { ...newPlayerCardState(H), coins: 1 }
		const [a, b] = at('RED', 2)
		s = manualMove(s, a, 'hand')
		expect(s.upgrade).toEqual([b])
		expect(s.coins).toBe(0)
		s = manualMove(s, a, 'deck')
		expect(s.coins).toBe(1)
		expect(s.hand).not.toContain(a)
		expect(s.upgrade).not.toContain(b)
		s = manualMove(s, at('BLUE', 2)[0], 'hand')
		expect(levelOf(s)).toBe(2)
		expect(s.coins).toBe(0)
	})

	it('a Tier I card never goes to the deck', () => {
		let s = { ...newPlayerCardState(H), coins: 50 }
		const [r1] = at('RED', 1)
		expect(allowedMoves(s, r1)).not.toContain('deck')
		s = manualMove(s, at('RED', 2)[0], 'hand') // Tier I removed
		expect(allowedMoves(s, r1)).not.toContain('deck')
		s = manualMove(s, at('RED', 2)[0], 'deck') // undo: Tier I back in hand, not the deck
		expect(s.hand).toContain(r1)
		expect(manualMove(s, r1, 'deck')).toBe(s)
	})

	it('basics never move', () => {
		const s = newPlayerCardState(H)
		expect(allowedMoves(s, cards.findIndex((c) => c.color === 'GOLD'))).toEqual([])
		expect(allowedMoves(s, ultimateIndex(H))).toEqual([]) // not reachable yet
	})
})

describe('statColors', () => {
	it('colours each item by the card behind it, Tier II picks first, then hand-made bumps', () => {
		const cards = heroCards('arien')
		const at = (color: string, level: number, item: string) => cards.findIndex((c) => c.color === color && c.level === level && c.item === item)
		const t3 = at('RED', 3, 'INITIATIVE'), t2 = at('BLUE', 2, 'INITIATIVE')
		expect(t3).toBeGreaterThan(-1)
		expect(t2).toBeGreaterThan(-1)
		const s = { ...newPlayerCardState('arien'), upgrade: [t3, t2], items: { init: 1 } }
		expect(statColors(s).init).toEqual(['BLUE', 'RED', 'BRASS'])
	})
})
