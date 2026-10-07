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

import { teamName, aMinion } from './teams'
import { hexCube, cubeDist } from './zones'
import { tokenExpiry, sweepTokens, statusFrom, isTurret } from './tokens'
import { expireEffects, type Effect } from './effects'
import { startBattle, pushCheck, battleRemove, battleAuto, battleResult, laneNotes, heavyImmune, type Battle, type PushNews } from './battle'
import { get, writable, type Readable } from 'svelte/store'
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
	discardPlayed,
	revealPlayer,
	endRoundAll,
	levelUp,
	manualMove,
	swapPick,
	closeLevelPhase,
	lockPicks,
	addCoins,
	levelOf,
	statDeltas,
	type CardZone
} from './cards/cardstate'
import { heroCards } from './cards/deck'

/** A per-player card instruction, applied authoritatively by the host. */
export type CardReq =
	| { kind: 'commit'; pid: string; idx: number }
	| { kind: 'pass'; pid: string }
	| { kind: 'uncommit'; pid: string }
	| { kind: 'defend'; pid: string; idx: number }
	| { kind: 'undiscard'; pid: string; idx: number }
	| { kind: 'discardPlayed'; pid: string; idx: number } // an effect discards a card already played (turn slot / this turn's card)
	| { kind: 'coins'; pid: string; delta: number }
	| { kind: 'cardmove'; pid: string; idx: number; to: CardZone } // move a card between hand/deck/upgrade/removed
	| { kind: 'ult'; pid: string; on: boolean } // unlock / relock the ultimate (level 8)
	| { kind: 'take'; pid: string; idx: number } // level-up pick (level-up phase only, pays coins): card → hand, twin → item, older card → removed
	| { kind: 'swap'; pid: string; idx: number } // level-up phase: swap this round's pick for its twin (idx = the twin)
	| { kind: 'defeatMinion'; pid: string; piece: string } // pid defeated an enemy minion: +2 coins (+4 heavy)
	| { kind: 'removeMinion'; pid: string; piece: string } // a card effect removed a minion: no coins
	| { kind: 'removeHero'; pid: string } // pid takes their own hero off the board (a card effect): no rewards, respawns with their next card
	| { kind: 'clearAround'; pid: string; ids: string[] } // Clear (instead of an attack): the chosen tokens next to pid's hero leave the board
	| { kind: 'defeatHero'; pid: string; target: string; keepCard?: boolean } // pid defeated target's hero (coins, assists, life); keepCard = their card this turn had already resolved (default: worked out from initiative)
	| { kind: 'attack'; pid: string; target: string } // pid attacks target's hero → the defender is asked "Defend?"
	| { kind: 'attackResolve'; pid: string; target: string; result: 'defend' | 'defended' | 'defeated' | 'cancel' } // the defender's answer (or the host's); the attacker may cancel
	| { kind: 'spawn'; pid: string; hex: string } // game start: place your hero on one of your base's spawn points
	| { kind: 'respawn'; pid: string; hex: string } // a defeated hero comes back on a hex
	| { kind: 'battleRemove'; pid: string; piece: string } // the minion battle's loser takes a minion off
	| { kind: 'battleAuto'; pid: string } // …or lets the game choose the rest
	| { kind: 'forcepass'; pid: string } // host: pass everyone not yet committed
	| { kind: 'advance'; pid: string } // host: lock this turn's cards into their slots, go to next turn
	| { kind: 'endAct'; pid: string } // the acting player (or the host, for someone away) ends their turn: the next card acts; after the last, the turn moves on
	| { kind: 'setAct'; pid: string; idx: number } // host: say who is acting (a click on the order row)

/** Minion battle (after turn 4 is revealed): lock the last cards in, then every
 *  card goes back to its owner's hand as if the round had ended — so players can
 *  level up and swap cards before the next round. (The later "Next round"
 *  advance then finds nothing left to return.) */
