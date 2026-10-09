import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { buildLeague, titlesOf, gameOfRow, pathOfSteps, playerKey, nemesisOf, victimOf, bestMateOf, rivalOf, START_RATING, type GameRowIn } from './league'
import { sampleRows } from './league.sample'
import type { BuildStep, GameEvent } from './recorder'

// a tiny 2 v 2 with events: the shape the recorder uploads
function row(id: string, day: number, names: [string, string, string, string], winner: 'orange' | 'blue', ev: Partial<GameEvent>[] = [], reason = 'pushed into the Titan Throne'): GameRowIn {
	const ids = ['a', 'b', 'c', 'd']
	const heroes = ['arien', 'brogan', 'tigerclaw', 'wasp']
	const players = Object.fromEntries(ids.map((x, i) => [x, { name: names[i], seat: i, hero: heroes[i], team: i < 2 ? 'orange' : 'blue' }]))
	const turns = [1, 2, 3, 4].map((t) => ({ round: 1, turn: t, at: 0, life: { orange: 5, blue: 5 }, waves: 5, lane: 1, cards: {} }))
	const cards = Object.fromEntries(ids.map((x, i) => [x, { hero: heroes[i], level: 2, coins: 1, upgrade: [10], hand: [0, 7], ultimate: false }]))
	return {
		id, started_at: new Date(Date.UTC(2026, 9, day, 18)).toISOString(), ended_at: new Date(Date.UTC(2026, 9, day, 19)).toISOString(), winner, reason, rounds: 1,
		data: { seats: 4, players, turns, final: { round: 1, turn: 4, lane: 1, wonBy: { team: winner, reason }, cards }, ev: ev.map((e, i) => ({ k: 'hero', id: `${id}${i}`, r: 1, t: 2, a: [], c: 2, ac: 1, l: 1, team: null, ...e })) }
	}
}

