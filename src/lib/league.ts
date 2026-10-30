// THE LEAGUE — everything the stats page shows, worked out from the finished games in `goa2_games`
// (one row per game, uploaded by the recorder). Pure: rows in, the league out — tested in league.test.ts.
//
// People are matched across games by NAME (trimmed, case and spacing ignored): the app has no accounts,
// so "Zara" in one game and "zara " in the next are the same player.
//
// What every number rests on:
//  · wins / losses / streaks / win types / heroes / roles / team-mates / opponents — every game
//  · kills, deaths, assists, minions, nemeses — games recorded with events (the release's recorder);
//    older games count for the rest and are left out of these (never guessed from the log's wording)
//  · coins earned / level — the final card state (every game)
//  · level-up paths — games recorded with build steps (in pick order); older games give the final build
//    only (`ordered: false`), in tier order
//  · rating — an individual Elo: everyone starts at 1200; each player is rated against the ENEMY team's average
//    (ratings before the game), so a lower-rated player gains more from the same win. Provisional K: 48 for a
//    player's first PROVISIONAL (10) games, then 32
import type { Team } from './match'
import type { BuildStep, GameEvent, Journal } from './recorder'
import { statsFromJournal, levelsPaid } from './gamestats'
import { HEROES, type Trait } from './heroes'
import { heroCards } from './cards/deck'

/** A row of `goa2_games` as it comes back from the backend. */
export type GameRowIn = {
	id: string
	room?: string
	started_at: string
	ended_at: string
	winner: Team | null
	reason: string | null
	rounds: number | null
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any
}

export type WinType = 'throne' | 'final' | 'life' | 'other'
export const WIN_TYPES: WinType[] = ['throne', 'final', 'life']
export const WIN_LABEL: Record<WinType, string> = { throne: 'Throne', final: 'Final push', life: 'Life', other: 'Other' }
export const winType = (reason: string | null | undefined): WinType =>
	/throne/i.test(reason ?? '') ? 'throne' : /final push/i.test(reason ?? '') ? 'final' : /life/i.test(reason ?? '') ? 'life' : 'other'

/** The same person in every game: their name, trimmed, spacing and case ignored. */
export const playerKey = (name: string) => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
// the GM tools' name aliases (aliases.ts: spelling key → shown name), set by a page before it builds the league
let NAMES: Record<string, string> = {}
export function useAliases(map: Record<string, string>) { NAMES = map ?? {} }
/** A typed name as one person: the alias when there is one, else the name as typed. */
export const canonName = (name: string) => { const t = (name ?? '').trim().replace(/\s+/g, ' '); return NAMES[playerKey(t)] ?? t }

/** A level-up path: the Tier II / III cards a hero took, in the order they were taken (indices into heroCards). */
export type Path = { cards: number[]; ult: boolean; ordered: boolean }
export const pathKey = (p: Path) => `${p.cards.join('.')}${p.ult ? '.U' : ''}`

export type GamePlayer = {
	key: string
	name: string
	/** the player's colour (a PLAYER_COLORS id) in that game */
	color: string
	id: string
	hero: string
	team: Team
	won: boolean
	level: number
	coins: number | null
	kills: number | null
	deaths: number | null
	assists: number | null
	minions: number | null
	/** minions this player defeated, by role (games recorded with events) */
	mRoles: { melee: number; ranged: number; heavy: number } | null
	path: Path
	/** the rest of the story, from the game's events (null when it wasn't recorded with them) */
	x: Extras | null
	/** the round their ultimate came on (null: never, or no build steps) */
	ultRound: number | null
	/** won after the battle zone sat on their own beach, or with their team down to its last Life */
	brink: boolean
}
/** One player's extra numbers in one game. The clash ones (`defends` …) need a game recorded with clashes
 *  (`evv` ≥ 2) and `giants` needs the killers' levels — otherwise they are null and count for nothing. */
export type Extras = {
	firstBlood: number // 1 = theirs was the game's first hero defeat
	wipe: number // 1 = they defeated every enemy hero at least once
	shutdowns: number // defeated a hero on a streak of 3+ defeats without falling
	paybacks: number // defeated the hero who last defeated them
	multis: number // turns with 2+ defeats
	aces: number // rounds in which their team defeated every enemy hero
	heavies: number // heavy minions defeated
	bounty: number // coins from hero defeats + assists
	giants: number | null // defeated a hero 2+ levels above them
	defends: number | null // attacks survived by defending
	defDied: number | null // defended (discarded) and still fell
	noDefDied: number | null // fell without discarding a card (an attack, or discard-or-die)
	beatDefended: number | null // defeated a hero who had defended
	relentless: number | null // defeats of a hero they had already attacked that round
	// ── match moments (see MOMENTS) ──
	savior: number | null // defeated an enemy who had attacked a teammate this turn or the turn before, same round, that teammate still standing
	punisher: number // defeated the hero who defeated a teammate, in the same turn or the next, same round
	coup: number // the defeat that took the enemy team's last Life (a Life win)
	denied: number | null // rounds survived after defending 2+ attacks / forced discards from ONE enemy hero
	breakwater: number | null // rounds survived after defending attacks / forced discards from 2+ different enemy heroes
	lastStand: number | null // rounds survived after defending an attack while their team was on its last Life
	sweep: number // turns with 3+ enemy minions defeated or removed
	opening: number // hero defeats in round 1
	fastStart: number // 1 = their team defeated more minions in round 1 than it has heroes
	spree: number // 3 hero defeats in a row without falling (one per life)
	pacifist: number | null // 1 = the whole game without attacking an enemy hero
}
/** what extrasOf needs to know about the game beyond its events */
export type GameFacts = { lifeMax?: number; winner?: Team | null; type?: WinType }
export type LeagueGame = {
	id: string
	room: string
	/** heroes a side (2 = a 2 v 2) */
	side: number
	/** recorded with clashes (defences) */
	clashes: boolean
	startedAt: number
	at: number
	minutes: number
	rounds: number
	winner: Team
	type: WinType
	players: GamePlayer[]
	/** hero defeats, by player key, with when (round / turn) */
	defeats: { by: string; v: string; a: string[]; r: number; t: number }[]
	events: boolean
	/** a TABLE game (from a report): no rounds, minutes, builds or events — only who played what, who won, and
	 *  whatever numbers the old score sheets kept */
	legacy?: boolean
}

const tierOf = (hero: string, i: number) => heroCards(hero)[i]?.level ?? 0
const colourOf = (hero: string, i: number) => heroCards(hero)[i]?.color ?? ''

/** The path out of a player's build steps: a card counts once taken and kept past the moment it was taken —
 *  one later swapped for its twin or put back (undo) does not; one replaced by a higher tier of the same
 *  colour does (it was a step on the way). */
export function pathOfSteps(hero: string, steps: BuildStep[]): Path {
	const picks: number[] = []
	let prev: number[] = []
	for (const st of steps) {
		const entered = st.keep.filter((k) => !prev.includes(k))
		const left = prev.filter((k) => !st.keep.includes(k))
		for (const k of left) {
			const promoted = entered.some((e) => colourOf(hero, e) === colourOf(hero, k) && tierOf(hero, e) > tierOf(hero, k))
			if (!promoted) picks.splice(picks.indexOf(k), 1)
		}
		for (const e of entered) if (!picks.includes(e)) picks.push(e)
		prev = st.keep
	}
	return { cards: picks, ult: !!steps[steps.length - 1]?.ult, ordered: true }
}

