// "Back" = one page back (the user's rule, 2026-10-16): the ← buttons on the GM / learn pages step back through this
// tab's history when it came from inside the app; opened cold (a link, a bookmark) they go to the home screen they
// belong to — `/?at=adminhub | learn | menu` reopens that screen instead of the landing page.
import { goto, afterNavigate } from '$app/navigation'
import { base } from '$app/paths'
import { gmActive } from './role'

let inApp = false
/** call once in the root layout: after the first in-app navigation, Back can use the browser's history */
export const trackNav = () => afterNavigate(({ from }) => { if (from) inApp = true })

export type HomeAt = 'adminhub' | 'learn' | 'menu'
export function goBack(home?: HomeAt) {
	if (inApp && history.length > 1) { history.back(); return }
	void goto(`${base}/?at=${home ?? (gmActive() ? 'adminhub' : 'menu')}`)
}
