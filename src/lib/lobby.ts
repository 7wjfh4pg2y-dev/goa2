// Public room directory: hosts announce their room on a shared presence channel,
// and the Join screen watches it to list what's open. Presence-only (no DB) —
// an announcement lives only while the host is connected (a host hand-over
// re-announces from the new host).
//
// Both sides HEAL themselves: every KEEPALIVE_MS the host re-tracks its entry
// (and rebuilds the channel when it isn't joined — a socket blip mid-game used
// to drop the room off the list for good), and the browser re-subscribes the
// same way. A page coming back from the background does it at once.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

const DIR = 'goa2-rooms';
const KEEPALIVE_MS = 20000;

export interface RoomInfo {
	room: string;
	host: string;
	seats: number;
	count: number; // seated players
	started: boolean;
	/** where the room is: the lobby, hero select, or the game (with its round) */
	phase?: 'lobby' | 'draft' | 'game';
	round?: number;
	/** the seated players' names (the seat owners once the draft has begun) — so a dropped player can find their game */
	names?: string[];
}

// supabase.channel(topic) hands back an existing channel with the same topic — even one that is being removed —
// so a rebuild purges the old one from the client first (the same trick as match.ts dropChannel)
function purge(ch: RealtimeChannel | null) {
	if (!ch) return;
	try { ch.untrack(); } catch { /* ignore */ }
	try { void supabase.removeChannel(ch); } catch { /* ignore */ }
	try {
		const rt = supabase.realtime as unknown as { channels: RealtimeChannel[] };
		rt.channels = rt.channels.filter((c) => c !== ch);
	} catch { /* ignore */ }
}
const joined = (ch: RealtimeChannel | null) => (ch as unknown as { state?: string } | null)?.state === 'joined';

/** Run `fn` every KEEPALIVE_MS and whenever the page comes back into view; returns a stopper. */
function keepAlive(fn: () => void) {
	const t = setInterval(fn, KEEPALIVE_MS);
	const vis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') fn(); };
	const on = () => fn();
	if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
	if (typeof window !== 'undefined') window.addEventListener('online', on);
	return () => {
		clearInterval(t);
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis);
		if (typeof window !== 'undefined') window.removeEventListener('online', on);
	};
}

/** Host: publish this room to the directory; update as it changes; remove on leave. */
export function announceRoom(initial: RoomInfo) {
	let info = initial;
	let ch: RealtimeChannel | null = null;
	let gone = false;
	const build = () => {
		purge(ch);
		const c = supabase.channel(DIR, { config: { presence: { key: info.room } } });
		ch = c;
		c.subscribe((status) => {
			if (c === ch && status === 'SUBSCRIBED') { try { c.track(info); } catch { /* ignore */ } }
		});
	};
	build();
	const stop = keepAlive(() => {
		if (gone) return;
		if (!joined(ch)) build();
		else try { ch!.track(info); } catch { /* ignore */ }
	});
	return {
		update(next: Partial<RoomInfo>) {
			const was = JSON.stringify(info);
			info = { ...info, ...next };
			if (JSON.stringify(info) !== was && joined(ch)) try { ch!.track(info); } catch { /* ignore */ }
		},
		leave() {
			gone = true;
			stop();
			purge(ch);
			ch = null;
		}
	};
}

/** Anyone: watch the directory. Calls onList whenever the set of rooms changes. */
export function browseRooms(onList: (rooms: RoomInfo[]) => void) {
	let ch: RealtimeChannel | null = null;
	let gone = false;
	const build = () => {
		purge(ch);
		const c = supabase.channel(DIR, { config: { presence: { key: `browse-${Math.random().toString(36).slice(2)}` } } });
		ch = c;
		c.on('presence', { event: 'sync' }, () => {
			if (c !== ch) return;
			const raw = c.presenceState() as Record<string, RoomInfo[]>;
			const rooms: RoomInfo[] = [];
			for (const k in raw) {
				const m = raw[k][0];
				if (m && m.room && !k.startsWith('browse-')) rooms.push(m);
			}
			rooms.sort((a, b) => Number(a.started) - Number(b.started) || a.room.localeCompare(b.room));
			onList(rooms);
		});
		c.subscribe();
	};
	build();
	const stop = keepAlive(() => { if (!gone && !joined(ch)) build(); });
	return { leave() { gone = true; stop(); purge(ch); ch = null; } };
}
