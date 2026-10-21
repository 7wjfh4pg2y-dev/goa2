import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// ---- in-memory mock of the Supabase realtime channel ----
type Handler = { type: string; event: string; cb: (arg: any) => void };
const buses: Record<string, { channels: any[]; presence: Record<string, any> }> = {};
// clients whose messages vanish (a phone whose socket died in the background)
const muted = new Set<string>();

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
			if (muted.has(key)) return Promise.resolve('ok');
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

const { joinMatch, initialMatchState } = await import('./match');
const { newPlayerCardState } = await import('./cards/cardstate');
const { heroCards } = await import('./cards/deck');

// a 1 v 1 table through the real session (host + one player over the mock channel): `hero` for the host, Arien for the
// other; the host's card `card` is acting, turn 3, after the reveal
function table(room: string, hero: string, card: number, ult = false, other = 'arien') {
	const host = joinMatch(room, { name: 'Zara', color: 'spectator' }, { seed: initialMatchState({ players: 2 }) });
	const mo = joinMatch(room, { name: 'Mo', color: 'spectator' }, {});
	const h = host.clientId, m = mo.clientId;
	const mine = newPlayerCardState(hero), theirs = newPlayerCardState(other);
	const cards = {
		[h]: { ...mine, ultimate: ult, hand: mine.hand.filter((i) => i !== card), pending: card },
		[m]: { ...theirs, hand: theirs.hand.slice(1), pending: theirs.hand[0] }
	};
	const pieces = {
		[h]: { id: h, hex: '5_5', team: 'orange', kind: 'hero', hero },
		[m]: { id: m, hex: '6_5', team: 'blue', kind: 'hero', hero: other }
	};
	host.update({ started: true, round: 1, turn: 3, tieBreaker: 'orange', cards, pieces, revealAt: 1, acting: { key: '1-3', idx: 0, pin: [h] } } as never);
	return { host, mo, h, m, s: () => get(host.state), sm: () => get(mo.state), last: () => get(host.state).log.at(-1)?.text ?? '' };
}
const idxOf = (hero: string, name: string) => heroCards(hero).findIndex((c) => c.name === name);

