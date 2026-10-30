import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { buildLeague, titlesOf, gameOfRow, pathOfSteps, playerKey, nemesisOf, victimOf, bestMateOf, rivalOf, START_RATING, eloDelta, kFor, K, K_NEW, PROVISIONAL, type GameRowIn } from './league'
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
		// individual Elo, everyone on the same K: close to zero-sum (each player is rated against the enemy average)
		const total = L.players.reduce((s, p) => s + p.rating, 0)
		expect(Math.abs(total - 4 * START_RATING)).toBeLessThanOrEqual(12)
	})

	it('individual Elo with a provisional K', () => {
		// equal ratings: half of K either way
		expect(eloDelta(1200, 1200, true, 20)).toBe(16)
		expect(eloDelta(1200, 1200, false, 20)).toBe(-16)
		// new players swing harder for their first PROVISIONAL games
		expect(kFor(0)).toBe(K_NEW)
		expect(kFor(PROVISIONAL - 1)).toBe(K_NEW)
		expect(kFor(PROVISIONAL)).toBe(K)
		expect(eloDelta(1200, 1200, true, 0)).toBe(24)
		// the same win is worth more to a lower-rated player than to a higher-rated teammate
		expect(eloDelta(1150, 1200, true, 20)).toBeGreaterThan(eloDelta(1250, 1200, true, 20))
		// an upset pays more than an expected result
		expect(eloDelta(1100, 1300, true, 20)).toBeGreaterThan(eloDelta(1300, 1100, true, 20))
	})

	it('teammates in one game can move by different amounts', () => {
		const L = buildLeague(sampleRows(30))
		const mixed = L.games.some((g) => {
			const ds = L.players.flatMap((p) => p.history.filter((m) => m.id === g.id && m.won).map((m) => m.delta))
			return new Set(ds).size > 1
		})
		expect(mixed).toBe(true)
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
		expect(T.priya?.map((t) => t.title)).toContain('The Executioner')
		expect(T.zara?.map((t) => t.title)).toContain('Death Magnet')
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
		expect(x('mo').ex.aces).toBe(1) // both Titans fell to the Atlanteans in round 1: the whole team gets the ace
		expect(x('priya').ex).toMatchObject({ shutdowns: 1, defends: 1, defDied: 1 })
		expect(x('sam').ex.noDefDied).toBe(1)
		const A = Object.fromEntries(L.awards.map((a) => [a.id, a]))
		const who = (id: string) => A[id].holders.map((h) => h.name)
		expect(who('first-blood')).toEqual(['Zara'])
		expect(who('rampages')).toEqual(['Zara'])
		expect(who('indomitable')).toEqual(['Priya'])
		expect(who('death-wish')).toEqual(['Sam'])
		expect(who('swinging')).toEqual(['Priya'])
		expect(who('unstoppable')).toEqual(['Zara'])
		expect(who('shutdown')).toEqual(['Priya'])
		expect(who('ace').sort()).toEqual(['Mo', 'Zara'])
		expect(A['killing-spree']).toBeUndefined() // a moment now
		expect(x('zara').ex.spree).toBe(1) // 3 in a row (the 4th, after she fell, starts a new count)
		expect(A['triple-killer'].holders).toEqual([]) // no 3 v 3 yet: up for grabs
		expect(A['ultra-killer'].hidden).toBe(true)
	})
	it('a game without clashes says nothing about defences; ties share an award', () => {
		const L = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange', [{ by: 'a', v: 'c' }, { by: 'c', v: 'a' }])])
		const A = Object.fromEntries(L.awards.map((a) => [a.id, a]))
		expect(A.indomitable.holders).toEqual([])
		expect(A.pacifist.holders).toEqual([]) // needs clashes
		expect(L.players.find((p) => p.key === 'zara')!.clashGames).toBe(0)
		expect(A['double-killer'].holders.map((h) => h.name).sort()).toEqual(['Priya', 'Zara'])
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

	describe('legacy (table) games', () => {
		const rep = (id: string, date: string, winner: 'red' | 'blue' | 'none', over: object = {}) => ({ id, date, match: 1, winner, condition: 'Last Push', winnerNote: '',
			red: [{ name: 'Zara', hero: 'Trinket', k: 2, d: 0, a: 1, mk: 6, gold: 20, lv: 6 }, { name: 'Mo?!', hero: 'Brogan', k: 0, d: 1 }],
			blue: [{ name: 'Priya', hero: 'Widget and Pyro', k: 1, d: 2 }, { name: 'Sam', hero: 'Arien' }], ...over })
		it('turns a table report into a game: heroes by name, the score sheet numbers, cancelled / void ones left out', async () => {
			const { gameOfReport, heroIdOfName } = await import('./league')
			expect(heroIdOfName('NebKherr')).toBe('nebkher')
			const g = gameOfReport(rep('irl:1', '2025-08-09', 'red'))!
			expect(g.legacy).toBe(true)
			expect(g.type).toBe('final')
			expect(g.players.map((p) => [p.name, p.hero, p.won])).toEqual([['Zara', 'trinkets', true], ['Mo', 'brogan', true], ['Priya', 'widget', false], ['Sam', 'arien', false]])
			expect(g.players[0]).toMatchObject({ kills: 2, deaths: 0, assists: 1, minions: 6, coins: 20, level: 6 })
			expect(g.players[1]).toMatchObject({ kills: 0, deaths: 1, assists: null, level: 0 })
			expect(g.players[3]).toMatchObject({ kills: null, deaths: null })
			expect(gameOfReport(rep('irl:2', '2025-08-09', 'none'))).toBeNull()
			expect(gameOfReport(rep('irl:3', '2025-08-09', 'red', { winnerNote: 'but it doesn’t count' }))).toBeNull()
		})
		it('keeps its own league, and the heroes add up across both', async () => {
			const { gameOfReport, leagueOf } = await import('./league')
			const online = buildLeague([row('g1', 1, ['Zara', 'Mo', 'Priya', 'Sam'], 'orange')])
			const legacy = leagueOf([gameOfReport(rep('irl:1', '2025-08-09', 'red'))!])
			const all = leagueOf([...online.games, ...legacy.games])
			expect(legacy.players.find((p) => p.name === 'Zara')).toMatchObject({ games: 1, wins: 1, kills: 2, kdaGames: 1, levelGames: 1, levels: 6 })
			expect(online.players.find((p) => p.name === 'Zara')?.games).toBe(1)
			expect(all.heroes.find((h) => h.hero === 'brogan')).toMatchObject({ games: 2, wins: 2 })
			expect(all.heroes.find((h) => h.hero === 'trinkets')).toMatchObject({ games: 1, kills: 2, kdaGames: 1 })
			// no rounds / minutes: never the Blitz
			expect(legacy.awards.find((a) => a.id === 'speedrun')?.holders).toEqual([])
		})
	})
})


