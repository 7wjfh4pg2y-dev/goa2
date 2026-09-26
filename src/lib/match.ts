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

import { expireEffects, type Effect } from './effects'
import { writable, type Readable } from 'svelte/store'
import { supabase } from './supabase'
import { tabClientId } from './identity'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameMap } from './maps'
import type { PlayerCardState } from './cards/cardstate'
import {
	commitCard,
	passTurn,
	uncommit,
	discardCard,
	undiscard,
	revealPlayer,
	endRoundAll,
	addCoins,
	moveCard,
	levelOf,
	type CardZone
} from './cards/cardstate'

/** A per-player card instruction, applied authoritatively by the host. */
export type CardReq =
	| { kind: 'commit'; pid: string; idx: number }
	| { kind: 'pass'; pid: string }
	| { kind: 'uncommit'; pid: string }
	| { kind: 'defend'; pid: string; idx: number }
	| { kind: 'undiscard'; pid: string; idx: number }
	| { kind: 'coins'; pid: string; delta: number }
	| { kind: 'cardmove'; pid: string; idx: number; to: CardZone } // move a card between hand/deck/upgrade/removed
	| { kind: 'ult'; pid: string; on: boolean } // unlock / relock the ultimate (level 8)
	| { kind: 'forcepass'; pid: string } // host: pass everyone not yet committed
	| { kind: 'advance'; pid: string } // host: lock this turn's cards into their slots, go to next turn

/** Apply a card instruction to the shared state, returning the patch to broadcast. */
export function applyCardReq(s: MatchState, req: CardReq): Partial<MatchState> {
	const cards = s.cards ?? {}
	const turnIdx = s.turn - 1

	// host: make everyone who hasn't committed pass, so the turn can reveal/advance
	if (req.kind === 'forcepass') {
		const next: Record<string, PlayerCardState> = { ...cards }
		for (const pid in next) if (next[pid].pending == null) next[pid] = passTurn(next[pid])
		return { cards: next }
	}
	// host: lock each committed card into its turn slot, then move to the next turn;
	// after turn 4 the round ends and hands refresh
	if (req.kind === 'advance') {
		const migrated: Record<string, PlayerCardState> = {}
		for (const pid in cards) migrated[pid] = revealPlayer(cards[pid], turnIdx)
		if (s.turn >= TURNS_PER_ROUND) {
			// round over: hands refresh, and the board is swept of tokens and markers
			const pieces: Record<string, Piece> = {}
			for (const id in s.pieces ?? {}) if (keepsThroughRound(s.pieces[id])) pieces[id] = s.pieces[id]
			return { cards: endRoundAll(migrated), round: s.round + 1, turn: 1, battlePhase: false, pieces, status: {}, radii: {}, effects: expireEffects(s.effects, s.round, s.turn) }
		}
		return { cards: migrated, turn: s.turn + 1, radii: {}, effects: expireEffects(s.effects, s.round, s.turn) }
	}

	const cs = cards[req.pid]
	if (!cs) return {}
	let next = cs
	if (req.kind === 'commit') next = commitCard(cs, req.idx)
	else if (req.kind === 'pass') next = passTurn(cs)
	else if (req.kind === 'uncommit') next = uncommit(cs)
	else if (req.kind === 'defend') next = discardCard(cs, req.idx)
	else if (req.kind === 'undiscard') next = undiscard(cs, req.idx)
	else if (req.kind === 'coins') next = addCoins(cs, req.delta)
	else if (req.kind === 'cardmove') next = moveCard(cs, req.idx, req.to)
	else if (req.kind === 'ult') next = { ...cs, ultimate: req.on }
	return { cards: { ...cards, [req.pid]: next } }
}

/** Realtime connection state, surfaced so the UI can show a status indicator. */
export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed'

/** This tab's player id — per tab, stable across refreshes; a closed tab's id
 * can be re-adopted on reopen (see identity.ts). */
const stableClientId = () => tabClientId()

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
export const DRAFT_TURN_MS = 80_000 // 1:20 to pick (a 10s red grace follows)

