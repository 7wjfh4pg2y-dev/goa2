// The hero page MOCK-UPS (/heroes, GMs only): one hero's page content built from the real hero data and
// deck, with SAMPLE numbers (seeded from the hero's id — the same every time, clearly labelled on the page).
// The real page would take its numbers from the Hall of Records (league.ts / hallstats.ts) and its guides,
// builds and openings from text the group writes.
import { HEROES, heroById, TRAIT_LABELS, type Hero, type Trait } from '../heroes'
import { heroCards, type HeroCardJson } from '../cards/deck'
import { startingHand, ultimateIndex } from '../cards/cardstate'
import { LEARN_MAP } from '../learn'
import { zoneTable, hexCube, cubeDist } from '../zones'
import { hexNeighbours } from '../board/hexgeo'

const seed = (s: string, salt = 0) => { let h = 2166136261 ^ salt; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967295 }
const one = (n: number) => Math.round(n * 10) / 10

export const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Area' }
export const COLOR_HEX: Record<string, string> = { RED: '#e0473c', BLUE: '#3d8be0', GREEN: '#3fae5a', GOLD: '#e3b341', SILVER: '#b8c2cc', PURPLE: '#9b5de5' }

export type Option = { idx: number; card: HeroCardJson; taken: number; win: number }
export type TierRow = { color: 'RED' | 'BLUE' | 'GREEN'; tier: 2 | 3; a: Option; b: Option }
export type Build = { name: string; blurb: string; picks: number[]; items: string[]; win: number; games: number }
export type Turn = { turn: number; idx: number; card: HeroCardJson; plan: string; hex: string; gone?: string }
export type Matchup = { hero: string; delta: number; games: number }
export type HeroSample = {
	hero: Hero; cards: HeroCardJson[]; hand: number[]; ult: number
	tiers: TierRow[]; builds: Build[]; opening: Turn[]
	win: number; pick: number; games: number; grade: 'S' | 'A' | 'B' | 'C'
	trend: number[]; bySize: { label: string; win: number; games: number }[]; bySide: { label: string; win: number; games: number }[]
	strong: Matchup[]; weak: Matchup[]; partners: Matchup[]
	strengths: string[]; weaknesses: string[]; playstyle: string; tips: string[]
}

const STRENGTH: Record<Trait, string> = {
	damager: 'Big hits', disabler: 'Locks enemies down', durable: 'Hard to bring down', farming: 'Earns coins fast', healer: 'Keeps allies alive',
	melee: 'Strong up close', pusher: 'Moves units around', sniper: 'Hits from range', tactician: 'Sets up plays', tokens: 'Shapes the board'
}
const WEAK = ['Low damage', 'Fragile', 'Acts late', 'Slow']

const cells = LEARN_MAP.cells ?? {}
const zones = zoneTable(LEARN_MAP)
const open = (h: string) => !!cells[h] && cells[h] !== 'terrain'
const dist = (a: string, b: string) => cubeDist(hexCube(a), hexCube(b))
const zoneHexes = (z: string) => Object.keys(cells).filter((h) => zones[h] === z && open(h)).sort()
export const OPENING_WAVE = (LEARN_MAP.battleZone ?? []).map((b) => ({ id: `m_${b.hex}`, hex: b.hex, team: b.team, role: b.kind }))

