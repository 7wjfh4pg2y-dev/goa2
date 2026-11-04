// A GAME REPLAY (GM tools, 2026-11-04) — a recorded game (`goa2_games` row, recorder evv ≥ 3) as steps, one per
// board segment: the planning of each turn, every card in turn order, the minion battle and the level-up. Each step
// carries the board after it (`p`), what moved (from → to), what it did (playbyplay's act items), the cards of that
// turn, and the scoreboard as it stood then. Built on playbyplay.story (pure, no engine import); tested in replay.test.ts.
//
// The scoreboard: the turn snapshots are taken as each turn ENDS, so inside a turn it starts from the turn before
// and adds what this turn's events paid / cost so far (hero + minion defeats); the turn's last step takes the
// snapshot itself (which also catches coins a card handed out, Life flipped by hand, a push's lane and waves).
import type { Team } from './match'
import type { GameEvent } from './recorder'
import { story, namer, actItems, type Act, type ActItem, type Story } from './playbyplay'
import { heroCards } from './cards/deck'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>
type Snap = { round: number; turn: number; life?: Record<Team, number>; waves?: number; lane?: number; cards?: Record<string, { lv: number; coins: number; played: number | null }> }

export const SEG_BATTLE = 90, SEG_LEVEL = 91
export type StepKind = 'plan' | 'act' | 'battle' | 'level'
export type TurnCard = { pid: string; card: number | null; name: string; color: string; ini: number | null }
export type Score = { life: Record<Team, number>; waves: number; lane: number; coins: Record<string, number>; lv: Record<string, number> }
export type Step = {
	n: number
	kind: StepKind
	r: number
	t: number
	/** the card acting (kind 'act') */
	pid: string | null
	card: TurnCard | null
	/** this act's position in the turn order (0-based), and how many cards the turn has */
	pos: number
	of: number
	/** the board after this step, and before it */
	p: Record<string, string>
	prev: Record<string, string>
	/** pieces that moved / came / went this step */
	moved: { id: string; from: string; to: string }[]
	came: string[]
	gone: { id: string; hex: string }[]
	/** attacks / forced discards that ended this step: attacker → target, and how */
	clashes: { by: string; v: string; out: string; kind: string }[]
	/** heroes defeated this step (their last hex) */
	fell: { id: string; hex: string }[]
	items: ActItem[]
	/** the turn's cards in turn order (who played what) */
	order: TurnCard[]
	score: Score
}
export type Replay = { st: Story; steps: Step[]; rounds: number[]; lifeMax: number }

const COLOR: Record<string, string> = { RED: 'RED', BLUE: 'BLUE', GREEN: 'GREEN', GOLD: 'GOLD', SILVER: 'SILVER', PURPLE: 'PURPLE' }

export function cardOf(hero: string, idx: number | null | undefined): Omit<TurnCard, 'pid'> {
	const c = idx == null ? undefined : heroCards(hero)[idx]
	return { card: idx ?? null, name: c?.name ?? '', color: COLOR[c?.color ?? ''] ?? '', ini: c?.initiative ?? null }
}

const kindOf = (a: Act): StepKind => (a.i === -1 ? 'plan' : a.i === SEG_BATTLE ? 'battle' : a.i === SEG_LEVEL ? 'level' : 'act')

