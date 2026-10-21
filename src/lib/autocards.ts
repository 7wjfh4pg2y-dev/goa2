// 1–3★ card automation (the long-term project, 2026-10-21): the game takes over the bookkeeping a card asks for —
// who qualifies for its discard, immunity, coins, the battle count — and leaves the judgement to the players.
// Everything here is in the LAB first: it only runs in a game created with Lab rules (`labRules`, GMs only) until
// the hero's id joins AUTO_LIVE. Cards are read by their TEXT, like heropower.ts (no import of match.ts: turn facts
// come in as plain values).
import type { GameMap } from './maps'
import type { Piece } from './match' // types only (match.ts imports this file)
import { statDeltas, type PlayerCardState } from './cards/cardstate'
import { heroCards, type HeroCardJson } from './cards/deck'
import { hexCube, cubeDist } from './zones'
import { hexNeighbour, hexNeighbours } from './board/hexgeo'

/** heroes whose automation has left the lab (runs in every game) */
export const AUTO_LIVE: string[] = []

type Pc = Piece
export type Immune = { span: 'turn' | 'round'; key: string; except?: string; card: string }
export type AutoS = {
	labRules?: boolean
	round: number
	turn: number
	cards?: Record<string, PlayerCardState>
	pieces?: Record<string, Pc>
	map?: GameMap | null
	immune?: Record<string, Immune[]>
	attacks?: Record<string, { by: string; discarded?: boolean; card?: number }>
	effects?: { pid: string; hero: string; idx: number }[]
	/** a defeated minion a card may still save (Brogan's Shield / Bolster / Fortify) */
	saving?: Saving | null
	/** how many heroes fell this round (War Drummer / Master Skald) */
	fallen?: { round: number; n: number }
	/** once-per-card marks of the automated moves (`turn key : acting index`) */
	auto?: Record<string, { gift?: string }>
}
export type Saving = { piece: Pc; by: string; saver: string; card: string; kind: 'silver' | 'basic'; at: number }

/** is this player's hero automated in this game? */
export const autoOn = (s: Pick<AutoS, 'labRules' | 'cards'>, pid: string) => !!s.labRules || AUTO_LIVE.includes(s.cards?.[pid]?.hero ?? '')
export const cardOf = (cs: PlayerCardState | undefined, idx: number | null | undefined): HeroCardJson | undefined => (cs && idx != null && idx >= 0 ? heroCards(cs.hero)[idx] : undefined)
/** the card's text on one line ('Choose one' marks dropped) */
export const textOf = (c: HeroCardJson | undefined) => (c?.description ?? '').replace(/>/g, ' ').replace(/\s+/g, ' ')
/** the card's range / radius with the player's items (null = the card has none) */
export function reachOf(cs: PlayerCardState, c: HeroCardJson | undefined, kind: 'range' | 'radius'): number | null {
	if (!c || c.modifier !== (kind === 'range' ? 'RANGE' : 'AREA') || c.modifierValue == null) return null
	return c.modifierValue + (statDeltas(cs)[kind] ?? 0)
}
export const hexDist = (a: string, b: string) => cubeDist(hexCube(a), hexCube(b))
const turnKeyOf = (s: Pick<AutoS, 'round' | 'turn'>) => `${s.round}-${s.turn}`

// ── B. Immunity ──
/** the immunities on a player right now */
export function immuneNow(s: AutoS, pid: string): Immune[] {
	return (s.immune?.[pid] ?? []).filter((i) => (i.span === 'turn' ? i.key === turnKeyOf(s) : i.key === String(s.round)))
}
/** may `by` not attack `target`? (immune to every enemy attack but the one excepted) */
export const attackBarred = (s: AutoS, by: string, target: string) => immuneNow(s, target).some((i) => i.except !== by)