export function battlePatch(s: MatchState): Partial<MatchState> {
	const cards = s.cards ?? {}
	const migrated: Record<string, PlayerCardState> = {}
	for (const pid in cards) migrated[pid] = revealPlayer(cards[pid], s.turn - 1)
	// the end-of-turn push check, then the battle count (battle.ts); the news drives the splash
	const fight = startBattle(s)
	const b = battleResult({ ...s, ...fight })
	const battleNews: BattleNews = { id: `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, ...b, at: Date.now() }
	return { battlePhase: true, cards: endRoundAll(migrated), ...fight, battleNews }
}

/** Host, after the minion battle (and its removals): open the level-up step. */
export const levelPatch = (s?: Pick<MatchState, 'cards'>): Partial<MatchState> => ({ levelPhase: true, levelBase: s?.cards ?? null })

// ── Active turns: after the reveal the cards act one at a time, highest initiative first ──
export const turnKey = (s: Pick<MatchState, 'round' | 'turn'>) => `${s.round}-${s.turn}`
/** This turn's acting order: every card in play (not a pass), highest initiative (items included) first; a tie
 *  goes to the team holding the tie-breaker coin, then by id so every screen agrees. */
export function turnOrder(s: MatchState): string[] {
	const cards = s.cards ?? {}
	const tie = (pid: string) => (teamOf(s, pid) === s.tieBreaker ? 0 : 1)
	return Object.keys(cards)
		.filter((pid) => { const i = cards[pid].pending; return i != null && i >= 0 })
		.map((pid) => ({ pid, ini: cardInitiative(s, pid) ?? 0 }))
		.sort((a, b) => b.ini - a.ini || tie(a.pid) - tie(b.pid) || (a.pid < b.pid ? -1 : 1))
		.map((x) => x.pid)
}
/** How far this turn's acting has got (0 = the first card; the order's length = everyone has acted). */
export const actingIdx = (s: MatchState) => (s.acting?.key === turnKey(s) ? s.acting.idx : 0)
/** Whose card acts now (null once everyone has, or before anything is in play). */
export const actorOf = (s: MatchState): string | null => turnOrder(s)[actingIdx(s)] ?? null

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
	// the acting player ends their turn (the host may, for someone away): the next card acts; after the last
	// one the turn moves on by itself — except turn 4, where the host's Minion battle comes next
	if (req.kind === 'endAct') {
		const order = turnOrder(s), at = actingIdx(s)
		if (at >= order.length || (req.pid !== order[at] && req.pid !== s.host)) return {}
		if (at + 1 >= order.length && s.turn < TURNS_PER_ROUND) return { ...applyCardReq(s, { kind: 'advance', pid: req.pid }), acting: null }
		return { acting: { key: turnKey(s), idx: at + 1 } }
	}
	if (req.kind === 'setAct') {
		if (req.pid !== s.host) return {}
		return { acting: { key: turnKey(s), idx: Math.max(0, Math.min(turnOrder(s).length, req.idx)) } }
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
			// the level-up phase closes with the round: picks lock in, no level-up = pity coin
			let next = endRoundAll(migrated)
			next = Object.fromEntries(Object.entries(next).map(([pid, c]) => [pid, s.battlePhase || s.levelPhase ? closeLevelPhase(c) : lockPicks(c)]))
			return { cards: next, round: s.round + 1, turn: 1, battlePhase: false, levelPhase: false, levelBase: null, battle: null, attacks: {}, pieces, status: {}, radii: {}, effects: expireEffects(s.effects, s.round, s.turn) }
		}
		// end of turn: Glitch / Grenade tokens leave play (tokens.ts), then a team with
		// no minions left in the battle zone gets pushed (battle.ts)
		const pieces = sweepTokens(s.pieces ?? {}, 'turn')
		return { cards: migrated, turn: s.turn + 1, radii: {}, attacks: {}, pieces, effects: expireEffects(s.effects, s.round, s.turn), ...pushCheck({ ...s, pieces }) }
	}

	if (req.kind === 'defeatMinion' || req.kind === 'removeMinion') {
		// the moment a team's last minion (its heavy) leaves the battle zone, the other team pushes
		// an immune heavy can't be touched (the host can still override for card exceptions)
		if (heavyImmune(s, req.piece) && req.pid !== s.host) return {}
		const off = minionOff(s, req.pid, req.piece, req.kind === 'defeatMinion')
		return off.pieces ? { ...off, ...pushCheck({ ...s, ...off }) } : off
	}
	if (req.kind === 'defeatHero') return defeatHero(s, req.pid, req.target, req.keepCard)
	if (req.kind === 'removeHero') return removeHero(s, req.pid)
	if (req.kind === 'clearAround') { const c = clearAround(s, req.pid, req.ids ?? []); return c.removed.length ? { pieces: c.pieces } : {} }
	if (req.kind === 'respawn') return respawnHero(s, req.pid, req.hex)
	if (req.kind === 'spawn') return spawnHero(s, req.pid, req.hex)
	if (req.kind === 'attack') return startAttack(s, req.pid, req.target)
	if (req.kind === 'attackResolve') return resolveAttack(s, req.pid, req.target, req.result)
	if (req.kind === 'battleRemove' || req.kind === 'battleAuto') {
		// the losing team's players (or the host) choose
		if (!s.battle?.loser || (req.pid !== s.host && teamOf(s, req.pid) !== s.battle.loser)) return {}
		return req.kind === 'battleAuto' ? battleAuto(s) : battleRemove(s, req.piece)
	}

	const cs = cards[req.pid]
	if (!cs) return {}
	let next = cs
	if (req.kind === 'commit') next = commitCard(cs, req.idx)
	else if (req.kind === 'pass') next = passTurn(cs)
	else if (req.kind === 'uncommit') next = uncommit(cs)
	else if (req.kind === 'defend') next = discardCard(cs, req.idx)
	else if (req.kind === 'undiscard') next = undiscard(cs, req.idx)
	else if (req.kind === 'discardPlayed') next = discardPlayed(cs, req.idx)
	else if (req.kind === 'coins') next = addCoins(cs, req.delta)
	else if (req.kind === 'cardmove') next = manualMove(cs, req.idx, req.to)
	else if (req.kind === 'ult') next = { ...cs, ultimate: req.on }
	else if (req.kind === 'take') { if (!s.levelPhase) return {}; next = levelUp(cs, req.idx) }
	else if (req.kind === 'swap') { if (!s.levelPhase) return {}; next = swapPick(cs, req.idx) }
	// a discard while being attacked is the defence: the defender may now answer Defended
	const atk = s.attacks?.[req.pid]
	if (req.kind === 'defend' && atk && next !== cs) return { cards: { ...cards, [req.pid]: next }, attacks: { ...s.attacks, [req.pid]: { ...atk, defending: true, discarded: true } } }
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

/** A ping: a short-lived "look here" on a hex, in the pinger's colour (not part of the shared state). */
export interface Ping { id: string; by: string; hex: string; color: string; at: number }
export const PING_MS = 3500

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
	/** heroes currently off the board after a defeat: when, and their piece (to respawn it) */
	defeated?: Record<string, { round: number; turn: number; piece: Piece }>
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
	levelPhase?: boolean // after the battle (and its removals) the host opens the level-up step
	levelBase?: Record<string, PlayerCardState> | null // every board as the level-up step opened: what OTHER players see until the round locks the picks
	lane?: number // battle zone: index into LANE (battle.ts) — 0 Orange Beach, 1 Center, 2 Blue Beach
	battle?: Battle | null // minion battle in progress: the loser still has minions to take off
	strays?: Record<string, string[]> | null // minions outside the battle zone waiting for their team to pick the way back in (battle.ts returnPatch)
	wonBy?: { team: Team; reason: string } | null // a push won the game (throne / last wave)
	/** heroes under attack, keyed by the defender: who attacks, and whether they chose to defend */
	/** discarded: the defender has discarded a card since the attack began — only then can they answer Defended */
	attacks?: Record<string, { by: string; defending: boolean; at: number; discarded?: boolean }>
	/** the latest lane push — every client plays the "wave advances" splash when `id` changes */
	pushNews?: PushNews | null
	/** the latest minion battle — every client plays the battle splash when `id` changes */
	battleNews?: BattleNews | null
	/** the latest hero defeat — every client plays the defeat splash when `id` changes */
	lastDefeat?: DefeatNews | null
	/** game start: heroes not yet placed — each player puts theirs on a base spawn point */
	toSpawn?: Record<string, Piece>
	// synced 3-2-1 pre-reveal countdown: epoch ms when cards flip face-up. Set by
	// the host the moment every seated player has committed; cleared if anyone
	// uncommits (so the count restarts from 3 when they all commit again).
	revealAt?: number | null
	/** after the reveal, whose card is acting: `idx` into turnOrder(), for the turn `key` (round-turn); another turn = 0 */
	acting?: { key: string; idx: number } | null
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
	creator?: string // clientId of whoever created the room — takes the host role back whenever they're here
	hostEpoch?: number // bumps on every host change, so a stale snapshot can never undo one
	draftSystem: DraftSystem // how heroes are selected
	draftStars: number[] // allowed hero complexity levels (1–4)
	draft: DraftState | null // live hero-draft state once Begin starts it
	started: boolean // lobby → game has begun
	closed: boolean // host closed the game; everyone returns to the menu
	// set by the host on Begin: a shared coin flip everyone animates to reveal
	// which team's tie-breaker side is up at the start of the game
	startFlip: { side: Team; at: number } | null
	gameId?: string // set by the host when the draft starts: one id per game (the quiet recorder keys on it)
	// host options for the board (lobby + in-game Game Lobby); unset = the defaults
	boardLook?: BoardLook // the map's visuals: the island in its sea (default) or the flat classic tiles
	zoneGlow?: boolean // the gold outline round the battle zone (default on; island look only)
	boardFx?: boolean // moving effects — the sea, the minions' turning rims, the battle zone's pulse (default on)
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
	return tokenExpiry(p.token) === 'never' // trees, zombies, Pyro/Turret, runes (tokens.ts)
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
	// a hero still waiting to enter, or knocked out, follows its seat too
	if (s.toSpawn?.[from]) { const t = { ...s.toSpawn, [to]: { ...s.toSpawn[from], id: to } }; delete t[from]; patch.toSpawn = t }
	if (s.defeated?.[from]) { const d = { ...s.defeated, [to]: { ...s.defeated[from], piece: { ...s.defeated[from].piece, id: to } } }; delete d[from]; patch.defeated = d }
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
export type BoardLook = 'island' | 'classic'
/** The map visuals everyone sees (a host option; anything unset or unknown = the island). */
export const boardLookOf = (s: Pick<MatchState, 'boardLook'>): BoardLook => (s.boardLook === 'classic' ? 'classic' : 'island')
/** Whether the battle zone is outlined on the board (a host option; on unless switched off). */
export const zoneGlowOf = (s: Pick<MatchState, 'zoneGlow'>): boolean => s.zoneGlow !== false
/** Whether the board's moving effects run (a host option; on unless switched off). */
export const boardFxOf = (s: Pick<MatchState, 'boardFx'>): boolean => s.boardFx !== false

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
// warm → cool. Warm hues steer clear of the Atlantean orange (#ef7d22) and the Titan blue.
export const PLAYER_COLORS: PlayerColorDef[] = [
	{ id: 'crimson', label: 'Crimson', hex: '#dc2626' },
	{ id: 'rose', label: 'Rose', hex: '#fb7185' },
	{ id: 'pink', label: 'Pink', hex: '#f472b6' },
	{ id: 'sienna', label: 'Sienna', hex: '#a0522d' },
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
	// when they took that colour: their clock, pushed past every stamp they had seen by then
	// (so it only falls back to raw clocks when neither saw the other). Two players on one
	// colour → the earlier stamp keeps it (seatcolor.ts)
	colorAt?: number
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
	/** The host's clock as seen from here (for host-timed things like the reveal countdown). */
	hostNow: () => number
	/** Ping a hex: everyone sees rings there for a few seconds. */
	ping: (hex: string) => void
	/** The live pings (each fades after PING_MS; one per player at a time). */
	pings: Readable<Ping[]>
}

// One live session per room for a player (a tab). The Supabase client hands out ONE
// channel per topic: a second joinMatch for a room this tab is still in (a rejoin whose
// caller never left the first session) would get the first session's channel back —
// presence listeners can't be added to a subscribed channel ("cannot add `presence`
// callbacks … after `subscribe()`"), and two sessions would then fight over it. So the
// earlier session is left first. Keyed by player too: in tests many players share a room.
const liveSessions = new Map<string, () => void>()

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
	const sessionKey = `${room}\n${clientId}`
	liveSessions.get(sessionKey)?.()

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

	if (creating) { start.host = clientId; start.creator = clientId; start.hostEpoch = 0 }
	let me: Player = { id: clientId, name: self.name, color: self.color, ready: false, seat: -1 }
	let graceTimer: ReturnType<typeof setTimeout> | null = null
	const kicked = writable(false)
	const notFound = writable(false)
	const seatGranted = writable<{ seat: number; color: string } | null>(null)
	const seatDenied = writable(0)
	// another player flipped to join a team — everyone plays the coin animation
	const joinFlip = writable<{ id: string; name: string; side: Team; at: number } | null>(null)
	// pings ride their own broadcast (never the shared state): one live ping per player
	const pings = writable<Ping[]>([])
	const addPing = (p: Ping) => {
		pings.update((l) => [...l.filter((x) => x.by !== p.by), p])
		setTimeout(() => pings.update((l) => l.filter((x) => x.id !== p.id)), PING_MS)
	}
	let lastPing = 0
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
		// a new turn — or the minion battle starting (it locks turn 4 in like a turn passing) — resets the stack
		if (after.round !== before.round || after.turn !== before.turn || (after.battlePhase && !before.battlePhase)) {
			if (undoStack.length) { undoStack = []; canUndo.set(false) }
			return
		}
		// a new log entry = a new last entry (the log is capped at LOG_CAP, so its LENGTH stops growing
		// once a game is a few rounds in — comparing lengths switched Undo off for the rest of the game)
		const lastId = (s: MatchState) => s.log?.[s.log.length - 1]?.id
		if (after.log?.length && lastId(after) !== lastId(before) && !before.log?.some((e) => e.id === lastId(after))) {
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
	let joinDeadline: ReturnType<typeof setTimeout> | null = null
	let backoff = 1500
	let left = false
	const JOIN_DEADLINE_MS = 8000

	// the host's clock, as seen from here: timed things the host sets (the reveal
	// countdown) run on it, so a device whose clock is off doesn't stall or rush.
	// sample = host time at send − our time at receipt = skew − delay; the max of
	// recent samples is the best estimate (delay only ever makes a sample smaller)
	let skews: number[] = []
	let hostSkew = 0
	const hostNow = () => Date.now() + (local.host === clientId ? 0 : hostSkew)
	const applyRemote = (incoming: MatchState) => {
		if (incoming.updatedBy && incoming.updatedBy === incoming.host && incoming.updatedBy !== clientId && incoming.updatedAt) {
			skews = [...skews, incoming.updatedAt - Date.now()].slice(-24)
			hostSkew = Math.max(...skews)
		}
		// the host role only ever moves forward: a snapshot from someone who hadn't seen
		// the latest hand-over yet must not drag it back
		const newerHost = (incoming.hostEpoch ?? 0) > (local.hostEpoch ?? 0)
		const olderHost = (incoming.hostEpoch ?? 0) < (local.hostEpoch ?? 0)
		// last-write-wins: accept strictly newer revisions, break ties on time
		if (
			incoming.rev > local.rev ||
			(incoming.rev === local.rev && incoming.updatedAt > local.updatedAt)
		) {
			const next = olderHost ? { ...incoming, host: local.host, hostEpoch: local.hostEpoch, creator: local.creator ?? incoming.creator } : incoming
			recordHistory(local, next)
			state.set(next)
		} else if (newerHost) {
			// an older snapshot overall, but it carries a newer hand-over: keep that part
			state.set({ ...local, host: incoming.host, hostEpoch: incoming.hostEpoch })
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
			.on('broadcast', { event: 'ping' }, ({ payload }) => addPing(payload as Ping))
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
						seat: typeof meta.seat === 'number' ? meta.seat : -1,
						...(typeof meta.colorAt === 'number' ? { colorAt: meta.colorAt } : {})
					})
				}
				players.set(list)
				checkHost()
			})
	}

	// Host hand-over. Only the host applies card actions and runs the draft/turn
	// watchdogs, so a host whose browser drops would freeze the game. If the host is
	// missing from presence for HOST_GRACE_MS (long enough to ride out a refresh or a
	// short reconnect), the player `nextHost` names takes over. Skipped while we're
	// offline ourselves (our presence view would be stale) and once the room is closed.
	const HOST_GRACE_MS = 15000
	const RECLAIM_MS = 4000
	let hostTimer: ReturnType<typeof setTimeout> | null = null
	let reclaimTimer: ReturnType<typeof setTimeout> | null = null
	const live = () => !left && local.rev >= 0 && !!local.host && !local.closed && get(conn) === 'connected'
	const hostMissing = () => live() && playerList.length > 0 && !playerList.some((p) => p.id === local.host)
	// the room's creator is the host whenever they're here: after a dropout (or a role that
	// wandered off while they were away) they take it back once they've been present a moment
	const shouldReclaim = () =>
		live() && local.creator === clientId && local.host !== clientId && playerList.some((p) => p.id === clientId)
	const claimHost = (text: string) => act(text, { host: clientId, hostEpoch: (local.hostEpoch ?? 0) + 1 })
	function checkHost() {
		if (shouldReclaim()) {
			if (!reclaimTimer) reclaimTimer = setTimeout(() => { reclaimTimer = null; if (shouldReclaim()) claimHost('is the host again') }, RECLAIM_MS)
		} else if (reclaimTimer) { clearTimeout(reclaimTimer); reclaimTimer = null }
		if (!hostMissing()) { if (hostTimer) { clearTimeout(hostTimer); hostTimer = null } return }
		if (hostTimer) return
		hostTimer = setTimeout(() => {
			hostTimer = null
			if (!hostMissing()) return
			const gone = local.host
			if (nextHost(local, playerList, gone) !== clientId) { checkHost(); return } // someone else claims it
			const who = Object.values(local.seatMap ?? {}).find((v) => v.id === gone)?.name ?? 'the host'
			claimHost(`is now the host (${who} disconnected)`)
		}, HOST_GRACE_MS)
	}
	// the host can also go missing through a state change (e.g. a stale snapshot) or come back
	// while we're offline — re-check on those too (cheap; it only arms a timer)
	state.subscribe(() => checkHost())
	conn.subscribe(() => checkHost())

	// Presence updates are throttled: Supabase Realtime rate-limits messages per
	// channel, so rapid color switches (fast clicks) would otherwise flood track()
	// and wedge the socket. We update `me` instantly and coalesce network pushes to
	// at most one per TRACK_MIN ms, always sending the latest state (trailing edge).
	// (Defined ahead of buildChannel(): the first SUBSCRIBED can run synchronously.)
	let trackTimer: ReturnType<typeof setTimeout> | null = null
	let lastTrack = 0
	const TRACK_MIN = 320
	// Our presence says `probing` while we hold no state yet (a joiner still asking the
	// room for it), so another prober can tell a room where EVERYONE is asking — a group
	// that refreshed together — from one whose holder is just slow to answer (startProbe).
	let probingSent = false
	const presenceMeta = () => {
		probingSent = local.rev < 0
		return probingSent ? { ...me, probing: true } : me
	}
	// announce at once, outside the throttle (joining, and the state arriving: the
	// player's first own change right after must not have to wait for them)
	const trackNow = () => { try { channel.track(presenceMeta()) } catch { /* ignore */ } }
	const flushTrack = () => {
		trackTimer = null
		lastTrack = Date.now()
		trackNow()
	}
	const scheduleTrack = () => {
		if (trackTimer) return // a trailing flush is already queued; it sends latest me
		const wait = TRACK_MIN - (Date.now() - lastTrack)
		if (wait <= 0) flushTrack()
		else trackTimer = setTimeout(flushTrack, wait)
	}
	// the moment the room's state arrives, presence must stop calling us a prober
	state.subscribe((v) => { if (probingSent && v.rev >= 0 && get(conn) === 'connected') trackNow() })

	// JOIN flow only: probe a few times for a host. We must NEVER create a room —
	// while someone who may hold the state is present we keep asking for it; if the
	// room is empty — or everyone present is a prober like us, so nobody can ever
	// answer (a whole table refreshing at once) — after several tries, report "not
	// found". Someone present who never answers at all (a dead socket the server
	// hasn't noticed yet) counts as nobody after PROBE_GIVE_UP_MS: a join must end.
	const PROBE_GIVE_UP_MS = 20000
	const startProbe = () => {
		if (creating || local.rev >= 0) return
		if (graceTimer) clearTimeout(graceTimer)
		let empties = 0
		const since = Date.now()
		const probe = () => {
			if (local.rev >= 0) return
			const raw = channel.presenceState() as Record<string, Array<{ probing?: boolean }>>
			const holders = Object.keys(raw).filter((k) => k !== clientId && !raw[k][0]?.probing).length
			if (holders > 0 && Date.now() - since < PROBE_GIVE_UP_MS) {
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
	const clearJoinDeadline = () => { if (joinDeadline) { clearTimeout(joinDeadline); joinDeadline = null } }

	// Drop a channel from the Supabase client for good. removeChannel() is async
	// (it waits for the server to confirm the leave), and until it finishes
	// supabase.channel(sameTopic) hands back that SAME dying channel — so a rebuild
	// would silently reuse it and never subscribe (stuck on "connecting"). Wait a
	// little for the leave, then purge it from the client's list ourselves.
	const dropChannel = async (ch: RealtimeChannel | undefined) => {
		if (!ch) return
		try { ch.untrack() } catch { /* ignore */ }
		try { await Promise.race([supabase.removeChannel(ch), new Promise((r) => setTimeout(r, 3000))]) } catch { /* ignore */ }
		try {
			const rt = supabase.realtime as unknown as { channels: RealtimeChannel[] }
			rt.channels = rt.channels.filter((c) => c !== ch)
		} catch { /* ignore */ }
	}

	// If the channel stays down past the backoff (or never finishes joining), tear
	// it down and rebuild it — Supabase's own rejoin sometimes wedges after a
	// rate-limit close, and a first join on a cold page load can stall.
	let rebuilding = false
	const hardReconnect = async () => {
		// whichever of the two timers got us here, the other must not fire into the rebuilt
		// channel: a watchdog left pending (armed by an error on the old channel) used to be
		// orphaned here (`watchdog = null` without clearing it) and tore down the replacement
		clearWatchdog()
		clearJoinDeadline()
		if (rebuilding || left) return
		rebuilding = true
		backoff = Math.min(backoff * 2, 10000)
		const old = channel
		await dropChannel(old)
		clearWatchdog() // the old channel's CLOSED (part of the drop) arms one too
		rebuilding = false
		if (!left) buildChannel()
	}

	// status callbacks are per channel: a replaced channel's late CLOSED/ERROR
	// must not knock over its replacement
	const onStatusFor = (ch: RealtimeChannel) => (s: string) => {
		if (ch !== channel || left) return
		if (s === 'SUBSCRIBED') {
			conn.set('connected')
			backoff = 1500
			clearWatchdog()
			clearJoinDeadline()
			trackNow() // (re-)announce presence, also after a reconnect
			channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } })
			startProbe()
			return
		}
		if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { conn.set('reconnecting'); armWatchdog() }
		else if (s === 'CLOSED') { conn.set('closed'); armWatchdog() }
	}

	function buildChannel() {
		const ch = supabase.channel(`match:${room}`, {
			config: { broadcast: { self: false }, presence: { key: clientId } }
		})
		channel = ch
		registerHandlers(ch)
		ch.subscribe(onStatusFor(ch))
		// never sit on "connecting" forever: no SUBSCRIBED in time → rebuild
		clearJoinDeadline()
		joinDeadline = setTimeout(() => {
			joinDeadline = null
			if (ch === channel && !left && get(conn) !== 'connected') { conn.set('reconnecting'); void hardReconnect() }
		}, JOIN_DEADLINE_MS)
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
		update({ ...snap, host: local.host, hostEpoch: local.hostEpoch, creator: local.creator })
		undoing = false
	}

	const ping = (hex: string) => {
		const now = Date.now()
		if (!hex || now - lastPing < 600) return // a gentle limit: the channel is rate-limited
		lastPing = now
		const p: Ping = { id: `${clientId}-${now}`, by: clientId, hex, color: me.color, at: now }
		addPing(p)
		try { channel.send({ type: 'broadcast', event: 'ping', payload: p }) } catch { /* ignore */ }
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

	const setSelf = (info: { name?: string; color?: string; ready?: boolean; seat?: number }) => {
		// A new colour is stamped with the moment it was taken (see Player.colorAt) — our
		// clock, but never earlier than any stamp we have already seen in presence: whoever
		// we could see holding a colour was there before us, whatever our clock says.
		const after = Math.max(Date.now(), ...playerList.map((p) => (p.colorAt ?? 0) + 1))
		const stamp = info.color !== undefined && info.color !== me.color ? { colorAt: after } : {}
		me = { ...me, ...info, ...stamp }
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
		if (req.kind === 'defeatMinion' || req.kind === 'removeMinion') {
			const m = local.pieces?.[req.piece]
			const what = aMinion(m?.team, m?.role)
			note(req.pid, req.kind === 'defeatMinion' ? `defeated ${what} (+${minionCoins(m?.role)} coins)` : `removed ${what} (no coins)`)
		}
		if (req.kind === 'respawn' && patch.pieces) note(req.pid, 'respawned ⤴')
		if (req.kind === 'endAct' && (patch.acting !== undefined || patch.turn)) { const who = actorOf(local); if (who) note(who, req.pid === who ? 'ends their turn' : 'turn skipped by the host') }
		if (req.kind === 'removeHero' && patch.defeated) note(req.pid, 'took their hero off the board — back with their next card')
		if (req.kind === 'clearAround' && patch.pieces) { const n = Object.keys(local.pieces ?? {}).length - Object.keys(patch.pieces).length; note(req.pid, `cleared ${n} token${n === 1 ? '' : 's'} next to them`) }
		if (req.kind === 'spawn' && patch.pieces) note(req.pid, 'entered the battlefield')
		if (req.kind === 'attack' && patch.attacks) note(req.pid, `attacks ${nameOf(req.target)}!`)
		if (req.kind === 'attackResolve' && (patch.attacks || patch.lastDefeat)) {
			const by = local.attacks?.[req.target]?.by ?? ''
			if (req.result === 'defend') note(req.target, `defends against ${nameOf(by)}…`)
			else if (req.result === 'defended') note(req.target, `held off ${nameOf(by)}'s attack 🛡`)
			else if (req.result === 'cancel') note(req.pid, `called off the attack on ${nameOf(req.target)}`)
		}
		if (patch.lastDefeat && patch.lastDefeat.id !== local.lastDefeat?.id) {
			const d = patch.lastDefeat
			const assist = d.assists.length ? ` · ${d.assists.map(nameOf).join(', ')} +${d.assist} assist` : ''
			note(d.by, `defeated ${nameOf(d.victim)} — +${d.coins} ${d.coins === 1 ? 'coin' : 'coins'}${assist} · ${teamName(d.team)} −${d.lives} life`)
		}
		if (req.kind === 'battleRemove' && patch.pieces) {
			const m = local.pieces?.[req.piece]
			note(req.pid, `took off ${aMinion(m?.team, m?.role)} for the minion battle`)
		}
		if (req.kind === 'battleAuto' && patch.pieces) note(req.pid, 'let the game remove the rest of the minions (melee first, heavies last)')
		if (['advance', 'battleRemove', 'battleAuto', 'defeatMinion', 'removeMinion'].includes(req.kind)) for (const t of laneNotes(local, patch)) note(req.pid, t)
		for (const pid in patch.cards ?? {}) {
			const before = local.cards?.[pid], after = patch.cards![pid]
			if (before && after && levelOf(after) > levelOf(before)) note(pid, `reached Level ${levelOf(after)} ⬆`)
			if (req.kind === 'advance' && (local.battlePhase || local.levelPhase) && before && after && !(before.roundPicks ?? []).length && after.coins > before.coins)
				note(pid, `couldn't level up — pity coin +1 → ${after.coins}`)
		}
		if (req.kind === 'swap' && patch.cards?.[req.pid]) note(req.pid, 'swapped a level-up pick for its twin')
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
		if (left) return // a second leave must not reach the channel a NEWER session of this room now holds
		if (graceTimer) clearTimeout(graceTimer)
		if (trackTimer) clearTimeout(trackTimer)
		if (stateTimer) clearTimeout(stateTimer)
		if (hostTimer) clearTimeout(hostTimer)
		if (reclaimTimer) clearTimeout(reclaimTimer)
		clearWatchdog()
		clearJoinDeadline()
		left = true
		if (liveSessions.get(sessionKey) === leave) liveSessions.delete(sessionKey)
		void dropChannel(channel)
	}
	liveSessions.set(sessionKey, leave)

	return { state, players, update, act, setSelf, cardAction, kick, flipJoin, joinFlip, undo, canUndo, requestSeat, resolveSeat, seatGranted, seatDenied, kicked, notFound, status: conn, leave, clientId, hostNow, ping, pings }
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

