// Each player's own board effects (the turning minion rims, the battle zone's outline, the moving sea) and map
// look — kept in this browser only and never shared, so turning one off changes nobody else's screen. On by
// default; whatever a player switches off stays off for them. (Saves from before v2 had every effect off by
// default and stored that, so their effect switches are not read — everyone starts with them on once.)
import { writable } from 'svelte/store'

// beam: the spark
// and pulses on the top bar's minion beam. The 2.0 HUD's parts, each expanded (default) or compact — the player's own
// choice, remembered here: compact = the player boards as nameplates (up in the top bar when that is compact too),
// cTop = the narrow top bar, cOrder = the one-line initiative / planning bar, cLog = the Chronicle in the bottom-left
// corner, as tall as the dash
// wisps: the spirit swirl on hexes to act on (spawn points, minions to remove, …); off = a still glowing hex
// dash: the 4★ heroes' own dash buttons' effects (Ignatia's flames, …) — one switch for all of them
export type BoardPrefs = { dash: boolean; rims: boolean; zone: boolean; sea: boolean; look: 'island' | 'classic'; compact: boolean; cTop: boolean; cOrder: boolean; cLog: boolean; beam: boolean; wisps: boolean; zoomLock: boolean; turnCue: boolean; laugh: boolean; sparkle: boolean; spells: boolean; essence: boolean; emToast: boolean; emClock: boolean; snInscribe: boolean; runeFlare: boolean; igEq: boolean; igSwirl: boolean; igChaos: boolean; tkSwap: boolean; tkWave: boolean; tkWar: boolean; rzShuffle: boolean; rzComic: boolean; rzPoof: boolean; rzApplause: boolean; rzTickets: boolean; shelfL: boolean; shelfR: boolean; themes: Record<string, string> }
export const DEFAULT_PREFS: BoardPrefs = { dash: true, rims: true, zone: true, sea: true, look: 'island', compact: false, cTop: false, cOrder: false, cLog: false, beam: true, wisps: true, zoomLock: false, turnCue: true, laugh: true, sparkle: true, spells: true, essence: true, emToast: true, emClock: true, snInscribe: true, runeFlare: true, igEq: true, igSwirl: true, igChaos: true, tkSwap: true, tkWave: true, tkWar: true, rzShuffle: true, rzComic: true, rzPoof: true, rzApplause: true, rzTickets: true, shelfL: true, shelfR: true, themes: {} }
const VERSION = 2
const KEY = 'goa2-board-prefs'
const GAME_KEY = 'goa2-hero-fx'

// The 4★ heroes' effects (the wheel's Heroes bubble): every one on at the start of each game, whatever was switched
// off in the last one — kept for this game only (sessionStorage, so a reload mid-game keeps them), never saved
// with the other prefs. dash = a 4★ hero's own dash button; sparkle = Razzle's ultimate round hers; the rest are
// the splashes / toasts / board effects named in the wheel.
export const HERO_FX = ['dash', 'laugh', 'sparkle', 'spells', 'essence', 'emToast', 'emClock', 'snInscribe', 'runeFlare', 'igEq', 'igSwirl', 'igChaos', 'tkSwap', 'tkWave', 'tkWar', 'rzShuffle', 'rzComic', 'rzPoof', 'rzApplause', 'rzTickets'] as const
export type HeroFx = (typeof HERO_FX)[number]
const HERO_ON = Object.fromEntries(HERO_FX.map((k) => [k, true])) as Record<HeroFx, boolean>
const heroPart = (p: Partial<BoardPrefs>) => Object.fromEntries(HERO_FX.filter((k) => k in p).map((k) => [k, p[k]])) as Partial<Record<HeroFx, boolean>>
const withoutHero = (p: BoardPrefs) => Object.fromEntries(Object.entries(p).filter(([k]) => !(HERO_FX as readonly string[]).includes(k)))

// a map's retheme as picked on this browser: { 'forgotten island': 'ink' } (rethemes.ts keys / ids)
const cleanThemes = (t: unknown): Record<string, string> => {
	if (!t || typeof t !== 'object') return {}
	return Object.fromEntries(Object.entries(t as Record<string, unknown>).filter(([, v]) => typeof v === 'string' && v)) as Record<string, string>
}

export function readPrefs(raw: string | null): BoardPrefs {
	try {
		const p = raw ? JSON.parse(raw) : {}
		const fx = p.v === VERSION ? p : {} // effect switches saved under the old off-by-default rule are not read
		return {
			rims: fx.rims !== false,
			zone: fx.zone !== false,
			sea: fx.sea !== false,
			look: p.look === 'classic' ? 'classic' : 'island',
			compact: p.compact === true,
			cTop: p.cTop === true,
			cOrder: p.cOrder === true,
			cLog: p.cLog === true,
			zoomLock: p.zoomLock === true, // phones: a pinch never zooms the board
			shelfL: p.shelfL !== false, // a phone on its side: the left column (the other players) is out
			shelfR: p.shelfR !== false, // … and the right column (your dash); shelved = dragged off the screen
			beam: fx.beam !== false,
			wisps: fx.wisps !== false,
			turnCue: fx.turnCue !== false, // the YOUR TURN cue (YourTurn.svelte)
			themes: cleanThemes(p.themes), // map key → the retheme picked for that map (board/rethemes.ts)
			...HERO_ON // the 4★ heroes' effects are never kept between games (see useGame)
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
	let game = ''
	return {
		subscribe: store.subscribe,
		/** a game is on screen: its own hero-effect switches (all on for a game we haven't seen in this tab) */
		useGame(id: string) {
			if (id === game) return
			game = id
			let kept: Partial<Record<HeroFx, boolean>> = {}
			try { const g = JSON.parse(sessionStorage.getItem(GAME_KEY) ?? 'null'); if (g?.game === id) kept = heroPart(g.fx ?? {}) } catch { /* nothing kept */ }
			store.update((p) => ({ ...p, ...HERO_ON, ...kept }))
		},
		/** flip one switch (or set the look) and remember it in this browser */
		set(patch: Partial<BoardPrefs>) {
			store.update((p) => {
				const next = { ...p, ...patch }
				try { localStorage.setItem(KEY, JSON.stringify({ ...withoutHero(next), v: VERSION })) } catch { /* private mode: this tab only */ }
				if (game && Object.keys(heroPart(patch)).length) try { sessionStorage.setItem(GAME_KEY, JSON.stringify({ game, fx: heroPart(next) })) } catch { /* this page only */ }
				return next
			})
		}
	}
}
export const boardPrefs = createPrefs()
