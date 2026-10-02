import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ---- a mock that keeps realtime-js's CHANNEL LIST behaviour (one browser tab) ----
// supabase.channel(topic) hands back the channel it already has on that topic; a
// channel that is not closed is never joined again; presence listeners can only be
// added before subscribe(); removeChannel() closes at once and drops it from the list
// (verified against @supabase/phoenix: leave() sets state=leaving BEFORE its canPush()
// check, so the leave push is acknowledged synchronously and onClose → _remove runs
// right away, socket open or not).
// `realtime.slow` = the next channels do not join by themselves: the test drives their
// status through `_status()` (a join that stalls, an error before SUBSCRIBED…).
const realtime = vi.hoisted(() => ({ channels: [] as any[], slow: false }));
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
			if (type === 'presence' && (ch.state === 'joined' || ch.state === 'joining')) throw new Error(`cannot add \`presence\` callbacks for ${ch.topic} after \`subscribe()\`.`);
			handlers.push({ type, cb });
			return ch;
		},
		subscribe(cb: (s: string) => void) {
			if (ch.state !== 'closed') return ch;
			status = cb;
			if (realtime.slow) { ch.state = 'joining'; return ch; }
			ch._status('SUBSCRIBED');
			return ch;
		},
		_status(s: string) {
			if (s === 'SUBSCRIBED') ch.state = 'joined';
			status?.(s);
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
	realtime.slow = false;
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

	it('a second session for the room retires the first, even when its caller never left it', async () => {
		vi.useFakeTimers();
		const a = joinMatch('BACK', me, { seed: initialMatchState({ players: 4 }) });
		const chA = realtime.channels[0];
		expect(get(a.status)).toBe('connected');
		// no a.leave(): the new session must put the old one down itself
		const b = joinMatch('BACK', me, { seed: initialMatchState({ players: 4 }) });
		expect(realtime.channels).toHaveLength(1);
		expect(realtime.channels[0]).not.toBe(chA);
		expect(get(b.status)).toBe('connected');
		// a late leave of the retired session must not take the new one down
		a.leave();
		a.leave();
		await vi.advanceTimersByTimeAsync(20000);
		expect(get(b.status)).toBe('connected');
		expect(realtime.channels).toHaveLength(1);
		expect(get(b.players).map((p) => p.id)).toEqual([b.clientId]);
		b.leave();
		expect(realtime.channels).toHaveLength(0);
		vi.useRealTimers();
	});

	it('a prober says so in presence, and stops once the state has arrived', async () => {
		vi.useFakeTimers();
		const s = joinMatch('TELL', me, {});
		const mine = () => presence['match:TELL'][s.clientId];
		expect(mine()).toMatchObject({ probing: true });
		// the room answers (as the host's broadcast would)
		const seed = initialMatchState({ players: 4 });
		(s.state as any).set({ ...seed, rev: 3, host: 'h', hostEpoch: 0 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(mine().probing).toBeUndefined();
		s.leave();
		vi.useRealTimers();
	});
});

describe('the join deadline and the watchdog', () => {
	it('a watchdog armed before the deadline rebuild does not tear the new channel down', async () => {
		vi.useFakeTimers();
		realtime.slow = true;
		const s = joinMatch('SLOW', me, { seed: initialMatchState({ players: 4 }) });
		const ch1 = realtime.channels[0];
		expect(get(s.status)).toBe('connecting'); // never SUBSCRIBED yet
		await vi.advanceTimersByTimeAsync(7000);
		ch1._status('CHANNEL_ERROR'); // arms the watchdog (1.5 s → 8.5 s)
		expect(get(s.status)).toBe('reconnecting');
		await vi.advanceTimersByTimeAsync(1000); // 8 s: the join deadline rebuilds the channel
		expect(realtime.channels).toHaveLength(1);
		const ch2 = realtime.channels[0];
		expect(ch2).not.toBe(ch1);
		ch2._status('SUBSCRIBED');
		expect(get(s.status)).toBe('connected');
		// 8.5 s: the orphaned watchdog used to fire here and replace the healthy channel
		await vi.advanceTimersByTimeAsync(4000);
		expect(realtime.channels).toHaveLength(1);
		expect(realtime.channels[0]).toBe(ch2);
		expect(get(s.status)).toBe('connected');
		s.leave();
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

	it('a stamp is never earlier than one already seen: a slow clock cannot jump the queue', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000); // this device is 10 minutes behind the others
		const s = joinMatch('SKEW', me, { seed: initialMatchState({ players: 4 }) });
		// someone else is already holding a colour, stamped on their (correct) clock
		presence['match:SKEW'].other = { name: 'Early', color: 'crimson', seat: 1, colorAt: 1_600_000 };
		realtime.channels[0].track(presence['match:SKEW'][s.clientId]); // a presence sync
		expect(get(s.players).find((p) => p.id === 'other')?.colorAt).toBe(1_600_000);
		s.setSelf({ seat: 0, color: 'crimson' });
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(s.players).find((p) => p.id === s.clientId)?.colorAt).toBe(1_600_001);
		s.leave();
		vi.useRealTimers();
	});
});