/** A path from the final card state alone (games recorded before build steps): the kept upgrades, in tier order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pathOfFinal(hero: string, c: any): Path {
	if (!c) return { cards: [], ult: false, ordered: false }
	const gone = new Set<number>([...(c.upgrade ?? []), ...(c.removed ?? [])])
	const held = new Set<number>([...(c.hand ?? []), ...(c.discard ?? []), ...((c.turns ?? []) as (number | null)[]).filter((x): x is number => x != null), ...(c.pending != null ? [c.pending] : [])])
	const keep = [...held].filter((i) => !gone.has(i) && (tierOf(hero, i) === 2 || tierOf(hero, i) === 3))
	keep.sort((a, b) => tierOf(hero, a) - tierOf(hero, b) || colourOf(hero, a).localeCompare(colourOf(hero, b)))
	return { cards: keep, ult: !!c.ultimate, ordered: false }
}

/** A row back into a journal (the shape the battle report reads). */
export function journalOfRow(row: GameRowIn): Journal {
	const d = row.data ?? {}
	return {
		v: 1, id: row.id, room: row.room ?? '', startedAt: Date.parse(row.started_at), lastAt: Date.parse(row.ended_at), fromStart: true,
		seats: d.seats ?? 0, mapId: d.mapId ?? '', draftSystem: d.draftSystem ?? '', lifeMax: d.lifeMax ?? 0, wavesMax: d.wavesMax ?? 0,
		players: d.players ?? {}, draft: d.draft ?? null, turns: Array.isArray(d.turns) ? d.turns : [], cur: null, log: Array.isArray(d.log) ? d.log : [],
		ev: Array.isArray(d.ev) ? d.ev : undefined, builds: d.builds ?? undefined, mark: null, done: true, uploaded: true, final: d.final ?? undefined
	}
}

const minionRoles = (ev: unknown, id: string) => {
	const out = { melee: 0, ranged: 0, heavy: 0 }
	for (const e of (Array.isArray(ev) ? ev : []) as GameEvent[]) if (e.k === 'minion' && e.by === id) { const r = e.role as keyof typeof out; if (r in out) out[r]++ }
	return out
}

const other = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')
/** The extras for every player of one game, from its events (see Extras). */
export function extrasOf(evIn: unknown, clashes: boolean, team: Record<string, Team>, facts: GameFacts = {}): Record<string, Extras> {
	const ev = (Array.isArray(evIn) ? evIn : []) as GameEvent[]
	const ids = Object.keys(team)
	const H = ev.map((e, i) => ({ e, i })).filter((x): x is { e: Extract<GameEvent, { k: 'hero' }>; i: number } => x.e.k === 'hero' && x.e.by in team && x.e.v in team)
	const C = ev.map((e, i) => ({ e, i })).filter((x): x is { e: Extract<GameEvent, { k: 'clash' }>; i: number } => x.e.k === 'clash')
	const levels = H.some((h) => h.e.kl != null)
	const out: Record<string, Extras> = {}
	for (const id of ids) out[id] = { firstBlood: 0, wipe: 0, shutdowns: 0, paybacks: 0, multis: 0, aces: 0, heavies: 0, bounty: 0,
		giants: levels ? 0 : null, defends: clashes ? 0 : null, defDied: clashes ? 0 : null, noDefDied: clashes ? 0 : null, beatDefended: clashes ? 0 : null, relentless: clashes ? 0 : null,
		savior: clashes ? 0 : null, punisher: 0, coup: 0, denied: clashes ? 0 : null, breakwater: clashes ? 0 : null, lastStand: clashes && facts.lifeMax ? 0 : null, sweep: 0, opening: 0, fastStart: 0, spree: 0, pacifist: clashes ? 0 : null }
	if (H[0]) out[H[0].e.by].firstBlood = 1
	const streak: Record<string, number> = {}, lastKiller: Record<string, string> = {}, turnKills: Record<string, number> = {}
	for (const { e, i } of H) {
		const x = out[e.by]
		if ((streak[e.v] ?? 0) >= 3) x.shutdowns++
		if (lastKiller[e.by] === e.v) { x.paybacks++; delete lastKiller[e.by] }
		streak[e.by] = (streak[e.by] ?? 0) + 1
		streak[e.v] = 0
		lastKiller[e.v] = e.by
		const tk = `${e.by}|${e.r}|${e.t}`
		turnKills[tk] = (turnKills[tk] ?? 0) + 1
		if (turnKills[tk] === 2) x.multis++
		x.bounty += e.c ?? 0
		for (const a of e.a ?? []) if (out[a]) out[a].bounty += e.ac ?? 0
		if (levels && e.kl != null && (e.c ?? 0) - e.kl >= 2) x.giants = (x.giants ?? 0) + 1
		// already went after this hero this round (a clash that didn't finish them)
		if (clashes && C.some((c) => c.i < i && c.e.by === e.by && c.e.v === e.v && c.e.r === e.r && c.e.out !== 'cancel' && c.e.out !== 'died')) x.relentless = (x.relentless ?? 0) + 1
	}
	for (const id of ids) {
		const foes = ids.filter((o) => team[o] !== team[id])
		const hit = new Set(H.filter((h) => h.e.by === id).map((h) => h.e.v))
		if (foes.length && foes.every((f) => hit.has(f))) out[id].wipe = 1
	}
	for (const e of ev) {
		if (e.k === 'minion' && e.role === 'heavy' && out[e.by]) out[e.by].heavies++
	}
	// Ace: a round in which the team defeated every enemy hero (each member gets it)
	for (const T of ['orange', 'blue'] as Team[]) {
		const own = ids.filter((id) => team[id] === T), foes = ids.filter((id) => team[id] !== T)
		if (!own.length || !foes.length) continue
		for (const r of new Set(H.map((h) => h.e.r))) {
			const down = new Set(H.filter((h) => h.e.r === r && team[h.e.by] === T).map((h) => h.e.v))
			if (foes.every((f) => down.has(f))) for (const id of own) out[id].aces++
		}
	}
	// Pacifist: the whole game without attacking an enemy hero (an attack called off still counts as one; so does any defeat)
	if (clashes) for (const id of ids) if (!C.some((c) => c.e.by === id && c.e.kind === 'attack') && !H.some((h) => h.e.by === id)) out[id].pacifist = 1
	if (clashes) for (const { e } of C) {
		if (e.out === 'defended' && e.kind === 'attack' && out[e.v]) out[e.v].defends!++
		if (e.out === 'died' && e.disc && e.kind === 'attack') { if (out[e.v]) out[e.v].defDied!++; if (out[e.by]) out[e.by].beatDefended!++ }
		if (e.out === 'died' && !e.disc && out[e.v]) out[e.v].noDefDied!++
	}
	moments(ev, H, C, clashes, team, out, facts)
	return out
}

