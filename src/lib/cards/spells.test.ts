import { describe, it, expect } from 'vitest';
import { SPELLS, castable, spellOf } from './spells';
import { heroCards } from './deck';

describe('Gydion spells', () => {
	it('all 22 spells have their printed art', () => {
		expect(SPELLS).toHaveLength(22);
		for (const s of SPELLS) expect(s.art, s.id).not.toBe('');
		expect(new Set(SPELLS.map((s) => s.id)).size).toBe(22);
	});
	it('every casting card names spells that exist', () => {
		const casts = heroCards('gydion').filter((c) => /cast/i.test(c.description) && !/Whenever/.test(c.description));
		expect(casts.length).toBeGreaterThan(10);
		for (const c of casts) {
			const n = (c.description.match(/"/g) ?? []).length / 2;
			expect(castable(c), c.name).toHaveLength(n);
		}
		expect(castable(heroCards('gydion').find((c) => c.name === 'Lesser Transmutation'))).toEqual(['midas-touch', 'disintegrate']);
		expect(spellOf('wish')?.color).toBe('PURPLE');
	});
});
