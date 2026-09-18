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

/** Realtime connection state, surfaced so the UI can show a status indicator. */
export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed'

const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `c_${Math.random().toString(36).slice(2)}`

/**
 * A per-tab client identity that survives a page reload. Using sessionStorage
 * (not localStorage) means a refresh keeps your seat, but a second tab is a new
 * player — so two tabs never fight over one presence key.
 */
function stableClientId(): string {
	try {
		const k = 'goa2-client-id'
		let id = sessionStorage.getItem(k)
		if (!id) {
			id = newId()
			sessionStorage.setItem(k, id)
		}
		return id
	} catch {
		return newId()
	}
}

export type Team = 'orange' | 'blue'
export type Phase = 'planning' | 'action' | 'upgrade'

/** Which team a seat belongs to: the first half is Orange, the second Blue. */
export const teamForSeat = (seat: number, seats: number): Team | null =>
	seat < 0 ? null : seat < Math.floor(seats / 2) ? 'orange' : 'blue'

// ---- Hero draft types ------------------------------------------------------

export type DraftSystem = 'all-pick' | 'all-random' | 'single-draft' | 'pick-ban'
export const DRAFT_SYSTEMS: DraftSystem[] = ['all-pick', 'all-random', 'single-draft', 'pick-ban']
export const DRAFT_LABELS: Record<DraftSystem, string> = {
	'all-pick': 'All Pick',
	'all-random': 'All Random',
	'single-draft': 'Single Draft',
	'pick-ban': 'Pick & Ban'
}
export const DRAFT_BLURBS: Record<DraftSystem, string> = {
	'all-pick': 'Everyone picks at once from the full pool.',
	'all-random': 'Everyone is dealt a random hero.',
	'single-draft': 'Each turn you’re offered three heroes — pick one.',
	'pick-ban': 'Teams alternate bans and picks in turn.'
}

export interface DraftTurn {
	team: Team
	type: 'pick' | 'ban'
	actor: string // clientId who owns this turn
}
export interface DraftState {
	system: DraftSystem
	pool: string[] // eligible hero ids
	order: DraftTurn[] // resolved turn sequence ([] for all-pick / all-random)
	step: number // index into order (turn-based modes)
	picks: Record<string, string> // clientId -> heroId (committed)
	bans: string[]
	offer: string[] // single-draft: heroes offered to the current actor
	offered: string[] // single-draft: every hero offered so far (never re-offered)
	deadline: number // epoch ms the current turn auto-picks at (0 = no timer)
	lastAction: DraftAction | null // most recent pick/ban, for the announcement toast
}

export interface DraftAction {
	team: Team
	type: 'pick' | 'ban'
	actor: string // clientId
	hero: string // heroId
	at: number // epoch ms (also the toast nonce)
	auto?: boolean // resolved by the timer/watchdog rather than a player
}

/** How long each turn-based turn (and the all-pick phase) lasts before auto-resolve. */
export const DRAFT_TURN_MS = 45_000

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
	lifeMax: number // starting Life per team (how many tokens to display)
	lifeTok: Record<Team, boolean[]> // per-token full(true)/spent(false); count of trues = life
	wavesMax: number // starting wave tokens (14 on a two-lane map)
	waveTok: boolean[] // per wave token full(true)/spent(false); count of trues = waves
	timer: TimerState
	log: LogEntry[] // capped activity log (most recent last)
	mapId: string // id of the chosen board (from the maps registry)
	map: GameMap | null // full board data, shared so everyone renders the same map
	pieces: Record<string, Piece> // tokens on the board, keyed by id
	seats: number // number of player seats the game is set up for (excl. spectators)
	host: string // clientId of the host (the creator)
	draftSystem: DraftSystem // how heroes are selected
	draftStars: number[] // allowed hero complexity levels (1–4)
	draft: DraftState | null // live hero-draft state once Begin starts it
	started: boolean // lobby → game has begun
	closed: boolean // host closed the game; everyone returns to the menu
	// set by the host on Begin: a shared coin flip everyone animates to reveal
	// which team's tie-breaker side is up at the start of the game
	startFlip: { side: Team; at: number } | null
	rev: number // monotonic version for last-write-wins
	updatedBy: string
	updatedAt: number
}

