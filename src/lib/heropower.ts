// 4★ hero powers (tested in heropower.test.ts): the rules behind each 4★ hero's own dash button. Their state lives in
// MatchState.power[pid] (shared, host-applied like every card action, so Undo / reconnects / the log just work); the
// button itself is private to its player, what it changes is public. Pure functions with no import of match.ts (it
// calls into this file): the turn facts they need come in as a `TurnCtx`.
import { heroCards } from './cards/deck'
import { basicsOf, goldsOf, silverIdx, PASS, type PlayerCardState } from './cards/cardstate'

export type Team = 'orange' | 'blue'
/** one player's power state; each hero uses its own fields */
export type PowerState = {
	/** Ignatia: the turn (round-turn key) she last flipped the tie-breaker with Chaos Incarnate (once a turn) */
	flip?: string
	/** Snorri: the rune under each turn slot I–IV (index = slot), once he has inscribed them */
	runes?: Rune[]
	/** Snorri's ultimate: the inactive rune he picked as a second active rune, for this turn (round-turn key) only */
	second?: { key: string; rune: Rune }
	/** Takahide: his teammates' swap chance for this acting card (`key:at`) has been used */
	mate?: string
	/** Takahide: Ready for War has been applied (his silver traded for all three golds) */
	war?: boolean
}
export type PowerReq = { kind: 'power'; pid: string; op: 'ignatiaFlip' | 'snorriInscribe' | 'snorriSecond' | 'takaSwap' | 'mateSwap';
	/** takaSwap: the gold card from his deck to take; mateSwap: the hand / discard card to swap in */
	idx?: number
	/** mateSwap: where the swapped-in card comes from */
	src?: 'hand' | 'discard'
	/** snorriInscribe: the four runes in slot order I–IV */
	order?: Rune[]
	/** snorriSecond: the second rune, or null to clear it */
	rune?: Rune | null
	/** the host fixing another player's runes / gold */
	target?: string }
/** what the engine knows about the turn in play */
export type TurnCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; tieBreaker: Team; revealed: boolean
	/** each player's team (for "a friendly hero") */
	teams?: Record<string, Team | null> }
type S = { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState>; effects?: { pid: string; hero: string; idx: number }[]; host?: string }

/** heroes with their own dash button */
export const POWER_HEROES = ['ignatia', 'snorri', 'takahide']
export const hasPower = (hero: string | undefined | null) => !!hero && POWER_HEROES.includes(hero)

// ── Ignatia ──
const silverOf = (hero: string) => heroCards(hero).findIndex((c) => c.color === 'SILVER' && !c.handicapped)
/** both halves of her cards apply: her silver's effect (Equilibrium) has been switched on — Activate effect on the
 *  played card, confirmed — and hasn't run out yet (playing the silver alone doesn't count: she may hold her action).
 *  It ends with the effect itself (This round = at the round's end). */
export const equilibrium = (s: S, pid: string) => {
	const silver = silverOf('ignatia')
	return silver >= 0 && (s.effects ?? []).some((e) => e.pid === pid && e.hero === 'ignatia' && e.idx === silver)
}
/** Chaos Incarnate: on her own acting turn, with the ultimate, once a turn */
export function canFlip(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'ignatia' && cs.ultimate && ctx.revealed && ctx.order[ctx.at] === pid && s.power?.[pid]?.flip !== ctx.key
}
export const flipUsed = (s: S, pid: string, ctx: TurnCtx) => s.power?.[pid]?.flip === ctx.key