export const TEAMS: Team[] = ['orange', 'blue']
export const TURNS_PER_ROUND = 4
// synced pre-reveal countdown: once everyone has committed, cards flip face-up
// after this delay (players can still uncommit during it, which restarts it).
export const REVEAL_COUNTDOWN_MS = 4500 // a slow 3… 2… 1… Reveal!
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
	cards?: Record<string, PlayerCardState> // per-player card state, keyed by playerId
	cardPhase?: 'planning' | 'resolving' // planning = commit/ready; resolving = act in initiative order
	resolved?: string[] // playerIds who have confirmed their action done this turn
	battlePhase?: boolean // turn 4 revealed → minion battle pending (before advancing the round)
	// synced 3-2-1 pre-reveal countdown: epoch ms when cards flip face-up. Set by
	// the host the moment every seated player has committed; cleared if anyone
	// uncommits (so the count restarts from 3 when they all commit again).
	revealAt?: number | null
	// per-player status markers shown on the HUD (Tigerclaw poison, Bain bounty),
	// keyed by playerId. Counts so poison can stack; 0 = clear.
	status?: Record<string, { poison: number; bounty: number }>
	// temporary area-effect radius shown around a player's hero (1–8 hexes);
	// cleared whenever the turn advances
	radii?: Record<string, number>
	// lingering card effects (This turn / Next turn / This round), switched on per
	// played card; they expire on their own as turns advance (see effects.ts)
	effects?: Effect[]
	// durable seat ownership: seat index (as string) → the clientId + name that
	// owns that seat's hero. Set at game start; survives a player dropping from
	// presence, so a vacated seat can be identified and taken over.
	seatMap?: Record<string, { id: string; name: string }>
	// pending seat-takeover requests from spectators, awaiting host approval
	seatRequests?: Array<{ id: string; name: string; seat: number; at: number }>
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
	token?: string // token image name (e.g. "token_tree"), for token markers
	owner?: string // clientId of the player who placed this token
	attachedTo?: string // a marker riding on a hero piece (by piece id) — moves with it
	faceDown?: boolean // double-sided tokens (Min's Blast/Dud mines) placed hidden
}

/** Tokens/markers that survive the end of a round (Wuk's trees, Trinkets' turret,
 *  Widget's Pyro, Snorri's runes). Everything else token-like is wiped. */
export function keepsThroughRound(p: Piece): boolean {
	if (p.kind !== 'token') return true // heroes and minions are units, not tokens
	return p.token === 'companion' || p.token === 'token_tree' || !!p.token?.startsWith('rune_')
}

/** Hex id "c_r" → pixel-ish centre (size factored out; only used for centroids). */
function hexXY(id: string): { x: number; y: number } {
	const [c, r] = id.split('_').map(Number)
	return { x: Math.sqrt(3) * (c + 0.5 * (r & 1)), y: 1.5 * r }
}

/**
 * A team's throne — the gear (orange) / star (blue) hex where its heroes start.
 * Uses an explicitly-labelled spawn cell if the map has one, otherwise the base
 * hex nearest the base zone's centre.
 */
export function throneHexes(map: GameMap | null, team: Team): string[] {
	const cells = map?.cells ?? {}
	const label = team === 'orange' ? 'baseOrangeSpawn' : 'baseBlueSpawn'
	const explicit = Object.keys(cells).filter((id) => cells[id] === label).sort()
	if (explicit.length) return explicit
	const zone = team === 'orange' ? 'baseOrange' : 'baseBlue'
	const hexes = Object.keys(cells).filter((id) => cells[id] === zone)
	if (!hexes.length) return []
	const cx = hexes.reduce((s, h) => s + hexXY(h).x, 0) / hexes.length
	const cy = hexes.reduce((s, h) => s + hexXY(h).y, 0) / hexes.length
	let best = hexes[0], bd = Infinity
	for (const h of hexes) { const p = hexXY(h); const d = (p.x - cx) ** 2 + (p.y - cy) ** 2; if (d < bd) { bd = d; best = h } }
	return [best]
}
export function throneHex(map: GameMap | null, team: Team): string | null {
	return throneHexes(map, team)[0] ?? null
}

/**
 * Initial hero tokens: one per seated player who drafted a hero, spread across
 * their team's throne (gear/star) hexes and coloured by the player's token
 * colour. Called once by the host when the game starts.
 */
export function placeHeroes(state: MatchState, players: Player[]): Record<string, Piece> {
	const seated = players.filter((p) => p.seat >= 0 && p.seat < state.seats)
	const pieces: Record<string, Piece> = {}
	const fallback = Object.keys(state.map?.cells ?? {})[0] ?? '0_0'
	for (const team of TEAMS) {
		const thrones = throneHexes(state.map, team)
		const roster = seated.filter((p) => teamForSeat(p.seat, state.seats) === team).sort((a, b) => a.seat - b.seat)
		roster.forEach((p, i) => {
			const hero = state.draft?.picks[p.id]
			if (!hero) return
			const hex = thrones.length ? thrones[i % thrones.length] : fallback
			pieces[p.id] = { id: p.id, hex, team, kind: 'hero', hero, color: p.color }
		})
	}
	return pieces
}