export const LOG_CAP = 60

/** A piece on the board. */
export interface Piece {
	id: string
	hex: string // "col_row"
	team: Team | 'neutral'
	kind?: 'token' | 'minion' | 'hero'
	role?: 'ranged' | 'melee' | 'heavy' // for minions
	label?: string // for hero/token markers
	color?: string // a PLAYER_COLORS id — the owning player's token colour
	hero?: string // heroId, for hero pieces
}

/** Hexes belonging to a team's base zone (for spawning heroes). */
function baseHexes(map: GameMap | null, team: Team): string[] {
	const cells = map?.cells ?? {}
	const want = team === 'orange' ? ['baseOrange', 'baseOrangeSpawn'] : ['baseBlue', 'baseBlueSpawn']
	return Object.keys(cells).filter((id) => want.includes(cells[id])).sort()
}

/**
 * Initial hero tokens: one per seated player who drafted a hero, placed on their
 * team's base zone and coloured by the player's token colour. Called once by the
 * host when the game starts.
 */
export function placeHeroes(state: MatchState, players: Player[]): Record<string, Piece> {
	const seated = players.filter((p) => p.seat >= 0 && p.seat < state.seats)
	const pieces: Record<string, Piece> = {}
	for (const team of TEAMS) {
		const bases = baseHexes(state.map, team)
		const roster = seated.filter((p) => teamForSeat(p.seat, state.seats) === team).sort((a, b) => a.seat - b.seat)
		roster.forEach((p, i) => {
			const hero = state.draft?.picks[p.id]
			if (!hero) return
			const hex = bases[i % bases.length] ?? bases[0] ?? Object.keys(state.map?.cells ?? {})[0] ?? '0_0'
			pieces[p.id] = { id: p.id, hex, team, kind: 'hero', hero, color: p.color }
		})
	}
	return pieces
}

/** Initial minion wave: place a movable minion on each battle-zone hex.
 * Uses the map's authored `battleZone`; falls back to the central spawn tiles
 * so any map with spawn hexes still gets a wave. */
export function placeMinions(state: MatchState): Record<string, Piece> {
	const pieces: Record<string, Piece> = {}
	const zone = state.map?.battleZone?.length ? state.map.battleZone : deriveBattleZone(state.map)
	for (const m of zone) {
		const id = `minion_${m.hex}`
		pieces[id] = { id, hex: m.hex, team: m.team, kind: 'minion', role: m.kind }
	}
	return pieces
}

/** When a map has no authored battleZone, take the 6 spawn tiles per side
 * nearest the board centre as the opening wave. */
function deriveBattleZone(map: GameMap | null): NonNullable<GameMap['battleZone']> {
	const cells = map?.cells ?? {}
	const ids = Object.keys(cells)
	if (!ids.length) return []
	const SQ = Math.sqrt(3)
	const pos = (id: string): [number, number] => {
		const [c, r] = id.split('_').map(Number)
		return [SQ * (c + 0.5 * (r & 1)), 1.5 * r]
	}
	let cx = 0, cy = 0
	for (const id of ids) { const [x, y] = pos(id); cx += x; cy += y }
	cx /= ids.length; cy /= ids.length
	const near = (t: string, n: number) =>
		ids.filter((k) => cells[k] === t)
			.map((k) => { const [x, y] = pos(k); return { k, d: (x - cx) ** 2 + (y - cy) ** 2 } })
			.sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.k)
	const kinds: Array<'melee' | 'ranged' | 'heavy'> = ['melee', 'melee', 'ranged', 'ranged', 'heavy', 'heavy']
	const mk = (t: string, team: 'orange' | 'blue') =>
		near(t, 6).map((hex, i) => ({ hex, team, kind: kinds[i % kinds.length] }))
	return [...mk('spawnOrange', 'orange'), ...mk('spawnBlue', 'blue')]
}

