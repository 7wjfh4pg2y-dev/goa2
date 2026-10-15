import { describe, it, expect } from 'vitest'
import { OPENING_MAP, twinTable, twinHex, onSide, blankOpening, heroHexAt, marksAt, takenAt, spawnsOf, openingWave, openingOfRow, rowOfOpening, turnCards, applyTool, markLabel, type Opening, type ToolOpts } from './openings'

describe('openings', () => {
	it('the board is point-symmetric: every space has a twin of the matching kind for the other side', () => {
		const cells = OPENING_MAP.cells ?? {}
		const twin = twinTable()
		const swap: Record<string, string> = { spawnOrange: 'spawnBlue', spawnBlue: 'spawnOrange', baseOrange: 'baseBlue', baseBlue: 'baseOrange', baseOrangeSpawn: 'baseBlueSpawn', baseBlueSpawn: 'baseOrangeSpawn' }
		for (const id in cells) {
			expect(twin[id]).toBeDefined()
			expect(cells[twin[id]]).toBe(swap[cells[id]] ?? cells[id])
			expect(twin[twin[id]]).toBe(id)
		}
		expect(spawnsOf('orange').map((h) => twinHex(h)).sort()).toEqual(spawnsOf('blue'))
	})

	it('the round-1 wave stands on twin spaces for the two teams', () => {
		const w = openingWave()
		expect(w.length).toBe(12)
		for (const m of w) expect(w.some((o) => o.hex === twinHex(m.hex) && o.team !== m.team && o.role === m.role)).toBe(true)
	})

	it('seen from the other side, every mark moves to its twin space and back again', () => {
		const op: Opening = { ...blankOpening('wasp', 'blue'), start: spawnsOf('blue')[0], marks: [
			{ id: 'a', kind: 'step', hex: '9_10', turn: 1, color: 'green' },
			{ id: 'b', kind: 'arrow', from: '9_10', to: '8_8', turn: 2, color: 'blue' },
			{ id: 'c', kind: 'area', hexes: ['9_10', '10_10'], turn: 0, color: 'white', style: 'both' }
		] }
		const o = onSide(op, 'orange')
		expect(o.side).toBe('orange')
		expect(o.start).toBe(twinHex(op.start))
		expect(o.marks[0]).toMatchObject({ hex: twinHex('9_10') })
		expect(o.marks[1]).toMatchObject({ from: twinHex('9_10'), to: twinHex('8_8') })
		expect(onSide(o, 'blue')).toEqual(op)
		expect(onSide(op, 'blue')).toBe(op)
	})

	it('turn by turn: marks up to the turn, the hero on its latest plain chip, taken minions', () => {
		const op: Opening = { ...blankOpening('brogan'), start: 'S', marks: [
			{ id: '1', kind: 'step', hex: 'A', turn: 1, color: 'green' },
			{ id: '2', kind: 'step', hex: 'B', turn: 2, color: 'red', alt: true },
			{ id: '3', kind: 'step', hex: 'C', turn: 2, color: 'blue' },
			{ id: '4', kind: 'ring', hex: 'M', turn: 3, color: 'gold', taken: true },
			{ id: '5', kind: 'unit', hex: 'E', turn: 0, unit: 'enemy' }
		] }
		expect(heroHexAt(op, 0)).toBe('C')
		expect(heroHexAt(op, 1)).toBe('A')
		expect(heroHexAt(op, 2)).toBe('C')
		expect(heroHexAt({ ...op, marks: [] }, 3)).toBe('S')
		// a 'stay' chip (an attack from where the hero stands) doesn't move it
		const st = { ...op, marks: op.marks.map((m) => (m.kind === 'step' && m.turn === 2 ? { ...m, stay: true } : m)) }
		expect(heroHexAt(st, 2)).toBe('A')
		expect(marksAt(op, 1).map((m) => m.id)).toEqual(['1', '5'])
		expect(marksAt(op, 0).length).toBe(5)
		expect([...takenAt(op, 2)]).toEqual([])
		expect([...takenAt(op, 3)]).toEqual(['M'])
	})

	it('rows round-trip, and older rows are filled out', () => {
		const op = { ...blankOpening('misa'), name: 'Coo', turns: [{ cards: ['green' as const], note: '' }, { cards: [], note: '' }, { cards: [], note: '' }, { cards: [], note: '' }] }
		expect(openingOfRow(rowOfOpening(op))).toEqual(op)
		const old = openingOfRow({ id: 'x', hero: 'misa', kind: 'opening', data: { name: 'Old' } })!
		expect(old.turns.length).toBe(4)
		expect(old.marks).toEqual([])
		expect(openingOfRow({ id: 'g', hero: 'misa', kind: 'guide', data: {} })).toBeNull()
		expect(turnCards({ cards: ['green', 'blue'], note: '' })).toBe('Green/Blue')
	})
})

