// Thin data layer over the ported card engine: real hero decks + the art-slug
// mapping, so we can render exact Guards of Atlantis II cards.
import newHeroInfo from './new_heroes.json';
import { heroes } from './states';

export type HeroCardJson = {
	name: string;
	description: string;
	color: string;
	traits?: string[];
	level?: number;
	handicapped?: boolean;
	extra?: boolean;
	variant?: { first: number; second: number };
	initiative?: number;
	primaryAction?: string;
	primaryValue?: number;
	primaryValueSign?: string;
	modifier?: string;
	modifierValue?: number;
	modifierValueSign?: string;
	secondaryMovement?: number;
	secondaryDefense?: number;
	secondaryAttack?: number;
	item?: string;
};

const DECKS = newHeroInfo as Record<string, HeroCardJson[]>;

export function heroCards(heroId: string): HeroCardJson[] {
	return DECKS[heroId] ?? [];
}

const EXTRA_AT = new Map<string, number>();
for (const deck of Object.values(DECKS)) deck.filter((c) => c.extra).forEach((c, i) => EXTRA_AT.set(c.name, i));
/** where an extra card stands among its hero's extra cards (-1 = unknown) */
const extraIndex = (card: HeroCardJson) => EXTRA_AT.get(card.name) ?? -1;

/** File slug for a card's background art (e.g. "GreenIA", "Gold", "Ultimate"). */
export function backgroundSlug(card: HeroCardJson, extraSlotIndex: number | null = null): string {
	// an EXTRA card (e.g. Takahide's Sting like a Bee / Strike like a Tiger) has its own painting: Extra1, Extra2…
	// in the order the hero's extra cards come
	const ex = card.extra ? (extraSlotIndex ?? extraIndex(card)) : null;
	if (ex != null && ex >= 0) return `Extra${ex + 1}`;
	const c = card.color;
	if (c === 'GOLD') return card.handicapped ? 'Handicap' : 'Gold';
	if (c === 'SILVER') return card.handicapped ? 'Handicap' : 'Silver';
	if (c === 'PURPLE') return 'Ultimate';
	const prefix = c === 'BLUE' ? 'Blue' : c === 'RED' ? 'Red' : 'Green';
	const lvl = card.level ?? 1;
	if (lvl === 2) return card.variant?.first === 2 ? `${prefix}IIB` : `${prefix}IIA`;
	if (lvl === 3) return card.variant?.first === 2 ? `${prefix}IIIB` : `${prefix}IIIA`;
	return `${prefix}IA`;
}

/** Primary stat value (min, "new printing") for a hero: 0=atk 1=def 2=init 3=move. */
export function heroStat(heroId: string, i: number): number {
	const s = (heroes as Record<string, { stats?: Array<number | number[]> }>)[heroId]?.stats?.[i];
	return Array.isArray(s) ? s[0] : (s ?? 0);
}

export function heroTitle(heroId: string): string {
	return (heroes as Record<string, { title?: string }>)[heroId]?.title ?? '';
}
export function heroName(heroId: string): string {
	return (heroes as Record<string, { name?: string }>)[heroId]?.name ?? heroId;
}

export { heroes };