/**
 * Host hand-over: when the host has been gone a while, the next SEATED player after
 * the host's seat takes over (wrapping round the table); with nobody seated, the
 * first present spectator by id. Every client computes the same answer from the
 * same presence list, so exactly one of them claims the role.
 */
export function nextHost(s: MatchState, present: Player[], departed: string): string | null {
	const here = present.filter((p) => p.id !== departed)
	if (!here.length) return null
	const seatOf = Object.entries(s.seatMap ?? {}).find(([, v]) => v.id === departed)?.[0]
	const from = seatOf != null ? Number(seatOf) : -1
	const seated = here.filter((p) => p.seat >= 0 && p.seat < (s.seats || Infinity)).sort((a, b) => a.seat - b.seat)
	if (seated.length) return (seated.find((p) => p.seat > from) ?? seated[0]).id
	return [...here].sort((a, b) => (a.id < b.id ? -1 : 1))[0].id
}

// ── defeating & removing units ────────────────────────────────────────────────
// Whoever presses Defeat is the one who defeated it and gets the reward.
/** Coins for defeating a minion. (Removing one by a card effect gives none.) */
export const minionCoins = (role?: string) => (role === 'heavy' ? 4 : 2)
/** Level tier: Life counters a defeated hero's team spends, and each assist's coins. */
export const lifeTier = (level: number) => (level <= 3 ? 1 : level <= 6 ? 2 : 3)