/** The replay of a row's `data`; null when the game was recorded before the board was tracked. */
export function replayOf(data: Data): Replay | null {
	const st = story(data)
	if (!st || !st.acts.length) return null
	const nm = namer(st)
	const players = st.players
	const lifeMax = Number(data.lifeMax) || 6
	const snaps = (Array.isArray(data.turns) ? data.turns : []) as Snap[]
	const snapAt = (r: number, t: number) => snaps.find((x) => x.round === r && x.turn === t) ?? null
	const prevSnap = (r: number, t: number) => {
		let best: Snap | null = null
		for (const x of snaps) if (x.round < r || (x.round === r && x.turn < t)) if (!best || x.round > best.round || (x.round === best.round && x.turn > best.turn)) best = x
		return best
	}
	const pids = Object.keys(players)
	const base = (sn: Snap | null): Score => ({
		life: { orange: sn?.life?.orange ?? lifeMax, blue: sn?.life?.blue ?? lifeMax },
		waves: sn?.waves ?? (Number(data.wavesMax) || 5),
		lane: sn?.lane ?? 1,
		coins: Object.fromEntries(pids.map((id) => [id, sn?.cards?.[id]?.coins ?? 0])),
		lv: Object.fromEntries(pids.map((id) => [id, sn?.cards?.[id]?.lv ?? 1]))
	})
	const steps: Step[] = []
	let prev: Record<string, string> = {}
	let score: Score | null = null
	let turnKey = ''
	st.acts.forEach((a, k) => {
		const key = `${a.r}-${a.t}`
		if (key !== turnKey) { score = base(prevSnap(a.r, a.t)); turnKey = key }
		const sc: Score = JSON.parse(JSON.stringify(score))
		// this step's payouts / losses
		for (const e of a.events as GameEvent[]) {
			if (e.k === 'hero') {
				sc.coins[e.by] = (sc.coins[e.by] ?? 0) + (e.c ?? 0)
				for (const x of e.a ?? []) sc.coins[x] = (sc.coins[x] ?? 0) + (e.ac ?? 0)
				const T = (players[e.v]?.team ?? e.team) as Team | null
				if (T === 'orange' || T === 'blue') sc.life[T] = Math.max(0, sc.life[T] - (e.l ?? 0))
			} else if (e.k === 'minion') sc.coins[e.by] = (sc.coins[e.by] ?? 0) + (e.role === 'heavy' ? 4 : 2)
		}
		score = sc
		const last = !st.acts.slice(k + 1).some((b) => b.r === a.r && b.t === a.t)
		const end = snapAt(a.r, a.t)
		// the turn's own snapshot: at its last step, and for lane / waves as soon as a new wave came in
		let shown: Score = sc
		if (end && last) shown = base(end)
		else if (end && st.acts.slice(0, k + 1).some((b) => b.r === a.r && b.t === a.t && b.spawned >= 3)) shown = { ...sc, lane: end.lane ?? sc.lane, waves: end.waves ?? sc.waves }
		// the turn's cards, in the order they acted (then anyone who played without acting)
		const acts = st.acts.filter((b) => b.r === a.r && b.t === a.t && b.i >= 0 && b.i < SEG_BATTLE)
		const order: TurnCard[] = []
		for (const b of acts) if (b.pid && !order.some((o) => o.pid === b.pid)) order.push({ pid: b.pid, ...cardOf(players[b.pid]?.hero ?? '', b.card ?? end?.cards?.[b.pid]?.played) })
		for (const [pid, c] of Object.entries(end?.cards ?? {})) if (c.played != null && players[pid] && !order.some((o) => o.pid === pid)) order.push({ pid, ...cardOf(players[pid].hero, c.played) })
		const p = a.p ?? {}
		const moved: Step['moved'] = [], came: string[] = [], gone: Step['gone'] = []
		if (k > 0) {
			for (const [id, hex] of Object.entries(p)) { const was = prev[id]; if (!was) came.push(id); else if (was !== hex) moved.push({ id, from: was, to: hex }) }
			for (const [id, hex] of Object.entries(prev)) if (!(id in p)) gone.push({ id, hex })
		}
		const clashes = (a.events as GameEvent[]).flatMap((e) => (e.k === 'clash' && e.out !== 'cancel' ? [{ by: e.by, v: e.v, out: e.out, kind: e.kind }] : []))
		const fell = (a.events as GameEvent[]).flatMap((e) => (e.k === 'hero' ? [{ id: e.v, hex: prev[e.v] ?? p[e.v] ?? '' }] : [])).filter((x) => x.hex)
		const kind = kindOf(a)
		steps.push({
			n: steps.length, kind, r: a.r, t: a.t, pid: kind === 'act' ? a.pid : null,
			card: kind === 'act' && a.pid ? { pid: a.pid, ...cardOf(players[a.pid]?.hero ?? '', a.card) } : null,
			pos: kind === 'act' ? acts.indexOf(a) : -1, of: acts.length,
			p, prev: k > 0 ? prev : p, moved, came, gone, clashes, fell,
			items: actItems(st, a, nm), order, score: shown
		})
		prev = p
	})
	return { st, steps, rounds: [...new Set(steps.map((s) => s.r))], lifeMax }
}

/** A step's heading: "Round 2 · Turn 3 · Card 2 of 4" / "… · Cards revealed" / "Round 2 · Minion battle" / "… · Level up". */
export function stepLabel(s: Step): string {
	if (s.kind === 'battle') return `Round ${s.r} · Minion battle`
	if (s.kind === 'level') return `Round ${s.r} · Level up`
	if (s.kind === 'plan') return `Round ${s.r} · Turn ${s.t} · ${s.r === 1 && s.t === 1 ? 'Setup' : 'Planning'}`
	return `Round ${s.r} · Turn ${s.t} · Card ${s.pos + 1} of ${s.of}`
}
