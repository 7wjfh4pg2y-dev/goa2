// The minion lane: which zone is the battle zone, the end-of-round minion battle,
// and pushes (a team with no minions left in the battle zone gets pushed back).
//
// Rules implemented:
// - The lane runs Orange Beach · Center · Blue Beach; the battle starts in the Center.
// - Minion battle (end of round): each team counts its minions in the battle zone;
//   the team with fewer removes the difference (their choice, heavies last).
//   Removed minions give no coins.
// - Push: the moment a team's last minion in the battle zone (its heavy — heavies go
//   last) is defeated or removed — mid-turn or during the battle — the other team
//   pushes (the end of each turn re-checks as a backstop): one wave counter comes off, every
//   minion in the zone is removed, the zone moves one step towards the loser's throne
//   and a fresh wave spawns on that zone's spawn points. Pushing past the last zone
//   (into the throne) or taking the last wave counter wins the game.
import { teamName, teamAdj, placeName } from './teams'
import type { GameMap } from './maps'
import type { MatchState, Piece, Team } from './match'
import { zoneTable, hexCube, cubeDist } from './zones'
import { isTurret } from './tokens'

export const LANE = ['Orange Beach', 'Center', 'Blue Beach'] as const
export const START_LANE = 1

/** A push, for the "wave advances" splash every client plays once. */
export interface PushNews {
	id: string
	winner: Team
	from: string // the zone that was the battle zone
	to: string | null // the new battle zone (null: the game ended)
	wavesBefore: number
	wavesAfter: number
	won: string | null // the game-winning reason, if this push won it
	at: number
}

export interface Battle {
	orange: number
	blue: number
	loser: Team | null
	remove: number // minions the loser still has to take off
}

const other = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')

export const laneOf = (s: Pick<MatchState, 'lane'>) => Math.max(0, Math.min(LANE.length - 1, s.lane ?? START_LANE))
export const battleZone = (s: Pick<MatchState, 'lane'>) => LANE[laneOf(s)]

export const inZone = (s: Pick<MatchState, 'map' | 'lane'>, hex: string) => zoneTable(s.map)[hex] === battleZone(s)

/** Minions in the battle zone (optionally of one team). */
export function zoneMinions(s: Pick<MatchState, 'map' | 'lane' | 'pieces'>, team?: Team): Piece[] {
	return Object.values(s.pieces ?? {}).filter((p) => p.kind === 'minion' && (!team || p.team === team) && inZone(s, p.hex))
}
export function minionCount(s: Pick<MatchState, 'map' | 'lane' | 'pieces'>): Record<Team, number> {
	return { orange: zoneMinions(s, 'orange').length, blue: zoneMinions(s, 'blue').length }
}

/** The team that pushes right now: the only one with minions left in the battle zone. */
export function pushWinner(s: Pick<MatchState, 'map' | 'lane' | 'pieces'>): Team | null {
	const c = minionCount(s)
	if (c.orange && !c.blue) return 'orange'
	if (c.blue && !c.orange) return 'blue'
	return null
}

/** Count the battle zone: the team with fewer minions removes the difference. */
export function battleResult(s: Pick<MatchState, 'map' | 'lane' | 'pieces'>): Battle {
	const c = minionCount(s)
	const loser: Team | null = c.orange < c.blue ? 'orange' : c.blue < c.orange ? 'blue' : null
	const remove = loser ? Math.min(Math.abs(c.orange - c.blue), c[loser]) : 0
	return { ...c, loser, remove }
}

/** Heavy minions are immune — can't be moved, defeated, removed or otherwise touched —
 *  while any other minion of their team stands in the battle zone. */
export function heavyImmune(s: Pick<MatchState, 'map' | 'lane' | 'pieces'>, pieceId: string): boolean {
	const p = s.pieces?.[pieceId]
	if (!p || p.kind !== 'minion' || p.role !== 'heavy' || !inZone(s, p.hex)) return false
	return zoneMinions(s, p.team as Team).some((m) => m.id !== p.id)
}

