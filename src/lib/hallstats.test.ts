import { describe, it, expect } from 'vitest'
import { buildLeague } from './league'
import { sampleRows } from './league.sample'
import { buckets, heroTrend, heroRanks, matchups, heroMatchups, heroMatchupsAll, heroSplits, playerRoles, winTrend, peopleMatchups, overview, heroPlayers } from './hallstats'

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
		const hm = heroMatchups(L, h.hero)!
		expect(hm.games).toBe(h.games)
		expect(hm.strong).toEqual(m.best)
		expect(hm.weak).toEqual(m.worst)
		expect(hm.partners).toEqual(matchups(h, 'with').best)
		expect(heroMatchups(L, 'nobody')).toBeNull()
		expect(heroMatchups(null, h.hero)).toBeNull()
		// the beta's version fills every row it can, even for a hero that never won
		const full = heroMatchupsAll(L, h.hero)!
		const nf = Object.keys(h.foes).length
		expect(full.strong.length).toBe(Math.min(3, Math.ceil(nf / 2)))
		expect(full.weak.length).toBe(Math.min(3, nf - full.strong.length))
		expect(full.partners.length).toBe(Math.min(3, Object.keys(h.mates).length))
		expect(new Set([...full.strong, ...full.weak].map((m) => m.hero)).size).toBe(full.strong.length + full.weak.length)
		const loser = { ...h, wins: 0, foes: { a: { games: 2, wins: 0 }, b: { games: 1, wins: 0 }, c: { games: 3, wins: 0 } }, mates: { d: { games: 1, wins: 0 } } }
		const lm = heroMatchupsAll({ heroes: [loser] } as never, h.hero)!
		expect(lm.strong.map((m) => m.hero)).toEqual(['b', 'a'])
		expect(lm.weak.map((m) => m.hero)).toEqual(['c'])
		expect(lm.partners.map((m) => m.hero)).toEqual(['d'])
		expect(heroMatchupsAll(null, h.hero)).toBeNull()
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
	it('ranks a hero\'s players by mastery: games and success together', async () => {
		const { mastery, byMastery } = await import('./hallstats')
		expect(mastery(4, 4)).toBeGreaterThan(mastery(5, 10))
		expect(mastery(3, 6)).toBeGreaterThan(mastery(1, 1))
		expect(mastery(8, 10)).toBeGreaterThan(mastery(3, 3))
		const ps = [{ key: 'a', name: 'Zara', games: 1, wins: 1 }, { key: 'b', name: 'Mo', games: 6, wins: 3 }, { key: 'c', name: 'Sam', games: 5, wins: 5 }]
		expect([...ps].sort(byMastery).map((p) => p.name)).toEqual(['Sam', 'Mo', 'Zara'])
		const top = heroPlayers(L.games).get(L.heroes[0].hero)!
		expect(top.length).toBeGreaterThan(0)
	})
})

