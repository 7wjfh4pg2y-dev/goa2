// THE STORY OF A GAME — read off a `goa2_games` row's board shots (recorder evv ≥ 3): every card's turn as moves,
// tokens placed / gone, minions taken, swaps, conversions, blocks, and the host's notes. Two uses:
//   story(data)      → the acts, for the report's drafted highlights (reports.ts)
//   playByPlay(row)  → a round-by-round text to paste into a chat with Claude, who writes the report from it
// Pure (no engine import, so the stats page stays light); tested in playbyplay.test.ts.
import type { GameNote, LogEntry, Team } from './match'
import type { BoardShot, GameEvent, PieceTag, BuildStep } from './recorder'
import type { GameRowIn } from './league'
import { heroById } from './heroes'
import { heroCards } from './cards/deck'
import { teamName, teamAdj, placeName, aMinion } from './teams'
import { tokenName } from './tokens'
import { hexCube, cubeDist } from './zones'

type P = { name: string; hero: string; seat: number; team?: Team; color?: string }
export type Move = { id: string; from: string; to: string; dist: number }
export type Placed = { id: string; tag: PieceTag; hex: string }
export type Act = {
	r: number; t: number; i: number; pid: string | null; card: number | null; at: number
	/** heroes that moved (from → to), spawned / respawned (from ''), or left the board (to '') */
	moves: Move[]
	/** tokens that appeared / went */
	placed: Placed[]; gone: Placed[]
	/** minions that left the board (defeated or removed) */
	minionsGone: Placed[]
	/** two heroes that traded places */
	swaps: [string, string][]
	/** a minion gone and a token of `tag` on its hex in the same act */
	converts: { minion: Placed; token: Placed }[]
	/** a new wave came in (count of minions that appeared) */
	spawned: number
	events: GameEvent[]
	log: LogEntry[]
	notes: GameNote[]
	/** the board after this act */
	p: Record<string, string>
}
export type Story = {
	players: Record<string, P>
	pcs: Record<string, PieceTag>
	zones: Record<string, string>
	acts: Act[]
	/** notes not tied to an act (an older note, or one taken between acts) */
	loose: GameNote[]
	/** the round the board tracking starts in (1 = the whole game) */
	from: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>

const SEG_BATTLE = 90, SEG_LEVEL = 91
const LANE = ['Orange Beach', 'Center', 'Blue Beach'] as const
const dist = (a: string, b: string) => { try { return cubeDist(hexCube(a), hexCube(b)) } catch { return 0 } }

/** The game as acts (null when the row has no board shots — a game recorded before evv 3). */
export function story(data: Data): Story | null {
	const shots = (Array.isArray(data?.shots) ? data.shots : []) as BoardShot[]
	if (!shots.length) return null
	const players = (data.players ?? {}) as Record<string, P>
	const pcs = (data.pcs ?? {}) as Record<string, PieceTag>
	const zones = (data.zones ?? {}) as Record<string, string>
	const ev = (Array.isArray(data.ev) ? data.ev : []) as GameEvent[]
	const log = (Array.isArray(data.log) ? data.log : []) as LogEntry[]
	const notes = ((Array.isArray(data.notes) ? data.notes : []) as GameNote[]).filter((n) => !n.del && n.text?.trim())
	const acts: Act[] = []
	let prev: Record<string, string> = {}
	shots.forEach((sh, k) => {
		const p = sh.p ?? {}
		const tag = (id: string): PieceTag => pcs[id] ?? { k: 'token', tm: 'neutral' }
		const moves: Move[] = [], placed: Placed[] = [], gone: Placed[] = [], minionsGone: Placed[] = []
		let spawned = 0
		for (const [id, hex] of Object.entries(p)) {
			const t = tag(id), was = prev[id]
			if (t.k === 'hero') { if (was !== hex) moves.push({ id, from: was ?? '', to: hex, dist: was ? dist(was, hex) : 0 }) }
			else if (!was) { if (t.k === 'minion') spawned++; else placed.push({ id, tag: t, hex }) }
		}
		for (const [id, hex] of Object.entries(prev)) if (!(id in p)) {
			const t = tag(id)
			if (t.k === 'hero') moves.push({ id, from: hex, to: '', dist: 0 })
			else if (t.k === 'minion') minionsGone.push({ id, tag: t, hex })
			else gone.push({ id, tag: t, hex })
		}
		const swaps: [string, string][] = []
		for (const a of moves) for (const b of moves) if (a.id < b.id && a.from && b.from && a.to === b.from && b.to === a.from) swaps.push([a.id, b.id])
		const converts = minionsGone.flatMap((m) => placed.filter((x) => x.hex === m.hex).map((token) => ({ minion: m, token })))
		const next = shots[k + 1]
		const end = next ? next.at : Infinity
		const inAct = (e: GameEvent) => e.r === sh.r && e.t === sh.t && (e.i == null ? sh.i !== SEG_LEVEL && (sh.i === SEG_BATTLE || !shots.some((o) => o.r === sh.r && o.t === sh.t && o.i > sh.i && o.i < SEG_BATTLE)) : e.i === sh.i)
		acts.push({
			r: sh.r, t: sh.t, i: sh.i, pid: sh.pid, card: sh.card, at: sh.at, moves, placed, gone, minionsGone, swaps, converts,
			spawned: k === 0 ? 0 : spawned,
			events: ev.filter(inAct),
			log: log.filter((e) => e.at >= (k === 0 ? -Infinity : sh.at) && e.at < end),
			notes: notes.filter((n) => n.r === sh.r && n.t === sh.t && (n.i == null ? false : n.i === sh.i)),
			p
		})
		prev = p
	})
	const tied = new Set(acts.flatMap((a) => a.notes.map((n) => n.id)))
	return { players, pcs, zones, acts, loose: notes.filter((n) => !tied.has(n.id)), from: shots[0].r }
}

// ── names ─────────────────────────────────────────────────────────────────────
export function namer(st: Pick<Story, 'players' | 'zones'>) {
	const heroName = (pid: string) => heroById(st.players[pid]?.hero ?? '')?.name ?? st.players[pid]?.hero ?? 'someone'
	const who = (pid: string) => `${heroName(pid)} (${st.players[pid]?.name?.trim() || '?'})`
	const zone = (hex: string) => placeName(st.zones[hex] ?? '') || 'the board'
	const card = (pid: string, idx: number | null) => {
		if (idx == null) return ''
		const c = heroCards(st.players[pid]?.hero ?? '')[idx]
		if (!c) return ''
		const tier = c.color === 'GOLD' || c.color === 'SILVER' ? 'basic' : c.color === 'PURPLE' ? 'ultimate' : `Tier ${['I', 'II', 'III'][(c.level ?? 1) - 1] ?? c.level}`
		const col = c.color ? c.color[0] + c.color.slice(1).toLowerCase() : ''
		return `"${c.name}" (${col} ${tier}${c.initiative != null ? `, initiative ${c.initiative}` : ''}${c.primaryAction ? `, ${c.primaryAction.toLowerCase()}` : ''})`
	}
	const cardName = (pid: string, idx: number | null) => (idx == null ? '' : heroCards(st.players[pid]?.hero ?? '')[idx]?.name ?? '')
	const token = (t: PieceTag) => {
		const tk = t.tk ?? ''
		if (tk.startsWith('companion:')) return tk.slice(10) || 'companion'
		const n = tokenName(tk) || 'token'
		return n.charAt(0).toUpperCase() + n.slice(1)
	}
	const minion = (t: PieceTag) => `${teamAdj(t.tm)} ${t.ro ?? 'melee'} minion`
	return { heroName, who, zone, card, cardName, token, minion }
}

/** Which side of the map a zone belongs to ('orange' / 'blue' / null for the middle). */
export const sideOfZone = (z: string): Team | null => (/^Orange /.test(z) ? 'orange' : /^Blue /.test(z) ? 'blue' : null)
const teamOf = (st: Story, pid: string): Team | null => st.players[pid]?.team ?? (st.pcs[pid]?.tm === 'orange' || st.pcs[pid]?.tm === 'blue' ? st.pcs[pid].tm as Team : null)

/** Per hero: how many card turns ended behind enemy lines (in the other side's jungle / beach / base), and where. */
export function enemyTime(st: Story): { pid: string; n: number; top: string }[] {
	const out: { pid: string; n: number; top: string }[] = []
	for (const pid of Object.keys(st.players)) {
		const team = teamOf(st, pid)
		if (!team) continue
		const where = new Map<string, number>()
		let n = 0
		for (const a of st.acts) {
			if (a.i < 0 || a.i >= SEG_BATTLE) continue
			const hex = a.p[pid]
			const z = hex ? st.zones[hex] ?? '' : ''
			const side = sideOfZone(z)
			if (side && side !== team) { n++; where.set(z, (where.get(z) ?? 0) + 1) }
		}
		if (n) out.push({ pid, n, top: [...where].sort((x, y) => y[1] - x[1])[0][0] })
	}
	return out.sort((a, b) => b.n - a.n)
}

/** Per hero: how many card turns ended in the battle zone (the lane as it was that turn). */
export function zoneTime(st: Story, turns: { round: number; turn: number; lane?: number }[]): { pid: string; n: number; of: number } [] {
	const laneAt = (r: number, t: number) => turns.find((x) => x.round === r && x.turn === t)?.lane ?? 1
	const acts = st.acts.filter((a) => a.i >= 0 && a.i < SEG_BATTLE)
	return Object.keys(st.players).map((pid) => ({
		pid, of: acts.length,
		n: acts.filter((a) => { const h = a.p[pid]; return !!h && (st.zones[h] ?? '') === LANE[laneAt(a.r, a.t)] }).length
	})).sort((a, b) => b.n - a.n)
}

/** Tokens each player put down over the game: owner → token name → how many. */
export function tokenCounts(st: Story): Map<string, Map<string, number>> {
	const nm = namer(st)
	const out = new Map<string, Map<string, number>>()
	const seen = new Set<string>()
	for (const a of st.acts) for (const x of a.placed) {
		if (seen.has(x.id) || !x.tag.o) continue
		seen.add(x.id)
		const m = out.get(x.tag.o) ?? new Map<string, number>()
		const n = nm.token(x.tag)
		m.set(n, (m.get(n) ?? 0) + 1)
		out.set(x.tag.o, m)
	}
	return out
}

// ── the play-by-play ──────────────────────────────────────────────────────────
const PROMPT = `Write our Guards of Atlantis II weekly game report from the play-by-play below. Use this template exactly:

🛡️ Guards of Atlantis II — Weekly Game Report
📅 [DD.MM.YYYY]
⚔️ Match [n] — [N]v[N]
🔴 Red Team (Atlanteans)
- [player] → [hero]
🔵 Blue Team (Titans)
- [player] → [hero]
🏆 Winner: [Red/Blue] Team
🎯 Win condition: [Lane Push / Last Push / Life Counters]
🌊 Wave: [n]
📝 Highlights:

Highlights: 5–9 narrative bullet points in story order, like a match commentator — the opening (who grabbed minions, who went where), map control (tokens, zones held), the fights (kills, blocks, near misses), each wave swing and why, standout players, and the deciding moment of the last round. Name players with their hero ("Zara's Mrak"). Work the host's notes in — they are things the app couldn't see (misreads, fake-outs, tactics). Then two plain lines: "Minions defeated: …" and "Attacks blocked: …". Don't invent anything the play-by-play and notes don't support.`

/** The whole game as text, for pasting into a chat with Claude (it writes the report from it). */
export function playByPlay(row: GameRowIn, opts: { match?: number | null; prompt?: boolean } = {}): string {
	const d = (row.data ?? {}) as Data
	const players = (d.players ?? {}) as Record<string, P>
	const st = story(d) ?? { players, pcs: {}, zones: {}, acts: [], loose: [], from: 0 }
	const nm = namer(st)
	const ev = (Array.isArray(d.ev) ? d.ev : []) as GameEvent[]
	const turns = (Array.isArray(d.turns) ? d.turns : []) as { round: number; turn: number; waves?: number; lane?: number; life?: Record<Team, number>; cards?: Record<string, { lv: number; coins: number; played: number | null }> }[]
	const L: string[] = []
	if (opts.prompt !== false) L.push(PROMPT, '', '────────── PLAY-BY-PLAY ──────────')
	const day = new Date(Date.parse(row.started_at) || Date.now())
	const pad = (n: number) => String(n).padStart(2, '0')
	const won = (row.winner ?? d.final?.wonBy?.team) as Team | null
	L.push(`Game ${row.room ?? ''} · ${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}${opts.match ? ` · match ${opts.match} of the day` : ''}`)
	for (const T of ['orange', 'blue'] as Team[]) {
		const list = Object.entries(players).filter(([, p]) => (p.team ?? (p.seat < Math.floor((d.seats || 2) / 2) ? 'orange' : 'blue')) === T).sort((a, b) => a[1].seat - b[1].seat)
		L.push(`${T === 'orange' ? 'Red Team — the Atlanteans' : 'Blue Team — the Titans'}: ${list.map(([pid, p]) => `${p.name?.trim() || '?'} → ${nm.heroName(pid)}`).join(', ')}`)
	}
	if (won) L.push(`Result: the ${teamName(won)} won — ${d.final?.wonBy?.reason ?? row.reason ?? ''}${row.rounds ? `, round ${row.rounds}` : ''}. Waves at the start: ${d.wavesMax ?? '?'}; Life at the start: ${d.lifeMax ?? '?'} each.`)
	if (!st.acts.length) L.push('(This game was recorded before the board was tracked: only the summary below is available.)')
	else if (st.from > 1) L.push(`(The board was tracked from round ${st.from}.)`)
	L.push('')

	const builds = (d.builds ?? {}) as Record<string, BuildStep[]>
	let lastR = 0, lastT = 0
	for (const a of st.acts) {
		if (a.r !== lastR) { L.push(`══ ROUND ${a.r} ══`); lastR = a.r; lastT = 0 }
		if (a.t !== lastT && a.i < SEG_BATTLE) {
			const sn = turns.find((x) => x.round === a.r && x.turn === a.t)
			L.push(`— Turn ${a.t}${sn?.lane != null ? ` · battle zone: ${placeName(LANE[sn.lane])}` : ''}${sn?.waves != null ? ` · waves left ${sn.waves}` : ''}${sn?.life ? ` · Life: Atlanteans ${sn.life.orange}, Titans ${sn.life.blue}` : ''}`)
			lastT = a.t
		}
		const head = a.i === -1 ? (a.r === st.from && a.t === 1 ? '  Setup / planning' : '  Planning')
			: a.i === SEG_BATTLE ? '  Minion battle'
			: a.i === SEG_LEVEL ? '  Level-up step'
			: a.pid ? `  ${nm.who(a.pid)} acts${a.card != null ? ` — ${nm.card(a.pid, a.card)}` : ''}` : '  (everyone has acted)'
		const body = actLines(st, a, nm)
		if (a.i === SEG_LEVEL) for (const [pid, steps] of Object.entries(builds)) {
			const before = [...(steps ?? [])].filter((s) => s.r < a.r || (s.r === a.r && s.t < a.t)).pop()
			const after = [...(steps ?? [])].filter((s) => s.r === a.r).pop()
			if (!after || !players[pid] || (before && before.lv === after.lv && before.ult === after.ult)) continue
			const took = after.keep.filter((x) => !(before?.keep ?? []).includes(x)).map((x) => nm.cardName(pid, x)).filter(Boolean)
			body.push(`${nm.who(pid)} → level ${after.lv}${took.length ? `, took ${took.join(', ')}` : ''}${after.ult && !before?.ult ? ', UNLOCKED THE ULTIMATE' : ''}`)
		}
		if (!body.length && (a.i === -1 || a.i >= SEG_BATTLE)) continue
		L.push(head)
		for (const b of body) L.push(`    • ${b}`)
		if (!body.length) L.push('    • (no change on the board)')
	}
	if (st.loose.length) { L.push('', 'Host notes (not tied to a card):'); for (const n of st.loose) L.push(`  • R${n.r} T${n.t}: ${n.text.trim()}`) }

	// the totals
	L.push('', '══ TOTALS ══')
	const tally = (k: string, f: (e: GameEvent) => string | null) => {
		const m = new Map<string, number>()
		for (const e of ev) if (e.k === k) { const id = f(e); if (id && players[id]) m.set(id, (m.get(id) ?? 0) + 1) }
		return [...m].sort((a, b) => b[1] - a[1])
	}
	const mins = tally('minion', (e) => (e.k === 'minion' ? e.by : null))
	if (mins.length) L.push(`Minions defeated: ${mins.map(([id, n]) => `${players[id].name} ${n}`).join(', ')}`)
	const heav = tally('minion', (e) => (e.k === 'minion' && e.role === 'heavy' ? e.by : null))
	if (heav.length) L.push(`Heavy minions: ${heav.map(([id, n]) => `${players[id].name} ${n}`).join(', ')}`)
	const kills = tally('hero', (e) => (e.k === 'hero' ? e.by : null)), deaths = tally('hero', (e) => (e.k === 'hero' ? e.v : null))
	L.push(`Hero kills: ${kills.length ? kills.map(([id, n]) => `${players[id].name} ${n}`).join(', ') : 'none'}${deaths.length ? ` · defeated: ${deaths.map(([id, n]) => `${players[id].name} ${n}`).join(', ')}` : ''}`)
	const att = ev.filter((e): e is Extract<GameEvent, { k: 'clash' }> => e.k === 'clash' && e.kind === 'attack' && e.out !== 'cancel')
	if (att.length) L.push(`Attacks: ${att.length}, blocked ${att.filter((c) => c.out === 'defended').length} — ${att.map((c) => `R${c.r}T${c.t} ${players[c.by]?.name ?? '?'} → ${players[c.v]?.name ?? '?'}: ${c.out === 'defended' ? 'blocked' : c.out === 'died' ? 'defeated' : 'no answer'}`).join('; ')}`)
	for (const [pid, m] of tokenCounts(st)) if (players[pid]) L.push(`Tokens placed by ${nm.who(pid)}: ${[...m].map(([n, c]) => `${c} × ${n}`).join(', ')}`)
	const last = turns[turns.length - 1]?.cards ?? {}
	const lv = Object.entries(last).filter(([pid]) => players[pid]).map(([pid, c]) => `${players[pid].name} Lv ${c.lv}`)
	if (lv.length) L.push(`Final levels: ${lv.join(', ')}`)
	return L.join('\n')
}

/** One act as plain lines: moves, swaps, conversions, tokens, minions, kills, blocks, effects, the log, notes. */
function actLines(st: Story, a: Act, nm: ReturnType<typeof namer>): string[] {
	const out: string[] = []
	const swapped = new Set(a.swaps.flat())
	for (const [x, y] of a.swaps) out.push(`${nm.who(x)} and ${nm.who(y)} SWAPPED places (${nm.zone(a.p[x])} ↔ ${nm.zone(a.p[y])})`)
	for (const m of a.moves) {
		if (swapped.has(m.id)) continue
		if (!m.from) out.push(`${nm.who(m.id)} ${a.r === st.from && a.t === 1 && a.i === -1 ? 'spawned' : 'respawned'} at ${nm.zone(m.to)}`)
		else if (!m.to) out.push(`${nm.who(m.id)} left the board (from ${nm.zone(m.from)})`)
		else {
			const zf = nm.zone(m.from), zt = nm.zone(m.to)
			out.push(`${nm.who(m.id)} moved ${zf === zt ? `within ${zt}` : `${zf} → ${zt}`} (${m.dist} ${m.dist === 1 ? 'space' : 'spaces'} away)`)
		}
	}
	const conv = new Set(a.converts.flatMap((c) => [c.minion.id, c.token.id]))
	for (const c of a.converts) out.push(`${nm.minion(c.minion.tag)} on ${nm.zone(c.minion.hex)} was turned into a ${nm.token(c.token.tag)}${c.token.tag.o && st.players[c.token.tag.o] ? ` by ${nm.who(c.token.tag.o)}` : ''}`)
	for (const x of a.placed) if (!conv.has(x.id)) out.push(`${x.tag.o && st.players[x.tag.o] ? nm.who(x.tag.o) : 'someone'} placed a ${nm.token(x.tag)} on ${nm.zone(x.hex)}`)
	for (const x of a.gone) out.push(`a ${nm.token(x.tag)}${x.tag.o && st.players[x.tag.o] ? ` of ${nm.heroName(x.tag.o)}'s` : ''} came off ${nm.zone(x.hex)}`)
	const killed = new Set<string>()
	for (const e of a.events) {
		if (e.k === 'minion') { killed.add(e.id); out.push(`${nm.who(e.by)} defeated ${aMinion(e.team, e.role)} (+${e.role === 'heavy' ? 4 : 2} coins)`) }
		else if (e.k === 'hero') out.push(`${nm.who(e.by)} DEFEATED ${nm.who(e.v)}${e.a?.length ? ` (assist: ${e.a.map((x) => nm.who(x)).join(', ')})` : ''} — the ${teamName(e.team)} lost ${e.l} Life`)
		else if (e.k === 'clash') out.push(e.kind === 'attack'
			? `${nm.who(e.by)} attacked ${nm.who(e.v)}: ${e.out === 'defended' ? 'BLOCKED' : e.out === 'died' ? (e.disc ? 'they defended but still fell' : 'they could not defend') : e.out === 'cancel' ? 'called off' : 'no answer'}`
			: `${nm.who(e.by)} forced ${nm.who(e.v)} to discard${e.out === 'died' ? ' — they had no card and were defeated' : ''}`)
		else if (e.k === 'disc') { const n = nm.cardName(e.by, e.card); if (n) out.push(`${nm.who(e.by)} discarded "${n}"${e.why === 'attack' ? ' to defend' : e.why === 'force' ? ' (forced)' : ''}`) }
		else if (e.k === 'fx') { const n = nm.cardName(e.by, e.card); out.push(`${nm.who(e.by)} switched on the lasting effect of "${n}" (${e.dur === 'turn' ? 'this turn' : e.dur === 'next' ? 'until next turn' : 'this round'})`) }
		else if (e.k === 'ace') out.push(`ACE — every ${teamAdj(e.team === 'orange' ? 'blue' : 'orange')} hero was down`)
	}
	const removed = a.minionsGone.filter((m) => !killed.has(m.id) && !conv.has(m.id))
	if (removed.length) out.push(`${removed.length === 1 ? `${nm.minion(removed[0].tag)} was` : `${removed.length} minions were`} removed from the board${removed.length > 1 ? ` (${removed.map((m) => nm.minion(m.tag)).join(', ')})` : ''}`)
	if (a.spawned >= 3) out.push(`a new minion wave came in (${a.spawned} minions)`)
	for (const e of a.log) out.push(`log: ${e.by ? `${e.by} ` : ''}${e.text}`)
	for (const n of a.notes) out.push(`HOST NOTE: ${n.text.trim()}`)
	return out
}
