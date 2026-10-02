// Quiet game recorder — nothing about it is shown anywhere in the app.
//
// Every browser in the game keeps its own complete journal of the match in
// localStorage (the shared activity log is capped at LOG_CAP and rides on every
// sync, so it can't hold a whole game): the draft, the players and their heroes,
// one snapshot per turn (level, coins, the card each hero played, Life, waves,
// battle zone) and EVERY log line. A game only counts when it is played from the
// first turn to a win (`wonBy`) with at least two different people seated —
// anything less is a test run and is never uploaded (stale journals are pruned).
// When the game is won, a browser that saw it from the very start uploads the
// journal once to the Supabase table `goa2_games` (insert-only for the public key:
// rows can be added from the app but never read back — read them in the
// dashboard). The id is the same on every client, so duplicates are refused.
import type { LogEntry, MatchState, Team } from './match'
import { supabase } from './supabase'

export const REC_TABLE = 'goa2_games'
const PREFIX = 'goa2-rec:'
const MAX_AGE = 3 * 24 * 3600 * 1000 // unfinished journals older than this are test runs

type Snap = {
	round: number
	turn: number
	at: number
	life: Record<Team, number>
	waves: number
	lane: number
	/** per player: level, coins, the card index played this turn (into heroCards(hero)) */
	cards: Record<string, { lv: number; coins: number; played: number | null }>
}

/** What happened, as the STATE showed it (never read back out of the log's wording):
 *  a hero defeat = one `lastDefeat` news id; a minion defeat = a minion leaving the board in
 *  the same change that paid a player its coins. `r` / `t` = the round and turn it happened in. */
export type GameEvent =
	| { k: 'hero'; id: string; r: number; t: number; by: string; v: string; a: string[]; c: number; ac: number; l: number; team: Team | null }
	| { k: 'minion'; id: string; r: number; t: number; by: string; role: string; team: Team }

export interface Journal {
	v: 1
	id: string
	room: string
	startedAt: number
	lastAt: number
	fromStart: boolean // this browser saw the game's first turn
	seats: number
	mapId: string
	draftSystem: string
	lifeMax: number
	wavesMax: number
	players: Record<string, { name: string; seat: number; hero: string; team?: Team; color?: string }>
	draft: { picks: Record<string, string>; bans: string[]; order: { team: Team; type: string; actor: string }[] } | null
	turns: Snap[]
	cur: Snap | null
	log: LogEntry[]
	/** structured events (absent in journals begun before they were recorded) */
	ev?: GameEvent[]
	/** what the event tracker saw last: the latest hero-defeat id and the minions on the board (id → "team|role") */
	mark?: { d: string | null; m: Record<string, string> } | null
	done: boolean // won — ready to upload
	uploaded: boolean
	/** the state as the game ended (kept so a failed upload can be retried later) */
	final?: { round: number; turn: number; life: Record<Team, number>; waves: number; lane: number; wonBy: { team: Team; reason: string }; cards: MatchState['cards'] }
}

/** The same id on every client: room + the game's own id (set by the host when the draft starts).
 *  Older games without one fall back to the Begin flip time (cleared by then, hence the old "-0" ids). */
export const gameId = (room: string, s: MatchState) => `${room}-${s.gameId ?? s.startFlip?.at ?? 0}`

const snap = (s: MatchState): Snap => {
	const cards: Snap['cards'] = {}
	// the committed card sits in `pending` until the turn moves on, then lands in turns[]
	for (const [pid, c] of Object.entries(s.cards ?? {})) cards[pid] = { lv: c.level, coins: c.coins, played: c.turns?.[s.turn - 1] ?? c.pending ?? null }
	return { round: s.round, turn: s.turn, at: Date.now(), life: { ...s.life }, waves: s.waves, lane: s.lane ?? 1, cards }
}

