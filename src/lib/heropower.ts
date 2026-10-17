// 4★ hero powers (tested in heropower.test.ts): the rules behind each 4★ hero's own dash button. Their state lives in
// MatchState.power[pid] (shared, host-applied like every card action, so Undo / reconnects / the log just work); the
// button itself is private to its player, what it changes is public. Pure functions with no import of match.ts (it
// calls into this file): the turn facts they need come in as a `TurnCtx`.
import { heroCards } from './cards/deck'
import { basicsOf, goldsOf, silverIdx, statDeltas, PASS, type PlayerCardState } from './cards/cardstate'
import { hexCube, cubeDist } from './zones'
import { hexNeighbour } from './board/hexgeo'

export type Team = 'orange' | 'blue'
/** one player's power state; each hero uses its own fields */
export type PowerState = {
	/** Ignatia: the turn (round-turn key) she last flipped the tie-breaker with Chaos Incarnate (once a turn) */
	flip?: string
	/** Snorri: the rune under each turn slot I–IV (index = slot), once he has inscribed them */
	runes?: Rune[]
	/** Snorri's ultimate: the inactive rune he picked as a second active rune, for this turn (round-turn key) only */
	second?: { key: string; rune: Rune }
	/** Takahide: his teammates' swap chance for this acting card (`key:at`) has been used */
	mate?: string
	/** Takahide: his acting card (`key:at`) has hit — an attack on a hero ended, or he defeated a hero / a minion —
	 *  so its "after the attack" swap is open to his teammates */
	hit?: string
	/** Takahide: he already swapped a gold for this acting card (`key:at`) — once per card */
	swap?: string
	/** Takahide: Ready for War has been applied (his silver traded for all three golds) */
	war?: boolean
	/** Emmitt: the turn (round-turn key) his gold reversed — lower initiative acts first */
	rev?: string
	/** Emmitt: the turn he bent time in (a swap, a rewind, a warp, a retrieve) — his clock runs backwards till it ends */
	shen?: string
	/** Emmitt's Time Warp: the enemy hero who must swap their unresolved card for a resolved one, for this acting card */
	warp?: { key: string; at: number; target: string }
	/** anyone: Emmitt's Time Capsule / Future Proof taken back (`key:at`) — once per card */
	cap?: string
	/** NebKher: he laughed diabolically for this acting card (`key:at`) — once per card */
	laugh?: string
	/** NebKher: the card swaps Diabolical Laughter made for this acting card (up to three) */
	nsw?: { mark: string; n: number }
	/** NebKher: the colour he named (Imbue Doubt…) and the turn he named it in — shown till the next turn ends */
	doubt?: { key: string; color: NkColor }
	/** NebKher: the Crack in Reality / Shift Reality line for this turn: through `hex`, along axis `dir` (0–2) */
	crack?: { key: string; hex: string; dir: number }
}
export type NkColor = 'GOLD' | 'SILVER' | 'RED' | 'BLUE' | 'GREEN'
export const NK_COLORS: NkColor[] = ['GOLD', 'SILVER', 'RED', 'BLUE', 'GREEN']
/** an enemy hero as NebKher's panel lists them */
export type NkEnemy = { pid: string; hero: string; name: string; dist: number | null; prev: number | null; prevHidden: boolean; slots: { t: number; idx: number; hidden: boolean }[] }
export type PowerReq = { kind: 'power'; pid: string; op: 'ignatiaFlip' | 'snorriInscribe' | 'snorriSecond' | 'takaSwap' | 'mateSwap' | 'emReverse' | 'emWarp' | 'warpSwap' | 'capsule' | 'nkLaugh' | 'nkSwap' | 'nkName' | 'nkCrack';
	/** takaSwap: the gold card from his deck to take; mateSwap: the hand / discard card to swap in; warpSwap: the turn slot (0–3) */
	idx?: number
	/** mateSwap: where the swapped-in card comes from */
	src?: 'hand' | 'discard'
	/** snorriInscribe: the four runes in slot order I–IV */
	order?: Rune[]
	/** snorriSecond: the second rune, or null to clear it */
	rune?: Rune | null
	/** the host fixing another player's runes / gold; emWarp: the enemy hero */
	target?: string
	/** emReverse (host): switch the reversal on / off */
	on?: boolean
	/** nkSwap: the two turn slots (0–3) of the target to swap */
	slots?: [number, number]
	/** nkName: the colour named */
	color?: NkColor
	/** nkCrack: the axis of the line (0–2) */
	dir?: number }
/** what the engine knows about the turn in play */
export type TurnCtx = { key: string; round: number; turnIdx: number; order: string[]; at: number; tieBreaker: Team; revealed: boolean
	/** each player's team (for "a friendly hero") */
	teams?: Record<string, Team | null> }
