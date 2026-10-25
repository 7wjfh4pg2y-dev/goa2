// Published maps (Supabase `goa2_maps`; the SQL to make it is MAPS_SQL): a map made in the editor and published there
// shows in EVERY host's Create game, no deploy needed. One row per map name; Unpublish = `deleted` (the anon key can't delete).
import { supabase } from '$lib/supabase'
import { isMissingTable } from '$lib/openings'
import type { GameMap } from '$lib/maps'

export const MAPS_TABLE = 'goa2_maps'
export type PublishedMap = { id: string; name: string; data: GameMap; deleted: boolean; updatedAt: number }
export type MapRow = { id: string; name: string; data: GameMap; deleted?: boolean | null; updated_at?: string | null }

/** one row per name: 'pub:' + the name, trimmed, spacing + case ignored */
export const publishedId = (name: string) => 'pub:' + name.trim().toLowerCase().replace(/\s+/g, ' ')

/** the live published maps from the table's rows, A–Z (rows without hexes or name are skipped) */
export function publishedOfRows(rows: MapRow[]): PublishedMap[] {
	return rows
		.filter((r) => r && r.name?.trim() && r.data?.cells && Object.keys(r.data.cells).length)
		.map((r) => ({ id: r.id, name: r.name.trim(), data: { ...r.data, name: r.name.trim() }, deleted: !!r.deleted, updatedAt: r.updated_at ? Date.parse(r.updated_at) || 0 : 0 }))
		.filter((m) => !m.deleted)
		.sort((a, b) => a.name.localeCompare(b.name))
}

export type MapsLoaded = { status: 'ready' | 'missing' | 'error'; error: string; maps: PublishedMap[] }

export async function loadPublished(): Promise<MapsLoaded> {
	try {
		const { data, error } = await supabase.from(MAPS_TABLE).select('id,name,data,deleted,updated_at')
		if (error) return { status: isMissingTable(error) ? 'missing' : 'error', error: error.message, maps: [] }
		return { status: 'ready', error: '', maps: publishedOfRows((data ?? []) as MapRow[]) }
	} catch (e) {
		return { status: 'error', error: (e as { message?: string })?.message ?? String(e), maps: [] }
	}
}

/** '' = done; else what went wrong */
async function put(row: MapRow & { updated_at: string }): Promise<string> {
	try {
		const { error } = await supabase.from(MAPS_TABLE).upsert(row, { onConflict: 'id' })
		if (!error) return ''
		return isMissingTable(error) ? "The maps table isn't set up in Supabase yet." : error.message
	} catch (e) { return (e as { message?: string })?.message ?? String(e) }
}
export const publishMap = (name: string, data: GameMap) =>
	put({ id: publishedId(name), name: name.trim(), data: { ...data, name: name.trim() }, deleted: false, updated_at: new Date().toISOString() })
export const unpublishMap = (m: PublishedMap) =>
	put({ id: m.id, name: m.name, data: m.data, deleted: true, updated_at: new Date().toISOString() })

/** The SQL that sets the table up (run once in the Supabase dashboard's SQL editor). */
export const MAPS_SQL = `create table if not exists public.${MAPS_TABLE} (
  id text primary key,
  name text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.${MAPS_TABLE} enable row level security;
create policy "maps read" on public.${MAPS_TABLE} for select to anon using (true);
create policy "maps add" on public.${MAPS_TABLE} for insert to anon with check (true);
create policy "maps edit" on public.${MAPS_TABLE} for update to anon using (true) with check (true);`