describe('the league', () => {
	it('matches people by name, whatever the case or spacing', () => {
		expect(playerKey('  Zara ')).toBe(playerKey('zara'))
		const L = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange'), row('g2', 2, ['zara ', 'Sam', 'Priya', 'Mo'], 'blue')])
		const z = L.players.find((p) => p.key === 'zara')!
		expect(z.games).toBe(2)
		expect(z.name).toBe('zara') // the latest spelling
		expect([z.wins, z.losses]).toEqual([1, 1])
	})

	it('records, streaks, win types, ratings', () => {
		const L = buildLeague([
			row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange'),
			row('g2', 2, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [], 'won the Final Push'),
			row('g3', 3, ['Zara', 'Mo', 'Priya', 'Sam'], 'blue', [], 'Atlanteans ran out of Life Tokens')
		])
		const z = L.players.find((p) => p.key === 'zara')!
		expect([z.wins, z.losses, z.streak, z.bestStreak]).toEqual([2, 1, -1, 2])
		expect(z.byType.throne).toEqual({ games: 1, wins: 1 })
		expect(z.byType.final).toEqual({ games: 1, wins: 1 })
		expect(z.byType.life).toEqual({ games: 1, wins: 0 })
		expect(z.ratingHist[0]).toBe(START_RATING)
		expect(z.ratingHist).toHaveLength(4)
		// a team Elo: what one side gains the other loses
		const total = L.players.reduce((s, p) => s + p.rating, 0)
		expect(Math.abs(total - 4 * START_RATING)).toBeLessThanOrEqual(4)
	})

	it('kills, deaths, assists, nemesis, favourite victim, team-mates', () => {
		const L = buildLeague([
			row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [{ by: 'c', v: 'a' }, { by: 'c', v: 'a', a: ['d'] }, { by: 'a', v: 'd', a: ['b'] }]),
			row('g2', 2, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [{ by: 'd', v: 'a' }])
		])
		const z = L.players.find((p) => p.key === 'zara')!
		expect([z.kills, z.deaths, z.assists, z.kdaGames]).toEqual([1, 3, 0, 2])
		expect(nemesisOf(z)?.name).toBe('Priya') // 2 defeats beats Sam's 1
		expect(victimOf(z)?.name).toBe('Sam')
		expect(bestMateOf(z)).toMatchObject({ name: 'Mo', games: 2, wins: 2 })
		expect(rivalOf(z)?.games).toBe(2)
		const mo = L.players.find((p) => p.key === 'mo')!
		expect(mo.assists).toBe(1)
		expect(z.teamKills).toBe(1) // orange's one defeat, in two games
		expect(L.players.find((p) => p.key === 'priya')!.teamKills).toBe(3)
		// awards → titles: Priya has the most kills, Zara the most deaths
		const T = titlesOf(L)
		expect(T.priya?.map((t) => t.title)).toContain('Bloodthirsty!')
		expect(T.zara?.map((t) => t.title)).toContain('Respawn Enthusiast!')
		expect(T.priya?.map((t) => t.title)).toContain('Double-Killer') // 2 kills in one 2 v 2
	})

	it('a level-up path keeps the order taken, drops a swap or an undo, keeps a tier II that a tier III replaced', () => {
		// arien: 7 / 10 = the BLUE Tier II twins, 13 = BLUE Tier III, 8 = RED Tier II
		const steps: BuildStep[] = [
			{ r: 1, t: 4, lv: 2, keep: [10], up: [7], ult: false },
			{ r: 1, t: 4, lv: 2, keep: [7], up: [10], ult: false }, // swapped to the twin: 10 was never really taken
			{ r: 2, t: 4, lv: 3, keep: [7, 8], up: [10, 11], ult: false },
			{ r: 3, t: 4, lv: 4, keep: [8, 13], up: [7, 10, 11, 16], ult: false } // 7 climbed to 13: both count
		]
		expect(pathOfSteps('arien', steps).cards).toEqual([7, 8, 13])
	})

	it('older games (no events, no build steps) still count for the record, not for K/D/A', () => {
		const old = row('old', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange')
		delete old.data.ev
		const g = gameOfRow(old)!
		expect(g.events).toBe(false)
		expect(g.players[0].kills).toBeNull()
		expect(g.players[0].path).toMatchObject({ cards: [7], ordered: false })
		const L = buildLeague([old])
		expect(L.players.find((p) => p.key === 'zara')).toMatchObject({ games: 1, wins: 1, kdaGames: 0 })
	})

	it('the sample league adds up', () => {
		const L = buildLeague(sampleRows(20, 3))
		expect(L.games).toHaveLength(20)
		const sum = (f: (p: (typeof L.players)[number]) => number) => L.players.reduce((s, p) => s + f(p), 0)
		expect(sum((p) => p.kills)).toBe(sum((p) => p.deaths)) // every defeat has a killer and a fallen
		expect(sum((p) => p.wins) + sum((p) => p.losses)).toBe(sum((p) => p.games))
		expect(L.heroes.reduce((s, h) => s + h.games, 0)).toBe(sum((p) => p.games))
		expect(L.heroes.some((h) => h.paths.length > 0)).toBe(true)
		expect(L.awards.filter((a) => a.holders.length).length).toBeGreaterThan(10)
	})

	it("each player's log matches their totals: every defeat, fall and assist listed with its round and turn", () => {
		const L = buildLeague(sampleRows(20, 3))
		for (const p of L.players) {
			expect(p.history).toHaveLength(p.games)
			const ev = p.history.filter((m) => m.k != null)
			expect(ev.reduce((n, m) => n + m.kills.length, 0)).toBe(p.kills)
			expect(ev.reduce((n, m) => n + m.deaths.length, 0)).toBe(p.deaths)
			expect(ev.reduce((n, m) => n + m.assisted.length, 0)).toBe(p.assists)
			for (const m of ev) {
				expect(m.kills.length).toBe(m.k)
				expect([...m.kills, ...m.deaths].every((x) => x.r >= 1 && x.t >= 1 && x.t <= 4)).toBe(true)
			}
			expect(p.minutes).toBe(p.history.reduce((n, m) => n + m.minutes, 0))
			expect(p.firstAt).toBeLessThanOrEqual(p.lastAt)
			expect(p.peak).toBeGreaterThanOrEqual(p.rating)
			expect(p.mRoles.melee + p.mRoles.ranged + p.mRoles.heavy).toBeGreaterThan(0)
		}
	})
})

describe('heroes', () => {
	it('team-mates and opponents by hero, victory types, K/D/A and impact', () => {
		const one = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [{ by: 'a', v: 'c' }])])
		const arien = one.heroes.find((h) => h.hero === 'arien')!
		expect(arien.mates).toEqual({ brogan: { games: 1, wins: 1 } })
		expect(arien.foes).toEqual({ tigerclaw: { games: 1, wins: 1 }, wasp: { games: 1, wins: 1 } })
		expect(arien.byType.throne).toEqual({ games: 1, wins: 1 })
		expect([arien.kills, arien.deaths, arien.kdaGames]).toEqual([1, 0, 1])
		expect(arien.impact).toBeNull() // nobody has two games yet
		// Zara wins on Arien, loses on another hero: Arien beats their own average
		const r2 = row('g2', 2, ['Zara', 'Mo', 'Priya', 'Sam'], 'blue')
		r2.data.players.a.hero = 'dodger'
		const two = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange'), r2])
		expect(two.heroes.find((h) => h.hero === 'arien')!.impact).toBe(50)
		expect(two.heroes.find((h) => h.hero === 'dodger')!.impact).toBe(-50)
	})
})