/** A player's team: from their hero piece (on the board or waiting to respawn), else their seat. */
export function teamOf(s: MatchState, pid: string): Team | null {
	const t = s.pieces?.[pid]?.team ?? s.defeated?.[pid]?.piece.team
	if (t === 'orange' || t === 'blue') return t
	const seat = Object.entries(s.seatMap ?? {}).find(([, v]) => v.id === pid)?.[0]
	return seat != null ? teamForSeat(Number(seat), s.seats) : null
}
const addCoinsTo = (cards: Record<string, PlayerCardState>, pid: string, n: number) =>
	cards[pid] ? { ...cards, [pid]: { ...cards[pid], coins: cards[pid].coins + n } } : cards

/** A minion leaves play: defeated (the presser gains its coins) or removed (no coins). */
export function minionOff(s: MatchState, pid: string, pieceId: string, defeated: boolean): Partial<MatchState> {
	const m = s.pieces?.[pieceId]
	if (!m || m.kind !== 'minion') return {}
	const pieces = { ...s.pieces }
	delete pieces[pieceId]
	if (!defeated) return { pieces }
	return { pieces, cards: addCoinsTo(s.cards ?? {}, pid, minionCoins(m.role)) }
}

export interface BattleNews {
	id: string
	orange: number
	blue: number
	loser: Team | null // null = deadlock
	remove: number
	at: number
}

