// Player identity + "resume my game" tickets.
//
// Identity is PER TAB (sessionStorage): two tabs in the same browser are two
// different players, so you can host in one and join from another. A refresh
// keeps the tab's id.
//
// To rejoin after CLOSING a tab, each tab leaves a resume ticket in
// localStorage keyed by its id, and holds a Web Lock named after that id while
// it's open. A brand-new tab may adopt a ticket's id only if no open tab still
// holds that lock (i.e. its original tab is gone) and the ticket is recent.
// Tickets expire, so an old game never hijacks a fresh visit.

const ID_KEY = 'goa2-client-id';
const TICKET_PREFIX = 'goa2-active:';
const LEGACY_TICKET = 'goa2-active'; // pre-per-tab builds kept one shared ticket
export const RESUME_TTL_MS = 30 * 60 * 1000;

export interface ResumeTicket {
	id: string; // the player id this ticket belongs to
	at: number; // last time it was refreshed (epoch ms)
	room: string;
	name: string;
	color: string;
	seat: number;
	creator: boolean;
	seed: unknown | null; // MatchState seed, for a creator re-creating an emptied room
}

const newId = () =>
	globalThis.crypto?.randomUUID?.() ?? `c_${Math.random().toString(36).slice(2)}`;

/** This tab's player id (stable across refreshes of the same tab). Without
 * storage (tests, locked-down browsers) every call is a fresh id. */
export function tabClientId(): string {
	try {
		let id = sessionStorage.getItem(ID_KEY);
		if (!id) {
			id = newId();
			sessionStorage.setItem(ID_KEY, id);
		}
		return id;
	} catch {
		return newId();
	}
}

function hasTabId(): boolean {
	try { return !!sessionStorage.getItem(ID_KEY); } catch { return false; }
}
function adoptId(id: string) {
	try { sessionStorage.setItem(ID_KEY, id); } catch { /* ignore */ }
}

const lockName = (id: string) => `goa2-id-${id}`;
async function idInUse(id: string): Promise<boolean> {
	try {
		const q = await navigator.locks.query();
		return !!q.held?.some((l) => l.name === lockName(id));
	} catch {
		return false;
	}
}
function holdIdLock(id: string) {
	try { void navigator.locks?.request(lockName(id), () => new Promise<void>(() => {})); } catch { /* ignore */ }
}

function readTicketKey(key: string): ResumeTicket | null {
	try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
const fresh = (t: ResumeTicket | null): t is ResumeTicket =>
	!!t && !!t.id && !!t.room && t.room !== 'TABLE' && Date.now() - (t.at ?? 0) < RESUME_TTL_MS;

/** Work out who this tab is. Call once on app start, before joining anything.
 * Returns the tab's id and the resume ticket it should rejoin with, if any. */
export async function claimIdentity(): Promise<{ id: string; ticket: ResumeTicket | null }> {
	const tickets: ResumeTicket[] = [];
	try {
		localStorage.removeItem(LEGACY_TICKET);
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const k = localStorage.key(i);
			if (!k?.startsWith(TICKET_PREFIX)) continue;
			const t = readTicketKey(k);
			if (fresh(t)) tickets.push(t);
			else localStorage.removeItem(k); // expired / malformed
		}
	} catch { /* no storage */ }

	// a brand-new tab (no id yet) may pick up the most recent ticket whose tab is closed
	if (!hasTabId()) {
		tickets.sort((a, b) => b.at - a.at);
		for (const t of tickets) {
			if (!(await idInUse(t.id))) { adoptId(t.id); break; }
		}
	}
	const id = tabClientId();
	holdIdLock(id);
	return { id, ticket: tickets.find((t) => t.id === id) ?? null };
}

/** Merge into (or create) this tab's resume ticket, refreshing its timestamp. */
export function writeTicket(id: string, patch: Partial<ResumeTicket>, base: Omit<ResumeTicket, 'id' | 'at'>) {
	try {
		const cur = readTicketKey(TICKET_PREFIX + id) ?? { ...base, id, at: 0 };
		localStorage.setItem(TICKET_PREFIX + id, JSON.stringify({ ...cur, ...patch, id, at: Date.now() }));
	} catch { /* ignore */ }
}
export function clearTicket(id: string) {
	try { localStorage.removeItem(TICKET_PREFIX + id); } catch { /* ignore */ }
}
