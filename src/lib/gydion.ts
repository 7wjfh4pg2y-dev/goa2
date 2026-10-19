// Gydion the Archwizard (tested in gydion.test.ts): his SPELLBOOK. Prepare Spells (his silver) puts every spell card in
// the book; only he may look inside. His other cards do nothing but cast spells named on them ("Cast the "Shield"
// spell…", "Choose and cast one…"): the spell leaves the book face up as it is cast, and its action is his. The book
// starts EMPTY (the first silver fills it). The Archwizard (ultimate): Wish waits in the book; whenever Prepare Spells
// would refill it he may cast Wish INSTEAD (the book isn't refilled) — Wish leaves the book like any spell and only an
// ordinary Prepare brings it back, so Wish · Prepare · Wish · Prepare · Wish = his team wins.
// Automated: the book, the casts (one per card; a Wish opens one more), Sunburst / Dimension Door / Midas' Touch scaling,
// Midas' coins, Energy Drain's Life counter, Find Familiar's strikes, Create Undead's minion, Vampiric Touch's retrieve,
// the forced discards of Burning Hands / Cloud Kill / Energy Drain, Shield / Invulnerability for the round, the third Wish.
// Left to the players (judgement / board moves): targets of attacks, Banishment / Suggestion / Dimension Door / Retreat moves.
import { heroCards } from './cards/deck'
import { castable, spellOf, SPELLS, type Spell } from './cards/spells'
import { statDeltas, type PlayerCardState } from './cards/cardstate'
import { zoneTable, hexCube, cubeDist } from './zones'
import { LANE, START_LANE } from './battle'

export const GY = 'gydion'
export const RE_PREPARE = /add\s+all\s+spell\s+cards\s+to\s+the\s+spellbook/i
/** the 21 spells Prepare Spells puts in the book (Wish is his ultimate's) */
export const BOOK = SPELLS.filter((s) => s.id !== 'wish').map((s) => s.id)
/** spells whose follow-up is a forced discard: what the target may discard (any card = undefined) */
export const FORCE_SPELLS: Record<string, 'basic' | 'nonbasic' | undefined> = { 'burning-hands': undefined, 'cloud-kill': 'basic', 'energy-drain': 'nonbasic' }

type Team = 'orange' | 'blue'
type Mark = string
export type GyState = {
	/** the book has been prepared at least once (it starts empty) */
	prep?: boolean
	/** every spell out of the book this cycle, in the order it left (cast or struck), face up */
	gone?: string[]
	/** the ones Find Familiar struck (also in `gone`) */
	struck?: string[]
	/** Wishes cast (the third wins) */
	wish?: number
	/** the spell cast for an acting card (`key:at`); `wish` = cast through a Wish */
	cast?: { mark: Mark; spell: string; wish?: boolean }
	/** his silver did its job for this card (Prepare or Wish) */
	silver?: Mark
	/** a Wish was cast for this card: one spell of the book may be cast now */
	wishOpen?: Mark
	/** follow-ups already used for this card */
	strike?: Mark
	raised?: Mark
	forced?: Mark
	retr?: Mark
	/** Shield (immune to basic attacks) / Invulnerability (to non-basic) for the round they were cast in */
	guard?: { round: number; spell: 'shield' | 'invulnerability' }[]
}
/** what this file reads of the match (loosely typed: match.ts passes its state) */
type Piece = { id: string; hex: string; kind?: string; team?: string; role?: string; attachedTo?: string; owner?: string }
export type GyS = {
	cards?: Record<string, PlayerCardState>
	power?: Record<string, { gy?: GyState; hit?: string } & Record<string, unknown>>
	pieces?: Record<string, Piece>
	forced?: Record<string, { by: string; die: boolean; at: number; only?: 'basic' | 'nonbasic' }>
	map?: { cells?: Record<string, string>; meta?: Record<string, { m?: string }> } | null
	lane?: number
	life?: Record<Team, number>
	lifeTok?: Record<Team, boolean[]>
	host?: string
	wonBy?: { team: Team; reason: string } | null
}
export type GyCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; revealed: boolean; teams?: Record<string, Team | null> }
export type GyReq = { pid: string; op: string; spell?: string; spells?: string[]; target?: string; hex?: string; idx?: number; on?: boolean; wish?: number }

