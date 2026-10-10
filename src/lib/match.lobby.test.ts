import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// ---- in-memory mock of the Supabase realtime channel ----
type Handler = { type: string; event: string; cb: (arg: any) => void };
const buses: Record<string, { channels: any[]; presence: Record<string, any> }> = {};

function makeChannel(topic: string, config: any) {
	const bus = (buses[topic] ??= { channels: [], presence: {} });
	const key = config?.config?.presence?.key ?? Math.random().toString(36);
	const handlers: Handler[] = [];
	const ch: any = {
		_key: key,
		on(type: string, filter: any, cb: (a: any) => void) {
			handlers.push({ type, event: filter?.event ?? 'sync', cb });
			return ch;
		},
		subscribe(cb: (status: string) => void) {
			bus.channels.push(ch);
			cb('SUBSCRIBED');
			return ch;
		},
		send(msg: any) {
			if (msg.type === 'broadcast') {
				for (const other of bus.channels) {
					if (other === ch) continue; // broadcast self:false
					for (const h of other._handlers) if (h.type === 'broadcast' && h.event === msg.event) h.cb({ payload: msg.payload });
				}
			}
			return Promise.resolve('ok');
		},
		track(meta: any) {
			bus.presence[key] = meta;
			for (const c of bus.channels) for (const h of c._handlers) if (h.type === 'presence') h.cb({});
			return Promise.resolve('ok');
		},
		untrack() { delete bus.presence[key]; return Promise.resolve('ok'); },
		presenceState() {
			const out: Record<string, any[]> = {};
			for (const k in bus.presence) out[k] = [bus.presence[k]];
			return out;
		},
		_handlers: handlers
	};
	return ch;
}

vi.mock('./supabase', () => ({
	supabase: { channel: (topic: string, config: any) => makeChannel(topic, config) }
}));

const { joinMatch, initialMatchState, nextHost, LOG_CAP } = await import('./match');

describe('lobby: second player picks a colour', () => {
	it('does not kick or close the joiner', () => {
		const host = joinMatch('ROOM', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ length: 'quick', players: 4 }) });
		const joiner = joinMatch('ROOM', { name: 'P2', color: 'spectator' }, {});

		// joiner should have inherited the host's real state (seats 4), not a placeholder
		expect(get(joiner.state).seats).toBe(4);
		expect(get(joiner.state).rev).toBeGreaterThanOrEqual(0);

		// second player picks purple
		joiner.setSelf({ color: 'purple' });

		expect(get(joiner.kicked)).toBe(false);
		expect(get(joiner.state).closed).toBe(false);
		expect(get(host.state).closed).toBe(false);

		// presence should show the purple seat
		const seated = get(joiner.players).filter((p) => p.color !== 'spectator');
		expect(seated.map((p) => p.color)).toContain('purple');
	});

	it('joining an empty room code reports notFound and does not create a room', async () => {
		vi.useFakeTimers();
		const joiner = joinMatch('GHOST', { name: 'Solo', color: 'spectator' }, {});
		expect(get(joiner.notFound)).toBe(false);
		await vi.advanceTimersByTimeAsync(3000);
		expect(get(joiner.notFound)).toBe(true);
		// stayed a placeholder — no bogus room was created/promoted
		expect(get(joiner.state).rev).toBe(-1);
		vi.useRealTimers();
	});

	it('a whole table rejoining at once (nobody holds the state) learns the room is gone instead of waiting forever', async () => {
		vi.useFakeTimers();
		// two tabs refresh within a second of each other: each sees the other in presence,
		// each asks for the state, neither has any to give
		const a = joinMatch('ALLGONE', { name: 'A', color: 'spectator' }, {});
		await vi.advanceTimersByTimeAsync(500);
		const b = joinMatch('ALLGONE', { name: 'B', color: 'spectator' }, {});
		expect(get(a.players)).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(4000);
		expect(get(a.notFound)).toBe(true);
		expect(get(b.notFound)).toBe(true);
		expect(get(a.state).rev).toBe(-1);
		a.leave(); b.leave();
		vi.useRealTimers();
	});

	it('a prober keeps waiting while someone who may hold the state is present — but not forever', async () => {
		vi.useFakeTimers();
		// a ghost: still in presence (the server has not noticed its socket died), never answers
		buses['match:GHOSTLY'] = { channels: [], presence: { ghost: { name: 'Ghost', color: 'teal', seat: 0 } } };
		const joiner = joinMatch('GHOSTLY', { name: 'Solo', color: 'spectator' }, {});
		await vi.advanceTimersByTimeAsync(15000);
		expect(get(joiner.notFound)).toBe(false); // still asking
		await vi.advanceTimersByTimeAsync(8000);
		expect(get(joiner.notFound)).toBe(true); // 20 s without an answer: the join ends
		joiner.leave();
		vi.useRealTimers();
	});

	it('a joiner who arrives while the host is answering still gets the state', async () => {
		vi.useFakeTimers();
		const host = joinMatch('LIVE', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		expect(buses['match:LIVE'].presence[host.clientId].probing).toBeUndefined(); // a holder never says probing
		const joiner = joinMatch('LIVE', { name: 'P2', color: 'spectator' }, {});
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(joiner.state).rev).toBeGreaterThanOrEqual(0);
		expect(buses['match:LIVE'].presence[joiner.clientId].probing).toBeUndefined(); // and stops saying it once served
		expect(get(joiner.notFound)).toBe(false);
		host.leave(); joiner.leave();
		vi.useRealTimers();
	});

	it('kick actually targets only the named client', () => {
		const host = joinMatch('ROOM2', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const joiner = joinMatch('ROOM2', { name: 'P2', color: 'spectator' }, {});
		host.kick(joiner.clientId);
		expect(get(joiner.kicked)).toBe(true);
		expect(get(host.kicked)).toBe(false);
	});
});

