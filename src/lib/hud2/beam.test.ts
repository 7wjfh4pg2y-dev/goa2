import { describe, it, expect } from 'vitest'
import { clashAt, restAt, endOf, type BeamInput } from './beam'

// a 1000-long beam, 300-wide Life boxes, the Titans on the left (the viewer is an Atlantean)
const base: BeamInput = { L: 1000, lifeW: 300, left: 'blue', zone: 1, zones: 3, orange: 6, blue: 6, startO: 6, startB: 6 }

describe('the top bar beam', () => {
	it('rests at the coin for the middle zone, halfway across a Life box for a beach', () => {
		expect(restAt(base, 1)).toBe(500)
		expect(restAt(base, 2)).toBe(150) // the Titan beach: halfway across the left (Titan) box
		expect(restAt(base, 0)).toBe(850) // the Atlantean beach: halfway across the right box
		// seen by a Titan the sides swap
		expect(restAt({ ...base, left: 'orange' }, 0)).toBe(150)
	})
	it('equal waves sit still; the side losing minions is pushed back towards its own end', () => {
		expect(clashAt(base)).toBe(500)
		const o5b3 = clashAt({ ...base, orange: 5, blue: 3 }) // the Titans are losing: towards the Titan (left) end
		expect(o5b3).toBeLessThan(500)
		expect(o5b3).toBeGreaterThan(150)
		expect(clashAt({ ...base, orange: 2, blue: 6 })).toBeGreaterThan(500)
	})
	it('reaches the next resting point exactly when a side has no minions left', () => {
		expect(clashAt({ ...base, blue: 0 })).toBe(150)
		expect(clashAt({ ...base, orange: 0 })).toBe(850)
		// on the Titan beach the next step is the Titan throne
		expect(clashAt({ ...base, zone: 2, blue: 0 })).toBe(endOf(base, 'blue'))
		// and the Titans winning it back walks towards the middle
		expect(clashAt({ ...base, zone: 2, orange: 0 })).toBe(500)
	})
	it('a finished game sits on the loser’s throne', () => {
		expect(clashAt({ ...base, won: 'orange' })).toBe(0)
		expect(clashAt({ ...base, won: 'blue' })).toBe(1000)
	})
})
