// The card gallery's build maths (GM tools → Cards): a hero's deck laid out as its three colour trees, and the
// result of a chosen path — which cards are in hand, which became items (the twin of every Tier II / III pick),
// which were replaced, the level, and the stat growth. Pure; built on the same rules as cardstate.ts.
import { heroCards } from './cards/deck';
import { COLOURS, goldsOf, silverIdx, ultimateIndex, type PlayerCardState } from './cards/cardstate';

export type Colour = (typeof COLOURS)[number];
/** 0 = the A card (variant first 1), 1 = the B card */
export type Side = 0 | 1;
export interface ColourPath { tier: 1 | 2 | 3; ii: Side; iii: Side }
export type BuildPath = Record<Colour, ColourPath>;

export interface ColourTree { t1: number; t2: [number, number]; t3: [number, number] }

/** A colour's cards by tier: Tier I, then the A / B pair of Tier II and of Tier III (indices into heroCards). */
export function colourTree(hero: string, colour: Colour): ColourTree {
	const cards = heroCards(hero);
	const at = (lvl: number, side: Side) =>
		cards.findIndex((c) => !c.handicapped && c.color === colour && (c.level ?? 1) === lvl && (lvl === 1 || ((c.variant?.first ?? 1) === 2 ? 1 : 0) === side));
	return { t1: at(1, 0), t2: [at(2, 0), at(2, 1)], t3: [at(3, 0), at(3, 1)] };
}

/** The gold card(s) (Takahide has three), the silver and the ultimate. */
export function basicCards(hero: string) {
	return { golds: goldsOf(hero), silver: silverIdx(hero), ultimate: ultimateIndex(hero) };
}

export const startPath = (): BuildPath => ({ RED: { tier: 1, ii: 0, iii: 0 }, BLUE: { tier: 1, ii: 0, iii: 0 }, GREEN: { tier: 1, ii: 0, iii: 0 } });
export const fullPath = (side: Side): BuildPath => ({ RED: { tier: 3, ii: side, iii: side }, BLUE: { tier: 3, ii: side, iii: side }, GREEN: { tier: 3, ii: side, iii: side } });

export type CardRole = 'hand' | 'item' | 'replaced' | 'option';

export interface Build {
	/** a PlayerCardState of the build (for StatBubbles and statDeltas) */
	state: PlayerCardState;
	hand: number[];
	items: number[];
	replaced: number[];
	level: number;
	/** the ultimate is allowed (every colour on Tier III) and switched on */
	ultimate: boolean;
	canUltimate: boolean;
	role: (idx: number) => CardRole;
}

/** What a path makes of the hero's deck. `ult` = the ultimate switched on (only counts once every colour is on Tier III). */
export function buildOf(hero: string, path: BuildPath, ult = false): Build {
	const { golds, silver } = basicCards(hero);
	const hand: number[] = [golds[0], silver].filter((i) => i >= 0);
	const items: number[] = [];
	const replaced: number[] = [];
	for (const col of COLOURS) {
		const t = colourTree(hero, col);
		const p = path[col];
		if (p.tier === 1) { hand.push(t.t1); continue; }
		replaced.push(t.t1);
		items.push(t.t2[1 - p.ii]);
		if (p.tier === 2) { hand.push(t.t2[p.ii]); continue; }
		replaced.push(t.t2[p.ii]);
		items.push(t.t3[1 - p.iii]);
		hand.push(t.t3[p.iii]);
	}
	const canUltimate = COLOURS.every((c) => path[c].tier === 3);
	const ultimate = ult && canUltimate;
	const state: PlayerCardState = {
		hero, level: 1 + items.length + (ultimate ? 1 : 0), coins: 0, hand: hand.filter((i) => i >= 0), turns: [null, null, null, null], pending: null,
		discard: [], removed: replaced.filter((i) => i >= 0), upgrade: items.filter((i) => i >= 0), items: {}, ultimate
	};
	const role = (idx: number): CardRole => (state.hand.includes(idx) ? 'hand' : state.upgrade.includes(idx) ? 'item' : state.removed.includes(idx) ? 'replaced' : 'option');
	return { state, hand: state.hand, items: state.upgrade, replaced: state.removed, level: state.level, ultimate, canUltimate, role };
}

/** Click on a colour card: Tier I = back to Tier I; a Tier II / III card = keep it (its twin becomes the item). */
export function choose(path: BuildPath, hero: string, idx: number): BuildPath {
	for (const col of COLOURS) {
		const t = colourTree(hero, col);
		const p = path[col];
		if (idx === t.t1) return { ...path, [col]: { ...p, tier: 1 } };
		const s2 = t.t2.indexOf(idx);
		if (s2 >= 0) return { ...path, [col]: { ...p, ii: s2 as Side, tier: Math.max(p.tier, 2) as 2 | 3 } };
		const s3 = t.t3.indexOf(idx);
		if (s3 >= 0) return { ...path, [col]: { ...p, iii: s3 as Side, tier: 3 } };
	}
	return path;
}

/** "RED II-A III-B · BLUE I · …" — a build in one line (the URL / copy text). */
export function pathCode(path: BuildPath): string {
	return COLOURS.map((c) => { const p = path[c]; const s = (x: Side) => (x ? 'B' : 'A'); return p.tier === 1 ? '1' : p.tier === 2 ? `2${s(p.ii)}` : `3${s(p.ii)}${s(p.iii)}`; }).join('-');
}
export function pathFromCode(code: string | null | undefined): BuildPath | null {
	const parts = (code ?? '').split('-');
	if (parts.length !== 3) return null;
	const out = startPath();
	for (let i = 0; i < 3; i++) {
		const m = /^(1|2([AB])|3([AB])([AB]))$/.exec(parts[i]);
		if (!m) return null;
		const side = (x?: string): Side => (x === 'B' ? 1 : 0);
		out[COLOURS[i]] = m[1] === '1' ? { tier: 1, ii: 0, iii: 0 } : m[2] ? { tier: 2, ii: side(m[2]), iii: 0 } : { tier: 3, ii: side(m[3]), iii: side(m[4]) };
	}
	return out;
}
