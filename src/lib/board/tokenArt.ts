// The painted art for the heroes' own pieces (cards/images): tokens are flat-topped HEXES
// (token_*.png), markers and runes are ROUND (marker_*.png, rune_*_marker.png).
const art = import.meta.glob('../cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>

export const tokenImg = (name?: string): string | undefined => (name ? art[`../cards/images/${name}.png`] : undefined)
/** Markers (poison, bounty, Snorri's runes) are round; everything else a hero places is a hex token. */
export const isMarkerArt = (t?: string): boolean => !!t && (t.startsWith('marker_') || t.startsWith('rune_'))