describe('4★ heroes through the real session', () => {
	it('Ignatia: switching Equilibrium on (a plain effect update, from a player) writes its splash news once; off clears it so it can play again', async () => {
		vi.useFakeTimers();
		const t = table('IG1', 'arien', 1, false, 'ignatia');
		const tick = () => vi.advanceTimersByTimeAsync(600);
		await tick();
		const sil = idxOf('ignatia', 'Equilibrium');
		const fx = (id: string) => ({ id, pid: t.m, hero: 'ignatia', idx: sil, name: 'Equilibrium', dur: 'round', round: 1, turn: 3, endRound: 1, endTurn: 4 });
		t.mo.act('Equilibrium — this round effect active', { effects: [fx('a')] } as never);
		await tick();
		const n1 = t.s().fxNews;
		expect(n1?.kind).toBe('eq');
		expect(n1?.by).toBe(t.m);
		expect(t.s().power?.[t.m]?.eqOn).toBe(true);
		// a later unrelated update does not repeat it
		t.host.act('something else', { waves: 4 });
		await tick();
		expect(t.s().fxNews?.id).toBe(n1?.id);
		// ended → cleared, on again → a new splash
		t.mo.act('Equilibrium ended', { effects: [] } as never);
		await tick();
		expect(t.s().power?.[t.m]?.eqOn).toBeFalsy();
		t.mo.act('Equilibrium — again', { effects: [fx('b')] } as never);
		await tick();
		expect(t.s().fxNews?.kind).toBe('eq');
		expect(t.s().fxNews?.id).not.toBe(n1?.id);
		t.host.leave(); t.mo.leave();
		vi.useRealTimers();
	});

	it('Ignatia: Chaos Incarnate flips the coin, logs it, writes its news; only once a turn', () => {
		const t = table('IG2', 'ignatia', 0, true);
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'ignatiaFlip' } as never);
		expect(t.s().tieBreaker).toBe('blue');
		expect(t.last()).toMatch(/flips the tie-breaker coin to the .* \(Chaos Incarnate\)/);
		expect(t.s().fxNews?.kind).toBe('flip');
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'ignatiaFlip' } as never);
		expect(t.s().tieBreaker).toBe('blue');
		t.host.leave(); t.mo.leave();
	});

	it('Snorri: Inscribe the Runes (his silver acting) sets and logs the order, with its news', () => {
		const t = table('SN1', 'snorri', idxOf('snorri', 'Inscribe the Runes'));
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'snorriInscribe', order: ['horn', 'bird', 'anvil', 'axe'] } as never);
		expect(t.s().power?.[t.h]?.runes).toEqual(['horn', 'bird', 'anvil', 'axe']);
		expect(t.last()).toMatch(/inscribed the runes/i);
		expect(t.s().snNews?.order).toEqual(['horn', 'bird', 'anvil', 'axe']);
		t.host.leave(); t.mo.leave();
	});

	it('Snorri: his runes stay through a defeat, the next turns and his respawn', async () => {
		const t = table('SN2', 'snorri', idxOf('snorri', 'Inscribe the Runes'));
		const order = ['horn', 'bird', 'anvil', 'axe'];
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'snorriInscribe', order } as never);
		t.mo.cardAction({ kind: 'attack', pid: t.m, target: t.h } as never);
		await new Promise((r) => setTimeout(r, 400));
		t.host.cardAction({ kind: 'attackResolve', pid: t.h, target: t.h, result: 'defeated' } as never);
		expect(t.s().defeated?.[t.h]).toBeTruthy();
		expect(t.s().power?.[t.h]?.runes).toEqual(order);
		t.host.cardAction({ kind: 'advance', pid: t.h } as never);
		expect(t.s().power?.[t.h]?.runes).toEqual(order);
		await new Promise((r) => setTimeout(r, 400));
		expect(t.sm().power?.[t.h]?.runes).toEqual(order);
		t.host.leave(); t.mo.leave();
	});

	it('Takahide: a gold swap by his acting gold is logged and makes swap news', () => {
		const g = idxOf('takahide', 'Float like a Butterfly');
		const t = table('TK1', 'takahide', g);
		const deck = heroCards('takahide');
		const other = [idxOf('takahide', 'Sting like a Bee'), idxOf('takahide', 'Strike like a Tiger')];
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'takaSwap', idx: other[0] } as never);
		expect(t.s().cards![t.h].pending).toBe(other[0]);
		expect(t.last()).toMatch(new RegExp(`swapped ${deck[g].name} for ${deck[other[0]].name}`));
		expect(t.s().fxNews?.kind).toBe('swap');
		// one swap per acting card
		t.host.cardAction({ kind: 'power', pid: t.h, op: 'takaSwap', idx: other[1] } as never);
		expect(t.s().cards![t.h].pending).toBe(other[0]);
		t.host.leave(); t.mo.leave();
	});

	it('Emmitt: Reverse Time after his attack landed reverses the NEXT turn, logged, with its news; Razzle: a double spawned after her attack is logged and poofs in', () => {
		const e = table('EM1', 'emmitt', idxOf('emmitt', 'Reverse Time'));
		e.host.update({ power: { [e.h]: { hit: '1-3:0' } } } as never);
		e.host.cardAction({ kind: 'power', pid: e.h, op: 'emReverse' } as never);
		expect(e.s().power?.[e.h]?.rev).toBe('1-4');
		expect(e.last()).toMatch(/revers/i);
		expect(e.s().emNews?.key).toBe('1-4');
		e.host.leave(); e.mo.leave();
		const r = table('RZ1', 'razzle', idxOf('razzle', 'Stunt Doubles'));
		r.host.update({ power: { [r.h]: { hit: '1-3:0' } } } as never);
		r.host.cardAction({ kind: 'power', pid: r.h, op: 'rzSpawn', face: 1, hex: '4_5' } as never);
		expect(r.s().pieces?.[`${r.h}~1`]?.hex).toBe('4_5');
		expect(r.last()).toMatch(/spawns a double/);
		expect(r.s().comicNews?.moment).toBe('poofIn');
		r.host.leave(); r.mo.leave();
	});

	it('NebKher: Diabolical Laughter is logged; Razzle: a double spawned after her attack is logged; Gydion: Prepare is logged', () => {
		const n = table('NK1', 'nebkher', idxOf('nebkher', 'Diabolical Laughter'));
		n.host.cardAction({ kind: 'power', pid: n.h, op: 'nkLaugh' } as never);
		expect(n.last()).toMatch(/laughs diabolically/);
		expect(n.s().nkNews?.kind).toBe('laugh');
		n.host.leave(); n.mo.leave();
		const g = table('GY1', 'gydion', idxOf('gydion', 'Prepare Spells'));
		g.host.cardAction({ kind: 'power', pid: g.h, op: 'gyPrepare' } as never);
		expect(g.last()).toMatch(/prepares his spells/);
		g.host.leave(); g.mo.leave();
	});
});