// turns counted through the game (round 2 turn 1 comes right after round 1 turn 4)
const tix = (e: { r: number; t: number }) => (e.r - 1) * 4 + (e.t - 1)
/** the match moments (one per occurrence; a player can earn one several times in a game) */
function moments(ev: GameEvent[], H: { e: Extract<GameEvent, { k: 'hero' }>; i: number }[], C: { e: Extract<GameEvent, { k: 'clash' }>; i: number }[],
	clashes: boolean, team: Record<string, Team>, out: Record<string, Extras>, facts: GameFacts) {
	const mates = (a: string, b: string) => a !== b && team[a] != null && team[a] === team[b]
	const run: Record<string, number> = {} // hero defeats since they last fell (Killing Spree)
	for (const { e, i } of H) {
		run[e.v] = 0
		const x = out[e.by]
		if (!x) continue
		const k = tix(e)
		// Savior: the hero fell after attacking a teammate of the killer this turn or the turn before, in this round —
		// and that teammate was still standing (not defeated between the attack and this kill)
		if (clashes && C.some((c) => c.i < i && c.e.kind === 'attack' && c.e.out !== 'cancel' && c.e.out !== 'died' && c.e.by === e.v && mates(c.e.v, e.by) && c.e.r === e.r && k - tix(c.e) <= 1
			&& !H.some((h) => h.e.v === c.e.v && h.i > c.i && h.i < i))) x.savior!++
		// Punisher: the hero had defeated a teammate of the killer in the same turn or the one before, in this round
		if (H.some((h) => h.i < i && h.e.by === e.v && mates(h.e.v, e.by) && h.e.r === e.r && k - tix(h.e) <= 1)) x.punisher++
		if (e.r === 1) x.opening++
		// Killing Spree: the 3rd defeat in a row without falling (a fall starts the count again)
		if ((run[e.by] = (run[e.by] ?? 0) + 1) === 3) x.spree++
	}
	// Coup de Grâce: a Life win — the last defeat of a loser's hero by the winners
	if (facts.type === 'life' && facts.winner) {
		const last = [...H].reverse().find((h) => team[h.e.by] === facts.winner && team[h.e.v] && team[h.e.v] !== facts.winner)
		if (last && out[last.e.by]) out[last.e.by].coup = 1
	}
	if (clashes) {
		// a round survived after defending: 2+ from one enemy = Denied (once per enemy), from 2+ enemies = Breakwater
		const fell = new Set(H.map((h) => `${h.e.v}|${h.e.r}`))
		const held: Record<string, string[]> = {}
		for (const { e } of C) if (e.out === 'defended' && out[e.v]) (held[`${e.v}|${e.r}`] ??= []).push(e.by)
		for (const [k, bys] of Object.entries(held)) {
			if (fell.has(k)) continue
			const v = k.split('|')[0], n: Record<string, number> = {}
			for (const b of bys) n[b] = (n[b] ?? 0) + 1
			out[v].denied! += Object.values(n).filter((c) => c >= 2).length
			if (Object.keys(n).length >= 2) out[v].breakwater!++
		}
		// Last Stand: an attack defended while their team's Life was down to its last, and still standing at the
		// round's end — once a round
		if (facts.lifeMax) {
			const life: Record<string, number> = { orange: facts.lifeMax, blue: facts.lifeMax }
			const stood = new Set<string>()
			for (const e of ev) {
				if (e.k === 'hero' && team[e.v]) life[team[e.v]] -= e.l ?? 0
				if (e.k === 'clash' && e.kind === 'attack' && e.out === 'defended' && out[e.v] && life[team[e.v]] <= 1) stood.add(`${e.v}|${e.r}`)
			}
			for (const k of stood) if (!fell.has(k)) out[k.split('|')[0]].lastStand!++
		}
	}
	// Clean Sweep: 3+ enemy minions defeated or removed in one turn · Fast Start: a team out-killing its own size in minions in round 1
	const turnMin: Record<string, number> = {}, early: Record<string, number> = {}
	for (const e of ev) if ((e.k === 'minion' || e.k === 'mrem') && out[e.by]) {
		if (e.k === 'mrem' && e.team === team[e.by]) continue // taking off your own minion is no feat
		const k = `${e.by}|${e.r}|${e.t}`
		if ((turnMin[k] = (turnMin[k] ?? 0) + 1) === 3) out[e.by].sweep++
		if (e.k === 'minion' && e.r === 1) early[team[e.by]] = (early[team[e.by]] ?? 0) + 1
	}
	for (const t of ['orange', 'blue'] as Team[]) {
		const ids = Object.keys(team).filter((id) => team[id] === t)
		if (ids.length && (early[t] ?? 0) > ids.length) for (const id of ids) if (out[id]) out[id].fastStart = 1
	}
}