type S = { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState>; effects?: { pid: string; hero: string; idx: number }[]; host?: string
	lastClash?: { id: string; kind: string; by: string; out: string } | null; lastDefeat?: { id: string; by: string } | null
	attacks?: Record<string, unknown>; forced?: Record<string, unknown>
	turnDisc?: { key: string; by: Record<string, number[]> } | null
	pieces?: Record<string, { id: string; hex: string; kind?: string; team?: string; token?: string; owner?: string }> }

/** heroes with their own dash button */
export const POWER_HEROES = ['ignatia', 'snorri', 'takahide', 'emmitt', 'nebkher']
export const hasPower = (hero: string | undefined | null) => !!hero && POWER_HEROES.includes(hero)

// ── Ignatia ──
const silverOf = (hero: string) => heroCards(hero).findIndex((c) => c.color === 'SILVER' && !c.handicapped)
/** both halves of her cards apply: her silver's effect (Equilibrium) has been switched on — Activate effect on the
 *  played card, confirmed — and hasn't run out yet (playing the silver alone doesn't count: she may hold her action).
 *  It ends with the effect itself (This round = at the round's end). */
export const equilibrium = (s: S, pid: string) => {
	const silver = silverOf('ignatia')
	return silver >= 0 && (s.effects ?? []).some((e) => e.pid === pid && e.hero === 'ignatia' && e.idx === silver)
}
/** Chaos Incarnate: on her own acting turn, with the ultimate, once a turn */
export function canFlip(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'ignatia' && cs.ultimate && ctx.revealed && ctx.order[ctx.at] === pid && s.power?.[pid]?.flip !== ctx.key
}
export const flipUsed = (s: S, pid: string, ctx: TurnCtx) => s.power?.[pid]?.flip === ctx.key

// ── Snorri ──
// Inscribe the Runes (his silver): four rune markers, one under each turn slot; the rune under the slot of the turn in
// play is ACTIVE. They stay through round ends and his defeat (the card says so), and move only when he plays the
// silver again (or the host fixes them). Rune Mastery (ultimate): each action, one INACTIVE rune counts as a second
// active rune — picked on his own acting turn, or while he answers an attack / a forced discard (his defence card is an
// action too: the Oaths read the runes), gone when the turn ends.
export const RUNES = ['axe', 'bird', 'anvil', 'horn'] as const
export type Rune = (typeof RUNES)[number]
export const RUNE_NAME: Record<Rune, string> = { axe: 'Axe', bird: 'Bird', anvil: 'Anvil', horn: 'Horn' }
const ROMAN = ['I', 'II', 'III', 'IV']
/** a valid arrangement: each of the four runes exactly once */
export const isRuneOrder = (o: unknown): o is Rune[] => Array.isArray(o) && o.length === 4 && RUNES.every((r) => o.includes(r))
export const runesOf = (s: S, pid: string): Rune[] | null => { const r = s.power?.[pid]?.runes; return isRuneOrder(r) ? r : null }
/** the rune under the slot of this turn (null before the first Inscribe) */
export const activeRune = (s: S, pid: string, turnIdx: number): Rune | null => runesOf(s, pid)?.[turnIdx] ?? null
/** Rune Mastery's pick for this turn, if any */
export const secondRune = (s: S, pid: string, ctx: TurnCtx): Rune | null => { const x = s.power?.[pid]?.second; return x && x.key === ctx.key && s.cards?.[pid]?.ultimate ? x.rune : null }
/** he may (re)arrange the runes: his silver is the card acting now (his own acting turn, after the reveal) */
export function canInscribe(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	return !!cs && cs.hero === 'snorri' && ctx.revealed && ctx.order[ctx.at] === pid && cs.pending != null && cs.pending === silverIdx('snorri')
}
/** Rune Mastery: the ultimate, runes inscribed, and an action of his now — his own acting turn, or defending (an open
 *  attack on him, or a forced discard) */
export function canSecond(s: S, pid: string, ctx: TurnCtx): boolean {
	const cs = s.cards?.[pid]
	if (!cs || cs.hero !== 'snorri' || !cs.ultimate || !runesOf(s, pid)) return false
	return (ctx.revealed && ctx.order[ctx.at] === pid) || !!s.attacks?.[pid] || !!s.forced?.[pid]
}
/** the log's words for an arrangement */
export const runeLine = (o: Rune[]) => o.map((r, i) => `${ROMAN[i]} ${RUNE_NAME[r]}`).join(' · ')

