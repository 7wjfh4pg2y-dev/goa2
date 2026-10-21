import { writable } from 'svelte/store'

/** A lobby, hero select or game is open on this tab: a new deploy must not reload it by itself (+layout) —
 *  the ☰ Game lobby offers Update · Reload instead, and the reload happens once the player is back on the menus. */
export const inPlay = writable(false)