/** One game, ready to count — or null when the row can't say who won or who played. */
export function gameOfRow(row: GameRowIn): LeagueGame | null {
	const d = row.data ?? {}
	const winner = (row.winner ?? d.final?.wonBy?.team) as Team | null
	if (winner !== 'orange' && winner !== 'blue') return null
	const j = journalOfRow(row)
	const exact = statsFromJournal(j)
	const endCards = (d.final?.cards ?? {}) as Record<string, { coins?: number; level?: number; upgrade?: unknown[]; ultimate?: boolean }>
	const keyOf = new Map<string, string>()
	const players: GamePlayer[] = []
	const teamOfId: Record<string, Team> = {}
	for (const [id, p] of Object.entries((d.players ?? {}) as Record<string, { name: string; seat: number; hero: string; team?: Team }>))
		if (p?.hero && p.name) teamOfId[id] = exact?.players.find((x) => x.id === id)?.team ?? p.team ?? (p.seat < Math.floor((d.seats || 2) / 2) ? 'orange' : 'blue')
	const xs = exact ? extrasOf(d.ev, (d.evv ?? 0) >= 2, teamOfId, { lifeMax: d.lifeMax, winner, type: winType(row.reason ?? d.final?.wonBy?.reason) }) : null
	// the brink: the battle zone on a team's own beach (Atlanteans: lane 0, Titans: lane 2), or its Life down to 1
	const snaps = [...(Array.isArray(d.turns) ? d.turns : []), ...(d.final ? [d.final] : [])] as { lane?: number; life?: Record<Team, number> }[]
	const brinkOf = (t: Team) => snaps.some((x) => x.lane === (t === 'orange' ? 0 : 2) || (x.life?.[t] != null && x.life[t] <= 1))
	for (const [id, p] of Object.entries((d.players ?? {}) as Record<string, { name: string; seat: number; hero: string; team?: Team; color?: string }>)) {
		if (!p?.hero || !p.name) continue
		const st = exact?.players.find((x) => x.id === id)
		if (exact && !st) continue // a seat taken over mid-game: the report counts its last owner
		const team: Team = st?.team ?? p.team ?? (p.seat < Math.floor((d.seats || 2) / 2) ? 'orange' : 'blue')
		const end = endCards[id]
		const level = st?.level ?? (end ? 1 + (end.upgrade?.length ?? 0) + (end.ultimate ? 1 : 0) : 1)
		const steps = (d.builds?.[id] ?? null) as BuildStep[] | null
		const shown = canonName(p.name)
		const key = playerKey(shown)
		keyOf.set(id, key)
		players.push({
			key, name: shown, color: p.color ?? '', id, hero: p.hero, team, won: team === winner, level,
			coins: st?.coins ?? (end ? (end.coins ?? 0) + levelsPaid(level) : null),
			kills: st?.kills ?? null, deaths: st?.deaths ?? null, assists: st?.assists ?? null, minions: st?.minions ?? null,
			mRoles: exact ? minionRoles(d.ev, id) : null,
			x: xs?.[id] ?? null,
			ultRound: (steps ?? []).find((b) => b.ult)?.r ?? null,
			brink: team === winner && brinkOf(team),
			path: steps?.length ? pathOfSteps(p.hero, steps) : pathOfFinal(p.hero, end)
		})
	}
	if (players.length < 2) return null
	const defeats = exact
		? ((d.ev ?? []) as GameEvent[]).filter((e): e is Extract<GameEvent, { k: 'hero' }> => e.k === 'hero' && keyOf.has(e.by) && keyOf.has(e.v))
			.map((e) => ({ by: keyOf.get(e.by)!, v: keyOf.get(e.v)!, a: e.a.filter((x) => keyOf.has(x)).map((x) => keyOf.get(x)!), r: e.r ?? 0, t: e.t ?? 0 }))
		: []
	const at = Date.parse(row.ended_at) || Date.parse(row.started_at) || 0
	const minutes = exact?.minutes ?? Math.max(1, Math.round((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 60000) || 0)
	return { id: row.id, room: row.room ?? '', side: Math.max(1, ...(['orange', 'blue'] as Team[]).map((t) => players.filter((p) => p.team === t).length)), clashes: (d.evv ?? 0) >= 2, startedAt: Date.parse(row.started_at) || at, at, minutes, rounds: row.rounds ?? d.final?.round ?? 0, winner, type: winType(row.reason ?? d.final?.wonBy?.reason), players, defeats, events: !!exact }
}

// ── table games (LEGACY): a report of a game played at the table → a game to count ───────────────────
/** A table game's seat as the report keeps it: the player, the hero (by name), and the old score sheet's numbers. */
export type LegacySeat = { name: string; hero: string; k?: number | null; d?: number | null; a?: number | null; mk?: number | null; gold?: number | null; lv?: number | null }
export type LegacyIn = { id: string; date: string; red: LegacySeat[]; blue: LegacySeat[]; winner: 'red' | 'blue' | 'none'; winnerNote?: string; condition?: string; match?: number | null; deleted?: boolean }
const HERO_ALIAS: Record<string, string> = { trinket: 'trinkets', 'widget and pyro': 'widget', xagartha: 'xargatha', nebkherr: 'nebkher', 'neb kher': 'nebkher', rowena: 'rowenna', tc: 'tigerclaw', 'silver arrow': 'silverarrow' }
/** A hero by the name a report uses (case, spacing and the usual misspellings forgiven) → its id, or ''. */
export function heroIdOfName(name: string): string {
	const k = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
	const n = HERO_ALIAS[k] ?? k
	return HEROES.find((h) => h.name.toLowerCase() === n || h.id === n)?.id ?? ''
}
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
/** How a table game was won, in the league's words (Wave Push / Forfeit / anything else = other). */
const legacyType = (c: string | undefined): WinType => /lane push|throne/i.test(c ?? '') ? 'throne' : /last push|final/i.test(c ?? '') ? 'final' : /life/i.test(c ?? '') ? 'life' : 'other'
/** A table game that does not count: no winner (cancelled), or declared void ("doesn't count", DQ). */
export const legacyVoid = (r: LegacyIn) => r.deleted || r.winner === 'none' || /doesn.?t count|not count|\bDQ\b|disqualif|void/i.test(r.winnerNote ?? '')
/** One table game, ready to count — or null when it doesn't (see legacyVoid) or can't name two heroes. */
export function gameOfReport(r: LegacyIn): LeagueGame | null {
	if (!r?.id || legacyVoid(r)) return null
	const winner: Team = r.winner === 'red' ? 'orange' : 'blue'
	const day = Date.parse(`${r.date}T12:00:00Z`) || 0
	const at = day + (r.match ?? 1) * 60000 // games of one day keep their order
	const players: GamePlayer[] = []
	for (const [side, team] of [['red', 'orange'], ['blue', 'blue']] as const) for (const st of r[side] ?? []) {
		const hero = heroIdOfName(st.hero), name = canonName((st.name ?? '').trim().replace(/[?!]+$/, ''))
		if (!hero || !name) continue
		const k = num(st.k), d = num(st.d)
		players.push({ key: playerKey(name), name, color: '', id: `${side}:${playerKey(name)}`, hero, team, won: team === winner, level: num(st.lv) ?? 0,
			coins: num(st.gold), kills: k, deaths: d, assists: k != null && d != null ? num(st.a) : null, minions: num(st.mk), mRoles: null,
			x: null, ultRound: null, brink: false, path: { cards: [], ult: false, ordered: false } })
	}
	if (players.length < 2) return null
	const side = Math.max(1, ...(['orange', 'blue'] as Team[]).map((t) => players.filter((p) => p.team === t).length))
	return { id: r.id, room: '', side, clashes: false, startedAt: at, at, minutes: 0, rounds: 0, winner, type: legacyType(r.condition), players, defeats: [], events: false, legacy: true }
}

// ── the league ────────────────────────────────────────────────────────────────────────────────
type Tally = { games: number; wins: number }
export type Foe = { key: string; name: string; games: number; wins: number; killed: number; killedBy: number }
export type Mate = { key: string; name: string; games: number; wins: number }
export type PathTally = { hero: string; path: Path; games: number; wins: number; by: string[] }
/** Someone else at the table in one game, as the player's log shows them. */
export type TableMate = { key: string; name: string; hero: string; level: number; k: number | null; d: number | null; a: number | null; m?: number | null }
/** One game from one player's side — everything the player log shows for it. */
export type MatchLine = { id: string; at: number; startedAt: number; room: string; minutes: number; hero: string; team: Team; won: boolean; type: WinType; rounds: number; level: number
	k: number | null; d: number | null; a: number | null; minions: number | null; mRoles: GamePlayer['mRoles']; coins: number | null; path: Path
	mates: TableMate[]; foes: TableMate[]
	/** who they defeated / who defeated them / whose defeats they assisted — round and turn */
	kills: { name: string; r: number; t: number }[]; deaths: { name: string; r: number; t: number }[]; assisted: { name: string; r: number; t: number }[]
	x: Extras | null; ultRound: number | null; brink: boolean
	rating: number; delta: number
	/** a table game */
	legacy?: boolean }
export type PlayerAgg = {
	key: string
	name: string
	/** their latest colour (a PLAYER_COLORS id; '' if never recorded) */
	color: string
	games: number
	wins: number
	losses: number
	rating: number
	/** the rating after each of their games, the first point = 1200 before any */
	ratingHist: number[]
	streak: number
	bestStreak: number
	worstStreak: number
	byType: Record<WinType, Tally>
	kills: number
	deaths: number
	assists: number
	/** games with kill / death / assist numbers */
	kdaGames: number
	/** their team's hero defeats in those games (kill participation = (kills + assists) / teamKills) */
	teamKills: number
	minions: number
	coins: number
	coinGames: number
	levels: number
	/** games with a known level (table games may not have one) */
	levelGames: number
	heroes: Record<string, Tally>
	roles: Record<string, number>
	mates: Mate[]
	foes: Foe[]
	paths: PathTally[]
	history: MatchLine[]
	firstAt: number
	lastAt: number
	peak: number
	minutes: number
	rounds: number
	ults: number
	maxLevel: number
	mRoles: { melee: number; ranged: number; heavy: number }
	/** the Extras added up, and how many games each kind rests on */
	ex: Record<keyof Extras, number>
	xGames: number
	clashGames: number
	/** won without falling / without a hero defeat (games with events) · won from the brink · fastest ultimate (round) */
	flawless: number
	brinks: number
	fastUlt: number | null
}
export type HeroAgg = { hero: string; games: number; wins: number; players: Record<string, number>; paths: PathTally[]
	/** K / D / A over the games recorded with events, coins over the games with a final card state, minions over the games that kept them */
	kills: number; deaths: number; assists: number; kdaGames: number; coins: number; coinGames: number; minions: number; mGames: number
	byType: Record<WinType, Tally>
	/** other heroes: on its side (`mates`) / against it (`foes`), as games + this hero's wins */
	mates: Record<string, Tally>; foes: Record<string, Tally>
	/** how much better its players do on it than they do overall (win-rate points; players with 2+ games) */
	impact: number | null; impactN: number }
/** An award: who holds it now (everyone tied at the top), with what. `scope` game = the best single game,
 *  career = the most over every game. `hidden` = not shown yet (the 4 v 4 / 5 v 5 ones). `extra` = one of the
 *  MOBA extras, beyond the user's list. No holders = still up for grabs. */
export type Award = { id: string; title: string; blurb: string; scope: 'game' | 'career'; holders: { key: string; name: string; team?: Team; won?: boolean; hero?: string }[]; value: string; at?: number; hidden?: boolean; extra?: boolean }
export type League = { games: LeagueGame[]; players: PlayerAgg[]; heroes: HeroAgg[]; awards: Award[]; withEvents: number; withClashes: number }

export const START_RATING = 1200
/** Elo K: bigger swings while a player is new (their first PROVISIONAL games), so they find their level faster */
export const K = 32, K_NEW = 48, PROVISIONAL = 10
export const kFor = (gamesBefore: number) => (gamesBefore < PROVISIONAL ? K_NEW : K)
/** one player's rating change: their own rating against the enemy team's average */
export const eloDelta = (own: number, foes: number, won: boolean, gamesBefore: number) =>
	Math.round(kFor(gamesBefore) * ((won ? 1 : 0) - 1 / (1 + 10 ** ((foes - own) / 400))))
const ZERO_EX: Record<keyof Extras, number> = { firstBlood: 0, wipe: 0, shutdowns: 0, paybacks: 0, multis: 0, aces: 0, heavies: 0, bounty: 0, giants: 0, defends: 0, defDied: 0, noDefDied: 0, beatDefended: 0, relentless: 0, savior: 0, punisher: 0, coup: 0, denied: 0, breakwater: 0, lastStand: 0, sweep: 0, opening: 0, fastStart: 0, spree: 0, pacifist: 0 }
const heroTraits = (id: string) => (HEROES.find((h) => h.id === id)?.traits ?? []) as Trait[]

export function buildLeague(rows: GameRowIn[], extra: LeagueGame[] = []): League {
	const online = rows.map((r) => { try { return gameOfRow(r) } catch { return null } }).filter((g): g is LeagueGame => !!g)
	return leagueOf([...online, ...extra])
}

/** The league over any set of games (online, table or both). */
export function leagueOf(list: LeagueGame[]): League {
	const games = [...list].sort((a, b) => a.at - b.at)
	const P = new Map<string, PlayerAgg & { _mates: Map<string, Mate>; _foes: Map<string, Foe>; _paths: Map<string, PathTally> }>()
	const H = new Map<string, HeroAgg & { _paths: Map<string, PathTally> }>()
	const get = (gp: GamePlayer) => {
		let p = P.get(gp.key)
		if (!p) {
			p = { key: gp.key, name: gp.name, color: '', games: 0, wins: 0, losses: 0, rating: START_RATING, ratingHist: [START_RATING], streak: 0, bestStreak: 0, worstStreak: 0,
				byType: { throne: { games: 0, wins: 0 }, final: { games: 0, wins: 0 }, life: { games: 0, wins: 0 }, other: { games: 0, wins: 0 } },
				kills: 0, deaths: 0, assists: 0, kdaGames: 0, teamKills: 0, minions: 0, coins: 0, coinGames: 0, levels: 0, levelGames: 0, heroes: {}, roles: {},
				mates: [], foes: [], paths: [], history: [], firstAt: 0, lastAt: 0, peak: START_RATING, minutes: 0, rounds: 0, ults: 0, maxLevel: 0, mRoles: { melee: 0, ranged: 0, heavy: 0 },
					ex: { ...ZERO_EX }, xGames: 0, clashGames: 0, flawless: 0, brinks: 0, fastUlt: null, _mates: new Map(), _foes: new Map(), _paths: new Map() }
			P.set(gp.key, p)
		}
		p.name = gp.name // the latest spelling
		if (gp.color) p.color = gp.color
		return p
	}
	const addPath = (m: Map<string, PathTally>, gp: GamePlayer) => {
		if (!gp.path.cards.length && !gp.path.ult) return
		const k = `${gp.hero}|${pathKey(gp.path)}`
		const t = m.get(k) ?? { hero: gp.hero, path: gp.path, games: 0, wins: 0, by: [] }
		t.games++
		if (gp.won) t.wins++
		if (!t.by.includes(gp.name)) t.by.push(gp.name)
		if (gp.path.ordered) t.path = gp.path // prefer an ordered example of the same build
		m.set(k, t)
	}
	for (const g of games) {
		// rating: everyone's rating and games BEFORE this game (so the order players are listed in can't matter)
		const avg = (t: Team) => { const ps = g.players.filter((x) => x.team === t).map((x) => get(x).rating); return ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length) }
		const foeAvg: Record<Team, number> = { orange: avg('blue'), blue: avg('orange') }
		const before = new Map(g.players.map((x) => [x.key, { r: get(x).rating, n: get(x).games }]))
		for (const gp of g.players) {
			const p = get(gp)
			const b = before.get(gp.key)!
			const delta = eloDelta(b.r, foeAvg[gp.team], gp.won, b.n)
			p.rating += delta
			p.ratingHist.push(p.rating)
			p.games++
			if (gp.won) { p.wins++; p.streak = p.streak > 0 ? p.streak + 1 : 1 } else { p.losses++; p.streak = p.streak < 0 ? p.streak - 1 : -1 }
			p.bestStreak = Math.max(p.bestStreak, p.streak)
			p.worstStreak = Math.min(p.worstStreak, p.streak)
			p.byType[g.type].games++
			if (gp.won) p.byType[g.type].wins++
			if (gp.kills != null && gp.deaths != null) { p.kills += gp.kills; p.deaths += gp.deaths; p.assists += gp.assists ?? 0; p.minions += gp.minions ?? 0; p.kdaGames++; p.teamKills += g.players.filter((o) => o.team === gp.team).reduce((n, o) => n + (o.kills ?? 0), 0) }
			if (gp.coins != null) { p.coins += gp.coins; p.coinGames++ }
			if (gp.level > 0) { p.levels += gp.level; p.levelGames++ }
			p.heroes[gp.hero] = { games: (p.heroes[gp.hero]?.games ?? 0) + 1, wins: (p.heroes[gp.hero]?.wins ?? 0) + (gp.won ? 1 : 0) }
			for (const t of heroTraits(gp.hero)) p.roles[t] = (p.roles[t] ?? 0) + 1
			p.lastAt = Math.max(p.lastAt, g.at)
			p.firstAt = p.firstAt ? Math.min(p.firstAt, g.at) : g.at
			p.peak = Math.max(p.peak, p.rating)
			p.minutes += g.minutes
			p.rounds += g.rounds
			if (gp.path.ult) p.ults++
			p.maxLevel = Math.max(p.maxLevel, gp.level)
			if (gp.mRoles) { p.mRoles.melee += gp.mRoles.melee; p.mRoles.ranged += gp.mRoles.ranged; p.mRoles.heavy += gp.mRoles.heavy }
			if (gp.x) {
				p.xGames++
				if (gp.x.defends != null) p.clashGames++
				for (const k of Object.keys(ZERO_EX) as (keyof Extras)[]) p.ex[k] += gp.x[k] ?? 0
			}
			if (gp.won && gp.deaths === 0) p.flawless++
			if (gp.brink) p.brinks++
			if (gp.ultRound != null) p.fastUlt = p.fastUlt == null ? gp.ultRound : Math.min(p.fastUlt, gp.ultRound)
			for (const o of g.players) {
				if (o.key === gp.key) continue
				if (o.team === gp.team) {
					const m = p._mates.get(o.key) ?? { key: o.key, name: o.name, games: 0, wins: 0 }
					m.games++; if (gp.won) m.wins++; m.name = o.name
					p._mates.set(o.key, m)
				} else {
					const f = p._foes.get(o.key) ?? { key: o.key, name: o.name, games: 0, wins: 0, killed: 0, killedBy: 0 }
					f.games++; if (gp.won) f.wins++; f.name = o.name
					for (const dd of g.defeats) { if (dd.by === gp.key && dd.v === o.key) f.killed++; if (dd.by === o.key && dd.v === gp.key) f.killedBy++ }
					p._foes.set(o.key, f)
				}
			}
			addPath(p._paths, gp)
			const nameOf = (k: string) => g.players.find((o) => o.key === k)?.name ?? k
			const at = (x: { r: number; t: number }) => ({ r: x.r, t: x.t })
			const mate = (o: GamePlayer): TableMate => ({ key: o.key, name: o.name, hero: o.hero, level: o.level, k: o.kills, d: o.deaths, a: o.assists, m: o.minions })
			p.history.push({ id: g.id, at: g.at, startedAt: g.startedAt, room: g.room, minutes: g.minutes, hero: gp.hero, team: gp.team, won: gp.won, type: g.type, rounds: g.rounds, level: gp.level,
				k: gp.kills, d: gp.deaths, a: gp.assists, minions: gp.minions, mRoles: gp.mRoles, coins: gp.coins, path: gp.path,
				mates: g.players.filter((o) => o.team === gp.team && o.key !== gp.key).map(mate),
				foes: g.players.filter((o) => o.team !== gp.team).map(mate),
				kills: g.defeats.filter((x) => x.by === gp.key).map((x) => ({ name: nameOf(x.v), ...at(x) })),
				deaths: g.defeats.filter((x) => x.v === gp.key).map((x) => ({ name: nameOf(x.by), ...at(x) })),
				assisted: g.defeats.filter((x) => x.a.includes(gp.key)).map((x) => ({ name: nameOf(x.v), ...at(x) })),
				x: gp.x, ultRound: gp.ultRound, brink: gp.brink,
				rating: p.rating, delta, ...(g.legacy ? { legacy: true } : {}) })
			// heroes
			const h = H.get(gp.hero) ?? { hero: gp.hero, games: 0, wins: 0, players: {} as Record<string, number>, paths: [], _paths: new Map<string, PathTally>(),
				kills: 0, deaths: 0, assists: 0, kdaGames: 0, coins: 0, coinGames: 0, minions: 0, mGames: 0, byType: { throne: { games: 0, wins: 0 }, final: { games: 0, wins: 0 }, life: { games: 0, wins: 0 }, other: { games: 0, wins: 0 } },
				mates: {} as Record<string, Tally>, foes: {} as Record<string, Tally>, impact: null, impactN: 0 }
			h.games++; if (gp.won) h.wins++
			if (gp.kills != null && gp.deaths != null) { h.kills += gp.kills; h.deaths += gp.deaths; h.assists += gp.assists ?? 0; h.kdaGames++ }
			if (gp.coins != null) { h.coins += gp.coins; h.coinGames++ }
			if (gp.minions != null) { h.minions += gp.minions; h.mGames++ }
			h.byType[g.type].games++; if (gp.won) h.byType[g.type].wins++
			for (const o of g.players) {
				if (o.key === gp.key || o.hero === gp.hero) continue
				const t = o.team === gp.team ? h.mates : h.foes
				t[o.hero] = { games: (t[o.hero]?.games ?? 0) + 1, wins: (t[o.hero]?.wins ?? 0) + (gp.won ? 1 : 0) }
			}
			h.players[gp.name] = (h.players[gp.name] ?? 0) + 1
			addPath(h._paths, gp)
			H.set(gp.hero, h)
		}
	}
	const byPop = (a: PathTally, b: PathTally) => b.games - a.games || b.wins - a.wins
	const players = [...P.values()].map(({ _mates, _foes, _paths, ...p }) => ({
		...p,
		mates: [..._mates.values()].sort((a, b) => b.games - a.games || b.wins - a.wins),
		foes: [..._foes.values()].sort((a, b) => b.killedBy - a.killedBy || b.games - a.games),
		paths: [..._paths.values()].sort(byPop),
		history: [...p.history].reverse()
	})).sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name))
	// hero impact: each pick against its player's own overall win rate (players with 2+ games — one game says nothing)
	const wr = new Map([...P.values()].map((p) => [p.key, p.games >= 2 ? p.wins / p.games : null]))
	const imp = new Map<string, { sum: number; n: number }>()
	for (const g of games) for (const gp of g.players) {
		const base = wr.get(gp.key)
		if (base == null) continue
		const x = imp.get(gp.hero) ?? { sum: 0, n: 0 }
		x.sum += (gp.won ? 1 : 0) - base; x.n++
		imp.set(gp.hero, x)
	}
	const heroes = [...H.values()].map(({ _paths, ...h }) => {
		const x = imp.get(h.hero)
		return { ...h, paths: [..._paths.values()].sort(byPop), impact: x?.n ? Math.round((1000 * x.sum) / x.n) / 10 : null, impactN: x?.n ?? 0 }
	}).sort((a, b) => b.games - a.games || b.wins - a.wins)
	return { games, players, heroes, awards: awardsOf(games, players), withEvents: games.filter((g) => g.events).length, withClashes: games.filter((g) => g.clashes).length }
}