// ── Takahide ──
// His gold cards: Butterfly starts in his hand, Sting and Tiger in his deck. Playing any of them, then (or with Bushido,
// his silver) he may swap his gold for another from his deck: the new card takes the old one's place — in this turn's
// slot face up after a gold, or wherever the old one was with Bushido (face down if it was already played or
// discarded: only he knows which). Ready for War (ultimate): the silver back to the deck, all three golds in hand.
// Some red cards let ONE teammate whose card hasn't acted yet swap it for a hand card (Hold my Saké: or a discard).
const TAKA = 'takahide'
/** the gold cards he holds now (one; all three after Ready for War) and those still in his deck */
export const heldGolds = (cs: PlayerCardState) => basicsOf(cs).filter((i) => goldsOf(cs.hero).includes(i))
export const deckGolds = (cs: PlayerCardState) => goldsOf(cs.hero).filter((i) => !basicsOf(cs).includes(i))
/** where a card lies now */
export type Spot = { at: 'hand' } | { at: 'pending' } | { at: 'turn'; t: number } | { at: 'discard' } | { at: 'deck' }
export function spotOf(cs: PlayerCardState, idx: number): Spot {
	if (cs.hand.includes(idx)) return { at: 'hand' }
	if (cs.pending === idx) return { at: 'pending' }
	const t = cs.turns.indexOf(idx)
	if (t >= 0) return { at: 'turn', t }
	if (cs.discard.includes(idx)) return { at: 'discard' }
	return { at: 'deck' }
}
/** what kind of swap he may make now: 'gold' = his gold is the card acting (the new one takes its slot, face up);
 *  'bushido' = his silver is acting (his gold, wherever it is); null = none */
export function takaSwapKind(s: S, pid: string, ctx: TurnCtx): 'gold' | 'bushido' | null {
	const cs = s.cards?.[pid]
	if (!cs || cs.hero !== TAKA || !ctx.revealed || ctx.order[ctx.at] !== pid || !deckGolds(cs).length || cs.pending == null) return null
	if (s.power?.[pid]?.swap === `${ctx.key}:${ctx.at}`) return null // one swap per card
	if (heldGolds(cs).includes(cs.pending)) return 'gold'
	if (cs.pending === silverIdx(TAKA) && basicsOf(cs).includes(cs.pending)) return 'bushido'
	return null
}
/** swap the gold card `from` (held) for `to` (from his deck), the new one taking the old one's place */
function swapGold(cs: PlayerCardState, from: number, to: number, faceDown: boolean): PlayerCardState {
	const sp = spotOf(cs, from)
	const basics = basicsOf(cs).map((i) => (i === from ? to : i))
	const hidden = (cs.hidden ?? []).filter((i) => i !== from)
	const put = (x: number) => (x === from ? to : x)
	const next: PlayerCardState = { ...cs, basics, hidden: faceDown && (sp.at === 'turn' || sp.at === 'discard') ? [...hidden, to] : hidden }
	if (sp.at === 'hand') next.hand = cs.hand.map(put).sort((a, b) => a - b)
	else if (sp.at === 'pending') next.pending = to
	else if (sp.at === 'turn') next.turns = cs.turns.map((x) => (x === from ? to : x))
	else if (sp.at === 'discard') next.discard = cs.discard.map(put)
	return next
}
/** the card acting now offers his teammates a swap (Set an Example · Lead from the Front · Hold my Saké) */
const offerOf = (cs: PlayerCardState | undefined): 'hand' | 'both' | null => {
	const c = cs && cs.hero === TAKA && cs.pending != null && cs.pending >= 0 ? heroCards(TAKA)[cs.pending] : null
	if (!c || !/may\s+swap\s+their\s+unresolved\s+card/i.test(c.description)) return null
	return /or\s+in\s+their\s+discard/i.test(c.description) ? 'both' : 'hand'
}
/** the Takahide offering a teammate of `pid` a swap now, and from where (null = no offer) */
export function mateOffer(s: S, pid: string, ctx: TurnCtx): { by: string; from: 'hand' | 'both' } | null {
	if (!ctx.revealed) return null
	const by = ctx.order[ctx.at]
	if (!by || by === pid) return null
	const from = offerOf(s.cards?.[by])
	// only AFTER the attack: once his card has hit (takaHit), and once only
	if (!from || s.power?.[by]?.hit !== `${ctx.key}:${ctx.at}` || s.power?.[by]?.mate === `${ctx.key}:${ctx.at}`) return null
	const team = ctx.teams?.[pid]
	if (!team || ctx.teams?.[by] !== team) return null
	// their card is face up in this turn's order and hasn't acted yet
	const k = ctx.order.indexOf(pid)
	const mine = s.cards?.[pid]?.pending
	if (k <= ctx.at || mine == null || mine === PASS) return null
	return { by, from }
}
/** after any change: did Takahide's acting swap card just hit? (an attack he made on a hero ended — defended or
 *  defeated —, or he defeated a hero or a minion). `ctx` = the turn as it was before the change. The power map to
 *  write (marking `hit`), or null */
