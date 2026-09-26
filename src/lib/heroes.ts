// Guards of Atlantis II hero registry — a clean, self-contained port of the
// hero data (ported from the OLD build's states.ts). Each hero has an id (used
// for art + draft state), display name/title, complexity (1–4 stars), the pack
// it ships in, its trait tags, and its stat ranges [level1 … max] for
// Attack / Defense / Initiative / Movement.

export type Pack = 'BASE' | 'DEFIANT' | 'RENOWNED' | 'DEVOTED' | 'ARCANE' | 'WAYWARD';

export const PACKS: Pack[] = ['BASE', 'DEFIANT', 'RENOWNED', 'DEVOTED', 'ARCANE', 'WAYWARD'];
export const PACK_LABELS: Record<Pack, string> = {
	BASE: 'Base',
	DEFIANT: 'Defiant',
	RENOWNED: 'Renowned',
	DEVOTED: 'Devoted',
	ARCANE: 'Arcane',
	WAYWARD: 'Wayward'
};

export type Trait =
	| 'damager' | 'disabler' | 'durable' | 'farming' | 'healer'
	| 'melee' | 'pusher' | 'sniper' | 'tactician' | 'tokens';

export const TRAITS: Trait[] = [
	'damager', 'disabler', 'durable', 'farming', 'healer',
	'melee', 'pusher', 'sniper', 'tactician', 'tokens'
];
export const TRAIT_LABELS: Record<Trait, string> = {
	damager: 'Damager', disabler: 'Disabler', durable: 'Durable', farming: 'Farming',
	healer: 'Healer', melee: 'Melee', pusher: 'Pusher', sniper: 'Sniper',
	tactician: 'Tactician', tokens: 'Tokens'
};

/** Stat order matches `stats`: [Attack, Defense, Initiative, Movement]. */
export const STAT_LABELS = ['Attack', 'Defense', 'Initiative', 'Movement'] as const;

export interface Hero {
	id: string;
	name: string;
	title: string;
	stars: number; // complexity 1–4
	pack: Pack;
	traits: Trait[];
	/** Four [min, max] pairs: Attack, Defense, Initiative, Movement. */
	stats: [number, number][];
}

