// MATCH REPORTS — the group's weekly game report, in the template they already post:
//
//   🛡️ Guards of Atlantis II — Weekly Game Report / 📅 date / ⚔️ Match n — NvN / both teams (player → hero) /
//   🏆 winner / 🎯 win condition / 🌊 wave / 📝 highlights
//
// Two kinds: ONLINE (drafted from a game in `goa2_games` — teams, winner, how, waves, and highlights read off the
// game's events — then editable) and IRL (a table game, typed in by a GM). Both live in the Supabase table
// `goa2_reports` (one row per report, `data` = the Report). IRL games never reach
// `goa2_games`; the Hall counts them as LEGACY games (league.ts gameOfReport): their own player records and
// awards, and in the combined hero stats.
// Pure: tested in reports.test.ts. Red = the Atlanteans (orange), Blue = the Titans (blue), as the group says it.
import type { GameNote, Team } from './match'
import type { BuildStep, GameEvent } from './recorder'
import type { GameRowIn } from './league'
import { heroById } from './heroes'
import { teamName, teamAdj, placeName } from './teams'
import { story, namer, enemyTime, zoneTime, tokenCounts } from './playbyplay'

/** A seat: the player and the hero (by name). Table games imported from the old score sheets also carry
 *  their numbers (kills, deaths, assists, minions, gold, level) — the Hall's LEGACY records count them. */
export type ReportSeat = { name: string; hero: string; k?: number | null; d?: number | null; a?: number | null; mk?: number | null; gold?: number | null; lv?: number | null }
export type ReportWinner = 'red' | 'blue' | 'none'
export type Report = {
	id: string
	kind: 'online' | 'irl'
	/** the `goa2_games` id an online report belongs to */
	gameId?: string
	/** YYYY-MM-DD (the local day it was played) */
	date: string
	match: number | null
	red: ReportSeat[]
	blue: ReportSeat[]
	winner: ReportWinner
	/** after the winner, e.g. "but it doesn't count" */
	winnerNote: string
	condition: string
	wave: number | null
	/** free text, as typed (the draft writes one "- " line per highlight) */
	highlights: string
	/** soft delete (the public key can't delete rows) */
	deleted?: boolean
	updatedAt?: number
}

/** The win conditions the group uses (any other text is fine too). */
export const CONDITIONS = ['Lane Push', 'Last Push', 'Wave Push', 'Life Counters', 'Forfeit', 'Game cancelled'] as const

