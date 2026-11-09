import { describe, it, expect } from 'vitest'
import { learnSteps, LEARN_MAP } from './learn'
import { zoneTable } from './zones'

describe('how to play (learn.ts)', () => {
	const steps = learnSteps()
	const cells = LEARN_MAP.cells ?? {}
	it('every scene stands on real, open, distinct hexes', () => {
		for (const s of steps) {
			const hexes = s.scene.pieces.map((p) => p.hex)
			for (const h of hexes) expect(cells[h] && cells[h] !== 'terrain', `${s.id}: ${h}`).toBeTruthy()
			expect(new Set(hexes).size, s.id).toBe(hexes.length)
			for (const b of s.scene.badges ?? []) expect(s.scene.pieces.some((p) => p.id === b.id), `${s.id}: badge ${b.id}`).toBe(true)
			for (const c of s.scene.cards ?? []) expect(c.card?.name, s.id).toBeTruthy()
		}
	})
	it('has unique ids and the first-game heroes on their spawn points', () => {
		expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
		const start = steps[0].scene.pieces.filter((p) => p.hero)
		expect(start.map((p) => p.hero).sort()).toEqual(['arien', 'brogan', 'wasp', 'xargatha'])
		for (const p of start) expect(cells[p.hex]).toBe(p.team === 'blue' ? 'baseBlueSpawn' : 'baseOrangeSpawn')
	})
	it('the starting hand is five cards, the order step is sorted by initiative', () => {
		expect(steps.find((s) => s.id === 'hand')!.scene.cards).toHaveLength(5)
		const ord = steps.find((s) => s.id === 'turn')!.scene.cards!.map((c) => c.card.initiative ?? 0)
		expect([...ord].sort((a, b) => b - a)).toEqual(ord)
	})
	it('the attack scene: two enemy minions count, one ally helps; the defender stands in the middle', () => {
		const s = steps.find((x) => x.id === 'heroes')!.scene
		const z = zoneTable(LEARN_MAP)
		expect(z[s.pieces.find((p) => p.id === 'h_arien')!.hex]).toBe('Center')
		expect(s.badges!.filter((b) => !b.total).map((b) => b.text).sort()).toEqual(['+1', '−1', '−1'])
	})
	it('fast travel marks the middle (enemy minions) red and other neighbouring zones green', () => {
		const a = steps.find((x) => x.id === 'fast')!.scene.areas!
		const z = zoneTable(LEARN_MAP)
		const mid = a.find((x) => z[x.hex] === 'Center')!
		expect(mid.color).toBe('#ef4f5c')
		expect(a.filter((x) => x.color !== '#ef4f5c').length).toBeGreaterThan(1)
	})
	it('the HUD chapters: desktop and phone steps, every marker named once with a target and a note', () => {
		const hud = steps.filter((s) => s.scene.hud)
		expect(hud.some((s) => s.scene.hud === 'desktop')).toBe(true)
		expect(hud.some((s) => s.scene.hud === 'phone')).toBe(true)
		for (const s of hud) {
			for (const b of s.blocks) if ('spots' in b) {
				expect(new Set(b.spots.map((x) => x.label)).size, s.id).toBe(b.spots.length)
				for (const x of b.spots) { expect(x.sel, `${s.id}: ${x.label}`).toBeTruthy(); expect(x.note.length, `${s.id}: ${x.label}`).toBeGreaterThan(10) }
			}
		}
		expect(steps[steps.length - 1].scene.hud).toBe('phone')
	})
})
