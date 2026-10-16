// 4★ hero powers (tested in heropower.test.ts): the rules behind each 4★ hero's own dash button. Their state lives in
// MatchState.power[pid] (shared, host-applied like every card action, so Undo / reconnects / the log just work); the
// button itself is private to its player, what it changes is public. Pure functions with no import of match.ts (it
// calls into this file): the turn facts they need come in as a `TurnCtx`.
import { heroCards } from './cards/deck'
import type { PlayerCardState } from './cards/cardstate'

export type Team = 'orange' | 'blue'
/** one player's power state; each hero uses its own fields */
export type PowerState = {
	/** Ignatia: the turn (round-turn key) she last flipped the tie-breaker with Chaos Incarnate (once a turn) */
	flip?: string
	/** Snorri: the rune under each turn slot I–IV (index = slot), once he has inscribed them */
	runes?: Rune[]
	/** Snorri's ultimate: the inactive rune he picked as a second active rune, for this turn (round-turn key) only */
	second?: { key: string; rune: Rune }
}
export type PowerReq = { kind: 'power'; pid: string; op: 'ignatiaFlip' | 'snorriInscribe' | 'snorriSecond';
	/** snorriInscribe: the four runes in slot order I–IV */
	order?: Rune[]
	/** snorriSecond: the second rune, or null to clear it */
	rune?: Rune | null
	/** the host fixing another player's runes */
	target?: string }
/** what the engine knows about the turn in play */
export type TurnCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; tieBreaker: Team; revealed: boolean }
type S = { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState>; effects?: { pid: string; hero: string; idx: number }[]; host?: string }

/** heroes with their own dash button */
export const POWER_HEROES = ['ignatia', 'snorri']
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
const silverIdx = (hero: string) => heroCards(hero).findIndex((c) => c.color === 'SILVER' && !c.handicapped)
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

/** the host applies a power request: the patch (empty = refused) */
export function applyPower(s: S & { tieTurn?: { key: string; coin: Team } | null }, req: PowerReq, ctx: TurnCtx) {
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

/** after any change: mark what took hold (no 4★ power needs it yet). Returns the power map to write, or null */
export function syncPowers(_s: S, _ctx: TurnCtx): Record<string, PowerState> | null {
	return null
}