export const REPORT_TABLE = 'goa2_reports'
/** the lane's zones, Atlantean end first (battle.ts LANE — repeated here so the stats page doesn't pull in the engine) */
const LANE = ['Orange Beach', 'Center', 'Blue Beach'] as const
export const reportIdOf = (gameId: string) => `online:${gameId}`
export const newIrlId = () => `irl:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const sideOf = (t: Team): ReportWinner => (t === 'orange' ? 'red' : 'blue')
const pad = (n: number) => String(n).padStart(2, '0')
/** A time → the local day, YYYY-MM-DD. */
export const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
/** YYYY-MM-DD → DD.MM.YYYY (how the group writes it). */
export const dotDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso ?? '' }

/** How an online game was won, in the group's words. */
export function conditionOf(reason: string | null | undefined): string {
	const r = reason ?? ''
	if (/throne/i.test(r)) return 'Lane Push'
	if (/final push/i.test(r)) return 'Last Push'
	if (/life/i.test(r)) return 'Life Counters'
	return r
}

/** The report as text, ready to paste into the group chat. */
export function reportText(r: Report): string {
	const seat = (s: ReportSeat) => `- [${s.name.trim() || '?'}] → [${s.hero.trim() || '?'}]`
	const win = r.winner === 'none' ? 'Nobody' : `[${r.winner === 'red' ? 'Red' : 'Blue'}] Team`
	const note = r.winnerNote.trim()
	const lines = [
		'🛡️ Guards of Atlantis II — Weekly Game Report',
		`📅 [${dotDate(r.date)}]`,
		`⚔️ Match [${r.match ?? '#'}] — [${r.red.length}]v[${r.blue.length}]`,
		'🔴 Red Team (Atlanteans)',
		...r.red.map(seat),
		'🔵 Blue Team (Titans)',
		...r.blue.map(seat),
		`🏆 Winner: ${win}${note ? ` — ${note}` : ''}`,
		`🎯 Win condition: [${r.condition.trim() || '?'}]`
	]
	if (r.wave != null) lines.push(`🌊 Wave: ${r.wave}`)
	lines.push('📝 Highlights:')
	const hl = r.highlights.replace(/\s+$/, '')
	if (hl) lines.push(hl)
	return lines.join('\n')
}

/** Match numbers: the order of the games played on the same day (by start time). */
export function matchNumbers(games: { id: string; at: number }[]): Record<string, number> {
	const byDay = new Map<string, { id: string; at: number }[]>()
	for (const g of games) { const d = dayOf(g.at); byDay.set(d, [...(byDay.get(d) ?? []), g]) }
	const out: Record<string, number> = {}
	for (const list of byDay.values()) [...list].sort((a, b) => a.at - b.at).forEach((g, i) => (out[g.id] = i + 1))
	return out
}

type RowPlayer = { name: string; hero: string; seat: number; team?: Team }
type Snap = { round: number; turn: number; waves?: number; lane?: number }

/** An online game's report, drafted from its row in `goa2_games`. */
export function draftReport(row: GameRowIn, match: number | null): Report {
	const d = row.data ?? {}
	const players = (d.players ?? {}) as Record<string, RowPlayer>
	const half = Math.floor((d.seats || 2) / 2)
	const teamOf = (p: RowPlayer): Team => p.team ?? (p.seat < half ? 'orange' : 'blue')
	const seats = (t: Team) => Object.values(players).filter((p) => p?.hero && p.name && teamOf(p) === t).sort((a, b) => a.seat - b.seat)
		.map((p) => ({ name: p.name.trim(), hero: heroById(p.hero)?.name ?? p.hero }))
	const won = (row.winner ?? d.final?.wonBy?.team) as Team | null
	return {
		id: reportIdOf(row.id), kind: 'online', gameId: row.id,
		date: dayOf(Date.parse(row.started_at) || Date.parse(row.ended_at) || Date.now()),
		match,
		red: seats('orange'), blue: seats('blue'),
		winner: won === 'orange' || won === 'blue' ? sideOf(won) : 'none', winnerNote: '',
		condition: conditionOf(row.reason ?? d.final?.wonBy?.reason),
		wave: typeof d.wavesMax === 'number' && d.wavesMax > 0 ? d.wavesMax : null,
		highlights: draftHighlights(row).map((l) => `- ${l}`).join('\n')
	}
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The highlights the app can see: first blood and kills, blocked attacks, every wave pushed, the minion
 *  leader, heavies, ultimates, and how it ended. The human story (tactics, banter) is the editor's job. */
export function draftHighlights(row: GameRowIn): string[] {
	const d = row.data ?? {}
	const players = (d.players ?? {}) as Record<string, RowPlayer>
	const half = Math.floor((d.seats || 2) / 2)
	const hero = (id: string) => heroById(players[id]?.hero ?? '')?.name ?? players[id]?.hero ?? 'someone'
	const who = (id: string) => `${players[id]?.name?.trim() || 'someone'}'s ${hero(id)}`
	const teamOfId = (id: string): Team => players[id]?.team ?? ((players[id]?.seat ?? 0) < half ? 'orange' : 'blue')
	const ev = (Array.isArray(d.ev) ? d.ev : []) as GameEvent[]
	const out: string[] = []
	// games recorded with the board (evv ≥ 3): where everyone went, tokens, swaps, conversions, the deciding play
	const st = story(d)
	const nm = st ? namer(st) : null
	const snapsAll = (Array.isArray(d.turns) ? d.turns : []) as { round: number; turn: number; lane?: number }[]
	if (st && nm && st.from === 1) {
		const r1 = st.acts.filter((a) => a.r === 1 && a.t === 1 && a.i >= 0 && a.i < 90)
		const end = r1[r1.length - 1]
		if (end) {
			const where = Object.keys(players).filter((id) => end.p[id]).map((id) => `${hero(id)} to the ${nm.zone(end.p[id])}`)
			if (where.length) out.push(`Opening moves: ${where.join(', ')}.`)
		}
	}

	// hero kills
	const kills = ev.filter((e): e is Extract<GameEvent, { k: 'hero' }> => e.k === 'hero' && !!players[e.by] && !!players[e.v])
	const clashes = ev.filter((e): e is Extract<GameEvent, { k: 'clash' }> => e.k === 'clash' && e.kind === 'attack' && e.out !== 'cancel')
	if (!kills.length && ev.length) out.push('Not a single hero fell all game.')
	if (kills[0]) {
		const k = kills[0]
		const assist = k.a?.filter((a) => players[a]).map((a) => players[a].name.trim()) ?? []
		// blocked by the same hero earlier that round, then came back for them
		const back = clashes.some((c) => c.by === k.by && c.v === k.v && c.r === k.r && c.out === 'defended')
		out.push(`${kills.length === 1 ? 'The only kill of the game' : 'First blood'}: ${who(k.by)} took down ${who(k.v)} in round ${k.r}${back ? ' after being blocked earlier that round' : ''}${assist.length ? ` (assist ${assist.join(', ')})` : ''}.`)
	}
	if (kills.length > 1) {
		const n = new Map<string, number>()
		for (const k of kills) n.set(k.by, (n.get(k.by) ?? 0) + 1)
		out.push(`Hero kills: ${[...n].sort((a, b) => b[1] - a[1]).map(([id, c]) => `${hero(id)} ${c}`).join(' · ')}.`)
	}
	for (const e of ev) if (e.k === 'ace') out.push(`ACE! The ${teamName(e.team)} had every enemy hero down at once in round ${e.r}.`)

	// blocked attacks (and, with the board recorded, the card each block was made with)
	if (clashes.length >= 2) {
		const held = clashes.filter((c) => c.out === 'defended').length
		if (held) out.push(`${held} of the ${clashes.length} attacks in the game were blocked.`)
	}
	if (nm) {
		const blocks = new Map<string, string[]>()
		for (const e of ev) if (e.k === 'disc' && e.why === 'attack' && players[e.by]) {
			const n = nm.cardName(e.by, e.card)
			if (n) blocks.set(e.by, [...(blocks.get(e.by) ?? []), n])
		}
		for (const [id, cards] of blocks) out.push(`${who(id)} defended with ${cards.map((c) => `"${c}"`).join(', ')}.`)
	}
	if (st && nm) {
		// map control: deep in enemy ground, and holding the battle zone
		const deep = enemyTime(st).filter((x) => x.n >= 3 && players[x.pid])
		for (const x of deep.slice(0, 2)) out.push(`${who(x.pid)} spent ${plural(x.n, 'turn')} behind enemy lines, mostly in the ${placeName(x.top)}.`)
		const held = zoneTime(st, snapsAll).filter((x) => players[x.pid])
		if (held[0] && held[0].of >= 4 && held[0].n / held[0].of >= 0.5 && held[0].n !== held[1]?.n) out.push(`${who(held[0].pid)} held the battle zone for ${held[0].n} of ${held[0].of} card turns.`)
		for (const [id, m] of tokenCounts(st)) if (players[id]) {
			const list = [...m].filter(([, n]) => n >= 2).map(([t, n]) => `${n} ${t}${/s$/.test(t) ? '' : 's'}`)
			if (list.length) out.push(`${who(id)} put down ${list.join(' and ')} over the game.`)
		}
		for (const a of st.acts) {
			for (const [x, y] of a.swaps) out.push(`Round ${a.r}: ${who(x)} swapped places with ${who(y)}.`)
			for (const c of a.converts) out.push(`Round ${a.r}: ${c.token.tag.o && players[c.token.tag.o] ? who(c.token.tag.o) : 'someone'} turned ${c.minion.tag.tm === 'orange' || c.minion.tag.tm === 'blue' ? `the ${teamAdj(c.minion.tag.tm)}` : 'a'} ${c.minion.tag.ro ?? 'melee'} minion into a ${nm.token(c.token.tag)}.`)
		}
	}

	// the waves: a push shows as the waves dropping between snapshots (lane up = the Atlanteans won it)
	const snaps = [...(Array.isArray(d.turns) ? d.turns : []), ...(d.final ? [d.final] : [])] as Snap[]
	let wave = 1
	for (let i = 1; i < snaps.length; i++) {
		const a = snaps[i - 1], b = snaps[i]
		if (a.waves == null || b.waves == null || b.waves >= a.waves || a.lane == null || b.lane == null || b.lane === a.lane) continue
		const by: Team = b.lane > a.lane ? 'orange' : 'blue'
		const to = LANE[b.lane]
		const where = to === 'Center' ? 'back to the middle' : `onto the ${placeName(to).replace(/ Beach$/, ' beach')}`
		out.push(`Wave ${wave} went to the ${teamName(by)} in round ${b.round}, pushing ${where}.`)
		wave += a.waves - b.waves
	}

	// minions
	const mins = new Map<string, number>(), heavies = new Map<string, number>()
	for (const e of ev) if (e.k === 'minion' && players[e.by]) {
		mins.set(e.by, (mins.get(e.by) ?? 0) + 1)
		if (e.role === 'heavy') heavies.set(e.by, (heavies.get(e.by) ?? 0) + 1)
	}
	const top = [...mins].sort((a, b) => b[1] - a[1])
	if (top[0] && top[0][1] >= 3 && top[0][1] !== top[1]?.[1]) out.push(`${who(top[0][0])} led the minion count with ${plural(top[0][1], 'last-hit')}.`)
	for (const [id, n] of heavies) out.push(`${hero(id)} took down ${n === 1 ? 'a heavy minion' : `${n} heavy minions`}.`)

	// ultimates
	for (const [id, steps] of Object.entries((d.builds ?? {}) as Record<string, BuildStep[]>)) {
		const u = (steps ?? []).find((s) => s.ult)
		if (u && players[id]) out.push(`${who(id)} unlocked their ultimate in round ${u.r}.`)
	}

	// the finish
	const won = (row.winner ?? d.final?.wonBy?.team) as Team | null
	const r = row.rounds ?? d.final?.round
	if (won === 'orange' || won === 'blue') {
		const c = conditionOf(row.reason ?? d.final?.wonBy?.reason)
		const lost: Team = won === 'orange' ? 'blue' : 'orange'
		const inR = r ? ` in round ${r}` : ''
		if (c === 'Last Push') out.push(`The ${teamName(won)} took the Last Push${inR}.`)
		else if (c === 'Lane Push') out.push(`The ${teamName(won)} pushed into the ${teamAdj(lost)} Throne${inR}.`)
		else if (c === 'Life Counters') out.push(`The ${teamName(lost)} ran out of Life Counters${inR}.`)
		const mine = kills.filter((k) => teamOfId(k.by) === won).length, theirs = kills.filter((k) => teamOfId(k.by) === lost).length
		if (theirs > mine && c !== 'Life Counters') out.push(`The ${teamName(lost)} won the fights, but the ${teamName(won)} won the minions.`)
		// the deciding play: the last card that acted
		const last = st?.acts.filter((a) => a.i >= 0 && a.i < 90 && a.pid && players[a.pid]).pop()
		if (last && nm) { const n = nm.cardName(last.pid!, last.card); out.push(`The deciding play: ${who(last.pid!)}${n ? `'s "${n}"` : ''} in round ${last.r}, turn ${last.t}.`) }
	}
	// minions per team, round by round
	const perRound = new Map<number, Record<Team, number>>()
	for (const e of ev) if (e.k === 'minion' && players[e.by]) {
		const t = teamOfId(e.by), m = perRound.get(e.r) ?? { orange: 0, blue: 0 }
		m[t]++
		perRound.set(e.r, m)
	}
	if (perRound.size >= 2) out.push(`Minions by round: ${[...perRound].sort((a, b) => a[0] - b[0]).map(([r, m]) => `R${r} ${m.orange}–${m.blue}`).join(' · ')} (Atlanteans–Titans).`)
	// the host's notes, last, for the editor to work in
	const notes = ((Array.isArray(d.notes) ? d.notes : []) as GameNote[]).filter((n) => !n.del && n.text?.trim()).sort((a, b) => a.at - b.at)
	for (const n of notes) out.push(`Note (R${n.r} T${n.t}): ${n.text.trim()}`)
	return out
}

/** A `goa2_reports` row back into a Report (null when it isn't one). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reportOfRow(row: any): Report | null {
	const r = row?.data
	if (!r || typeof r !== 'object' || !row.id) return null
	const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
	const seats = (x: unknown): ReportSeat[] => (Array.isArray(x) ? x : []).map((s) => {
		const out: ReportSeat = { name: String(s?.name ?? ''), hero: String(s?.hero ?? '') }
		for (const k of ['k', 'd', 'a', 'mk', 'gold', 'lv'] as const) { const v = n(s?.[k]); if (v != null) out[k] = v }
		return out
	})
	return {
		id: String(row.id), kind: row.kind === 'online' ? 'online' : 'irl', gameId: row.game_id ?? r.gameId ?? undefined,
		date: String(r.date ?? row.played_on ?? ''), match: typeof r.match === 'number' ? r.match : null,
		red: seats(r.red), blue: seats(r.blue),
		winner: r.winner === 'red' || r.winner === 'blue' ? r.winner : 'none', winnerNote: String(r.winnerNote ?? ''),
		condition: String(r.condition ?? ''), wave: typeof r.wave === 'number' ? r.wave : null,
		highlights: String(r.highlights ?? ''), deleted: !!r.deleted,
		updatedAt: Date.parse(row.updated_at ?? '') || undefined
	}
}

/** A Report → a `goa2_reports` row. */
export function rowOfReport(r: Report) {
	const { updatedAt: _u, ...data } = r
	return { id: r.id, kind: r.kind, game_id: r.gameId ?? null, played_on: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null, data, updated_at: new Date().toISOString() }
}

/** Does this report mention the search text (a player, a hero, a word in the highlights)? */
export function reportMatches(r: Report, q: string): boolean {
	const s = q.trim().toLowerCase()
	if (!s) return true
	return [...r.red, ...r.blue].some((x) => x.name.toLowerCase().includes(s) || x.hero.toLowerCase().includes(s)) || r.highlights.toLowerCase().includes(s) || r.condition.toLowerCase().includes(s)
}
