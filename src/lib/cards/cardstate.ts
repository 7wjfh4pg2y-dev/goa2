// Per-player card state for the digital tabletop card layer.
//
// Like the rest of GoA2, this mirrors the physical game rather than enforcing
// rules: it tracks each player's hand, the cards played across the round's four
// turns, the discard, permanently-removed cards, level-up stat items and the
// ultimate. All functions here are pure so they can be unit-tested and folded
// into the shared match snapshot (full-snapshot LWW like everything else).
import { heroCards } from './deck'

export type StatKey = 'atk' | 'def' | 'init' | 'move' | 'range' | 'radius'
export const STAT_KEYS: StatKey[] = ['atk', 'def', 'init', 'move', 'range', 'radius']

/** A round is four turns; you play one card per turn. */
export const TURNS_PER_ROUND = 4

export interface PlayerCardState {
	hero: string
	level: number
	coins: number
	/** Card indices (into heroCards(hero)) currently available to play this round. */
	hand: number[]
	/** Card played each turn this round; null = not played yet. Length 4. */
	turns: (number | null)[]
	/** Face-down card committed for the current turn, not yet revealed. */
	pending: number | null
	/** Cards spent this round (defended with, or removed by effects). */
	discard: number[]
	/** Cards permanently gone (returned to the box on level-up). */
	removed: number[]
	/** Permanent +N per stat from level-up items. */
	items: Partial<Record<StatKey, number>>
	ultimate: boolean
}

const isColor = (c: string, ...want: string[]) => want.includes(c)

/**
 * The starting five: the GOLD basic, the SILVER basic, and the three Tier-I
 * (level 1) coloured cards — blue, red, green.
 */
export function startingHand(hero: string): number[] {
	const cards = heroCards(hero)
	const gold = cards.findIndex((c) => isColor(c.color, 'GOLD') && !c.handicapped)
	const silver = cards.findIndex((c) => isColor(c.color, 'SILVER') && !c.handicapped)
	const tierI = cards
		.map((c, i) => ({ c, i }))
		.filter(({ c }) => (c.level ?? 0) === 1 && isColor(c.color, 'BLUE', 'RED', 'GREEN'))
		.map(({ i }) => i)
	return [gold, silver, ...tierI].filter((i) => i >= 0)
}

/** Index of the hero's ultimate (the PURPLE / Tier-IV card), or -1. */
export function ultimateIndex(hero: string): number {
	return heroCards(hero).findIndex((c) => isColor(c.color, 'PURPLE'))
}

export function newPlayerCardState(hero: string): PlayerCardState {
	return {
		hero,
		level: 1,
		coins: 0,
		hand: startingHand(hero),
		turns: Array(TURNS_PER_ROUND).fill(null),
		pending: null,
		discard: [],
		removed: [],
		items: {},
		ultimate: false
	}
}

/** Card state for every player who drafted a hero (picks maps playerId → heroId). */
export function initCards(picks: Record<string, string>): Record<string, PlayerCardState> {
	const out: Record<string, PlayerCardState> = {}
	for (const pid in picks) if (picks[pid]) out[pid] = newPlayerCardState(picks[pid])
	return out
}

/** pending sentinel meaning the player readied without a card (passed this turn). */
export const PASS = -1

/** Commit a face-down card for the current turn (must be in hand). */
export function commitCard(s: PlayerCardState, idx: number): PlayerCardState {
	if (!s.hand.includes(idx)) return s
	return { ...s, pending: idx }
}

/** Ready up with no card (nothing to play / choosing to pass this turn). */
export function passTurn(s: PlayerCardState): PlayerCardState {
	return { ...s, pending: PASS }
}

/** Reveal on the shared count-of-three: a real card lands in its slot; a pass clears. */
export function revealPlayer(s: PlayerCardState, turn: number): PlayerCardState {
	if (s.pending == null) return s
	if (s.pending === PASS) return { ...s, pending: null }
	return revealTurn(s, turn)
}

/** Take back the face-down card before reveal. */
export function uncommit(s: PlayerCardState): PlayerCardState {
	return s.pending == null ? s : { ...s, pending: null }
}

/** Reveal: move the pending card into the given turn slot and out of hand. */
export function revealTurn(s: PlayerCardState, turn: number): PlayerCardState {
	if (s.pending == null || turn < 0 || turn >= TURNS_PER_ROUND) return s
	const turns = s.turns.slice()
	turns[turn] = s.pending
	return { ...s, turns, pending: null, hand: s.hand.filter((i) => i !== s.pending) }
}

/** Defend / effect-discard: spend a card from hand this round. */
export function discardCard(s: PlayerCardState, idx: number): PlayerCardState {
	if (!s.hand.includes(idx)) return s
	return { ...s, hand: s.hand.filter((i) => i !== idx), discard: [...s.discard, idx] }
}

/** Undo a discard (pull it back into hand). */
export function undiscard(s: PlayerCardState, idx: number): PlayerCardState {
	if (!s.discard.includes(idx)) return s
	const at = s.discard.indexOf(idx)
	const discard = s.discard.slice()
	discard.splice(at, 1)
	return { ...s, hand: [...s.hand, idx].sort((a, b) => a - b), discard }
}

/**
 * End of round: every card played or discarded returns to hand; the turn slots,
 * pending card and discard clear. Removed cards, items, level and coins persist.
 */
export function endRound(s: PlayerCardState): PlayerCardState {
	const back = [...s.turns.filter((x): x is number => x != null), ...s.discard]
	if (s.pending != null) back.push(s.pending)
	return {
		...s,
		hand: [...s.hand, ...back].sort((a, b) => a - b),
		turns: Array(TURNS_PER_ROUND).fill(null),
		pending: null,
		discard: []
	}
}

/** Adjust a player's coin bank (never below 0). */
export function addCoins(s: PlayerCardState, delta: number): PlayerCardState {
	return { ...s, coins: Math.max(0, s.coins + delta) }
}

/**
 * Apply one level-up: the chosen lower-tier card `fromIdx` leaves the hand for
 * good (removed), `keepIdx` (a higher-tier card) enters the hand, and `itemStat`
 * gains +1 as a permanent item. Level increases by one.
 */
export function applyLevelUp(
	s: PlayerCardState,
	fromIdx: number,
	keepIdx: number,
	itemStat: StatKey
): PlayerCardState {
	if (!s.hand.includes(fromIdx)) return s
	const hand = s.hand.filter((i) => i !== fromIdx)
	if (!hand.includes(keepIdx)) hand.push(keepIdx)
	hand.sort((a, b) => a - b)
	return {
		...s,
		level: s.level + 1,
		hand,
		removed: [...s.removed, fromIdx],
		items: { ...s.items, [itemStat]: (s.items[itemStat] ?? 0) + 1 }
	}
}

/** Run endRound over every player's card state (called when a new round starts). */
export function endRoundAll(
	cards: Record<string, PlayerCardState>
): Record<string, PlayerCardState> {
	const out: Record<string, PlayerCardState> = {}
	for (const pid in cards) out[pid] = endRound(cards[pid])
	return out
}

/** Unlock the ultimate (level-8 step): no card swap, just flip the flag + level. */
export function unlockUltimate(s: PlayerCardState): PlayerCardState {
	const ult = ultimateIndex(s.hero)
	const hand = ult >= 0 && !s.hand.includes(ult) ? [...s.hand, ult].sort((a, b) => a - b) : s.hand
	return { ...s, level: s.level + 1, ultimate: true, hand }
}
