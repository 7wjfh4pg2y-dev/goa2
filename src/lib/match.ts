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

import { spellName, type GyNews } from './gydion'
import { applyPower, syncPowers, takaHit, comicNewsOf, hasPower, isDouble, RZ, rzTwin, twinBars, timelinePick, wantsSecond, runeLine, RUNE_NAME, reversedTurn, trackDiscards, illusionForce, NEB, type NkNews, type ComicNews, type EmNews, type SnNews, type FxNews, type PowerReq, type PowerState, type TurnCtx } from './heropower'
import { teamName, aMinion } from './teams'
import { hexCube, cubeDist } from './zones'
import { hexNeighbours } from './board/hexgeo'
import { attackBarred, defenceImmunity, defenceCard, RE_NO_MINION_MODS, textOf, saverFor, saveCards, giftOffer, actingCard, markOf, type Immune, type Saving } from './autocards'
import { tokenExpiry, sweepTokens, statusFrom, isTurret } from './tokens'
import { expireEffects, type Effect } from './effects'
import { startBattle, pushCheck, battleRemove, battleSettle, battleAuto, battleResult, laneNotes, heavyImmune, type Battle, type PushNews } from './battle'
import { get, writable, type Readable } from 'svelte/store'
import { supabase, checkSocket } from './supabase'
import { tabClientId } from './identity'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameMap } from './maps'
import type { PlayerCardState } from './cards/cardstate'
import {
	commitCard,
	basicsOf,
	passTurn,
	uncommit,
	discardCard,
	undiscard,
	discardPlayed,
	retrievePlayed,
	revealPlayer,
	endRoundAll,
	levelUp,
	manualMove,
	hostMove,
	swapPick,
	closeLevelPhase,
	lockPicks,
	repairCards,
	addCoins,
	levelOf,
	statDeltas,
	type CardZone
} from './cards/cardstate'
import { heroCards } from './cards/deck'
import { emptyBook, nudgeWait as waitOf, seeNudge, type Nudge } from './nudge'

/** A per-player card instruction, applied authoritatively by the host. */
export type CardReq =
	| PowerReq // a 4★ hero's own button (heropower.ts)
	| { kind: 'commit'; pid: string; idx: number }
	| { kind: 'pass'; pid: string }
	| { kind: 'uncommit'; pid: string }
	| { kind: 'defend'; pid: string; idx: number }
	| { kind: 'undiscard'; pid: string; idx: number }
	| { kind: 'discardPlayed'; pid: string; idx: number } // an effect discards a card already played (turn slot / this turn's card)
	| { kind: 'retrievePlayed'; pid: string; idx: number } // an effect returns a card already played to the hand
	| { kind: 'coins'; pid: string; delta: number }
	| { kind: 'cardmove'; pid: string; idx: number; to: CardZone } // move a card between hand/deck/upgrade/removed
	| { kind: 'hostMove'; pid: string; target: string; idx: number; to: CardZone } // host only: a free deck edit on target's cards (level them up / down, no coins)
	| { kind: 'ult'; pid: string; on: boolean } // unlock / relock the ultimate (level 8)
	| { kind: 'take'; pid: string; idx: number } // level-up pick (level-up phase only, pays coins): card → hand, twin → item, older card → removed
	| { kind: 'swap'; pid: string; idx: number } // level-up phase: swap this round's pick for its twin (idx = the twin)
	| { kind: 'defeatMinion'; pid: string; piece: string } // pid defeated an enemy minion: +2 coins (+4 heavy)
	| { kind: 'removeMinion'; pid: string; piece: string } // a card effect removed a minion: no coins
	| { kind: 'removeHero'; pid: string } // pid takes their own hero off the board (a card effect): no rewards, respawns with their next card
	| { kind: 'clearAround'; pid: string; ids: string[] } // Clear (instead of an attack): the chosen tokens next to pid's hero leave the board
	| { kind: 'defeatHero'; pid: string; target: string; keepCard?: boolean } // pid defeated target's hero (coins, assists, life); keepCard = their card this turn had already resolved (default: worked out from initiative)
	| { kind: 'attack'; pid: string; target: string; body?: string } // pid attacks target's hero → the defender is asked "Defend?" (body = which of Razzle's bodies)
	| { kind: 'force'; pid: string; target: string; die: boolean } // a card effect: target discards a card (die = "…or is defeated", rewards to pid)
	| { kind: 'forceResolve'; pid: string; target: string; result: 'defeated' | 'none' | 'cancel' } // die → defeated · no card to discard · the forcer calls it off
	| { kind: 'attackResolve'; pid: string; target: string; result: 'defend' | 'defended' | 'defeated' | 'cancel' } // the defender's answer (or the host's); the attacker may cancel
	| { kind: 'spawn'; pid: string; hex: string } // game start: place your hero on one of your base's spawn points
	| { kind: 'respawn'; pid: string; hex: string } // a defeated hero comes back on a hex
	| { kind: 'battleRemove'; pid: string; piece: string } // the minion battle's loser takes a minion off
	| { kind: 'battleAuto'; pid: string } // …or lets the game choose the rest
	| { kind: 'forcepass'; pid: string } // host: pass everyone not yet committed
	| { kind: 'advance'; pid: string } // host: lock this turn's cards into their slots, go to next turn
	| { kind: 'endAct'; pid: string } // the acting player (or the host, for someone away) ends their turn: the next card acts; after the last, the turn moves on
	| { kind: 'setAct'; pid: string; idx: number } // host: say who is acting (a click on the order row)
	| { kind: 'claim'; pid: string } // a tied player takes the card acting now from a teammate (the team's choice)
	| { kind: 'hurry'; pid: string; target: string } // Hanu's Hurry up! (acting): the target's unresolved card goes to printed initiative 11
	| { kind: 'save'; pid: string; idx?: number } // Brogan's Shield / Bolster / Fortify: discard idx to keep the defeated minion; no idx = let it fall (autocards)
	| { kind: 'gift'; pid: string; target: string } // War Drummer / Master Skald (acting): the coins to a friendly hero in range (autocards)

/** a card request on the wire: who sent it and its place in their sequence (see hostApplyReq) */
export type WireReq = CardReq & { from?: string; seq?: number }

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
/** This turn's acting order: every card in play (not a pass), highest initiative (items included) first.
 *  TIES (the rulebook, as the user put it): among tied cards of BOTH teams the coin's team plays one card — which of
 *  their tied heroes is the team's choice (`tieClaims`, default by id) — then the coin flips; that repeats while both
 *  teams are still in the tie. Once only one team is left in it, its players go in the order they choose, no flips.
 *  The plan is worked out from the coin as the turn began (`tieTurn`) and keeps the cards that already acted
 *  (`acting.done`), so neither the flips nor a late claim reshuffle what has happened. `flips` = the order's indexes
 *  after which the coin flips. */
export function turnPlan(s: MatchState): { order: string[]; flips: number[]; choice: string[][] } {
	const cards = s.cards ?? {}
	const key = turnKey(s)
	const rev = reversedTurn(s, key)
	const items = Object.keys(cards)
		.filter((pid) => { const i = cards[pid].pending; return i != null && i >= 0 })
		.map((pid) => ({ pid, ini: cardInitiative(s, pid) ?? 0, team: teamOf(s, pid) }))
		// Emmitt's Reverse Time / Tear in Time: this turn lower initiative acts first (ties as normal)
		.sort((a, b) => (rev ? a.ini - b.ini : b.ini - a.ini) || (a.pid < b.pid ? -1 : 1))
	let coin: Team = s.tieTurn?.key === key ? s.tieTurn.coin : s.tieBreaker
	const done = s.acting?.key === key ? (s.acting.done ?? []) : []
	const claims = s.tieClaims?.key === key ? s.tieClaims.order : []
	const rank = (pid: string) => { const k = claims.indexOf(pid); return k < 0 ? Infinity : k; };
	const order: string[] = [], flips: number[] = [], choice: string[][] = []
	for (let i = 0; i < items.length;) {
		let j = i
		while (j < items.length && items[j].ini === items[i].ini) j++
		let rem = items.slice(i, j)
		while (rem.length) {
			const contested = new Set(rem.map((g) => g.team)).size > 1
			const cands = contested ? rem.filter((g) => g.team === coin) : rem
			const forced = done[order.length]
			const pick = rem.find((g) => g.pid === forced) ?? [...cands].sort((a, b) => rank(a.pid) - rank(b.pid) || (a.pid < b.pid ? -1 : 1))[0]
			choice.push(cands.length > 1 ? cands.map((g) => g.pid) : [])
			if (contested) { flips.push(order.length); coin = otherTeamOf(coin) }
			order.push(pick.pid)
			rem = rem.filter((g) => g.pid !== pick.pid)
		}
		i = j
	}
	// a card swapped mid-turn (Takahide's teammates) can't jump past the cards that acted or the one acting
	const pin = s.acting?.key === key ? (s.acting.pin ?? []).filter((p) => order.includes(p)) : []
	if (pin.length) {
		const next = [...pin, ...order.filter((p) => !pin.includes(p))]
		const at = (p: string) => next.indexOf(p)
		return { order: next, flips: flips.map((k) => at(order[k])), choice: next.map((p) => choice[order.indexOf(p)] ?? []) }
	}
	return { order, flips, choice }
}
export const turnOrder = (s: MatchState): string[] => turnPlan(s).order
/** Who may still claim the card acting now: the actor's tied teammates the team is choosing between (not the actor). */
export function claimable(s: MatchState): string[] {
	const at = actingIdx(s), c = turnPlan(s).choice[at] ?? []
	return c.filter((p) => p !== turnPlan(s).order[at])
}
/** How far this turn's acting has got (0 = the first card; the order's length = everyone has acted). */
export const actingIdx = (s: MatchState) => (s.acting?.key === turnKey(s) ? s.acting.idx : 0)
/** Whose card acts now (null once everyone has, or before anything is in play). */
export const actorOf = (s: MatchState): string | null => (timelinePick(s) ? null : turnOrder(s)[actingIdx(s)] ?? null) // nobody acts while Emmitt picks his card (Alternative Timelines)