/** Capture seat→owner at game start, so a dropped player's seat stays identified. */
export function buildSeatMap(players: Player[], seats: number): Record<string, { id: string; name: string }> {
	const m: Record<string, { id: string; name: string }> = {}
	for (const p of players) if (p.seat >= 0 && p.seat < seats) m[String(p.seat)] = { id: p.id, name: p.name }
	return m
}

/**
 * Hand a seat's hero (board piece, card state, draft pick, ownership) from one
 * clientId to another — used when a spectator takes over a dropped player. Pure;
 * returns the state patch. Tokens owned by the old player transfer too.
 */
export function transferSeat(s: MatchState, from: string, to: string, toName: string, seat: number): Partial<MatchState> {
	const cards = { ...(s.cards ?? {}) }
	if (cards[from]) { cards[to] = { ...cards[from] }; delete cards[from] }
	const pieces: Record<string, Piece> = {}
	for (const id in s.pieces) {
		const pc = s.pieces[id]
		if (id === from) pieces[to] = { ...pc, id: to, owner: to } // the hero token
		else if (pc.owner === from) pieces[id] = { ...pc, owner: to, ...(pc.attachedTo === from ? { attachedTo: to } : {}) } // their placed tokens
		else pieces[id] = pc.attachedTo === from ? { ...pc, attachedTo: to } : pc
	}
	let draft = s.draft
	if (draft && draft.picks[from]) {
		const picks = { ...draft.picks }; picks[to] = picks[from]; delete picks[from]
		draft = { ...draft, picks }
	}
	const seatMap = { ...(s.seatMap ?? {}) }; seatMap[String(seat)] = { id: to, name: toName }
	const patch: Partial<MatchState> = { cards, pieces, seatMap }
	if (draft) patch.draft = draft
	if (s.host === from) patch.host = to // the departed player was host → hand it over too
	return patch
}

