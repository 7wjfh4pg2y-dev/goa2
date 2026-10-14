import { describe, it, expect } from 'vitest'
import { GLOBAL, globalWin, vsWins, sharePct } from './globalstats'
import { HEROES } from './heroes'

describe('global hero stats', () => {
	it('has every hero, and every entry adds up', () => {
		const ids = new Set(HEROES.map((h) => h.id))
		expect(Object.keys(GLOBAL).sort()).toEqual([...ids].sort())
		for (const [id, g] of Object.entries(GLOBAL)) {
			expect(g.games.reduce((a, b) => a + b, 0), id).toBe(g.typed)
			for (let k = 0; k < 3; k++) expect(g.won[k], id).toBeLessThanOrEqual(g.games[k])
			expect(g.won.reduce((a, b) => a + b, 0), id).toBeLessThanOrEqual(g.wins)
			expect(g.ate[1], id).toBeLessThanOrEqual(g.ate[2])
			for (const v of [...g.mates, ...g.beats, ...g.countered]) {
				expect(ids.has(v[0]), `${id} → ${v[0]}`).toBe(true)
				expect(v[0], id).not.toBe(id)
			}
			expect(g.mates.length + g.beats.length + g.countered.length, id).toBe(9)
		}
		expect(globalWin(GLOBAL.tigerclaw)).toBeCloseTo(50.7, 1)
		expect(vsWins(['x', 83, 6])).toBe(5)
		expect(sharePct([10, 11, 10])).toEqual([32, 36, 32])
		expect(sharePct([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
		expect(sharePct([0, 0, 0])).toEqual([0, 0, 0])
	})
})