// ── nemesis / partner picks for one player ─────────────────────────────────────────────────────
/** The one who defeated you most (ties: the one you've faced most, then the one you lose to most). */
export const nemesisOf = (p: PlayerAgg): Foe | null =>
	[...p.foes].filter((f) => f.killedBy > 0).sort((a, b) => b.killedBy - a.killedBy || b.games - a.games || a.wins / a.games - b.wins / b.games)[0] ?? null
/** The one you defeated most. */
export const victimOf = (p: PlayerAgg): Foe | null => [...p.foes].filter((f) => f.killed > 0).sort((a, b) => b.killed - a.killed || b.games - a.games)[0] ?? null
/** The opponent you've met most (the rivalry), and the team-mate you win most with (2+ games together if any). */
export const rivalOf = (p: PlayerAgg): Foe | null => [...p.foes].sort((a, b) => b.games - a.games || b.killed + b.killedBy - (a.killed + a.killedBy))[0] ?? null
export const bestMateOf = (p: PlayerAgg): Mate | null => {
	const pool = p.mates.some((m) => m.games >= 2) ? p.mates.filter((m) => m.games >= 2) : p.mates
	return [...pool].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] ?? null
}
export const worstMateOf = (p: PlayerAgg): Mate | null => {
	const pool = p.mates.filter((m) => m.games >= 2)
	const w = [...pool].sort((a, b) => a.wins / a.games - b.wins / b.games || b.games - a.games)[0]
	return w && w.wins < w.games ? w : null
}

