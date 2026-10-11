import { describe, it, expect } from 'vitest'
import { draftReport, draftHighlights, reportText, conditionOf, matchNumbers, dotDate, reportOfRow, rowOfReport, reportMatches, type Report } from './reports'
import type { GameRowIn } from './league'

// a 2 v 2 like a real one (made-up names): Zara (Mrak) + Priya (Hanu) vs Mo (Swift) + Sam (Mortimer)
const Z = 'z1', P = 'p1', M = 'm1', S = 's1'
const snap = (round: number, turn: number, waves: number, lane: number) => ({ round, turn, waves, lane, at: 0, life: { orange: 6, blue: 6 }, cards: {} })
function row(): GameRowIn {
	return {
		id: 'ROOM-1', room: 'ROOM', started_at: '2026-10-10T16:36:33Z', ended_at: '2026-10-10T18:00:00Z', winner: 'blue', reason: 'won the Final Push', rounds: 6,
		data: {
			seats: 4, wavesMax: 3, evv: 2,
			players: {
				[Z]: { name: 'Zara', hero: 'mrak', seat: 0, team: 'orange', color: 'green' },
				[P]: { name: 'Priya', hero: 'hanu', seat: 1, team: 'orange', color: 'white' },
				[M]: { name: 'Mo', hero: 'swift', seat: 2, team: 'blue', color: 'crimson' },
				[S]: { name: 'Sam', hero: 'mortimer', seat: 3, team: 'blue', color: 'purple' }
			},
			turns: [snap(1, 1, 3, 1), snap(3, 3, 3, 1), snap(3, 4, 2, 0), snap(4, 1, 2, 0), snap(5, 1, 1, 1), snap(6, 2, 1, 1)],
			final: { round: 6, turn: 3, waves: 0, lane: 0, life: { orange: 5, blue: 5 }, wonBy: { team: 'blue', reason: 'won the Final Push' }, cards: {} },
			ev: [
				{ k: 'minion', id: 'a', r: 1, t: 3, by: M, role: 'melee', team: 'orange' },
				{ k: 'minion', id: 'b', r: 1, t: 4, by: M, role: 'melee', team: 'orange' },
				{ k: 'minion', id: 'c', r: 2, t: 2, by: M, role: 'ranged', team: 'orange' },
				{ k: 'minion', id: 'd', r: 2, t: 3, by: P, role: 'melee', team: 'blue' },
				{ k: 'clash', id: 'c1', r: 3, t: 2, kind: 'attack', by: Z, v: S, out: 'defended', disc: true },
				{ k: 'clash', id: 'c2', r: 3, t: 2, kind: 'attack', by: S, v: Z, out: 'defended', disc: true },
				{ k: 'hero', id: 'h1', r: 3, t: 3, by: Z, v: S, a: [P], c: 2, ac: 1, l: 1, team: 'blue', kl: 3 },
				{ k: 'clash', id: 'c3', r: 3, t: 3, kind: 'attack', by: Z, v: S, out: 'died', disc: false },
				{ k: 'minion', id: 'e', r: 5, t: 1, by: P, role: 'heavy', team: 'blue' }
			]
		}
	}
}

describe('match reports', () => {
	it('drafts an online game: teams by side and seat, the winner, how, the waves', () => {
		const r = draftReport(row(), 1)
		expect(r).toMatchObject({ id: 'online:ROOM-1', kind: 'online', gameId: 'ROOM-1', match: 1, winner: 'blue', condition: 'Last Push', wave: 3 })
		expect(r.date).toMatch(/^2026-10-1[01]$/) // the local day
		expect(r.red).toEqual([{ name: 'Zara', hero: 'Mrak' }, { name: 'Priya', hero: 'Hanu' }])
		expect(r.blue).toEqual([{ name: 'Mo', hero: 'Swift' }, { name: 'Sam', hero: 'Mortimer' }])
	})

	it('reads the highlights off the events: kills, blocks, pushes, minions, heavies, the finish', () => {
		const h = draftHighlights(row())
		expect(h).toContain("The only kill of the game: Zara's Mrak took down Sam's Mortimer in round 3 after being blocked earlier that round (assist Priya).")
		expect(h).toContain('2 of the 3 attacks in the game were blocked.')
		expect(h).toContain('Wave 1 went to the Titans in round 3, pushing onto the Atlantean beach.')
		expect(h).toContain('Wave 2 went to the Atlanteans in round 5, pushing back to the middle.')
		expect(h).toContain("Mo's Swift led the minion count with 3 last-hits.")
		expect(h).toContain('Hanu took down a heavy minion.')
		expect(h).toContain('The Titans took the Last Push in round 6.')
		expect(h).toContain('The Atlanteans won the fights, but the Titans won the minions.')
	})

	it('writes the group\'s template', () => {
		const r: Report = { ...draftReport(row(), 2), date: '2026-10-10', highlights: '- Mortimer walled off the minions with zombies' }
		expect(reportText(r)).toBe([
			'🛡️ Guards of Atlantis II — Weekly Game Report',
			'📅 [10.10.2026]',
			'⚔️ Match [2] — [2]v[2]',
			'🔴 Red Team (Atlanteans)',
			'- [Zara] → [Mrak]',
			'- [Priya] → [Hanu]',
			'🔵 Blue Team (Titans)',
			'- [Mo] → [Swift]',
			'- [Sam] → [Mortimer]',
			'🏆 Winner: [Blue] Team',
			'🎯 Win condition: [Last Push]',
			'🌊 Wave: 3',
			'📝 Highlights:',
			'- Mortimer walled off the minions with zombies'
		].join('\n'))
		const irl = reportText({ ...r, winner: 'none', winnerNote: 'game cancelled', wave: null, match: null, highlights: '' })
		expect(irl).toContain('🏆 Winner: Nobody — game cancelled')
		expect(irl).toContain('⚔️ Match [#]')
		expect(irl).not.toContain('🌊')
	})

	it('names the win conditions, dates and match numbers the group\'s way', () => {
		expect(conditionOf('pushed into the Titan Throne')).toBe('Lane Push')
		expect(conditionOf('won the Final Push')).toBe('Last Push')
		expect(conditionOf('Atlanteans ran out of Life Tokens')).toBe('Life Counters')
		expect(dotDate('2026-09-05')).toBe('05.09.2026')
		const day = Date.parse('2026-09-05T12:00:00')
		expect(matchNumbers([{ id: 'b', at: day + 3600e3 }, { id: 'a', at: day }, { id: 'c', at: day + 86400e3 }])).toEqual({ a: 1, b: 2, c: 1 })
	})

	it('round-trips through a table row, and searches by player, hero or highlight', () => {
		const r: Report = { id: 'irl:x', kind: 'irl', date: '2026-09-05', match: 1, red: [{ name: 'Zara', hero: 'Tali' }], blue: [{ name: 'Mo', hero: 'Wuk' }], winner: 'red', winnerNote: '', condition: 'Forfeit', wave: 3, highlights: 'Wuk got farmed' }
		const back = reportOfRow({ ...rowOfReport(r), updated_at: '2026-09-06T00:00:00Z' })
		expect(back).toMatchObject({ ...r, deleted: false })
		expect(reportOfRow({ id: 'x' })).toBeNull()
		expect(reportMatches(r, 'zara')).toBe(true)
		expect(reportMatches(r, 'WUK')).toBe(true)
		expect(reportMatches(r, 'farmed')).toBe(true)
		expect(reportMatches(r, 'priya')).toBe(false)
	})
})
