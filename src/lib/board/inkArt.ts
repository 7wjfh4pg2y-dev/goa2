// The INK & WASH art (tools/ink_art.mjs bakes it): hero portraits framed square, Razzle's double faces, and the
// kit tokens / markers / runes — used by the Ink & wash retheme's pieces (InkHero, InkKit).
const heroes = import.meta.glob('../images/ink/heroes/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const doubles = import.meta.glob('../images/ink/doubles/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const tokens = import.meta.glob('../images/ink/tokens/*.webp', { eager: true, import: 'default' }) as Record<string, string>

/** a hero's portrait in ink & wash, square, the face centred (face 1–3 = Razzle's doubles) */
export const inkFace = (id?: string, face?: number): string | undefined =>
	!id ? undefined : face ? doubles[`../images/ink/doubles/${id}-${face}.webp`] : heroes[`../images/ink/heroes/${id}.webp`]
/** a kit token / marker / rune's art in ink & wash (same name as cards/images/<name>.png) */
export const inkToken = (name?: string): string | undefined => (name ? tokens[`../images/ink/tokens/${name}.webp`] : undefined)