// ── Arien ──
// Aspiring / Expert / Master Duelist (defence): "Ignore all minion defense modifiers" — and Expert / Master: "This
// turn / round: You are immune to attack actions of all enemy heroes, except this attacker."
export const RE_NO_MINION_MODS = /ignore all minion defense modifiers/i
const RE_DUEL_IMMUNE = /immune to attack actions of all enemy heroes, except this attacker/i
/** the card a defender discarded to defend this attack (undefined = not yet, or not automated) */
export function defenceCard(s: AutoS, target: string): HeroCardJson | undefined {
	const a = s.attacks?.[target]
	if (!a?.discarded || !autoOn(s, target)) return undefined
	return cardOf(s.cards?.[target], a.card)
}
/** what a defence card switches on once it is discarded: the immunities to add (null = nothing) */
export function defenceImmunity(s: AutoS, target: string): Record<string, Immune[]> | null {
	const a = s.attacks?.[target], c = defenceCard(s, target)
	if (!a || !c || !RE_DUEL_IMMUNE.test(textOf(c))) return null
	const span: Immune['span'] = c.traits?.includes('THIS_ROUND') ? 'round' : 'turn'
	const key = span === 'turn' ? turnKeyOf(s) : String(s.round)
	const keep = immuneNow(s, target).filter((i) => i.card !== c.name)
	return { ...(s.immune ?? {}), [target]: [...keep, { span, key, except: a.by, card: c.name }] }
}

// Dangerous Current / Raging Stream / Violent Torrent: "Before the attack: Up to 1 enemy hero in any of the N spaces in
// a straight line directly behind the target discards a card, or is defeated."
const RE_BEHIND = /enemy hero in any of the (\d+) spaces in a straight line directly behind the target discards a card(, or is defeated)?/i
export function behindRule(c: HeroCardJson | undefined): { n: number; die: boolean } | null {
	const m = RE_BEHIND.exec(textOf(c))
	return m ? { n: Number(m[1]), die: !!m[2] } : null
}
/** the spaces straight behind `target` seen from `from` (adjacent), up to n; [] when they aren't next to each other */
export function spacesBehind(from: string, target: string, n: number): string[] {
	const k = [0, 1, 2, 3, 4, 5].find((d) => hexNeighbour(from, d) === target)
	if (k == null) return []
	const out: string[] = []
	let h = target
	for (let i = 0; i < n; i++) { h = hexNeighbour(h, k); out.push(h) }
	return out
}
/** the enemy heroes of `pid` standing on those spaces (piece ids of hero bodies) */
export function heroesOn(s: AutoS, pid: string, hexes: string[]): Pc[] {
	const team = s.pieces?.[pid]?.team
	const at = new Set(hexes)
	return Object.values(s.pieces ?? {}).filter((p) => p.kind === 'hero' && p.team !== team && at.has(p.hex))
}

// Liquid Leap / Magical Current: "Place yourself into a space in range without a spawn point and not adjacent to an
// empty spawn point." · Stranger Tide: "… without a spawn point."
const RE_LEAP = /place yourself into a space in range without a spawn point( and not adjacent to an empty spawn point)?/i
/** every spawn point on the map: the minion spawn points + the heroes' (`heroSpawns` from the caller) */
export function spawnPoints(map: GameMap | null | undefined, heroSpawns: string[]): Set<string> {
	const cells = map?.cells ?? {}
	return new Set([...Object.keys(cells).filter((h) => cells[h] === 'spawnOrange' || cells[h] === 'spawnBlue'), ...heroSpawns])
}
/** the spaces the acting card lets `pid` land on (null = the card doesn't place them) */
export function leapSpaces(s: AutoS, pid: string, c: HeroCardJson | undefined, spawns: Set<string>): string[] | null {
	const m = RE_LEAP.exec(textOf(c))
	const cs = s.cards?.[pid], me = s.pieces?.[pid]
	if (!m || !cs || !me) return null
	const range = reachOf(cs, c, 'range') ?? 0
	const cells = s.map?.cells ?? {}
	const taken = new Set(Object.values(s.pieces ?? {}).filter((p) => !p.attachedTo).map((p) => p.hex))
	const emptySpawn = (h: string) => spawns.has(h) && !taken.has(h)
	return Object.keys(cells).filter((h) => cells[h] !== 'terrain' && h !== me.hex && !taken.has(h) && !spawns.has(h) && hexDist(h, me.hex) <= range
		&& !(m[1] && hexNeighbours(h).some(emptySpawn)))
}

