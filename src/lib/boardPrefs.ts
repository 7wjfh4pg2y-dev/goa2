// Each player's own board effects (the turning minion rims, the battle zone's outline, the moving sea) and map
// look — kept in this browser only and never shared, so turning one off changes nobody else's screen. On by
// default; whatever a player switches off stays off for them. (Saves from before v2 had every effect off by
// default and stored that, so their effect switches are not read — everyone starts with them on once.)
import { writable } from 'svelte/store'

// hud: the in-game screen — the 2.0 HUD (top bar, side boards, Chronicle, dash) or the classic one; beam: the spark
// and pulses on the top bar's minion beam. The 2.0 HUD's parts, each expanded (default) or compact — the player's own
// choice, remembered here: compact = the player boards as nameplates (up in the top bar when that is compact too),
// cTop = the narrow top bar, cOrder = the one-line initiative / planning bar, cLog = the Chronicle in the bottom-left
// corner, as tall as the dash
// wisps: the spirit swirl on hexes to act on (spawn points, minions to remove, …); off = a still glowing hex
export type BoardPrefs = { rims: boolean; zone: boolean; sea: boolean; look: 'island' | 'classic'; hud: '2.0' | 'classic'; compact: boolean; cTop: boolean; cOrder: boolean; cLog: boolean; beam: boolean; wisps: boolean; zoomLock: boolean }
export const DEFAULT_PREFS: BoardPrefs = { rims: true, zone: true, sea: true, look: 'island', hud: '2.0', compact: false, cTop: false, cOrder: false, cLog: false, beam: true, wisps: true, zoomLock: false }
const VERSION = 2
const KEY = 'goa2-board-prefs'

export function readPrefs(raw: string | null): BoardPrefs {
	try {
		const p = raw ? JSON.parse(raw) : {}
		const fx = p.v === VERSION ? p : {} // effect switches saved under the old off-by-default rule are not read
		return {
			rims: fx.rims !== false,
			zone: fx.zone !== false,
			sea: fx.sea !== false,
			look: p.look === 'classic' ? 'classic' : 'island',
			hud: p.hud === 'classic' ? 'classic' : '2.0',
			compact: p.compact === true,
			cTop: p.cTop === true,
			cOrder: p.cOrder === true,
			cLog: p.cLog === true,
			zoomLock: p.zoomLock === true, // phones: a pinch never zooms the board
			beam: fx.beam !== false,
			wisps: fx.wisps !== false
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
				try { localStorage.setItem(KEY, JSON.stringify({ ...next, v: VERSION })) } catch { /* private mode: this tab only */ }
				return next
			})
		}
	}
}
export const boardPrefs = createPrefs()