const markOf = (ctx: GyCtx) => `${ctx.key}:${ctx.at}`
export const gyOf = (s: GyS, pid: string): GyState => s.power?.[pid]?.gy ?? {}
const isGy = (s: GyS, pid: string) => s.cards?.[pid]?.hero === GY

// ── the book ──
/** is the spell in his book now? (Wish: while he has the ultimate and it hasn't been cast this cycle) */
export function inBook(s: GyS, pid: string, id: string): boolean {
	const g = gyOf(s, pid), cs = s.cards?.[pid]
	if (!cs || cs.hero !== GY) return false
	if (id === 'wish') return !!cs.ultimate && !(g.gone ?? []).includes('wish')
	return !!g.prep && BOOK.includes(id) && !(g.gone ?? []).includes(id)
}
export const bookSpells = (s: GyS, pid: string) => [...BOOK, 'wish'].filter((id) => inBook(s, pid, id))
/** spells out of the book this cycle (cast and struck) */
export const goneSpells = (s: GyS, pid: string) => gyOf(s, pid).gone ?? []
/** "for each OTHER spell card removed from the spellbook" */
export const othersGone = (s: GyS, pid: string, id: string) => goneSpells(s, pid).filter((x) => x !== id).length

/** his card acting now (revealed, his turn), or null */
function actingCard(s: GyS, pid: string, ctx: GyCtx) {
	const cs = s.cards?.[pid]
	if (!cs || cs.hero !== GY || !ctx.revealed || ctx.order[ctx.at] !== pid || cs.pending == null || cs.pending < 0) return null
	return heroCards(GY)[cs.pending] ?? null
}
/** his silver (Prepare Spells) is the card acting and hasn't been used yet */
export const canPrepare = (s: GyS, pid: string, ctx: GyCtx) => { const c = actingCard(s, pid, ctx); return !!c && RE_PREPARE.test(c.description) && gyOf(s, pid).silver !== markOf(ctx) }
/** The Archwizard: cast Wish instead of refilling */
export const canWish = (s: GyS, pid: string, ctx: GyCtx) => canPrepare(s, pid, ctx) && inBook(s, pid, 'wish')
/** the spells he may cast right now: the acting card's (still in the book), or — after a Wish — any spell in the book */
export function castOptions(s: GyS, pid: string, ctx: GyCtx): string[] {
	const g = gyOf(s, pid), mark = markOf(ctx), c = actingCard(s, pid, ctx)
	if (!c || g.cast?.mark === mark) return []
	if (g.wishOpen === mark) return BOOK.filter((id) => inBook(s, pid, id))
	return castable(c).filter((id) => inBook(s, pid, id))
}
/** what his acting card asks of him now: prepare (his silver), cast (a casting card, nothing cast yet), or null */
export function gyMode(s: GyS, pid: string, ctx: GyCtx): 'prepare' | 'cast' | null {
	if (canPrepare(s, pid, ctx)) return 'prepare'
	return castOptions(s, pid, ctx).length ? 'cast' : null
}
/** the spells the acting card names (in the book or not) — the book shows which of them are gone */
export const cardSpells = (s: GyS, pid: string, ctx: GyCtx) => { const c = actingCard(s, pid, ctx); return c ? castable(c) : [] }
/** the spell cast for the card acting now */
export const castNow = (s: GyS, pid: string, ctx: GyCtx) => { const c = gyOf(s, pid).cast; return c && c.mark === markOf(ctx) ? c.spell : null }

