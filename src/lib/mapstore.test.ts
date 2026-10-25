import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { publishedOfRows, publishedId, MAPS_SQL } from './mapstore'
import { availableMaps, setPublished } from './maps'

const cells = { '0_0': 'middle', '1_0': 'baseOrange' }

describe('published maps', () => {
	it('one id per name, spacing and case ignored', () => {
		expect(publishedId('  Sunken  Temple ')).toBe(publishedId('sunken temple'))
	})
	it('keeps live maps with hexes, A–Z, named by the row', () => {
		const list = publishedOfRows([
			{ id: 'pub:b', name: 'Bravo', data: { cells } },
			{ id: 'pub:a', name: 'Alpha', data: { name: 'old', cells } },
			{ id: 'pub:x', name: 'Gone', data: { cells }, deleted: true },
			{ id: 'pub:e', name: 'Empty', data: { cells: {} } }
		])
		expect(list.map((m) => m.name)).toEqual(['Alpha', 'Bravo'])
		expect(list[0].data.name).toBe('Alpha')
	})
	it('show in Create game after the bundled maps; a built-in name never replaces the official board', () => {
		setPublished([{ id: 'pub:isle', name: 'Homebrew Isle', data: { name: 'Homebrew Isle', cells } }, { id: 'pub:fi', name: 'Forgotten Island', data: { cells } }])
		const maps = availableMaps()
		const i = maps.findIndex((m) => m.id === 'pub:isle')
		expect(i).toBeGreaterThan(0)
		expect(maps.some((m) => m.id === 'pub:fi')).toBe(false)
		setPublished([])
	})
	it('the table SQL has no delete policy', () => {
		expect(MAPS_SQL).not.toMatch(/for delete/)
	})
})