describe('match moments', () => {
	it('Eye for an Eye: one per revenge kill, counted per game', async () => {
		const { momentsOf } = await import('./league')
		const x = { firstBlood: 0, wipe: 0, shutdowns: 0, paybacks: 2, multis: 0, aces: 0, heavies: 0, bounty: 0, giants: null, defends: null, defDied: null, noDefDied: null, beatDefended: null, relentless: null }
		expect(momentsOf(x as never)).toMatchObject([{ id: 'eye', title: 'Eye for an Eye', n: 2 }])
		expect(momentsOf({ ...x, paybacks: 0 } as never)).toEqual([])
		expect(momentsOf(undefined)).toEqual([])
	})
})

describe('Eye for an Eye: only the hero who last killed you', () => {
	it('A kills B, B kills A = one for B; B kills A again = none; A then kills B = one for A', async () => {
		const { extrasOf } = await import('./league')
		const k = (by: string, v: string, t: number) => ({ k: 'hero', by, v, r: 1, t })
		const team = { A: 'orange', B: 'blue' } as const
		const x1 = extrasOf([k('A', 'B', 1), k('B', 'A', 2)], false, { ...team })
		expect([x1.A.paybacks, x1.B.paybacks]).toEqual([0, 1])
		const x2 = extrasOf([k('A', 'B', 1), k('B', 'A', 2), k('B', 'A', 3)], false, { ...team })
		expect([x2.A.paybacks, x2.B.paybacks]).toEqual([0, 1])
		const x3 = extrasOf([k('A', 'B', 1), k('B', 'A', 2), k('B', 'A', 3), k('A', 'B', 4)], false, { ...team })
		expect([x3.A.paybacks, x3.B.paybacks]).toEqual([1, 1])
	})
})

