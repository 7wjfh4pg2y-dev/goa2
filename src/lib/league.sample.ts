// Made-up finished games in the exact shape the recorder uploads — for the stats page's preview
// (/stats?sample=1) and the league's tests. Deterministic: the same seed gives the same games.
import type { Team } from './match'
import type { BuildStep, GameEvent } from './recorder'
import type { GameRowIn } from './league'
import { HEROES } from './heroes'
import { heroCards } from './cards/deck'

function rng(seed: number) {
	let a = seed >>> 0
	return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const NAMES = ['Zara', 'Alson', 'Priya', 'Mo', 'Sam', 'Lee', 'Noor', 'Theo']

export function sampleRows(count = 16, seed = 7): GameRowIn[] {
	const r = rng(seed)
	const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
	const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
	const pool = HEROES.filter((h) => h.stars <= 3 && heroCards(h.id).length).map((h) => h.id)
	const rows: GameRowIn[] = []
	const start = Date.UTC(2026, 8, 1, 18)
	for (let g = 0; g < count; g++) {
		const side = r() < 0.6 ? 2 : 3
		const names = shuffle(NAMES).slice(0, side * 2)
		const heroes = shuffle(pool).slice(0, side * 2)
		const winner: Team = r() < 0.5 ? 'orange' : 'blue'
		const loser: Team = winner === 'orange' ? 'blue' : 'orange'
		const type = pick(['throne', 'throne', 'final', 'life'])
		const rounds = 2 + Math.floor(r() * 5)
		const lastTurn = 1 + Math.floor(r() * 4)
		const nTurns = (rounds - 1) * 4 + lastTurn
		const ids = names.map((_, i) => `g${g}p${i}`)
		const teamOf = (i: number): Team => (i < side ? 'orange' : 'blue')
		const players: Record<string, { name: string; seat: number; hero: string; team: Team }> = {}
		ids.forEach((id, i) => (players[id] = { name: names[i], seat: i, hero: heroes[i], team: teamOf(i) }))
		// hero defeats: the winners land more of them
		const ev: GameEvent[] = []
		const nDef = Math.floor(rounds * (1 + r() * 1.5))
		for (let k = 0; k < nDef; k++) {
			const killerTeam: Team = r() < 0.62 ? winner : loser
			const by = pick(ids.filter((_, i) => teamOf(i) === killerTeam))
			const v = pick(ids.filter((_, i) => teamOf(i) !== killerTeam))
			const a = ids.filter((id, i) => teamOf(i) === killerTeam && id !== by && r() < 0.5)
			ev.push({ k: 'hero', id: `d${g}_${k}`, r: 1 + Math.floor(r() * rounds), t: 1 + Math.floor(r() * 4), by, v, a, c: 2, ac: 1, l: 1, team: teamOf(ids.indexOf(v)) })
		}
		const nMin = Math.floor(rounds * (2 + r() * 3))
		for (let k = 0; k < nMin; k++) {
			const by = pick(ids)
			ev.push({ k: 'minion', id: `m${g}_${k}`, r: 1 + Math.floor(r() * rounds), t: 1 + Math.floor(r() * 4), by, role: pick(['melee', 'melee', 'ranged', 'heavy']), team: teamOf(ids.indexOf(by)) === 'orange' ? 'blue' : 'orange' })
		}
		// builds: the colours climb to Tier II, then to Tier III (a coin-rich hero goes on to the ultimate)
		const builds: Record<string, BuildStep[]> = {}
		const finalCards: Record<string, unknown> = {}
		ids.forEach((id, i) => {
			const hero = heroes[i]
			const deck = heroCards(hero)
			const cardOf = (colour: string, tier: number) => deck.map((c, k) => ({ c, k })).filter((x) => x.c.color === colour && x.c.level === tier).map((x) => x.k)
			const colours = shuffle(['RED', 'BLUE', 'GREEN'])
			const target = Math.min(8, 2 + Math.floor(r() * (rounds + 1)) + (teamOf(i) === winner ? 1 : 0))
			let keep: number[] = [], up: number[] = [], ult = false, lv = 1
			const steps: BuildStep[] = [{ r: 1, t: 1, lv: 1, keep: [], up: [], ult: false }]
			const order = [...colours.map((c) => [c, 2] as const), ...colours.map((c) => [c, 3] as const)]
			for (const [colour, tier] of order) {
				if (lv >= target) break
				const opts = cardOf(colour, tier)
				if (!opts.length) continue
				const take = pick(opts)
				const twin = opts.find((x) => x !== take)
				if (tier === 3) { const old = keep.find((k) => deck[k].color === colour); if (old != null) { keep = keep.filter((k) => k !== old); up = [...up, old] } }
				keep = [...keep, take]
				if (twin != null) up = [...up, twin]
				lv++
				// now and then a swap that the path must ignore: take the twin first, swap back the same round
				const rr = Math.min(rounds, 1 + Math.floor((lv - 1) / 2))
				if (r() < 0.15 && twin != null) steps.push({ r: rr, t: 4, lv, keep: [...keep.filter((k) => k !== take), twin].sort((a, b) => a - b), up: [...up.filter((k) => k !== twin), take].sort((a, b) => a - b), ult })
				steps.push({ r: rr, t: 4, lv, keep: [...keep].sort((a, b) => a - b), up: [...up].sort((a, b) => a - b), ult })
			}
			if (lv === 7 && target >= 8) { ult = true; lv = 8; steps.push({ r: rounds, t: 4, lv, keep: [...keep].sort((a, b) => a - b), up: [...up].sort((a, b) => a - b), ult }) }
			builds[id] = steps
			const coins = Math.floor(r() * 6)
			finalCards[id] = { hero, level: lv, coins, hand: [0, 1, 2, ...keep], upgrade: up, removed: [], discard: [], turns: [null, null, null, null], pending: null, items: {}, ultimate: ult }
		})
		// one snapshot per turn: the lane wanders, the winners' push ends it
		let lane = 1
		const turns = []
		const t0 = start + g * 2 * 86400000
		for (let k = 0; k < nTurns; k++) {
			if (r() < 0.25) lane = Math.max(0, Math.min(2, lane + (r() < 0.55 ? (winner === 'orange' ? 1 : -1) : winner === 'orange' ? -1 : 1)))
			turns.push({ round: Math.floor(k / 4) + 1, turn: (k % 4) + 1, at: t0 + k * 120000, life: { orange: 5, blue: 5 }, waves: 5, lane, cards: Object.fromEntries(ids.map((id) => [id, { lv: 1, coins: 0, played: null }])) })
		}
		const reason = type === 'throne' ? `pushed into the ${loser === 'orange' ? 'Atlantean' : 'Titan'} Throne` : type === 'final' ? 'won the Final Push' : `${loser === 'orange' ? 'Atlanteans' : 'Titans'} ran out of Life Tokens`
		const minutes = 35 + Math.floor(r() * 90)
		rows.push({
			id: `SAMPLE-${g}`, room: 'SAMPLE', started_at: new Date(t0).toISOString(), ended_at: new Date(t0 + minutes * 60000).toISOString(),
			winner, reason, rounds, data: {
				v: 1, seats: side * 2, mapId: 'forgotten_island', draftSystem: 'all-pick', lifeMax: 5, wavesMax: 5, players, draft: null, turns, log: [],
				final: { round: rounds, turn: lastTurn, life: { orange: 3, blue: 3 }, waves: 2, lane, wonBy: { team: winner, reason }, cards: finalCards }, ev, builds
			}
		})
	}
	return rows
}
