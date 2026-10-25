import { describe, it, expect } from 'vitest'
import fi from './maps/forgotten_island.json'
import type { GameMap } from './maps'
import { zoneTable } from './zones'
import { hexCenter } from './board/hexgeo'
import {
	fromMap, toMap, blankDoc, paint, paintHex, brush, floodFill, twinOf, symmetryReport, symmetryScore, mirrorHalf, sideOf,
	autoCentre, snapCentre, hexAtPoint, hexAtCentre, validate, autoZones, faceEnemy, growGrid, fitGrid, calibrate, toBoard,
	toImage, legacyTrace, twinDir, startingWave, symCentre, setSymMode, addZone, setZoneKind, removeZone, zonesOf, zoneDef, type Doc
} from './mapedit'

const FI = fi as unknown as GameMap

describe('reading and writing maps', () => {
	it('Forgotten Island round-trips: same cells, minions, wave and zones', () => {
		const d = fromMap(FI), m = toMap(d)
		expect(m.cells).toEqual(FI.cells)
		for (const h in FI.meta) { expect(m.meta![h].m).toBe(FI.meta![h].m); expect(m.meta![h].dir).toBe(FI.meta![h].dir ?? 0) }
		const key = (b: { hex: string; team: string; kind: string }) => `${b.hex}|${b.team}|${b.kind}`
		expect(m.battleZone!.map(key).sort()).toEqual(FI.battleZone!.map(key).sort())
		const a = zoneTable(FI), b = zoneTable(m)
		for (const h in FI.cells) expect(b[h]).toBe(a[h])
		expect(m.waves).toEqual(FI.waves)
	})
	it('a spawn point keeps the ground it was painted on', () => {
		const d = blankDoc()
		paintHex(d, '3_3', { layer: 'ground', ground: 'snow' })
		paintHex(d, '3_3', { layer: 'minion', team: 'orange', role: 'heavy', dir: 2 })
		const m = toMap(d)
		expect(m.cells!['3_3']).toBe('spawnOrange')
		expect(m.ground!['3_3']).toBe('snow')
		expect(fromMap(m).ground['3_3']).toBe('snow')
		expect(fromMap(m).feat['3_3']).toEqual({ kind: 'minion', team: 'orange', role: 'heavy', dir: 2 })
	})
	it('explicit zones win over the ground', () => {
		const d = blankDoc()
		paintHex(d, '2_2', { layer: 'ground', ground: 'beach' })
		paintHex(d, '2_2', { layer: 'zone', zone: 'Blue Jungle' })
		expect(zoneTable(toMap(d))['2_2']).toBe('Blue Jungle')
	})
	it('the starting wave is the Center\'s spawn points', () => {
		const d = blankDoc()
		paintHex(d, '4_4', { layer: 'minion', team: 'blue', role: 'melee', dir: 3 })
		paintHex(d, '4_4', { layer: 'zone', zone: 'Center' })
		paintHex(d, '6_4', { layer: 'minion', team: 'blue', role: 'melee', dir: 3 })
		paintHex(d, '6_4', { layer: 'zone', zone: 'Blue Beach' })
		expect(startingWave(d)).toEqual([{ hex: '4_4', team: 'blue', kind: 'melee' }])
	})
})

describe('hex maths', () => {
	it('finds the hex under a point and at a centre', () => {
		for (const h of ['0_0', '3_1', '7_8', '12_13']) {
			const c = hexCenter(h, 60)
			expect(hexAtPoint(c.x + 20, c.y - 18, 60)).toBe(h)
			expect(hexAtCentre(c.x, c.y, 60)).toBe(h)
		}
		expect(hexAtCentre(10, 10, 60)).toBeNull()
	})
	it('the brush covers 1 / 7 / 19 hexes inside the grid', () => {
		const d = blankDoc()
		expect(brush(d, '8_8', 0)).toHaveLength(1)
		expect(brush(d, '8_8', 1)).toHaveLength(7)
		expect(brush(d, '8_8', 2)).toHaveLength(19)
		expect(brush(d, '0_0', 1).length).toBeLessThan(7)
	})
	it('flood fill stays within one ground', () => {
		const d = blankDoc()
		for (const h of brush(d, '8_8', 2)) paintHex(d, h, { layer: 'ground', ground: 'beach' })
		paintHex(d, '8_8', { layer: 'ground', ground: 'forest' })
		expect(floodFill(d, '8_7', 'ground')).toHaveLength(18)
		expect(floodFill(d, '8_8', 'ground')).toEqual(['8_8'])
	})
})