// ── Snorri ──
// Inscribe the Runes (his silver): four rune markers, one under each turn slot; the rune under the slot of the turn in
// play is ACTIVE. They stay through round ends and his defeat (the card says so), and move only when he plays the
// silver again (or the host fixes them). Rune Mastery (ultimate): each action, one INACTIVE rune counts as a second
// active rune — picked on his own acting turn, gone when the turn ends.
export const RUNES = ['axe', 'bird', 'anvil', 'horn'] as const
export type Rune = (typeof RUNES)[number]
export const RUNE_NAME: Record<Rune, string> = { axe: 'Axe', bird: 'Bird', anvil: 'Anvil', horn: 'Horn' }
const ROMAN = ['I', 'II', 'III', 'IV']
/** a valid arrangement: each of the four runes exactly once */
export const isRuneOrder = (o: unknown): o is Rune[] => Array.isArray(o) && o.length === 4 && RUNES.every((r) => o.includes(r))
export const runesOf = (s: S, pid: string): Rune[] | null => { const r = s.power?.[pid]?.runes; return isRuneOrder(r) ? r : null }
/** the rune under the slot of this turn (null before the first Inscribe) */
export const activeRune = (s: S, pid: string, turnIdx: number): Rune | null => runesOf(s, pid)?.[turnIdx] ?? null
/** Rune Mastery's pick for this turn, if any */
export const secondRune = (s: S, pid: string, ctx: TurnCtx): Rune | null => { const x = s.power?.[pid]?.second; return x && x.key === ctx.key ? x.rune : null }
/** he may (re)arrange the runes: his silver is the card acting now (his own acting turn, after the reveal) */
export function canInscribe(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'snorri' && ctx.revealed && ctx.order[ctx.at] === pid && cs.pending != null && cs.pending === silverIdx('snorri')
}
/** Rune Mastery: the ultimate, runes inscribed, his own acting turn */
export function canSecond(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'snorri' && cs.ultimate && !!runesOf(s, pid) && ctx.revealed && ctx.order[ctx.at] === pid
}
/** the log's words for an arrangement */
export const runeLine = (o: Rune[]) => o.map((r, i) => `${ROMAN[i]} ${RUNE_NAME[r]}`).join(' · ')

// ── Takahide ──
// His gold cards: Butterfly starts in his hand, Sting and Tiger in his deck. Playing any of them, then (or with Bushido,
// his silver) he may swap his gold for another from his deck: the new card takes the old one's place — in this turn's
// slot face up after a gold, or wherever the old one was with Bushido (face down if it was already played or
// discarded: only he knows which). Ready for War (ultimate): the silver back to the deck, all three golds in hand.
// Some red cards let ONE teammate whose card hasn't acted yet swap it for a hand card (Hold my Saké: or a discard).
const TAKA = 'takahide'
/** the gold cards he holds now (one; all three after Ready for War) and those still in his deck */
export const heldGolds = (cs: PlayerCardState) => basicsOf(cs).filter((i) => goldsOf(cs.hero).includes(i))
export const deckGolds = (cs: PlayerCardState) => goldsOf(cs.hero).filter((i) => !basicsOf(cs).includes(i))
/** where a card lies now */
export type Spot = { at: 'hand' } | { at: 'pending' } | { at: 'turn'; t: number } | { at: 'discard' } | { at: 'deck' }
export function spotOf(cs: PlayerCardState, idx: number): Spot {
	if (cs.hand.includes(idx)) return { at: 'hand' }
	if (cs.pending === idx) return { at: 'pending' }
	const t = cs.turns.indexOf(idx)
	if (t >= 0) return { at: 'turn', t }
	if (cs.discard.includes(idx)) return { at: 'discard' }
	return { at: 'deck' }
}
/** what kind of swap he may make now: 'gold' = his gold is the card acting (the new one takes its slot, face up);
 *  'bushido' = his silver is acting (his gold, wherever it is); null = none */
