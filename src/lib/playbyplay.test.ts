import { describe, it, expect } from 'vitest'
import { story, playByPlay, enemyTime, tokenCounts } from './playbyplay'
import { draftHighlights } from './reports'
import type { GameRowIn } from './league'

// a made-up 1 v 1: Zara (Atlanteans, arien) and Priya (Titans, brogan) on a tiny strip of map
const zones = { '1_1': 'Orange Base', '2_1': 'Center', '3_1': 'Center', '4_1': 'Blue Jungle', '5_1': 'Blue Base' }
const pcs = {
	a: { k: 'hero', tm: 'orange', h: 'arien' }, b: { k: 'hero', tm: 'blue', h: 'brogan' },
	m1: { k: 'minion', tm: 'blue', ro: 'melee' }, m2: { k: 'minion', tm: 'orange', ro: 'heavy' },
	z1: { k: 'token', tm: 'blue', tk: 'token_zombie', o: 'b' }, z2: { k: 'token', tm: 'blue', tk: 'token_zombie', o: 'b' }
}
const shot = (r: number, t: number, i: number, pid: string | null, card: number | null, at: number, p: Record<string, string>) => ({ r, t, i, pid, card, at, p })
const row = (): GameRowIn => ({
	id: 'ROOM-1', room: 'ROOM', started_at: '2026-10-10T18:00:00Z', ended_at: '2026-10-10T19:00:00Z', winner: 'blue', reason: 'won the Final Push', rounds: 2,
	data: {
		seats: 2, wavesMax: 3, lifeMax: 5, evv: 3, zones, pcs,
		players: { a: { name: 'Zara', hero: 'arien', seat: 0, team: 'orange' }, b: { name: 'Priya', hero: 'brogan', seat: 1, team: 'blue' } },
		turns: [{ round: 1, turn: 1, lane: 1, waves: 3, life: { orange: 5, blue: 5 } }, { round: 1, turn: 2, lane: 1, waves: 3 }, { round: 2, turn: 1, lane: 1, waves: 2 }],
		shots: [
			shot(1, 1, -1, null, null, 100, { a: '1_1', b: '5_1', m1: '3_1', m2: '2_1' }),
			shot(1, 1, 0, 'a', 0, 200, { a: '4_1', b: '5_1', m2: '2_1' }), // a dives into the Titan jungle and takes the melee
			shot(1, 1, 1, 'b', 0, 300, { a: '4_1', b: '3_1', m2: '2_1', z1: '2_1' }), // ... wait: the zombie on the heavy's hex below
			shot(1, 2, 0, 'b', 0, 400, { a: '3_1', b: '4_1', z1: '3_1', z2: '2_1' }), // swap + the heavy turned into a zombie
			shot(2, 1, 0, 'a', 0, 500, { a: '4_1', b: '4_1', z1: '3_1', z2: '2_1' })
		],
		ev: [
			{ k: 'minion', id: 'm1', r: 1, t: 1, i: 0, by: 'a', role: 'melee', team: 'blue' },
			{ k: 'clash', id: 'c1', r: 1, t: 2, i: 0, kind: 'attack', by: 'b', v: 'a', out: 'defended', disc: true },
			{ k: 'disc', id: 'd1', r: 1, t: 2, i: 0, by: 'a', card: 1, why: 'attack' }
		],
		log: [{ id: 'l1', by: 'Priya', text: 'flipped the coin', at: 450 }],
		notes: [{ id: 'n1', r: 1, t: 2, i: 0, at: 410, text: 'Priya baited the attack', by: 'Priya' }, { id: 'n2', r: 1, t: 2, i: 0, at: 420, text: 'deleted', by: 'x', del: true }],
		final: { round: 2, turn: 1, wonBy: { team: 'blue', reason: 'won the Final Push' } }
	}
}) as unknown as GameRowIn

describe('play-by-play', () => {
	it('reads moves, minions, tokens, swaps and conversions off the board shots', () => {
		const st = story(row().data)!
		expect(st.acts).toHaveLength(5)
		const dive = st.acts[1]
		expect(dive.moves).toEqual([{ id: 'a', from: '1_1', to: '4_1', dist: 3 }])
		expect(dive.events.map((e) => e.k)).toEqual(['minion'])
		const swap = st.acts[3]
		expect(swap.swaps).toEqual([['a', 'b']])
		expect(swap.converts.map((c) => [c.minion.id, c.token.id])).toEqual([['m2', 'z2']])
		expect(swap.notes.map((n) => n.id)).toEqual(['n1']) // the deleted note is gone
		expect(swap.log.map((e) => e.id)).toEqual(['l1'])
		expect(enemyTime(st).find((x) => x.pid === 'a')).toMatchObject({ n: 3, top: 'Blue Jungle' })
		expect([...tokenCounts(st).get('b')!]).toEqual([['Zombie', 2]])
	})
	it('writes the whole game as text, with the prompt, round by round, and the totals', () => {
		const t = playByPlay(row(), { match: 2 })
		expect(t).toContain('Weekly Game Report')
		expect(t).toContain('Red Team — the Atlanteans: Zara → ')
		expect(t).toContain('══ ROUND 2 ══')
		expect(t).toMatch(/SWAPPED places/)
		expect(t).toMatch(/Titan melee minion|a Titan melee minion/)
		expect(t).toContain('turned into a Zombie')
		expect(t).toContain('HOST NOTE: Priya baited the attack')
		expect(t).not.toContain('deleted')
		expect(t).toContain('Minions defeated: Zara 1')
		expect(playByPlay(row(), { prompt: false })).not.toContain('Weekly Game Report')
	})
	it('copes with an older game (no board shots)', () => {
		const old = row(); delete (old.data as Record<string, unknown>).shots
		expect(story(old.data)).toBeNull()
		expect(playByPlay(old)).toContain('recorded before the board was tracked')
	})
	it('feeds the drafted highlights: opening, enemy ground, tokens, swaps, conversions, the block card, notes', () => {
		const h = draftHighlights(row()).join('\n')
		expect(h).toContain('Opening moves:')
		expect(h).toMatch(/behind enemy lines, mostly in the Titan Jungle/)
		expect(h).toMatch(/put down 2 Zombies/)
		expect(h).toMatch(/swapped places with/)
		expect(h).toMatch(/turned the Atlantean heavy minion into a Zombie/)
		expect(h).toMatch(/defended with "/)
		expect(h).toContain('The deciding play:')
		expect(h).toContain('Note (R1 T2): Priya baited the attack')
	})
})
