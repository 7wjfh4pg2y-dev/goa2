// Snorri's runes as the HUD shows them (heropower.ts holds the rules): which rune sits under each turn slot, and
// Rune Mastery's second rune this turn. Public: everyone sees them under his slots.
import type { Rune } from '$lib/heropower'
import { tokenImg } from '$lib/board/tokenArt'

export type RuneSlots = { at: Rune[]; second: Rune | null }
export const runeArt = (r: Rune) => tokenImg(`rune_${r}_marker`) ?? ''
