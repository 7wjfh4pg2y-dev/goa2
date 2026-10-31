import { describe, it, expect } from 'vitest';
import { colourTree, buildOf, choose, startPath, fullPath, pathCode, pathFromCode, basicCards } from './cardbuild';
import { heroCards } from './cards/deck';
import { statDeltas } from './cards/cardstate';
import { HEROES } from './heroes';

describe('card gallery builds', () => {
	it('every hero has a full tree in every colour', () => {
		for (const h of HEROES) for (const c of ['RED', 'BLUE', 'GREEN'] as const) {
			const t = colourTree(h.id, c);
			expect([t.t1, ...t.t2, ...t.t3].every((i) => i >= 0), `${h.id} ${c}`).toBe(true);
			expect(new Set([...t.t2, ...t.t3]).size).toBe(4);
		}
	});
	it('the starting path is the starting hand', () => {
		const b = buildOf('arien', startPath());
		expect(b.level).toBe(1);
		expect(b.hand).toHaveLength(5);
		expect(b.items).toHaveLength(0);
	});
	it('a full path = level 7, five cards in hand, six items; the ultimate makes 8', () => {
		const b = buildOf('arien', fullPath(0));
		expect(b.level).toBe(7);
		expect(b.hand).toHaveLength(5);
		expect(b.items).toHaveLength(6);
		expect(b.replaced).toHaveLength(6);
		expect(Object.values(statDeltas(b.state)).reduce((a, n) => a + (n ?? 0), 0)).toBe(6);
		expect(b.canUltimate).toBe(true);
		expect(buildOf('arien', fullPath(0), true).level).toBe(8);
	});
	it('the ultimate needs every colour on Tier III', () => {
		const p = { ...fullPath(1), GREEN: { tier: 2 as const, ii: 1 as const, iii: 0 as const } };
		const b = buildOf('arien', p, true);
		expect(b.canUltimate).toBe(false);
		expect(b.ultimate).toBe(false);
		expect(b.level).toBe(6);
	});
	it('the twin of each pick is the item', () => {
		const t = colourTree('arien', 'RED');
		const b = buildOf('arien', { ...startPath(), RED: { tier: 3, ii: 1, iii: 0 } });
		expect(b.role(t.t2[1])).toBe('replaced');
		expect(b.role(t.t2[0])).toBe('item');
		expect(b.role(t.t3[0])).toBe('hand');
		expect(b.role(t.t3[1])).toBe('item');
		expect(b.role(t.t1)).toBe('replaced');
	});
	it('clicking cards moves along the tree', () => {
		const t = colourTree('arien', 'BLUE');
		let p = choose(startPath(), 'arien', t.t3[1]);
		expect(p.BLUE).toEqual({ tier: 3, ii: 0, iii: 1 });
		p = choose(p, 'arien', t.t2[1]);
		expect(p.BLUE).toEqual({ tier: 3, ii: 1, iii: 1 });
		p = choose(p, 'arien', t.t1);
		expect(p.BLUE.tier).toBe(1);
	});
	it('codes round-trip', () => {
		const p = { RED: { tier: 3 as const, ii: 1 as const, iii: 0 as const }, BLUE: { tier: 1 as const, ii: 0 as const, iii: 0 as const }, GREEN: { tier: 2 as const, ii: 1 as const, iii: 0 as const } };
		expect(pathCode(p)).toBe('3BA-1-2B');
		expect(pathFromCode('3BA-1-2B')).toEqual(p);
		expect(pathFromCode('nonsense')).toBeNull();
	});
	it('Takahide shows all three golds as basics', () => {
		const b = basicCards('takahide');
		expect(b.golds).toHaveLength(3);
		expect(heroCards('takahide')[b.ultimate].color).toBe('PURPLE');
	});
});
