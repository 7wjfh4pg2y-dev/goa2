import { describe, it, expect } from 'vitest'
import { rethemesFor, themeFor, mapKey } from './rethemes'
import { readPrefs } from '../boardPrefs'
import { doodleDefs, DOODLE_PARTS } from './doodleArt'

describe('map rethemes', () => {
	it('belong to one map, by name (a renamed copy is a new map)', () => {
		expect(rethemesFor('Forgotten Island').map((t) => t.id)).toEqual(['ink', 'doodle'])
		expect(rethemesFor(' forgotten island ').length).toBe(2)
		expect(rethemesFor('Frostfire Isle')).toEqual([])
		expect(rethemesFor(undefined)).toEqual([])
	})
	it("the player's pick applies only to a map that has that retheme", () => {
		const picks = { [mapKey('Forgotten Island')]: 'ink' }
		expect(themeFor('Forgotten Island', picks)).toBe('ink')
		expect(themeFor('Forgotten Island', { 'forgotten island': 'doodle' })).toBe('doodle')
		expect(themeFor('Forgotten Island', {})).toBeNull()
		expect(themeFor('Forgotten Island', { 'forgotten island': '' })).toBeNull()
		expect(themeFor('My Map', { 'my map': 'ink' })).toBeNull()
	})
	it('picks are kept in the board prefs, junk dropped', () => {
		expect(readPrefs(JSON.stringify({ themes: { 'forgotten island': 'ink', bad: 3, empty: '' } })).themes).toEqual({ 'forgotten island': 'ink' })
		expect(readPrefs(JSON.stringify({ themes: 'x' })).themes).toEqual({})
	})
})

import { inkFace, inkToken } from './inkArt'
import { HEROES } from '../heroes'
import { HERO_KIT } from '../tokens'

describe('ink & wash art (tools/ink_art.mjs)', () => {
	it('every hero has an ink portrait, Razzle her three doubles', () => {
		for (const h of HEROES) expect(inkFace(h.id), h.id).toBeTruthy()
		for (const n of [1, 2, 3]) expect(inkFace('razzle', n)).toBeTruthy()
	})
	it("every hero's own piece has ink art (companions use the crests)", () => {
		for (const kit of Object.values(HERO_KIT)) for (const t of kit) if (t !== 'companion') expect(inkToken(t), t).toBeTruthy()
		for (const r of ['axe', 'bird', 'anvil', 'horn']) expect(inkToken(`rune_${r}_marker`)).toBeTruthy()
	})
})

describe('doodle drawings (DoodleLayer)', () => {
	it('every part the layer uses is drawn, every link points inside the same prefix', () => {
		const svg = doodleDefs('x-')
		for (const p of DOODLE_PARTS) expect(svg, p).toContain(`id="x-${p}"`)
		for (const m of svg.matchAll(/href="#([^"]+)"/g)) expect(svg).toContain(`id="${m[1]}"`)
		expect(svg).not.toMatch(/id="(?!x-)/)
	})
})
