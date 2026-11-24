import { describe, it, expect } from 'vitest'
import { HEROES } from '../heroes'
import { HERO_SW, MAX_SW } from './strengths'
import { guideFor } from './guide'

describe('hero strengths and weaknesses', () => {
	it('every hero has 1–3 short ones of each', () => {
		for (const h of HEROES) {
			const sw = HERO_SW[h.id]
			expect(sw, h.id).toBeTruthy()
			for (const l of [sw.s, sw.w]) {
				expect(l.length, h.id).toBeGreaterThan(0)
				expect(l.length, h.id).toBeLessThanOrEqual(MAX_SW)
				for (const x of l) expect(x.length, `${h.id}: ${x}`).toBeLessThanOrEqual(34)
			}
		}
		expect(Object.keys(HERO_SW).sort()).toEqual(HEROES.map((h) => h.id).sort())
	})
	it('the page shows at most three, a written guide first', () => {
		const g = guideFor('arien', null)
		expect(g.strengths).toEqual(HERO_SW.arien.s)
		const w = guideFor('arien', { ...g, strengths: ['a', 'b', 'c', 'd'], weaknesses: [] })
		expect(w.strengths).toEqual(['a', 'b', 'c'])
		expect(w.weaknesses).toEqual(HERO_SW.arien.w)
	})
})