/** Build a fresh minion piece for a team, placed on that team's throne hex. */
export function spawnMinion(state: MatchState, team: Team, role: 'melee' | 'ranged' | 'heavy'): Piece {
	const hex = throneHex(state.map, team) ?? Object.keys(state.map?.cells ?? {})[0] ?? '0_0'
	const id = `minion_${team}_${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
	return { id, hex, team, kind: 'minion', role }
}

/** Initial minion wave: place a movable minion on each hex the map author
 * flagged as a starting spawn (map.battleZone, set in the editor). No guessing —
 * a map with no battleZone simply spawns no minions until it's set up. */
export function placeMinions(state: MatchState): Record<string, Piece> {
	const pieces: Record<string, Piece> = {}
	for (const m of state.map?.battleZone ?? []) {
		const id = `minion_${m.hex}`
		pieces[id] = { id, hex: m.hex, team: m.team, kind: 'minion', role: m.kind }
	}
	return pieces
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
	{ id: 'yellow', label: 'Yellow', hex: '#eab308' },
	{ id: 'lime', label: 'Lime', hex: '#84cc16' },
	{ id: 'green', label: 'Green', hex: '#22c55e' },
	{ id: 'teal', label: 'Teal', hex: '#14b8a6' },
	{ id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
	{ id: 'purple', label: 'Purple', hex: '#a855f7' },
	{ id: 'magenta', label: 'Magenta', hex: '#d946ef' },
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
	// Wave-counter track = the victory track (removed on each lane push). A custom
	// game sets its own count; otherwise use the map's per-length value, then the
	// rulebook default (3 quick / 5 long).
	const wavesMax = opts.wavesMax ?? opts.waves ?? opts.map?.waves?.[length] ?? wavesFor(length)
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
		cardPhase: 'planning',
		resolved: [],
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
	/**
	 * Per-player card action (commit/pass/defend/…). Routed through the host so
	 * concurrent edits to the shared `cards` map can't clobber each other under
	 * last-write-wins. The host applies it authoritatively; everyone else's edit
	 * to their own card state travels as a small instruction, not a full snapshot.
	 */
	cardAction: (req: CardReq) => void
	/** Host: ask a player (by clientId) to leave the room. */
	kick: (id: string) => void
	/** Announce a team-join coin flip so every client plays the animation. */
	flipJoin: (side: Team, name: string) => void
	/** Emits when ANOTHER player flips to join a team (for the shared animation). */
	joinFlip: Readable<{ id: string; name: string; side: Team; at: number } | null>
	/** Host: undo the most recent logged action (down to the turn's first entry). */
	undo: () => void
	/** True while the host has at least one action to undo this turn. */
	canUndo: Readable<boolean>
	/** Spectator: ask the host to take over a (vacant) seat. */
	requestSeat: (seat: number) => void
	/** Host: approve or deny a pending seat-takeover request (by requester id). */
	resolveSeat: (reqId: string, approve: boolean) => void
	/** Emits { seat, colour } when THIS client is granted a seat takeover. */
	seatGranted: Readable<{ seat: number; color: string } | null>
	/** Bumps (timestamp) when THIS client's seat request is denied. */
	seatDenied: Readable<number>
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
	let playerList: Player[] = []
	players.subscribe((v) => (playerList = v))
	const nameOf = (id: string) => playerList.find((p) => p.id === id)?.name ?? 'A player'
	let local: MatchState = start
	state.subscribe((v) => (local = v))

	if (creating) start.host = clientId
	let me: Player = { id: clientId, name: self.name, color: self.color, ready: false, seat: -1 }
	let graceTimer: ReturnType<typeof setTimeout> | null = null
	const kicked = writable(false)
	const notFound = writable(false)
	const seatGranted = writable<{ seat: number; color: string } | null>(null)
	const seatDenied = writable(0)
	// another player flipped to join a team — everyone plays the coin animation
	const joinFlip = writable<{ id: string; name: string; side: Team; at: number } | null>(null)
	// host-local undo: snapshots of state before each logged action THIS turn.
	// Immutable nested updates mean a shallow reference is a safe snapshot. The
	// stack resets whenever the round/turn changes, so undo floors at turn start.
	const UNDO_CAP = 60
	let undoStack: MatchState[] = []
	const canUndo = writable(false)
	let undoing = false
	// Track undo history across a state transition (any origin). A new turn/round
	// resets the stack; a transition that appended a log entry pushes the prior
	// state so the host can step back entry-by-entry to the start of the turn.
	// Defined ahead of buildChannel() so the initial subscribe's applyRemote (which
	// calls it synchronously) never hits it in the temporal dead zone.
	const recordHistory = (before: MatchState, after: MatchState) => {
		if (undoing || !before || !after) return
		if (after.round !== before.round || after.turn !== before.turn) {
			if (undoStack.length) { undoStack = []; canUndo.set(false) }
			return
		}
		if ((after.log?.length ?? 0) > (before.log?.length ?? 0)) {
			undoStack.push(before)
			if (undoStack.length > UNDO_CAP) undoStack.shift()
			canUndo.set(true)
		}
	}
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
			recordHistory(local, incoming)
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
			.on('broadcast', { event: 'seatreq' }, ({ payload }) => {
				if (local.host !== clientId) return // only the host tracks pending requests
				const r = payload as { id: string; name: string; seat: number }
				const reqs = (local.seatRequests ?? []).filter((x) => x.id !== r.id)
				reqs.push({ id: r.id, name: r.name, seat: r.seat, at: Date.now() })
				update({ seatRequests: reqs })
			})
			.on('broadcast', { event: 'seatgrant' }, ({ payload }) => {
				const p = payload as { to: string; seat: number; color: string }
				if (p.to === clientId) seatGranted.set({ seat: p.seat, color: p.color })
			})
			.on('broadcast', { event: 'seatdeny' }, ({ payload }) => {
				if ((payload as { to: string }).to === clientId) seatDenied.set(Date.now())
			})
			.on('broadcast', { event: 'cardreq' }, ({ payload }) => {
				// only the host is authoritative for the shared card map / resolved list
				if (local.host !== clientId) return
				hostApplyReq(payload as CardReq)
			})
			.on('broadcast', { event: 'joinflip' }, ({ payload }) => {
				joinFlip.set(payload as { id: string; name: string; side: Team; at: number })
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
		const before = local
		const after = {
			...local,
			...patch,
			rev: local.rev + 1,
			updatedBy: clientId,
			updatedAt: Date.now()
		}
		recordHistory(before, after)
		local = after
		state.set(local)
		broadcastState()
	}

	// host: revert the most recent logged action, snapping back one activity-log
	// entry at a time (down to the first entry of the current turn).
	const undo = () => {
		if (local.host !== clientId) return
		const snap = undoStack.pop()
		canUndo.set(undoStack.length > 0)
		if (!snap) return
		undoing = true // don't let this restore re-enter the history
		update({ ...snap })
		undoing = false
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

	// Per-player card action. The host applies directly (it IS the authority);
	// everyone else broadcasts the instruction for the host to apply, so two
	// players committing at once can't overwrite each other's card state.
	// host applies a card instruction; a coins change is also written to the log,
	// attributed to the player it belongs to (not the host who applied it)
	const hostApplyReq = (req: CardReq) => {
		const patch = applyCardReq(local, req)
		if (!Object.keys(patch).length) return
		// Maintain the synced 3-2-1 reveal countdown. When a card action leaves
		// every seated player committed, anchor a reveal time (unless one is already
		// running — don't restart while it holds); any non-committed state clears it,
		// so the count starts fresh from 3 the next time they all commit. 'advance'
		// starts a new turn, so it always clears the anchor.
		if (patch.cards) {
			const seats = patch.seats ?? local.seats
			const withCards = playerList
				.filter((p) => p.seat >= 0 && p.seat < seats)
				.map((p) => patch.cards![p.id])
				.filter(Boolean)
			const allIn = withCards.length > 0 && withCards.every((cs) => cs.pending != null || cs.hand.length === 0)
			const keep = req.kind !== 'advance' && allIn
			patch.revealAt = keep ? (local.revealAt ?? Date.now() + REVEAL_COUNTDOWN_MS) : null
		}
		// log entries the host writes on a player's behalf: money changes and
		// level-ups (a card upgraded / the ultimate unlocked), attributed to them
		const entries: LogEntry[] = []
		const note = (pid: string, text: string) => entries.push({
			id: globalThis.crypto?.randomUUID?.() ?? `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			by: nameOf(pid), text, at: Date.now()
		})
		if (req.kind === 'coins') {
			const coins = patch.cards?.[req.pid]?.coins ?? 0
			note(req.pid, `money ${req.delta > 0 ? '+' : '−'}${Math.abs(req.delta)} → ${coins}`)
		}
		for (const pid in patch.cards ?? {}) {
			const before = local.cards?.[pid], after = patch.cards![pid]
			if (before && after && levelOf(after) > levelOf(before)) note(pid, `reached Level ${levelOf(after)} ⬆`)
		}
		// lingering effects that just ran out
		if (patch.effects) {
			const kept = new Set(patch.effects.map((e) => e.id))
			for (const e of local.effects ?? []) if (!kept.has(e.id)) note(e.pid, `${e.name} — effect ended`)
		}
		if (entries.length) update({ ...patch, log: [...local.log, ...entries].slice(-LOG_CAP) })
		else update(patch)
	}
	const cardAction = (req: CardReq) => {
		if (local.host === clientId) hostApplyReq(req)
		else try { channel.send({ type: 'broadcast', event: 'cardreq', payload: req }) } catch { /* ignore */ }
	}

	// host asks a player to leave; the target client observes and leaves itself
	const kick = (id: string) => {
		channel.send({ type: 'broadcast', event: 'kick', payload: { id } })
	}

	// announce a team-join coin flip so every client plays the animation, not just
	// the flipper (broadcast self:false ⇒ the sender animates locally instead).
	const flipJoin = (side: Team, name: string) => {
		try { channel.send({ type: 'broadcast', event: 'joinflip', payload: { id: clientId, name, side, at: Date.now() } }) } catch { /* ignore */ }
	}

	// spectator → host: request to take over a seat (host approves in the menu)
	const requestSeat = (seat: number) => {
		if (local.host === clientId) return // host is seated; nothing to request
		try { channel.send({ type: 'broadcast', event: 'seatreq', payload: { id: clientId, name: me.name, seat } }) } catch { /* ignore */ }
	}
	// host: approve (transfer the seat's hero to the requester) or deny a request
	const resolveSeat = (reqId: string, approve: boolean) => {
		if (local.host !== clientId) return
		const req = (local.seatRequests ?? []).find((r) => r.id === reqId)
		const reqs = (local.seatRequests ?? []).filter((r) => r.id !== reqId)
		if (approve && req) {
			const from = local.seatMap?.[String(req.seat)]?.id ?? ''
			const color = (from && local.pieces?.[from]?.color) || 'spectator'
			const patch = from
				? transferSeat(local, from, reqId, req.name, req.seat)
				: { seatMap: { ...(local.seatMap ?? {}), [String(req.seat)]: { id: reqId, name: req.name } } }
			act(`${req.name} took over ${local.seatMap?.[String(req.seat)]?.name ?? 'a'} seat`, { ...patch, seatRequests: reqs })
			try { channel.send({ type: 'broadcast', event: 'seatgrant', payload: { to: reqId, seat: req.seat, color } }) } catch { /* ignore */ }
		} else {
			update({ seatRequests: reqs })
			if (req) try { channel.send({ type: 'broadcast', event: 'seatdeny', payload: { to: reqId, seat: req.seat } }) } catch { /* ignore */ }
		}
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

	return { state, players, update, act, setSelf, cardAction, kick, flipJoin, joinFlip, undo, canUndo, requestSeat, resolveSeat, seatGranted, seatDenied, kicked, notFound, status: conn, leave, clientId }
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
