import { describe, it, expect } from 'vitest'
import { readPrefs, DEFAULT_PREFS } from './boardPrefs'

describe('board prefs (each player\'s own effects)', () => {
	it('every effect on, the island look, when nothing is saved or the save is broken', () => {
		expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
		expect(readPrefs('{not json')).toEqual(DEFAULT_PREFS)
		expect(DEFAULT_PREFS).toEqual({ dash: true, rims: true, zone: true, sea: true, look: 'island', compact: false, cTop: false, cOrder: false, cLog: false, beam: true, wisps: true, zoomLock: false, turnCue: true, laugh: true, sparkle: true, spells: true, essence: true, emToast: true, emClock: true, snInscribe: true, runeFlare: true, igEq: true, igSwirl: true, igChaos: true, tkSwap: true, tkWave: true, tkWar: true, rzShuffle: true, rzComic: true, rzPoof: true, rzApplause: true, rzTickets: true, shelfL: true, shelfR: true })
	})
	it('reads back what was switched off (and the other choices)', () => {
		expect(readPrefs(JSON.stringify({ v: 2, rims: false, sea: true, look: 'classic', compact: true, beam: false, wisps: false }))).toEqual({ dash: true, rims: false, zone: true, sea: true, look: 'classic', compact: true, cTop: false, cOrder: false, cLog: false, beam: false, wisps: false, zoomLock: false, turnCue: true, laugh: true, sparkle: true, spells: true, essence: true, emToast: true, emClock: true, snInscribe: true, runeFlare: true, igEq: true, igSwirl: true, igChaos: true, tkSwap: true, tkWave: true, tkWar: true, rzShuffle: true, rzComic: true, rzPoof: true, rzApplause: true, rzTickets: true, shelfL: true, shelfR: true })
		expect(readPrefs(JSON.stringify({ v: 2, zone: 'no', look: 'weird', compact: 1 }))).toEqual(DEFAULT_PREFS)
	})
	it('each part of the 2.0 HUD remembers expanded / compact on its own', () => {
		expect(readPrefs(JSON.stringify({ v: 2, cTop: true, cLog: true }))).toEqual({ ...DEFAULT_PREFS, cTop: true, cLog: true })
		expect(readPrefs(JSON.stringify({ v: 2, cOrder: 'yes' }))).toEqual(DEFAULT_PREFS)
	})
	it('the 4★ heroes\' effects are never read back from a save — each game starts with them on', () => {
		expect(readPrefs(JSON.stringify({ v: 2, laugh: false, dash: false, rzComic: false, rims: false }))).toEqual({ ...DEFAULT_PREFS, rims: false })
	})
	it('an old save (effects were off by default then) keeps its look and HUD but starts with the effects on', () => {
		expect(readPrefs(JSON.stringify({ rims: false, zone: false, sea: false, beam: false, look: 'classic', compact: true }))).toEqual({ ...DEFAULT_PREFS, look: 'classic', compact: true })
	})
})
