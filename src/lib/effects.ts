// Lingering card effects ("This turn:", "Next turn:", "This round:").
//
// We don't simulate card rules. A player (or the host) switches an effect on for
// a played card; its duration is read from the card text; it lights up that card
// everywhere, shows as a chip on the player and in the HUD list, and switches
// itself off when it runs out. Pure functions so the timing rules are testable.

export type EffectDur = 'turn' | 'next' | 'round'

export interface Effect {
	id: string
	pid: string // the player whose card it is
	hero: string
	idx: number // card index into heroCards(hero)
	name: string // card name, for chips / the list / the log
	dur: EffectDur
	round: number // when it was switched on
	turn: number
	endRound: number // it ends at the END of this round/turn
	endTurn: number
}

export const TURNS = 4

export const DUR_LABEL: Record<EffectDur, string> = { turn: 'This turn', next: 'Next turn', round: 'This round' }

/** Duration named by a card's text: the first bold lead-in wins, else the first mention. */
export function detectDuration(text: string | undefined): EffectDur | null {
	if (!text) return null
	const pick = (m: RegExpMatchArray | null) => {
		const k = m?.[1]?.toLowerCase()
		return k === 'this round' ? 'round' : k === 'next turn' ? 'next' : k === 'this turn' ? 'turn' : null
	}
	return pick(text.match(/\*\*\s*(this round|next turn|this turn)/i)) ?? pick(text.match(/\b(this round|next turn|this turn)\b/i))
}

/** When an effect switched on at (round, turn) runs out. "Next turn" on the last
 *  turn of a round is capped at the round's end (the card leaves its slot then). */
export function endOf(dur: EffectDur, round: number, turn: number): { endRound: number; endTurn: number } {
	if (dur === 'round') return { endRound: round, endTurn: TURNS }
	if (dur === 'next') return { endRound: round, endTurn: Math.min(turn + 1, TURNS) }
	return { endRound: round, endTurn: turn }
}

/** Effects still live after the turn (round, turn) ends. */
export function expireEffects(effects: Effect[] | undefined, round: number, turn: number): Effect[] {
	return (effects ?? []).filter((e) => e.endRound > round || (e.endRound === round && e.endTurn > turn))
}

/** What to call it right now: a "Next turn" effect reads "This turn" once its turn arrives. */
export function effectLabel(e: Effect, round: number, turn: number): string {
	if (e.dur === 'round') return 'This round'
	if (e.dur === 'next') return e.round === round && turn <= e.turn ? 'Next turn' : 'This turn'
	return 'This turn'
}
