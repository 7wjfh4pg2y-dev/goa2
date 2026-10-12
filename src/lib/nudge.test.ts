import { describe, it, expect } from 'vitest'
import { emptyBook, nudgeWait, seeNudge, NUDGE_SENDER_MS, NUDGE_TARGET_MS, type Nudge } from './nudge'

const n = (from: string, to: string, at = 0): Nudge => ({ id: `${from}-${to}-${at}`, from, to, at })

describe('nudges', () => {
	it('a nudge lands, then its target is safe for 10 s and the sender waits 15 s', () => {
		let b = emptyBook()
		expect(nudgeWait(b, 'a', 'b', 0)).toBe(0)
		expect(nudgeWait(b, 'a', 'a', 0)).toBe(Infinity) // never yourself
		const r = seeNudge(b, n('a', 'b'), 'a', 1000)
		expect(r.lands).toBe(true)
		b = r.book
		expect(nudgeWait(b, 'a', 'c', 1000)).toBe(NUDGE_SENDER_MS) // A can't nudge anyone for 15 s
		expect(nudgeWait(b, 'a', 'c', 1000 + NUDGE_SENDER_MS)).toBe(0)
		// C saw the same nudge (each client keeps its own book): B is safe from C too for 10 s
		const c = seeNudge(emptyBook(), n('a', 'b'), 'c', 1000).book
		expect(nudgeWait(c, 'c', 'b', 1000 + 4000)).toBe(NUDGE_TARGET_MS - 4000)
		expect(nudgeWait(c, 'c', 'b', 1000 + NUDGE_TARGET_MS)).toBe(0)
		expect(nudgeWait(c, 'c', 'd', 1000)).toBe(0) // and C may nudge someone else at once
	})
	it('a nudge on a player nudged in the last 10 s does not land (and starts nothing)', () => {
		let b = seeNudge(emptyBook(), n('a', 'b'), 'me', 0).book
		const r = seeNudge(b, n('c', 'b'), 'c', 5000)
		expect(r.lands).toBe(false)
		expect(r.book).toBe(b)
		b = seeNudge(b, n('c', 'b'), 'c', NUDGE_TARGET_MS).book
		expect(b.gotAt.b).toBe(NUDGE_TARGET_MS)
		expect(b.sentAt).toBe(NUDGE_TARGET_MS) // we are c here: our cooldown starts
	})
})