export const HEROES: Hero[] = [
	{ id: 'arien', name: 'Arien', title: 'the Tidemaster', stars: 1, pack: 'BASE', traits: ['tactician', 'disabler', 'durable', 'pusher'], stats: [[8, 8], [5, 6], [4, 4], [5, 6]] },
	{ id: 'brogan', name: 'Brogan', title: 'the Destroyer', stars: 1, pack: 'BASE', traits: ['durable', 'disabler', 'pusher', 'farming'], stats: [[7, 7], [8, 8], [1, 1], [2, 4]] },
	{ id: 'dodger', name: 'Dodger', title: 'the Warlock', stars: 1, pack: 'BASE', traits: ['damager', 'sniper', 'pusher', 'farming', 'disabler'], stats: [[3, 3], [2, 5], [7, 7], [5, 5]] },
	{ id: 'sabina', name: 'Sabina', title: 'the Commander', stars: 1, pack: 'BASE', traits: ['tactician', 'pusher'], stats: [[1, 7], [3, 3], [5, 5], [5, 6]] },
	{ id: 'tigerclaw', name: 'Tigerclaw', title: 'the Cutpurse', stars: 1, pack: 'BASE', traits: ['melee', 'disabler', 'farming'], stats: [[4, 8], [1, 4], [8, 8], [7, 8]] },
	{ id: 'wasp', name: 'Wasp', title: 'the Warmaiden', stars: 1, pack: 'BASE', traits: ['disabler', 'tactician', 'sniper'], stats: [[5, 5], [4, 5], [6, 6], [5, 5]] },
	{ id: 'xargatha', name: 'Xargatha', title: 'the Changed', stars: 1, pack: 'BASE', traits: ['tactician', 'pusher', 'disabler', 'durable', 'sniper'], stats: [[5, 8], [6, 6], [3, 3], [6, 6]] },
	{ id: 'bain', name: 'Bain', title: 'the Bounty Hunter', stars: 2, pack: 'DEFIANT', traits: ['tactician', 'sniper', 'healer', 'farming', 'durable'], stats: [[5, 5], [4, 6], [4, 4], [5, 6]] },
	{ id: 'garrus', name: 'Garrus', title: 'the Gladiator', stars: 2, pack: 'DEFIANT', traits: ['disabler', 'durable', 'tactician'], stats: [[8, 8], [7, 7], [3, 3], [5, 6]] },
	{ id: 'min', name: 'Min', title: 'the Dragonmonk', stars: 2, pack: 'RENOWNED', traits: ['tokens', 'disabler', 'damager', 'melee'], stats: [[4, 8], [3, 8], [8, 8], [6, 6]] },
	{ id: 'misa', name: 'Misa', title: 'the Samurai', stars: 2, pack: 'DEVOTED', traits: ['tactician', 'durable', 'damager'], stats: [[6, 6], [5, 5], [7, 7], [1, 8]] },
	{ id: 'rowenna', name: 'Rowenna', title: 'the Vanguard', stars: 2, pack: 'ARCANE', traits: ['melee', 'durable', 'healer', 'farming', 'pusher', 'tactician'], stats: [[8, 8], [7, 7], [4, 4], [3, 5]] },
	{ id: 'silverarrow', name: 'Silverarrow', title: 'the Pathfinder', stars: 2, pack: 'DEVOTED', traits: ['sniper', 'damager', 'disabler', 'healer', 'farming'], stats: [[2, 2], [1, 1], [7, 7], [6, 7]] },
	{ id: 'ursafar', name: 'Ursafar', title: 'the Savage', stars: 2, pack: 'DEVOTED', traits: ['durable', 'pusher', 'farming', 'melee'], stats: [[6, 6], [6, 6], [5, 5], [1, 5]] },
	{ id: 'whisper', name: 'Whisper', title: 'the Outcast', stars: 2, pack: 'DEVOTED', traits: ['damager', 'durable', 'tactician', 'pusher'], stats: [[7, 7], [4, 4], [7, 7], [3, 5]] },
	{ id: 'brynn', name: 'Brynn', title: 'the Seeker', stars: 3, pack: 'WAYWARD', traits: ['tactician', 'damager', 'durable'], stats: [[4, 8], [4, 4], [7, 7], [5, 6]] },
	{ id: 'cutter', name: 'Cutter', title: 'the Sky Pirate', stars: 3, pack: 'DEFIANT', traits: ['tactician', 'damager', 'farming'], stats: [[4, 8], [4, 4], [6, 6], [4, 8]] },
	{ id: 'hanu', name: 'Hanu', title: 'the Trickster', stars: 3, pack: 'RENOWNED', traits: ['tactician', 'sniper', 'pusher'], stats: [[4, 4], [1, 1], [8, 8], [8, 8]] },
	{ id: 'mortimer', name: 'Mortimer', title: 'the Awakener', stars: 3, pack: 'WAYWARD', traits: ['melee', 'tokens', 'farming', 'durable', 'pusher'], stats: [[8, 8], [7, 7], [2, 2], [4, 4]] },
	{ id: 'mrak', name: 'Mrak', title: 'the Rockshaper', stars: 3, pack: 'ARCANE', traits: ['melee', 'tokens', 'durable', 'disabler', 'tactician'], stats: [[8, 8], [8, 8], [1, 1], [2, 4]] },
	{ id: 'swift', name: 'Swift', title: 'the Sharpshooter', stars: 3, pack: 'RENOWNED', traits: ['sniper', 'farming', 'tactician'], stats: [[5, 5], [2, 2], [4, 4], [3, 7]] },
	{ id: 'tali', name: 'Tali', title: 'the Spiritcaller', stars: 3, pack: 'DEVOTED', traits: ['damager', 'pusher', 'healer', 'durable', 'tokens'], stats: [[4, 6], [4, 4], [5, 8], [5, 5]] },
	{ id: 'trinkets', name: 'Trinkets', title: 'the Scavenger', stars: 3, pack: 'DEFIANT', traits: ['sniper', 'damager', 'pusher', 'tokens'], stats: [[3, 5], [2, 4], [6, 6], [7, 8]] },
	{ id: 'widget', name: 'Widget', title: 'and Pyro', stars: 3, pack: 'WAYWARD', traits: ['tactician', 'pusher', 'damager', 'tokens'], stats: [[5, 5], [4, 4], [4, 4], [5, 6]] },
	{ id: 'wuk', name: 'Wuk', title: 'the Grove Keeper', stars: 3, pack: 'RENOWNED', traits: ['tokens', 'pusher', 'durable', 'sniper', 'tactician', 'healer'], stats: [[5, 5], [8, 8], [1, 1], [3, 4]] },
	{ id: 'emmitt', name: 'Emmitt', title: 'the Traveller', stars: 4, pack: 'WAYWARD', traits: ['melee', 'tactician', 'durable', 'disabler', 'tokens'], stats: [[5, 8], [6, 6], [1, 1], [2, 4]] },
	{ id: 'gydion', name: 'Gydion', title: 'the Archwizard', stars: 4, pack: 'ARCANE', traits: ['sniper', 'tactician', 'farming', 'damager', 'pusher', 'tokens'], stats: [[5, 6], [3, 5], [3, 3], [1, 4]] },
	{ id: 'ignatia', name: 'Ignatia', title: 'the Mad', stars: 4, pack: 'RENOWNED', traits: ['sniper', 'damager', 'tokens', 'tactician', 'pusher'], stats: [[5, 5], [6, 6], [2, 2], [4, 5]] },
	{ id: 'nebkher', name: 'NebKher', title: 'the Harbinger', stars: 4, pack: 'DEFIANT', traits: ['disabler', 'tokens', 'sniper'], stats: [[2, 3], [5, 6], [1, 1], [2, 5]] },
	{ id: 'razzle', name: 'Razzle', title: 'the Ringmaster', stars: 4, pack: 'ARCANE', traits: ['tactician', 'melee'], stats: [[3, 3], [1, 4], [8, 8], [5, 6]] },
	{ id: 'snorri', name: 'Snorri', title: 'the Runescribe', stars: 4, pack: 'ARCANE', traits: ['sniper', 'farming', 'durable', 'damager', 'pusher', 'healer'], stats: [[5, 6], [5, 6], [2, 2], [4, 5]] },
	{ id: 'takahide', name: 'Takahide', title: 'the Warlord', stars: 4, pack: 'WAYWARD', traits: ['durable', 'sniper', 'tactician', 'damager', 'farming'], stats: [[5, 7], [4, 7], [3, 5], [1, 4]] }
];

