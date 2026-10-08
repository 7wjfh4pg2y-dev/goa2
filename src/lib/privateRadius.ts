// The area radius can be PRIVATE: measured on your own screen only, never in the shared state.
// `radiusPrivate` = your choice (kept on this device); `privRadius` = the radius you're showing privately,
// tagged with the round-turn it was set in, so it clears at the end of the turn like the shared one.
import { writable } from 'svelte/store'

const KEY = 'goa2-radius-private'
const start = (() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })()
export const radiusPrivate = writable<boolean>(start)
radiusPrivate.subscribe((v) => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* private mode */ } })

export const privRadius = writable<{ n: number; key: string } | null>(null)
