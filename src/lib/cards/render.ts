// Card faces are painted ONCE per (hero, card, options) and shared.
//
// Painting a card (frame art + text layout on a 1192×1664 canvas) is the most
// expensive thing the UI does, and the same card shows up in many places at once
// (hand, dash, deck tree, inspector, previews, other players' boards). The first
// request paints a full-resolution MASTER (kept as an uncompressed ImageBitmap —
// no lossy encode, no slow PNG/WebP compression); every <Card> then just copies
// the master into its own small canvas at the size it's shown (a ~1 ms drawImage).
// A small LRU bounds memory; `prewarm` paints a whole deck up front (used on the
// matchup splash, like a loading screen).
import { images, importCardImage, loadImages, preloadImages, takeMissing, updateCanvas } from './card_painter'
import { Color, Item, Modifier, Type, ValueSign } from './states'
import { backgroundSlug, heroStat, type HeroCardJson } from './deck'

export const CARD_W = 1192
export const CARD_H = 1664

const cardArt = import.meta.glob('./images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>

// the fonts load once for the whole app; frame parts load as cards need them (a paint names the ones it lacked)
let base: Promise<unknown> | null = null
const ready = () => (base ??= Promise.all([document.fonts.load('16px "Modesto Poster"'), document.fonts.ready]))

const loadImg = (src: string) =>
	new Promise<HTMLImageElement | null>((res) => {
		const i = new Image()
		i.onload = () => res(i)
		i.onerror = () => res(null)
		i.src = src
	})

// centre-crop the art to the card window (drawn straight from a canvas — no re-encode)
function crop(image: HTMLImageElement): CanvasImageSource {
	const sw = Math.min(744, image.width), sh = Math.min(1039, image.height)
	const cv = document.createElement('canvas')
	cv.width = sw
	cv.height = sh
	const c = cv.getContext('2d')
	if (!c) return image
	c.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, sw, sh)
	return cv
}

async function art(heroId: string, slug: string): Promise<CanvasImageSource | undefined> {
	const url = cardArt[`./images/cards/${heroId}/${slug}.webp`]
	let img = url ? await loadImg(url) : null
	if (!img) {
		await importCardImage(heroId, slug)
		const fb = images.get(slug)
		img = fb instanceof HTMLImageElement ? fb : null
	}
	return img ? crop(img) : undefined
}

export function cardKey(heroId: string, card: HeroCardJson, extraSlotIndex: number | null, showNumbers: boolean): string {
	return `${heroId}|${backgroundSlug(card, extraSlotIndex)}|${card.name ?? ''}|${showNumbers ? 1 : 0}`
}

export type Master = ImageBitmap | HTMLCanvasElement

// Phones / touch tablets keep SMALLER masters and fewer of them: iOS Safari caps the memory all canvases and
// bitmaps may use together (a full master is ~8 MB; 32 of them blew the cap), and once it is hit — or the tab
// comes back from the background with its graphics memory dropped — new canvases silently draw nothing and
// cards came up blank (a friend's report, 2026-10-13).
const SMALL = typeof matchMedia === 'function' && matchMedia('(max-width: 760px), (pointer: coarse)').matches
const SCALE = SMALL ? 0.75 : 1
const release = (c: unknown) => { if (c instanceof HTMLCanvasElement) c.width = c.height = 0 }

async function paint(heroId: string, card: HeroCardJson, extraSlotIndex: number | null, showNumbers: boolean): Promise<Master> {
	// frame parts + fonts, the ::emoji:: this card's text uses, and its art
	const emoji = [...(card.description ?? '').matchAll(/::([a-z_]+)::/g)].map((m) => m[1])
	const [, , bg] = await Promise.all([ready(), loadImages(emoji), art(heroId, backgroundSlug(card, extraSlotIndex))])
	const cv = document.createElement('canvas')
	cv.width = CARD_W
	cv.height = CARD_H
	const ctx = cv.getContext('2d')
	if (!ctx) throw new Error('no 2d context')
	// paint, and if any frame part wasn't downloaded yet, fetch just those and paint again
	for (let pass = 0; ; pass++) {
		updateCanvas(
			cv, ctx, [], bg,
			(card.color as Color) ?? Color.GOLD,
			card.handicapped ?? false, card.extra ?? false,
			card.name ?? '', card.description ?? '',
			'i'.repeat(card.level ?? 1),
			(card.item as Item) ?? Item.ATTACK,
			card.initiative ?? 0,
			(card.primaryAction as Type) ?? Type.ATTACK,
			card.primaryValue ?? 0,
			(card.primaryValueSign as ValueSign) ?? ValueSign.NONE,
			(card.modifier as Modifier) ?? Modifier.NONE,
			card.modifierValue ?? 0,
			(card.modifierValueSign as ValueSign) ?? ValueSign.NONE,
			card.secondaryMovement ?? 0,
			card.secondaryDefense ?? 0,
			card.secondaryAttack ?? null,
			0, 0, 0, 0, 0, 0,
			showNumbers,
			heroStat(heroId, 0), heroStat(heroId, 1), heroStat(heroId, 2), heroStat(heroId, 3)
		)
		const need = takeMissing()
		if (!need.length) break
		if (pass >= 3) { release(bg); release(cv); throw new Error('card parts missing: ' + need.join(', ')) }
		await loadImages(need)
	}
	release(bg) // the cropped art's scratch canvas
	// a context the browser took away (Android Chrome does this to background tabs) draws nothing: don't
	// keep a blank face — fail, and the <Card> tries again a moment later
	if ((ctx as CanvasRenderingContext2D & { isContextLost?: () => boolean }).isContextLost?.() || !alive(cv)) { release(cv); throw new Error('card painted blank') }
	let out = cv
	if (SCALE < 1) {
		const sc = document.createElement('canvas')
		sc.width = Math.round(CARD_W * SCALE)
		sc.height = Math.round(CARD_H * SCALE)
		const c2 = sc.getContext('2d')
		if (c2) { c2.imageSmoothingQuality = 'high'; c2.drawImage(cv, 0, 0, sc.width, sc.height); release(cv); out = sc }
	}
	// keep it as a bitmap (no encode); fall back to the canvas itself where unsupported
	if (typeof createImageBitmap === 'function') {
		try {
			const bmp = await createImageBitmap(out)
			if (alive(bmp)) { release(out); return bmp } // the scratch canvas goes
			bmp.close()
		} catch { /* keep the canvas */ }
	}
	return out
}

