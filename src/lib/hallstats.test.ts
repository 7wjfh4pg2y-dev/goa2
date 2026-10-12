import { describe, it, expect } from 'vitest'
import { buildLeague } from './league'
import { sampleRows } from './league.sample'
import { buckets, heroTrend, heroRanks, matchups, heroSplits, playerRoles, winTrend, peopleMatchups, overview } from './hallstats'

describe('hall stats', () => {
	const L = buildLeague(sampleRows(24, 5))
	it('splits games into chronological chunks', () => {
		const b = buckets(L.games, 8)
		expect(b).toHaveLength(8)
		expect(b.flat()).toHaveLength(L.games.length)
		expect(buckets([], 8)).toEqual([])
	})
	it('reads a hero: trend, rank, matchups, splits', () => {
		const h = L.heroes[0]
		const t = heroTrend(L.games, h.hero)
		expect(t.labels).toHaveLength(t.pick.length)
		expect(t.win[t.win.length - 1]).toBeCloseTo((100 * h.wins) / h.games, 0)
		const r = heroRanks(L.heroes).get(h.hero)!
		expect(r.pick).toBe(1)
		const m = matchups(h, 'against')
		expect(m.best.every((x) => x.delta > 0) && m.worst.every((x) => x.delta < 0)).toBe(true)
		const sp = heroSplits(L.games, h.hero)
		expect(sp.all.games).toBe(h.games)
		expect(sp.sizes.reduce((s, x) => s + x.games, 0)).toBe(h.games)
		expect(sp.sides.reduce((s, x) => s + x.games, 0)).toBe(h.games)
	})
	it('reads a player: roles, win trend, people matchups, and the overview', () => {
		const p = L.players[0]
		expect(playerRoles(p)[0].games).toBeGreaterThan(0)
		const wt = winTrend(p.history)
		expect(wt).toHaveLength(p.games)
		expect(wt[wt.length - 1]).toBeCloseTo((100 * p.wins) / p.games, 0)
		expect(peopleMatchups(p, 'with').best.every((x) => x.delta > 0)).toBe(true)
		const o = overview(L)
		expect(o.games).toBe(L.games.length)
		expect(o.sideWins.orange + o.sideWins.blue).toBe(o.games)
	})
})