export function takaHit(prev: S, next: S, req: { kind: string; pid?: string }, ctx: TurnCtx): Record<string, PowerState> | null {
	const by = ctx.order[ctx.at]
	const cs = by ? next.cards?.[by] : undefined
	// Takahide's swap reds, and Emmitt's golds ("After the attack: next turn…")
	if (!by || !ctx.revealed || !(offerOf(cs) || (cs?.hero === EMM && RE_REVERSE.test(cardText(cs, cs.pending))))) return null
	const mark = `${ctx.key}:${ctx.at}`
	if (next.power?.[by]?.hit === mark) return null
	const c = next.lastClash, d = next.lastDefeat
	const hit = (req.kind === 'defeatMinion' && req.pid === by)
		|| (!!c && c.id !== prev.lastClash?.id && c.by === by && c.kind === 'attack' && (c.out === 'defended' || c.out === 'died'))
		|| (!!d && d.id !== prev.lastDefeat?.id && d.by === by)
	return hit ? { ...next.power, [by]: { ...next.power?.[by], hit: mark } } : null
}
/** Ready for War: once his ultimate is on, the silver goes back to the deck and every gold comes into his hand (and the
 *  other way round if the ultimate is taken back). The new card state, or null when nothing changes. */
export function readyForWar(cs: PlayerCardState, applied: boolean): PlayerCardState | null {
	if (cs.hero !== TAKA || cs.ultimate === applied) return null
	const silver = silverIdx(TAKA), golds = goldsOf(TAKA)
	const strip = (x: PlayerCardState, out: number[]) => ({ ...x, hand: x.hand.filter((i) => !out.includes(i)), discard: x.discard.filter((i) => !out.includes(i)),
		turns: x.turns.map((i) => (i != null && out.includes(i) ? null : i)), pending: x.pending != null && out.includes(x.pending) ? PASS : x.pending, hidden: (x.hidden ?? []).filter((i) => !out.includes(i)) })
	if (cs.ultimate) {
		const add = deckGolds(cs)
		const x = strip(cs, [silver])
		return { ...x, basics: [...golds], hand: [...x.hand, ...add].sort((a, b) => a - b) }
	}
	// the ultimate was taken back: keep the gold he played first (else the lowest), the silver returns to his hand
	const keep = golds.find((g) => spotOf(cs, g).at !== 'hand' && spotOf(cs, g).at !== 'deck') ?? golds[0]
	const x = strip(cs, golds.filter((g) => g !== keep))
	return { ...x, basics: [keep, silver], hand: [...x.hand, silver].sort((a, b) => a - b) }
}

// ── Emmitt ──
// Reverse Time / Tear in Time (his golds): "Next turn: heroes with lower initiative act before heroes with higher
// initiative" — the engine turns the order round for that turn (ties as normal). Back to the Future (rewind a unit to
// where it stood as the turn began) and the Swap are board moves (GameView). Time Warp: an enemy hero swaps their
// unresolved card for one of their resolved ones (their pick). Time Capsule / Future Proof: he and his friends may take
// back every card they discarded this turn. Temporal Punch / Slam / Judgment: the defender uses Initiative (a note).
const EMM = 'emmitt'
// (the card text, with the '>' line marks of its 'Choose one' options taken out)
export const cardText = (cs: PlayerCardState | undefined, idx: number | null | undefined) => (cs && idx != null && idx >= 0 ? (heroCards(cs.hero)[idx]?.description ?? '').replace(/>/g, ' ') : '')
/** the card Emmitt has acting now, by what it says */
export const emActing = (s: S, ctx: TurnCtx, re: RegExp): string | null => {
	const by = ctx.order[ctx.at]
	const cs = by ? s.cards?.[by] : undefined
	return ctx.revealed && cs?.hero === EMM && re.test(cardText(cs, cs.pending)) ? by : null
}
export const RE_REVERSE = /lower\s+initiative\s+act\s+before/i
export const RE_REWIND = /where\s+that\s+unit\s+was\s+at\s+the\s+start\s+of\s+this\s+turn/i
export const RE_WARP = /swaps\s+their\s+unresolved\s+card\s+with\s+one\s+of\s+their\s+resolved/i
export const RE_CAPSULE = /retrieve\s+all\s+cards\s+discarded\s+this\s+turn/i
export const RE_TEMPORAL = /must\s+use\s+the\s+\S+\s*initiative/i
/** the next turn's key (none after the 4th turn: a "next turn" effect ends with the round) */
export const nextTurnKey = (ctx: TurnCtx) => (ctx.turnIdx < 3 ? `${ctx.round}-${ctx.turnIdx + 2}` : null)
/** this turn's order runs low → high (an Emmitt reversed it) */
export const reversedTurn = (s: S, key: string) => Object.values(s.power ?? {}).some((p) => p?.rev === key)
/** his gold acts and its attack has landed ("After the attack": an attack on a hero ended, or he defeated a hero or a
 *  minion — `hit`, as for Takahide): he may turn the next turn round (not yet done) */
