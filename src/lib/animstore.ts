// Animation studio edits, shared by every browser (Supabase `goa2_anim`; the SQL to make it is ANIM_SQL).
// One row per edited thing: id = `edit:<entry>:<clip>` (a clip's edited steps) or `rig:<hero>` (a hero's rig + poses).
// Reset = `deleted` (the anon key can't delete). Without the table the studio keeps edits in this browser only.
import { supabase } from '$lib/supabase'
import { isMissingTable } from '$lib/openings'

export const ANIM_TABLE = 'goa2_anim'
export type AnimRow = { id: string; data: unknown; deleted?: boolean | null; updated_at?: string | null }
export type AnimLoaded = { status: 'ready' | 'missing' | 'error'; error: string; rows: Record<string, unknown> }

/** live rows by id (deleted ones left out) */
export function animOfRows(rows: AnimRow[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const r of rows) if (r?.id && !r.deleted && r.data != null) out[r.id] = r.data
	return out
}

export async function loadAnim(prefix = ''): Promise<AnimLoaded> {
	try {
		let q = supabase.from(ANIM_TABLE).select('id,data,deleted,updated_at')
		if (prefix) q = q.like('id', prefix + '%')
		const { data, error } = await q
		if (error) return { status: isMissingTable(error) ? 'missing' : 'error', error: error.message, rows: {} }
		return { status: 'ready', error: '', rows: animOfRows((data ?? []) as AnimRow[]) }
	} catch (e) {
		return { status: 'error', error: (e as { message?: string })?.message ?? String(e), rows: {} }
	}
}

/** '' = saved; else what went wrong. data null = reset (marks the row deleted). */
export async function saveAnim(id: string, data: unknown): Promise<string> {
	try {
		const row = { id, data: data ?? {}, deleted: data == null, updated_at: new Date().toISOString() }
		const { error } = await supabase.from(ANIM_TABLE).upsert(row, { onConflict: 'id' })
		if (!error) return ''
		return isMissingTable(error) ? "The animation table isn't set up in Supabase yet." : error.message
	} catch (e) { return (e as { message?: string })?.message ?? String(e) }
}

/** The SQL that sets the table up (run once in the Supabase dashboard's SQL editor). */
export const ANIM_SQL = `create table if not exists public.${ANIM_TABLE} (
  id text primary key,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.${ANIM_TABLE} enable row level security;
create policy "anim read" on public.${ANIM_TABLE} for select to anon using (true);
create policy "anim add" on public.${ANIM_TABLE} for insert to anon with check (true);
create policy "anim edit" on public.${ANIM_TABLE} for update to anon using (true) with check (true);`