/** Life counters per team, from the rulebook setup table (base, single lane). */
export function lifeFor(length: 'quick' | 'long', players: number): number {
	if (length === 'quick') return players <= 4 ? 4 : 5
	return players <= 4 ? 6 : 8
}
export const wavesFor = (length: 'quick' | 'long') => (length === 'quick' ? 3 : 5)

// Personal player colours (identity at the table) — distinct, and deliberately
// NOT orange/blue, since those are the two team sides.
export interface PlayerColorDef { id: string; label: string; hex: string }
// Ordered as a rainbow (ROYGBIV, skipping orange & blue which are the team
// colours) with neutrals last. Teal and brown were dropped — too close to the
// blue and orange team colours to tell apart on the board.
export const PLAYER_COLORS: PlayerColorDef[] = [
	{ id: 'red', label: 'Red', hex: '#ef4444' },
	{ id: 'yellow', label: 'Yellow', hex: '#eab308' },
	{ id: 'lime', label: 'Lime', hex: '#84cc16' },
	{ id: 'green', label: 'Green', hex: '#22c55e' },
	{ id: 'purple', label: 'Purple', hex: '#a855f7' },
	{ id: 'magenta', label: 'Magenta', hex: '#d946ef' },
	{ id: 'pink', label: 'Pink', hex: '#ec4899' },
	{ id: 'white', label: 'White', hex: '#f8fafc' },
	{ id: 'slate', label: 'Slate', hex: '#94a3b8' },
	{ id: 'black', label: 'Black', hex: '#0b0f17' }
]
export const colorHex = (id: string) => PLAYER_COLORS.find((c) => c.id === id)?.hex ?? '#94a3b8'

export interface Player {
	id: string
	name: string
	color: string // a PLAYER_COLORS id, or 'spectator'
	ready: boolean // lobby ready toggle
	seat: number // seat index (0-based); < 0 means unseated / spectating
}

// ---- Hero draft engine -----------------------------------------------------

/** Minimum eligible heroes needed to run a system for N total players. */
export function draftPoolMin(system: DraftSystem, totalPlayers: number): number {
	if (system === 'single-draft') return totalPlayers * 3
	if (system === 'pick-ban') return totalPlayers * 2
	return totalPlayers
}

function shuffle<T>(xs: T[]): T[] {
	const a = [...xs]
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[a[i], a[j]] = [a[j], a[i]]
	}
	return a
}
function rollOffer(pool: string[], exclude: Set<string>, n: number): string[] {
	return shuffle(pool.filter((h) => !exclude.has(h))).slice(0, n)
}

// Master pick/ban sequence (rulebook draft); sliced to totalPlayers*2 and
// remapped so the tie-breaker-winning team acts first.
const PICK_BAN_SEQ: Array<{ team: Team; type: 'pick' | 'ban' }> = [
	{ team: 'orange', type: 'ban' }, { team: 'blue', type: 'ban' },
	{ team: 'orange', type: 'pick' }, { team: 'blue', type: 'pick' },
	{ team: 'blue', type: 'ban' }, { team: 'orange', type: 'ban' },
	{ team: 'blue', type: 'pick' }, { team: 'orange', type: 'pick' },
	{ team: 'orange', type: 'ban' }, { team: 'blue', type: 'ban' },
	{ team: 'blue', type: 'pick' }, { team: 'orange', type: 'pick' },
	{ team: 'blue', type: 'ban' }, { team: 'orange', type: 'ban' },
	{ team: 'orange', type: 'pick' }, { team: 'blue', type: 'pick' },
	{ team: 'blue', type: 'ban' }, { team: 'orange', type: 'ban' },
	{ team: 'blue', type: 'pick' }, { team: 'orange', type: 'pick' }
]

