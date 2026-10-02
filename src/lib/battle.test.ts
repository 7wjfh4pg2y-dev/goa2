import { describe, it, expect } from 'vitest'
import { applyCardReq, battlePatch, placeMinions, spendTokens, extraSpawns, heroSpawns, type MatchState, type Piece } from './match'
import { LANE, battleResult, canBattleRemove, heavyImmune, inZone, pushLane, spawnWave, zoneMinions } from './battle'
import { zoneTable } from './zones'
import map from './maps/forgotten_island.json'
import type { GameMap } from './maps'

const M = map as unknown as GameMap
function game(extra: Partial<MatchState> = {}): MatchState {
	const s = {
		round: 1, turn: 2, seats: 2, host: 'H', map: M, waves: 5, waveTok: Array(5).fill(true), lastPush: null,
		life: { orange: 6, blue: 6 }, pieces: {}, cards: {}, seatMap: { 0: { id: 'O', name: 'O' }, 1: { id: 'B', name: 'B' } }, ...extra
	} as unknown as MatchState
	if (!extra.pieces) s.pieces = placeMinions(s)
	return s
}
const drop = (s: MatchState, n: number, team: 'orange' | 'blue', role?: string) => {
	const pieces = { ...s.pieces }
	for (const m of zoneMinions(s, team).filter((m) => !role || m.role === role).slice(0, n)) delete pieces[m.id]
	return { ...s, pieces }
}