// ── match moments: awards given in a game each time something special happens (a player can earn one several
// times in a game); the career awards count them up ──
export const MOMENTS: { id: string; title: string; blurb: string; of: (x: Extras) => number }[] = [
	{ id: 'eye', title: 'Eye for an Eye', blurb: 'Exacted revenge! Took down the hero who last took them down', of: (x) => x.paybacks },
	{ id: 'spree', title: 'Killing Spree', blurb: 'Three hero takedowns in a row without falling', of: (x) => x.spree },
	{ id: 'rampage', title: 'Rampage!', blurb: 'Took down every enemy hero at least once in the game', of: (x) => x.wipe },
	{ id: 'relentless', title: 'Relentless', blurb: 'Came back for a hero who survived their attack, and finished the job that round', of: (x) => x.relentless ?? 0 },
	{ id: 'savior', title: 'Savior', blurb: 'Took down an enemy who had just attacked a teammate, while that teammate still stood', of: (x) => x.savior ?? 0 },
	{ id: 'punisher', title: 'Punisher', blurb: 'Avenged a fallen teammate straight away', of: (x) => x.punisher },
	{ id: 'coup', title: 'Coup de Grâce', blurb: 'Took the last Life of the enemy team', of: (x) => x.coup },
	{ id: 'denied', title: 'Denied', blurb: 'Fended off the same enemy twice in a round, and lived', of: (x) => x.denied ?? 0 },
	{ id: 'breakwater', title: 'Breakwater', blurb: 'Fended off two different enemies in a round, and lived', of: (x) => x.breakwater ?? 0 },
	{ id: 'last-stand', title: 'Last Stand', blurb: "Fended off an attack on their team's last Life, and was still standing when the round ended", of: (x) => x.lastStand ?? 0 },
	{ id: 'ace', title: 'Ace', blurb: 'Their team took down every enemy hero in a single round', of: (x) => x.aces },
	{ id: 'clean-sweep', title: 'Clean Sweep', blurb: 'Cleared three or more enemy minions in one turn', of: (x) => x.sweep },
	{ id: 'opening-strike', title: 'Opening Strike', blurb: 'Took down a hero in the very first round', of: (x) => x.opening },
	{ id: 'fast-start', title: 'Fast Start', blurb: 'Their team took more minions in the first round than it has heroes', of: (x) => x.fastStart },
	{ id: 'pacifist', title: 'Pacifist', blurb: 'Played the whole game without attacking an enemy hero', of: (x) => x.pacifist ?? 0 }
]
/** the moments one player earned in one game, each with how many times */
export const momentsOf = (x?: Extras | null) => (x ? MOMENTS.map((m) => ({ ...m, n: m.of(x) })).filter((m) => m.n > 0) : [])