export function heroSample(id: string): HeroSample {
	const hero = heroById(id) ?? HEROES[0]
	const cards = heroCards(hero.id)
	const r = (salt: number) => seed(hero.id, salt)
	const opt = (idx: number, salt: number, share: number): Option => ({ idx, card: cards[idx], taken: Math.round(share), win: one(44 + r(salt) * 16) })
	const of = (color: string, tier: number) => cards.map((c, i) => ({ c, i })).filter(({ c }) => c.color === color && c.level === tier).map(({ i }) => i)
	const tiers: TierRow[] = []
	for (const tier of [2, 3] as const) for (const [k, color] of (['RED', 'BLUE', 'GREEN'] as const).entries()) {
		const [ia, ib] = of(color, tier)
		if (ia == null || ib == null) continue
		const share = 30 + r(tier * 10 + k) * 40
		tiers.push({ color, tier, a: opt(ia, tier * 20 + k, share), b: opt(ib, tier * 30 + k, 100 - share) })
	}
	// two builds: the popular option in each colour, and the other one; colours in a seeded order
	const order = (['RED', 'BLUE', 'GREEN'] as const).map((c, k) => ({ c, v: r(70 + k) })).sort((a, b) => a.v - b.v).map((x) => x.c)
	const mk = (pickA: boolean, ord: readonly string[], salt: number): Build => {
		const picks: number[] = []
		for (const tier of [2, 3]) for (const c of ord) { const t = tiers.find((x) => x.color === c && x.tier === tier); if (t) picks.push(pickA === t.a.taken >= t.b.taken ? t.a.idx : t.b.idx) }
		// the item each pick leaves behind is its twin's
		const items = picks.map((i) => { const t = tiers.find((x) => x.a.idx === i || x.b.idx === i)!; return cards[t.a.idx === i ? t.b.idx : t.a.idx]?.item ?? '' })
		const top = Object.entries(items.reduce<Record<string, number>>((m, it) => ((m[it] = (m[it] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
		return { name: `${ITEM_NAME[top] ?? 'Balanced'} build`, blurb: pickA ? 'The usual path: the most-picked card in every colour.' : 'The other half of each pair, for a different game plan.', picks, items, win: one(46 + r(salt) * 12), games: 6 + Math.floor(r(salt + 1) * 30) }
	}
	const builds = [mk(true, order, 90), mk(false, [...order].reverse(), 95)]
	const hand = startingHand(hero.id)
	const t1 = (c: string) => hand.find((i) => cards[i]?.color === c) ?? hand[0]

	// the opening, played on the real board as the Titans: spawn → the beach → the battle zone
	const spawn = Object.keys(cells).filter((h) => cells[h] === 'baseBlueSpawn').sort()[0]
	const beach = zoneHexes('Blue Beach').sort((a, b) => dist(a, '9_10') - dist(b, '9_10'))[0]
	const target = OPENING_WAVE.filter((m) => m.team === 'orange' && m.role === 'melee').sort((a, b) => dist(a.hex, beach) - dist(b.hex, beach))[0]
	const taken = new Set(OPENING_WAVE.map((m) => m.hex))
	const next = hexNeighbours(target.hex).filter((h) => open(h) && !taken.has(h)).sort((a, b) => dist(a, beach) - dist(b, beach))[0]
	const opening: Turn[] = [
		{ turn: 1, idx: t1('GREEN'), card: cards[t1('GREEN')], plan: 'Fast travel to your beach, next to the battle zone. Nobody can reach you yet.', hex: beach },
		{ turn: 2, idx: t1('RED'), card: cards[t1('RED')], plan: 'Step in and defeat the closest enemy minion: the first 2 coins.', hex: next, gone: target.id },
		{ turn: 3, idx: t1('BLUE'), card: cards[t1('BLUE')], plan: 'Use your skill to set up the next fight, or hold the line beside your minions.', hex: next },
		{ turn: 4, idx: hand[0], card: cards[hand[0]], plan: 'Finish the round with your gold card, then count the minions for the battle.', hex: next }
	]

	const win = one(45 + r(1) * 13), pick = one(3 + r(2) * 14), games = 8 + Math.floor(r(3) * 50)
	const grade = win >= 55 ? 'S' : win >= 51.5 ? 'A' : win >= 48 ? 'B' : 'C'
	let w = win - 4 + r(4) * 3
	const trend = Array.from({ length: 8 }, (_, k) => (w = one(Math.max(30, Math.min(70, w + (r(10 + k) - 0.45) * 4)))))
	const others = HEROES.filter((h) => h.id !== hero.id).map((h) => ({ h: h.id, v: seed(hero.id + h.id) })).sort((a, b) => a.v - b.v)
	const mu = (ids: { h: string; v: number }[], sign: number): Matchup[] => ids.map((x) => ({ hero: x.h, delta: one(sign * (3 + x.v * 12)), games: 3 + Math.floor(seed(x.h, 7) * 12) }))
	const lows = hero.stats.map((s, k) => ({ k, v: s[1] })).filter((s) => s.v <= 3).map((s) => WEAK[s.k])
	const roles = hero.traits.map((t) => TRAIT_LABELS[t].toLowerCase())
	return {
		hero, cards, hand, ult: ultimateIndex(hero.id), tiers, builds, opening,
		win, pick, games, grade, trend,
		bySize: [{ label: '2 v 2', win: one(win - 3 + r(5) * 6), games: Math.round(games * 0.6) }, { label: '3 v 3', win: one(win - 3 + r(6) * 6), games: Math.round(games * 0.4) }],
		bySide: [{ label: 'Atlanteans', win: one(win - 3 + r(7) * 6), games: Math.round(games / 2) }, { label: 'Titans', win: one(win - 3 + r(8) * 6), games: games - Math.round(games / 2) }],
		strong: mu(others.slice(0, 3), 1), weak: mu(others.slice(-3).reverse(), -1), partners: mu(others.slice(3, 6), 1),
		strengths: hero.traits.slice(0, 4).map((t) => STRENGTH[t]),
		weaknesses: lows.length ? lows : ['Few weak spots — but no single thing it does best'],
		playstyle: `${hero.name} is a ${roles.slice(0, -1).join(', ')}${roles.length > 1 ? ' and ' : ''}${roles[roles.length - 1]}. ${hero.stars <= 1 ? 'A good first hero: the cards do what they say.' : hero.stars === 2 ? 'Easy to pick up, with a few tricks to learn.' : 'Takes a few games to master.'}`,
		tips: [
			`Open with your green card to fast travel: ${hero.name} wants to be in the fight from turn 2.`,
			`Your ${cards[t1('RED')]?.name ?? 'red card'} is the card to save for a hero, not a minion, once the enemy is in range.`,
			'Level red first if your team needs kills, blue first if it needs control.'
		]
	}
}
