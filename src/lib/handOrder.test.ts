import { describe, it, expect } from 'vitest';
import { arrangeHand, moveCard } from './handOrder';

describe('your hand order', () => {
	it('no custom order = the default', () => {
		expect(arrangeHand([1, 2, 3], null)).toEqual([1, 2, 3]);
		expect(arrangeHand([1, 2, 3], [])).toEqual([1, 2, 3]);
	});
	it('keeps the order you chose, drops cards that left the hand', () => {
		expect(arrangeHand([1, 2, 3, 4], [4, 2, 1, 3])).toEqual([4, 2, 1, 3]);
		expect(arrangeHand([1, 3, 4], [4, 2, 1, 3])).toEqual([4, 1, 3]);
	});
	it('a new card joins after the cards that come before it by default', () => {
		// default 1 2 3 4 5, custom put 5 first; 3 comes back → after 2 (the last card before it by default)
		expect(arrangeHand([1, 2, 3, 4, 5], [5, 1, 2, 4])).toEqual([5, 1, 2, 3, 4]);
		// a card that comes first by default goes to the front
		expect(arrangeHand([0, 1, 2], [2, 1])).toEqual([0, 2, 1]);
	});
	it('moves a card to another card\'s place, both ways', () => {
		expect(moveCard([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
		expect(moveCard([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
		expect(moveCard([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
		expect(moveCard([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
	});
});
