import { describe, it, expect } from 'vitest'
import { fitText } from './fitText'

// 70 px at 10 px type, k = 0.7 → 10 characters a line
const fit = (t: string, maxLines = 2) => fitText(t, 70, 10, 0.7, maxLines)
describe('the action ring\'s small line', () => {
	it('one line when it fits', () => {
		expect(fit('Chaos Bolt')).toEqual({ lines: ['Chaos Bolt'], fs: 10 })
	})
	it('as many words as fit on the first line', () => {
		expect(fit('Path of Ashes').lines).toEqual(['Path of', 'Ashes'])
		expect(fit('Set an Example').lines).toEqual(['Set an', 'Example'])
	})
	it('a word 1–3 letters too long shrinks instead of breaking', () => {
		const f = fit('Equilibrium') // 11 letters: one over
		expect(f.lines).toEqual(['Equilibrium'])
		expect(f.fs).toBeCloseTo(70 / (0.7 * 11), 5)
		expect(fit('Spontaneous').lines).toEqual(['Spontaneous'])
	})
	it('a much longer word is cut with a hyphen, the rest on the next line', () => {
		expect(fit('Abracadabraaaaa').lines).toEqual(['Abracadab-', 'raaaaa'])
		expect(fit('Constellations').lines).toEqual(['Constella-', 'tions']) // 4 over: cut, 5 letters left
	})
	it('never more lines than allowed: the type shrinks instead', () => {
		const f = fit('Loosely-Aimed Firebolts of Doom')
		expect(f.lines.length).toBeLessThanOrEqual(2)
		expect(f.fs).toBeLessThan(10)
	})
	it('no line ever ends up 1–3 letters long from a cut word', () => {
		for (const w of ['Abcdefghijklm', 'Abcdefghijklmn', 'Abcdefghijklmno', 'Abcdefghijklmnopqrstu']) {
			const { lines } = fit(w)
			const cut = lines.length > 1 && lines[0].endsWith('-')
			if (cut) expect(lines[lines.length - 1].length).toBeGreaterThanOrEqual(4)
		}
	})
})
