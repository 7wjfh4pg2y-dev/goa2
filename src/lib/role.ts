// Role gate: Admin (GM) vs Player.
//
// SOFT GATE ONLY — a public static site can't truly restrict access; this just
// keeps players out of the GM tools. We store only a SHA-256 hash of the admin
// password (plaintext not in the repo); the chosen role is kept in localStorage.
//
// The GM unlock lasts while the GM is around: GM_IDLE_MS after the last tap / key (any tab), so going home,
// playing as a player, a reload or the GM pages never ask for the password again; Sign out (or 30 idle minutes)
// locks it.

import { writable, get } from 'svelte/store'
import { browser } from '$app/environment'

export type Role = 'admin' | 'player' | null

// SHA-256 of the admin password. Change it by replacing this hash, e.g.:
//   node -e "console.log(require('crypto').createHash('sha256').update('YOURPW').digest('hex'))"
export const ADMIN_HASH = 'daaad6e5604e8e17bd9f108d91e26afe6281dac8fda0091040a7a6d7bd9b43b5'

const KEY = 'goa2-role'
const GM_KEY = 'goa2-gm-until' // when the GM unlock runs out (epoch ms)
export const GM_IDLE_MS = 30 * 60 * 1000

function gmUntil(): number {
	try { return Number(localStorage.getItem(GM_KEY)) || 0 } catch { return 0 }
}
function setGmUntil(t: number) {
	try { if (t) localStorage.setItem(GM_KEY, String(t)); else localStorage.removeItem(GM_KEY) } catch { /* ignore */ }
}
/** The GM password was entered and the GM has not been idle for GM_IDLE_MS since. */
export function gmActive(): boolean {
	return browser && gmUntil() > Date.now()
}

function loadRole(): Role {
	if (!browser) return null
	try {
		const v = localStorage.getItem(KEY)
		if (v === 'admin') return gmActive() ? 'admin' : null // the unlock ran out while away
		return v === 'player' ? v : null
	} catch {
		return null
	}
}

export const role = writable<Role>(loadRole())

if (browser) {
	// activity keeps the unlock alive (written at most once a minute); a check every minute locks it once idle
	let lastTouch = 0
	const touch = () => {
		const now = Date.now()
		if (now - lastTouch < 60_000 || !gmActive()) return
		lastTouch = now
		setGmUntil(now + GM_IDLE_MS)
	}
	const expire = () => { if (!gmActive() && get(role) === 'admin') role.set(null) }
	for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, touch, { passive: true, capture: true })
	document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { expire(); touch() } })
	setInterval(expire, 60_000)
}

role.subscribe((v) => {
	if (!browser) return
	try {
		if (v) localStorage.setItem(KEY, v)
		else localStorage.removeItem(KEY)
	} catch {
		/* ignore */
	}
})

async function computeHash(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function tryAdmin(pw: string): Promise<boolean> {
	try {
		if ((await computeHash(pw)) === ADMIN_HASH) {
			setGmUntil(Date.now() + GM_IDLE_MS)
			role.set('admin')
			return true
		}
	} catch {
		/* ignore */
	}
	return false
}

/** Playing as a player keeps an active GM unlock (the GM pages stay open to them). */
export function enterAsPlayer() {
	role.set(gmActive() ? 'admin' : 'player')
}

/** Back to the landing page: forget the player choice, keep an active GM unlock. */
export function leaveRole() {
	role.set(gmActive() ? 'admin' : null)
}

/** The GM tools' Sign out: lock the GM unlock now. */
export function signOut() {
	setGmUntil(0)
	role.set(null)
}
