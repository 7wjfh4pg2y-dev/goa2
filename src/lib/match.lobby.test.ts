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

const { joinMatch, initialMatchState, nextHost } = await import('./match');

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

	it('kick actually targets only the named client', () => {
		const host = joinMatch('ROOM2', { name: 'Host', color: 'spectator' }, { seed: initialMatchState({ players: 4 }) });
		const joiner = joinMatch('ROOM2', { name: 'P2', color: 'spectator' }, {});
		host.kick(joiner.clientId);
		expect(get(joiner.kicked)).toBe(true);
		expect(get(host.kicked)).toBe(false);
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

		await vi.advanceTimersByTimeAsync(7000);
		expect(get(b.state).host).toBe(b.clientId); // seat 1 is next round the table
		expect(get(a.state).host).toBe(b.clientId);
		expect(get(b.state).log.at(-1)?.text).toContain('is now the host');
		vi.useRealTimers();
	});
});
