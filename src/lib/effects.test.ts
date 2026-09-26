import { describe, it, expect } from 'vitest'
import { detectDuration, endOf, expireEffects, effectLabel, type Effect } from './effects'
import { applyCardReq, type MatchState } from './match'

const fx = (id: string, dur: Effect['dur'], round: number, turn: number): Effect => ({ id, pid: 'p', hero: 'arien', idx: 0, name: id, dur, round, turn, ...endOf(dur, round, turn) })

describe('effects', () => {
	it('reads the duration from card text (bold lead-in first)', () => {
		expect(detectDuration('Attack. **This round:** You are immune')).toBe('round')
		expect(detectDuration('**Next turn:** enemy heroes')).toBe('next')
		expect(detectDuration('Move 2. **This turn:** blah, this round later')).toBe('turn')
		expect(detectDuration('if a hero discards a card this turn')).toBe('turn')
		expect(detectDuration('Attack a unit.')).toBeNull()
	})
	it('This turn ends with the turn; Next turn lasts through the next; This round to the round end', () => {
		const all = [fx('t', 'turn', 1, 2), fx('n', 'next', 1, 2), fx('r', 'round', 1, 2)]
		expect(expireEffects(all, 1, 2).map((e) => e.id)).toEqual(['n', 'r'])
		expect(expireEffects(expireEffects(all, 1, 2), 1, 3).map((e) => e.id)).toEqual(['r'])
		expect(expireEffects(all, 1, 4)).toEqual([])
	})
	it('Next turn played on the last turn is capped at the round end', () => {
		expect(endOf('next', 2, 4)).toEqual({ endRound: 2, endTurn: 4 })
	})
	it('labels a Next-turn effect as This turn once its turn arrives', () => {
		const n = fx('n', 'next', 1, 2)
		expect(effectLabel(n, 1, 2)).toBe('Next turn')
		expect(effectLabel(n, 1, 3)).toBe('This turn')
	})
	it('the turn advance expires effects', () => {
		const s = { turn: 2, round: 1, pieces: {}, cards: {}, effects: [fx('t', 'turn', 1, 2), fx('r', 'round', 1, 2)] } as unknown as MatchState
		expect(applyCardReq(s, { kind: 'advance', pid: 'p' }).effects!.map((e) => e.id)).toEqual(['r'])
	})
})