describe('the awards and the extras', () => {
	// a, b = Atlanteans · c, d = Titans; clashes recorded (evv 2)
	const clashRow = (id: string, ev: Partial<GameEvent>[], winner: 'orange' | 'blue' = 'orange') => { const r = row(id, 5, ['Zara', 'Mo', 'Priya', 'Sam'], winner, ev); r.data.evv = 2; return r }
	it('first blood, shutdown, payback, rampage, doubles, defences and the rest — per game and per career', () => {
		const L = buildLeague([clashRow('g1', [
			{ k: 'clash', kind: 'attack', by: 'a', v: 'c', out: 'defended', disc: true, r: 1, t: 1 }, // Priya defends
			{ by: 'a', v: 'c', r: 1, t: 2 }, // first blood — on a hero Zara already attacked this round (relentless)
			{ k: 'clash', kind: 'attack', by: 'a', v: 'c', out: 'died', disc: true, r: 1, t: 2 }, // …who had defended (unstoppable / went down swinging)
			{ by: 'a', v: 'd', r: 1, t: 2 }, // a double in one turn, and both Titans down: a rampage
			{ k: 'clash', kind: 'attack', by: 'a', v: 'd', out: 'died', disc: false, r: 1, t: 2 }, // Sam took it (death wish)
			{ k: 'ace', team: 'orange', r: 1, t: 2 },
			{ by: 'a', v: 'c', r: 1, t: 3 }, // Zara on a 3-streak…
			{ by: 'c', v: 'a', r: 1, t: 4 }, // …shut down by Priya
			{ by: 'a', v: 'c', r: 2, t: 1 } // payback
		])])
		const x = (k: string) => L.players.find((p) => p.key === k)!
		expect(x('zara').ex).toMatchObject({ firstBlood: 1, wipe: 1, multis: 1, relentless: 2, beatDefended: 1, paybacks: 1, aces: 1 }) // round 1: both later kills on Priya came after an earlier attack on her
		expect(x('mo').ex.aces).toBe(1) // the whole team gets the ace
		expect(x('priya').ex).toMatchObject({ shutdowns: 1, defends: 1, defDied: 1 })
		expect(x('sam').ex.noDefDied).toBe(1)
		const A = Object.fromEntries(L.awards.map((a) => [a.id, a]))
		const who = (id: string) => A[id].holders.map((h) => h.name)
		expect(who('first-blood')).toEqual(['Zara'])
		expect(who('rampage')).toEqual(['Zara'])
		expect(who('untouchable')).toEqual(['Priya'])
		expect(who('death-wish')).toEqual(['Sam'])
		expect(who('swinging')).toEqual(['Priya'])
		expect(who('unstoppable')).toEqual(['Zara'])
		expect(who('shutdown')).toEqual(['Priya'])
		expect(who('ace').sort()).toEqual(['Mo', 'Zara'])
		expect(who('killing-spree')).toEqual(['Zara'])
		expect(A['killing-spree'].value).toBe('4 kills')
		expect(A['triple-killer'].holders).toEqual([]) // no 3 v 3 yet: up for grabs
		expect(A['ultra-killer'].hidden).toBe(true)
	})
	it('a game without clashes says nothing about defences; ties share an award', () => {
		const L = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [{ by: 'a', v: 'c' }, { by: 'c', v: 'a' }])])
		const A = Object.fromEntries(L.awards.map((a) => [a.id, a]))
		expect(A.untouchable.holders).toEqual([])
		expect(L.players.find((p) => p.key === 'zara')!.clashGames).toBe(0)
		expect(A['killing-spree'].holders.map((h) => h.name).sort()).toEqual(['Priya', 'Zara'])
	})
})

describe('reading the table', () => {
	it('asks only for the parts the league reads, and puts them back together', async () => {
		const { LEAGUE_SELECT, rowOfSelect } = await import('./league')
		expect(LEAGUE_SELECT).toContain('d_ev:data->ev')
		expect(LEAGUE_SELECT).not.toContain('log')
		const r = rowOfSelect({ id: 'x', started_at: 'a', ended_at: 'b', winner: 'blue', reason: null, rounds: 2, d_seats: 4, d_ev: [], d_builds: null })
		expect(r.data).toEqual({ seats: 4, ev: [] })
	})
})
