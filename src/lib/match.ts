// Shared, room-synced match state for the assisted table (Phase 2).
//
// This is the single source of truth every player at a table reads from and
// writes to: which round/turn we're on, whose coin side is up, the shared wave
// pool, each team's Life counters, the shared timer, and an attributed activity
// log of who changed what. It syncs over Supabase
// Realtime broadcast + presence — no database row required — so it works the
// same way the shared board pieces (Phase 1) do. Persistence and proper
// room-scoped authorization come with the Supabase hardening pass (Phase 3).
//
// The sync model is deliberately simple: full-snapshot, last-write-wins. Every
// edit bumps `rev` and re-broadcasts the whole state; a newer `rev` (ties
// broken by `updatedAt`) wins. For a handful of players nudging a shared
// tracker this is robust and easy to reason about.

import { writable, type Readable } from 'svelte/store'
import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameMap } from './maps'

export type Team = 'orange' | 'blue'
export type Phase = 'planning' | 'action' | 'upgrade'

export const TEAMS: Team[] = ['orange', 'blue']
export const TURNS_PER_ROUND = 4
export const PHASES: Phase[] = ['planning', 'action', 'upgrade']
export const PHASE_LABELS: Record<Phase, string> = {
	planning: 'Planning',
	action: 'Action',
	upgrade: 'Upgrade'
}

export interface LogEntry {
	id: string
	by: string // player name
	text: string // human-readable action, e.g. "Blue Push · waves 5→4"
	at: number // epoch ms
}

/** Shared stopwatch. Display time is derived so there's no clock drift:
 *  running ? baseMs + (now - startedAt) : baseMs. */
export interface TimerState {
	running: boolean
	baseMs: number // accumulated while paused
	startedAt: number | null // epoch ms of the current run, else null
}

export interface MatchState {
	round: number
	turn: number // 1..TURNS_PER_ROUND
	phase: Phase
	tieBreaker: Team // team whose symbol is currently showing on the coin
	waves: number // SHARED wave counters remaining; game ends when it hits 0
	lastPush: Team | null // team that won the most recent Push the Lane
	life: Record<Team, number> // per-team Life counters remaining; 0 = that team loses
	timer: TimerState
	log: LogEntry[] // capped activity log (most recent last)
	mapId: string // id of the chosen board (from the maps registry)
	map: GameMap | null // full board data, shared so everyone renders the same map
	rev: number // monotonic version for last-write-wins
	updatedBy: string
	updatedAt: number
}

export const LOG_CAP = 60

/** Life counters per team, from the rulebook setup table (base, single lane). */
export function lifeFor(length: 'quick' | 'long', players: number): number {
	if (length === 'quick') return players <= 4 ? 4 : 5
	return players <= 4 ? 6 : 8
}
export const wavesFor = (length: 'quick' | 'long') => (length === 'quick' ? 3 : 5)

export interface Player {
	id: string
	name: string
	team: Team | 'spectator'
}

export function initialMatchState(
	opts: {
		length?: 'quick' | 'long'
		players?: number
		waves?: number
		life?: number
		mapId?: string
		map?: GameMap | null
	} = {}
): MatchState {
	const length = opts.length ?? 'long'
	const players = opts.players ?? 6
	const life = opts.life ?? lifeFor(length, players)
	const waves = opts.waves ?? wavesFor(length)
	return {
		round: 1,
		turn: 1,
		phase: 'planning',
		tieBreaker: 'orange',
		waves,
		lastPush: null,
		life: { orange: life, blue: life },
		timer: { running: false, baseMs: 0, startedAt: null },
		log: [],
		mapId: opts.mapId ?? '',
		map: opts.map ?? null,
		rev: 0,
		updatedBy: '',
		updatedAt: 0
	}
}

/** Derived stopwatch reading in ms (no stored drift). */
export function timerDisplayMs(t: TimerState, now = Date.now()): number {
	return t.running && t.startedAt != null ? t.baseMs + (now - t.startedAt) : t.baseMs
}

export function startTimer(): Partial<MatchState> {
	return { timer: { running: true, baseMs: 0, startedAt: Date.now() } }
}
export function toggleTimer(t: TimerState): Partial<MatchState> {
	const now = Date.now()
	if (t.running && t.startedAt != null) {
		return { timer: { running: false, baseMs: t.baseMs + (now - t.startedAt), startedAt: null } }
	}
	return { timer: { running: true, baseMs: t.baseMs, startedAt: now } }
}
export function resetTimer(): Partial<MatchState> {
	return { timer: { running: false, baseMs: 0, startedAt: null } }
}

const otherTeam = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')
const clampTurn = (t: number) => Math.min(TURNS_PER_ROUND, Math.max(1, t))

export interface MatchSession {
	state: Readable<MatchState>
	players: Readable<Player[]>
	/** Merge a patch into the shared state and broadcast it to everyone. */
	update: (patch: Partial<MatchState>) => void
	/** Apply a patch AND append an attributed log entry describing it. */
	act: (text: string, patch: Partial<MatchState>) => void
	/** Announce which team this client is playing (or spectating). */
	setSelf: (info: { name?: string; team?: Team | 'spectator' }) => void
	leave: () => void
	clientId: string
}

