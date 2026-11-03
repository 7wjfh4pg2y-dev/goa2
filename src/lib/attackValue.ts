// The numbers of an open attack, for the board (2026-11-03, the user's pick: option A — a raised sword over the
// attacker with its attack value, the defender's shield with its defence; item stats are ADDED IN, a small gem
// says an item counts, and hovering / tapping either shows the sum).
import { heroCards, type HeroCardJson } from './cards/deck'
import { statDeltas, type PlayerCardState } from './cards/cardstate'

/** one line of the sum: a card, an item (with the colour of the card behind it), minions … */
export type CalcLine = { label: string; value: number; pip?: string; plain?: boolean } // plain = a card's own value (no sign)
export type AttackFigures = {
	/** the attack: null when the attacker's card this turn names no attack value */
	atk: { total: number; lines: CalcLine[]; pip?: string } | null
	/** the defence: `total` is null until the defence card is down (then the shield shows `bonus` as a +/−) */
	def: { total: number | null; bonus: number; lines: CalcLine[]; pip?: string }
}

/** an attack card's value: its attack action, else nothing */
export function cardAttack(card: HeroCardJson | undefined): number | null {
	if (!card) return null
	if (card.primaryAction === 'ATTACK' && card.primaryValue != null) return card.primaryValue
	return null
}
/** a card used to defend: its defence action, else its printed defence */
export function cardDefence(card: HeroCardJson | undefined): number | null {
	if (!card) return null
	if (card.primaryAction === 'DEFENSE' && card.primaryValue != null) return card.primaryValue
	return card.secondaryDefense ?? null
}

/** the item lines for a stat: each upgrade card that gives it (in its colour), then any items the host added */
export function itemLines(cs: PlayerCardState | undefined, stat: 'ATTACK' | 'DEFENSE'): CalcLine[] {
	if (!cs) return []
	const cards = heroCards(cs.hero)
	const out: CalcLine[] = []
	const order = cs.upgrade.map((idx, n) => ({ idx, n, lv: cards[idx]?.level ?? 1 })).sort((a, b) => a.lv - b.lv || a.n - b.n)
	for (const { idx } of order) {
		const c = cards[idx]
		if (c?.item === stat) out.push({ label: `${c.name} item`, value: 1, pip: c.color })
	}
	const key = stat === 'ATTACK' ? 'atk' : 'def'
	const made = cs.items?.[key] ?? 0
	if (made) out.push({ label: 'Item', value: made, pip: 'BRASS' })
	// statDeltas is the source of truth; if it disagrees (an item stat this file doesn't know), show the difference
	const want = statDeltas(cs)[key] ?? 0, have = out.reduce((a, l) => a + l.value, 0)
	if (want !== have) out.push({ label: 'Items', value: want - have, pip: 'BRASS' })
	return out
}

/** The sum of one open attack. `mods` = the minion / power lines already worked out for the defender
 *  (minionDefense, Razzle's Crowd Control …); `card` = the defence card, once discarded. */
export function attackFigures(
	attacker: PlayerCardState | undefined,
	defender: PlayerCardState | undefined,
	mods: CalcLine[],
	defCard: number | null | undefined,
	/** Gydion: the attack spell his card cast this turn (it replaces the card's own value) — its printed attack,
	 *  plus `extra` lines (Sunburst: +1 per other spell in the ether); false = his card cast no attack spell (no sword) */
	spell?: { name: string; value: number; extra?: CalcLine[] } | null | false
): AttackFigures {
	let atk: AttackFigures['atk'] = null
	const ac = attacker && attacker.pending != null && attacker.pending >= 0 ? heroCards(attacker.hero)[attacker.pending] : undefined
	const av = spell ? spell.value : spell === false ? null : cardAttack(ac)
	if (av != null && (ac || spell)) {
		const items = itemLines(attacker, 'ATTACK')
		const lines: CalcLine[] = [{ label: spell ? spell.name : ac!.name, value: av, plain: true }, ...(spell ? spell.extra ?? [] : []).filter((l: CalcLine) => l.value), ...items]
		atk = { total: lines.reduce((a, l) => a + l.value, 0), lines, pip: items[0]?.pip }
	}
	const items = itemLines(defender, 'DEFENSE')
	const known = [...mods.filter((m) => m.value), ...items]
	const bonus = known.reduce((a, l) => a + l.value, 0)
	const dc = defender && defCard != null && defCard >= 0 ? heroCards(defender.hero)[defCard] : undefined
	const dv = cardDefence(dc)
	const lines = dc && dv != null ? [{ label: dc.name, value: dv, plain: true }, ...known] : known
	return { atk, def: { total: dc && dv != null ? dv + bonus : null, bonus, lines, pip: items[0]?.pip } }
}

/** the card colours as gem colours */
export const PIP_HUE: Record<string, string> = { RED: '#e2463a', BLUE: '#3d8bff', GREEN: '#3fbf63', GOLD: '#f2c14e', SILVER: '#d9dee6', PURPLE: '#a46bff', BRASS: '#d6b26a' }
