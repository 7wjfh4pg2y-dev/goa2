import { describe, it, expect } from 'vitest'
import { replayOf, stepLabel } from './replay'

// a made-up 1 v 1: Zara (Atlanteans, arien) and Priya (Titans, brogan) on a tiny strip of map
const zones = { '1_1': 'Orange Base', '2_1': 'Center', '3_1': 'Center', '4_1': 'Blue Jungle', '5_1': 'Blue Base' }
const pcs = { a: { k: 'hero', tm: 'orange', h: 'arien' }, b: { k: 'hero', tm: 'blue', h: 'brogan' }, m1: { k: 'minion', tm: 'blue', ro: 'melee' }, m2: { k: 'minion', tm: 'orange', ro: 'heavy' }, n1: { k: 'minion', tm: 'orange', ro: 'melee' }, n2: { k: 'minion', tm: 'blue', ro: 'melee' }, n3: { k: 'minion', tm: 'orange', ro: 'melee' } }
const shot = (r: number, t: number, i: number, pid: string | null, card: number | null, at: number, p: Record<string, string>) => ({ r, t, i, pid, card, at, p })
const data = () => ({
	seats: 2, wavesMax: 3, lifeMax: 5, evv: 3, zones, pcs,
	players: { a: { name: 'Zara', hero: 'arien', seat: 0, team: 'orange' }, b: { name: 'Priya', hero: 'brogan', seat: 1, team: 'blue' } },
	turns: [
		{ round: 1, turn: 1, lane: 1, waves: 3, life: { orange: 5, blue: 4 }, cards: { a: { lv: 1, coins: 6, played: 0 }, b: { lv: 1, coins: 0, played: 1 } } },
		{ round: 1, turn: 2, lane: 0, waves: 2, life: { orange: 5, blue: 4 }, cards: { a: { lv: 1, coins: 6, played: 2 }, b: { lv: 1, coins: 0, played: 2 } } }
	],
	shots: [
		shot(1, 1, -1, null, null, 100, { a: '1_1', b: '5_1', m1: '3_1', m2: '2_1' }),
		shot(1, 1, 0, 'a', 0, 200, { a: '4_1', b: '5_1', m2: '2_1' }),
		shot(1, 1, 1, 'b', 1, 300, { a: '4_1', m2: '2_1' }),
		shot(1, 2, -1, null, null, 400, { a: '4_1', b: '5_1', m2: '2_1' }),
		shot(1, 2, 0, 'b', 2, 500, { a: '4_1', b: '4_1', m2: '2_1', n1: '2_1', n2: '3_1', n3: '1_1' }),
		shot(1, 2, 90, null, null, 600, { a: '4_1', b: '4_1', n1: '2_1', n2: '3_1', n3: '1_1' })
	],
	ev: [
		{ k: 'minion', id: 'm1', r: 1, t: 1, i: 0, by: 'a', role: 'melee', team: 'blue' },
		{ k: 'clash', id: 'c1', r: 1, t: 1, i: 1, kind: 'attack', by: 'a', v: 'b', out: 'died', disc: false },
		{ k: 'hero', id: 'h1', r: 1, t: 1, i: 1, by: 'a', v: 'b', a: [], c: 1, ac: 0, l: 1, team: 'blue' }
	],
	log: [], notes: []
})

describe('replay', () => {
	it('one step per segment, with moves, arrivals, departures and the turn order', () => {
		const rp = replayOf(data())!
		expect(rp.steps.map((s) => s.kind)).toEqual(['plan', 'act', 'act', 'plan', 'act', 'battle'])
		expect(rp.rounds).toEqual([1])
		const dive = rp.steps[1]
		expect(dive.moved).toEqual([{ id: 'a', from: '1_1', to: '4_1' }])
		expect(dive.gone).toEqual([{ id: 'm1', hex: '3_1' }])
		expect(dive.card?.pid).toBe('a')
		expect(stepLabel(dive)).toBe('Round 1 · Turn 1 · Card 1 of 2')
		expect(dive.order.map((o) => o.pid)).toEqual(['a', 'b'])
		const kill = rp.steps[2]
		expect(kill.fell).toEqual([{ id: 'b', hex: '5_1' }])
		expect(kill.clashes).toEqual([{ by: 'a', v: 'b', out: 'died', kind: 'attack' }])
		expect(kill.items.map((x) => x.kind)).toContain('kill')
		expect(rp.steps[3].came).toEqual(['b']); expect(rp.steps[4].came.sort()).toEqual(['n1', 'n2', 'n3'])
	})
	it('the scoreboard: payouts and Life as they happen, the snapshot at the turn end, the lane once a wave came in', () => {
		const rp = replayOf(data())!
		expect(rp.steps[0].score).toMatchObject({ life: { orange: 5, blue: 5 }, waves: 3, lane: 1, coins: { a: 0, b: 0 } })
		expect(rp.steps[1].score.coins.a).toBe(2) // the minion
		expect(rp.steps[2].score).toMatchObject({ life: { orange: 5, blue: 4 }, coins: { a: 6 } }) // turn end = the snapshot
		expect(rp.steps[3].score.lane).toBe(1) // turn 2 starts from turn 1's end
		expect(rp.steps[4].score).toMatchObject({ lane: 0, waves: 2 }) // a new wave = the push happened
	})
	it('no board shots: no replay', () => {
		const d = data() as Record<string, unknown>; delete d.shots
		expect(replayOf(d)).toBeNull()
	})
})
