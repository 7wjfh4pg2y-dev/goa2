import { describe, it, expect } from 'vitest'
import { rethemesFor, themeFor, mapKey } from './rethemes'
import { readPrefs } from '../boardPrefs'

describe('map rethemes', () => {
	it('belong to one map, by name (a renamed copy is a new map)', () => {
		expect(rethemesFor('Forgotten Island').map((t) => t.id)).toEqual(['ink'])
		expect(rethemesFor(' forgotten island ').length).toBe(1)
		expect(rethemesFor('Frostfire Isle')).toEqual([])
		expect(rethemesFor(undefined)).toEqual([])
	})
	it("the player's pick applies only to a map that has that retheme", () => {
		const picks = { [mapKey('Forgotten Island')]: 'ink' }
		expect(themeFor('Forgotten Island', picks)).toBe('ink')
		expect(themeFor('Forgotten Island', {})).toBeNull()
		expect(themeFor('Forgotten Island', { 'forgotten island': '' })).toBeNull()
		expect(themeFor('My Map', { 'my map': 'ink' })).toBeNull()
	})
	it('picks are kept in the board prefs, junk dropped', () => {
		expect(readPrefs(JSON.stringify({ themes: { 'forgotten island': 'ink', bad: 3, empty: '' } })).themes).toEqual({ 'forgotten island': 'ink' })
		expect(readPrefs(JSON.stringify({ themes: 'x' })).themes).toEqual({})
	})
})
