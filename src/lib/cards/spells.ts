// Gydion's spellbook: the 22 spell cards (21 + Wish, his ultimate's spell) and their printed art.
// The art files are the whole printed card (landscape), named after the spell, so no painting is needed.
import spellInfo from './spells.json';
import type { HeroCardJson } from './deck';

export type SpellJson = HeroCardJson & { school: string };
export type Spell = SpellJson & { id: string; art: string };

const ART = import.meta.glob('./images/spells/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

/** 'Midas\' Touch' → 'midas-touch' (also the art's file name) */
export const spellId = (name: string) => name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

export const SPELLS: Spell[] = (spellInfo as SpellJson[]).map((s) => {
	const id = spellId(s.name);
	return { ...s, id, art: ART[`./images/spells/${id}.webp`] ?? '' };
});
const BY_ID = new Map(SPELLS.map((s) => [s.id, s]));
export const spellOf = (id: string) => BY_ID.get(id);

/** the spells a Gydion card casts, in the order the card names them (a card's quotes: "Burning Hands") */
export function castable(card: HeroCardJson | undefined): string[] {
	if (!card) return [];
	return [...card.description.matchAll(/"([^"]+)"/g)].map((m) => spellId(m[1])).filter((id) => BY_ID.has(id));
}