// ── numbers ──
export type SpellNums = { attack?: number; range?: number; radius?: number; coins?: number; move?: number }
/** a spell's numbers as he would cast it now: the printed value + his items (his action cards only cast spells) +
 *  the scaling of Sunburst / Dimension Door / Midas' Touch */
export function spellNums(s: GyS, pid: string, id: string): SpellNums {
	const sp = spellOf(id), cs = s.cards?.[pid]
	if (!sp || !cs) return {}
	const d = statDeltas(cs), n = othersGone(s, pid, id), out: SpellNums = {}
	if (sp.primaryAction === 'ATTACK') out.attack = (sp.primaryValue ?? 0) + (d.atk ?? 0) + (id === 'sunburst' ? n : 0)
	if (sp.primaryAction === 'MOVEMENT') out.move = (sp.primaryValue ?? 0) + (d.move ?? 0)
	if (sp.modifier === 'RANGE') out.range = (sp.modifierValue ?? 0) + (d.range ?? 0) + (id === 'sunburst' ? n : 0)
	if (sp.modifier === 'AREA') out.radius = (sp.modifierValue ?? 0) + (d.radius ?? 0) + (id === 'dimension-door' ? n : 0)
	if (id === 'midas-touch') out.coins = Math.floor(n / 2)
	return out
}
/** Shield / Invulnerability on him now */
export function guardNow(s: GyS, pid: string, round: number): ('shield' | 'invulnerability')[] {
	return (gyOf(s, pid).guard ?? []).filter((g) => g.round === round).map((g) => g.spell)
}

// ── follow-ups of the spell just cast ──
/** spaces between two board pieces (null when either is off the board) */
function dist(s: GyS, a: string, b: string): number | null {
	const pa = s.pieces?.[a], pb = s.pieces?.[b]
	if (!pa || !pb) return null
	try { return cubeDist(hexCube(pa.hex), hexCube(pb.hex)) } catch { return null }
}
/** the enemy heroes a forced-discard spell may target now (on the board, not already forced; Energy Drain within range,
 *  Cloud Kill within radius; Burning Hands — "adjacent to the target" — is left to him) */
export function forceTargets(s: GyS, pid: string, ctx: GyCtx): string[] {
	const sp = castNow(s, pid, ctx), me = ctx.teams?.[pid]
	if (!sp || !(sp in FORCE_SPELLS) || gyOf(s, pid).forced === markOf(ctx) || !me) return []
	const n = spellNums(s, pid, sp), reach = sp === 'energy-drain' ? n.range : sp === 'cloud-kill' ? n.radius : null
	return Object.keys(s.cards ?? {}).filter((t) => {
		const team = ctx.teams?.[t]
		if (!team || team === me || s.pieces?.[t]?.kind !== 'hero' || s.forced?.[t]) return false
		if (reach == null) return true
		const dd = dist(s, pid, t)
		return dd != null && dd <= reach
	})
}
/** Create Undead: empty friendly spawn points in the battle zone within range */
export function raiseSpots(s: GyS, pid: string, ctx: GyCtx): string[] {
	if (castNow(s, pid, ctx) !== 'create-undead' || gyOf(s, pid).raised === markOf(ctx)) return []
	const me = ctx.teams?.[pid], hero = s.pieces?.[pid], cells = s.map?.cells ?? {}
	if (!me || !hero) return []
	const zones = zoneTable(s.map as never), zone = LANE[Math.max(0, Math.min(LANE.length - 1, s.lane ?? START_LANE))]
	const want = me === 'orange' ? 'spawnOrange' : 'spawnBlue'
	const reach = spellNums(s, pid, 'create-undead').range ?? 3
	const taken = new Set(Object.values(s.pieces ?? {}).filter((p) => !p.attachedTo).map((p) => p.hex))
	let c: ReturnType<typeof hexCube>
	try { c = hexCube(hero.hex) } catch { return [] }
	return Object.keys(cells).filter((h) => cells[h] === want && zones[h] === zone && !taken.has(h) && cubeDist(hexCube(h), c) <= reach).sort()
}
/** Find Familiar: spells he may still strike (up to three, not Wish) */
export const canStrike = (s: GyS, pid: string, ctx: GyCtx) => castNow(s, pid, ctx) === 'find-familiar' && gyOf(s, pid).strike !== markOf(ctx)
/** Vampiric Touch: after the attack (his attack ended / a defeat), one discarded card back */
export const canDrink = (s: GyS, pid: string, ctx: GyCtx) =>
	castNow(s, pid, ctx) === 'vampiric-touch' && gyOf(s, pid).retr !== markOf(ctx) && s.power?.[pid]?.hit === markOf(ctx) && (s.cards?.[pid]?.discard.length ?? 0) > 0