export function takaSwapKind(s: S, pid: string, ctx: TurnCtx): 'gold' | 'bushido' | null {
	const cs = s.cards?.[pid]
	if (!cs || cs.hero !== TAKA || !ctx.revealed || ctx.order[ctx.at] !== pid || !deckGolds(cs).length || cs.pending == null) return null
	if (heldGolds(cs).includes(cs.pending)) return 'gold'
	if (cs.pending === silverIdx(TAKA) && basicsOf(cs).includes(cs.pending)) return 'bushido'
	return null
}
/** swap the gold card `from` (held) for `to` (from his deck), the new one taking the old one's place */
function swapGold(cs: PlayerCardState, from: number, to: number, faceDown: boolean): PlayerCardState {
	const sp = spotOf(cs, from)
	const basics = basicsOf(cs).map((i) => (i === from ? to : i))
	const hidden = (cs.hidden ?? []).filter((i) => i !== from)
	const put = (x: number) => (x === from ? to : x)
	const next: PlayerCardState = { ...cs, basics, hidden: faceDown && (sp.at === 'turn' || sp.at === 'discard') ? [...hidden, to] : hidden }
	if (sp.at === 'hand') next.hand = cs.hand.map(put).sort((a, b) => a - b)
	else if (sp.at === 'pending') next.pending = to
	else if (sp.at === 'turn') next.turns = cs.turns.map((x) => (x === from ? to : x))
	else if (sp.at === 'discard') next.discard = cs.discard.map(put)
	return next
}
/** the card acting now offers his teammates a swap (Set an Example · Lead from the Front · Hold my Saké) */
const offerOf = (cs: PlayerCardState | undefined): 'hand' | 'both' | null => {
	const c = cs && cs.hero === TAKA && cs.pending != null && cs.pending >= 0 ? heroCards(TAKA)[cs.pending] : null
	if (!c || !/may\s+swap\s+their\s+unresolved\s+card/i.test(c.description)) return null
	return /or\s+in\s+their\s+discard/i.test(c.description) ? 'both' : 'hand'
}
/** the Takahide offering a teammate of `pid` a swap now, and from where (null = no offer) */
export function mateOffer(s: S, pid: string, ctx: TurnCtx): { by: string; from: 'hand' | 'both' } | null {
	if (!ctx.revealed) return null
	const by = ctx.order[ctx.at]
	if (!by || by === pid) return null
	const from = offerOf(s.cards?.[by])
	if (!from || s.power?.[by]?.mate === `${ctx.key}:${ctx.at}`) return null
	const team = ctx.teams?.[pid]
	if (!team || ctx.teams?.[by] !== team) return null
	// their card is face up in this turn's order and hasn't acted yet
	const k = ctx.order.indexOf(pid)
	const mine = s.cards?.[pid]?.pending
	if (k <= ctx.at || mine == null || mine === PASS) return null
	return { by, from }
}
/** Ready for War: once his ultimate is on, the silver goes back to the deck and every gold comes into his hand (and the
 *  other way round if the ultimate is taken back). The new card state, or null when nothing changes. */
export function readyForWar(cs: PlayerCardState, applied: boolean): PlayerCardState | null {
	if (cs.hero !== TAKA || cs.ultimate === applied) return null
	const silver = silverIdx(TAKA), golds = goldsOf(TAKA)
	const strip = (x: PlayerCardState, out: number[]) => ({ ...x, hand: x.hand.filter((i) => !out.includes(i)), discard: x.discard.filter((i) => !out.includes(i)),
		turns: x.turns.map((i) => (i != null && out.includes(i) ? null : i)), pending: x.pending != null && out.includes(x.pending) ? PASS : x.pending, hidden: (x.hidden ?? []).filter((i) => !out.includes(i)) })
	if (cs.ultimate) {
		const add = deckGolds(cs)
		const x = strip(cs, [silver])
		return { ...x, basics: [...golds], hand: [...x.hand, ...add].sort((a, b) => a - b) }
	}
	// the ultimate was taken back: keep the gold he played first (else the lowest), the silver returns to his hand
	const keep = golds.find((g) => spotOf(cs, g).at !== 'hand' && spotOf(cs, g).at !== 'deck') ?? golds[0]
	const x = strip(cs, golds.filter((g) => g !== keep))
	return { ...x, basics: [keep, silver], hand: [...x.hand, silver].sort((a, b) => a - b) }
}

