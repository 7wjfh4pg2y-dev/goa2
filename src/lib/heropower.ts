// 4★ hero powers (tested in heropower.test.ts): the rules behind each 4★ hero's own dash button. Their state lives in
// MatchState.power[pid] (shared, host-applied like every card action, so Undo / reconnects / the log just work); the
// button itself is private to its player, what it changes is public. Pure functions with no import of match.ts (it
// calls into this file): the turn facts they need come in as a `TurnCtx`.
import { heroCards } from './cards/deck'
import type { PlayerCardState } from './cards/cardstate'

export type Team = 'orange' | 'blue'
/** one player's power state; each hero uses its own fields */
export type PowerState = {
	/** Ignatia: the round her Equilibrium (silver) took hold — it lasts the rest of that round */
	eq?: number
	/** Ignatia: the turn (round-turn key) she last flipped the tie-breaker with Chaos Incarnate (once a turn) */
	flip?: string
}
export type PowerReq = { kind: 'power'; pid: string; op: 'ignatiaFlip' }
/** what the engine knows about the turn in play */
export type TurnCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; tieBreaker: Team; revealed: boolean }
type S = { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState> }

/** heroes with their own dash button */
export const POWER_HEROES = ['ignatia']
export const hasPower = (hero: string | undefined | null) => !!hero && POWER_HEROES.includes(hero)

// ── Ignatia ──
const silverOf = (hero: string) => heroCards(hero).findIndex((c) => c.color === 'SILVER' && !c.handicapped)
/** her silver has been played and has acted this round: an earlier turn's slot, or this turn's card (still
 *  `pending` until the turn ends) once the cards are revealed and its place in the order has come */
export function equilibriumNow(cs: PlayerCardState | undefined, pid: string, ctx: TurnCtx): boolean {
	if (!cs || cs.hero !== 'ignatia') return false
	const silver = silverOf(cs.hero)
	if (silver < 0) return false
	if (cs.turns.some((c, t) => c === silver && t < ctx.turnIdx)) return true
	const k = ctx.order.indexOf(pid)
	return cs.pending === silver && ctx.revealed && k >= 0 && k <= ctx.at
}
/** both halves of her cards apply: Equilibrium is on this round */
export const equilibrium = (s: S, pid: string, round: number) => s.power?.[pid]?.eq === round
/** Chaos Incarnate: on her own acting turn, with the ultimate, once a turn */
export function canFlip(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'ignatia' && cs.ultimate && ctx.revealed && ctx.order[ctx.at] === pid && s.power?.[pid]?.flip !== ctx.key
}
export const flipUsed = (s: S, pid: string, ctx: TurnCtx) => s.power?.[pid]?.flip === ctx.key

/** the host applies a power request: the patch (empty = refused) */
export function applyPower(s: S & { tieTurn?: { key: string; coin: Team } | null }, req: PowerReq, ctx: TurnCtx) {
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

/** after any change: mark what took hold (Ignatia's Equilibrium this round). Returns the power map to write, or null */
export function syncPowers(s: S, ctx: TurnCtx): Record<string, PowerState> | null {
	let out: Record<string, PowerState> | null = null
	for (const pid in s.cards ?? {}) {
		const cs = s.cards![pid]
		if (cs.hero === 'ignatia' && s.power?.[pid]?.eq !== ctx.round && equilibriumNow(cs, pid, ctx)) {
			out ??= { ...s.power }
			out[pid] = { ...out[pid], eq: ctx.round }
		}
	}
	return out
}