/** news for everyone's toast */
/** a cast / Prepare / Wish, for everyone's toast; `moved` = the spells Prepare brought back into the book (the essence wisps) */
export type GyNews = { id: string; by: string; spell: string; wish?: number; moved?: string[]; at: number }
const newsOf = (by: string, spell: string, more: Partial<GyNews> = {}): GyNews => ({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, by, spell, at: Date.now(), ...more })

/** give back one spent Life counter (the first spent token turns full again) */
function regainLife(s: GyS, team: Team): Pick<GyS, 'life' | 'lifeTok'> {
	const tok = s.lifeTok?.[team] ?? []
	const i = tok.indexOf(false)
	if (i < 0) return {}
	const next = tok.slice(); next[i] = true
	return { lifeTok: { ...s.lifeTok!, [team]: next }, life: { ...s.life!, [team]: Math.min(tok.length, (s.life?.[team] ?? 0) + 1) } }
}

/** the host applies one of his requests: a patch (empty = refused) */
export function applyGydion(s: GyS, req: GyReq, ctx: GyCtx): Record<string, unknown> {
	const pid = req.pid, mark = markOf(ctx), g = gyOf(s, pid)
	const put = (next: GyState, more: Record<string, unknown> = {}) => ({ power: { ...s.power, [pid]: { ...s.power?.[pid], gy: next } }, ...more })
	if (req.op === 'gyFix') {
		// the host fixes a Gydion's book: a spell in / out, the Wish count, prepared or not
		const who = req.target
		if (req.pid !== s.host || !who || !isGy(s, who)) return {}
		const h = gyOf(s, who)
		let next: GyState = { ...h }
		if (req.spell && (BOOK.includes(req.spell) || req.spell === 'wish')) {
			const gone = h.gone ?? []
			// a spell put into a book never prepared: just that one comes in — every other spell stays out (in the ether)
			const base = req.on && req.spell !== 'wish' && !h.prep ? [...new Set([...BOOK, ...gone])] : gone
			next = req.on ? { ...next, prep: req.spell === 'wish' ? next.prep : true, gone: base.filter((x) => x !== req.spell), struck: (h.struck ?? []).filter((x) => x !== req.spell) }
				: gone.includes(req.spell) ? next : { ...next, gone: [...gone, req.spell] }
		}
		if (req.wish != null) next = { ...next, wish: Math.max(0, Math.min(2, Math.round(req.wish))) }
		return { power: { ...s.power, [who]: { ...s.power?.[who], gy: next } } }
	}
	if (!isGy(s, pid)) return {}
	if (req.op === 'gyPrepare') {
		if (!canPrepare(s, pid, ctx)) return {}
		// every spell back in the book; Shield ends (it's cancelled when its card returns)
		const out = g.gone ?? [], moved = g.prep ? out : [...BOOK, ...out.filter((x) => !BOOK.includes(x))]
		return put({ ...g, prep: true, gone: [], struck: [], silver: mark, guard: (g.guard ?? []).filter((x) => x.spell !== 'shield') }, { gyNews: newsOf(pid, 'prepare', { moved }) })
	}
	if (req.op === 'gyWish') {
		if (!canWish(s, pid, ctx)) return {}
		const wish = (g.wish ?? 0) + 1
		const out = put({ ...g, gone: [...(g.gone ?? []), 'wish'], wish, silver: mark, wishOpen: mark }, { gyNews: newsOf(pid, 'wish', { wish }) })
		const team = ctx.teams?.[pid]
		if (wish >= 3 && team && !s.wonBy) (out as Record<string, unknown>).wonBy = { team, reason: 'Gydion cast Wish three times' }
		return out
	}
	if (req.op === 'gyCast') {
		const sp = req.spell
		if (!sp || !castOptions(s, pid, ctx).includes(sp)) return {}
		const before = othersGone(s, pid, sp)
		const next: GyState = { ...g, gone: [...(g.gone ?? []), sp], cast: { mark, spell: sp, ...(g.wishOpen === mark ? { wish: true } : {}) } }
		const out: Record<string, unknown> = { gyNews: newsOf(pid, sp) }
		const cs = s.cards![pid]
		if (sp === 'midas-touch') { const coins = Math.floor(before / 2); if (coins) out.cards = { ...s.cards, [pid]: { ...cs, coins: cs.coins + coins } } }
		if (sp === 'energy-drain') { const team = ctx.teams?.[pid]; if (team) Object.assign(out, regainLife(s, team)) }
		if (sp === 'shield' || sp === 'invulnerability') next.guard = [...(g.guard ?? []).filter((x) => x.round === ctx.round && x.spell !== sp), { round: ctx.round, spell: sp }]
		return { ...put(next), ...out }
	}
	if (req.op === 'gyStrike') {
		const list = [...new Set(req.spells ?? [])]
		if (!canStrike(s, pid, ctx) || list.length > 3 || list.some((id) => id === 'wish' || !inBook(s, pid, id))) return {}
		return put({ ...g, gone: [...(g.gone ?? []), ...list], struck: [...(g.struck ?? []), ...list], strike: mark })
	}
	if (req.op === 'gyForce') {
		const t = req.target, sp = castNow(s, pid, ctx)
		if (!t || !sp || !forceTargets(s, pid, ctx).includes(t)) return {}
		const only = FORCE_SPELLS[sp]
		return put({ ...g, forced: mark }, { forced: { ...(s.forced ?? {}), [t]: { by: pid, die: false, at: Date.now(), ...(only ? { only } : {}) } } })
	}
	if (req.op === 'gyRaise') {
		const hex = req.hex, team = ctx.teams?.[pid]
		if (!hex || !team || !raiseSpots(s, pid, ctx).includes(hex)) return {}
		const m = s.map?.meta?.[hex]?.m, role = m === 'ranged' || m === 'heavy' ? m : 'melee'
		const id = `minion_${hex}_gy${Date.now().toString(36)}`
		return put({ ...g, raised: mark }, { pieces: { ...s.pieces, [id]: { id, hex, team, kind: 'minion', role } } })
	}
	if (req.op === 'gyDrink') {
		const cs = s.cards?.[pid], idx = req.idx
		if (!cs || idx == null || !canDrink(s, pid, ctx) || !cs.discard.includes(idx)) return {}
		return put({ ...g, retr: mark }, { cards: { ...s.cards, [pid]: { ...cs, discard: cs.discard.filter((i) => i !== idx), hand: [...cs.hand, idx].sort((a, b) => a - b) } } })
	}
	return {}
}

/** the spell cast for his acting card is an attack (Takahide's "hit" mark then tells Vampiric Touch the attack landed) */
export const castsAttack = (s: GyS, pid: string, ctx: GyCtx) => { const sp = castNow(s, pid, ctx); return !!sp && spellOf(sp)?.primaryAction === 'ATTACK' }
export const spellName = (id: string) => (id === 'prepare' ? 'Prepare Spells' : spellOf(id)?.name ?? id)
export type { Spell }