/** the host applies a power request: the patch (empty = refused) */
export function applyPower(s: S & { tieTurn?: { key: string; coin: Team } | null; acting?: { key: string; idx: number; done?: string[]; pin?: string[] } | null }, req: PowerReq, ctx: TurnCtx) {
	if (req.op === 'takaSwap') {
		const who = req.target ?? req.pid
		const cs = s.cards?.[who]
		const byHost = req.pid === s.host && req.target != null
		if (!cs || cs.hero !== TAKA || req.idx == null || !deckGolds(cs).includes(req.idx)) return {}
		const kind = byHost ? null : who === req.pid ? takaSwapKind(s, who, ctx) : null
		if (!byHost && !kind) return {}
		// after a gold: that gold (this turn's card). Bushido / the host: his gold, wherever it is
		const from = kind === 'gold' ? (cs.pending as number) : heldGolds(cs)[0]
		if (from == null) return {}
		return { cards: { ...s.cards, [who]: swapGold(cs, from, req.idx, kind !== 'gold') } }
	}
	if (req.op === 'mateSwap') {
		const off = mateOffer(s, req.pid, ctx), cs = s.cards?.[req.pid]
		if (!off || !cs || req.idx == null || cs.pending == null || cs.pending < 0) return {}
		const fromDisc = req.src === 'discard'
		if (fromDisc ? off.from !== 'both' || !cs.discard.includes(req.idx) : !cs.hand.includes(req.idx)) return {}
		const old = cs.pending
		const next: PlayerCardState = fromDisc
			? { ...cs, pending: req.idx, discard: [...cs.discard.filter((i) => i !== req.idx), old] }
			: { ...cs, pending: req.idx, hand: [...cs.hand.filter((i) => i !== req.idx), old].sort((a, b) => a - b) }
		// the cards that acted and the one acting keep their places, whatever the new initiative
		const pin = ctx.order.slice(0, ctx.at + 1)
		return {
			cards: { ...s.cards, [req.pid]: next },
			power: { ...s.power, [off.by]: { ...s.power?.[off.by], mate: `${ctx.key}:${ctx.at}` } },
			acting: { key: ctx.key, idx: ctx.at, done: s.acting?.key === ctx.key ? s.acting.done : undefined, pin }
		}
	}
	if (req.op === 'snorriInscribe') {
		const who = req.target ?? req.pid
		const byHost = req.pid === s.host && req.target != null
		if (!isRuneOrder(req.order) || s.cards?.[who]?.hero !== 'snorri') return {}
		if (!byHost && (who !== req.pid || !canInscribe(s, who, ctx))) return {}
		const prev = s.power?.[who] ?? {}
		// a second rune that is now the active one is no longer "inactive": drop it
		const second = prev.second && prev.second.key === ctx.key && req.order[ctx.turnIdx] !== prev.second.rune ? prev.second : undefined
		return { power: { ...s.power, [who]: { ...prev, runes: [...req.order], second } } }
	}
	if (req.op === 'snorriSecond') {
		if (!canSecond(s, req.pid, ctx)) return {}
		const prev = s.power?.[req.pid] ?? {}
		if (req.rune == null) return prev.second ? { power: { ...s.power, [req.pid]: { ...prev, second: undefined } } } : {}
		if (!RUNES.includes(req.rune) || activeRune(s, req.pid, ctx.turnIdx) === req.rune) return {}
		return { power: { ...s.power, [req.pid]: { ...prev, second: { key: ctx.key, rune: req.rune } } } }
	}
	if (req.op === 'ignatiaFlip') {
		if (!canFlip(s, req.pid, ctx)) return {}
		const other: Team = ctx.tieBreaker === 'orange' ? 'blue' : 'orange'
		return {
			tieBreaker: other,
			// the order of this turn keeps the coin it began with (a flip changes her card text, not who goes next)
			tieTurn: s.tieTurn?.key === ctx.key ? s.tieTurn : { key: ctx.key, coin: ctx.tieBreaker },
			power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], flip: ctx.key } }
		}
	}
	return {}
}

/** after any change: what follows by itself (Takahide's Ready for War as his ultimate comes on / off). Returns a
 *  patch (cards / power) or null */
export function syncPowers(s: S, _ctx: TurnCtx): { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState> } | null {
	let cards: Record<string, PlayerCardState> | undefined, power: Record<string, PowerState> | undefined
	for (const pid in s.cards ?? {}) {
		const cs = s.cards![pid]
		if (cs.hero !== TAKA) continue
		const applied = !!s.power?.[pid]?.war
		const next = readyForWar(cs, applied)
		if (!next) continue
		cards = { ...(cards ?? s.cards), [pid]: next }
		power = { ...(power ?? s.power), [pid]: { ...s.power?.[pid], war: cs.ultimate } }
	}
	return cards ? { cards, power } : null
}
