import { describe, it, expect } from 'vitest'
import { readPrefs, DEFAULT_PREFS } from './boardPrefs'

describe('board prefs (each player\'s own effects)', () => {
	it('every effect on, the island look, when nothing is saved or the save is broken', () => {
		expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
		expect(readPrefs('{not json')).toEqual(DEFAULT_PREFS)
		expect(DEFAULT_PREFS).toEqual({ rims: true, zone: true, sea: true, look: 'island', hud: '2.0', compact: false, beam: true, wisps: true })
	})
	it('reads back what was switched off (and the other choices)', () => {
		expect(readPrefs(JSON.stringify({ v: 2, rims: false, sea: true, look: 'classic', hud: 'classic', compact: true, beam: false, wisps: false }))).toEqual({ rims: false, zone: true, sea: true, look: 'classic', hud: 'classic', compact: true, beam: false, wisps: false })
		expect(readPrefs(JSON.stringify({ v: 2, zone: 'no', look: 'weird', hud: 'v3', compact: 1 }))).toEqual(DEFAULT_PREFS)
	})
	it('an old save (effects were off by default then) keeps its look and HUD but starts with the effects on', () => {
		expect(readPrefs(JSON.stringify({ rims: false, zone: false, sea: false, beam: false, look: 'classic', hud: 'classic', compact: true }))).toEqual({ ...DEFAULT_PREFS, look: 'classic', hud: 'classic', compact: true })
	})
})
