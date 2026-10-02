import { describe, it, expect } from 'vitest';
import { colorMoves, type ColorHolder } from './seatcolor';

const PALETTE = ['crimson', 'rose', 'pink', 'sienna', 'yellow'];
const p = (id: string, color: string, colorAt?: number): ColorHolder => ({ id, color, colorAt });
/** everyone who has to move does so (each client acts for itself), as one round */
const apply = (list: ColorHolder[], now: number) => {
	const moves = colorMoves(list, PALETTE);
	return list.map((x) => (moves[x.id] ? { ...x, color: moves[x.id], colorAt: now } : x));
};

describe('colour clashes', () => {
	it('nobody moves when every colour is held once (spectators never count)', () => {
		expect(colorMoves([p('a', 'crimson', 5), p('b', 'rose', 1), p('s1', 'spectator'), p('s2', 'spectator')], PALETTE)).toEqual({});
		expect(colorMoves([], PALETTE)).toEqual({});
	});

	it('two players took the first colour together: the later one moves to the next free colour', () => {
		expect(colorMoves([p('a', 'crimson', 100), p('b', 'crimson', 90)], PALETTE)).toEqual({ a: 'rose' });
		// the very same moment → the larger id moves
		expect(colorMoves([p('b', 'crimson', 100), p('a', 'crimson', 100)], PALETTE)).toEqual({ b: 'rose' });
	});

	it('every client gets the same answer, whatever order presence lists the players in', () => {
		const list = [p('d', 'crimson', 7), p('b', 'crimson', 7), p('c', 'rose', 3), p('a', 'crimson', 9), p('e', 'pink', 1)];
		const want = colorMoves(list, PALETTE);
		expect(want).toEqual({ d: 'sienna', a: 'yellow' }); // b keeps crimson (earliest, then smaller id); rose and pink are held
		expect(colorMoves([...list].reverse(), PALETTE)).toEqual(want);
		expect(colorMoves([list[3], list[0], list[4], list[1], list[2]], PALETTE)).toEqual(want);
	});

	it('a colour somebody already held is never taken from them — the newcomer moves, even with the smaller id', () => {
		// "z" picked pink by hand a while ago; "a" picked it before z showed up in their list
		expect(colorMoves([p('z', 'pink', 1_000), p('a', 'pink', 60_000)], PALETTE)).toEqual({ a: 'crimson' });
	});

	it('three on one colour settle in ONE round, on three different colours', () => {
		const after = apply([p('a', 'crimson', 3), p('b', 'crimson', 1), p('c', 'crimson', 2)], 50);
		expect(after.map((x) => `${x.id}:${x.color}`)).toEqual(['a:pink', 'b:crimson', 'c:rose']);
		expect(colorMoves(after, PALETTE)).toEqual({}); // settled: nobody moves again
	});

	it('never fights: a second look after the move changes nothing, and the keeper never moves', () => {
		let list: ColorHolder[] = [p('a', 'crimson', 10), p('b', 'crimson', 10), p('c', 'rose', 4), p('d', 'rose', 12)];
		list = apply(list, 20);
		expect(list.map((x) => x.color)).toEqual(['crimson', 'pink', 'rose', 'sienna']);
		for (let i = 0; i < 3; i++) expect(apply(list, 30 + i)).toEqual(list);
	});

	it('a client still on an old build (no timestamp) keeps its colour', () => {
		expect(colorMoves([p('new', 'yellow', 5), p('old', 'yellow')], PALETTE)).toEqual({ new: 'crimson' });
	});

	it('with every colour held, the clash stays (nowhere to go) instead of looping', () => {
		const full = PALETTE.map((c, i) => p('p' + i, c, i));
		expect(colorMoves([...full, p('late', 'rose', 99)], PALETTE)).toEqual({});
	});
});
