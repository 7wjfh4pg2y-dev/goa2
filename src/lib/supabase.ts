import { createClient } from '@supabase/supabase-js'

// Supabase project for the Guards of Atlantis II digital table.
//
// The anon/public key is intended to be embedded in client-side code — it is
// shipped in the browser bundle regardless of where it lives. Real access
// control is enforced by Row-Level Security (RLS) and Realtime authorization,
// which we configure on the database side (Phase 1+), NOT by hiding this key.
//
// Never put the service_role / secret key or the database password in here.
export const SUPABASE_URL = 'https://fsbnndmryjbowquzdtfq.supabase.co'
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYm5uZG1yeWpib3dxdXpkdGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTkzNTcsImV4cCI6MjEwNDU5NTM1N30.o6rbm5kdo8g0FMbYVxRjXschvzf9Ee1ieNjcXXR-A9A'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	realtime: {
		// Keep cursor updates snappy without flooding the free-tier limits.
		params: { eventsPerSecond: 30 },
		// heartbeats from a Web Worker: browsers throttle timers in background tabs (switch to
		// Discord, minimise the window…), heartbeats ran late, the server dropped the socket and
		// that player vanished from presence — which also handed the host role around
		worker: typeof Worker !== 'undefined',
	},
})

// realtime-js drops a closed channel from its list BY TOPIC. When we rebuild a
// wedged room channel, the old one can finish closing after the new one (same
// topic) exists — and would evict the new one with it. Compare by identity
// instead. (Guarded: if the internals ever change, this is simply skipped.)
{
	const rt = supabase.realtime as unknown as {
		channels?: unknown[]
		_remove?: (ch: unknown) => void
		_schedulePendingDisconnect?: () => void
	}
	if (typeof rt._remove === 'function' && Array.isArray(rt.channels)) {
		rt._remove = (ch: unknown) => {
			rt.channels = (rt.channels ?? []).filter((c) => c !== ch)
			if (!rt.channels.length) rt._schedulePendingDisconnect?.()
		}
	}
}

// Phones: a page that comes back from the background (another app opened, the screen off) can hold a socket
// that still says "open" but is dead — the OS dropped it while the page was frozen. Nothing notices until the
// next heartbeat fails (up to ~30 s later), and everything sent meanwhile is lost. So on waking we ping the
// socket ourselves: no answer within `ms` → close it the way realtime's own heartbeat timeout does (its
// channels error out and rejoin on a fresh socket). Resolves true when the socket answered (or can't be
// checked: not open — realtime is already reconnecting it — or the internals changed), false when it was dead.
type PhxSocket = { isConnected(): boolean; ping(cb: (ms: number) => void): boolean; pendingHeartbeatRef: string | null; heartbeatTimeout(): void }
export function checkSocket(ms = 2500): Promise<boolean> {
	return new Promise((done) => {
		let sock: PhxSocket | undefined
		try { sock = (supabase.realtime as unknown as { socketAdapter?: { getSocket?: () => PhxSocket } }).socketAdapter?.getSocket?.() } catch { /* ignore */ }
		try {
			if (!sock || typeof sock.ping !== 'function' || typeof sock.heartbeatTimeout !== 'function' || !sock.isConnected()) return done(true)
			let answered = false
			if (!sock.ping(() => { answered = true; done(true) })) return done(true)
			setTimeout(() => {
				if (answered) return
				try { if (sock!.isConnected()) { sock!.pendingHeartbeatRef ||= 'wake'; sock!.heartbeatTimeout() } } catch { /* ignore */ }
				done(false)
			}, ms)
		} catch { done(true) }
	})
}