/** Can this minion be taken off for the battle? (the loser's, in the zone, heavies last) */
export function canBattleRemove(s: MatchState, pieceId: string): boolean {
	const b = s.battle, p = s.pieces?.[pieceId]
	if (!b || !b.loser || b.remove <= 0 || !p || p.kind !== 'minion' || p.team !== b.loser || !inZone(s, p.hex)) return false
	return !heavyImmune(s, pieceId)
}

/** Which minion the game takes off when asked to choose: melee, then ranged, then heavy. */
export function autoPick(s: MatchState): string | null {
	const rank = (r?: string) => (r === 'heavy' ? 2 : r === 'ranged' ? 1 : 0)
	const opts = zoneMinions(s, s.battle?.loser ?? undefined).filter((m) => canBattleRemove(s, m.id))
	opts.sort((a, b) => rank(a.role) - rank(b.role) || (a.id < b.id ? -1 : 1))
	return opts[0]?.id ?? null
}

// ── spawning ────────────────────────────────────────────────────────────────
const BLOCKED = new Set(['terrain'])
/** A fresh wave on a zone's spawn points (spawnOrange / spawnBlue hexes; minion type
 *  from the map's meta, melee by default). A token on a spawn point is removed first and
 *  the minion spawns there (`cleared` = those tokens' ids). A spawn point held by anything
 *  else — a unit, or Trinkets' Turret, which is an object and not a token — sends its
 *  minion to the nearest empty hex in the same zone. (`cards` tells whose companion is the Turret.) */
export function spawnWave(map: GameMap | null, zone: string, pieces: Record<string, Piece>, tag: string, cards?: Record<string, { hero: string }> | null): { minions: Record<string, Piece>; cleared: string[] } {
	const cells = map?.cells ?? {}
	const zones = zoneTable(map)
	const onBoard = Object.values(pieces).filter((p) => !p.attachedTo)
	const isToken = (p: Piece) => p.kind === 'token' && !isTurret(p, cards)
	const taken = new Set(onBoard.map((p) => p.hex)) // anything at all: a displaced minion needs an EMPTY hex
	const blocked = new Set(onBoard.filter((p) => !isToken(p)).map((p) => p.hex)) // only these hold a spawn point
	const free = Object.keys(cells).filter((h) => zones[h] === zone && !BLOCKED.has(cells[h])).sort()
	const minions: Record<string, Piece> = {}
	const cleared: string[] = []
	const spawns = Object.keys(cells).filter((h) => zones[h] === zone && (cells[h] === 'spawnOrange' || cells[h] === 'spawnBlue')).sort()
	// the open spawn points first, so a displaced minion never steals another's point
	spawns.sort((a, b) => Number(blocked.has(a)) - Number(blocked.has(b)))
	for (const sp of spawns) {
		let hex: string | undefined = sp
		if (blocked.has(sp)) {
			const c = hexCube(sp)
			hex = free.filter((h) => !taken.has(h)).sort((a, b) => cubeDist(hexCube(a), c) - cubeDist(hexCube(b), c))[0]
			if (!hex) continue
		} else {
			for (const p of onBoard) if (p.hex === sp && isToken(p)) cleared.push(p.id)
		}
		taken.add(hex)
		const team: Team = cells[sp] === 'spawnOrange' ? 'orange' : 'blue'
		const m = map?.meta?.[sp]?.m
		const role = m === 'ranged' || m === 'heavy' ? m : 'melee'
		const id = `minion_${sp}_${tag}`
		minions[id] = { id, hex, team, kind: 'minion', role }
	}
	return { minions, cleared }
}

