// Map RETHEMES: another way to draw one particular map, picked by each player for themselves (the wheel's Version
// bubble; boardPrefs.themes, this browser only). A retheme belongs to ONE map — keyed by the map's name, so a renamed
// copy from the editor is a new map without it. To add one: a drawing layer in BoardCanvas + an entry here.

export type ThemeId = 'ink'
export type Retheme = { id: ThemeId; label: string; title: string }

export const RETHEMES: Record<string, Retheme[]> = {
	'forgotten island': [{ id: 'ink', label: 'Ink', title: 'Ink & wash: an old atlas page, watercolour and pen' }]
}

export const mapKey = (name: string | undefined | null): string => (name ?? '').trim().toLowerCase()
export const rethemesFor = (name: string | undefined | null): Retheme[] => RETHEMES[mapKey(name)] ?? []

/** the retheme this player picked for this map, if the map has it */
export function themeFor(name: string | undefined | null, picks: Record<string, string>): ThemeId | null {
	const pick = picks[mapKey(name)]
	return rethemesFor(name).find((t) => t.id === pick)?.id ?? null
}