export function newJournal(room: string, s: MatchState): Journal {
	return {
		v: 1, id: gameId(room, s), room, startedAt: Date.now(), lastAt: Date.now(),
		fromStart: s.round === 1 && s.turn === 1 && !s.wonBy,
		seats: s.seats, mapId: s.mapId, draftSystem: s.draftSystem, lifeMax: s.lifeMax, wavesMax: s.wavesMax,
		players: {}, draft: null, turns: [], cur: null, log: [], ev: [], mark: null, done: false, uploaded: false
	}
}

const minionsOf = (s: MatchState) => {
	const m: Record<string, string> = {}
	for (const [id, p] of Object.entries(s.pieces ?? {})) if (p?.kind === 'minion') m[id] = `${p.team}|${p.role ?? 'melee'}`
	return m
}
const sameKeys = (a: Record<string, string>, b: Record<string, string>) => {
	const k = Object.keys(a)
	return k.length === Object.keys(b).length && k.every((id) => id in b)
}

/** The structured events: compare this state with what the journal saw last (`j.mark`, and the
 *  coins in `j.cur`). The mark is saved with the journal, so a reload picks up where it left off.
 *  The host's Undo (this turn only) is followed: an undone defeat comes back off the list. */
function track(out: Journal, j: Journal, s: MatchState): boolean {
	if (!j.ev) return false // a journal from before events were recorded: it stays without
	const now = minionsOf(s)
	const ld = s.lastDefeat ?? null
	const mark = j.mark
	// the first look: a baseline only (a defeat left over in the room's state is not this game's)
	if (!mark) { out.mark = { d: ld?.id ?? null, m: now }; return true }
	const here = (e: GameEvent) => e.r === s.round && e.t === s.turn
	let ev = j.ev
	const paid: Record<string, number> = {} // hero-defeat coins that arrived with this very change
	if ((ld?.id ?? null) !== mark.d) {
		const at = ld ? ev.findIndex((e) => e.k === 'hero' && e.id === ld.id) : -1
		if (!ld || at >= 0) {
			// the state went BACK to an earlier defeat (or to none): this turn's later ones were undone
			ev = ev.filter((e, i) => !(e.k === 'hero' && i > at && here(e)))
		} else {
			const when = s.defeated?.[ld.victim]
			ev = [...ev, { k: 'hero', id: ld.id, r: when?.round ?? s.round, t: when?.turn ?? s.turn, by: ld.by, v: ld.victim,
				a: [...(ld.assists ?? [])], c: ld.coins ?? 0, ac: ld.assist ?? 0, l: ld.lives ?? 0, team: ld.team ?? null }]
			paid[ld.by] = ld.coins ?? 0
			for (const a of ld.assists ?? []) paid[a] = (paid[a] ?? 0) + (ld.assist ?? 0)
		}
	}
	// an undone minion defeat: the very same piece stands on the board again
	if (ev.some((e) => e.k === 'minion' && here(e) && e.id in now)) ev = ev.filter((e) => !(e.k === 'minion' && here(e) && e.id in now))
	// minions that left the board with this change, and who was paid for them (2 coins, a heavy 4)
	const pool = Object.keys(mark.m).filter((id) => !(id in now)).map((id) => {
		const [team, role] = mark.m[id].split('|')
		return { id, team: team as Team, role }
	})
	if (pool.length && j.cur) {
		for (const [pid, c] of Object.entries(s.cards ?? {})) {
			const was = j.cur.cards[pid]?.coins
			if (was == null) continue
			let gain = c.coins - was - (paid[pid] ?? 0)
			const mine = out.players[pid]?.team
			const take = (heavy: boolean) => {
				let i = pool.findIndex((m) => (m.role === 'heavy') === heavy && m.team !== mine) // an enemy minion first
				if (i < 0) i = pool.findIndex((m) => (m.role === 'heavy') === heavy)
				return i < 0 ? null : pool.splice(i, 1)[0]
			}
			while (gain >= 2) {
				const m = (gain >= 4 ? take(true) : null) ?? take(false)
				if (!m) break
				gain -= m.role === 'heavy' ? 4 : 2
				ev = [...ev, { k: 'minion', id: m.id, r: s.round, t: s.turn, by: pid, role: m.role, team: m.team }]
			}
		}
	}
	const moved = (ld?.id ?? null) !== mark.d || !sameKeys(mark.m, now)
	if (ev === j.ev && !moved) return false
	out.ev = ev
	if (moved) out.mark = { d: ld?.id ?? null, m: now }
	return true
}

