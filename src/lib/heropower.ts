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
}
export type PowerReq = { kind: 'power'; pid: string; op: 'ignatiaFlip' }
/** what the engine knows about the turn in play */
export type TurnCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; tieBreaker: Team; revealed: boolean }
type S = { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState>; effects?: { pid: string; hero: string; idx: number }[] }

/** heroes with their own dash button */
export const POWER_HEROES = ['ignatia']
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

/** after any change: mark what took hold (no 4★ power needs it yet). Returns the power map to write, or null */
export function syncPowers(_s: S, _ctx: TurnCtx): Record<string, PowerState> | null {
	return null
}
