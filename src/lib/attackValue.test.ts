import { describe, it, expect } from 'vitest'
import { attackFigures, cardAttack, cardDefence, itemLines } from './attackValue'
import { newPlayerCardState } from './cards/cardstate'
import { heroCards } from './cards/deck'

const idx = (hero: string, name: string) => heroCards(hero).findIndex((c) => c.name === name)

describe('attack values on the board', () => {
	it('a card gives its attack / defence', () => {
		const tc = heroCards('tigerclaw')
		expect(cardAttack(tc[idx('tigerclaw', 'Combat Reflexes')])).toBe(4)
		expect(cardAttack(tc[idx('tigerclaw', 'Light-Fingered')])).toBe(null)
		expect(cardDefence(heroCards('xargatha')[idx('xargatha', 'Stone Gaze')])).toBe(5)
	})
	it('items are added in, each with the colour of the card behind it', () => {
		const a = { ...newPlayerCardState('tigerclaw'), pending: idx('tigerclaw', 'Combat Reflexes'), upgrade: [idx('tigerclaw', 'Pick Pocket')] }
		const d = { ...newPlayerCardState('xargatha'), upgrade: [idx('xargatha', 'Long Thrust')] }
		const f = attackFigures(a, d, [{ label: 'Minions', value: 0 }], null)
		expect(f.atk).toMatchObject({ total: 5, pip: 'GREEN' })
		expect(f.atk!.lines.map((l) => l.label)).toEqual(['Combat Reflexes', 'Pick Pocket item'])
		// before the discard: only what is known — minions + items, as a bonus
		expect(f.def).toMatchObject({ total: null, bonus: 1, pip: 'RED' })
		// after: the card's defence on top
		const g = attackFigures(a, d, [{ label: 'Minions', value: -1 }], idx('xargatha', 'Stone Gaze'))
		expect(g.def).toMatchObject({ total: 5, bonus: 0 })
		expect(g.def.lines[0]).toEqual({ label: 'Stone Gaze', value: 5, plain: true })
	})
	it('host-made items count too (brass)', () => {
		const a = { ...newPlayerCardState('tigerclaw'), items: { atk: 2 } }
		expect(itemLines(a, 'ATTACK')).toEqual([{ label: 'Item', value: 2, pip: 'BRASS' }])
	})
	it('no attack value on the card: no sword', () => {
		const a = { ...newPlayerCardState('tigerclaw'), pending: idx('tigerclaw', 'Light-Fingered') }
		expect(attackFigures(a, undefined, [], null).atk).toBe(null)
	})
})
