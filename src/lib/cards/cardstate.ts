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
	/** Cards taken out of play (open information — every player can see these). */
	removed: number[]
	/**
	 * Cards fed into the level-up area: the upgrade cards you did NOT keep. They
	 * grant permanent stat growth (each card's printed item = +1 to that stat).
	 * Hidden from opponents — only the resulting stat growth is public.
	 */
	upgrade: number[]
	/** Extra manual +N per stat (rarely needed; stat growth is mostly derived). */
	items: Partial<Record<StatKey, number>>
	/** The ultimate is a passive (level 8) — flagged here, never held in hand. */
	ultimate: boolean
	/** Cards picked in this round's level-up phase: they can still be swapped for
	 *  their twin until the round ends; cleared (= locked in) at the next round. */
	roundPicks?: number[]
	/** How many of this round's levels were paid for with coins (refunded if undone). */
	roundPaid?: number
}

/** A place a card can live in a player's collection. */
export type CardZone = 'hand' | 'removed' | 'upgrade' | 'deck'

/** Card "item" symbol → the stat it grows. */
const ITEM_STAT: Record<string, StatKey> = {
	ATTACK: 'atk',
	DEFENSE: 'def',
	INITIATIVE: 'init',
	MOVEMENT: 'move',
	RANGE: 'range',
	AREA: 'radius'
}

/** Permanent stat growth: manual items plus +1 per card sitting in the upgrade area. */
export function statDeltas(s: PlayerCardState): Partial<Record<StatKey, number>> {
	const out: Partial<Record<StatKey, number>> = { ...s.items }
	const cards = heroCards(s.hero)
	for (const idx of s.upgrade) {
		const item = cards[idx]?.item
		const k = item ? ITEM_STAT[item] : undefined
		if (k) out[k] = (out[k] ?? 0) + 1
	}
	return out
}

/** Level = base 1, +1 per upgrade card fed in, +1 once the ultimate is unlocked. */
export function levelOf(s: PlayerCardState): number {
	return 1 + s.upgrade.length + (s.ultimate ? 1 : 0)
}

/**
 * Move a card between zones (manual deck management). The card leaves every pile
 * it might be in and lands in the target; 'deck' means "not held anywhere" (back
 * in the draw pile). The basics/turns/discard/pending piles are left untouched.
 */
export function moveCard(s: PlayerCardState, idx: number, to: CardZone): PlayerCardState {
	const hand = s.hand.filter((i) => i !== idx)
	const removed = s.removed.filter((i) => i !== idx)
	const upgrade = s.upgrade.filter((i) => i !== idx)
	if (to === 'hand') hand.push(idx)
	else if (to === 'removed') removed.push(idx)
	else if (to === 'upgrade') upgrade.push(idx)
	hand.sort((a, b) => a - b)
	return { ...s, hand, removed, upgrade }
}

const isColor = (c: string, ...want: string[]) => want.includes(c)

/**
 * Level-up pick: take a Tier II/III card into hand. Its twin (the other card of
 * the same colour and tier) goes to the upgrade area as an item, and the lower
 * tier card of that colour you held is removed — wherever it currently sits
 * (hand, a played turn, the discard, or face-down). One atomic step, so a
 * level-up can never be half-applied.
 */
export function takeUpgrade(s: PlayerCardState, idx: number): PlayerCardState {
	const cards = heroCards(s.hero)
	const c = cards[idx]
	if (!c) return s
	const lvl = c.level ?? 1
	if (!isColor(c.color, 'RED', 'BLUE', 'GREEN') || lvl < 2) return moveCard(s, idx, 'hand')
	const older = (i: number | null): i is number => i != null && i !== idx && cards[i]?.color === c.color && (cards[i]?.level ?? 1) < lvl
	const held = [...s.hand, ...s.discard, ...s.turns, s.pending].filter(older)
	let next: PlayerCardState = {
		...s,
		discard: s.discard.filter((i) => !held.includes(i)),
		turns: s.turns.map((i) => (i != null && held.includes(i) ? null : i)),
		pending: s.pending != null && held.includes(s.pending) ? null : s.pending
	}
	next = moveCard(next, idx, 'hand')
	for (const o of held) next = moveCard(next, o, 'removed')
	const twin = cards.findIndex((x, i) => i !== idx && !x.handicapped && x.color === c.color && (x.level ?? 1) === lvl)
	if (twin >= 0 && !next.hand.includes(twin) && !next.removed.includes(twin)) next = moveCard(next, twin, 'upgrade')
	return next
}

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
		upgrade: [],
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