const otherTeamOf = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')

/** Ordered clientIds per team, by seat. */
export function teamRosters(players: Player[], seats: number): Record<Team, string[]> {
	const half = Math.floor(seats / 2)
	const seated = players.filter((p) => p.seat >= 0 && p.seat < seats).sort((a, b) => a.seat - b.seat)
	return {
		orange: seated.filter((p) => p.seat < half).map((p) => p.id),
		blue: seated.filter((p) => p.seat >= half).map((p) => p.id)
	}
}

/**
 * Build the draft at Begin. `startingTeam` comes from the tie-breaker flip.
 * Turn-based modes get a resolved `order` where each turn is owned by a
 * specific player (for strict enforcement). All-random assigns immediately.
 */
export function buildDraft(
	system: DraftSystem,
	pool: string[],
	players: Player[],
	seats: number,
	startingTeam: Team
): DraftState {
	const rosters = teamRosters(players, seats)
	const total = rosters.orange.length + rosters.blue.length
	const order: DraftTurn[] = []

	if (system === 'pick-ban') {
		const pickPtr: Record<Team, number> = { orange: 0, blue: 0 }
		const banPtr: Record<Team, number> = { orange: 0, blue: 0 }
		for (const t of PICK_BAN_SEQ.slice(0, total * 2)) {
			const team = startingTeam === 'orange' ? t.team : otherTeamOf(t.team)
			const roster = rosters[team]
			let actor = ''
			if (t.type === 'pick') { actor = roster[pickPtr[team]] ?? ''; pickPtr[team]++ }
			else { actor = roster[banPtr[team] % Math.max(1, roster.length)] ?? ''; banPtr[team]++ }
			order.push({ team, type: t.type, actor })
		}
	} else if (system === 'single-draft') {
		const pickPtr: Record<Team, number> = { orange: 0, blue: 0 }
		for (let i = 0; i < total; i++) {
			const team = i % 2 === 0 ? startingTeam : otherTeamOf(startingTeam)
			order.push({ team, type: 'pick', actor: rosters[team][pickPtr[team]] ?? '' })
			pickPtr[team]++
		}
	}

	const picks: Record<string, string> = {}
	if (system === 'all-random') {
		const rolled = shuffle(pool)
		let i = 0
		for (const id of [...rosters.orange, ...rosters.blue]) picks[id] = rolled[i++] ?? ''
	}

	// drop any turns with no owner (can happen if teams are uneven at Begin)
	const owned = order.filter((t) => t.actor)
	const offer = system === 'single-draft' ? rollOffer(pool, new Set(), 3) : []
	// all-random resolves instantly; every other mode gets a timer (per-turn for
	// turn-based, whole-phase for all-pick) so the draft can never hang
	const deadline = system === 'all-random' ? 0 : Date.now() + DRAFT_TURN_MS
	return { system, pool, order: owned, step: 0, picks, bans: [], offer, offered: [...offer], deadline, lastAction: null }
}

export const draftTurn = (d: DraftState): DraftTurn | null => d.order[d.step] ?? null
export const draftActor = (d: DraftState): string | null => draftTurn(d)?.actor ?? null

/** Heroes no longer selectable (already picked or banned). */
export function draftBlocked(d: DraftState): Set<string> {
	return new Set([...Object.values(d.picks), ...d.bans])
}

/** Is the draft finished? */
export function draftComplete(d: DraftState, seatedIds: string[]): boolean {
	if (d.order.length) return d.step >= d.order.length
	return seatedIds.length > 0 && seatedIds.every((id) => d.picks[id]) // all-pick / all-random
}

/**
 * Apply the current turn's action (a pick or ban of `heroId` by the active
 * actor) and advance one step. Rolls the next offer for single-draft. Only
 * call on the actor's turn (the UI enforces this).
 */