describe('match moments: the rest', () => {
	const team = { A: 'orange', M: 'orange', B: 'blue', C: 'blue' } as const
	const h = (by: string, v: string, r: number, t: number, l = 1) => ({ k: 'hero', by, v, r, t, a: [], c: 1, ac: 0, l })
	const cl = (by: string, v: string, r: number, t: number, out = 'defended', kind = 'attack') => ({ k: 'clash', by, v, r, t, out, kind, disc: true })
	const mn = (by: string, r: number, t: number) => ({ k: 'minion', by, r, t, role: 'melee' })
	it('Savior, Punisher, Opening Strike', async () => {
		const { extrasOf } = await import('./league')
		// B attacks M (turn 1), A defeats B (turn 2) = Savior; B defeats M (r2 t3), A defeats B (r2 t4) = Punisher
		const x = extrasOf([cl('B', 'M', 1, 1), h('A', 'B', 1, 2), h('B', 'M', 2, 3), h('A', 'B', 2, 4)], true, { ...team })
		expect([x.A.savior, x.A.punisher, x.A.opening]).toEqual([1, 1, 1])
		// too late: two turns after
		const y = extrasOf([h('B', 'M', 2, 1), h('A', 'B', 2, 3)], true, { ...team })
		expect(y.A.punisher).toBe(0)
		// never across rounds: turn 4, then the next round's turn 1
		const z = extrasOf([cl('B', 'M', 1, 4), h('B', 'M', 1, 4), h('A', 'B', 2, 1)], true, { ...team })
		expect([z.A.savior, z.A.punisher]).toEqual([0, 0])
		const z2 = extrasOf([cl('B', 'M', 1, 4), h('A', 'B', 2, 1)], true, { ...team })
		expect(z2.A.savior).toBe(0)
		// the teammate fell (to anyone) before the kill: no Savior; fell after it: still a Savior
		expect(extrasOf([cl('B', 'M', 1, 1), h('C', 'M', 1, 1), h('A', 'B', 1, 2)], true, { ...team }).A.savior).toBe(0)
		expect(extrasOf([cl('B', 'M', 1, 1), h('A', 'B', 1, 2), h('C', 'M', 1, 3)], true, { ...team }).A.savior).toBe(1)
	})
	it('Killing Spree: one per life, at the 3rd in a row', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([h('A', 'B', 1, 1), h('A', 'C', 1, 2), h('B', 'A', 1, 3), h('A', 'B', 2, 1), h('A', 'C', 2, 2), h('A', 'B', 3, 1), h('A', 'C', 3, 2), h('A', 'B', 4, 1), h('A', 'C', 4, 2)], false, { ...team })
		expect(x.A.spree).toBe(1) // 2, fell, then 6 in a row = one spree (the next needs a fall first)
		const y = extrasOf([h('A', 'B', 1, 1), h('A', 'C', 1, 2), h('A', 'B', 2, 1), h('C', 'A', 2, 2), h('A', 'B', 3, 1), h('A', 'C', 3, 2), h('A', 'B', 4, 1)], false, { ...team })
		expect(y.A.spree).toBe(2)
	})
	it('Ace: every enemy hero defeated in one round; Pacifist: no attack all game', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([h('A', 'B', 1, 1), h('M', 'C', 1, 4), h('A', 'B', 2, 1), h('A', 'C', 3, 1)], true, { ...team })
		expect([x.A.aces, x.M.aces, x.B.aces]).toEqual([1, 1, 0])
		const y = extrasOf([cl('A', 'B', 1, 1), cl('C', 'M', 1, 2, 'cancel'), cl('B', 'C', 1, 3, 'none', 'force')], true, { ...team })
		expect([y.A.pacifist, y.C.pacifist, y.M.pacifist, y.B.pacifist]).toEqual([0, 0, 1, 1])
		expect(extrasOf([], false, { ...team }).A.pacifist).toBeNull()
	})
	it('Coup de Grâce: the last defeat in a Life win', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([h('A', 'B', 1, 1), h('M', 'C', 2, 1)], false, { ...team }, { winner: 'orange', type: 'life' })
		expect([x.A.coup, x.M.coup]).toEqual([0, 1])
		expect(extrasOf([h('A', 'B', 1, 1)], false, { ...team }, { winner: 'orange', type: 'throne' }).A.coup).toBe(0)
	})
	it('Denied, Breakwater (survive the round), Last Stand', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([cl('B', 'A', 1, 1), cl('B', 'A', 1, 2), cl('C', 'A', 1, 3)], true, { ...team })
		expect([x.A.denied, x.A.breakwater]).toEqual([1, 1])
		const y = extrasOf([cl('B', 'A', 1, 1), cl('B', 'A', 1, 2), h('C', 'A', 1, 4)], true, { ...team })
		expect([y.A.denied, y.A.breakwater]).toEqual([0, 0])
		const z = extrasOf([h('B', 'M', 1, 1, 5), cl('C', 'A', 1, 2), cl('B', 'A', 1, 3)], true, { ...team }, { lifeMax: 6 })
		expect(z.A.lastStand).toBe(1) // two defences, one round = one
		const z2 = extrasOf([h('B', 'M', 1, 1, 5), cl('C', 'A', 1, 2), h('B', 'A', 1, 4, 0)], true, { ...team }, { lifeMax: 6 })
		expect(z2.A.lastStand).toBe(0) // fell before the round ended
	})
	it('Clean Sweep (removals count) and Fast Start', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([mn('A', 1, 1), mn('A', 1, 1), mn('A', 1, 1), mn('M', 1, 2)], false, { ...team })
		expect([x.A.sweep, x.M.sweep, x.A.fastStart, x.M.fastStart, x.B.fastStart]).toEqual([1, 0, 1, 1, 0])
		const rm = (by: string, team: string) => ({ k: 'mrem', by, r: 2, t: 1, role: 'melee', team })
		const y = extrasOf([mn('A', 2, 1), rm('A', 'blue'), rm('A', 'blue'), mn('M', 2, 1), rm('M', 'orange'), rm('M', 'blue'), rm('M', 'blue')], false, { ...team })
		expect([y.A.sweep, y.M.sweep]).toEqual([1, 1]) // M's own minion doesn't count, the other three do
	})
	it('Blood in the Water, Bounty Claimed, Apex Predator', async () => {
		const { extrasOf } = await import('./league')
		// B falls to A three times (the third = blood, the 2nd = apex, then a fresh pair count); C's spree ended by M
		const x = extrasOf([h('A', 'B', 1, 1), h('A', 'B', 2, 1), h('A', 'B', 3, 1), h('C', 'M', 3, 2), h('C', 'A', 3, 3), h('C', 'M', 4, 1), h('M', 'C', 4, 2)], false, { ...team })
		expect([x.A.blood, x.A.apex, x.C.apex]).toEqual([1, 1, 1]) // A then fell, so A's pair count was gone anyway
		expect(x.M.shutdowns).toBe(1) // C was on 3
		const y = extrasOf([h('A', 'B', 1, 1), h('B', 'A', 1, 2), h('A', 'B', 2, 1)], false, { ...team })
		expect(y.A.apex).toBe(0) // fell in between
	})
	it('Riposte and Chain Reaction', async () => {
		const { extrasOf } = await import('./league')
		const x = extrasOf([cl('A', 'B', 1, 1), h('A', 'B', 2, 1), cl('M', 'C', 2, 2, 'none', 'force'), h('A', 'C', 2, 3), h('M', 'B', 3, 1)], true, { ...team })
		expect([x.A.riposte, x.M.riposte]).toEqual([1, 0])
		expect([x.A.chain, x.M.chain]).toEqual([1, 1]) // C: M forced a discard, A took her down
		expect(extrasOf([h('A', 'B', 1, 1)], false, { ...team }).A.chain).toBeNull()
	})
	it('Treasure Hunter: 5+ coins more than every other hero in a round', async () => {
		const { extrasOf } = await import('./league')
		const snap = (round: number, c: Record<string, [number, number]>) => ({ round, cards: Object.fromEntries(Object.entries(c).map(([k, [lv, coins]]) => [k, { lv, coins }])) })
		const snaps = [snap(1, { A: [1, 7], M: [1, 2], B: [1, 1], C: [1, 0] }), snap(2, { A: [3, 0], M: [1, 4], B: [1, 3], C: [1, 2] }), { round: 3, cards: { A: { level: 3, coins: 1 }, M: { level: 1, coins: 4 }, B: { level: 1, coins: 3 }, C: { level: 1, coins: 9 } } }]
		const x = extrasOf([], false, { ...team }, { snaps })
		// round 1: A +7 vs +2 · round 2: A spent 3 levels' worth (1 + 2) = +3 net -> no · round 3: C +7 vs ≤ +1
		expect([x.A.treasure, x.C.treasure, x.M.treasure]).toEqual([1, 1, 0])
		expect(extrasOf([], false, { ...team }).A.treasure).toBeNull()
	})
})