export interface DefeatNews {
	id: string
	victim: string // playerId
	by: string // playerId
	coins: number
	assist: number
	assists: string[]
	lives: number
	team: Team | null // the victim's team
	at: number
}

/** The initiative of the card a player has out this turn (card + initiative items), or null. */
export function cardInitiative(s: MatchState, pid: string): number | null {
	const cs = s.cards?.[pid]
	const idx = cs?.pending
	if (!cs || idx == null || idx < 0) return null
	const v = heroCards(cs.hero)[idx]?.initiative
	return v == null ? null : v + (statDeltas(cs).init ?? 0)
}
/** Has `target`'s card this turn already resolved while `attacker` acts? Higher initiative
 *  goes first (ties: the team showing on the tie-breaker coin). No card out → no. */
export function cardResolved(s: MatchState, attacker: string, target: string): boolean {
	const a = cardInitiative(s, attacker), t = cardInitiative(s, target)
	if (a == null || t == null) return false
	if (t !== a) return t > a
	return teamOf(s, target) === s.tieBreaker
}

/** What a hero defeat pays out (for the confirm dialog and the log). */
export function heroDefeatSummary(s: MatchState, pid: string, target: string) {
	const cs = s.cards?.[target]
	const level = cs ? levelOf(cs) : 1
	const tier = lifeTier(level)
	const bounty = !!statusFrom(s.pieces ?? {})[target]?.bounty
	const team = teamOf(s, pid)
	const assists = Object.keys(s.cards ?? {}).filter((id) => id !== pid && id !== target && team && teamOf(s, id) === team)
	return { level, coins: level, assist: tier, assists, lives: tier + (bounty ? 1 : 0), bounty, team: teamOf(s, target) }
}

