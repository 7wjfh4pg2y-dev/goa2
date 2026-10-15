// Player names: one person, many spellings (tested in aliases.test.ts). The GM tools' Names page saves ALIASES —
// spelling (its playerKey) → the name to show — in Supabase `goa2_aliases`; the Hall of Records and the hero pages
// apply them when they load (league.ts `useAliases`), so nothing in a game row is ever rewritten, every merge can be
// undone, and a future game typed with an old spelling lands on the right person by itself.
import { supabase } from './supabase'
import { playerKey } from './league'

export const ALIAS_TABLE = 'goa2_aliases'
export const ALIAS_SQL = `create table if not exists public.goa2_aliases (
  alias text primary key,
  name text not null,
  updated_at timestamptz not null default now()
);
alter table public.goa2_aliases enable row level security;
grant select, insert, update on public.goa2_aliases to anon, authenticated;
drop policy if exists "aliases read" on public.goa2_aliases;
drop policy if exists "aliases add" on public.goa2_aliases;
drop policy if exists "aliases change" on public.goa2_aliases;
create policy "aliases read" on public.goa2_aliases for select to anon, authenticated using (true);
create policy "aliases add" on public.goa2_aliases for insert to anon, authenticated with check (true);
create policy "aliases change" on public.goa2_aliases for update to anon, authenticated using (true) with check (true);
notify pgrst, 'reload schema';`

export type AliasRow = { alias: string; name: string }

/** The rows as a lookup: spelling key → shown name, following chains (a → b, b → c gives a → c). A row whose name has
 *  the same key as its alias only sets the spelling's capitals (an "unmerged" spelling is saved that way). */
export function resolveAliases(rows: AliasRow[]): Record<string, string> {
	const direct = new Map<string, string>()
	for (const r of rows) if (r?.alias && r.name?.trim()) direct.set(playerKey(r.alias), r.name.trim())
	const out: Record<string, string> = {}
	for (const k of direct.keys()) {
		let name = direct.get(k)!
		const seen = new Set([k])
		for (let i = 0; i < 20; i++) {
			const nk = playerKey(name)
			if (seen.has(nk)) break
			seen.add(nk)
			const next = direct.get(nk)
			if (!next) break
			name = next
		}
		out[k] = name
	}
	return out
}

/** A spelling as it shows once the aliases apply. */
export const shownName = (map: Record<string, string>, raw: string) => map[playerKey(raw)] ?? raw.trim().replace(/\s+/g, ' ')

export type Spelling = { raw: string; key: string; games: number; online: number; table: number; last: number }
export type Person = { key: string; name: string; games: number; last: number; spellings: Spelling[] }

/** Every spelling seen, grouped into people by the aliases (most games first). `seen` = one entry per game a spelling
 *  played in: its raw name, online or table, and when. */
export function peopleOf(seen: { raw: string; table: boolean; at: number }[], map: Record<string, string>): Person[] {
	const sp = new Map<string, Spelling>()
	for (const s of seen) {
		const raw = (s.raw ?? '').trim().replace(/\s+/g, ' ')
		if (!raw) continue
		const key = playerKey(raw)
		const x = sp.get(key) ?? { raw, key, games: 0, online: 0, table: 0, last: 0 }
		x.games++
		if (s.table) x.table++; else x.online++
		if (s.at >= x.last) { x.last = s.at; x.raw = raw }
		sp.set(key, x)
	}
	const people = new Map<string, Person>()
	for (const s of sp.values()) {
		const name = map[s.key] ?? s.raw
		const pk = playerKey(name)
		const p = people.get(pk) ?? { key: pk, name, games: 0, last: 0, spellings: [] }
		p.games += s.games
		p.last = Math.max(p.last, s.last)
		p.spellings.push(s)
		people.set(pk, p)
	}
	for (const p of people.values()) p.spellings.sort((a, b) => b.games - a.games)
	return [...people.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
function editDistance(a: string, b: string): number {
	if (Math.abs(a.length - b.length) > 2) return 3
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
	for (let j = 1; j <= b.length; j++) d[0][j] = j
	for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
		d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
	return d[a.length][b.length]
}
/** Two people who might be one: the same letters once spaces / signs are dropped, one name the start of the other
 *  ("Au" / "Aus"), or one letter apart in names of 4+ letters. Pairs, the more-played person first. */
export function lookalikes(people: Person[], skip: Set<string> = new Set()): [Person, Person][] {
	const out: [Person, Person][] = []
	for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
		const a = people[i], b = people[j]
		if (skip.has(pairKey(a.key, b.key))) continue
		const x = squash(a.name), y = squash(b.name)
		if (!x || !y) continue
		const short = x.length <= y.length ? x : y, long = x.length <= y.length ? y : x
		const like = x === y || (short.length >= 2 && long.startsWith(short) && long.length - short.length <= 2)
			|| (short.length >= 4 && editDistance(x, y) <= 1)
		if (like) out.push(a.games >= b.games ? [a, b] : [b, a])
	}
	return out
}
export const pairKey = (a: string, b: string) => [a, b].sort().join('|')

/** The rows that merge these people into one name (every spelling of each → the name). */
export const mergeRows = (people: Person[], name: string): AliasRow[] =>
	people.flatMap((p) => p.spellings.map((s) => ({ alias: s.key, name: name.trim() })))
/** The row that splits one spelling back out under its own name. */
export const splitRow = (s: Spelling): AliasRow => ({ alias: s.key, name: s.raw })

export async function loadAliases(): Promise<{ status: 'ready' | 'missing' | 'error'; rows: AliasRow[]; message?: string }> {
	try {
		const { data, error } = await supabase.from(ALIAS_TABLE).select('alias,name')
		if (error) return { status: /does not exist|relation|schema cache|not find/i.test(error.message) ? 'missing' : 'error', rows: [], message: error.message }
		return { status: 'ready', rows: (data ?? []) as AliasRow[] }
	} catch (e) { return { status: 'error', rows: [], message: String(e) } }
}
export async function saveAliases(rows: AliasRow[]): Promise<string | null> {
	if (!rows.length) return null
	try {
		const { error } = await supabase.from(ALIAS_TABLE).upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'alias' })
		return error ? error.message : null
	} catch (e) { return String(e) }
}
