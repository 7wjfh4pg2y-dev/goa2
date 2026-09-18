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

	it('unlockUltimate flags the ult and puts it in hand', () => {
		let s = newPlayerCardState('arien')
		s = unlockUltimate(s)
		expect(s.ultimate).toBe(true)
		expect(s.hand).toContain(ultimateIndex('arien'))
	})
})

describe('initCards', () => {
	it('builds a state per drafted player, skipping empties', () => {
		const cards = initCards({ p1: 'arien', p2: 'brogan', p3: '' })
		expect(Object.keys(cards).sort()).toEqual(['p1', 'p2'])
		expect(cards.p1.hero).toBe('arien')
	})
})