// ── pushing ────────────────────────────────────────────────────────────────
/** `winner` pushes the lane (see the rules at the top). */
export function pushLane(s: MatchState, winner: Team): Partial<MatchState> {
	const loser = other(winner)
	const waveTok = [...(s.waveTok ?? [])]
	const i = waveTok.lastIndexOf(true)
	if (i >= 0) waveTok[i] = false
	const waves = waveTok.length ? waveTok.filter(Boolean).length : Math.max(0, s.waves - 1)
	const pieces: Record<string, Piece> = {}
	for (const id in s.pieces ?? {}) { const p = s.pieces[id]; if (!(p.kind === 'minion' && inZone(s, p.hex))) pieces[id] = p }
	const lane = laneOf(s) + (winner === 'orange' ? 1 : -1)
	const news = (to: string | null, won: string | null): PushNews => ({
		id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		winner, from: battleZone(s), to, wavesBefore: s.waves, wavesAfter: waves, won, at: Date.now()
	})
	const patch: Partial<MatchState> = { waves, waveTok, lastPush: winner, pieces, battle: null }
	if (lane < 0 || lane >= LANE.length) {
		const reason = `pushed into the ${teamAdj(loser)} Throne`
		return { ...patch, wonBy: { team: winner, reason }, pushNews: news(null, reason) }
	}
	patch.lane = lane
	if (waves <= 0) return { ...patch, wonBy: { team: winner, reason: 'won the Final Push' }, pushNews: news(null, 'won the Final Push') }
	const wave = spawnWave(s.map, LANE[lane], pieces, `${s.round}_${s.turn}_${waves}`, s.cards)
	for (const id of wave.cleared) delete pieces[id] // tokens on the new zone's spawn points make way
	patch.pieces = { ...pieces, ...wave.minions }
	patch.pushNews = news(LANE[lane], null)
	return patch
}

/** End of a turn: push if one team has emptied the battle zone. */
export function pushCheck(s: MatchState): Partial<MatchState> {
	if (s.wonBy) return {}
	const w = pushWinner(s)
	return w ? pushLane(s, w) : {}
}

/** Start the minion battle (end of round): the end-of-turn push check first, then
 *  count the zone. Nobody to remove → done (battle: null). */
export function startBattle(s: MatchState): Partial<MatchState> {
	const pushed = pushCheck(s)
	const after = { ...s, ...pushed }
	const b = battleResult(after)
	return { ...pushed, battle: b.remove > 0 ? b : null }
}

/** The loser takes a minion off for the battle; the last one done → push check. */
export function battleRemove(s: MatchState, pieceId: string): Partial<MatchState> {
	if (!canBattleRemove(s, pieceId)) return {}
	const pieces = { ...s.pieces }
	delete pieces[pieceId]
	const remove = s.battle!.remove - 1
	if (remove > 0) return { pieces, battle: { ...s.battle!, remove } }
	const after: MatchState = { ...s, pieces, battle: null }
	return { pieces, battle: null, ...pushCheck(after) }
}

/** Let the game take off the rest (melee first, heavies last). */
export function battleAuto(s: MatchState): Partial<MatchState> {
	let cur: MatchState = s
	let patch: Partial<MatchState> = {}
	for (let guard = 0; cur.battle && cur.battle.remove > 0 && guard < 50; guard++) {
		const id = autoPick(cur)
		if (!id) break
		const p = battleRemove(cur, id)
		patch = { ...patch, ...p }
		cur = { ...cur, ...p }
	}
	return patch
}

/** Log lines for what a battle / push patch did. */
export function laneNotes(before: MatchState, patch: Partial<MatchState>): string[] {
	const out: string[] = []
	const after = { ...before, ...patch }
	if (patch.lastPush && (patch.waves ?? before.waves) < before.waves) {
		const w = teamName(patch.lastPush)
		out.push(after.wonBy ? `${w} pushed the lane · waves ${before.waves} → ${after.waves}`
			: `${w} pushed the lane · waves ${before.waves} → ${after.waves} · battle zone → ${placeName(battleZone(after))}, new minions`)
	}
	if (after.wonBy && !before.wonBy) out.push(`${teamName(after.wonBy.team)} win — ${after.wonBy.reason}`)
	return out
}
export const battleText = (b: Battle) =>
	`minion battle — Atlanteans ${b.orange} : ${b.blue} Titans` + (b.loser && b.remove ? ` · ${teamName(b.loser)} remove ${b.remove}` : ' · no minions removed')