/** Apply a card instruction to the shared state, returning the patch to broadcast. */
// the turn facts a 4★ power needs (heropower.ts can't import this file)
// (revealed: the host applies every request, and `revealAt` is in the host's clock)
export const powerCtx = (x: MatchState): TurnCtx => ({ key: turnKey(x), round: x.round, turnIdx: x.turn - 1, order: turnOrder(x), at: actingIdx(x), tieBreaker: x.tieBreaker, revealed: x.revealAt != null && Date.now() >= x.revealAt,
	teams: Object.fromEntries(Object.keys(x.cards ?? {}).map((pid) => [pid, teamOf(x, pid)])) })
export function applyCardReq(s: MatchState, req: CardReq): Partial<MatchState> {
	// Razzle's Twin Strike: the repeat may not hit the unit the first attack hit
	const twinOn = (req.kind === 'attack' || req.kind === 'defeatMinion' || req.kind === 'defeatHero') && s.cards?.[req.pid]?.hero === RZ ? twinBars(s, req.pid, powerCtx(s)) : null
	if (twinOn && (req as { target?: string }).target === twinOn) return {}
	// a card's immunity (autocards): no attack on that hero, but from the one it excepts
	if (req.kind === 'attack' && attackBarred(s, req.pid, req.target)) return {}
	// a save Brogan never answered: the minion falls before the turn moves on
	if (s.saving && (req.kind === 'advance' || req.kind === 'endAct')) {
		const fell = resolveSave(s, s.saving.saver)
		const after = applyCardReq({ ...s, ...fell } as MatchState, req)
		return Object.keys(after).length ? { ...fell, ...after } : {}
	}
	const patch0 = req.kind === 'power' ? (applyPower(s, req, powerCtx(s)) as Partial<MatchState>) : applyCardReqBase(s, req as Exclude<CardReq, PowerReq>)
	// …and once her next attack starts, the repeat is spent
	const spend = Object.keys(patch0).length > 0 && (req.kind === 'attack' || req.kind === 'defeatMinion' || req.kind === 'defeatHero') && s.cards?.[req.pid]?.hero === RZ && rzTwin(s, req.pid, powerCtx(s)) === 'live'
	const pw0 = patch0.power ?? s.power ?? {}
	const patch: Partial<MatchState> = spend ? { ...patch0, power: { ...pw0, [req.pid]: { ...pw0[req.pid], twin: { ...s.power![req.pid].twin!, live: false } } } } : patch0
	if (!Object.keys(patch).length) return patch
	// Alternative Timelines: a take back starts his turn over — both cards are back, and 'just one' is forgotten
	if (req.kind === 'uncommit' && s.power?.[req.pid]?.one) patch.power = { ...(patch.power ?? s.power), [req.pid]: { ...s.power[req.pid], one: undefined } }
	// the defence card just discarded switches on what it says (autocards: Expert / Master Duelist's immunity)
	if (req.kind === 'defend' && patch.attacks?.[req.pid]?.discarded && !s.attacks?.[req.pid]?.discarded) {
		const imm = defenceImmunity({ ...s, ...patch } as MatchState, req.pid)
		if (imm) patch.immune = imm
	}
	// heroes defeated this round (War Drummer / Master Skald)
	if (patch.lastDefeat && patch.lastDefeat.id !== s.lastDefeat?.id) patch.fallen = { round: s.round, n: (s.fallen?.round === s.round ? s.fallen.n : 0) + 1 }
	const next = { ...s, ...patch }
	if (!Object.values(next.cards ?? {}).some((c) => hasPower(c.hero))) { const kept = req.kind === 'claim' ? null : keepActor(s, next as MatchState); return kept ? { ...patch, ...kept } : patch }
	// Takahide's "after the attack" swap opens once his acting card has hit
	const hit = takaHit(s, next, req, powerCtx(s))
	const marked = hit ? { ...patch, power: hit } : patch
	const sync = syncPowers({ ...next, ...marked }, powerCtx(next))
	const out = sync ? { ...marked, ...sync } : marked
	// Razzle's comic bursts: the moment this request made, if any (written once, read by every screen)
	if (Object.values(next.cards ?? {}).some((c) => c.hero === RZ)) { const cn = comicNewsOf(s, { ...next, ...out }, req as { kind: string }); if (cn) out.comicNews = cn }
	// Emmitt: where everyone stood as the turn began, and what was discarded this turn
	if (Object.values(next.cards ?? {}).some((c) => c.hero === 'emmitt')) {
		const fin = { ...s, ...out } as MatchState
		const key = turnKey(fin)
		if (!fin.turnStart || fin.turnStart.key !== key) {
			const pos: Record<string, string> = {}
			for (const p of Object.values(fin.pieces ?? {})) if (p.kind === 'hero' || p.kind === 'minion') pos[p.id] = p.hex
			out.turnStart = { key, pos }
		} else {
			// a unit that came onto the board during the turn (spawned, a new wave): its first space counts as its start
			const fresh = Object.values(fin.pieces ?? {}).filter((p) => (p.kind === 'hero' || p.kind === 'minion') && !fin.turnStart!.pos[p.id])
			if (fresh.length) out.turnStart = { key, pos: { ...fin.turnStart.pos, ...Object.fromEntries(fresh.map((p) => [p.id, p.hex])) } }
		}
		const disc = trackDiscards(s, fin, key)
		if (disc !== undefined) out.turnDisc = disc
	}
	// (a tie claim hands the card acting to a teammate on purpose — keepActor must not pin it back)
	const kept = req.kind === 'claim' ? null : keepActor(s, { ...s, ...out } as MatchState)
	return kept ? { ...out, ...kept } : out
}
function applyCardReqBase(s: MatchState, req: Exclude<CardReq, PowerReq>): Partial<MatchState> {
	const cards = s.cards ?? {}
	const turnIdx = s.turn - 1

	// host: make everyone who hasn't committed pass, so the turn can reveal/advance
	if (req.kind === 'forcepass') {
		const next: Record<string, PlayerCardState> = { ...cards }
		for (const pid in next) if (next[pid].pending == null) next[pid] = passTurn(next[pid])
		return { cards: next }
	}
	// the acting player ends their turn (the host may, for someone away): the next card acts; after the last
	// one nobody is acting and the HOST moves on (Next turn — or, on turn 4, the Minion battle)
	if (req.kind === 'endAct') {
		const order = turnOrder(s), at = actingIdx(s)
		if (timelinePick(s) || at >= order.length || (req.pid !== order[at] && req.pid !== s.host)) return {}
		const key = turnKey(s)
		const done = [...(s.acting?.key === key ? (s.acting.done ?? []) : order.slice(0, at)), order[at]]
		// a card the coin chose between the teams: once it has acted, the coin flips (the plan keeps its course)
		if (turnPlan(s).flips.includes(at))
			return { acting: { key, idx: at + 1, done, pin: done }, tieBreaker: otherTeamOf(s.tieBreaker), tieTurn: s.tieTurn?.key === key ? s.tieTurn : { key, coin: s.tieBreaker } }
		// the cards that acted stay pinned at the front (a card swapped later in the turn can't jump past them)
		return { acting: { key, idx: at + 1, done, pin: done } }
	}
	// a tied player claims the card acting now from their teammate (the team chooses who goes first)
	if (req.kind === 'save') return resolveSave(s, req.pid, req.idx)
	if (req.kind === 'gift') {
		const by = actorOf(s), c = actingCard(s, req.pid, by), g = giftOffer(s, req.pid, c), mark = markOf(s, actingIdx(s))
		if (!g || !g.targets.includes(req.target) || s.auto?.[req.pid]?.gift === mark || s.revealAt == null || Date.now() < s.revealAt) return {}
		return { cards: addCoinsTo(s.cards ?? {}, req.target, g.amount), auto: { ...(s.auto ?? {}), [req.pid]: { ...s.auto?.[req.pid], gift: mark } } }
	}
	if (req.kind === 'hurry') {
		const by = actorOf(s)
		if (!by || s.revealAt == null || Date.now() < s.revealAt || s.battlePhase) return {}
		if ((req.pid !== by && req.pid !== s.host) || !hurrying(s, by)) return {}
		const order = turnOrder(s), at = actingIdx(s), t = s.cards?.[req.target]
		if (req.target === by || !t || t.pending == null || t.pending < 0 || order.indexOf(req.target) <= at) return {}
		return { hurry: { ...(s.hurry ?? {}), [req.target]: { key: turnKey(s), idx: t.pending } } }
	}
	if (req.kind === 'claim') {
		if (!claimable(s).includes(req.pid)) return {}
		const key = turnKey(s)
		const prev = s.tieClaims?.key === key ? s.tieClaims.order.filter((p) => p !== req.pid) : []
		return { tieClaims: { key, order: [req.pid, ...prev] } }
	}
	if (req.kind === 'setAct') {
		if (req.pid !== s.host || timelinePick(s)) return {}
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
			return { cards: next, round: s.round + 1, turn: 1, battlePhase: false, levelPhase: false, levelBase: null, battle: null, attacks: {}, forced: {}, pieces, status: {}, radii: {}, effects: expireEffects(s.effects, s.round, s.turn) }
		}
		// end of turn: Glitch / Grenade tokens leave play (tokens.ts), then a team with
		// no minions left in the battle zone gets pushed (battle.ts)
		const pieces = sweepTokens(s.pieces ?? {}, 'turn')
		return { cards: migrated, turn: s.turn + 1, radii: {}, attacks: {}, forced: {}, pieces, effects: expireEffects(s.effects, s.round, s.turn), ...pushCheck({ ...s, pieces }) }
	}

	if (req.kind === 'defeatMinion' || req.kind === 'removeMinion') {
		// the moment a team's last minion (its heavy) leaves the battle zone, the other team pushes
		// an immune heavy can't be touched (the host can still override for card exceptions)
		if (heavyImmune(s, req.piece) && req.pid !== s.host) return {}
		if (s.saving?.piece.id === req.piece) return {} // already waiting on Brogan's save
		// Brogan's Shield / Bolster / Fortify: the defeated minion waits while he decides (the coins are paid now)
		const saver = req.kind === 'defeatMinion' ? saverFor(s, req.piece) : null
		if (saver && s.pieces?.[req.piece]) {
			const m = s.pieces[req.piece]
			return { cards: addCoinsTo(s.cards ?? {}, req.pid, minionCoins(m.role)), saving: { piece: m, by: req.pid, saver: saver.pid, card: saver.card, kind: saver.kind, at: Date.now() } }
		}
		const off = minionOff(s, req.pid, req.piece, req.kind === 'defeatMinion')
		return off.pieces ? { ...off, ...battleSettle({ ...s, cards: off.cards ?? s.cards }, off.pieces, req.piece) } : off
	}
	if (req.kind === 'defeatHero') return defeatHero(s, req.pid, req.target, req.keepCard)
	if (req.kind === 'removeHero') return removeHero(s, req.pid)
	if (req.kind === 'clearAround') { const c = clearAround(s, req.pid, req.ids ?? []); return c.removed.length ? { pieces: c.pieces } : {} }
	if (req.kind === 'respawn') return respawnHero(s, req.pid, req.hex)
	if (req.kind === 'spawn') return spawnHero(s, req.pid, req.hex)
	if (req.kind === 'attack') return startAttack(s, req.pid, req.target, req.body)
	if (req.kind === 'attackResolve') return resolveAttack(s, req.pid, req.target, req.result)
	if (req.kind === 'force') return startForce(s, req.pid, req.target, req.die)
	if (req.kind === 'forceResolve') return resolveForce(s, req.pid, req.target, req.result)
	if (req.kind === 'battleRemove' || req.kind === 'battleAuto') {
		// the losing team's players (or the host) choose
		if (!s.battle?.loser || (req.pid !== s.host && teamOf(s, req.pid) !== s.battle.loser)) return {}
		return req.kind === 'battleAuto' ? battleAuto(s) : battleRemove(s, req.piece)
	}

	if (req.kind === 'hostMove') {
		const cs = cards[req.target]
		if (req.pid !== s.host || !cs) return {}
		const next = repairCards(hostMove(cs, req.idx, req.to))
		return next === cs ? {} : { cards: { ...cards, [req.target]: next } }
	}

	const cs = cards[req.pid]
	if (!cs) return {}
	let next = cs
	// no playing a card between the minion battle and the next round (the client hides it; a late request mustn't land)
	if (req.kind === 'commit' && (s.battlePhase || s.levelPhase)) return {}
	if (req.kind === 'commit') next = commitCard(cs, req.idx)
	else if (req.kind === 'pass') next = passTurn(cs)
	else if (req.kind === 'uncommit') next = uncommit(cs)
	else if (req.kind === 'defend') next = discardCard(cs, req.idx)
	else if (req.kind === 'undiscard') next = undiscard(cs, req.idx)
	else if (req.kind === 'discardPlayed') next = discardPlayed(cs, req.idx)
	else if (req.kind === 'retrievePlayed') next = retrievePlayed(cs, req.idx)
	else if (req.kind === 'coins') next = addCoins(cs, req.delta)
	else if (req.kind === 'cardmove') next = manualMove(cs, req.idx, req.to)
	else if (req.kind === 'ult') next = { ...cs, ultimate: req.on }
	else if (req.kind === 'take') { if (!s.levelPhase) return {}; next = levelUp(cs, req.idx) }
	else if (req.kind === 'swap') { if (!s.levelPhase) return {}; next = swapPick(cs, req.idx) }
	// a card some race dropped out of every pile comes back (cardstate repairCards; a no-op when all is well)
	const changed = next !== cs
	next = repairCards(next)
	// a discard while forced to discard answers the demand (any card will do)
	const fd = s.forced?.[req.pid]
	if (req.kind === 'defend' && fd && changed) { const forced = { ...s.forced }; delete forced[req.pid]; return { cards: { ...cards, [req.pid]: next }, forced, lastClash: clashNews('force', fd.by, req.pid, 'defended', true) } }
	// a discard while being attacked is the defence: the defender may now answer Defended
	const atk = s.attacks?.[req.pid]
	if (req.kind === 'defend' && atk && changed) return { cards: { ...cards, [req.pid]: next }, attacks: { ...s.attacks, [req.pid]: { ...atk, defending: true, discarded: true, card: atk.card ?? req.idx } } }
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

