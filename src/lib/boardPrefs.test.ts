import { describe, it, expect } from 'vitest'
import { readPrefs, DEFAULT_PREFS } from './boardPrefs'

describe('board prefs (each player\'s own effects)', () => {
	it('everything off, the island look, when nothing is saved or the save is broken', () => {
		expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
		expect(readPrefs('{not json')).toEqual(DEFAULT_PREFS)
		expect(DEFAULT_PREFS).toEqual({ rims: false, zone: false, sea: false, look: 'island', hud: '2.0', compact: false, beam: false })
	})
	it('reads back what was switched on', () => {
		expect(readPrefs(JSON.stringify({ rims: true, sea: true, look: 'classic', hud: 'classic', compact: true, beam: true }))).toEqual({ rims: true, zone: false, sea: true, look: 'classic', hud: 'classic', compact: true, beam: true })
		expect(readPrefs(JSON.stringify({ zone: 'yes', look: 'weird', hud: 'v3', compact: 1 }))).toEqual(DEFAULT_PREFS)
	})
})