describe('symmetry', () => {
	it('Forgotten Island is a perfect 180° turn', () => {
		const d = fromMap(FI) // an older map: the centre is its middle
		expect(d.sym.mode).toBe('rotate')
		expect(symmetryReport(d)).toEqual([])
		expect(symmetryScore(d)).toBe(100)
	})
	it('every centre snaps to a place where twins are hexes', () => {
		for (const mode of ['rotate', 'mirrorV', 'mirrorH'] as const) {
			const d = blankDoc(); d.sym = { mode }
			const c = snapCentre(533.3, 611.7, 60, mode)
			d.sym.cx = c.x; d.sym.cy = c.y
			for (const h of ['1_1', '2_5', '9_10', '14_3']) {
				const t = twinOf(d, h)!
				expect(t).toBeTruthy()
				expect(twinOf(d, t)).toBe(h) // twice = back home
			}
		}
	})
	it('live mirroring swaps the teams and turns the facing', () => {
		for (const mode of ['rotate', 'mirrorV', 'mirrorH'] as const) {
			const d = blankDoc(); d.cols = d.rows = 20; d.sym = { mode, ...snapCentre(600, 800, 60, mode) && {} }
			const c = snapCentre(600, 780, 60, mode); d.sym.cx = c.x; d.sym.cy = c.y
			paint(d, ['3_4'], { layer: 'ground', ground: 'baseOrange' }, true)
			paint(d, ['5_6'], { layer: 'minion', team: 'orange', role: 'ranged', dir: 1 }, true)
			paint(d, ['5_6'], { layer: 'zone', zone: 'Orange Beach' }, true)
			const t = twinOf(d, '3_4')!, u = twinOf(d, '5_6')!
			expect(d.ground[t]).toBe('baseBlue')
			expect(d.feat[u]).toEqual({ kind: 'minion', team: 'blue', role: 'ranged', dir: twinDir(1, mode) })
			expect(d.zone[u]).toBe('Blue Beach')
			expect(symmetryReport(d)).toEqual([])
		}
	})
	it('mirroring a facing twice gives it back', () => {
		for (const mode of ['rotate', 'mirrorV', 'mirrorH'] as const) for (let k = 0; k < 6; k++) expect(twinDir(twinDir(k, mode), mode)).toBe(k)
	})
	it('copying one half makes a lopsided map symmetric', () => {
		const d = fromMap(FI)
		const gone = Object.keys(d.ground).find((x) => sideOf(d, x) === -1)!
		paintHex(d, gone, { layer: 'erase' }) // a hole on the Titan side
		expect(symmetryReport(d).length).toBeGreaterThan(0)
		mirrorHalf(d, 'orange')
		expect(symmetryReport(d)).toEqual([])
	})
})

describe('grid and helpers', () => {
	it('growing the top keeps every hex\'s neighbours (rows move in twos)', () => {
		const d = fromMap(FI), before = toMap(d)
		growGrid(d, 'top', 1)
		growGrid(d, 'left', 3)
		fitGrid(d)
		const after = toMap(fromMap(toMap(d)))
		const count = (m: GameMap) => Object.values(m.cells!).sort().join()
		expect(count(after)).toBe(count(before))
		expect(symmetryReport(d)).toEqual([]) // the centre moved with the map
		expect(symmetryReport(fromMap(toMap(d)))).toEqual([])
	})
	it('auto zones reproduce Forgotten Island\'s zones', () => {
		const d = fromMap(FI), z = { ...d.zone }
		autoZones(d)
		const same = Object.keys(z).filter((h) => d.feat[h]?.kind !== 'obstacle' && z[h] === d.zone[h]).length
		const open = Object.keys(z).filter((h) => d.feat[h]?.kind !== 'obstacle').length
		expect(same / open).toBeGreaterThan(0.95)
	})
	it('minions face the enemy base like on Forgotten Island', () => {
		const d = fromMap(FI)
		faceEnemy(d)
		const m = toMap(d)
		let ok = 0, n = 0
		for (const h in FI.meta) { n++; if (m.meta![h].dir === (FI.meta![h].dir ?? 0)) ok++ }
		expect(ok).toBe(n)
	})
	it('calibrates the trace from two pairs of points', () => {
		const t0 = { x: 0, y: 0, scale: 1, rot: 0, opacity: 0.5, w: 1000, h: 800 }
		const t = calibrate(t0, { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 40, y: 60 }, { x: 40, y: 860 })
		const p = toBoard(t, { x: 500, y: 100 })
		expect(p.x).toBeCloseTo(40); expect(p.y).toBeCloseTo(860)
		const q = toImage(t, { x: 40, y: 60 })
		expect(q.x).toBeCloseTo(100); expect(q.y).toBeCloseTo(100)
	})
	it('the legacy trace puts the painting where the old editor had it', () => {
		const g = { originX: 70, originY: 204, rot: -14.4 }
		const t = legacyTrace(g)
		// the old editor drew hex 5_5 at rotate(origin + centre, rot) about (1000, 1000) on the 2000-unit image
		const c = hexCenter('5_5', 59.5), a = (g.rot * Math.PI) / 180
		const x = g.originX + c.x - 1000, y = g.originY + c.y - 1000
		const img = { x: 1000 + x * Math.cos(a) - y * Math.sin(a), y: 1000 + x * Math.sin(a) + y * Math.cos(a) }
		const b = toBoard(t, img)
		expect(b.x).toBeCloseTo(c.x); expect(b.y).toBeCloseTo(c.y)
	})
})