// ── the awards ──────────────────────────────────────────────────────────────────────────────────
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
export function awardsOf(games: LeagueGame[], players: PlayerAgg[]): Award[] {
	const out: Award[] = []
	const heroName = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id
	type Meta = { hidden?: boolean; extra?: boolean }
	// the best single game: every player tied at the top holds it
	const game = (id: string, title: string, blurb: string, val: (gp: GamePlayer, g: LeagueGame) => number | null, fmt: (n: number) => string, m: Meta & { only?: (g: LeagueGame) => boolean } = {}) => {
		let top = 0, holders: { key: string; name: string }[] = [], at: number | undefined
		for (const g of games) {
			if (m.only && !m.only(g)) continue
			for (const gp of g.players) {
				const v = val(gp, g)
				if (v == null || v < 1 || v < top) continue
				if (v > top) { top = v; holders = []; at = g.at }
				if (!holders.some((h) => h.key === gp.key)) holders.push({ key: gp.key, name: gp.name })
				at = Math.max(at ?? 0, g.at)
			}
		}
		out.push({ id, title, blurb, scope: 'game', holders, value: holders.length ? fmt(top) : '', at: holders.length ? at : undefined, hidden: m.hidden, extra: m.extra })
	}
	// the most over a career
	const career = (id: string, title: string, blurb: string, val: (p: PlayerAgg) => number | null, fmt: (n: number, p: PlayerAgg) => string, m: Meta & { min?: number; low?: boolean } = {}) => {
		const vals = players.map((p) => ({ p, v: val(p) })).filter((x): x is { p: PlayerAgg; v: number } => x.v != null && (m.low ? true : x.v >= (m.min ?? 1)))
		const best = vals.length ? (m.low ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v))) : 0
		const top = vals.filter((x) => x.v === best)
		out.push({ id, title, blurb, scope: 'career', holders: top.map((x) => ({ key: x.p.key, name: x.p.name })), value: top.length ? fmt(best, top[0].p) : '', hidden: m.hidden, extra: m.extra })
	}
	const ex = (k: keyof Extras, clash = false) => (p: PlayerAgg) => ((clash ? p.clashGames : p.xGames) ? p.ex[k] : null)
	const kills = (gp: GamePlayer) => gp.kills

	// the killers, by size of game
	game('double-killer', 'Double-Killer', 'Most heroes taken down in one 2v2 game', kills, (n) => plural(n, 'kill'), { only: (g) => g.side === 2 })
	game('triple-killer', 'Triple-Killer', 'Most heroes taken down in one 3v3 game', kills, (n) => plural(n, 'kill'), { only: (g) => g.side === 3 })
	game('ultra-killer', 'Ultra-Killer', 'Most heroes taken down in one 4v4 game', kills, (n) => plural(n, 'kill'), { only: (g) => g.side === 4, hidden: true })
	game('mega-killer', 'Mega-Killer', 'Most heroes taken down in one 5v5 game', kills, (n) => plural(n, 'kill'), { only: (g) => g.side === 5, hidden: true })
	// careers
	career('bloodthirsty', 'The Executioner', 'Most heroes taken down, all time', (p) => (p.kdaGames ? p.kills : null), (n) => plural(n, 'kill'))
	career('respawn', 'Death Magnet', 'Fell the most times, all time', (p) => (p.kdaGames ? p.deaths : null), (n) => plural(n, 'defeat'))
	career('enabler', 'Ultimate Wingman', 'Helped take down the most heroes, all time', (p) => (p.kdaGames ? p.assists : null), (n) => plural(n, 'assist'))
	career('last-hit', 'Minion Reaper', 'Most minions taken out, all time', (p) => (p.kdaGames ? p.minions : null), (n) => plural(n, 'minion'))
	// single games
	game('iron-wall', 'Iron Wall', 'Fended off the most attacks in one game', (gp) => gp.x?.defends ?? null, (n) => plural(n, 'defence'))
	game('wingman', 'Playmaker', 'Helped take down the most heroes in one game', (gp) => gp.assists, (n) => plural(n, 'assist'))
	game('wicked-sick', 'Wicked Sick', 'Most minions taken out in one game', (gp) => gp.minions, (n) => plural(n, 'minion'))
	// defences
	career('unstoppable', 'Unstoppable!', 'Took down the most heroes who had blocked with a card', ex('beatDefended', true), (n) => plural(n, 'kill'))
	career('indomitable', 'Indomitable!', 'Fended off the most attacks, all time', ex('defends', true), (n) => plural(n, 'defence'))
	career('death-wish', 'Honorable End', 'Fell the most times without playing a card to defend', ex('noDefDied', true), (n) => plural(n, 'defeat'))
	career('swinging', 'Defiant End', 'Fell the most times after playing a card to defend', ex('defDied', true), (n) => plural(n, 'defeat'))
	// streaks and feats
	career('dominating', 'Dominating!', 'Longest run of wins in a row', (p) => p.bestStreak, (n) => `${n} in a row`, { min: 2 })
	career('cursed', 'Cursed!', 'Longest run of losses in a row', (p) => -p.worstStreak, (n) => `${n} in a row`, { min: 2 })
	career('first-blood', 'First Blood!', 'Made the first takedown of the game the most times', ex('firstBlood'), (n) => plural(n, 'first blood'))
	career('godlike', 'Godlike!', 'Won the most games without falling once', (p) => (p.kdaGames ? p.flawless : null), (n) => plural(n, 'flawless win'))
	career('rampages', 'Berserker', 'Most Rampage! awards', ex('wipe'), (n) => plural(n, 'rampage'))
	career('relentless', 'Bloodhound', 'Most Relentless awards', ex('relentless', true), (n) => `${n} Relentless`)
	career('pacifist', 'Peacekeeper', 'Most Pacifist awards', ex('pacifist', true), (n) => plural(n, 'peaceful game'))
	// whole games
	// the quickest / longest game: both teams, the winners first
	const sides = (g: LeagueGame) => [...g.players].sort((a, b) => Number(b.won) - Number(a.won)).map((p) => ({ key: p.key, name: p.name, team: p.team, won: p.won, hero: p.hero }))
	const timed = games.filter((g) => g.rounds > 0)
	const fast = [...timed].sort((a, b) => a.rounds - b.rounds || a.minutes - b.minutes)[0]
	out.push({ id: 'speedrun', title: 'Blitz', blurb: 'The quickest game on record', scope: 'game', holders: fast ? sides(fast) : [], value: fast ? `${plural(fast.rounds, 'round')} · ${hm(fast.minutes)}` : '', at: fast?.at })
	const long = [...timed].sort((a, b) => b.rounds - a.rounds || b.minutes - a.minutes)[0]
	out.push({ id: 'marathon', title: 'Long War', blurb: 'The longest game on record', scope: 'game', holders: long ? sides(long) : [], value: long ? `${plural(long.rounds, 'round')} · ${hm(long.minutes)}` : '', at: long?.at })
	// the ultimate: few ever get there
	career('ultimate', 'Transcendent', 'Reached their Ultimate the most times', (p) => p.ults, (n) => plural(n, 'ultimate'))
	// gold
	game('hoard', 'Gold Goblin', 'Most gold earned in one game', (gp) => gp.coins, (n) => plural(n, 'coin'))
	career('old-money', 'Gold Standard', 'Most gold earned, all time', (p) => (p.coinGames ? p.coins : null), (n) => plural(n, 'coin'))
	// heroes
	career('commitment', 'Hero Hopper', 'Played the most different heroes', (p) => Object.keys(p.heroes).length, (n) => plural(n, 'hero').replace('heros', 'heroes'), { min: 2 })
	career('one-trick', 'One-Trick Pony', 'Played one hero the most times', (p) => Math.max(0, ...Object.values(p.heroes).map((h) => h.games)), (n, p) => {
		const h = Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games)[0]
		return `${heroName(h[0])} × ${n}`
	}, { min: 2 })

	// ── MOBA extras ──
	const X = { extra: true }
	career('ace', 'Ace of Aces', 'Most Ace awards', ex('aces'), (n) => plural(n, 'Ace'), X)
	// careers counting the match moments
	career('guardian-angel', 'Guardian Angel', 'Most Savior awards', ex('savior', true), (n) => `${n} Savior`, X)
	career('avenging-angel', 'Avenging Angel', 'Most Punisher awards', ex('punisher'), (n) => `${n} Punisher`, X)
	career('closer', 'Last Rites', 'Most Coup de Grâce awards', ex('coup'), (n) => `${n} Coup de Grâce`, X)
	career('denied', 'Untouchable', 'Most Denied awards', ex('denied', true), (n) => `${n} Denied`, X)
	career('unbroken', 'The Unbroken', 'Most Breakwater awards', ex('breakwater', true), (n) => `${n} Breakwater`, X)
	career('clutch', 'Clutch', 'Most Last Stand awards', ex('lastStand', true), (n) => `${n} Last Stand`, X)
	career('undertow', 'Undertow', 'Most Clean Sweep awards', ex('sweep'), (n) => `${n} Clean Sweep`, X)
	career('early-bird', 'Early Bird', 'Most Opening Strike awards', ex('opening'), (n) => `${n} Opening Strike`, X)
	career('spring-tide', 'Spring Tide', 'Most Fast Start awards', ex('fastStart'), (n) => `${n} Fast Start`, X)
	career('shutdown', 'Shutdown', 'Ended the most enemy streaks of 3 takedowns', ex('shutdowns'), (n) => plural(n, 'shutdown'), X)
	career('payback', 'Payback!', 'Most Eye for an Eye awards', ex('paybacks'), (n) => `${n} Eye for an Eye`, X)
	career('two-birds', 'Two Birds, One Turn', 'Took down two heroes in one turn the most times', ex('multis'), (n) => plural(n, 'double'), X)
	career('giant-slayer', 'Giant Slayer', 'Took down the most heroes 2+ levels above them', (p) => (p.xGames && p.ex.giants ? p.ex.giants : null), (n) => plural(n, 'giant'), X)
	career('bounty-hunter', 'Bounty Hunter', 'Most gold from taking down heroes', ex('bounty'), (n) => plural(n, 'coin'), X)
	career('heavy-lifter', 'Heavy Lifter', 'Most heavy minions taken out', ex('heavies'), (n) => plural(n, 'heavy'), X)
	career('brink', 'Back from the Brink', 'Most wins from the edge of defeat (the fight on their own beach, or one Life left)', (p) => p.brinks, (n) => plural(n, 'comeback'), X)
	career('throne-breaker', 'Throne Breaker', 'Most wins by storming the enemy throne', (p) => p.byType.throne.wins, (n) => plural(n, 'throne'), X)
	career('ascended', 'Ascended', 'Reached their Ultimate the earliest', (p) => p.fastUlt, (n) => `round ${n}`, { ...X, low: true })
	game('fed', 'Fed the Enemy', 'Fell the most times in one game', (gp) => gp.deaths, (n) => plural(n, 'defeat'), X)
	career('carry', 'The Carry', "Biggest share of their team's takedowns (3+ games)", (p) => (p.kdaGames >= 3 && p.teamKills ? Math.round((100 * p.kills) / p.teamKills) : null), (n) => `${n}% of the kills`, X)
	return out
}
/** player key → the awards they hold now (titles on their card) */
export function titlesOf(L: League): Record<string, { title: string; blurb: string }[]> {
	const out: Record<string, { title: string; blurb: string }[]> = {}
	for (const a of L.awards) if (!a.hidden) for (const h of a.holders) (out[h.key] ??= []).push({ title: a.title, blurb: a.blurb })
	return out
}

// ── reading the table ───────────────────────────────────────────────────────────────────────────
// Only the parts of `data` the league reads (not the whole log or the draft), each as its own column.
const DATA_KEYS = ['seats', 'mapId', 'draftSystem', 'lifeMax', 'wavesMax', 'players', 'turns', 'final', 'ev', 'evv', 'builds'] as const
export const LEAGUE_SELECT = `id,room,started_at,ended_at,winner,reason,rounds,${DATA_KEYS.map((k) => `d_${k}:data->${k}`).join(',')}`
/** A row fetched with LEAGUE_SELECT back into the uploaded shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowOfSelect(r: any): GameRowIn {
	const data: Record<string, unknown> = {}
	for (const k of DATA_KEYS) if (r[`d_${k}`] != null) data[k] = r[`d_${k}`]
	return { id: r.id, room: r.room, started_at: r.started_at, ended_at: r.ended_at, winner: r.winner, reason: r.reason, rounds: r.rounds, data }
}
