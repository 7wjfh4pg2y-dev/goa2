// Hero tokens & markers: which hero gets which, and the board rules for them.
// Pure functions over the shared `pieces` map so they can be unit-tested.
import type { Piece, Team } from './match'

/** 'companion' = the hero's lettered summon (Trinkets' Turret, Widget's Pyro). */
export const HERO_KIT: Record<string, string[]> = {
	bain: ['marker_bounty'],
	tigerclaw: ['marker_poison'],
	snorri: ['rune_anvil_marker', 'rune_axe_marker', 'rune_bird_marker', 'rune_horn_marker'],
	trinkets: ['token_barrier', 'companion'],
	min: ['token_blast', 'token_dud', 'token_grenade', 'token_smoke_bomb'],
	gydion: ['token_familiar'],
	emmitt: ['token_glitch'],
	tali: ['token_ice', 'token_totem'],
	nebkher: ['token_illusion'],
	ignatia: ['token_magma'],
	mrak: ['token_rock'],
	wuk: ['token_tree'],
	mortimer: ['token_zombie'],
	widget: ['companion']
}
export const COMPANIONS: Record<string, string> = { widget: 'Pyro', trinkets: 'Turret' }

/** Min's mines: double-sided, placed face down (skull up), flipped to reveal. */
export const MINES = new Set(['token_blast', 'token_dud'])
/** Status markers that attach to an enemy hero and show on their HUD. */
export const STATUS_MARKERS: Record<string, 'poison' | 'bounty'> = { marker_poison: 'poison', marker_bounty: 'bounty' }
/** Markers exist once each: placing one again moves it. */
const isUniqueMarker = (t?: string) => !!t && (t.startsWith('marker_') || t.startsWith('rune_'))

export const tokenName = (t: string) =>
	t === 'companion' ? 'companion' : t.replace(/^(token|marker|rune)_/, '').replace(/_marker$/, '').replace(/_/g, ' ')

const heroOn = (pieces: Record<string, Piece>, hex: string, enemyOf: Team | 'neutral') =>
	Object.values(pieces).find((p) => p.kind === 'hero' && p.hex === hex && p.team !== enemyOf)

/** Place a token/marker on a hex, applying the rules (mines face down, one of
 *  each marker, poison/bounty attach to an enemy hero standing there). */
export function placeToken(pieces: Record<string, Piece>, t: Piece): Record<string, Piece> {
	const next = { ...pieces }
	if (isUniqueMarker(t.token)) for (const id in next) if (next[id].token === t.token) delete next[id]
	const p: Piece = { ...t, kind: 'token' }
	if (t.token && MINES.has(t.token)) p.faceDown = true
	if (t.token && STATUS_MARKERS[t.token]) {
		const host = heroOn(next, t.hex, t.team)
		if (host) p.attachedTo = host.id
	}
	next[p.id] = p
	return next
}

/** Move a piece. A status marker re-attaches to an enemy hero on the new hex, or
 *  comes loose (status ends) anywhere else. */
export function moveToken(pieces: Record<string, Piece>, id: string, hex: string): Record<string, Piece> {
	const p = pieces[id]
	if (!p) return pieces
	const moved: Piece = { ...p, hex }
	delete moved.attachedTo
	if (p.token && STATUS_MARKERS[p.token]) {
		const host = heroOn(pieces, hex, p.team)
		if (host) moved.attachedTo = host.id
	}
	return { ...pieces, [id]: moved }
}

/** Where a piece actually sits: an attached marker rides on its hero. */
export const effectiveHex = (pieces: Record<string, Piece>, p: Piece) =>
	(p.attachedTo && pieces[p.attachedTo]?.hex) || p.hex

/** Per-player status (poison / bounty), derived from markers attached to heroes. */
export function statusFrom(pieces: Record<string, Piece>): Record<string, { poison: number; bounty: number }> {
	const out: Record<string, { poison: number; bounty: number }> = {}
	for (const p of Object.values(pieces)) {
		const k = p.token ? STATUS_MARKERS[p.token] : undefined
		if (!k || !p.attachedTo || !pieces[p.attachedTo]) continue
		;(out[p.attachedTo] ??= { poison: 0, bounty: 0 })[k] = 1
	}
	return out
}

/** Toggle a status marker straight onto a hero (from their player board). */
export function toggleStatusMarker(pieces: Record<string, Piece>, key: 'poison' | 'bounty', heroId: string, owner: string, team: Team | 'neutral'): Record<string, Piece> {
	const token = key === 'poison' ? 'marker_poison' : 'marker_bounty'
	const on = !statusFrom(pieces)[heroId]?.[key]
	const next = { ...pieces }
	for (const id in next) if (next[id].token === token) delete next[id]
	const host = pieces[heroId]
	if (on && host) {
		const id = `tok_${owner}_${token}_${Date.now().toString(36)}`
		next[id] = { id, hex: host.hex, team, kind: 'token', token, owner, attachedTo: heroId }
	}
	return next
}

/** A token picked off the shelf, waiting for a hex (drives the held-token cursor). */
export type ArmToken = { token: string; img?: string; letter?: string; label?: string; color?: string; team: Team | 'neutral'; owner: string }
