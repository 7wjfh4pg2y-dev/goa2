// Card faces are painted ONCE per (hero, card, options) and shared as an image URL.
//
// Painting a card (frame art + text layout on a 1192×1664 canvas) is the most
// expensive thing the UI does, and the same card shows up in many places at once
// (hand, dash, deck tree, inspector, previews, other players' boards). Every
// <Card> used to own a full-size canvas (~8 MB each) and repaint on every mount —
// e.g. on every hover in the deck view. Now the first request paints into a
// scratch canvas, encodes it to a blob, and every <Card> for that face shows the
// same <img> URL: one paint, one decode, a fraction of the memory.
import { images, importCardImage, preloadImages, updateCanvas } from './card_painter'
import { Color, Item, Modifier, Type, ValueSign } from './states'
import { backgroundSlug, heroStat, type HeroCardJson } from './deck'

export const CARD_W = 1192
export const CARD_H = 1664

const cardArt = import.meta.glob('./images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>

// the frame parts + fonts load once for the whole app
let base: Promise<unknown> | null = null
const ready = () =>
	(base ??= Promise.all([preloadImages(), document.fonts.load('16px "Modesto Poster"'), document.fonts.ready]))

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

async function paint(heroId: string, card: HeroCardJson, extraSlotIndex: number | null, showNumbers: boolean): Promise<string> {
	await ready()
	const bg = await art(heroId, backgroundSlug(card, extraSlotIndex))
	const cv = document.createElement('canvas')
	cv.width = CARD_W
	cv.height = CARD_H
	const ctx = cv.getContext('2d')
	if (!ctx) throw new Error('no 2d context')
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
	// webp where the browser can encode it (Chromium/Firefox), PNG otherwise (Safari)
	const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/webp', 0.92))
	if (!blob) throw new Error('card encode failed')
	cv.width = cv.height = 0 // release the scratch canvas now
	return URL.createObjectURL(blob)
}

const faces = new Map<string, Promise<string>>()

/** The image URL for a card face, painted on first request and shared after that. */
export function cardFace(heroId: string, card: HeroCardJson, extraSlotIndex: number | null = null, showNumbers = true): Promise<string> {
	const k = cardKey(heroId, card, extraSlotIndex, showNumbers)
	let p = faces.get(k)
	if (!p) {
		p = paint(heroId, card, extraSlotIndex, showNumbers)
		faces.set(k, p)
		p.catch(() => faces.delete(k)) // let a later request retry
	}
	return p
}
