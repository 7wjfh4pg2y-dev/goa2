// Public room directory: hosts announce their room on a shared presence channel,
// and the Join screen watches it to list what's open. Presence-only (no DB) —
// an announcement lives only while the host is connected.

import { supabase } from './supabase';

const DIR = 'goa2-rooms';

export interface RoomInfo {
	room: string;
	host: string;
	seats: number;
	count: number; // seated players
	started: boolean;
}

/** Host: publish this room to the directory; update as it changes; remove on leave. */
export function announceRoom(initial: RoomInfo) {
	const ch = supabase.channel(DIR, { config: { presence: { key: initial.room } } });
	let info = initial;
	ch.subscribe((status) => {
		if (status === 'SUBSCRIBED') ch.track(info);
	});
	return {
		update(next: Partial<RoomInfo>) {
			info = { ...info, ...next };
			try { ch.track(info); } catch { /* ignore */ }
		},
		leave() {
			try { ch.untrack(); supabase.removeChannel(ch); } catch { /* ignore */ }
		}
	};
}

/** Anyone: watch the directory. Calls onList whenever the set of rooms changes. */
export function browseRooms(onList: (rooms: RoomInfo[]) => void) {
	const ch = supabase.channel(DIR, {
		config: { presence: { key: `browse-${Math.random().toString(36).slice(2)}` } }
	});
	ch.on('presence', { event: 'sync' }, () => {
		const raw = ch.presenceState() as Record<string, RoomInfo[]>;
		const rooms: RoomInfo[] = [];
		for (const k in raw) {
			const m = raw[k][0];
			if (m && m.room) rooms.push(m);
		}
		rooms.sort((a, b) => a.room.localeCompare(b.room));
		onList(rooms);
	});
	ch.subscribe();
	return { leave() { try { supabase.removeChannel(ch); } catch { /* ignore */ } } };
}