export const HERO_BY_ID: Record<string, Hero> = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const heroById = (id: string): Hero | undefined => HERO_BY_ID[id];

/** Hero portrait URLs, keyed by hero id (bundled via Vite). */
const avatarUrls = import.meta.glob('./images/avatars/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
export const heroAvatar = (id: string): string => avatarUrls[`./images/avatars/${id}.webp`] ?? '';

/** Full landscape splash art, keyed by hero id. */
const splashUrls = import.meta.glob('./images/avatars_full/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
export const heroSplash = (id: string): string => splashUrls[`./images/avatars_full/${id}.webp`] ?? '';

/** Per-hero emblem/logo (the crest shown beside the name). */
const logoUrls = import.meta.glob('./images/logos/*.png', { eager: true, import: 'default' }) as Record<string, string>;
export const heroLogo = (id: string): string => logoUrls[`./images/logos/${id}.png`] ?? '';

// Stat/trait/star icons.
const iconUrls = import.meta.glob('./images/hero_icons/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const STAT_ICON_FILES = ['attack_white', 'defense_white', 'initiative_white', 'movement_white'];
/** White stat icon by stat index (0=Attack … 3=Movement). */
export const statIcon = (i: number): string => iconUrls[`./images/hero_icons/${STAT_ICON_FILES[i]}.png`] ?? '';
/** Gold role symbol for a trait, or '' when none exists (e.g. 'tokens'). */
export const traitIcon = (t: Trait): string => iconUrls[`./images/hero_icons/trait_${t}.png`] ?? '';
export const starIcon = (): string => iconUrls['./images/hero_icons/star.png'] ?? '';

/** The maximum any stat pip bar shows. */
export const STAT_PIPS = 8;

/** Heroes sorted alphabetically by name (for the draft grid). */
export const HEROES_ALPHA: Hero[] = [...HEROES].sort((a, b) => a.name.localeCompare(b.name));

// ── round portraits: frame each hero's FACE, not the middle of the painting ──
// Avatar art is 2:1 landscape; a centred circle crop often cuts the face off or
// shows armour. Each entry is where the face sits, as fractions of the art's
// width/height; portraits zoom in on that point.
const HERO_FACE: Record<string, [number, number]> = {
	arien: [0.65, 0.3], bain: [0.52, 0.11], brogan: [0.49, 0.3], brynn: [0.48, 0.23], cutter: [0.66, 0.29],
	dodger: [0.66, 0.4], emmitt: [0.31, 0.42], garrus: [0.48, 0.33], gydion: [0.66, 0.36], hanu: [0.73, 0.4],
	ignatia: [0.51, 0.46], min: [0.42, 0.22], misa: [0.7, 0.19], mortimer: [0.58, 0.19], mrak: [0.41, 0.33],
	nebkher: [0.44, 0.3], razzle: [0.6, 0.33], rowenna: [0.72, 0.37], sabina: [0.64, 0.28], silverarrow: [0.52, 0.24],
	snorri: [0.56, 0.29], swift: [0.58, 0.33], takahide: [0.53, 0.24], tali: [0.44, 0.26], tigerclaw: [0.72, 0.24],
	trinkets: [0.39, 0.26], ursafar: [0.45, 0.33], wasp: [0.6, 0.17], whisper: [0.49, 0.29], widget: [0.33, 0.45],
	wuk: [0.53, 0.16], xargatha: [0.5, 0.27]
};
const FACE_ZOOM = 2.3; // tuned per hero against a rendered contact sheet of every token crop
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Inline CSS for a round portrait (a square element): the avatar art zoomed
 * and positioned so the hero's face sits in the middle. */
export function portraitCss(id: string): string {
	const [fx, fy] = HERO_FACE[id] ?? [0.55, 0.32];
	const z = FACE_ZOOM;
	const px = clamp01((0.5 - 2 * z * fx) / (1 - 2 * z)) * 100;
	const py = clamp01((0.5 - z * fy) / (1 - z)) * 100;
	return `background-image:url('${heroAvatar(id)}');background-size:${200 * z}% ${100 * z}%;background-position:${px.toFixed(1)}% ${py.toFixed(1)}%;`;
}

/** SVG equivalent: where to draw the avatar image so the face is centred in a
 * circle of diameter `d` centred on (cx, cy). Clip the image to that circle. */
export function portraitRect(id: string, cx: number, cy: number, d: number) {
	const [fx, fy] = HERO_FACE[id] ?? [0.55, 0.32];
	const w = 2 * d * FACE_ZOOM, h = d * FACE_ZOOM;
	const x = Math.min(cx - d / 2, Math.max(cx + d / 2 - w, cx - fx * w));
	const y = Math.min(cy - d / 2, Math.max(cy + d / 2 - h, cy - fy * h));
	return { href: heroAvatar(id), x, y, w, h };
}
