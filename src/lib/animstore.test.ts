import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { animOfRows, ANIM_SQL, ANIM_TABLE } from './animstore';

describe('animstore', () => {
	it('keeps live rows by id and drops reset ones', () => {
		const rows = animOfRows([
			{ id: 'edit:hero-brogan:attack', data: [{ s: 'attack', f: 0, d: 1 }] },
			{ id: 'edit:hero-arien:idle', data: [], deleted: true },
			{ id: '', data: [] }
		]);
		expect(Object.keys(rows)).toEqual(['edit:hero-brogan:attack']);
	});
	it('ships the table SQL with read / insert / update for the anon key and no delete', () => {
		expect(ANIM_SQL).toContain(ANIM_TABLE);
		expect(ANIM_SQL).toMatch(/for select to anon/);
		expect(ANIM_SQL).not.toMatch(/for delete/);
	});
});