// Arcane Whirlpool / Ebb and Flow: "Swap with an enemy minion in range"
const RE_SWAP_MINION = /swap with an enemy minion in range/i
export function swapMinions(s: AutoS, pid: string, c: HeroCardJson | undefined): string[] | null {
	const cs = s.cards?.[pid], me = s.pieces?.[pid]
	if (!RE_SWAP_MINION.test(textOf(c)) || !cs || !me) return null
	const range = reachOf(cs, c, 'range') ?? 0
	return Object.values(s.pieces ?? {}).filter((p) => p.kind === 'minion' && p.team !== me.team && hexDist(p.hex, me.hex) <= range).map((p) => p.id)
}

// Spell Break / Slippery Ground / Deluge: a lingering effect on the enemy heroes round him — drawn as his radius while it
// is on (adjacent = radius 1), so everyone sees who is in it
// (Brogan's Bulwark: "You and friendly units in radius cannot be moved…"; his Shields: "any friendly minion in radius")
const RE_AURA = /enemy heroes (in radius|adjacent to you) cannot|(friendly units) in radius cannot be moved|(friendly minion) in radius is defeated/i
export function auraRadius(cs: PlayerCardState, c: HeroCardJson | undefined): number | null {
	const m = RE_AURA.exec(textOf(c))
	if (!m) return null
	return m[1]?.startsWith('adjacent') ? 1 : reachOf(cs, c, 'radius')
}

// ── Shared: the card that is acting, and "the turn's mark" for once-per-card moves ──
/** the player's acting card, if they are the one acting and automated (`actor` / `at` from match.ts) */
export function actingCard(s: AutoS, pid: string, actor: string | null): HeroCardJson | undefined {
	if (!actor || actor !== pid || !autoOn(s, pid)) return undefined
	return cardOf(s.cards?.[pid], s.cards?.[pid]?.pending)
}
export const markOf = (s: Pick<AutoS, 'round' | 'turn'>, at: number) => `${turnKeyOf(s)}:${at}`
/** the hero's card in play this turn (resolved or not; undefined = none) */
export function cardThisTurn(s: AutoS, pid: string): HeroCardJson | undefined {
	const cs = s.cards?.[pid]
	return cardOf(cs, cs?.turns?.[s.turn - 1] ?? cs?.pending)
}

// ── Discards the acting card asks of an enemy: who qualifies ──
// Brogan's Shield Bash / Counterattack: "An enemy hero adjacent to you who has played an attack card this turn discards
// a card, if able / or is defeated."
const RE_BASH = /an enemy hero adjacent to you who has played an attack card this turn discards a card(, or is defeated)?/i
export type DiscardOffer = { targets: string[]; die: boolean; card: string }
/** the enemy heroes (player ids) the acting card makes discard, or null when the card asks for none */
export function discardOffer(s: AutoS, pid: string, c: HeroCardJson | undefined): DiscardOffer | null {
	const t = textOf(c), me = s.pieces?.[pid]
	if (!c || !me) return null
	const bash = RE_BASH.exec(t)
	if (bash) {
		const near = new Set(hexNeighbours(me.hex))
		const targets = heroIds(s, pid).filter((h) => near.has(s.pieces![h].hex) && cardThisTurn(s, h)?.primaryAction === 'ATTACK')
		return { targets, die: !!bash[1], card: c.name }
	}
	return null
}
/** the enemy players whose main hero piece is on the board */
const heroIds = (s: AutoS, pid: string) => Object.keys(s.cards ?? {}).filter((h) => h !== pid && s.pieces?.[h]?.kind === 'hero' && s.pieces[h].team !== s.pieces?.[pid]?.team)

