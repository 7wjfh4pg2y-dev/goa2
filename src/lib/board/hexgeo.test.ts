import { describe, it, expect } from 'vitest'
import { hexCenter, hexCorner, hexNeighbour, hexNeighbours, hexHash, outlineLoops, smoothPath, borderPath, SQRT3 } from './hexgeo'
import { hexCube, cubeDist } from '../zones'
import map from '../maps/forgotten_island.json'

describe('hex geometry', () => {
	it('neighbours are one step away, and going back across the same edge returns home (even and odd rows)', () => {
		for (const id of ['4_4', '4_5', '0_0', '0_1', '7_12']) {
			const ns = hexNeighbours(id)
			expect(new Set(ns).size).toBe(6)
			for (let k = 0; k < 6; k++) {
				expect(cubeDist(hexCube(id), hexCube(ns[k]))).toBe(1)
				expect(hexNeighbour(ns[k], (k + 3) % 6)).toBe(id)
			}
		}
	})

	it('a neighbour sits exactly one hex-width away, across the edge it is named for', () => {
		const size = 60, c = hexCenter('4_5', size)
		for (let k = 0; k < 6; k++) {
			const n = hexCenter(hexNeighbour('4_5', k), size)
			expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeCloseTo(size * SQRT3, 6)
			// the midpoint between the two centres is the middle of edge k
			const a = hexCorner(c, size, k), b = hexCorner(c, size, (k + 1) % 6)
			expect((a.x + b.x) / 2).toBeCloseTo((c.x + n.x) / 2, 6)
			expect((a.y + b.y) / 2).toBeCloseTo((c.y + n.y) / 2, 6)
		}
	})

	it('outlines: one hex = 6 corners, two neighbours = 10, a ring = an outer loop and a hole', () => {
		expect(outlineLoops(['3_3'], 60)).toHaveLength(1)
		expect(outlineLoops(['3_3'], 60)[0]).toHaveLength(6)
		const two = outlineLoops(['3_3', '4_3'], 60)
		expect(two).toHaveLength(1)
		expect(two[0]).toHaveLength(10)
		const ring = outlineLoops(hexNeighbours('5_5'), 60)
		expect(ring.map((l) => l.length).sort((a, b) => a - b)).toEqual([6, 18])
		expect(outlineLoops(['1_1', '8_8'], 60)).toHaveLength(2) // two islands
	})

	it('the official map is one island with one coastline', () => {
		const ids = Object.keys(map.cells)
		const loops = outlineLoops(ids, 59.5)
		const outer = loops.reduce((a, b) => (b.length > a.length ? b : a))
		expect(outer.length).toBeGreaterThan(60)
		expect(loops.filter((l) => l.length === outer.length)).toHaveLength(1)
		const d = smoothPath(outer)
		expect(d.startsWith('M')).toBe(true)
		expect(d.endsWith('Z')).toBe(true)
		expect(d).not.toContain('NaN')
	})

	it('borders: only between hexes of different groups, each edge once', () => {
		const group = (id: string) => ({ '3_3': 'a', '4_3': 'a', '5_3': 'b' } as Record<string, string>)[id]
		const d = borderPath(['3_3', '4_3', '5_3'], group, 60)
		expect(d.match(/M/g)).toHaveLength(1) // just the a|b edge
		expect(borderPath(['3_3', '4_3'], (id) => (id === '5_3' ? undefined : group(id)), 60)).toBe('') // the map's edge is not a border
	})

	it('the hash is stable and spread out', () => {
		expect(hexHash('4_5', 1)).toBe(hexHash('4_5', 1))
		const vals = Object.keys(map.cells).map((id) => hexHash(id, 3))
		expect(Math.min(...vals)).toBeGreaterThanOrEqual(0)
		expect(Math.max(...vals)).toBeLessThan(1)
		const mean = vals.reduce((a, b) => a + b, 0) / vals.length
		expect(mean).toBeGreaterThan(0.4)
		expect(mean).toBeLessThan(0.6)
	})
})
