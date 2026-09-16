import { describe, it, expect } from 'vitest';
import {
	buildDraft, draftAdvance, draftComplete, draftActor, draftTurn, draftPoolMin,
	type Player, type DraftState
} from './match';

const P = (id: string, seat: number): Player => ({ id, name: id, color: 'red', ready: true, seat });
// 2v2: seats 0,1 = orange; 2,3 = blue
const players4 = [P('o1', 0), P('o2', 1), P('b1', 2), P('b2', 3)];
const seats4 = 4;
const pool = Array.from({ length: 20 }, (_, i) => `h${i}`);

describe('draft engine', () => {
	it('all-random deals a distinct hero to every seated player', () => {
		const d = buildDraft('all-random', pool, players4, seats4, 'orange');
		const ids = ['o1', 'o2', 'b1', 'b2'];
		for (const id of ids) expect(pool).toContain(d.picks[id]);
		expect(new Set(Object.values(d.picks)).size).toBe(4);
		expect(draftComplete(d, ids)).toBe(true);
		expect(d.order.length).toBe(0);
	});

	it('pick-ban builds a turn per action with a player owner, starting team first', () => {
		const d = buildDraft('pick-ban', pool, players4, seats4, 'blue');
		expect(d.order.length).toBe(8); // total(4) * 2
		expect(d.order[0].team).toBe('blue'); // starting team acts first (first entry is a ban)
		// picks map to distinct players within each team
		const picks = d.order.filter((t) => t.type === 'pick');
		expect(picks.length).toBe(4);
		expect(new Set(picks.filter((t) => t.team === 'orange').map((t) => t.actor))).toEqual(new Set(['o1', 'o2']));
		expect(new Set(picks.filter((t) => t.team === 'blue').map((t) => t.actor))).toEqual(new Set(['b1', 'b2']));
	});

	it('single-draft alternates teams and offers three heroes', () => {
		const d = buildDraft('single-draft', pool, players4, seats4, 'orange');
		expect(d.order.length).toBe(4);
		expect(d.order.map((t) => t.team)).toEqual(['orange', 'blue', 'orange', 'blue']);
		expect(d.order.every((t) => t.type === 'pick')).toBe(true);
		expect(d.offer.length).toBe(3);
	});

	it('draftAdvance applies a pick to the actor and advances', () => {
		let d: DraftState = buildDraft('single-draft', pool, players4, seats4, 'orange');
		const actor = draftActor(d)!;
		const hero = d.offer[0];
		d = draftAdvance(d, hero);
		expect(d.picks[actor]).toBe(hero);
		expect(d.step).toBe(1);
		expect(d.offer.length).toBe(3); // next actor gets a fresh offer
		expect(d.offer).not.toContain(hero); // never re-offers a taken hero
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
		expect(draftPoolMin('pick-ban', 6)).toBe(12);
		expect(draftPoolMin('single-draft', 6)).toBe(18);
	});
});