/**
 * Join (or create) a match room and keep a live, shared MatchState in sync.
 * The returned stores update as other players make changes.
 */
export function joinMatch(
	room: string,
	self: { name: string; team: Team | 'spectator' },
	seed?: MatchState
): MatchSession {
	const clientId =
		globalThis.crypto?.randomUUID?.() ?? `c_${Math.random().toString(36).slice(2)}`

	const state = writable<MatchState>(seed ?? initialMatchState())
	const players = writable<Player[]>([])
	let local: MatchState = seed ?? initialMatchState()
	state.subscribe((v) => (local = v))

	let me: Player = { id: clientId, name: self.name, team: self.team }

	const channel: RealtimeChannel = supabase.channel(`match:${room}`, {
		config: {
			broadcast: { self: false },
			presence: { key: clientId }
		}
	})

	const applyRemote = (incoming: MatchState) => {
		// last-write-wins: accept strictly newer revisions, break ties on time
		if (
			incoming.rev > local.rev ||
			(incoming.rev === local.rev && incoming.updatedAt > local.updatedAt)
		) {
			state.set(incoming)
		}
	}

	const broadcastState = () => {
		channel.send({ type: 'broadcast', event: 'state', payload: local })
	}

	channel
		.on('broadcast', { event: 'state' }, ({ payload }) => applyRemote(payload as MatchState))
		.on('broadcast', { event: 'hello' }, () => {
			// a newcomer asked for the current state — whoever has edits shares them
			if (local.rev > 0) broadcastState()
		})
		.on('presence', { event: 'sync' }, () => {
			const raw = channel.presenceState() as Record<string, Array<Partial<Player>>>
			const list: Player[] = []
			for (const key in raw) {
				const meta = raw[key][0] ?? {}
				list.push({
					id: key,
					name: (meta.name as string) ?? 'Player',
					team: (meta.team as Player['team']) ?? 'spectator'
				})
			}
			players.set(list)
		})

	channel.subscribe((status) => {
		if (status !== 'SUBSCRIBED') return
		channel.track(me)
		// ask whoever is already here for the authoritative state
		channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } })
	})

	const update = (patch: Partial<MatchState>) => {
		local = {
			...local,
			...patch,
			rev: local.rev + 1,
			updatedBy: clientId,
			updatedAt: Date.now()
		}
		state.set(local)
		broadcastState()
	}

	const act = (text: string, patch: Partial<MatchState>) => {
		const entry: LogEntry = {
			id: globalThis.crypto?.randomUUID?.() ?? `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			by: me.name,
			text,
			at: Date.now()
		}
		update({ ...patch, log: [...local.log, entry].slice(-LOG_CAP) })
	}

	const setSelf = (info: { name?: string; team?: Team | 'spectator' }) => {
		me = { ...me, ...info }
		channel.track(me)
	}

	const leave = () => {
		try {
			channel.untrack()
			supabase.removeChannel(channel)
		} catch {
			/* ignore */
		}
	}

	return { state, players, update, act, setSelf, leave, clientId }
}

// ---- Round/turn helpers (encode the rulebook's structure) -------------------

/** Advance one turn; after turn 4 the round ends and turn resets to 1. */
export function nextTurn(s: MatchState): Partial<MatchState> {
	if (s.turn >= TURNS_PER_ROUND) return { round: s.round + 1, turn: 1 }
	return { turn: s.turn + 1 }
}

export function prevTurn(s: MatchState): Partial<MatchState> {
	if (s.turn <= 1) {
		if (s.round <= 1) return { turn: 1 }
		return { round: s.round - 1, turn: TURNS_PER_ROUND }
	}
	return { turn: s.turn - 1 }
}

export function flipCoin(s: MatchState): Partial<MatchState> {
	return { tieBreaker: otherTeam(s.tieBreaker) }
}

/** Adjust the shared wave pool directly (manual correction). */
export function adjustWaves(s: MatchState, delta: number): Partial<MatchState> {
	return { waves: Math.max(0, s.waves + delta) }
}

/** A team wins a Push the Lane: flip one shared wave counter and record it. */
export function pushLane(s: MatchState, winner: Team): Partial<MatchState> {
	return { waves: Math.max(0, s.waves - 1), lastPush: winner }
}

/** Adjust a team's Life counters (they lose these when their heroes are defeated). */
export function adjustLife(s: MatchState, team: Team, delta: number): Partial<MatchState> {
	return { life: { ...s.life, [team]: Math.max(0, s.life[team] + delta) } }
}

/** Whichever end condition has triggered, or null while play continues. */
export function winner(s: MatchState): { team: Team; reason: string } | null {
	if (s.life.orange <= 0) return { team: 'blue', reason: 'Orange ran out of Life counters' }
	if (s.life.blue <= 0) return { team: 'orange', reason: 'Blue ran out of Life counters' }
	if (s.waves <= 0 && s.lastPush) return { team: s.lastPush, reason: 'Won the final Push' }
	return null
}

export { otherTeam, clampTurn }
