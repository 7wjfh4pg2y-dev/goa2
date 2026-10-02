import { describe, it, expect } from 'vitest'
import { MINION_ART } from './minionArt'

describe('the minion emblems (generated from the 3D models)', () => {
	it('has all six, each a set of closed outlines that fits inside its hex', () => {
		for (const team of ['orange', 'blue'] as const) {
			for (const role of ['melee', 'ranged', 'heavy'] as const) {
				const a = MINION_ART[team][role]
				const loops = a.d.split('Z').filter(Boolean)
				expect(loops.length).toBeGreaterThan(10)
				expect(loops.every((l) => l.startsWith('M'))).toBe(true)
				expect(a.d).not.toMatch(/NaN|Infinity/)
				const nums = a.d.match(/-?\d+(\.\d+)?/g)!.map(Number)
				expect(Math.max(...nums.map(Math.abs))).toBeLessThan(87) // inside the hex (its flat sides are 86.6 away)
				expect(a.r).toBeGreaterThan(40)
				expect(a.r).toBeLessThan(87)
			}
		}
	})
})