/** `pid` defeats `target`'s hero: +coins = its level (from the game, not the victim);
 *  every teammate of `pid` +assist coins = its level tier; the victim's team spends
 *  that tier in Life (+1 with the Bounty); markers on it come off; the tokens they
 *  placed STAY on the board (rulebook p.19 — they go when they normally would, usually
 *  at the end of the round); their hand, played and discarded cards stay, this turn's
 *  card stays in its slot; the hero leaves the board until it respawns. */
export function defeatHero(s: MatchState, pid: string, target: string, keepCard?: boolean): Partial<MatchState> {
	const hero = s.pieces?.[target]
	if (!hero || hero.kind !== 'hero' || pid === target) return {}
	const sum = heroDefeatSummary(s, pid, target)
	void keepCard // (kept for old callers) the card stays in its turn slot either way
	let cards = addCoinsTo(s.cards ?? {}, pid, sum.coins)
	for (const a of sum.assists) cards = addCoinsTo(cards, a, sum.assist)
	// the hero leaves the board and the markers riding on it come off. The tokens it placed
	// stay where they are ("Tokens are not removed when the hero who placed them is defeated")
	// until they'd normally go. This turn's card stays in its slot (some heroes care what's
	// in their turn slots, others what's in their discard).
	const pieces: Record<string, Piece> = {}
	for (const id in s.pieces) {
		const p = s.pieces[id]
		if (id === target || p.attachedTo === target) continue
		pieces[id] = p
	}
	const life = sum.team ? { ...s.life, [sum.team]: Math.max(0, s.life[sum.team] - sum.lives) } : s.life
	const lifeTok = sum.team && s.lifeTok ? { ...s.lifeTok, [sum.team]: spendTokens(s.lifeTok[sum.team] ?? [], sum.lives) } : s.lifeTok
	const attacks = { ...(s.attacks ?? {}) }
	delete attacks[target]
	const lastDefeat: DefeatNews = {
		id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		victim: target, by: pid, coins: sum.coins, assist: sum.assist, assists: sum.assists, lives: sum.lives, team: sum.team, at: Date.now()
	}
	return { pieces, cards, life, lifeTok, attacks, lastDefeat, defeated: { ...(s.defeated ?? {}), [target]: { round: s.round, turn: s.turn, piece: hero } } }
}

