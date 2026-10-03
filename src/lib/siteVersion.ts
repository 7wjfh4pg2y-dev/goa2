// Site version switch (GM tools). The versions of the app are deployed side by side:
//   1.0 at /goa2/      (branch 1.0) — the default
//   2.0 at /goa2/v2/   (branch claude/stats-of-atlantis-replica-hg5nv2)
//   the RELEASE at /goa2/v1/ (branch release) — 1.0 with 2.0's features brought in one by one;
//     never redirects anyone and isn't offered by the switch until it is finished
// The GM picks which one is live in the Supabase table `goa2_settings` (key 'site_version').
// Every page load checks it and, if this build isn't the chosen one, moves the visitor over.
// Fail-safe: no table / offline / any error → stay where you are.
//
// This file is identical on every branch except THIS_VERSION.
import { base } from '$app/paths'
import { supabase } from './supabase'

export type SiteVersion = '1.0' | '2.0'
export type Build = SiteVersion | 'release'
export const THIS_VERSION = '1.0' as Build
export const SITE_VERSIONS: SiteVersion[] = ['1.0', '2.0']
const BASES: Record<SiteVersion, string> = { '1.0': '/goa2', '2.0': '/goa2/v2' }
const TABLE = 'goa2_settings'
const KEY = 'site_version'

const isVersion = (v: unknown): v is SiteVersion => v === '1.0' || v === '2.0'

/** The version the GM chose, or null if it can't be read. */
export async function fetchSiteVersion(): Promise<SiteVersion | null> {
	try {
		const { data, error } = await supabase.from(TABLE).select('value').eq('key', KEY).maybeSingle()
		return !error && isVersion(data?.value) ? data.value : null
	} catch {
		return null
	}
}

/** GM: make `v` the live version for everyone. Returns an error message, or null on success. */
export async function setSiteVersion(v: SiteVersion): Promise<string | null> {
	try {
		const { data, error } = await supabase.from(TABLE).update({ value: v, updated_at: new Date().toISOString() }).eq('key', KEY).select('value')
		if (error) return error.message
		if (!data?.length) return 'The goa2_settings table is missing its site_version row — run the setup SQL in Supabase.'
		return null
	} catch (e) {
		return e instanceof Error ? e.message : 'Could not reach the server.'
	}
}

/** Go to the start page of version `v` (keeps ?query so room links survive). */
export function goToVersion(v: SiteVersion) {
	if (v === THIS_VERSION || typeof location === 'undefined') return
	location.replace(`${BASES[v]}/${location.search}${location.hash}`)
}

// Preview mode (2.0's portal at /preview, its game at /sandbox): this TAB stays on whatever version it opened,
// so the GM can look around a version that isn't live. Ends when the tab closes.
const PREVIEW_KEY = 'goa2-preview'
export function isPreview(): boolean {
	try { return sessionStorage.getItem(PREVIEW_KEY) === '1' } catch { return false }
}
export function setPreview(on: boolean) {
	try { if (on) sessionStorage.setItem(PREVIEW_KEY, '1'); else sessionStorage.removeItem(PREVIEW_KEY) } catch { /* ignore */ }
}

/** On app start: if the GM picked the other version, move there. (Skipped in dev and in preview mode.) */
export async function followSiteVersion() {
	if (!base) return // `npm run dev` serves one version only
	if (THIS_VERSION === 'release') return // the work-in-progress release: testers stay put
	if (/^\/(preview|sandbox)\b/.test(location.pathname.slice(base.length))) setPreview(true)
	if (isPreview()) return
	const v = await fetchSiteVersion()
	if (v && v !== THIS_VERSION) goToVersion(v)
}