/** A note the host jots during the game (the HUD's Notes box): kept with the game record for the match report.
 *  `i` = the segment of the turn (recorder BoardShot.i); `del` = deleted (kept so every journal drops it too). */
export interface GameNote { id: string; r: number; t: number; i?: number; at: number; text: string; by: string; del?: boolean }

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
	/** 4★ hero powers, per player (heropower.ts) */
	power?: Record<string, PowerState>
	/** where every hero / minion stood as this turn began (Emmitt's Back to the Future), and the cards each player
	 *  discarded this turn (his Time Capsule) — kept only while an Emmitt plays */
	turnStart?: { key: string; pos: Record<string, string> } | null
	turnDisc?: { key: string; by: Record<string, number[]> } | null
	/** a GM's test room: 4★ heroes still in the lab can be drafted, and the game is never uploaded to the Hall */
	draftLab?: boolean
	/** Lab rules (a GM's choice on Create): the 1–3★ card automation in autocards.ts runs for every hero */
	labRules?: boolean
	/** card immunities (autocards Immune: Arien's Expert / Master Duelist…) */
	immune?: Record<string, Immune[]>
	/** a defeated minion Brogan may still save (autocards Saving) — it stays on the board until he decides */
	saving?: Saving | null
	/** heroes defeated this round (autocards: War Drummer) */
	fallen?: { round: number; n: number }
	/** once-per-card marks of the automated moves (autocards) */
	auto?: Record<string, { gift?: string }>
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
	attacks?: Record<string, { by: string; defending: boolean; at: number; discarded?: boolean; body?: string; card?: number }>
	/** NebKher's latest act (laugh / steal / swap / doubt / crack): every screen plays its toast + laugh burst once */
	nkNews?: NkNews | null
	/** Emmitt reversed next turn (heropower EmNews): everyone's 'time will run backwards' toast */
	emNews?: EmNews | null
	/** Snorri inscribed the runes (heropower SnNews): everyone's banner */
	snNews?: SnNews | null
	/** Ignatia / Takahide moments (heropower FxNews): everyone's splash */
	fxNews?: FxNews | null
	/** Razzle's comic bursts: the last one, for everyone (heropower comicNewsOf) */
	comicNews?: ComicNews | null
	/** forced discards, keyed by the hero who must discard: who forces it, and whether it's "…or die" */
	forced?: Record<string, { by: string; die: boolean; at: number; only?: 'basic' | 'nonbasic' }>
	/** what Gydion just cast (everyone's toast; gydion.ts) */
	gyNews?: GyNews | null
	/** the latest lane push — every client plays the "wave advances" splash when `id` changes */
	pushNews?: PushNews | null
	/** the latest minion battle — every client plays the battle splash when `id` changes */
	battleNews?: BattleNews | null
	/** the latest hero defeat — every client plays the defeat splash when `id` changes */
	lastDefeat?: DefeatNews | null
	/** how the latest attack / forced discard ended (the recorder reads it — the Hall of Records' defences) */
	lastClash?: ClashNews | null
	/** game start: heroes not yet placed — each player puts theirs on a base spawn point */
	toSpawn?: Record<string, Piece>
	// synced 3-2-1 pre-reveal countdown: epoch ms when cards flip face-up. Set by
	// the host the moment every seated player has committed; cleared if anyone
	// uncommits (so the count restarts from 3 when they all commit again).
	revealAt?: number | null
	/** after the reveal, whose card is acting: `idx` into turnOrder(), for the turn `key` (round-turn); another turn = 0 */
	acting?: { key: string; idx: number; done?: string[]; pin?: string[] } | null
	/** tied teammates who claimed to go first this turn (the most recent claim first) */
	tieClaims?: { key: string; order: string[] } | null
	/** Hanu's Hurry up!: a player's card in play set to printed initiative 11 (`key` = the turn, `idx` = that card) until it changes */
	hurry?: Record<string, { key: string; idx: number }>
	/** the tie-breaker coin as this turn's order was set (an automatic flip mid-turn must not reshuffle it) */
	tieTurn?: { key: string; coin: Team } | null
	// per-player status markers shown on the HUD (Tigerclaw poison, Bain bounty),
	// keyed by playerId. Counts so poison can stack; 0 = clear.
	status?: Record<string, { poison: number; bounty: number }>
	// temporary area-effect radius shown around a player's hero (1–8 hexes);
	// cleared whenever the turn advances
	radii?: Record<string, number>
	// lingering card effects (This turn / Next turn / This round), switched on per
	// played card; they expire on their own as turns advance (see effects.ts)
	effects?: Effect[]
	/** the host's notes for the match report (never shown to the other players) */
	notes?: GameNote[]
	/** card requests: the highest `seq` the host has handled per sender, so a re-sent request is applied once */
	reqAck?: Record<string, number>
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
	face?: number // Razzle: which of her faces this body wears (0 / none = her portrait, 1–3 = her card paintings)
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
	// everything else kept per player moves too: 4★ powers (Snorri's runes, Gydion's book…), immunity, Hurry up!,
	// open attacks / forced discards, and the turn's acting order (a reconnect used to strand them on the old id)
	const rekey = <T,>(m: Record<string, T> | null | undefined): Record<string, T> | undefined => {
		if (!m || !(from in m)) return undefined
		const n = { ...m, [to]: m[from] }; delete n[from]; return n
	}
	const swapId = (l: string[] | undefined) => l?.map((p) => (p === from ? to : p))
	for (const k of ['power', 'immune', 'hurry', 'radii'] as const) { const n = rekey(s[k] as Record<string, unknown> | undefined); if (n) (patch as Record<string, unknown>)[k] = n }
	const byFix = <T extends { by?: string }>(m: Record<string, T> | null | undefined) => {
		if (!m) return undefined
		const n: Record<string, T> = {}
		for (const k in m) n[k === from ? to : k] = m[k].by === from ? { ...m[k], by: to } : m[k]
		return n
	}
	if (s.attacks && Object.keys(s.attacks).length) patch.attacks = byFix(s.attacks as Record<string, { by?: string }>) as MatchState['attacks']
	if (s.forced && Object.keys(s.forced).length) patch.forced = byFix(s.forced as Record<string, { by?: string }>) as MatchState['forced']
	if (s.acting) patch.acting = { ...s.acting, ...(s.acting.done ? { done: swapId(s.acting.done) } : {}), ...(s.acting.pin ? { pin: swapId(s.acting.pin) } : {}) }
	if (s.tieClaims) patch.tieClaims = { ...s.tieClaims, order: swapId(s.tieClaims.order)! }
	if (s.host === from) patch.host = to // the departed player was host → hand it over too
	return patch
}