/** Fold the latest state into the journal (pure; returns the same object when nothing changed). */
export function journalUpdate(j: Journal, s: MatchState): Journal {
	if (j.done && s.wonBy) return j
	// (a win the host undid: the game goes on, and so does its journal)
	let changed = j.done
	const out: Journal = { ...j, done: false }
	if (j.done) delete out.final
	// players + heroes (seat map is the durable owner list; names can be filled in later)
	for (const [seat, o] of Object.entries(s.seatMap ?? {})) {
		const hero = s.cards?.[o.id]?.hero ?? ''
		const was = out.players[o.id]
		// team + colour ride on the hero piece (on the board, waiting to enter, or knocked out)
		const piece = s.pieces?.[o.id] ?? s.toSpawn?.[o.id] ?? s.defeated?.[o.id]?.piece
		const team: Team = piece?.team === 'orange' || piece?.team === 'blue' ? piece.team : +seat < Math.floor(s.seats / 2) ? 'orange' : 'blue'
		const color = piece?.color ?? was?.color
		if (!was || was.hero !== hero || was.name !== o.name || was.team !== team || was.color !== color) {
			out.players = { ...out.players, [o.id]: { name: o.name, seat: +seat, hero, team, ...(color ? { color } : {}) } }
			changed = true
		}
	}
	// hero and minion defeats, from the state itself (never allowed to break the rest of the journal)
	try { if (track(out, j, s)) changed = true } catch { /* ignore */ }
	if (!out.draft && s.draft) {
		out.draft = { picks: { ...(s.draft.picks ?? {}) }, bans: [...(s.draft.bans ?? [])], order: (s.draft.order ?? []).map((t) => ({ team: t.team, type: t.type, actor: t.actor })) }
		changed = true
	}
	// the whole log, de-duplicated by id (the shared one only keeps the last LOG_CAP lines)
	const seen = new Set(out.log.map((e) => e.id))
	const fresh = (s.log ?? []).filter((e) => !seen.has(e.id))
	if (fresh.length) { out.log = [...out.log, ...fresh]; changed = true }
	// one snapshot per turn: the current turn keeps updating until the turn moves on
	const now = snap(s)
	if (!out.cur) { out.cur = now; changed = true }
	else if (out.cur.round !== s.round || out.cur.turn !== s.turn) {
		// the finished turn: its played cards are now in turns[] (same round) — fill any the snapshot missed
		const done = { ...out.cur, cards: { ...out.cur.cards } }
		if (s.round === done.round) for (const [pid, c] of Object.entries(s.cards ?? {})) {
			const played = c.turns?.[done.turn - 1]
			if (played != null && done.cards[pid]) done.cards[pid] = { ...done.cards[pid], played }
		}
		out.turns = [...out.turns, done]; out.cur = now; changed = true
	}
	else if (JSON.stringify(out.cur.cards) !== JSON.stringify(now.cards) || out.cur.waves !== now.waves || out.cur.lane !== now.lane
		|| out.cur.life.orange !== now.life.orange || out.cur.life.blue !== now.life.blue) { out.cur = { ...now, at: out.cur.at }; changed = true }
	if (s.wonBy) {
		out.done = true
		out.final = { round: s.round, turn: s.turn, life: { ...s.life }, waves: s.waves, lane: s.lane ?? 1, wonBy: { ...s.wonBy }, cards: s.cards ?? {} }
		changed = true
	}
	if (!changed) return j
	out.lastAt = Date.now()
	return out
}