describe('a dropped player gets their seat back', () => {
	it('rejoining under the same name (new id, any case) hands back the seat, hero and cards', async () => {
		vi.useFakeTimers();
		const host = joinMatch('BACK', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const a = joinMatch('BACK', { name: 'Avery', color: 'spectator' }, {});
		host.setSelf({ seat: 0 });
		a.setSelf({ seat: 1, color: 'teal' });
		await vi.advanceTimersByTimeAsync(500);
		const hero: any = { id: a.clientId, hex: '3_4', team: 'orange', kind: 'hero', color: 'teal' };
		host.update({
			started: true,
			seatMap: { '0': { id: host.clientId, name: 'Host' }, '1': { id: a.clientId, name: 'Avery' } },
			pieces: { [a.clientId]: hero },
			cards: { [a.clientId]: { coins: 7 } as any }
		});
		await vi.advanceTimersByTimeAsync(500);

		a.leave(); // the phone dies
		const b = joinMatch('BACK', { name: ' avery ', color: 'spectator' }, {}); // a new tab, a new id
		const grants: any[] = [];
		b.seatGranted.subscribe((g) => g && grants.push(g));
		await vi.advanceTimersByTimeAsync(1000);

		const s = get(host.state);
		expect(s.seatMap?.['1'].id).toBe(b.clientId);
		expect(s.pieces[b.clientId]).toMatchObject({ id: b.clientId, hex: '3_4' });
		expect(s.pieces[a.clientId]).toBeUndefined();
		expect((s.cards as any)[b.clientId].coins).toBe(7);
		expect(s.log.at(-1)?.text).toContain('is back in their seat');
		expect(grants).toMatchObject([{ seat: 1, color: 'teal', back: true }]);
		expect(get(b.state).seatMap?.['1'].id).toBe(b.clientId);
		host.leave(); b.leave();
		vi.useRealTimers();
	});

	it('never takes a seat whose player is still connected, or one under another name', async () => {
		vi.useFakeTimers();
		const host = joinMatch('KEEP', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const a = joinMatch('KEEP', { name: 'Avery', color: 'spectator' }, {});
		a.setSelf({ seat: 1, color: 'teal' });
		await vi.advanceTimersByTimeAsync(500);
		host.update({ started: true, seatMap: { '1': { id: a.clientId, name: 'Avery' } } });
		const twin = joinMatch('KEEP', { name: 'Avery', color: 'spectator' }, {}); // same name, but Avery is still here
		const other = joinMatch('KEEP', { name: 'Harper', color: 'spectator' }, {});
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(host.state).seatMap?.['1'].id).toBe(a.clientId);
		a.leave();
		other.setSelf({ ready: true }); // a presence change: Avery gone → the twin (same name) gets it, Harper never
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(host.state).seatMap?.['1'].id).toBe(twin.clientId);
		host.leave(); twin.leave(); other.leave();
		vi.useRealTimers();
	});
});

