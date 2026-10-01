// What players see the two teams called. Internally (state, map tiles, image files, CSS
// classes) the teams stay 'orange' / 'blue'; only the words on screen change:
// orange = the Atlanteans, blue = the Titans.
type T = 'orange' | 'blue'

/** The team, plural (it takes a plural verb): "Atlanteans win", "Titans push". */
export const teamName = (t?: string | null): string => (t === 'blue' ? 'Titans' : t === 'orange' ? 'Atlanteans' : '')
/** One member / the adjective: "Atlantean Life", "the Titan Throne", "a Titan melee minion". */
export const teamAdj = (t?: string | null): string => (t === 'blue' ? 'Titan' : t === 'orange' ? 'Atlantean' : '')
/** "an Atlantean" / "a Titan". */
export const aTeam = (t?: string | null): string => (t === 'blue' ? 'a Titan' : t === 'orange' ? 'an Atlantean' : 'a')
/** "an Atlantean melee minion" / "a Titan heavy minion". */
export const aMinion = (t?: string | null, role?: string | null): string => `${aTeam(t)} ${role ?? ''} minion`.replace(/\s+/g, ' ')
/** Zone / lane names are keyed by the map's Orange/Blue wording; show them with the team names. */
export const placeName = (z?: string | null): string => (z ?? '').replace(/\bOrange\b/g, 'Atlantean').replace(/\bBlue\b/g, 'Titan')
export const TEAMS: T[] = ['orange', 'blue']
