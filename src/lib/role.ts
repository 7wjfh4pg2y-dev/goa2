// Role gate: Admin (GM) vs Player.
//
// SOFT GATE ONLY — a public static site can't truly restrict access; this just
// keeps players out of the GM tools. We store only a SHA-256 hash of the admin
// password (plaintext not in the repo); the chosen role is kept in localStorage.

import { writable } from 'svelte/store'
import { browser } from '$app/environment'

export type Role = 'admin' | 'player' | null

// SHA-256 of the admin password. Change it by replacing this hash, e.g.:
//   node -e "console.log(require('crypto').createHash('sha256').update('YOURPW').digest('hex'))"
export const ADMIN_HASH = 'daaad6e5604e8e17bd9f108d91e26afe6281dac8fda0091040a7a6d7bd9b43b5'

const KEY = 'goa2-role'

function loadRole(): Role {
	if (!browser) return null
	try {
		const v = localStorage.getItem(KEY)
		return v === 'admin' || v === 'player' ? v : null
	} catch {
		return null
	}
}

export const role = writable<Role>(loadRole())

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
			role.set('admin')
			return true
		}
	} catch {
		/* ignore */
	}
	return false
}

export function enterAsPlayer() {
	role.set('player')
}

export function signOut() {
	role.set(null)
}