// most-recently-used masters; evicted ones stay alive while a <Card> still holds them
const MAX_MASTERS = SMALL ? 16 : 32
const masters = new Map<string, Promise<Master>>()
const settled = new Map<string, Master>() // the painted ones, to check them after the tab comes back

/** The full-resolution master for a card face, painted on first request and shared after that. */
export function cardMaster(heroId: string, card: HeroCardJson, extraSlotIndex: number | null = null, showNumbers = true): Promise<Master> {
	const k = cardKey(heroId, card, extraSlotIndex, showNumbers)
	let p = masters.get(k)
	if (p) {
		masters.delete(k) // bump to most recent
		masters.set(k, p)
		return p
	}
	p = paint(heroId, card, extraSlotIndex, showNumbers)
	masters.set(k, p)
	p.then((m) => settled.set(k, m), () => masters.delete(k)) // a failed paint: a later request retries
	while (masters.size > MAX_MASTERS) { const old = masters.keys().next().value as string; masters.delete(old); settled.delete(old) }
	return p
}

/** Is a painted master still there? A closed / dropped bitmap reports width 0, and one whose memory the
 *  browser threw away draws nothing — so draw its middle into a 1×1 canvas and look. */
function alive(m: Master): boolean {
	try {
		if (!m.width || !m.height) return false
		const c = document.createElement('canvas')
		c.width = c.height = 1
		const x = c.getContext('2d', { willReadFrequently: true })
		if (!x) return false
		x.drawImage(m, m.width * 0.4, m.height * 0.4, m.width * 0.2, m.height * 0.2, 0, 0, 1, 1)
		const a = x.getImageData(0, 0, 1, 1).data[3]
		c.width = c.height = 0
		return a > 0
	} catch { return false }
}

/** After the tab was in the background: drop every master that didn't survive (so it is painted again), then
 *  tell every <Card> to draw itself again (`goa2-cards-redraw`) — its own canvas may have been cleared too. */
export function reviveCards() {
	if (typeof document === 'undefined') return
	for (const [k, m] of settled) if (!alive(m)) { settled.delete(k); masters.delete(k); try { (m as ImageBitmap).close?.() } catch { /* gone */ } }
	window.dispatchEvent(new Event('goa2-cards-redraw'))
}
if (typeof document !== 'undefined') {
	let hiddenAt = 0
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) hiddenAt = Date.now()
		else if (hiddenAt) { hiddenAt = 0; setTimeout(reviveCards, 60) }
	})
	window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) setTimeout(reviveCards, 60) })
}

/** Download a set of heroes' card art ahead of time (network only — cheap). */
export function preloadArt(heroIds: string[]) {
	if (typeof document === 'undefined') return
	void ready()
	void preloadImages() // the frame parts too, in the background (hero select / the matchup), so the game's first cards don't wait
	for (const h of heroIds) for (const k in cardArt) if (k.startsWith(`./images/cards/${h}/`)) { const i = new Image(); i.src = cardArt[k] }
}

/** Paint every card of a deck up front, one at a time (yielding between cards so
 *  animations stay smooth). `onProgress(done, total)` after each card. */
export async function prewarm(heroId: string, cards: HeroCardJson[], onProgress?: (done: number, total: number) => void) {
	if (typeof document === 'undefined') return
	let done = 0
	onProgress?.(0, cards.length)
	for (const c of cards) {
		try { await cardMaster(heroId, c) } catch { /* painted again on demand */ }
		onProgress?.(++done, cards.length)
		await new Promise((r) => setTimeout(r, 0))
	}
}
