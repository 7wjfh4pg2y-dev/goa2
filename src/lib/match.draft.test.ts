import { describe, it, expect } from 'vitest';
import {
	buildDraft, draftAdvance, draftComplete, draftActor, draftTurn, draftPoolMin, draftSwap, draftSeal, pickSequence, transferSeat, initialMatchState,
	type Player, type DraftState
} from './match';

const P = (id: string, seat: number): Player => ({ id, name: id, color: 'red', ready: true, seat });
// 2v2: seats 0,1 = orange; 2,3 = blue
const players4 = [P('o1', 0), P('o2', 1), P('b1', 2), P('b2', 3)];
const seats4 = 4;
const players6 = [P('o1', 0), P('o2', 1), P('o3', 2), P('b1', 3), P('b2', 4), P('b3', 5)];
const pool = Array.from({ length: 20 }, (_, i) => `h${i}`);

describe('draft engine', () => {
	it('all-random deals a distinct hero to every seated player and waits for the host to seal it', () => {
		const d = buildDraft('all-random', pool, players4, seats4, 'orange');
		const ids = ['o1', 'o2', 'b1', 'b2'];
		for (const id of ids) expect(pool).toContain(d.picks[id]);
		expect(new Set(Object.values(d.picks)).size).toBe(4);
		expect(d.order.length).toBe(0);
		expect(draftComplete(d, ids)).toBe(false); // teammates may still swap
		expect(d.deadline).toBeGreaterThan(Date.now());
		expect(draftComplete(draftSeal(d), ids)).toBe(true);
	});

	it('all-random: two teammates offering each other a swap trade heroes', () => {
		let d = buildDraft('all-random', pool, players4, seats4, 'orange');
		const [h1, h2] = [d.picks.o1, d.picks.o2];
		d = draftSwap(d, 'o1', 'o2', 'orange');
		expect(d.swaps).toEqual({ o1: 'o2' });
		expect(d.picks.o1).toBe(h1);
		d = draftSwap(d, 'o1', 'o2'); // asking again takes it back
		expect(d.swaps).toEqual({});
		d = draftSwap(d, 'o1', 'o2');
		d = draftSwap(d, 'b1', 'o1'); // another offer naming o1
		d = draftSwap(d, 'o2', 'o1', 'orange'); // o2 accepts
		expect(d.picks.o1).toBe(h2);
		expect(d.picks.o2).toBe(h1);
		expect(d.swaps).toEqual({}); // b1's stale offer to o1 is gone too
		expect(d.lastAction?.swap).toBe('o1');
		const sealed = draftSeal(d);
		expect(draftSwap(sealed, 'o1', 'o2')).toBe(sealed); // no swaps once sealed
	});

	it('pick order: the team without the coin picks first and last', () => {
		expect(pickSequence(4)).toEqual([0, 1, 1, 0]);
		expect(pickSequence(6)).toEqual([0, 1, 1, 0, 1, 0]);
		const d4 = buildDraft('single-draft', pool, players4, seats4, 'orange');
		expect(d4.order.map((t) => t.team)).toEqual(['blue', 'orange', 'orange', 'blue']);
		expect(d4.order.map((t) => t.actor)).toEqual(['b1', 'o1', 'o2', 'b2']);
		const d6 = buildDraft('single-draft', pool, players6, 6, 'blue');
		expect(d6.order.map((t) => t.team)).toEqual(['orange', 'blue', 'blue', 'orange', 'blue', 'orange']);
		expect(d6.order.map((t) => t.actor)).toEqual(['o1', 'b1', 'b2', 'o2', 'b3', 'o3']);
	});

	it('pick-ban: one ban per team (the team without the coin first, by its last picker), then the picks', () => {
		const d = buildDraft('pick-ban', pool, players4, seats4, 'blue');
		expect(d.order.length).toBe(6);
		expect(d.order.slice(0, 2)).toEqual([{ team: 'orange', type: 'ban', actor: 'o2' }, { team: 'blue', type: 'ban', actor: 'b2' }]);
		expect(d.order.slice(2).map((t) => `${t.type}:${t.actor}`)).toEqual(['pick:o1', 'pick:b1', 'pick:b2', 'pick:o2']);
	});

	it('single-draft deals every player three heroes of their own, no overlap', () => {
		const d = buildDraft('single-draft', pool, players6, 6, 'orange');
		const all = Object.values(d.offers!).flat();
		expect(Object.keys(d.offers!).sort()).toEqual(['b1', 'b2', 'b3', 'o1', 'o2', 'o3']);
		expect(all.length).toBe(18);
		expect(new Set(all).size).toBe(18);
		expect(d.offer).toEqual(d.offers![d.order[0].actor]);
	});

	it('draftAdvance applies a pick to the actor and hands the next player their own three', () => {
		let d: DraftState = buildDraft('single-draft', pool, players4, seats4, 'orange');
		const actor = draftActor(d)!;
		const hero = d.offer[0];
		d = draftAdvance(d, hero);
		expect(d.picks[actor]).toBe(hero);
		expect(d.step).toBe(1);
		expect(d.offer).toEqual(d.offers![draftActor(d)!]);
		expect(d.offer).not.toContain(hero);
	});

	it('draftAdvance applies a ban in pick-ban', () => {
		let d: DraftState = buildDraft('pick-ban', pool, players4, seats4, 'orange');
		expect(draftTurn(d)!.type).toBe('ban');
		const hero = pool[0];
		d = draftAdvance(d, hero);
		expect(d.bans).toContain(hero);
		expect(d.step).toBe(1);
	});

	it('draftPoolMin scales with system', () => {
		expect(draftPoolMin('all-pick', 6)).toBe(6);
		expect(draftPoolMin('pick-ban', 6)).toBe(8);
		expect(draftPoolMin('single-draft', 6)).toBe(18);
	});
	it('a player who comes back under a new id keeps their draft turns and dealt heroes', () => {
		const draft = buildDraft('single-draft', pool, players4, seats4, 'orange');
		const st = { ...initialMatchState({ players: 4 }), draft };
		const p = transferSeat(st, 'o1', 'o1b', 'o1', 0);
		expect(p.draft!.order.map((t) => t.actor)).toEqual(['b1', 'o1b', 'o2', 'b2']);
		expect(p.draft!.offers!.o1b).toEqual(draft.offers!.o1);
		expect(p.draft!.offers!.o1).toBeUndefined();
	});
});
