import { describe, it, expect } from 'vitest'
import { COMICS, COMIC_TIMING, pickComic, type ComicMoment } from './comic'

describe('comic bursts', () => {
	it('has three bursts for each of the four main moments and the two poofs and one for each extra', () => {
		for (const m of ['attacked', 'attacks', 'killHero', 'killMinion', 'poofIn', 'poofOut'] as ComicMoment[]) expect(COMICS[m]).toHaveLength(3)
		for (const m of ['defended', 'blocked', 'defeated', 'twin'] as ComicMoment[]) expect(COMICS[m]).toHaveLength(1)
		for (const m in COMICS) expect(COMIC_TIMING[m as ComicMoment]).toBeTruthy()
	})
	it('every burst has one shape and a word, its letters split one per tspan', () => {
		for (const list of Object.values(COMICS)) for (const c of list) {
			expect(c.polys.length + c.paths.length + c.ells.length).toBeGreaterThan(0)
			for (const l of c.lines) expect(l.chars.map((x) => x.t).join('')).toBe(l.t)
		}
	})
	it('never picks the same burst twice running', () => {
		for (let last = 0; last < 3; last++) for (let k = 0; k < 10; k++) expect(pickComic('attacks', last, () => k / 10)).not.toBe(last)
		expect(pickComic('twin', 0)).toBe(0)
	})
})