export function draftAdvance(d: DraftState, heroId: string, auto = false): DraftState {
	const turn = draftTurn(d)
	if (!turn) return d
	const picks = { ...d.picks }
	const bans = [...d.bans]
	if (turn.type === 'ban') bans.push(heroId)
	else picks[turn.actor] = heroId
	const step = d.step + 1
	let offer = d.offer
	let offered = d.offered
	if (d.system === 'single-draft' && step < d.order.length) {
		const exclude = new Set([...Object.values(picks), ...bans, ...d.offered])
		offer = rollOffer(d.pool, exclude, 3)
		offered = [...d.offered, ...offer]
	}
	const deadline = step < d.order.length ? Date.now() + DRAFT_TURN_MS : 0
	const lastAction: DraftAction = { team: turn.team, type: turn.type, actor: turn.actor, hero: heroId, at: Date.now(), auto }
	return { ...d, picks, bans, step, offer, offered, deadline, lastAction }
}

/** All-pick: set (or change) a single player's own pick. */
export function draftSetPick(d: DraftState, clientId: string, heroId: string, team?: Team, auto = false): DraftState {
	const lastAction = team ? { team, type: 'pick' as const, actor: clientId, hero: heroId, at: Date.now(), auto } : d.lastAction
	return { ...d, picks: { ...d.picks, [clientId]: heroId }, lastAction }
}

