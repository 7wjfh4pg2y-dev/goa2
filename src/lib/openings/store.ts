// Reading and writing the openings table (Supabase `goa2_openings`; the SQL to make it is OPENINGS_SQL).
// Every call says whether the table is there at all ('missing'), so the pages can say so instead of failing.
import { supabase } from '$lib/supabase'
import {
	OPENINGS_TABLE, openingOfRow, guideOfRow, rowOfOpening, rowOfGuide, isMissingTable, sortOpenings,
	type Opening, type HeroGuide, type OpeningRow
} from '$lib/openings'

export type LoadStatus = 'ready' | 'missing' | 'error'
export type Loaded = { status: LoadStatus; error: string; openings: Opening[]; guides: Record<string, HeroGuide> }

/** every opening and guide (or one hero's) */
export async function loadOpenings(hero?: string): Promise<Loaded> {
	try {
		let q = supabase.from(OPENINGS_TABLE).select('id,hero,kind,data,updated_at')
		if (hero) q = q.eq('hero', hero)
		const { data, error } = await q
		if (error) return { status: isMissingTable(error) ? 'missing' : 'error', error: error.message, openings: [], guides: {} }
		const rows = (data ?? []) as OpeningRow[]
		const guides: Record<string, HeroGuide> = {}
		for (const r of rows) { const g = guideOfRow(r); if (g) guides[g.hero] = g }
		return { status: 'ready', error: '', openings: sortOpenings(rows.map(openingOfRow).filter((o): o is Opening => !!o)), guides }
	} catch (e) {
		return { status: 'error', error: (e as { message?: string })?.message ?? String(e), openings: [], guides: {} }
	}
}

/** '' = saved; else what went wrong */
async function put(row: OpeningRow): Promise<string> {
	try {
		const { error } = await supabase.from(OPENINGS_TABLE).upsert(row, { onConflict: 'id' })
		if (!error) return ''
		return isMissingTable(error) ? "The openings table isn't set up in Supabase yet." : error.message
	} catch (e) { return (e as { message?: string })?.message ?? String(e) }
}
export const saveOpening = (o: Opening) => put(rowOfOpening({ ...o, updatedAt: Date.now() }))
export const saveGuide = (g: HeroGuide) => put(rowOfGuide({ ...g, updatedAt: Date.now() }))