/** The colour a seat's hero wears (its piece on the board, knocked out or waiting to spawn), or 'spectator'. */
export function seatColor(s: MatchState, id: string): string {
	return (id && (s.pieces?.[id]?.color ?? s.defeated?.[id]?.piece?.color ?? s.toSpawn?.[id]?.color)) || 'spectator'
}

/** A player name as the seat map compares it: trimmed, spacing and case ignored. */
export const nameKey = (n: string) => (n ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
/**
 * A seat a returning player lost: they came back with a NEW id (another device, the Home Screen app instead of
 * the browser, cleared storage, a resume ticket that ran out) under the same name. The seat's recorded owner has
 * that name and isn't here, and nobody else is sitting in it. Null when there's nothing to give back.
 */
export function reclaimableSeat(s: MatchState, present: Player[], p: Player): number | null {
	if (p.seat >= 0 || !nameKey(p.name)) return null
	for (const [seat, o] of Object.entries(s.seatMap ?? {})) {
		if (o.id === p.id || nameKey(o.name) !== nameKey(p.name)) continue
		if (present.some((q) => q.id === o.id || q.seat === Number(seat))) continue
		return Number(seat)
	}
	return null
}

// ── a copy of the room on every device (the room only lives in the players' browsers) ──────
// If everyone drops at once, the first one back restores the game from their copy instead of losing it.
const ROOM_CACHE = 'goa2-room:'
export const ROOM_CACHE_TTL = 12 * 3600 * 1000
export function cacheRoom(room: string, s: MatchState) {
	try {
		if (s.closed) { localStorage.removeItem(ROOM_CACHE + room); return }
		localStorage.setItem(ROOM_CACHE + room, JSON.stringify({ at: Date.now(), state: s }))
	} catch { /* full / private mode: skip */ }
}
export function cachedRoom(room: string): MatchState | null {
	try {
		const raw = JSON.parse(localStorage.getItem(ROOM_CACHE + room) || 'null') as { at: number; state: MatchState } | null
		if (!raw?.state || Date.now() - raw.at > ROOM_CACHE_TTL || raw.state.closed || !(raw.state.started || raw.state.draft)) return null
		return raw.state
	} catch { return null }
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

/** The draft's picks of the SEATED players only — a watcher never gets a deck or a hero. */
export function seatedPicks(s: Pick<MatchState, 'draft' | 'seats'>, players: Player[]): Record<string, string> {
	const r = teamRosters(players, s.seats), picks = s.draft?.picks ?? {}, out: Record<string, string> = {}
	for (const id of [...r.orange, ...r.blue]) if (picks[id]) out[id] = picks[id]
	return out
}

/** Does this player take part in the game (a seat, or a hero of their own)? Watchers only watch; the host may also act. */
export function playsIn(s: Pick<MatchState, 'cards' | 'seatMap' | 'seats'>, players: Player[], id: string): boolean {
	if (s.cards?.[id]) return true
	if (Object.values(s.seatMap ?? {}).some((o) => o.id === id)) return true
	return players.some((p) => p.id === id && p.seat >= 0 && p.seat < s.seats)
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
		draftLab?: boolean
		labRules?: boolean
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
		...(opts.draftLab ? { draftLab: true } : {}),
		...(opts.labRules ? { labRules: true } : {}),
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
	/** Host: put a watcher (by id) in a seat whose player is away — their hero, cards and coins move with it. */
	giveSeat: (pid: string, seat: number) => boolean
	/** the host hands the role to someone here (they become the creator too, so it stays with them) */
	passHost: (pid: string) => boolean
	/** Emits { seat, colour } when THIS client is granted a seat takeover. */
	seatGranted: Readable<{ seat: number; color: string; back?: boolean } | null>
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
	/** Nudge another player to hurry up (nudge.ts limits; false = not sent). */
	nudge: (to: string) => boolean
	/** ms before we may nudge `to` (0 = now). */
	nudgeWait: (to: string) => number
	/** The last nudge that landed on us. */
	nudged: Readable<Nudge | null>
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
	const seatGranted = writable<{ seat: number; color: string; back?: boolean } | null>(null)
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
	// nudges ("hurry up"): their own broadcast too; every client keeps the same book of who was nudged when (nudge.ts)
	let nudgeBook = emptyBook()
	const nudged = writable<Nudge | null>(null)
	const takeNudge = (n: Nudge) => {
		const r = seeNudge(nudgeBook, n, clientId, Date.now())
		nudgeBook = r.book
		if (r.lands && n.to === clientId) nudged.set(n)
	}
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
		// the game is over (a throne / final push, or Life out): no going back
		if (after.wonBy) { if (undoStack.length) { undoStack = []; canUndo.set(false) }; return }
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
	let everJoined = false // a SUBSCRIBED after the first one is a reconnect
	let heardAt = 0 // the last time anyone's state reached us (newer or not)
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
		ch.on('broadcast', { event: 'state' }, ({ payload }) => { heardAt = Date.now(); applyRemote(payload as MatchState) })
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
				const p = payload as { to: string; seat: number; color: string; back?: boolean }
				if (p.to === clientId) seatGranted.set({ seat: p.seat, color: p.color, back: !!p.back })
			})
			.on('broadcast', { event: 'seatdeny' }, ({ payload }) => {
				if ((payload as { to: string }).to === clientId) seatDenied.set(Date.now())
			})
			.on('broadcast', { event: 'cardreq' }, ({ payload }) => {
				// only the host is authoritative for the shared card map / resolved list
				if (local.host !== clientId) return
				hostApplyReq(payload as WireReq)
			})
			.on('broadcast', { event: 'cardack' }, ({ payload }) => {
				const a = payload as { to: string; seq: number }
				if (a.to === clientId) ackReqs(a.seq)
			})
			.on('broadcast', { event: 'ping' }, ({ payload }) => addPing(payload as Ping))
			.on('broadcast', { event: 'nudge' }, ({ payload }) => takeNudge(payload as Nudge))
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
				checkReturns()
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

	// A player back under the same name with a new id gets their seat — hero, cards, coins, tokens — straight
	// back (the host applies it: `reclaimableSeat` + `transferSeat`). Each player + seat is tried once.
	const handedBack = new Set<string>()
	function checkReturns() {
		if (!live() || local.host !== clientId || !local.seatMap) return
		for (const p of playerList) {
			const seat = reclaimableSeat(local, playerList, p)
			if (seat == null || handedBack.has(`${p.id}:${seat}`)) continue
			handedBack.add(`${p.id}:${seat}`)
			const from = local.seatMap[String(seat)].id
			const color = seatColor(local, from)
			const patch = transferSeat(local, from, p.id, p.name, seat)
			if (local.creator === from) patch.creator = p.id
			act(`${p.name} is back in their seat`, patch)
			const grant = { to: p.id, seat, color, back: true }
			if (p.id === clientId) seatGranted.set({ seat, color: grant.color, back: true })
			else try { channel.send({ type: 'broadcast', event: 'seatgrant', payload: grant }) } catch { /* ignore */ }
		}
	}
	state.subscribe(() => checkReturns())

	// every device keeps a copy of a game under way (throttled), for `cachedRoom`
	let cacheTimer: ReturnType<typeof setTimeout> | null = null
	state.subscribe((v) => {
		if (v.rev < 0 || !(v.started || v.draft || v.closed) || cacheTimer || typeof localStorage === 'undefined') return
		cacheTimer = setTimeout(() => { cacheTimer = null; if (!left) cacheRoom(room, local) }, 2500)
	})

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
			if (everJoined) {
				// back after a drop: whatever we changed while the socket was dead never left this
				// device — share it (LWW keeps whichever is newer), and send the card requests again
				if (local.rev >= 0) broadcastState()
				resendReqs()
			}
			everJoined = true
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
		// a card effect switched on / off (Activate effect, End effect) is a plain update, not a card request: let the
		// 4★ powers see it too (Ignatia's Equilibrium is an effect of her silver — its splash news is written here)
		if ('effects' in patch && Object.values(after.cards ?? {}).some((c) => hasPower(c.hero))) {
			const sync = syncPowers(after, powerCtx(after))
			if (sync) Object.assign(after, sync)
		}
		// a move / token / host edit mid-turn never takes the turn away from the card acting (Tali's Ice, …)
		if ('pieces' in patch || 'cards' in patch) { const kept = keepActor(before, after); if (kept) Object.assign(after, kept) }
		recordHistory(before, after)
		local = after
		state.set(local)
		broadcastState()
	}

	// host: revert the most recent logged action, snapping back one activity-log
	// entry at a time (down to the first entry of the current turn).
	const undo = () => {
		if (local.host !== clientId || local.wonBy) return
		const snap = undoStack.pop()
		canUndo.set(undoStack.length > 0)
		if (!snap) return
		undoing = true // don't let this restore re-enter the history
		// notes are never undone (they aren't game moves)
		update({ ...snap, host: local.host, hostEpoch: local.hostEpoch, creator: local.creator, notes: local.notes, reqAck: local.reqAck })
		undoing = false
	}

	const nudgeWait = (to: string) => waitOf(nudgeBook, clientId, to, Date.now())
	const nudge = (to: string) => {
		if (nudgeWait(to) > 0) return false
		const n: Nudge = { id: `${clientId}-${Date.now()}`, from: clientId, to, at: Date.now() }
		takeNudge(n)
		try { channel.send({ type: 'broadcast', event: 'nudge', payload: n }) } catch { /* ignore */ }
		return true
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
	// Card requests from other players carry `from` + `seq` (rising per sender) and are sent again until the
	// host has handled them (a phone's dead socket swallows them). The host applies each seq once and in
	// order: one at or below the sender's mark is a repeat (or was overtaken by a later one) and is dropped.
	const handled: Record<string, number> = {} // host-side marks; Undo can't wind these back
	const hostApplyReq = (wire: WireReq) => {
		const { from, seq, ...req } = wire
		const tracked = typeof from === 'string' && typeof seq === 'number'
		if (tracked) {
			if (seq <= Math.max(handled[from] ?? 0, local.reqAck?.[from] ?? 0)) { refuseReq(from, seq); return }
			handled[from] = seq
			// a watcher can't play: no coins, cards, moves or skips from someone without a seat (the host is exempt)
			if (from !== clientId && from !== local.host && !playsIn(local, playerList, from)) { refuseReq(from, seq); return }
		}
		const ack: Partial<MatchState> = tracked ? { reqAck: { ...local.reqAck, [from]: seq } } : {}
		// a commit that arrives once the cards are revealed (a slow connection) would change a played card
		if (req.kind === 'commit' && local.revealAt != null && Date.now() >= local.revealAt) { if (tracked) refuseReq(from, seq); return }
		const patch = applyCardReq(local, req as CardReq)
		if (!Object.keys(patch).length) { if (tracked) refuseReq(from, seq); return }
		Object.assign(patch, ack)
		// Maintain the synced 3-2-1 reveal countdown. When a card action leaves
		// every seated player committed, anchor a reveal time (unless one is already
		// running — don't restart while it holds); any non-committed state clears it,
		// so the count starts fresh from 3 the next time they all commit. 'advance'
		// starts a new turn, so it always clears the anchor.
		if (patch.cards || (req.kind === 'power' && req.op === 'emOne')) {
			const seats = patch.seats ?? local.seats
			const pc = patch.cards ?? local.cards ?? {}
			const seatedIds = playerList.filter((p) => p.seat >= 0 && p.seat < seats && pc[p.id]).map((p) => p.id)
			const fin = { ...local, ...patch } as MatchState, fctx = powerCtx(fin)
			// Emmitt with his ultimate is in once he has a second card down too — or said 'just one' (asked only before
			// the reveal: once the cards are up nothing un-reveals them)
			const before = !(local.revealAt != null && Date.now() >= local.revealAt)
			const allIn = seatedIds.length > 0 && seatedIds.every((pid) => { const cs = pc[pid]; return (cs.pending != null || cs.hand.length === 0) && !(before && wantsSecond(fin, pid, { ...fctx, revealed: false })) })
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
		if ((req.kind === 'defeatMinion' || req.kind === 'removeMinion') && !patch.saving) {
			const m = local.pieces?.[req.piece]
			const what = aMinion(m?.team, m?.role)
			note(req.pid, req.kind === 'defeatMinion' ? `defeated ${what} (+${minionCoins(m?.role)} coins)` : `removed ${what} (no coins)`)
		}
		if (req.kind === 'respawn' && patch.pieces) note(req.pid, 'respawned ⤴')
		if ((req.kind === 'discardPlayed' || req.kind === 'retrievePlayed') && patch.cards?.[req.pid]) {
			const name = heroCards(local.cards?.[req.pid]?.hero ?? '')[req.idx]?.name ?? 'a played card'
			note(req.pid, req.kind === 'retrievePlayed' ? `retrieved ${name} to their hand` : `discarded ${name} (played)`)
		}
		if (req.kind === 'endAct' && (patch.acting !== undefined || patch.turn)) { const who = actorOf(local); if (who) note(who, req.pid === who ? 'ends their turn' : 'turn skipped by the host') }
		if (req.kind === 'endAct' && patch.tieBreaker) note(req.pid, `the tie-breaker coin flips to the ${teamName(patch.tieBreaker)}`)
		if (req.kind === 'claim' && patch.tieClaims) note(req.pid, 'claims the tie — goes first')
		if (req.kind === 'defeatMinion' && patch.saving) { const m = patch.saving.piece; note(req.pid, `defeated ${aMinion(m.team as Team, m.role)} (+${minionCoins(m.role)} coins) — ${nameOf(patch.saving.saver)} may save it (${patch.saving.card})`) }
		if (req.kind === 'save' && 'saving' in patch && local.saving) { const sv = local.saving; note(req.pid, req.idx != null ? `discards ${heroCards(local.cards?.[req.pid]?.hero ?? '')[req.idx]?.name ?? 'a card'}: the minion stays (${sv.card})` : `lets ${aMinion(sv.piece.team as Team, sv.piece.role)} fall`) }
		if (req.kind === 'gift' && patch.cards) { const d = (patch.cards[req.target]?.coins ?? 0) - (local.cards?.[req.target]?.coins ?? 0); note(req.pid, `gives ${nameOf(req.target)} ${d} coin${d === 1 ? '' : 's'} (${heroCards(local.cards?.[req.pid]?.hero ?? '')[local.cards?.[req.pid]?.pending ?? -1]?.name ?? 'card'})`) }
		if (req.kind === 'hurry' && patch.hurry) { const t = local.cards?.[req.target]; note(req.pid, `hurries ${nameOf(req.target)}'s ${heroCards(t?.hero ?? '')[t?.pending ?? -1]?.name ?? 'card'} up to initiative 11 (Hurry up!)`) }
		if (req.kind === 'power' && req.op === 'snorriInscribe' && patch.power && req.order) note(req.pid, req.target && req.target !== req.pid ? `set ${nameOf(req.target)}'s runes: ${runeLine(req.order)} (host)` : `inscribed the runes: ${runeLine(req.order)}`)
		if (req.kind === 'power' && req.op === 'snorriSecond' && patch.power) note(req.pid, req.rune ? `Rune Mastery: ${RUNE_NAME[req.rune]} is active too` : 'Rune Mastery: no second rune')
		if (req.kind === 'power' && req.op === 'takaSwap' && patch.cards && req.idx != null) {
			const who = req.target ?? req.pid, before = local.cards?.[who], after = patch.cards[who]
			const from = before ? basicsOf(before).find((i) => !basicsOf(after).includes(i)) : undefined
			const nm = (i?: number) => (i != null ? heroCards('takahide')[i]?.name : '') ?? ''
			// face up only when the gold just played turns into another in its slot; a swap in the hand or face down stays secret
			const open = from != null && before?.pending === from && !after.hidden?.includes(req.idx)
			note(req.pid, who !== req.pid ? `swapped ${nameOf(who)}'s gold card (host)` : open ? `swapped ${nm(from)} for ${nm(req.idx)}` : 'swapped their gold card (Bushido)')
		}
		if (req.kind === 'power' && req.op === 'mateSwap' && patch.cards && req.idx != null) {
			const before = local.cards?.[req.pid], hero = before?.hero ?? ''
			note(req.pid, `swapped ${heroCards(hero)[before?.pending ?? -1]?.name ?? 'their card'} for ${heroCards(hero)[req.idx]?.name ?? 'another'} (Takahide)`)
		}
		if (req.kind === 'power' && req.op === 'emReverse' && patch.power) note(req.pid, req.target && req.target !== req.pid ? (req.on === false ? `cancelled ${nameOf(req.target)}'s time reversal (host)` : `reversed time for next turn (host, for ${nameOf(req.target)})`) : 'reverses time — next turn, lower initiative acts first')
		if (req.kind === 'power' && req.op === 'emWarp' && patch.power && req.target) note(req.pid, `warps time: ${nameOf(req.target)} swaps their card in play for a resolved one`)
		if (req.kind === 'power' && req.op === 'warpSwap' && patch.cards && req.idx != null) { const b = local.cards?.[req.pid], h = b?.hero ?? ''; note(req.pid, `swapped ${heroCards(h)[b?.pending ?? -1]?.name ?? 'their card'} for ${heroCards(h)[b?.turns[req.idx] ?? -1]?.name ?? 'a resolved card'} (Time Warp)`) }
		if (req.kind === 'power' && req.op === 'capsule' && patch.cards) { const n = (local.cards?.[req.pid]?.discard.length ?? 0) - (patch.cards[req.pid]?.discard.length ?? 0); note(req.pid, `took back ${n} discarded card${n === 1 ? '' : 's'} (Time Capsule)`) }
		if (req.kind === 'power' && req.op === 'nkLaugh' && patch.power) { const f = Object.keys(patch.forced ?? {}).filter((t) => !local.forced?.[t]); note(req.pid, f.length ? `laughs diabolically — ${f.map(nameOf).join(', ')} must discard or be defeated! (What the Hell Are You?)` : 'laughs diabolically') }
		if (req.kind === 'power' && req.op === 'nkGrip' && patch.power && req.target) { const c = local.cards?.[req.target]; note(req.pid, `steals ${nameOf(req.target)}'s ${heroCards(c?.hero ?? '')[c?.turns[local.turn - 2] ?? -1]?.name ?? 'spell'} (${heroCards(NEB)[local.cards?.[req.pid]?.pending ?? -1]?.name ?? 'Mind Grip'})`) }
		if (req.kind === 'power' && req.op === 'nkSwap' && patch.cards && req.target && req.slots) { const c = local.cards?.[req.target], h = c?.hero ?? ''; const nm = (t: number) => heroCards(h)[(t === local.turn - 1 ? c?.pending : c?.turns[t]) ?? -1]?.name ?? 'a card'; note(req.pid, `swapped ${nameOf(req.target)}'s ${nm(req.slots[0])} (turn ${req.slots[0] + 1}) and ${nm(req.slots[1])} (turn ${req.slots[1] + 1}) — Diabolical Laughter`) }
		if (req.kind === 'power' && req.op === 'nkName' && patch.power && req.color) note(req.pid, `names ${req.color[0] + req.color.slice(1).toLowerCase()} (${heroCards(NEB)[local.cards?.[req.pid]?.pending ?? -1]?.name ?? 'Imbue Doubt'})`)
		if (req.kind === 'power' && req.op === 'nkCrack' && patch.power && local.power?.[req.pid]?.crack?.key !== (patch.power as Record<string, PowerState>)[req.pid]?.crack?.key) note(req.pid, `splits the board in two (${heroCards(NEB)[local.cards?.[req.pid]?.pending ?? -1]?.name ?? 'Crack in Reality'})`)
		if (req.kind === 'power' && req.op === 'ignatiaFlip' && patch.tieBreaker) note(req.pid, `flips the tie-breaker coin to the ${teamName(patch.tieBreaker)} (Chaos Incarnate)`)
		if (req.kind === 'removeHero' && patch.defeated) note(req.pid, 'took their hero off the board — back with their next card')
		if (req.kind === 'power' && req.op === 'rzSpawn' && patch.pieces) note(req.pid, 'spawns a double (Stunt Doubles)')
		if (req.kind === 'power' && req.op === 'rzRemove' && patch.pieces) note(req.pid, 'takes one of her bodies off the board')
		if (req.kind === 'power' && req.op === 'rzClear' && patch.pieces) note(req.pid, 'calls every double back (Crowd Control)')
		if (req.kind === 'power' && req.op === 'rzTwin' && patch.power) note(req.pid, 'strikes again with another one of her (Twin Strike)')
		if (req.kind === 'power' && req.op === 'emKeep' && patch.cards) {
			const who = req.pid === local.host && req.target ? req.target : req.pid, before = local.cards?.[who], after = patch.cards[who]
			const name = (i: number | null | undefined) => (i != null && i >= 0 ? heroCards(after?.hero ?? '')[i]?.name : null) ?? 'a card'
			if (before && after) note(who, `keeps ${name(after.pending)} and takes ${name(req.which === 1 ? before.pending2 : before.pending)} back (Alternative Timelines)${who !== req.pid ? ' — host' : ''}`)
		}
		if (req.kind === 'power' && req.op.startsWith('gy') && Object.keys(patch).length) {
			const sn = (id?: string) => spellName(id ?? '')
			if (req.op === 'gyPrepare') note(req.pid, 'prepares his spells — every spell is back in the spellbook')
			if (req.op === 'gyWish') { const w = (patch.power as Record<string, PowerState>)?.[req.pid]?.gy?.wish ?? 0; note(req.pid, `casts Wish (${w} of 3)${patch.wonBy ? ' — the third Wish!' : ''} instead of preparing his spells`) }
			if (req.op === 'gyCast') { const p2 = patch.power as Record<string, PowerState> | undefined; note(req.pid, `casts ${sn(req.spell)}${p2?.[req.pid]?.gy?.cast?.wish ? ' (Wish)' : ''}${req.spell === 'midas-touch' && patch.cards ? ` — +${(patch.cards[req.pid]?.coins ?? 0) - (local.cards?.[req.pid]?.coins ?? 0)} coins` : ''}${req.spell === 'energy-drain' && patch.life ? ' — his team regains a Life counter' : ''}`) }
			if (req.op === 'gyStrike') note(req.pid, req.spells?.length ? `removes ${req.spells.map(sn).join(', ')} from his spellbook (Find Familiar)` : 'removes no spells (Find Familiar)')
			if (req.op === 'gyForce' && req.target) { const f = (patch.forced as MatchState['forced'])?.[req.target]; note(req.pid, `makes ${nameOf(req.target)} discard ${f?.only === 'basic' ? 'a basic card' : f?.only === 'nonbasic' ? 'a non-basic card' : 'a card'}, if able`) }
			if (req.op === 'gyRaise') note(req.pid, 'raises a minion from the dead (Create Undead)')
			if (req.op === 'gyDrink' && req.idx != null) note(req.pid, `retrieves ${heroCards('gydion')[req.idx]?.name ?? 'a card'} from his discard (Vampiric Touch)`)
			if (req.op === 'gyFix' && req.target) note(req.pid, req.spell ? (req.on ? `put ${spellName(req.spell)} back in ${nameOf(req.target)}'s spellbook (host)` : `sent ${nameOf(req.target)}'s ${spellName(req.spell)} to the ether (host)`) : req.wish != null ? `set ${nameOf(req.target)}'s Wishes to ${req.wish} (host)` : `fixed ${nameOf(req.target)}'s spellbook (host)`)
		}
		if (req.kind === 'power' && req.op === 'rzRetrieve' && patch.cards && req.idx != null) note(req.pid, `retrieves ${heroCards(RZ)[req.idx]?.name ?? 'a card'} from her discard`)
		if (req.kind === 'clearAround' && patch.pieces) { const n = Object.keys(local.pieces ?? {}).length - Object.keys(patch.pieces).length; note(req.pid, `cleared ${n} token${n === 1 ? '' : 's'} next to them`) }
		if (req.kind === 'spawn' && patch.pieces) note(req.pid, 'entered the battlefield')
		if (req.kind === 'attack' && patch.attacks) note(req.pid, `attacks ${nameOf(req.target)}!`)
		if (req.kind === 'defend' && patch.immune) { const i = patch.immune[req.pid]?.slice(-1)[0]; if (i) note(req.pid, `is immune to every other enemy's attacks ${i.span === 'round' ? 'this round' : 'this turn'} (${i.card})`) }
		if (req.kind === 'force' && patch.forced) note(req.pid, req.die ? `forces ${nameOf(req.target)} to discard — or be defeated!` : `forces ${nameOf(req.target)} to discard a card`)
		if (req.kind === 'forceResolve' && patch.forced && !patch.lastDefeat) {
			const by = local.forced?.[req.target]?.by ?? ''
			if (req.result === 'cancel') note(req.pid, `called off the forced discard on ${nameOf(req.target)}`)
			else if (req.result === 'none') note(req.target, `has no card to discard (${nameOf(by)})`)
		}
		if (req.kind === 'defend' && local.forced?.[req.pid] && patch.forced && !patch.forced[req.pid]) note(req.pid, `discarded a card (forced by ${nameOf(local.forced[req.pid].by)})`)
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
		if (req.kind === 'hostMove' && patch.cards?.[req.target]) {
			const name = heroCards(local.cards?.[req.target]?.hero ?? '')[req.idx]?.name ?? 'a card'
			const before = local.cards?.[req.target], after = patch.cards[req.target]
			const where = ({ hand: 'Hand', upgrade: 'Item', deck: 'Deck', removed: 'Removed' } as const)[req.to]
			note(req.pid, `moved ${nameOf(req.target)}'s ${name} → ${where} (host)`)
			if (before && levelOf(after) < levelOf(before)) note(req.target, `back to Level ${levelOf(after)} ⬇`)
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
	// nothing changed (refused, or a repeat): tell the sender directly so it stops sending it again
	const refuseReq = (to: string, seq: number) => {
		if (to === clientId) return
		try { channel.send({ type: 'broadcast', event: 'cardack', payload: { to, seq: Math.max(seq, handled[to] ?? 0) } }) } catch { /* ignore */ }
	}
	// requests not yet seen handled by the host, oldest first; sent again every REQ_RETRY_MS while connected
	// and at once after a reconnect, given up after REQ_TTL_MS (a host away that long has handed over)
	const REQ_RETRY_MS = 1500, REQ_TTL_MS = 20000
	let outbox: { req: WireReq; at: number }[] = []
	let lastSeq = 0
	let retryTimer: ReturnType<typeof setTimeout> | null = null
	const sendReq = (req: WireReq) => { try { channel.send({ type: 'broadcast', event: 'cardreq', payload: req }) } catch { /* ignore */ } }
	const ackReqs = (upTo: number) => { if (outbox.length) outbox = outbox.filter((o) => (o.req.seq ?? 0) > upTo) }
	const resendReqs = () => {
		const now = Date.now()
		outbox = outbox.filter((o) => now - o.at < REQ_TTL_MS)
		if (local.host === clientId) {
			// we became the host while they waited: apply them here
			const mine = outbox; outbox = []
			for (const o of mine) hostApplyReq(o.req)
			return
		}
		if (get(conn) === 'connected') for (const o of outbox) sendReq(o.req)
	}
	const armRetry = () => {
		if (retryTimer || left) return
		retryTimer = setTimeout(() => {
			retryTimer = null
			resendReqs()
			if (outbox.length) armRetry()
		}, REQ_RETRY_MS)
	}
	// the host's snapshots carry how far it got with our requests
	state.subscribe((v) => { const a = v.reqAck?.[clientId]; if (a != null) ackReqs(a) })
	const cardAction = (req: CardReq) => {
		if (local.host === clientId) { hostApplyReq(req); return }
		// a seq that keeps rising across reloads of this tab (the same clientId): the clock, never below the last
		lastSeq = Math.max(lastSeq + 1, Date.now(), (local.reqAck?.[clientId] ?? 0) + 1)
		const wire: WireReq = { ...req, from: clientId, seq: lastSeq }
		outbox.push({ req: wire, at: Date.now() })
		// anything older still unanswered goes again FIRST, so the host never meets a newer request before an
		// older one (it would then drop the older as overtaken); a repeat the host already has costs nothing
		if (get(conn) === 'connected') for (const o of outbox) sendReq(o.req)
		armRetry()
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

	// the host hands the role to someone here (e.g. before leaving): they become the room's creator too, so the old
	// host does not take it back on return (the new host can pass it back)
	const passHost = (pid: string) => {
		if (local.host !== clientId || pid === clientId) return false
		const p = playerList.find((q) => q.id === pid)
		if (!p) return false
		act(`made ${p.name} the host`, { host: pid, creator: pid, hostEpoch: (local.hostEpoch ?? 0) + 1 })
		return true
	}

	// the host hands a seat to a watcher by hand (a player back under a different name, or a stand-in)
	const giveSeat = (pid: string, seat: number) => {
		if (local.host !== clientId) return false
		const p = playerList.find((q) => q.id === pid)
		const owner = local.seatMap?.[String(seat)]
		if (!p || p.seat >= 0) return false
		if (playerList.some((q) => q.id !== pid && (q.seat === seat || (owner && q.id === owner.id)))) return false // someone is in it
		const from = owner?.id ?? ''
		const color = seatColor(local, from)
		const patch: Partial<MatchState> = from
			? transferSeat(local, from, pid, p.name, seat)
			: { seatMap: { ...(local.seatMap ?? {}), [String(seat)]: { id: pid, name: p.name } } }
		if (from && local.creator === from) patch.creator = pid
		patch.seatRequests = (local.seatRequests ?? []).filter((r) => r.id !== pid)
		const back = !!owner && nameKey(owner.name) === nameKey(p.name)
		act(back ? `put ${p.name} back in their seat` : `gave ${p.name} ${owner?.name ? `${owner.name}'s` : 'a'} seat`, patch)
		const grant = { to: pid, seat, color, back }
		if (pid === clientId) seatGranted.set({ seat, color, back })
		else try { channel.send({ type: 'broadcast', event: 'seatgrant', payload: grant }) } catch { /* ignore */ }
		return true
	}

	// Phones: a page coming back from the background (or a network that comes back) reconnects at once rather
	// than waiting out the backoff; after more than a few seconds away the socket is presumed dead and rebuilt.
	let hiddenAt = 0
	let wakeSeq = 0
	const wake = (hard: boolean) => {
		if (left) return
		const n = ++wakeSeq
		if (hard || get(conn) !== 'connected') {
			backoff = 750
			// a dead socket that still says "open" would swallow the rebuilt channel's join too: check it first
			void checkSocket().then(() => { if (n === wakeSeq && !left) void hardReconnect() })
			return
		}
		void checkSocket().then((alive) => {
			if (n !== wakeSeq || left) return
			if (!alive) { backoff = 750; return } // dead: realtime rebuilds the socket, our channel rejoins (or the watchdog rebuilds it)
			trackNow()
			const asked = Date.now()
			try { channel.send({ type: 'broadcast', event: 'hello', payload: { id: clientId } }) } catch { /* ignore */ }
			resendReqs()
			// the socket answers, but does the ROOM? Anyone else holding the state replies to hello at once;
			// silence while they are present = our channel is gone on the server's side → rebuild it
			setTimeout(() => {
				if (n !== wakeSeq || left || heardAt >= asked || local.rev < 0) return
				const raw = channel.presenceState() as Record<string, Array<{ probing?: boolean }>>
				if (Object.keys(raw).some((k) => k !== clientId && !raw[k][0]?.probing)) { backoff = 750; void hardReconnect() }
			}, 3000)
		})
	}
	const onVis = () => {
		if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
		const away = hiddenAt ? Date.now() - hiddenAt : 0
		hiddenAt = 0
		if (away > 1500) wake(false)
	}
	const onOnline = () => wake(true)
	const onShow = (e: PageTransitionEvent) => { if (e.persisted) wake(true) }
	if (typeof document !== 'undefined' && typeof window !== 'undefined') {
		document.addEventListener('visibilitychange', onVis)
		window.addEventListener('online', onOnline)
		window.addEventListener('pageshow', onShow)
	}

	const leave = () => {
		if (left) return // a second leave must not reach the channel a NEWER session of this room now holds
		if (typeof document !== 'undefined' && typeof window !== 'undefined') {
			document.removeEventListener('visibilitychange', onVis)
			window.removeEventListener('online', onOnline)
			window.removeEventListener('pageshow', onShow)
		}
		if (cacheTimer) { clearTimeout(cacheTimer); cacheTimer = null }
		if (graceTimer) clearTimeout(graceTimer)
		if (trackTimer) clearTimeout(trackTimer)
		if (stateTimer) clearTimeout(stateTimer)
		if (hostTimer) clearTimeout(hostTimer)
		if (reclaimTimer) clearTimeout(reclaimTimer)
		if (retryTimer) clearTimeout(retryTimer)
		outbox = []
		clearWatchdog()
		clearJoinDeadline()
		left = true
		if (liveSessions.get(sessionKey) === leave) liveSessions.delete(sessionKey)
		void dropChannel(channel)
	}
	liveSessions.set(sessionKey, leave)

	return { state, players, update, act, setSelf, cardAction, kick, flipJoin, joinFlip, undo, canUndo, requestSeat, resolveSeat, giveSeat, passHost, seatGranted, seatDenied, kicked, notFound, status: conn, leave, clientId, hostNow, ping, pings, nudge, nudgeWait, nudged }
}

/**
 * GM tools: close a room from outside. Joins it as a watcher, waits for its state, then sets `closed` (everyone in
 * it drops to the menu, and the host's directory entry goes with them). 'empty' = nobody answered — the listing
 * was a ghost of a dead connection and drops off by itself.
 */
export function closeRoom(room: string, by = 'A GM'): Promise<'closed' | 'empty'> {
	return new Promise((done) => {
		const s = joinMatch(room, { name: by, color: 'spectator' }, {})
		let over = false
		const finish = (r: 'closed' | 'empty', wait: number) => {
			if (over) return
			over = true
			setTimeout(() => { s.leave(); done(r) }, wait)
		}
		const offState = s.state.subscribe((v) => {
			if (over || v.rev < 0) return
			s.act('closed the room (GM tools)', { closed: true })
			queueMicrotask(() => offState?.())
			finish('closed', 1200) // let the throttled broadcast go out first
		})
		s.notFound.subscribe((v) => { if (v) finish('empty', 0) })
		setTimeout(() => finish('empty', 0), 25000)
	})
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
/** Brogan's answer to a save (autocards): `idx` = the card he discards (it must pay for this save) → the minion stays;
 *  none = it falls now (the host may let it fall for an away player). */
export function resolveSave(s: MatchState, pid: string, idx?: number): Partial<MatchState> {
	const sv = s.saving
	if (!sv || (pid !== sv.saver && !(pid === s.host && idx == null))) return {}
	if (idx == null) {
		if (!s.pieces?.[sv.piece.id]) return { saving: null }
		const pieces = { ...s.pieces }
		delete pieces[sv.piece.id]
		return { saving: null, ...battleSettle(s, pieces, sv.piece.id) }
	}
	const cs = s.cards?.[pid]
	if (!cs || !saveCards(cs, sv.kind).includes(idx)) return {}
	return { saving: null, cards: { ...s.cards, [pid]: repairCards(discardCard(cs, idx)) } }
}
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

/** How an attack or a forced discard ended: `defended` (survived — for a forced discard, the card was
 *  discarded), `died` (defeated through it; `disc` = they had discarded a card first, i.e. defended and
 *  still fell), `none` (forced, nothing to discard) or `cancel` (called off). */
export interface ClashNews { id: string; kind: 'attack' | 'force'; by: string; v: string; out: 'defended' | 'died' | 'none' | 'cancel'; disc: boolean; at: number }
const clashNews = (kind: ClashNews['kind'], by: string, v: string, out: ClashNews['out'], disc: boolean): ClashNews =>
	({ id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, kind, by, v, out, disc, at: Date.now() })

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
	const adj = iniAdjust(s, pid)
	const v = adj.printed ?? heroCards(cs.hero)[idx]?.initiative
	return v == null ? null : v + (statDeltas(cs).init ?? 0) + adj.delta
}
/** Card text that changes a player's initiative this turn: Hanu's Hurry up! (`printed` = 11 while the card it was
 *  set on is still the one in play) and Tali's Ice tokens (−1 for every Ice token of an ENEMY Tali next to the hero) */
export function iniAdjust(s: Pick<MatchState, 'cards' | 'pieces' | 'hurry' | 'round' | 'turn'>, pid: string): { printed?: number; delta: number } {
	const cs = s.cards?.[pid]
	const h = s.hurry?.[pid]
	const printed = h && h.key === turnKey(s) && h.idx === cs?.pending ? 11 : undefined
	let delta = 0
	const me = s.pieces?.[pid]
	if (me?.kind === 'hero') {
		const near = new Set(hexNeighbours(me.hex))
		for (const p of Object.values(s.pieces ?? {}))
			if (p.kind === 'token' && p.token === 'token_ice' && near.has(p.hex) && p.owner && s.cards?.[p.owner]?.hero === 'tali' && s.pieces?.[p.owner]?.team !== me.team) delta--
	}
	return { printed, delta }
}
/** Hanu's Hurry up!: is this player's card acting now the one that sets an initiative to 11? */
export const RE_HURRY = /set the printed [\s\S]{0,40}initiative value [\s\S]{0,80}to 11/i
export const hurrying = (s: MatchState, pid: string) => {
	const cs = s.cards?.[pid]
	return actorOf(s) === pid && !!cs && RE_HURRY.test(heroCards(cs.hero)[cs.pending ?? -1]?.description ?? '')
}
/** A change in the middle of a turn may not hand the turn to another card: if the card acting now would move, the
 *  order up to it is pinned as it stood (Hurry up!, a hero stepping next to Ice, a host edit…). Null = nothing to do */
export function keepActor(before: MatchState, after: MatchState): Partial<MatchState> | null {
	const key = turnKey(after)
	if (turnKey(before) !== key || after.revealAt == null || Date.now() < after.revealAt || after.battlePhase) return null
	const at = actingIdx(before)
	if (actingIdx(after) !== at) return null
	const ob = turnOrder(before), oa = turnOrder(after)
	const was = ob[at]
	if (!was || oa[at] === was || !oa.includes(was)) return null
	const pin = ob.slice(0, at + 1).filter((p) => oa.includes(p))
	return { acting: { ...(after.acting?.key === key ? after.acting : { key, idx: at }), pin } }
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

/** The board without a hero: its piece, Razzle's doubles of it, and the markers riding on any of them. */
function withoutHero(s: MatchState, pid: string): Record<string, Piece> {
	const gone = new Set([pid, ...Object.values(s.pieces ?? {}).filter((p) => isDouble(p) && p.owner === pid).map((p) => p.id)])
	const pieces: Record<string, Piece> = {}
	for (const id in s.pieces) { const p = s.pieces[id]; if (!gone.has(id) && !(p.attachedTo && gone.has(p.attachedTo))) pieces[id] = p }
	return pieces
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
	const pieces = withoutHero(s, target)
	const life = sum.team ? { ...s.life, [sum.team]: Math.max(0, s.life[sum.team] - sum.lives) } : s.life
	const lifeTok = sum.team && s.lifeTok ? { ...s.lifeTok, [sum.team]: spendTokens(s.lifeTok[sum.team] ?? [], sum.lives) } : s.lifeTok
	const attacks = { ...(s.attacks ?? {}) }
	delete attacks[target]
	const forced = { ...(s.forced ?? {}) }
	delete forced[target]
	const lastDefeat: DefeatNews = {
		id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		victim: target, by: pid, coins: sum.coins, assist: sum.assist, assists: sum.assists, lives: sum.lives, team: sum.team, at: Date.now()
	}
	return { pieces, cards, life, lifeTok, attacks, forced, lastDefeat, defeated: { ...(s.defeated ?? {}), [target]: { round: s.round, turn: s.turn, piece: hero } } }
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
	const pieces = withoutHero(s, pid)
	const attacks = { ...(s.attacks ?? {}) }
	delete attacks[pid]
	const forced = { ...(s.forced ?? {}) }
	delete forced[pid]
	return { pieces, attacks, forced, defeated: { ...(s.defeated ?? {}), [pid]: { round: s.round, turn: s.turn, piece: hero } } }
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
export function startAttack(s: MatchState, pid: string, target: string, body?: string): Partial<MatchState> {
	const hero = s.pieces?.[target]
	if (!hero || hero.kind !== 'hero' || pid === target || s.attacks?.[target]) return {}
	const a = teamOf(s, pid)
	if (!a || a === teamOf(s, target)) return {}
	// which of Razzle's bodies was attacked (its own minions count, and her Crowd Control reminder)
	const b = body && body !== target && s.pieces?.[body]?.owner === target && isDouble(s.pieces[body]) ? body : undefined
	return { attacks: { ...(s.attacks ?? {}), [target]: { by: pid, defending: false, at: Date.now(), ...(b ? { body: b } : {}) } } }
}
export function resolveAttack(s: MatchState, pid: string, target: string, result: 'defend' | 'defended' | 'defeated' | 'cancel'): Partial<MatchState> {
	const at = s.attacks?.[target]
	if (!at) return {}
	const isHost = pid === s.host
	if (result === 'cancel' ? pid !== at.by && !isHost : pid !== target && !isHost) return {}
	const attacks = { ...s.attacks }
	if (result === 'defend') return { attacks: { ...attacks, [target]: { ...at, defending: true } } }
	if (result === 'defeated') { const d = defeatHero(s, at.by, target); return d.lastDefeat ? { ...d, lastClash: clashNews('attack', at.by, target, 'died', !!at.discarded) } : d }
	// a defence is a discarded card: the defender can only say Defended once they've discarded (the host can, for someone away)
	if (result === 'defended' && !isHost && !at.discarded) return {}
	delete attacks[target]
	return { attacks, lastClash: clashNews('attack', at.by, target, result === 'defended' ? 'defended' : 'cancel', !!at.discarded) }
}

// ── forced discards (card effects): "target discards a card" / "…or is defeated" ──────────
export function startForce(s: MatchState, pid: string, target: string, die: boolean): Partial<MatchState> {
	const hero = s.pieces?.[target]
	if (!hero || hero.kind !== 'hero' || pid === target || s.forced?.[target]) return {}
	const a = teamOf(s, pid)
	if (!a || a === teamOf(s, target)) return {}
	return { forced: { ...(s.forced ?? {}), [target]: { by: pid, die, at: Date.now() } } }
}
export function resolveForce(s: MatchState, pid: string, target: string, result: 'defeated' | 'none' | 'cancel'): Partial<MatchState> {
	const f = s.forced?.[target]
	if (!f) return {}
	const isHost = pid === s.host
	if (result === 'cancel' ? pid !== f.by && !isHost : pid !== target && !isHost) return {}
	// "…or die": not discarding = defeated, the forcer takes the rewards (like an attack)
	if (result === 'defeated') { if (!f.die) return {}; const d = defeatHero(s, f.by, target); return d.lastDefeat ? { ...d, lastClash: clashNews('force', f.by, target, 'died', false) } : d }
	const forced = { ...s.forced }
	delete forced[target]
	return { forced, lastClash: clashNews('force', f.by, target, result, false) }
}

/** The minion modifiers on a hero's defence (shown while they're attacked): enemy melee / heavy
 *  next to them −1 each, enemy ranged within range 2 −1 each, friendly melee / heavy next to them
 *  +1 each (friendly ranged: nothing). */
export function minionDefense(s: MatchState, target: string): { mods: { id: string; d: number }[]; total: number } {
	const hero = s.pieces?.[s.attacks?.[target]?.body ?? target] ?? s.pieces?.[target]
	if (!hero || hero.kind !== 'hero') return { mods: [], total: 0 }
	const at = hexCube(hero.hex)
	// Arien's Duelists (autocards): defending with one, every minion modifier is ignored
	if (RE_NO_MINION_MODS.test(textOf(defenceCard(s, target)))) return { mods: [], total: 0 }
	const mods: { id: string; d: number }[] = []
	for (const p of Object.values(s.pieces ?? {})) {
		if (p.kind !== 'minion') continue
		const dist = cubeDist(hexCube(p.hex), at)
		const close = p.role === 'ranged' ? false : dist === 1
		if (p.team !== hero.team) { if (close || (p.role === 'ranged' && dist <= 2)) mods.push({ id: p.id, d: -1 }) }
		else if (close) mods.push({ id: p.id, d: 1 })
	}
	// NebKher's Illusionary Force / Army: while he attacks, his Illusions next to the target count as his melee minions
	// (only on his own actions — when he is attacked they give him nothing)
	const by = s.attacks?.[target]?.by
	if (by && s.cards?.[by]?.hero === NEB && illusionForce(s, by))
		for (const p of Object.values(s.pieces ?? {})) if (p.kind === 'token' && p.token === 'token_illusion' && p.owner === by && cubeDist(hexCube(p.hex), at) === 1) mods.push({ id: p.id, d: -1 })
	return { mods, total: mods.reduce((n, m) => n + m.d, 0) }
}

export function respawnHero(s: MatchState, pid: string, hex: string): Partial<MatchState> {
	const d = s.defeated?.[pid]
	if (!d || !canRespawn(s, pid) || !spawnOk(s, d.piece.team as Team, hex)) return {}
	const defeated = { ...s.defeated }
	delete defeated[pid]
	const face = d.piece.hero === RZ ? Math.floor(Math.random() * 4) : d.piece.face
	return { pieces: { ...s.pieces, [pid]: { ...d.piece, hex, face } }, defeated }
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