/** A real game: seen from the first turn, won, with at least two different people seated. */
export function isFullGame(j: Journal): boolean {
	return j.fromStart && j.done && new Set(Object.keys(j.players)).size >= 2
}

/** The row stored in `goa2_games`. */
export function gameRow(j: Journal) {
	const turns = j.cur ? [...j.turns, j.cur] : j.turns
	const f = j.final
	return {
		id: j.id,
		room: j.room,
		started_at: new Date(j.startedAt).toISOString(),
		ended_at: new Date(j.lastAt).toISOString(),
		winner: f?.wonBy.team ?? null,
		reason: f?.wonBy.reason ?? null,
		rounds: f?.round ?? null,
		players: Object.keys(j.players).length,
		data: {
			v: j.v, seats: j.seats, mapId: j.mapId, draftSystem: j.draftSystem, lifeMax: j.lifeMax, wavesMax: j.wavesMax,
			players: j.players, draft: j.draft, turns, log: j.log, final: f ?? null, ev: j.ev ?? null
		}
	}
}

// ── browser side ────────────────────────────────────────────────────────────
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
const load = (id: string): Journal | null => { try { const raw = store()?.getItem(PREFIX + id); return raw ? (JSON.parse(raw) as Journal) : null } catch { return null } }
const save = (j: Journal) => { try { store()?.setItem(PREFIX + j.id, JSON.stringify(j)) } catch { /* full / private mode: skip */ } }
const drop = (id: string) => { try { store()?.removeItem(PREFIX + id) } catch { /* ignore */ } }

async function upload(j: Journal): Promise<boolean> {
	try {
		const { error } = await supabase.from(REC_TABLE).insert(gameRow(j))
		// 23505 = already recorded by another player's browser: that's a success too
		return !error || error.code === '23505' || /duplicate/i.test(error.message ?? '')
	} catch { return false }
}

/** One recorder per game screen: call `tick` with every state change. */
export function createRecorder(room: string, clientId: string) {
	let j: Journal | null = null
	let sending = false
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (j) save(j) })
	return {
		tick(s: MatchState) {
			// never let the recorder get in the game's way: browser only, and any error is swallowed
			if (typeof window === 'undefined' || !s?.started || !room) return
			try { step(s) } catch { /* ignore */ }
		},
		/** this browser's journal of the game on screen (null before the first tick) — for the battle report */
		journal: (): Journal | null => j
	}
	function step(s: MatchState) {
		const id = gameId(room, s)
		if (!j || j.id !== id) j = load(id) ?? newJournal(room, s)
		const next = journalUpdate(j, s)
		if (next === j) return
		j = next
		saveSoon(j.done)
		if (j.done && !j.uploaded && !sending && isFullGame(j)) {
			// the host sends straight away; everyone else a little later, as a backup
			const wait = s.host === clientId ? 0 : 15000
			const mine = j
			sending = true
			setTimeout(async () => {
				const ok = await upload(mine)
				sending = false
				if (ok) { drop(mine.id); if (j?.id === mine.id) j = { ...j, uploaded: true } }
			}, wait)
		}
	}
	// a long game's journal is a few hundred KB: write it at most every couple of seconds
	function saveSoon(now: boolean) {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = null
		if (now) { if (j) save(j); return }
		saveTimer = setTimeout(() => { saveTimer = null; if (j) save(j) }, 2000)
	}
}

/** On app start: drop stale test runs, and (re)send finished games that didn't get through. */
export function sweepJournals() {
	const st = store()
	if (!st) return
	for (let i = st.length - 1; i >= 0; i--) {
		const k = st.key(i)
		if (!k?.startsWith(PREFIX)) continue
		const j = load(k.slice(PREFIX.length))
		if (!j || ((!j.done || j.uploaded) && Date.now() - j.lastAt > MAX_AGE) || (j.done && !isFullGame(j))) st.removeItem(k)
		else if (j.done && !j.uploaded) void upload(j).then((ok) => ok && drop(j.id))
	}
}