describe('the builder tools', () => {
	const o: ToolOpts = { turn: 2, color: 'blue', alt: false, taken: false, areaStyle: 'both', unit: 'enemy', unitHero: '', text: '', token: '', areaId: null, arrowFrom: null, picked: null }
	const op0 = blankOpening('wasp')
	it('chips, rings, units toggle on a second tap; labels need text', () => {
		let r = applyTool(op0, 'step', '9_10', o)
		expect(r.op.marks).toMatchObject([{ kind: 'step', hex: '9_10', turn: 2, color: 'blue' }])
		r = applyTool(r.op, 'step', '9_10', { ...o, color: 'red' })
		expect(r.op.marks).toMatchObject([{ color: 'blue', color2: 'red' }]) // another colour = a hybrid chip
		expect(markLabel(r.op.marks[0])).toBe('T2 chip · Blue or Red')
		r = applyTool(r.op, 'step', '9_10', o)
		expect(r.op.marks.map((m) => (m.kind === 'step' ? [m.color, m.color2] : ''))).toEqual([['red', undefined]])
		expect(applyTool(r.op, 'step', '9_10', { ...o, color: 'red' }).op.marks).toEqual([])
		expect(applyTool(r.op, 'step', '9_10', { ...o, color: 'red', alt: true }).op.marks.length).toBe(2)
		expect(applyTool(op0, 'step', 'x', { ...o, turn: 0, color: 'white' }).op.marks[0]).toMatchObject({ turn: 1, color: 'gold' })
		const u = applyTool(op0, 'unit', 'a', { ...o, unitHero: 'misa' })
		expect(u.op.marks[0]).toMatchObject({ kind: 'unit', unit: 'enemy', hero: 'misa' })
		expect(applyTool(u.op, 'unit', 'a', o).op.marks).toEqual([])
		expect(applyTool(op0, 'label', 'a', o).changed).toBe(false)
		expect(applyTool(op0, 'label', 'a', { ...o, text: ' Start ' }).op.marks[0]).toMatchObject({ text: 'Start' })
	})
	it('an arrow takes two taps; an area is painted space by space', () => {
		let r = applyTool(op0, 'arrow', 'a', o)
		expect(r.changed).toBe(false)
		expect(r.arrowFrom).toBe('a')
		r = applyTool(r.op, 'arrow', 'b', { ...o, arrowFrom: r.arrowFrom })
		expect(r.op.marks[0]).toMatchObject({ kind: 'arrow', from: 'a', to: 'b' })
		expect(r.arrowFrom).toBeNull()
		let a = applyTool(op0, 'area', 'a', o)
		a = applyTool(a.op, 'area', 'b', { ...o, areaId: a.areaId })
		expect(a.op.marks[0]).toMatchObject({ kind: 'area', hexes: ['a', 'b'] })
		a = applyTool(a.op, 'area', 'a', { ...o, areaId: a.areaId })
		a = applyTool(a.op, 'area', 'b', { ...o, areaId: a.areaId })
		expect(a.op.marks).toEqual([])
		expect(a.areaId).toBeNull()
	})
	it('the eraser clears a space (an area only loses that space); pick cycles through what is there', () => {
		let op = applyTool(op0, 'step', 'a', o).op
		op = applyTool(op, 'unit', 'a', o).op
		const area = applyTool(op, 'area', 'a', o)
		op = applyTool(area.op, 'area', 'b', { ...o, areaId: area.areaId }).op
		op = { ...op, start: 'a' }
		const p1 = applyTool(op, 'pick', 'a', o).picked
		const p2 = applyTool(op, 'pick', 'a', { ...o, picked: p1 }).picked
		expect(p1).not.toBe(p2)
		const e = applyTool(op, 'erase', 'a', o).op
		expect(e.start).toBe('')
		expect(e.marks).toMatchObject([{ kind: 'area', hexes: ['b'] }])
		expect(markLabel(e.marks[0])).toBe('Area · 1 space · T2')
	})
})