export function canReverse(s: S, pid: string, ctx: TurnCtx): boolean {
	const nk = nextTurnKey(ctx)
	return !!nk && emActing(s, ctx, RE_REVERSE) === pid && s.power?.[pid]?.hit === `${ctx.key}:${ctx.at}` && s.power?.[pid]?.rev !== nk
}
/** the enemy hero Time Warp is waiting on: their swap, if it's `pid` (their card hasn't acted yet) */
export function warpOffer(s: S, pid: string, ctx: TurnCtx): { by: string } | null {
	const by = emActing(s, ctx, RE_WARP)
	const w = by ? s.power?.[by]?.warp : undefined
	if (!by || !w || w.key !== ctx.key || w.at !== ctx.at || w.target !== pid) return null
	const k = ctx.order.indexOf(pid), cs = s.cards?.[pid]
	if (k <= ctx.at || !cs || cs.pending == null || cs.pending < 0 || !warpSlots(cs, ctx.turnIdx).length) return null
	return { by }
}
/** the resolved cards Time Warp may swap in: this round's earlier turn slots */
export const warpSlots = (cs: PlayerCardState | undefined, turnIdx: number) => (cs ? [0, 1, 2, 3].filter((t) => t < turnIdx && cs.turns[t] != null && cs.turns[t]! >= 0) : [])
/** Time Capsule / Future Proof acting: the cards `pid` (Emmitt or a friend) discarded this turn and may take back */
export function capsuleOffer(s: S, pid: string, ctx: TurnCtx): number[] {
	const by = emActing(s, ctx, RE_CAPSULE)
	if (!by || (pid !== by && (!ctx.teams?.[pid] || ctx.teams?.[pid] !== ctx.teams?.[by]))) return []
	if (s.power?.[pid]?.cap === `${ctx.key}:${ctx.at}` || s.turnDisc?.key !== ctx.key) return []
	const cs = s.cards?.[pid]
	return (s.turnDisc.by[pid] ?? []).filter((i) => cs?.discard.includes(i))
}
/** after a change: the cards each player has newly discarded this turn (Time Capsule reads it) */
export function trackDiscards(prev: S, next: S, key: string): S['turnDisc'] | undefined {
	const base = next.turnDisc?.key === key ? next.turnDisc.by : {}
	let by: Record<string, number[]> | null = null
	for (const pid in next.cards ?? {}) {
		const was = prev.cards?.[pid]?.discard ?? [], now = next.cards![pid].discard
		const added = now.filter((i) => !was.includes(i) && !(base[pid] ?? []).includes(i))
		if (added.length) { by = by ?? { ...base }; by[pid] = [...(base[pid] ?? []), ...added] }
	}
	if (by) return { key, by }
	return next.turnDisc && next.turnDisc.key !== key ? null : undefined
}

