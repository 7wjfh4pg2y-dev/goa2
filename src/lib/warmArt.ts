// Hero-select paintings (`heroSplash`, ~130 KB each) used to download only when a hero was clicked — a 1–2 s wait on
// every switch. This warms them in the background, a few at a time, as early as the pre-game lobby (players sit there
// anyway); a hero under the pointer jumps the queue. Each is decoded once and kept for the page's life, so a switch
// is instant. Browser only; any failure is harmless (the <img> just loads it the normal way).
import { heroSplash } from './heroes'

const kept = new Map<string, HTMLImageElement>()
let queue: string[] = []
let busy = 0
const AT_ONCE = 3

function load(id: string): Promise<void> {
	if (typeof Image === 'undefined' || kept.has(id)) return Promise.resolve()
	const src = heroSplash(id)
	if (!src) return Promise.resolve()
	const im = new Image()
	im.decoding = 'async'
	im.src = src
	kept.set(id, im)
	return (im.decode?.() ?? Promise.resolve()).catch(() => {})
}
function pump() {
	while (busy < AT_ONCE && queue.length) {
		const id = queue.shift()!
		if (kept.has(id)) continue
		busy++
		load(id).finally(() => { busy--; pump() })
	}
}
/** queue these paintings (in this order, after any already queued) */
export function warmSplashes(ids: string[]) {
	if (typeof Image === 'undefined') return
	for (const id of ids) if (id && !kept.has(id) && !queue.includes(id)) queue.push(id)
	pump()
}
/** this one now, ahead of the queue (hover / touch on a hero) */
export function warmNow(id: string) {
	if (typeof Image === 'undefined' || kept.has(id)) return
	queue = queue.filter((q) => q !== id)
	load(id)
}