describe('validation', () => {
	it('Forgotten Island is ready to play', () => {
		const d = fromMap(FI)
		const v = validate(d)
		expect(v.filter((x) => x.level === 'error')).toEqual([])
		expect(validate(d, { builtinNames: ['Forgotten Island'] }).some((x) => /built-in/.test(x.text))).toBe(true)
	})
	it('a blank map lists what is missing', () => {
		const d: Doc = blankDoc('Test')
		paintHex(d, '3_3', { layer: 'ground', ground: 'beach' })
		paintHex(d, '9_9', { layer: 'ground', ground: 'beach' })
		const t = validate(d).map((x) => x.text).join('\n')
		expect(t).toMatch(/No Atlantean base/)
		expect(t).toMatch(/No Titan hero spawn points/)
		expect(t).toMatch(/Titan Beach zone/)
		expect(t).toMatch(/can't be reached/)
	})
})

describe('the symmetry centre', () => {
	it('stays put while you paint a blank map', () => {
		const d = blankDoc()
		const c0 = symCentre(d)
		paint(d, ['2_2', '3_2'], { layer: 'ground', ground: 'beach' }, true)
		expect(symCentre(d)).toEqual(c0)
		expect(symmetryReport(d)).toEqual([])
	})
	it('switching the kind snaps a pinned centre to a place that works', () => {
		const d = fromMap(FI)
		setSymMode(d, 'mirrorH')
		for (const h of ['5_5', '9_10']) { const t = twinOf(d, h); if (t) expect(twinOf(d, t)).toBe(h) }
		setSymMode(d, 'rotate')
		expect(twinOf(d, twinOf(d, '7_7')!)).toBe('7_7')
	})
})

describe('zones: lanes, off-lanes and a map\'s own zones', () => {
	it('the built-in zones know what they are', () => {
		const d = blankDoc()
		expect(zoneDef(d, 'Center')!.kind).toBe('lane')
		expect(zoneDef(d, 'Orange Jungle')!.kind).toBe('offlane')
		expect(zoneDef(d, 'Blue Base')!.kind).toBe('base')
	})
	it('a new zone on each side comes as a twin pair; a taken or empty name is refused', () => {
		const d = blankDoc()
		expect(addZone(d, 'North Jungle', 'orange', 'offlane')).toBe('Orange North Jungle')
		expect(zonesOf(d).map((z) => z.key)).toContain('Blue North Jungle')
		expect(zoneDef(d, 'Blue North Jungle')!.team).toBe('blue')
		expect(addZone(d, 'north jungle', 'orange', 'lane')).toBeNull()
		expect(addZone(d, '  ', null, 'lane')).toBeNull()
		expect(addZone(d, 'Top Lane', null, 'lane')).toBe('Top Lane')
	})
	it('marking a zone sets its twin too, and a built-in back to its own kind leaves no override', () => {
		const d = blankDoc()
		setZoneKind(d, 'Orange Jungle', 'lane')
		expect(zoneDef(d, 'Orange Jungle')!.kind).toBe('lane')
		expect(zoneDef(d, 'Blue Jungle')!.kind).toBe('lane')
		setZoneKind(d, 'Blue Jungle', 'offlane')
		expect(d.zdefs ?? []).toEqual([])
	})
	it('the kinds and own zones survive a save; Forgotten Island gains nothing', () => {
		const d = blankDoc()
		paint(d, ['3_3', '4_3'], { layer: 'ground', ground: 'frostwood' })
		addZone(d, 'Pass', 'orange', 'lane')
		paint(d, ['3_3'], { layer: 'zone', zone: 'Orange Pass' })
		const back = fromMap(toMap(d))
		expect(back.zone['3_3']).toBe('Orange Pass')
		expect(back.ground['3_3']).toBe('frostwood')
		expect(zoneDef(back, 'Blue Pass')!.kind).toBe('lane')
		expect(toMap(fromMap(FI)).zoneKinds).toBeUndefined()
	})
	it('a minion spawn in a lane zone of the map\'s own is fine; more lanes than the game plays get a note', () => {
		const d = fromMap(FI)
		addZone(d, 'Side Lane', null, 'lane')
		const h = Object.keys(d.feat).find((x) => d.feat[x].kind === 'minion' && d.zone[x] === 'Center')!
		d.zone[h] = 'Side Lane'
		const txt = validate(d).map((i) => i.text).join(' | ')
		expect(txt).not.toMatch(/outside a lane zone/)
		expect(txt).toMatch(/More lanes \(Side Lane\)/)
	})
	it('removing a zone sends its hexes to the Center', () => {
		const d = blankDoc()
		paint(d, ['1_1'], { layer: 'ground', ground: 'middle' })
		addZone(d, 'Grove', 'orange', 'offlane')
		paint(d, ['1_1'], { layer: 'zone', zone: 'Blue Grove' })
		removeZone(d, 'Orange Grove')
		expect(d.zone['1_1']).toBe('Center')
		expect(zonesOf(d).some((z) => /Grove/.test(z.key))).toBe(false)
	})
	it('mirrored painting gives the twin the other side\'s ground', () => {
		const d = fromMap(FI)
		const h = Object.keys(d.ground).find((x) => d.ground[x] === 'middle' && twinOf(d, x) && twinOf(d, x) !== x)!
		paint(d, [h], { layer: 'ground', ground: 'frostwood' }, true)
		expect(d.ground[twinOf(d, h)!]).toBe('burntwood')
		paint(d, [h], { layer: 'ground', ground: 'tundra' }, true)
		expect(d.ground[twinOf(d, h)!]).toBe('rocky')
		expect(symmetryReport(d).filter((x) => x.hex === h)).toEqual([])
	})
	it('mirrored painting puts the other team\'s pillar on the twin', () => {
		const d = fromMap(FI)
		const h = Object.keys(d.ground).find((x) => d.ground[x] === 'middle' && !d.feat[x] && twinOf(d, x) && twinOf(d, x) !== x)!
		paint(d, [h], { layer: 'obstacle', scatter: 'atlpillar' } as any, true)
		expect(d.feat[twinOf(d, h)!]).toMatchObject({ kind: 'obstacle', scatter: 'titanpillar' })
	})
	it('the ground under twin hexes is free — only shape, zones and features count', () => {
		const d = fromMap(FI)
		const h = Object.keys(d.ground).find((x) => d.ground[x] === 'middle' && !d.feat[x] && twinOf(d, x) && twinOf(d, x) !== x)!
		paintHex(d, h, { layer: 'ground', ground: 'basalt' })
		paintHex(d, twinOf(d, h)!, { layer: 'ground', ground: 'ashwood' })
		expect(symmetryReport(d)).toEqual([])
	})
	it('different scatter on twin obstacles is still symmetric', () => {
		const d = fromMap(FI)
		const h = Object.keys(d.feat).find((x) => d.feat[x]?.kind === 'obstacle' && twinOf(d, x) && twinOf(d, x) !== x)!
		d.feat[h] = { kind: 'obstacle', scatter: 'snowrock' }
		d.feat[twinOf(d, h)!] = { kind: 'obstacle', scatter: 'magmarock' }
		expect(symmetryReport(d)).toEqual([])
	})
	it('the new woods are jungles when zones follow the ground', () => {
		const d = fromMap(FI)
		const h = Object.keys(d.ground).find((x) => d.ground[x] === 'forest' && !d.feat[x])!
		d.ground[h] = 'burntwood'
		autoZones(d)
		expect(d.zone[h]).toMatch(/Jungle$/)
	})
})

describe('ground under obstacles', () => {
	it("Forgotten Island's boulders keep the stone tile (no ground written)", () => {
		const d = fromMap(fi as unknown as GameMap)
		const rock = Object.keys(d.feat).find((h) => d.feat[h]?.kind === 'obstacle')!
		expect((d.feat[rock] as { bare?: boolean }).bare).toBe(true)
		expect(toMap(d).ground?.[rock]).toBeUndefined()
	})
	it('an obstacle placed in the editor sits on its ground, and an empty hex takes its neighbours\' ground', () => {
		const d = fromMap(fi as unknown as GameMap)
		const beach = Object.keys(d.ground).find((h) => d.ground[h] === 'beach' && !d.feat[h])!
		paint(d, [beach], { layer: 'obstacle' })
		expect(toMap(d).ground?.[beach]).toBe('beach')
	})
})

describe('a renamed copy of Forgotten Island', () => {
	it('is a new map: its boulders sit on their neighbours\' ground', () => {
		const d = fromMap(fi as unknown as GameMap)
		d.name = 'My Island'
		const m = toMap(d)
		const rocks = Object.keys(m.cells ?? {}).filter((h) => m.cells?.[h] === 'terrain')
		expect(rocks.every((h) => !!m.ground?.[h] && m.ground[h] !== 'terrain')).toBe(true)
		expect(rocks.some((h) => m.ground?.[h] !== 'middle')).toBe(true)
		// reopening the saved copy keeps them
		const back = toMap(fromMap(m))
		expect(rocks.every((h) => back.ground?.[h] === m.ground?.[h])).toBe(true)
	})
})