describe('host hand-over', () => {
	const p = (id: string, seat: number) => ({ id, name: id, color: 'red', ready: false, seat });

	it('picks the next seated player after the old host, wrapping round the table', () => {
		const s = { ...initialMatchState({ players: 4 }), host: 'h', seatMap: { '1': { id: 'h', name: 'H' } } };
		expect(nextHost(s, [p('a', 0), p('b', 2), p('c', 3)], 'h')).toBe('b');
		expect(nextHost(s, [p('a', 0)], 'h')).toBe('a'); // wraps
		expect(nextHost(s, [p('z', -1), p('y', -1)], 'h')).toBe('y'); // nobody seated → first spectator by id
		expect(nextHost(s, [], 'h')).toBe(null);
	});

	it('hands host over only after the grace period, to exactly one player', async () => {
		vi.useFakeTimers();
		const host = joinMatch('ROOMH', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const a = joinMatch('ROOMH', { name: 'A', color: 'spectator' }, {});
		const b = joinMatch('ROOMH', { name: 'B', color: 'spectator' }, {});
		a.setSelf({ seat: 2 });
		b.setSelf({ seat: 1 });
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(a.state).host).toBe(host.clientId);

		host.leave();
		a.setSelf({ ready: true }); // a presence update so everyone sees the host gone
		await vi.advanceTimersByTimeAsync(5000);
		expect(get(a.state).host).toBe(host.clientId); // still inside the grace period (a refresh would come back)

		await vi.advanceTimersByTimeAsync(12000);
		expect(get(b.state).host).toBe(b.clientId); // seat 1 is next round the table
		expect(get(a.state).host).toBe(b.clientId);
		expect(get(b.state).log.at(-1)?.text).toContain('is now the host');
		vi.useRealTimers();
	});

	it('a ping reaches everyone, one per player, and fades', async () => {
		vi.useFakeTimers();
		const host = joinMatch('ROOMP', { name: 'Host', color: 'teal' }, { seed: initialMatchState({ players: 2 }) });
		const a = joinMatch('ROOMP', { name: 'A', color: 'pink' }, {});
		await vi.advanceTimersByTimeAsync(1000);
		host.ping('3_4');
		expect(get(a.pings)).toMatchObject([{ by: host.clientId, hex: '3_4', color: 'teal' }]);
		expect(get(host.pings)).toHaveLength(1);
		host.ping('5_5'); // too soon: ignored (rate limit)
		await vi.advanceTimersByTimeAsync(700);
		host.ping('6_6'); // replaces the host's earlier ping
		expect(get(a.pings).map((p) => p.hex)).toEqual(['6_6']);
		await vi.advanceTimersByTimeAsync(4000);
		expect(get(a.pings)).toEqual([]);
		vi.useRealTimers();
	});

	it('a stale snapshot can never undo a hand-over, and the creator takes the role back', async () => {
		vi.useFakeTimers();
		const host = joinMatch('ROOMR', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const a = joinMatch('ROOMR', { name: 'A', color: 'spectator' }, {});
		const b = joinMatch('ROOMR', { name: 'B', color: 'spectator' }, {});
		a.setSelf({ seat: 2 });
		b.setSelf({ seat: 1 });
		await vi.advanceTimersByTimeAsync(1000);
		const bus = buses['match:ROOMR'];
		// the creator's presence drops (a throttled background tab) — but they're still connected
		delete bus.presence[host.clientId];
		a.setSelf({ ready: true });
		await vi.advanceTimersByTimeAsync(16000);
		expect(get(a.state).host).toBe(b.clientId);
		expect(get(a.state).hostEpoch).toBe(1);

		// someone who hadn't seen the hand-over yet sends a newer snapshot with the OLD host in it
		const stale = { ...get(a.state), host: host.clientId, hostEpoch: 0, rev: get(a.state).rev + 5, updatedAt: Date.now() + 1, updatedBy: 'zz' };
		bus.channels[0].send({ type: 'broadcast', event: 'state', payload: stale });
		expect(get(a.state).rev).toBe(stale.rev); // the rest of the snapshot is taken…
		expect(get(a.state).host).toBe(b.clientId); // …but not the stale host

		// the creator's tab wakes up again: they take the role back
		host.setSelf({ ready: false });
		await vi.advanceTimersByTimeAsync(6000);
		expect(get(a.state).host).toBe(host.clientId);
		expect(get(b.state).host).toBe(host.clientId);
		expect(get(host.state).log.at(-1)?.text).toContain('is the host again');
		vi.useRealTimers();
	});

	it('Undo keeps working once the log is full (it is capped at LOG_CAP lines)', () => {
		const host = joinMatch('ROOMU', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		host.update({ started: true, round: 3, turn: 2 });
		for (let i = 0; i < LOG_CAP + 5; i++) host.act(`line ${i}`, { waves: 5 });
		expect(get(host.state).log).toHaveLength(LOG_CAP);
		host.act('pushed the lane', { waves: 4 });
		expect(get(host.canUndo)).toBe(true);
		host.undo();
		expect(get(host.state).waves).toBe(5);
		expect(get(host.state).log.at(-1)?.text).toBe(`line ${LOG_CAP + 4}`);
		// a new turn starts a fresh history
		host.act('next turn', { turn: 3 });
		expect(get(host.canUndo)).toBe(false);
	});
});