/**
 * Commit a card for the current turn: it leaves the hand immediately and sits
 * face-down as `pending` (placed on the mat), so the hand shows only the cards
 * you have left — just like the physical game.
 */
export function commitCard(s: PlayerCardState, idx: number): PlayerCardState {
	if (!s.hand.includes(idx)) return s
	return { ...s, hand: s.hand.filter((i) => i !== idx), pending: idx }
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

/** Take back the face-down card before reveal (returns it to hand). */
export function uncommit(s: PlayerCardState): PlayerCardState {
	if (s.pending == null) return s
	if (s.pending === PASS) return { ...s, pending: null }
	return { ...s, hand: [...s.hand, s.pending].sort((a, b) => a - b), pending: null }
}

/** Reveal: lock the pending card into its turn slot (it already left the hand at commit). */
export function revealTurn(s: PlayerCardState, turn: number): PlayerCardState {
	if (s.pending == null || turn < 0 || turn >= TURNS_PER_ROUND) return s
	const turns = s.turns.slice()
	turns[turn] = s.pending
	return { ...s, turns, pending: null }
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
	if (s.pending != null && s.pending !== PASS) back.push(s.pending)
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

/** Unlock the ultimate (level-8 step): a passive, so it only flips the flag + level. */
export function unlockUltimate(s: PlayerCardState): PlayerCardState {
	return { ...s, level: s.level + 1, ultimate: true, hand: s.hand.filter((i) => i !== ultimateIndex(s.hero)) }
}

// ── level-up rules ────────────────────────────────────────────────────────────
// Level-ups happen in the end-of-round phase after the minion battle and are
// forced: while you can afford the next level you must take it. One card of each
// colour is held at a time. Levels 2–4 each take a Tier II of a colour that is
// still on Tier I; levels 5–7 each take a Tier III of a colour on Tier II (so no
// Tier III before all three Tier IIs); level 8 unlocks the ultimate. A pick puts
// the card in hand, its twin under the board as an item, and removes the card it
// replaces. Picks made this round can be swapped for their twin until the round
// ends. A hero who couldn't level up at all gets a pity coin.

export const MAX_LEVEL = 8
export const COLOURS = ['RED', 'BLUE', 'GREEN'] as const

/** Coins it costs to go from `lvl` to lvl + 1. */
export const levelCost = (lvl: number) => lvl

/** The tier the next level-up takes: 2 (levels 2–4), 3 (levels 5–7), 4 = the ultimate, 0 = maxed. */
export function pickTier(s: PlayerCardState): number {
	const n = levelOf(s) + 1
	return n <= 4 ? 2 : n <= 7 ? 3 : n === MAX_LEVEL ? 4 : 0
}

const heldList = (s: PlayerCardState) =>
	[...s.hand, ...s.discard, ...s.turns, s.pending].filter((i): i is number => i != null && i >= 0)

/** Highest tier held (hand, played, discarded or face down) in a colour; 1 if none. */
export function tierIn(s: PlayerCardState, color: string): number {
	const cards = heroCards(s.hero)
	return Math.max(1, ...heldList(s).filter((i) => cards[i]?.color === color).map((i) => cards[i]?.level ?? 1))
}

/** The other card of the same colour and tier (the one that becomes the item), or -1. */
export function twinOf(hero: string, idx: number): number {
	const cards = heroCards(hero)
	const c = cards[idx]
	if (!c || !isColor(c.color, ...COLOURS) || (c.level ?? 1) < 2) return -1
	return cards.findIndex((x, i) => i !== idx && !x.handicapped && x.color === c.color && (x.level ?? 1) === (c.level ?? 1))
}

/** Is `idx` a legal pick for the next level (ignoring coins)? */
export function canPick(s: PlayerCardState, idx: number): boolean {
	const t = pickTier(s)
	const c = heroCards(s.hero)[idx]
	if (!t || !c || c.handicapped) return false
	if (t === 4) return c.color === 'PURPLE' && !s.ultimate && COLOURS.every((col) => tierIn(s, col) >= 3)
	return isColor(c.color, ...COLOURS) && (c.level ?? 1) === t && tierIn(s, c.color) === t - 1 &&
		!s.removed.includes(idx) && !s.upgrade.includes(idx) && !heldList(s).includes(idx)
}

/** Can this hero pay for the next level? */
export const canAfford = (s: PlayerCardState) => pickTier(s) > 0 && s.coins >= levelCost(levelOf(s))

/** Forced level-up: affordable and there is a legal pick. */
export function mustLevel(s: PlayerCardState): boolean {
	return canAfford(s) && heroCards(s.hero).some((_, i) => canPick(s, i))
}

/** Level up by picking `idx` (a Tier II/III card, or the ultimate at level 8); pays the cost. */
export function levelUp(s: PlayerCardState, idx: number): PlayerCardState {
	if (!canAfford(s) || !canPick(s, idx)) return s
	const cost = levelCost(levelOf(s))
	const next = heroCards(s.hero)[idx]?.color === 'PURPLE' ? { ...s, ultimate: true } : takeUpgrade(s, idx)
	return { ...next, coins: s.coins - cost, level: levelOf(next), roundPicks: [...(s.roundPicks ?? []), idx], roundPaid: (s.roundPaid ?? 0) + 1 }
}

/** The pick (made this round, still held) whose twin is `idx`, if `idx` can be swapped in. */
export function swapSource(s: PlayerCardState, idx: number): number | null {
	if (!s.upgrade.includes(idx)) return null
	const p = (s.roundPicks ?? []).find((q) => twinOf(s.hero, q) === idx)
	return p != null && heldList(s).includes(p) ? p : null
}

/** Swap a pick made this round for its twin: the twin comes to hand, the pick becomes the item. */
export function swapPick(s: PlayerCardState, idx: number): PlayerCardState {
	const p = swapSource(s, idx)
	if (p == null) return s
	let next: PlayerCardState = {
		...s,
		discard: s.discard.filter((i) => i !== p),
		turns: s.turns.map((i) => (i === p ? null : i)),
		pending: s.pending === p ? null : s.pending
	}
	next = moveCard(moveCard(next, idx, 'hand'), p, 'upgrade')
	return { ...next, roundPicks: (s.roundPicks ?? []).map((q) => (q === p ? idx : q)) }
}

/** Round end after the level-up phase: lock in this round's picks; no level-up = a pity coin. */
export function closeLevelPhase(s: PlayerCardState): PlayerCardState {
	const leveled = (s.roundPicks ?? []).length > 0
	return { ...s, coins: leveled ? s.coins : s.coins + 1, roundPicks: [], roundPaid: 0 }
}

/** Any round end: this round's choices lock in. */
export function lockPicks(s: PlayerCardState): PlayerCardState {
	return { ...s, roundPicks: [], roundPaid: 0 }
}

/** Was this card (or its twin) chosen this round? Such choices can still change. */
export function pickedThisRound(s: PlayerCardState, idx: number): boolean {
	return (s.roundPicks ?? []).some((p) => p === idx || twinOf(s.hero, p) === idx)
}

/** Higher-tier cards of a colour that are chosen (held or under the board as items). */
function chosenAbove(s: PlayerCardState, color: string, tier: number): number[] {
	const held = heldList(s)
	return heroCards(s.hero)
		.map((c, i) => ({ c, i }))
		.filter(({ c, i }) => c.color === color && (c.level ?? 1) > tier && (held.includes(i) || s.upgrade.includes(i)))
		.map(({ i }) => i)
}

/** Drop a card from every pile it may sit in (hand, played slot, discard, face down, zones). */
const lift = (s: PlayerCardState, i: number): PlayerCardState => ({
	...s,
	discard: s.discard.filter((j) => j !== i),
	turns: s.turns.map((j) => (j === i ? null : j)),
	pending: s.pending === i ? null : s.pending
})

/**
 * Manual moves a card may make (the deck view's Hand / Upgrade / Remove):
 * - basics and the ultimate never move;
 * - Tier I: out of the hand only to Removed, and back to the hand;
 * - a removed card back to the hand = undo that colour's level-ups (only this round's);
 * - Tier II / III, not chosen yet: to the hand or to upgrades (in order: II after I,
 *   III once every colour is on II);
 * - Tier II / III chosen this round: swap between hand and upgrades; chosen in an
 *   earlier round: locked.
 */
export function allowedMoves(s: PlayerCardState, idx: number): CardZone[] {
	const c = heroCards(s.hero)[idx]
	if (!c || !isColor(c.color, ...COLOURS)) return []
	const t = c.level ?? 1
	const held = heldList(s)
	if (s.removed.includes(idx)) return chosenAbove(s, c.color, t).every((i) => pickedThisRound(s, i)) ? ['hand'] : []
	if (t === 1) return held.includes(idx) ? ['removed'] : ['hand']
	const tw = twinOf(s.hero, idx)
	const inPlay = (i: number) => i >= 0 && (held.includes(i) || s.upgrade.includes(i))
	if (!inPlay(idx) && !inPlay(tw)) {
		const inOrder = tierIn(s, c.color) === t - 1 && (t < 3 || COLOURS.every((col) => tierIn(s, col) >= 2))
		return inOrder ? ['hand', 'upgrade'] : []
	}
	if (!pickedThisRound(s, idx)) return []
	return held.includes(idx) ? ['upgrade'] : s.upgrade.includes(idx) ? ['hand'] : []
}

/**
 * Apply a manual move if it's allowed, keeping one card per colour in hand:
 * - a Tier II/III to the hand: its twin goes to upgrades, the lower card is removed;
 * - a Tier II/III to upgrades: its twin comes to the hand instead (same pick, other path);
 * - a removed card back to the hand: the higher tiers of that colour (hand + upgrade)
 *   go back to the deck — that colour's level-ups this round are undone (coins refunded).
 */
export function manualMove(s: PlayerCardState, idx: number, to: CardZone): PlayerCardState {
	if (!allowedMoves(s, idx).includes(to)) return s
	const c = heroCards(s.hero)[idx]
	const t = c?.level ?? 1
	const tw = twinOf(s.hero, idx)
	const picks = s.roundPicks ?? []
	// undo: the higher tiers of this colour return to the deck
	if (s.removed.includes(idx)) {
		const above = chosenAbove(s, c.color, t)
		let next: PlayerCardState = s
		for (const i of above) next = moveCard(lift(next, i), i, 'deck')
		next = { ...next, roundPicks: picks.filter((p) => !above.includes(p)) }
		// refund the top levels that were paid for
		let paid = s.roundPaid ?? 0, coins = next.coins
		for (let L = levelOf(s) - 1; L >= levelOf(next) && paid > 0; L--, paid--) coins += levelCost(L)
		next = { ...next, coins, roundPaid: paid }
		next = moveCard(next, idx, 'hand')
		return { ...next, level: levelOf(next) }
	}
	if (t === 1) return moveCard(to === 'removed' ? lift(s, idx) : s, idx, to)
	const held = heldList(s)
	// a pick made this round: swap to the other path
	if (held.includes(tw) || (to === 'upgrade' && held.includes(idx))) {
		const up = to === 'upgrade' ? idx : tw, down = to === 'upgrade' ? tw : idx
		const next = moveCard(moveCard(lift(s, up), up, 'upgrade'), down, 'hand')
		return { ...next, roundPicks: picks.map((p) => (p === up ? down : p)) }
	}
	// a fresh pick from the deck
	const pick = to === 'hand' ? idx : tw
	let next = to === 'upgrade' ? moveCard(s, idx, 'upgrade') : s
	next = pick >= 0 ? takeUpgrade(next, pick) : next
	return { ...next, level: levelOf(next), roundPicks: pick >= 0 ? [...picks, pick] : picks }
}