export function initialMatchState(
	opts: {
		length?: 'quick' | 'long'
		players?: number
		waves?: number
		wavesMax?: number
		life?: number
		mapId?: string
		map?: GameMap | null
		draftSystem?: DraftSystem
		draftStars?: number[]
	} = {}
): MatchState {
	const length = opts.length ?? 'long'
	const players = opts.players ?? 6
	const life = opts.life ?? lifeFor(length, players)
	// NOTE: wave-counter counts are the victory track (per rulebook), NOT minion
	// tokens. Exact starting counts still need confirming; default from wavesFor
	// until the create-screen setting / rulebook numbers are wired in.
	const wavesMax = opts.wavesMax ?? wavesFor(length)
	const waves = opts.waves ?? wavesMax
	return {
		round: 1,
		turn: 1,
		phase: 'planning',
		tieBreaker: 'orange',
		waves,
		wavesMax,
		waveTok: Array(wavesMax).fill(true),
		lastPush: null,
		life: { orange: life, blue: life },
		lifeMax: life,
		lifeTok: { orange: Array(life).fill(true), blue: Array(life).fill(true) },
		timer: { running: false, baseMs: 0, startedAt: null },
		log: [],
		mapId: opts.mapId ?? '',
		map: opts.map ?? null,
		pieces: {},
		seats: players,
		host: '',
		draftSystem: opts.draftSystem ?? 'all-pick',
		draftStars: opts.draftStars ?? [1, 2, 3, 4],
		draft: null,
		started: false,
		closed: false,
		startFlip: null,
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
	/** Update this client's name, colour, ready state and/or seat. */
	setSelf: (info: { name?: string; color?: string; ready?: boolean; seat?: number }) => void
	/** Host: ask a player (by clientId) to leave the room. */
	kick: (id: string) => void
	/** Becomes true when THIS client has been kicked. */
	kicked: Readable<boolean>
	/** Becomes true when JOINING a room code that has no host (no such game). */
	notFound: Readable<boolean>
	/** Live realtime connection state, for a connection indicator. */
	status: Readable<ConnStatus>
	leave: () => void
	clientId: string
}

/**
 * Join or create a match room and keep a live, shared MatchState in sync.
 *
 * Pass `opts.seed` to CREATE a room — that seed (ruleset + map) is authoritative.
 * Omit it to JOIN: the client starts with a placeholder (rev -1) that any real
 * state overrides, so a joiner always inherits the room's settings rather than
 * imposing its own. If no host answers within a short grace period, the joiner
 * promotes itself to host with a default game so it isn't stuck.
 */
export function joinMatch(
	room: string,
	self: { name: string; color: string },
	opts: { seed?: MatchState } = {}
): MatchSession {
	const clientId = stableClientId()

	const creating = !!opts.seed
	// A joiner's placeholder uses rev -1 so ANY incoming state (even rev 0) wins.
	const start: MatchState = opts.seed ?? { ...initialMatchState(), rev: -1 }
	const state = writable<MatchState>(start)
	const players = writable<Player[]>([])
	let local: MatchState = start
	state.subscribe((v) => (local = v))

	if (creating) start.host = clientId
	let me: Player = { id: clientId, name: self.name, color: self.color, ready: false, seat: -1 }
	let graceTimer: ReturnType<typeof setTimeout> | null = null
	const kicked = writable(false)
	const notFound = writable(false)
	const conn = writable<ConnStatus>('connecting')

	// The channel is rebuilt on a hard reconnect, so it's a `let` that every
	// closure reads at call time rather than capturing once.
	let channel: RealtimeChannel
	let stateTimer: ReturnType<typeof setTimeout> | null = null
	let watchdog: ReturnType<typeof setTimeout> | null = null
	let backoff = 1500

	const applyRemote = (incoming: MatchState) => {
		// last-write-wins: accept strictly newer revisions, break ties on time
		if (
			incoming.rev > local.rev ||
			(incoming.rev === local.rev && incoming.updatedAt > local.updatedAt)
		) {
			state.set(incoming)
		}
	}

	// State broadcasts are coalesced to a trailing edge: each edit bumps `rev` and
	// updates local state instantly, but we send at most one snapshot per STATE_MIN
	// ms (always the latest — LWW makes intermediate revs safe to skip). This keeps
	// rapid clicking well under Supabase Realtime's per-channel rate limit, which
	// was closing the socket.
	let lastState = 0
	const STATE_MIN = 140
	const flushState = () => {
		stateTimer = null
		lastState = Date.now()
		try { channel.send({ type: 'broadcast', event: 'state', payload: local }) } catch { /* ignore */ }
	}
	const broadcastState = () => {
		if (stateTimer) return // a trailing flush is queued; it sends the latest local
		const wait = STATE_MIN - (Date.now() - lastState)
		if (wait <= 0) flushState()
		else stateTimer = setTimeout(flushState, wait)
	}

	const registerHandlers = (ch: RealtimeChannel) => {
		ch.on('broadcast', { event: 'state' }, ({ payload }) => applyRemote(payload as MatchState))
			.on('broadcast', { event: 'hello' }, () => {
				// a newcomer asked for the current state — anyone holding real state
				// (not a placeholder) shares it, so joiners inherit the room settings
				if (local.rev >= 0) broadcastState()
			})
			.on('broadcast', { event: 'kick' }, ({ payload }) => {
				if ((payload as { id: string }).id === clientId) kicked.set(true)
			})
			.on('presence', { event: 'sync' }, () => {
				const raw = ch.presenceState() as Record<string, Array<Partial<Player>>>
				const list: Player[] = []
				for (const key in raw) {
					const meta = raw[key][0] ?? {}
					list.push({
						id: key,
						name: (meta.name as string) ?? 'Player',
						color: (meta.color as string) ?? 'spectator',
						ready: (meta.ready as boolean) ?? false,
						seat: typeof meta.seat === 'number' ? meta.seat : -1
					})
				}
				players.set(list)
			})
	}

	// JOIN flow only: probe a few times for a host. We must NEVER create a room —
	// if someone is present we keep asking for their state until it arrives; if the
	// room is genuinely empty after several tries, report "not found".
	const startProbe = () => {
		if (creating || local.rev >= 0) return
		if (graceTimer) clearTimeout(graceTimer)
		let empties = 0
		const probe = () => {
			if (local.rev >= 0) return
			const others = Object.keys(channel.presenceState()).filter((k) => k !== clientId).length
			if (others > 0) {
				empties = 0
				channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } })
				graceTimer = setTimeout(probe, 1000)
			} else if (++empties >= 3) {
				notFound.set(true)
			} else {
				channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } })
				graceTimer = setTimeout(probe, 700)
			}
		}
		graceTimer = setTimeout(probe, 700)
	}

	const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null } }
	const armWatchdog = () => { if (!watchdog) watchdog = setTimeout(hardReconnect, backoff) }
	// If the channel stays down past the backoff, tear it down and rebuild it —
	// Supabase's own rejoin sometimes wedges after a rate-limit close.
	const hardReconnect = () => {
		watchdog = null
		backoff = Math.min(backoff * 2, 10000)
		try { supabase.removeChannel(channel) } catch { /* ignore */ }
		buildChannel()
	}

	const onStatus = (s: string) => {
		if (s === 'SUBSCRIBED') {
			conn.set('connected')
			backoff = 1500
			clearWatchdog()
			channel.track(me) // (re-)announce presence, also after a reconnect
			channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } })
			startProbe()
			return
		}
		if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { conn.set('reconnecting'); armWatchdog() }
		else if (s === 'CLOSED') { conn.set('closed'); armWatchdog() }
	}

	function buildChannel() {
		channel = supabase.channel(`match:${room}`, {
			config: { broadcast: { self: false }, presence: { key: clientId } }
		})
		registerHandlers(channel)
		channel.subscribe(onStatus)
	}

	buildChannel()

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

	// Presence updates are throttled: Supabase Realtime rate-limits messages per
	// channel, so rapid color switches (fast clicks) would otherwise flood track()
	// and wedge the socket. We update `me` instantly and coalesce network pushes to
	// at most one per TRACK_MIN ms, always sending the latest state (trailing edge).
	let trackTimer: ReturnType<typeof setTimeout> | null = null
	let lastTrack = 0
	const TRACK_MIN = 320
	const flushTrack = () => {
		trackTimer = null
		lastTrack = Date.now()
		try { channel.track(me) } catch { /* ignore */ }
	}
	const scheduleTrack = () => {
		if (trackTimer) return // a trailing flush is already queued; it sends latest me
		const wait = TRACK_MIN - (Date.now() - lastTrack)
		if (wait <= 0) flushTrack()
		else trackTimer = setTimeout(flushTrack, wait)
	}

	const setSelf = (info: { name?: string; color?: string; ready?: boolean; seat?: number }) => {
		me = { ...me, ...info }
		scheduleTrack()
	}

	// host asks a player to leave; the target client observes and leaves itself
	const kick = (id: string) => {
		channel.send({ type: 'broadcast', event: 'kick', payload: { id } })
	}

	const leave = () => {
		if (graceTimer) clearTimeout(graceTimer)
		if (trackTimer) clearTimeout(trackTimer)
		if (stateTimer) clearTimeout(stateTimer)
		clearWatchdog()
		try {
			channel.untrack()
			supabase.removeChannel(channel)
		} catch {
			/* ignore */
		}
	}

	return { state, players, update, act, setSelf, kick, kicked, notFound, status: conn, leave, clientId }
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

// ---- Pieces on the board ----------------------------------------------------

export function addPiece(s: MatchState, piece: Piece): Partial<MatchState> {
	return { pieces: { ...s.pieces, [piece.id]: piece } }
}
export function movePiece(s: MatchState, id: string, hex: string): Partial<MatchState> {
	const p = s.pieces[id]
	if (!p) return {}
	return { pieces: { ...s.pieces, [id]: { ...p, hex } } }
}
export function removePiece(s: MatchState, id: string): Partial<MatchState> {
	const next = { ...s.pieces }
	delete next[id]
	return { pieces: next }
}
export function clearPieces(): Partial<MatchState> {
	return { pieces: {} }
}
export function newPieceId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export { otherTeam, clampTurn }
