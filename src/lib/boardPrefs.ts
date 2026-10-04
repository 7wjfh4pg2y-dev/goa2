// Each player's own board effects (the turning minion rims, the battle zone's outline, the moving sea) and map
// look — kept in this browser only and never shared, so turning one on changes nobody else's screen. Off by
// default: playtesters found the motion too much.
import { writable } from 'svelte/store'

export type BoardPrefs = { rims: boolean; zone: boolean; sea: boolean; look: 'island' | 'classic' }
export const DEFAULT_PREFS: BoardPrefs = { rims: false, zone: false, sea: false, look: 'island' }
const KEY = 'goa2-board-prefs'

export function readPrefs(raw: string | null): BoardPrefs {
	try {
		const p = raw ? JSON.parse(raw) : {}
		return {
			rims: p.rims === true,
			zone: p.zone === true,
			sea: p.sea === true,
			look: p.look === 'classic' ? 'classic' : 'island'
		}
	} catch {
		return { ...DEFAULT_PREFS }
	}
}

const load = (): BoardPrefs => {
	try { return readPrefs(typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)) } catch { return { ...DEFAULT_PREFS } }
}

function createPrefs() {
	const store = writable<BoardPrefs>(load())
	return {
		subscribe: store.subscribe,
		/** flip one switch (or set the look) and remember it in this browser */
		set(patch: Partial<BoardPrefs>) {
			store.update((p) => {
				const next = { ...p, ...patch }
				try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: this tab only */ }
				return next
			})
		}
	}
}
export const boardPrefs = createPrefs()