/** Flip the last `n` full tokens to spent (the HUD draws the token row). */
export function spendTokens(tok: boolean[], n: number): boolean[] {
	const out = [...tok]
	for (let i = out.length - 1; i >= 0 && n > 0; i--) if (out[i]) { out[i] = false; n-- }
	return out
}

/** A defeated hero returns at the start of the next turn in which they play a card:
 *  a later turn (possibly the next round) once they've committed a card for it. */
export function canRespawn(s: MatchState, pid: string): boolean {
	const d = s.defeated?.[pid]
	if (!d) return false
	const later = s.round > d.round || (s.round === d.round && s.turn > d.turn)
	const cs = s.cards?.[pid]
	// …and only when their card acts (active turns: the order after the reveal)
	return later && !!cs && cs.pending != null && cs.pending >= 0 && actorOf(s) === pid
}

/** A hero leaves the board by a card effect (or its own player's choice): no rewards, no
 *  Life lost, its tokens stay — it respawns like a defeated hero, with its next card. */
export function removeHero(s: MatchState, pid: string): Partial<MatchState> {
	const hero = s.pieces?.[pid]
	if (!hero || hero.kind !== 'hero') return {}
	const pieces: Record<string, Piece> = {}
	for (const id in s.pieces) if (id !== pid && s.pieces[id].attachedTo !== pid) pieces[id] = s.pieces[id]
	const attacks = { ...(s.attacks ?? {}) }
	delete attacks[pid]
	return { pieces, attacks, defeated: { ...(s.defeated ?? {}), [pid]: { round: s.round, turn: s.turn, piece: hero } } }
}

