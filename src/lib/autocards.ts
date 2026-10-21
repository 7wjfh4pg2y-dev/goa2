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
}

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
const RE_AURA = /enemy heroes (in radius|adjacent to you) cannot/i
export function auraRadius(cs: PlayerCardState, c: HeroCardJson | undefined): number | null {
	const m = RE_AURA.exec(textOf(c))
	if (!m) return null
	return m[1].startsWith('adjacent') ? 1 : reachOf(cs, c, 'radius')
}