// ── NebKher ──
// Diabolical Laughter (his silver): he laughs, then up to three times swaps with an Illusion / places one (board moves)
// or swaps two RESOLVED cards of an enemy hero (here: two of their earlier turn slots this round; effects stay on).
// What the Hell Are You? (ultimate): after he laughs, every enemy hero in radius (5 + his Area items) discards a card or
// is defeated — each a forced discard of its own (× drops one, e.g. for an immune hero). Mind Grip / Probe (golds): he
// reads the card in an enemy hero's previous turn slot and performs it. Imbue Doubt · Time to Reconsider · An Illusion
// of Choice: he names a colour (public; the discard itself is the players' business). Crack in Reality / Shift Reality:
// a straight line of spaces through his space, drawn on everyone's board for this turn. Illusionary Force / Army: while
// that effect is on, his Illusions next to the hero he attacks count as his melee minions (−1 defence each; match.ts).
export const NEB = 'nebkher'
/** the card `hero` has acting now, by what it says (the actor's pid, or null) */
export const heroActing = (s: S, ctx: TurnCtx, hero: string, re: RegExp): string | null => {
	const by = ctx.order[ctx.at]
	const cs = by ? s.cards?.[by] : undefined
	return ctx.revealed && cs?.hero === hero && re.test(cardText(cs, cs.pending)) ? by : null
}
export const RE_LAUGH = /laugh\s+diabolically\s*;/i
export const RE_GRIP = /previous\s+turn\s+slot\s+of\s+an\s+enemy/i
export const RE_NAME = /name\s+a\s+colou?r/i
export const RE_CRACK = /straight\s+line\s+of\s+spaces\s+drawn\s+through\s+your\s+space/i
export const RE_ILLUSION_FORCE = /illusion\s+tokens\s+count\s+as\s+both\s+tokens\s+and\s+friendly\s+melee\s+minions/i
/** which of his powers the card acting now opens (null = none) */
export function nkPower(s: S, pid: string, ctx: TurnCtx): 'laugh' | 'grip' | 'name' | 'crack' | null {
	if (s.cards?.[pid]?.hero !== NEB) return null
	if (heroActing(s, ctx, NEB, RE_LAUGH) === pid) return 'laugh'
	if (heroActing(s, ctx, NEB, RE_GRIP) === pid) return 'grip'
	if (heroActing(s, ctx, NEB, RE_NAME) === pid) return 'name'
	if (heroActing(s, ctx, NEB, RE_CRACK) === pid) return 'crack'
	return null
}
const markOf = (ctx: TurnCtx) => `${ctx.key}:${ctx.at}`
export const laughed = (s: S, pid: string, ctx: TurnCtx) => s.power?.[pid]?.laugh === markOf(ctx)
/** spaces between two board pieces (null when either is off the board) */
export const pieceDist = (s: S, a: string, b: string): number | null => {
	const pa = s.pieces?.[a], pb = s.pieces?.[b]
	if (!pa || !pb) return null
	try { return cubeDist(hexCube(pa.hex), hexCube(pb.hex)) } catch { return null }
}
/** his ultimate's radius: the card's 5, plus his Area items */
export const nkUltRadius = (cs: PlayerCardState) => 5 + (statDeltas(cs).radius ?? 0)
/** the enemy heroes his laugh would make discard now (on the board, in radius, not already forced) */
export function laughTargets(s: S, pid: string, ctx: TurnCtx): string[] {
	const cs = s.cards?.[pid], me = ctx.teams?.[pid]
	if (!cs || !cs.ultimate || !me) return []
	const r = nkUltRadius(cs)
	return Object.keys(s.cards ?? {}).filter((t) => {
		const team = ctx.teams?.[t]
		if (!team || team === me || s.pieces?.[t]?.kind !== 'hero' || s.forced?.[t]) return false
		const d = pieceDist(s, pid, t)
		return d != null && d <= r
	})
}
/** he may laugh now: his silver is the card acting and he hasn't laughed for it yet */
export const canLaugh = (s: S, pid: string, ctx: TurnCtx) => nkPower(s, pid, ctx) === 'laugh' && !laughed(s, pid, ctx)
/** an enemy hero's resolved cards Laughter may swap: their earlier turn slots this round */
export const nkSlots = (cs: PlayerCardState | undefined, turnIdx: number) => warpSlots(cs, turnIdx)
/** card swaps left for this Laughter (three choices in all; only the swaps are counted) */
export const nkSwapsLeft = (s: S, pid: string, ctx: TurnCtx) => { const n = s.power?.[pid]?.nsw; return 3 - (n && n.mark === markOf(ctx) ? n.n : 0) }
/** the turn after `key` ("r-t" → "r-(t+1)"; none after the 4th) */
const keyAfter = (key: string) => { const [r, t] = key.split('-').map(Number); return t < 4 ? `${r}-${t + 1}` : null }
/** the colour he named, while it still matters (the turn he named it and the next) */
export function doubtNow(s: S, pid: string, ctx: TurnCtx): NkColor | null {
	const d = s.power?.[pid]?.doubt
	return d && (d.key === ctx.key || keyAfter(d.key) === ctx.key) ? d.color : null
}
/** the Crack line in play this turn, if any */
export function crackNow(s: S, ctx: TurnCtx): { pid: string; hex: string; dir: number } | null {
	for (const pid in s.power ?? {}) { const c = s.power![pid]?.crack; if (c && c.key === ctx.key) return { pid, hex: c.hex, dir: c.dir } }
	return null
}
/** the spaces of a straight line through `hex` along axis `dir` (0 = NE–SW, 1 = E–W, 2 = SE–NW), on the map */
export function lineHexes(hex: string, dir: number, onMap: (h: string) => boolean): string[] {
	const out = [hex]
	for (const k of [dir, dir + 3]) { let h = hex; for (let i = 0; i < 40; i++) { h = hexNeighbour(h, k); if (!onMap(h)) break; out.push(h) } }
	return out
}
/** Illusionary Force / Army: an effect from that card of his is on now */
export const illusionForce = (s: S, pid: string) => (s.effects ?? []).some((e) => e.pid === pid && e.hero === NEB && RE_ILLUSION_FORCE.test((heroCards(NEB)[e.idx]?.description ?? '').replace(/>/g, ' ')))