// ── Coins the acting card hands out ──
// War Drummer / Master Skald: "A friendly hero in range gains N coin(s); if any hero was defeated this round, that
// friendly hero gains M coins instead."
const RE_DRUM = /a friendly hero in range gains (\d+) coins?; if any hero was defeated this round, that friendly hero gains (\d+) coins instead/i
export type GiftOffer = { targets: string[]; amount: number; card: string }
export function giftOffer(s: AutoS, pid: string, c: HeroCardJson | undefined): GiftOffer | null {
	const m = RE_DRUM.exec(textOf(c)), cs = s.cards?.[pid], me = s.pieces?.[pid]
	if (!m || !c || !cs || !me) return null
	const range = reachOf(cs, c, 'range') ?? 0
	const amount = Number(s.fallen?.round === s.round && s.fallen.n > 0 ? m[2] : m[1])
	// a friendly hero = his team's heroes, him too
	const targets = Object.keys(s.cards ?? {}).filter((h) => s.pieces?.[h]?.kind === 'hero' && s.pieces[h].team === me.team && hexDist(s.pieces[h].hex, me.hex) <= range)
	return { targets, amount, card: c.name }
}

// ── Brogan's Shield / Bolster / Fortify: "This round: When any friendly minion in radius is defeated you may discard a
// silver (Fortify: basic) card. If you do, the minion is not removed." — the defeated minion waits while he decides ──
const RE_SAVE = /when any friendly minion in radius is defeated you may discard a (silver|basic) card/i
/** who may save this minion now (null = nobody): an automated hero with such an effect on, the minion in his radius,
 *  and a card of that kind in hand */
export function saverFor(s: AutoS, minionId: string): { pid: string; kind: 'silver' | 'basic'; card: string } | null {
	const m = s.pieces?.[minionId]
	if (!m || m.kind !== 'minion') return null
	for (const e of s.effects ?? []) {
		const c = heroCards(e.hero)[e.idx], cs = s.cards?.[e.pid], me = s.pieces?.[e.pid]
		const r = RE_SAVE.exec(textOf(c))
		if (!r || !cs || !me || me.team !== m.team || !autoOn(s, e.pid)) continue
		const radius = reachOf(cs, c, 'radius') ?? 0
		const kind = r[1].toLowerCase() as 'silver' | 'basic'
		if (hexDist(me.hex, m.hex) <= radius && saveCards(cs, kind).length) return { pid: e.pid, kind, card: c!.name }
	}
	return null
}
/** the cards in hand that pay for the save (silver first) */
export function saveCards(cs: PlayerCardState, kind: 'silver' | 'basic'): number[] {
	const cards = heroCards(cs.hero)
	const ok = (i: number) => cards[i]?.color === 'SILVER' || (kind === 'basic' && cards[i]?.color === 'GOLD')
	return cs.hand.filter(ok).sort((a, b) => (cards[a]?.color === 'SILVER' ? 0 : 1) - (cards[b]?.color === 'SILVER' ? 0 : 1))
}

// ── Battle count: heroes who count as minions (Brogan's One Man Army) ──
const RE_ARMY = /during minion battle you count as a heavy minion/i
/** extra minions per team in the battle zone's count */
export function battleExtras(s: AutoS, inZone: (hex: string) => boolean): Record<'orange' | 'blue', number> {
	const out = { orange: 0, blue: 0 }
	for (const [pid, cs] of Object.entries(s.cards ?? {})) {
		const me = s.pieces?.[pid]
		if (!cs.ultimate || !me || me.kind !== 'hero' || !autoOn(s, pid) || !inZone(me.hex)) continue
		const ult = heroCards(cs.hero).find((c) => c.color === 'PURPLE')
		if (RE_ARMY.test(textOf(ult)) && (me.team === 'orange' || me.team === 'blue')) out[me.team]++
	}
	return out
}
