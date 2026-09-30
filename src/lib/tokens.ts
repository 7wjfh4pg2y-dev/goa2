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

// ── supply + lifetime ─────────────────────────────────────────────────────────
// Every token is a limited supply per hero, and most leave play on their own:
// 'turn' = cleared when the turn ends (the card says "End of turn: remove…"),
// 'round' = the default — cleared at the end of the round, 'never' = stays until
// removed (the card says "not removed at the end of round", or it isn't a token).
export type Expiry = 'turn' | 'round' | 'never'
const RULES: Record<string, { limit?: number; expires?: Expiry }> = {
	token_zombie: { limit: 4, expires: 'never' }, // Awaken!: not removed at the end of round
	token_glitch: { limit: 3, expires: 'turn' }, // End of turn: remove all Glitch tokens
	token_illusion: { limit: 3 },
	token_ice: { limit: 3 },
	token_barrier: { limit: 3 },
	token_blast: { limit: 2 },
	token_dud: { limit: 2 },
	token_smoke_bomb: { limit: 1 },
	token_grenade: { limit: 1, expires: 'turn' }, // End of turn: … remove the Grenade token
	token_rock: { limit: 3 },
	token_tree: { limit: 3, expires: 'never' }, // Mystic Saplings: not removed at the end of round
	token_totem: { limit: 1 },
	companion: { limit: 1, expires: 'never' }, // Pyro / Turret stay between rounds
	marker_poison: { limit: 1 },
	marker_bounty: { limit: 1 }
	// token_magma, token_familiar: limit not known yet → unlimited
}
const rule = (t?: string) => (t?.startsWith('rune_') ? { limit: 1, expires: 'never' as Expiry } : (t && RULES[t]) || {})

/** When this token leaves play by itself. */
export const tokenExpiry = (t?: string): Expiry => rule(t).expires ?? 'round'
/** How many of this token one hero has (undefined = no known limit). */
export const tokenLimit = (t?: string): number | undefined => rule(t).limit

/** How many of `token` its owner can still place (Infinity when there's no limit). */
export function tokensLeft(pieces: Record<string, Piece>, owner: string, token: string): number {
	const lim = tokenLimit(token)
	if (lim == null) return Infinity
	const used = Object.values(pieces).filter((p) => p.kind === 'token' && p.owner === owner && p.token === token).length
	return Math.max(0, lim - used)
}

/** Clear the tokens that expire at this point ('turn' → end of turn, 'round' → end of round). */
export function sweepTokens(pieces: Record<string, Piece>, at: 'turn' | 'round'): Record<string, Piece> {
	const out: Record<string, Piece> = {}
	for (const id in pieces) {
		const p = pieces[id]
		const exp = p.kind === 'token' ? tokenExpiry(p.token) : 'never'
		if (exp === 'turn' || (at === 'round' && exp === 'round')) continue
		out[id] = p
	}
	return out
}

// ── removing a token by hand ─────────────────────────────────────────────────
// The Remove menu offers the reasons the cards give for taking a token out of play,
// so the log says what happened (and a mine reveals itself when it goes off).
export type RemovalOption = { id: string; label: string; hint?: string; needsHero?: boolean }

export function removalOptions(p: Piece): RemovalOption[] {
	const plain: RemovalOption = { id: 'remove', label: 'Remove' }
	if (p.kind === 'minion') return [{ id: 'remove', label: 'Remove minion' }]
	const t = p.token
	if (t && MINES.has(t)) return [{ id: 'trigger', label: 'An enemy hero moved through it', hint: 'reveals it — a Blast makes them discard', needsHero: true }, plain]
	if (t === 'token_tree') return [{ id: 'use', label: 'Use the Tree', hint: 'e.g. retrieve a discarded card' }, plain]
	if (t === 'token_zombie') return [{ id: 'use', label: 'Use the Zombie', hint: '+1 Attack' }, plain]
	if (t === 'token_totem') return [{ id: 'use', label: 'Save a minion', hint: 'the Totem is removed instead' }, plain]
	if (t === 'marker_bounty') return [{ id: 'toowner', label: 'Give it to Bain', hint: 'Close Call' }, { id: 'remove', label: 'Retrieve it', hint: 'Narrow Escape' }]
	return [plain]
}

/** Apply a removal choice. `toowner` moves the marker onto its owner's hero instead. */
export function applyRemoval(pieces: Record<string, Piece>, id: string, choice: string): Record<string, Piece> {
	const p = pieces[id]
	if (!p) return pieces
	const next = { ...pieces }
	if (choice === 'toowner' && p.owner && next[p.owner]?.kind === 'hero') {
		next[id] = { ...p, hex: next[p.owner].hex, attachedTo: p.owner }
		return next
	}
	delete next[id]
	return next
}

/** The activity-log line for a removal (hero = the enemy hero who set off a mine). */
export function removalLog(p: Piece, choice: string, hero?: string): string {
	const name = p.kind === 'minion' ? `a ${p.team} ${p.role} minion` : p.token === 'companion' ? (p.label ?? 'companion') : tokenName(p.token ?? '')
	if (choice === 'trigger') {
		const who = hero ?? 'An enemy hero'
		return p.token === 'token_blast' ? `set off a mine — 💥 Blast! ${who} discards a card, if able` : `set off a mine — a Dud (${who} is unharmed)`
	}
	if (choice === 'use') return p.token === 'token_totem' ? 'removed the Totem to save a minion' : p.token === 'token_zombie' ? 'used a Zombie (+1 Attack)' : `used a ${name}`
	if (choice === 'toowner') return 'took the Bounty marker (Close Call)'
	return `removed ${p.faceDown ? 'a mine' : name}`
}

/** Tokens are removed by their owner or the host; minions by anyone. */
export const canRemove = (p: Piece, me: string, isHost: boolean) => p.kind !== 'token' || isHost || p.owner === me