/** The tokens a Clear action could take: every token standing next to pid's hero — friend
 *  or foe ("remove any number of tokens adjacent to you"). Trinkets' Turret is an object,
 *  not a token; markers riding on heroes aren't on a hex. */
export function clearable(s: MatchState, pid: string): Piece[] {
	const hero = s.pieces?.[pid]
	if (!hero || hero.kind !== 'hero') return []
	const at = hexCube(hero.hex)
	return Object.values(s.pieces ?? {}).filter((p) =>
		p.kind === 'token' && !p.attachedTo && !isTurret(p, s.cards) && cubeDist(hexCube(p.hex), at) === 1)
}

/** "Clear" (instead of an attack): the tokens the player chose (`ids`) among those next
 *  to their hero leave the board; anything else in `ids` is ignored. */
export function clearAround(s: MatchState, pid: string, ids: string[]): { pieces: Record<string, Piece>; removed: Piece[] } {
	const want = new Set(ids)
	const removed = clearable(s, pid).filter((p) => want.has(p.id))
	const pieces = { ...(s.pieces ?? {}) }
	for (const p of removed) delete pieces[p.id]
	return { pieces, removed }
}

/** Free spawn points for a team: its base's spawn hexes with nothing standing on them.
 *  (A map without marked spawn points → [] = anywhere goes.) */
export function freeSpawns(s: MatchState, team: Team): string[] {
	const taken = new Set(Object.values(s.pieces ?? {}).filter((p) => !p.attachedTo).map((p) => p.hex))
	return heroSpawns(s, team).filter((h) => !taken.has(h))
}
const spawnOk = (s: MatchState, team: Team, hex: string) => !throneHexes(s.map, team).length || freeSpawns(s, team).includes(hex)

/** A team's hero spawn points. With 8+ players the two base hexes between the spawn
 *  points (in the row that holds most of them) open up too. */
export function heroSpawns(s: Pick<MatchState, 'map' | 'seats'>, team: Team): string[] {
	const base = throneHexes(s.map, team)
	return (s.seats ?? 0) >= 8 ? [...base, ...extraSpawns(s.map, team)] : base
}
export function extraSpawns(map: GameMap | null, team: Team): string[] {
	const cells = map?.cells ?? {}
	const sp = throneHexes(map, team)
	if (sp.length < 2) return []
	const zone = team === 'orange' ? 'baseOrange' : 'baseBlue'
	const N = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]]
	const nb = (h: string) => { const [c, r] = h.split('_').map(Number); return N[r & 1].map(([dc, dr]) => `${c + dc}_${r + dr}`) }
	const row = (h: string) => Number(h.split('_')[1])
	const counts: Record<number, number> = {}
	for (const h of sp) counts[row(h)] = (counts[row(h)] ?? 0) + 1
	const main = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
	// base hexes next to two spawn points, on the main spawn row
	return Object.keys(cells).filter((h) => cells[h] === zone && row(h) === main && nb(h).filter((n) => sp.includes(n)).length >= 2).sort().slice(0, 2)
}

/** Game start: put your hero on one of your base's free spawn points. */
export function spawnHero(s: MatchState, pid: string, hex: string): Partial<MatchState> {
	const piece = s.toSpawn?.[pid]
	if (!piece || !spawnOk(s, piece.team as Team, hex)) return {}
	const toSpawn = { ...s.toSpawn }
	delete toSpawn[pid]
	return { pieces: { ...s.pieces, [pid]: { ...piece, hex } }, toSpawn }
}

/** Seated players (present ones) whose hero still has to be placed — the game waits for them. */
export const waitingToSpawn = (s: MatchState, present: string[]) => present.filter((id) => !!s.toSpawn?.[id])

// ── attacks on heroes: attacker → "Defend?" → defended / defeated ──────────
export function startAttack(s: MatchState, pid: string, target: string): Partial<MatchState> {
	const hero = s.pieces?.[target]
	if (!hero || hero.kind !== 'hero' || pid === target || s.attacks?.[target]) return {}
	const a = teamOf(s, pid)
	if (!a || a === teamOf(s, target)) return {}
	return { attacks: { ...(s.attacks ?? {}), [target]: { by: pid, defending: false, at: Date.now() } } }
}
export function resolveAttack(s: MatchState, pid: string, target: string, result: 'defend' | 'defended' | 'defeated' | 'cancel'): Partial<MatchState> {
	const at = s.attacks?.[target]
	if (!at) return {}
	const isHost = pid === s.host
	if (result === 'cancel' ? pid !== at.by && !isHost : pid !== target && !isHost) return {}
	const attacks = { ...s.attacks }
	if (result === 'defend') return { attacks: { ...attacks, [target]: { ...at, defending: true } } }
	if (result === 'defeated') return defeatHero(s, at.by, target)
	// a defence is a discarded card: the defender can only say Defended once they've discarded (the host can, for someone away)
	if (result === 'defended' && !isHost && !at.discarded) return {}
	delete attacks[target]
	return { attacks }
}

export function respawnHero(s: MatchState, pid: string, hex: string): Partial<MatchState> {
	const d = s.defeated?.[pid]
	if (!d || !canRespawn(s, pid) || !spawnOk(s, d.piece.team as Team, hex)) return {}
	const defeated = { ...s.defeated }
	delete defeated[pid]
	return { pieces: { ...s.pieces, [pid]: { ...d.piece, hex } }, defeated }
}


/** Adjust a team's Life counters (they lose these when their heroes are defeated). */
export function adjustLife(s: MatchState, team: Team, delta: number): Partial<MatchState> {
	return { life: { ...s.life, [team]: Math.max(0, s.life[team] + delta) } }
}

/** Whichever end condition has triggered, or null while play continues. */
export function winner(s: MatchState): { team: Team; reason: string } | null {
	if (s.wonBy) return s.wonBy
	if (s.life.orange <= 0) return { team: 'blue', reason: 'Atlanteans ran out of Life Tokens' }
	if (s.life.blue <= 0) return { team: 'orange', reason: 'Titans ran out of Life Tokens' }
	if (s.waves <= 0 && s.lastPush) return { team: s.lastPush, reason: 'won the Final Push' }
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
