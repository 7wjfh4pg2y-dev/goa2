// Each player's own board effects (the turning minion rims, the battle zone's outline, the moving sea) and map
// look — kept in this browser only and never shared, so turning one on changes nobody else's screen. Off by
// default: playtesters found the motion too much.
import { writable } from 'svelte/store'

// hud: the in-game screen — the 2.0 HUD (top bar, side boards, Chronicle, dash) or the classic one; compact: the
// 2.0 side boards shrink to nameplates; beam: the spark and pulses on the top bar's minion beam
export type BoardPrefs = { rims: boolean; zone: boolean; sea: boolean; look: 'island' | 'classic'; hud: '2.0' | 'classic'; compact: boolean; beam: boolean }
export const DEFAULT_PREFS: BoardPrefs = { rims: false, zone: false, sea: false, look: 'island', hud: '2.0', compact: false, beam: false }
const KEY = 'goa2-board-prefs'

export function readPrefs(raw: string | null): BoardPrefs {
	try {
		const p = raw ? JSON.parse(raw) : {}
		return {
			rims: p.rims === true,
			zone: p.zone === true,
			sea: p.sea === true,
			look: p.look === 'classic' ? 'classic' : 'island',
			hud: p.hud === 'classic' ? 'classic' : '2.0',
			compact: p.compact === true,
			beam: p.beam === true
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
