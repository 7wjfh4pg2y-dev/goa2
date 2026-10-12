// NUDGES — "hurry up": a tap on another player in the turn order (the host: on the player acting) sends them a
// gentle nudge (a broadcast, never the shared state). Two limits, the user's: once nudged, a player can't be nudged
// again for 10 s (by anyone — it just doesn't happen), and whoever nudged can't nudge anyone for 15 s.
// Every client keeps the same book from the nudges it sees, so a refused nudge is never even sent. Tested in nudge.test.ts.
export const NUDGE_TARGET_MS = 10_000
export const NUDGE_SENDER_MS = 15_000

export type Nudge = { id: string; from: string; to: string; at: number }
/** sentAt = when WE last nudged; gotAt[pid] = when pid was last nudged (as this client saw it) */
export type NudgeBook = { sentAt: number; gotAt: Record<string, number> }
export const emptyBook = (): NudgeBook => ({ sentAt: -Infinity, gotAt: {} })

/** How long `me` must wait before nudging `to` (0 = now; Infinity = never, e.g. yourself). */
export function nudgeWait(b: NudgeBook, me: string, to: string, now: number): number {
	if (!to || to === me) return Infinity
	const mine = b.sentAt + NUDGE_SENDER_MS - now
	const theirs = (b.gotAt[to] ?? -Infinity) + NUDGE_TARGET_MS - now
	return Math.max(0, mine, theirs)
}

/** A nudge seen (sent by us or anyone): whether it lands (its target wasn't nudged in the last 10 s), and the book after. */
export function seeNudge(b: NudgeBook, n: Nudge, me: string, now: number): { book: NudgeBook; lands: boolean } {
	if (n.from === n.to) return { book: b, lands: false }
	const lands = now - (b.gotAt[n.to] ?? -Infinity) >= NUDGE_TARGET_MS
	if (!lands) return { book: b, lands }
	return { book: { sentAt: n.from === me ? now : b.sentAt, gotAt: { ...b.gotAt, [n.to]: now } }, lands }
}