describe('the minion lane', () => {
	it('the starting minions stand in the Center battle zone, 6 a side', () => {
		const s = game()
		expect(LANE[s.lane ?? 1]).toBe('Center')
		expect(Object.values(s.pieces).every((p) => inZone(s, p.hex))).toBe(true)
		expect(battleResult(s)).toEqual({ orange: 6, blue: 6, loser: null, remove: 0 })
	})

	it('spawn points: 6 a side in the Center; on a beach the home team has 6, the visitors 5', () => {
		const count = (z: string) => { const w = Object.values(spawnWave(M, z, {}, 't').minions); expect(w.every((p) => zoneTable(M)[p.hex] === z)).toBe(true); return { o: w.filter((p) => p.team === 'orange').length, b: w.filter((p) => p.team === 'blue').length } }
		expect(count('Center')).toEqual({ o: 6, b: 6 })
		expect(count('Orange Beach')).toEqual({ o: 6, b: 5 })
		expect(count('Blue Beach')).toEqual({ o: 5, b: 6 })
		const roles = Object.values(spawnWave(M, 'Center', {}, 't').minions).filter((p) => p.team === 'blue').map((p) => p.role).sort()
		expect(roles).toEqual(['heavy', 'melee', 'melee', 'melee', 'melee', 'ranged'])
	})

	it('the battle: fewer minions removes the difference, heavies last', () => {
		let s = drop(game(), 2, 'orange', 'melee') // orange 4 : 6 blue
		const b = battlePatch(s)
		expect(b.battle).toEqual({ orange: 4, blue: 6, loser: 'orange', remove: 2 })
		s = { ...s, ...b }
		const heavy = zoneMinions(s, 'orange').find((m) => m.role === 'heavy')!
		const melee = zoneMinions(s, 'orange').find((m) => m.role === 'melee')!
		expect(canBattleRemove(s, heavy.id)).toBe(false)
		expect(canBattleRemove(s, zoneMinions(s, 'blue')[0].id)).toBe(false)
		// blue can't choose for orange; orange (or the host) can
		expect(applyCardReq(s, { kind: 'battleRemove', pid: 'B', piece: melee.id })).toEqual({})
		const p = applyCardReq(s, { kind: 'battleRemove', pid: 'O', piece: melee.id })
		expect(p.battle!.remove).toBe(1)
		s = { ...s, ...p }
		const done = applyCardReq(s, { kind: 'battleAuto', pid: 'H' })
		expect(done.battle).toBeNull()
		s = { ...s, ...done }
		expect(battleResult(s)).toMatchObject({ orange: 2, blue: 6 })
		expect(zoneMinions(s, 'orange').map((m) => m.role).sort()).toEqual(['heavy', 'ranged']) // melee went first
		expect(s.waves).toBe(5) // orange still has minions: no push
	})

	it('a battle that empties a side pushes the lane', () => {
		const s = drop(drop(game(), 6, 'orange'), 0, 'blue')
		const one = { ...s, pieces: { ...s.pieces, ...Object.fromEntries(Object.values(placeMinions(game())).filter((p) => p.team === 'orange' && p.role === 'heavy').map((p) => [p.id, p])) } }
		const b = { ...one, ...battlePatch(one) } // 1 : 6 → orange loses its heavy
		expect(b.battle).toMatchObject({ loser: 'orange', remove: 1 })
		const p = applyCardReq(b, { kind: 'battleAuto', pid: 'O' })
		expect(p.lastPush).toBe('blue')
		expect(p.lane).toBe(0)
		expect(p.waves).toBe(4)
	})

	it('a push: wave off, zone cleared, zone moves towards the loser, a new wave spawns', () => {
		const s = drop(game(), 6, 'orange') // orange has nothing left in the Center
		const p = pushLane(s, 'blue')
		expect(p.waves).toBe(4)
		expect(p.waveTok).toEqual([true, true, true, true, false])
		expect(p.lane).toBe(0)
		const after = { ...s, ...p }
		expect(Object.values(after.pieces).filter((m) => m.kind === 'minion' && zoneTable(M)[m.hex] === 'Center')).toHaveLength(0)
		expect(battleResult(after)).toMatchObject({ orange: 6, blue: 5 })
		expect(Object.values(after.pieces).every((m) => zoneTable(M)[m.hex] === 'Orange Beach')).toBe(true)
	})

	it('the end of a turn pushes automatically', () => {
		const s = drop(game(), 6, 'blue')
		const p = applyCardReq(s, { kind: 'advance', pid: 'H' })
		expect(p.turn).toBe(3)
		expect(p.lastPush).toBe('orange')
		expect(p.lane).toBe(2)
		// both sides still standing → nothing
		expect(applyCardReq(game(), { kind: 'advance', pid: 'H' }).lastPush).toBeUndefined()
	})

	it('defeating (or removing) a team\'s last minion in the zone pushes at once, mid-turn', () => {
		const s = drop(game(), 5, 'blue') // blue down to its last minion
		const last = zoneMinions(s, 'blue')
		expect(last).toHaveLength(1)
		const p = applyCardReq(s, { kind: 'defeatMinion', pid: 'O', piece: last[0].id })
		expect(p.lastPush).toBe('orange')
		expect(p.lane).toBe(2)
		expect(p.turn).toBeUndefined() // no turn change needed
		const r = applyCardReq(s, { kind: 'removeMinion', pid: 'O', piece: last[0].id })
		expect(r.lastPush).toBe('orange')
		// not the last one → no push
		expect(applyCardReq(game(), { kind: 'defeatMinion', pid: 'O', piece: zoneMinions(game(), 'blue')[0].id }).lastPush).toBeUndefined()
	})

	it('a heavy is immune while another minion of its team is in the zone', () => {
		const s = game()
		const heavy = zoneMinions(s, 'blue').find((m) => m.role === 'heavy')!
		expect(heavyImmune(s, heavy.id)).toBe(true)
		expect(applyCardReq(s, { kind: 'defeatMinion', pid: 'O', piece: heavy.id })).toEqual({})
		expect(applyCardReq(s, { kind: 'removeMinion', pid: 'O', piece: heavy.id })).toEqual({})
		expect(applyCardReq(s, { kind: 'defeatMinion', pid: 'H', piece: heavy.id }).pieces).toBeDefined() // host override
		const alone = drop(s, 5, 'blue', 'melee')
		const lone = drop(alone, 1, 'blue', 'ranged')
		expect(heavyImmune(lone, heavy.id)).toBe(false)
		expect(applyCardReq(lone, { kind: 'defeatMinion', pid: 'O', piece: heavy.id }).lastPush).toBe('orange')
	})

	it('pushing past the last zone, or taking the last wave, wins', () => {
		expect(pushLane(game({ lane: 0 } as Partial<MatchState>), 'blue').wonBy).toEqual({ team: 'blue', reason: 'pushed into the Atlantean Throne' })
		const last = game({ waves: 1, waveTok: [true, false, false] } as Partial<MatchState>)
		expect(pushLane(last, 'orange').wonBy).toEqual({ team: 'orange', reason: 'won the Final Push' })
	})

	it('a spawn point held by a unit sends its minion to the nearest free hex in the zone', () => {
		const hero: Piece = { id: 'X', hex: '9_10', team: 'blue', kind: 'hero' }
		const { minions, cleared } = spawnWave(M, 'Center', { X: hero }, 't')
		const w = Object.values(minions)
		expect(w).toHaveLength(12)
		expect(w.some((p) => p.hex === '9_10')).toBe(false)
		expect(new Set(w.map((p) => p.hex)).size).toBe(12)
		expect(cleared).toEqual([])
	})

	it('a token on a spawn point is removed and the minion spawns there — but Trinkets\' Turret is an object and stays', () => {
		const sp = Object.values(spawnWave(M, 'Center', {}, 't').minions).map((p) => p.hex)
		expect(sp).toContain('9_10')
		const other = sp.find((h) => h !== '9_10')!
		const rock: Piece = { id: 'rock', hex: '9_10', team: 'blue', kind: 'token', token: 'token_rock', owner: 'B' }
		const turret: Piece = { id: 'turret', hex: other, team: 'blue', kind: 'token', token: 'companion', label: 'Turret', owner: 'B' }
		const { minions, cleared } = spawnWave(M, 'Center', { rock, turret }, 't')
		const w = Object.values(minions)
		expect(cleared).toEqual(['rock'])
		expect(w).toHaveLength(12)
		expect(w.some((p) => p.hex === '9_10')).toBe(true) // the rock made way
		expect(w.some((p) => p.hex === other)).toBe(false) // the Turret didn't
		expect(new Set(w.map((p) => p.hex)).size).toBe(12)
		// a companion without the label is still the Turret when its owner plays Trinkets
		const bare: Piece = { ...turret, label: undefined }
		expect(spawnWave(M, 'Center', { bare }, 't', { B: { hero: 'trinkets' } }).cleared).toEqual([])
		expect(spawnWave(M, 'Center', { bare }, 't', { B: { hero: 'widget' } }).cleared).toEqual(['turret']) // Pyro is a token
	})

	it('a push sweeps the tokens off the new battle zone\'s spawn points', () => {
		const s = game()
		const beach = Object.values(spawnWave(M, 'Blue Beach', {}, 't').minions)[0].hex
		const rock: Piece = { id: 'rock', hex: beach, team: 'blue', kind: 'token', token: 'token_rock', owner: 'B' }
		const away: Piece = { id: 'away', hex: '1_1', team: 'blue', kind: 'token', token: 'token_rock', owner: 'B' }
		const p = pushLane({ ...s, pieces: { ...s.pieces, rock, away } }, 'orange')
		expect(p.pieces!.rock).toBeUndefined()
		expect(p.pieces!.away).toBeDefined()
		expect(Object.values(p.pieces!).some((m) => m.kind === 'minion' && m.hex === beach)).toBe(true)
	})

	it('8+ players: the two base hexes between the spawn points open up', () => {
		expect(extraSpawns(M, 'orange')).toEqual(['4_2', '6_2'])
		expect(extraSpawns(M, 'blue')).toEqual(['12_16', '14_16'])
		expect(heroSpawns({ map: M, seats: 6 }, 'orange')).toHaveLength(3)
		expect(heroSpawns({ map: M, seats: 8 }, 'orange')).toHaveLength(5)
	})

	it('life tokens flip with a hero defeat', () => {
		expect(spendTokens([true, true, true, false], 2)).toEqual([true, false, false, false])
	})
})