/** the host applies a power request: the patch (empty = refused) */
export function applyPower(s: S & { tieTurn?: { key: string; coin: Team } | null; acting?: { key: string; idx: number; done?: string[]; pin?: string[] } | null }, req: PowerReq, ctx: TurnCtx) {
	if (req.op === 'nkLaugh') {
		if (!canLaugh(s, req.pid, ctx)) return {}
		const out: Record<string, unknown> = { power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], laugh: markOf(ctx) } } }
		const targets = laughTargets(s, req.pid, ctx)
		if (targets.length) {
			const at = Date.now()
			out.forced = { ...(s.forced ?? {}), ...Object.fromEntries(targets.map((t) => [t, { by: req.pid, die: true, at }])) }
		}
		return out
	}
	if (req.op === 'nkSwap') {
		const t = req.target, sl = req.slots
		if (nkPower(s, req.pid, ctx) !== 'laugh' || !t || !sl || sl[0] === sl[1] || nkSwapsLeft(s, req.pid, ctx) <= 0) return {}
		if (!ctx.teams?.[t] || ctx.teams[t] === ctx.teams?.[req.pid]) return {}
		const cs = s.cards?.[t], ok = nkSlots(cs, ctx.turnIdx)
		if (!cs || !ok.includes(sl[0]) || !ok.includes(sl[1])) return {}
		const turns = cs.turns.slice();
		[turns[sl[0]], turns[sl[1]]] = [turns[sl[1]], turns[sl[0]]]
		const n = s.power?.[req.pid]?.nsw, mark = markOf(ctx)
		return { cards: { ...s.cards, [t]: { ...cs, turns } }, power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], nsw: { mark, n: (n?.mark === mark ? n.n : 0) + 1 } } } }
	}
	if (req.op === 'nkName') {
		if (nkPower(s, req.pid, ctx) !== 'name' || !req.color || !NK_COLORS.includes(req.color)) return {}
		return { power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], doubt: { key: ctx.key, color: req.color } } } }
	}
	if (req.op === 'nkCrack') {
		const hex = s.pieces?.[req.pid]?.hex
		if (nkPower(s, req.pid, ctx) !== 'crack' || !hex || req.dir == null || ![0, 1, 2].includes(req.dir)) return {}
		return { power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], crack: { key: ctx.key, hex, dir: req.dir } } } }
	}
	if (req.op === 'emReverse') {
		const who = req.target ?? req.pid
		const byHost = req.pid === s.host && req.target != null
		if (s.cards?.[who]?.hero !== EMM) return {}
		const nk = nextTurnKey(ctx)
		if (byHost) {
			if (req.on === false) return s.power?.[who]?.rev ? { power: { ...s.power, [who]: { ...s.power?.[who], rev: undefined } } } : {}
			return nk ? { power: { ...s.power, [who]: { ...s.power?.[who], rev: nk } } } : {}
		}
		if (who !== req.pid || !canReverse(s, who, ctx)) return {}
		return { power: { ...s.power, [who]: { ...s.power?.[who], rev: nk! } } }
	}
	if (req.op === 'emWarp') {
		const by = emActing(s, ctx, RE_WARP)
		if (!by || !req.target || (req.pid !== by && req.pid !== s.host)) return {}
		if (!ctx.teams?.[req.target] || ctx.teams[req.target] === ctx.teams[by]) return {}
		const k = ctx.order.indexOf(req.target)
		if (k <= ctx.at || !warpSlots(s.cards?.[req.target], ctx.turnIdx).length) return {} // nothing resolved to swap for
		return { power: { ...s.power, [by]: { ...s.power?.[by], warp: { key: ctx.key, at: ctx.at, target: req.target }, shen: ctx.key } } }
	}
	if (req.op === 'warpSwap') {
		const off = warpOffer(s, req.pid, ctx), cs = s.cards?.[req.pid]
		const t = req.idx
		if (!off || !cs || t == null || !warpSlots(cs, ctx.turnIdx).includes(t)) return {}
		const old = cs.pending as number, res = cs.turns[t] as number
		const next: PlayerCardState = { ...cs, pending: res, turns: cs.turns.map((x, i) => (i === t ? old : x)) }
		return {
			cards: { ...s.cards, [req.pid]: next },
			power: { ...s.power, [off.by]: { ...s.power?.[off.by], warp: undefined } },
			acting: { key: ctx.key, idx: ctx.at, done: s.acting?.key === ctx.key ? s.acting.done : undefined, pin: ctx.order.slice(0, ctx.at + 1) }
		}
	}
	if (req.op === 'capsule') {
		const back = capsuleOffer(s, req.pid, ctx), cs = s.cards?.[req.pid]
		const by = emActing(s, ctx, RE_CAPSULE)
		if (!back.length || !cs || !by) return {}
		const next: PlayerCardState = { ...cs, discard: cs.discard.filter((i) => !back.includes(i)), hand: [...cs.hand, ...back].sort((a, b) => a - b) }
		const power = { ...s.power, [req.pid]: { ...s.power?.[req.pid], cap: `${ctx.key}:${ctx.at}` } }
		power[by] = { ...power[by], shen: ctx.key }
		return { cards: { ...s.cards, [req.pid]: next }, power }
	}
	if (req.op === 'takaSwap') {
		const who = req.target ?? req.pid
		const cs = s.cards?.[who]
		const byHost = req.pid === s.host && req.target != null
		if (!cs || cs.hero !== TAKA || req.idx == null || !deckGolds(cs).includes(req.idx)) return {}
		const kind = byHost ? null : who === req.pid ? takaSwapKind(s, who, ctx) : null
		if (!byHost && !kind) return {}
		// after a gold: that gold (this turn's card). Bushido / the host: his gold, wherever it is
		const from = kind === 'gold' ? (cs.pending as number) : heldGolds(cs)[0]
		if (from == null) return {}
		const out: Record<string, unknown> = { cards: { ...s.cards, [who]: swapGold(cs, from, req.idx, kind !== 'gold') } }
		if (kind) out.power = { ...s.power, [who]: { ...s.power?.[who], swap: `${ctx.key}:${ctx.at}` } }
		// the card in play changed its initiative: the cards that acted and the one acting keep their places
		if (ctx.revealed && cs.pending === from) out.acting = { key: ctx.key, idx: ctx.at, done: s.acting?.key === ctx.key ? s.acting.done : undefined, pin: ctx.order.slice(0, ctx.at + 1) }
		return out
	}
	if (req.op === 'mateSwap') {
		const off = mateOffer(s, req.pid, ctx), cs = s.cards?.[req.pid]
		if (!off || !cs || req.idx == null || cs.pending == null || cs.pending < 0) return {}
		const fromDisc = req.src === 'discard'
		if (fromDisc ? off.from !== 'both' || !cs.discard.includes(req.idx) : !cs.hand.includes(req.idx)) return {}
		const old = cs.pending
		const next: PlayerCardState = fromDisc
			? { ...cs, pending: req.idx, discard: [...cs.discard.filter((i) => i !== req.idx), old] }
			: { ...cs, pending: req.idx, hand: [...cs.hand.filter((i) => i !== req.idx), old].sort((a, b) => a - b) }
		// the cards that acted and the one acting keep their places, whatever the new initiative
		const pin = ctx.order.slice(0, ctx.at + 1)
		return {
			cards: { ...s.cards, [req.pid]: next },
			power: { ...s.power, [off.by]: { ...s.power?.[off.by], mate: `${ctx.key}:${ctx.at}` } },
			acting: { key: ctx.key, idx: ctx.at, done: s.acting?.key === ctx.key ? s.acting.done : undefined, pin }
		}
	}
	if (req.op === 'snorriInscribe') {
		const who = req.target ?? req.pid
		const byHost = req.pid === s.host && req.target != null
		if (!isRuneOrder(req.order) || s.cards?.[who]?.hero !== 'snorri') return {}
		if (!byHost && (who !== req.pid || !canInscribe(s, who, ctx))) return {}
		const prev = s.power?.[who] ?? {}
		// a second rune that is now the active one is no longer "inactive": drop it
		const second = prev.second && prev.second.key === ctx.key && req.order[ctx.turnIdx] !== prev.second.rune ? prev.second : undefined
		return { power: { ...s.power, [who]: { ...prev, runes: [...req.order], second } } }
	}
	if (req.op === 'snorriSecond') {
		if (!canSecond(s, req.pid, ctx)) return {}
		const prev = s.power?.[req.pid] ?? {}
		if (req.rune == null) return prev.second ? { power: { ...s.power, [req.pid]: { ...prev, second: undefined } } } : {}
		if (!RUNES.includes(req.rune) || activeRune(s, req.pid, ctx.turnIdx) === req.rune) return {}
		return { power: { ...s.power, [req.pid]: { ...prev, second: { key: ctx.key, rune: req.rune } } } }
	}
	if (req.op === 'ignatiaFlip') {
		if (!canFlip(s, req.pid, ctx)) return {}
		const other: Team = ctx.tieBreaker === 'orange' ? 'blue' : 'orange'
		return {
			tieBreaker: other,
			// the order of this turn keeps the coin it began with (a flip changes her card text, not who goes next)
			tieTurn: s.tieTurn?.key === ctx.key ? s.tieTurn : { key: ctx.key, coin: ctx.tieBreaker },
			power: { ...s.power, [req.pid]: { ...s.power?.[req.pid], flip: ctx.key } }
		}
	}
	return {}
}

/** after any change: what follows by itself (Takahide's Ready for War as his ultimate comes on / off). Returns a
 *  patch (cards / power) or null */
export function syncPowers(s: S, _ctx: TurnCtx): { cards?: Record<string, PlayerCardState>; power?: Record<string, PowerState> } | null {
	let cards: Record<string, PlayerCardState> | undefined, power: Record<string, PowerState> | undefined
	for (const pid in s.cards ?? {}) {
		const cs = s.cards![pid]
		if (cs.hero !== TAKA) continue
		const applied = !!s.power?.[pid]?.war
		const war = readyForWar(cs, applied)
		let next = war ?? cs
		// a face-down card stays face down only while it lies in a turn slot or the discard (retrieved / taken back = no longer)
		if (next.hidden?.length) {
			const keep = next.hidden.filter((i) => next.turns.includes(i) || next.discard.includes(i))
			if (keep.length !== next.hidden.length) next = { ...next, hidden: keep.length ? keep : undefined }
		}
		if (next === cs) continue
		cards = { ...(cards ?? s.cards), [pid]: next }
		if (war) power = { ...(power ?? s.power), [pid]: { ...s.power?.[pid], war: cs.ultimate } }
	}
	return cards ? (power ? { cards, power } : { cards }) : null
}
