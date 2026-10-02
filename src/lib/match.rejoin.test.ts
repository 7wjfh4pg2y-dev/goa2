import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ---- a mock that keeps realtime-js's CHANNEL LIST behaviour (one browser tab) ----
// supabase.channel(topic) hands back the channel it already has on that topic; a
// channel that is not closed is never joined again; presence listeners can only be
// added before subscribe(); removeChannel() closes at once and drops it from the list.
const realtime = vi.hoisted(() => ({ channels: [] as any[] }));
const presence: Record<string, Record<string, any>> = {};

function makeChannel(topic: string, config: any) {
	const key = config?.config?.presence?.key ?? '?';
	const room = (presence[topic] ??= {});
	const handlers: { type: string; cb: (a: any) => void }[] = [];
	let status: ((s: string) => void) | null = null;
	const ch: any = {
		topic: `realtime:${topic}`,
		state: 'closed',
		on(type: string, _filter: any, cb: (a: any) => void) {
			if (type === 'presence' && ch.state !== 'closed') throw new Error(`cannot add \`presence\` callbacks for ${ch.topic} after \`subscribe()\`.`);
			handlers.push({ type, cb });
			return ch;
		},
		subscribe(cb: (s: string) => void) {
			if (ch.state !== 'closed') return ch;
			ch.state = 'joined';
			status = cb;
			cb('SUBSCRIBED');
			return ch;
		},
		send: () => Promise.resolve('ok'), // one tab: nobody else to deliver to
		track(meta: any) {
			if (ch.state !== 'joined') return Promise.resolve('error');
			room[key] = meta;
			for (const h of handlers) if (h.type === 'presence') h.cb({});
			return Promise.resolve('ok');
		},
		untrack() { if (ch.state === 'joined') delete room[key]; return Promise.resolve('ok'); },
		presenceState() {
			const out: Record<string, any[]> = {};
			for (const k in room) out[k] = [room[k]];
			return out;
		},
		_close() {
			if (ch.state === 'closed') return;
			ch.state = 'closed';
			realtime.channels = realtime.channels.filter((c) => c !== ch);
			status?.('CLOSED');
		}
	};
	return ch;
}

vi.mock('./supabase', () => ({
	supabase: {
		realtime,
		channel(topic: string, config: any) {
			const found = realtime.channels.find((c) => c.topic === `realtime:${topic}`);
			if (found) return found;
			const ch = makeChannel(topic, config);
			realtime.channels.push(ch);
			return ch;
		},
		removeChannel(ch: any) { ch._close(); return Promise.resolve('ok'); }
	}
}));

// a browser tab keeps ONE player id (sessionStorage) — every session below is the same player
const store: Record<string, string> = {};
vi.stubGlobal('sessionStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });

const { joinMatch, initialMatchState } = await import('./match');
const me = { name: 'Solo', color: 'spectator' };

beforeEach(() => {
	for (const ch of [...realtime.channels]) ch._close();
	for (const t in presence) delete presence[t];
});

describe('the same tab joins the same room again', () => {
	it('a lone creator reloads: nobody answers, so the room is recreated — on a channel of its own', async () => {
		vi.useFakeTimers();
		// the reload: the tab rejoins its room as a joiner…
		const first = joinMatch('SOLO', me, {});
		await vi.advanceTimersByTimeAsync(3000);
		expect(get(first.notFound)).toBe(true); // …and nobody is there
		// so the room is recreated from the stored seed. (Used to throw "cannot add `presence`
		// callbacks … after `subscribe()`": the first session still held the room's channel.)
		const again = joinMatch('SOLO', me, { seed: initialMatchState({ players: 4 }) });
		expect(again.clientId).toBe(first.clientId);
		expect(get(again.status)).toBe('connected');
		expect(get(again.state).host).toBe(again.clientId);
		expect(get(again.players).map((p) => p.id)).toEqual([again.clientId]);
		expect(realtime.channels).toHaveLength(1);

		// the first session is over: it never rebuilds its channel, so the two can't fight over the room
		again.setSelf({ seat: 0, color: 'crimson' });
		await vi.advanceTimersByTimeAsync(30000);
		expect(realtime.channels).toHaveLength(1);
		expect(get(again.status)).toBe('connected');
		expect(get(again.players)).toMatchObject([{ id: again.clientId, seat: 0, color: 'crimson' }]);
		vi.useRealTimers();
	});

	it('leaving and joining again right away works, and a left session stays out of the way', async () => {
		vi.useFakeTimers();
		const a = joinMatch('BACK', me, { seed: initialMatchState({ players: 4 }) });
		const chA = realtime.channels[0];
		a.leave();
		const b = joinMatch('BACK', me, { seed: initialMatchState({ players: 4 }) });
		expect(realtime.channels).toHaveLength(1);
		expect(realtime.channels[0]).not.toBe(chA);
		expect(get(b.status)).toBe('connected');
		a.leave(); // a late second leave of the old session must not take the new one down
		await vi.advanceTimersByTimeAsync(20000);
		expect(get(b.status)).toBe('connected');
		expect(realtime.channels).toHaveLength(1);
		b.leave();
		expect(realtime.channels).toHaveLength(0);
		vi.useRealTimers();
	});
});

describe('colours carry the moment they were taken', () => {
	it('stamps a colour change (and only a colour change), so clashes can be settled by who was first', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const s = joinMatch('TINT', me, { seed: initialMatchState({ players: 4 }) });
		const mine = () => get(s.players).find((p) => p.id === s.clientId)!;
		expect(mine().colorAt).toBeUndefined();

		await vi.advanceTimersByTimeAsync(1000);
		s.setSelf({ seat: 0, color: 'crimson' });
		await vi.advanceTimersByTimeAsync(1000);
		expect(mine()).toMatchObject({ color: 'crimson', colorAt: 1_001_000 });

		s.setSelf({ ready: true, seat: 1 }); // not a colour change
		s.setSelf({ color: 'crimson' }); // the same colour again
		await vi.advanceTimersByTimeAsync(1000);
		expect(mine()).toMatchObject({ seat: 1, ready: true, colorAt: 1_001_000 });

		s.setSelf({ color: 'teal' });
		await vi.advanceTimersByTimeAsync(1000);
		expect(mine()).toMatchObject({ color: 'teal', colorAt: 1_003_000 });
		s.leave();
		vi.useRealTimers();
	});
});
