import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { resolveAliases, peopleOf, lookalikes, mergeRows, splitRow, shownName } from './aliases'
import { buildLeague, useAliases, canonName } from './league'
import { sampleRows } from './league.sample'

describe('name aliases', () => {
	it('resolves chains and keeps a spelling’s own capitals', () => {
		const m = resolveAliases([{ alias: 'mo', name: 'Moe' }, { alias: 'moe', name: 'Mojo' }, { alias: 'sam', name: 'SAM' }, { alias: 'a', name: 'b' }, { alias: 'b', name: 'a' }])
		expect(m.mo).toBe('Mojo')
		expect(m.sam).toBe('SAM')
		expect(['a', 'b']).toContain(m.a.toLowerCase()) // a loop stops
		expect(shownName(m, '  mo ')).toBe('Mojo')
		expect(shownName(m, 'Zara')).toBe('Zara')
	})
	it('groups spellings into people and finds look-alikes', () => {
		const seen = [
			{ raw: 'Avery', table: false, at: 1 }, { raw: 'avery ', table: true, at: 2 }, { raw: 'Aves', table: false, at: 3 },
			{ raw: 'Harper', table: false, at: 1 }, { raw: 'Harpr', table: false, at: 4 }, { raw: 'Quinn', table: false, at: 5 }
		]
		let people = peopleOf(seen, {})
		expect(people.find((p) => p.key === 'avery')!.games).toBe(2)
		const pairs = lookalikes(people).map(([a, b]) => [a.name, b.name].sort().join('+'))
		expect(pairs).toContain('Harper+Harpr')
		expect(pairs).not.toContain('Quinn+Harper')
		const m = resolveAliases(mergeRows(people.filter((p) => /harp/i.test(p.name)), 'Harper'))
		people = peopleOf(seen, m)
		const h = people.find((p) => p.key === 'harper')!
		expect(h.games).toBe(2)
		expect(h.spellings.length).toBe(2)
		const back = resolveAliases([...mergeRows([h], 'Harper'), splitRow(h.spellings.find((s) => s.key === 'harpr')!)])
		expect(peopleOf(seen, back).find((p) => p.key === 'harpr')!.games).toBe(1)
	})
	it('the league counts merged spellings as one player', () => {
		const rows = sampleRows(6, 3)
		const raw = Object.values((rows[0].data as any).players).map((p: any) => p.name as string)
		const before = buildLeague(rows).players.length
		useAliases(resolveAliases([{ alias: raw[0].toLowerCase(), name: raw[1] }]))
		expect(canonName(raw[0])).toBe(raw[1])
		const after = buildLeague(rows).players.length
		useAliases({})
		expect(after).toBe(before - 1)
	})
})
