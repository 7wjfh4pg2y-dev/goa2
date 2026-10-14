// OPENINGS — a hero's round-1 plans, drawn on the real Forgotten Island in the style of the fan-made Openings
// Compendium: turn chips (T1–T4) in the colour of the card played, dimmed chips for alternative routes, rings round
// the minion that's taken, arrows, shaded areas (a barrier's radius, the spaces you can reach), enemy (E) / ally (A)
// heroes and labels. A GM builds them in the opening builder (/opening-builder); the hero page shows them
// (/heroes → Openings): every opening as a snapshot, and one at a time turn by turn, from either side of the board.
// Stored in Supabase `goa2_openings` (one row per opening, plus one 'guide' row per hero for the Overview text).
import M from './maps/forgotten_island.json'
import type { GameMap } from './maps'

export const OPENING_MAP = M as unknown as GameMap
export const OPENINGS_TABLE = 'goa2_openings'

export type Side = 'orange' | 'blue'
export type CardColor = 'gold' | 'silver' | 'red' | 'blue' | 'green'
export const CARD_COLORS: CardColor[] = ['gold', 'silver', 'red', 'blue', 'green']
export const CARD_HEX: Record<CardColor, string> = { gold: '#e2ad2c', silver: '#b7c2cf', red: '#d63d2e', blue: '#2a66d4', green: '#3a9e4e' }
export const CARD_NAME: Record<CardColor, string> = { gold: 'Gold', silver: 'Silver', red: 'Red', blue: 'Blue', green: 'Green' }
/** extra mark colours (areas, rings, arrows): white and black, like the compendium's shaded spaces and E tokens */
export const MARK_HEX: Record<string, string> = { ...CARD_HEX, white: '#f4f1e8', black: '#111318' }

/** turn 0 = shown at every step (an enemy hero standing there, a label); 1–4 = from that turn on */
export type Turn = 0 | 1 | 2 | 3 | 4
type Base = { id: string; turn: Turn; alt?: boolean }
/** a turn chip ("T2") on a space, in the card's colour; alt = an alternative (dimmed) */
export type StepMark = Base & { kind: 'step'; hex: string; color: CardColor; text?: string }
/** a ring round a space (the minion you take); taken = that minion is gone from this turn on */
export type RingMark = Base & { kind: 'ring'; hex: string; color: string; taken?: boolean }
export type ArrowMark = Base & { kind: 'arrow'; from: string; to: string; color: string }
/** shaded spaces: fill = tinted, outline = a line round them (both: the compendium's pale hexes with an edge) */
export type AreaMark = Base & { kind: 'area'; hexes: string[]; color: string; style: 'fill' | 'outline' | 'both' }
/** an enemy (E) / ally (A) hero — a letter disc, or a real hero's token */
export type UnitMark = Base & { kind: 'unit'; hex: string; unit: 'enemy' | 'ally'; hero?: string }
export type LabelMark = Base & { kind: 'label'; hex: string; text: string }
/** one of the hero's own tokens (the opening hero's kit) */
export type TokenMark = Base & { kind: 'token'; hex: string; token: string }
export type Mark = StepMark | RingMark | ArrowMark | AreaMark | UnitMark | LabelMark | TokenMark

export type OpeningTurn = { cards: CardColor[]; note: string }
export type Opening = {
	id: string
	hero: string
	name: string
	/** the side it was built on (the marks' hexes are for this side) */
	side: Side
	size: 'any' | '2v2' | '3v3'
	lane: '' | 'twins' | 'jungle' | 'brogan' | 'other'
	goal: string
	turns: OpeningTurn[]
	/** where the hero spawns (a hero spawn point), or '' */
	start: string
	marks: Mark[]
	order: number
	updatedAt: number
	deleted?: boolean
}

export const LANES: Record<Opening['lane'], string> = { '': '—', twins: 'Twins', jungle: 'Jungle', brogan: 'Brogan', other: 'Other' }
export const SIZES: Record<Opening['size'], string> = { any: 'Any size', '2v2': '2 v 2', '3v3': '3 v 3' }

export const newId = (p = 'op') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function blankOpening(hero: string, side: Side = 'blue'): Opening {
	return {
		id: newId(), hero, name: 'New opening', side, size: 'any', lane: '', goal: '', start: '', marks: [], order: 0, updatedAt: Date.now(),
		turns: [0, 1, 2, 3].map(() => ({ cards: [], note: '' }))
	}
}

/** "Green/Blue" */
export const turnCards = (t: OpeningTurn | undefined) => (t?.cards.length ? t.cards.map((c) => CARD_NAME[c]).join('/') : '—')

// ── the other side of the board ──
// Forgotten Island is point-symmetric: turning it 180° about its middle puts every space on its twin (an
// Atlantean spawn point on a Titan one, and so on — tested). An opening built for one side is the same plan for
// the other side on the twin spaces.
const SQRT3 = Math.sqrt(3)
const centre = (id: string) => { const [c, r] = id.split('_').map(Number); return { x: SQRT3 * (c + 0.5 * (r & 1)), y: 1.5 * r } }
let twinCache: { cells: object; twin: Record<string, string> } | null = null
export function twinTable(map: GameMap = OPENING_MAP): Record<string, string> {
	const cells = map.cells ?? {}
	if (twinCache?.cells === cells) return twinCache.twin
	const ids = Object.keys(cells), pts = ids.map(centre)
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
	const at = new Map(ids.map((id, i) => [`${Math.round(pts[i].x * 100)},${Math.round(pts[i].y * 100)}`, id]))
	const twin: Record<string, string> = {}
	ids.forEach((id, i) => { const t = at.get(`${Math.round((2 * cx - pts[i].x) * 100)},${Math.round((2 * cy - pts[i].y) * 100)}`); if (t) twin[id] = t })
	twinCache = { cells, twin }
	return twin
}
export const twinHex = (hex: string, map: GameMap = OPENING_MAP) => (hex ? twinTable(map)[hex] ?? hex : hex)

/** the opening as seen from `side` (the same plan on the twin spaces when it was built on the other side) */
export function onSide(op: Opening, side: Side, map: GameMap = OPENING_MAP): Opening {
	if (op.side === side) return op
	const t = (h: string) => twinHex(h, map)
	const marks = op.marks.map((m): Mark => {
		switch (m.kind) {
			case 'arrow': return { ...m, from: t(m.from), to: t(m.to) }
			case 'area': return { ...m, hexes: m.hexes.map(t) }
			default: return { ...m, hex: t(m.hex) }
		}
	})
	return { ...op, side, start: t(op.start), marks }
}

// ── turn by turn ──
export const marksAt = (op: Opening, step: number): Mark[] => (step <= 0 ? op.marks : op.marks.filter((m) => m.turn <= step))
/** where the hero stands after turn `step` (0 = the whole round): the last plain (not alternative) chip of the latest turn so far, else its start */
export function heroHexAt(op: Opening, step: number): string {
	for (let t = step <= 0 ? 4 : Math.min(step, 4); t >= 1; t--) {
		const s = op.marks.find((m): m is StepMark => m.kind === 'step' && m.turn === t && !m.alt)
		if (s) return s.hex
	}
	return op.start
}
/** the spaces whose minion is gone by this step (rings marked "taken") */
export const takenAt = (op: Opening, step: number): Set<string> =>
	new Set(op.marks.filter((m): m is RingMark => m.kind === 'ring' && !!m.taken && (step <= 0 || m.turn <= step)).map((m) => m.hex))
/** every hex a mark sits on (the eraser's test) */
export function marksOn(m: Mark): string[] {
	if (m.kind === 'arrow') return [m.from, m.to]
	if (m.kind === 'area') return m.hexes
	return [m.hex]
}

/** the hero spawn points of a side (where an opening can start) */
export const spawnsOf = (side: Side, map: GameMap = OPENING_MAP) =>
	Object.keys(map.cells ?? {}).filter((h) => map.cells?.[h] === (side === 'orange' ? 'baseOrangeSpawn' : 'baseBlueSpawn')).sort()

/** the round-1 wave (both teams), from the map's battle zone */
export const openingWave = (map: GameMap = OPENING_MAP) =>
	((map as GameMap & { battleZone?: { hex: string; team: string; kind: string }[] }).battleZone ?? []).map((b) => ({ id: `m_${b.hex}`, hex: b.hex, team: b.team, role: b.kind }))

// ── a hero's guide (the Overview tab), written by a GM ──
export type MinionPref = 'twins' | 'jungle' | 'brogan' | 'heavy' | 'ranged' | 'all'
export const MINION_PREFS: Record<MinionPref, string> = { twins: 'Twins', jungle: 'Jungle', brogan: 'Brogan', heavy: 'Heavy', ranged: 'Ranged', all: 'All' }
export type GuideTag = 'melee' | 'ranged' | 'semi-ranged' | 'double take'
export const GUIDE_TAGS: GuideTag[] = ['melee', 'ranged', 'semi-ranged', 'double take']
/** 1 = from round 1, 2 = from round 2 or later (the compendium's black / grey tags) */
export type HeroGuide = {
	hero: string
	overview: string
	strengths: string[]
	weaknesses: string[]
	minions: MinionPref[]
	tags: Partial<Record<GuideTag, 1 | 2>>
	strong: string[]
	weak: string[]
	partners: string[]
	updatedAt: number
}
export const guideId = (hero: string) => `guide:${hero}`
export const blankGuide = (hero: string): HeroGuide => ({ hero, overview: '', strengths: [], weaknesses: [], minions: [], tags: {}, strong: [], weak: [], partners: [], updatedAt: 0 })

// ── rows ──
export type OpeningRow = { id: string; hero: string; kind: string; data: unknown; updated_at?: string }
export const rowOfOpening = (o: Opening): OpeningRow => ({ id: o.id, hero: o.hero, kind: 'opening', data: o, updated_at: new Date().toISOString() })
export const rowOfGuide = (g: HeroGuide): OpeningRow => ({ id: guideId(g.hero), hero: g.hero, kind: 'guide', data: g, updated_at: new Date().toISOString() })
/** a row back into an opening (filled out, so older rows read like new ones), or null */
export function openingOfRow(r: OpeningRow): Opening | null {
	if (r.kind !== 'opening' || !r.data || typeof r.data !== 'object') return null
	const d = r.data as Partial<Opening>
	const b = blankOpening(r.hero || d.hero || '', d.side === 'orange' ? 'orange' : 'blue')
	const turns = [0, 1, 2, 3].map((k) => ({ cards: (d.turns?.[k]?.cards ?? []).filter((c) => CARD_COLORS.includes(c)), note: d.turns?.[k]?.note ?? '' }))
	return { ...b, ...d, id: r.id, hero: r.hero || d.hero || '', turns, marks: Array.isArray(d.marks) ? d.marks : [] }
}
export function guideOfRow(r: OpeningRow): HeroGuide | null {
	if (r.kind !== 'guide' || !r.data || typeof r.data !== 'object') return null
	return { ...blankGuide(r.hero), ...(r.data as Partial<HeroGuide>), hero: r.hero }
}
/** a hero's live openings in their order */
export const sortOpenings = (list: Opening[]) => list.filter((o) => !o.deleted).sort((a, b) => a.order - b.order || a.updatedAt - b.updatedAt)
export const isMissingTable = (e: { message?: string; code?: string } | null | undefined) =>
	!!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''))

/** The SQL that sets the table up (run once in the Supabase dashboard's SQL editor). */
export const OPENINGS_SQL = `create table if not exists public.${OPENINGS_TABLE} (
  id text primary key,
  hero text not null,
  kind text not null default 'opening',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.${OPENINGS_TABLE} enable row level security;
create policy "openings read" on public.${OPENINGS_TABLE} for select to anon using (true);
create policy "openings add" on public.${OPENINGS_TABLE} for insert to anon with check (true);
create policy "openings edit" on public.${OPENINGS_TABLE} for update to anon using (true) with check (true);`

// ── drawing helpers (the hero page's snapshots share the board's coordinates) ──
/** the island's box in board units with `sea` hexes of water round it — the same box BoardCanvas.paintPicture paints */
export function islandBox(map: GameMap = OPENING_MAP, sea = 0.6) {
	const size = map.grid?.size ?? 60, ids = Object.keys(map.cells ?? {})
	const pts = ids.map((id) => { const c = centre(id); return { x: c.x * size, y: c.y * size } })
	const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), m = size * sea
	const x0 = Math.min(...xs) - size * 0.87 - m, x1 = Math.max(...xs) + size * 0.87 + m
	const y0 = Math.min(...ys) - size - m, y1 = Math.max(...ys) + size + m
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, size, sea }
}
export const hexAt = (hex: string, size: number) => { const c = centre(hex); return { x: c.x * size, y: c.y * size } }
/** each team's minion facing (the dominant direction of its spawn points), in 60° steps */
export function spawnDirs(map: GameMap = OPENING_MAP): Record<string, number> {
	const acc: Record<string, Record<number, number>> = { orange: {}, blue: {} }
	const cells = map.cells ?? {}, meta = (map as GameMap & { meta?: Record<string, { dir?: number }> }).meta ?? {}
	for (const id in cells) {
		const t = cells[id] === 'spawnOrange' ? 'orange' : cells[id] === 'spawnBlue' ? 'blue' : null
		if (t) acc[t][meta[id]?.dir ?? 0] = (acc[t][meta[id]?.dir ?? 0] ?? 0) + 1
	}
	const dom = (o: Record<number, number>) => +(Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0)
	return { orange: dom(acc.orange), blue: dom(acc.blue) }
}

// ── the builder's tools: what a tap on a space does ──
export type Tool = 'step' | 'ring' | 'arrow' | 'area' | 'unit' | 'label' | 'token' | 'start' | 'erase' | 'pick'
export type ToolOpts = {
	turn: Turn; color: string; alt: boolean; taken: boolean; areaStyle: AreaMark['style']
	unit: 'enemy' | 'ally'; unitHero: string; text: string; token: string
	/** the area being painted, the arrow's first space, the mark picked (carried between taps) */
	areaId: string | null; arrowFrom: string | null; picked: string | null
}
export type ToolResult = { op: Opening; changed: boolean; areaId: string | null; arrowFrom: string | null; picked: string | null }
const PICK_ORDER: Mark['kind'][] = ['step', 'unit', 'label', 'token', 'ring', 'arrow', 'area']
/** the marks on a space, top-most first (the order they're drawn in, reversed) */
export const marksOnHex = (op: Opening, hex: string) =>
	op.marks.filter((m) => marksOn(m).includes(hex)).sort((a, b) => PICK_ORDER.indexOf(a.kind) - PICK_ORDER.indexOf(b.kind))

/** A tap on `hex` with `tool`: a tap on the same kind of mark again takes it away (chips, rings, units, labels,
 *  tokens toggle); an arrow takes two taps (from, to); an area is painted space by space until a new one is begun. */
export function applyTool(op: Opening, tool: Tool, hex: string, o: ToolOpts): ToolResult {
	const keep = { areaId: o.areaId, arrowFrom: o.arrowFrom, picked: o.picked }
	const res = (marks: Mark[], more: Partial<ToolResult> = {}): ToolResult => ({ op: { ...op, marks }, changed: true, ...keep, ...more })
	const t1 = (o.turn || 1) as Turn
	const alt = o.alt || undefined
	switch (tool) {
		case 'step': {
			const color = (CARD_COLORS as string[]).includes(o.color) ? (o.color as CardColor) : 'gold'
			const same = op.marks.find((m) => m.kind === 'step' && m.hex === hex && m.turn === t1 && m.color === color && !!m.alt === !!o.alt)
			if (same) return res(op.marks.filter((m) => m !== same))
			const text = o.text.trim() || undefined
			return res([...op.marks, { id: newId('m'), kind: 'step', hex, turn: t1, color, alt, ...(text ? { text } : {}) }])
		}
		case 'ring': {
			const same = op.marks.find((m) => m.kind === 'ring' && m.hex === hex && m.turn === o.turn)
			if (same) return res(op.marks.filter((m) => m !== same))
			return res([...op.marks, { id: newId('m'), kind: 'ring', hex, turn: o.turn, color: o.color, alt, ...(o.taken ? { taken: true } : {}) }])
		}
		case 'arrow': {
			if (!o.arrowFrom) return { op, changed: false, ...keep, arrowFrom: hex }
			if (o.arrowFrom === hex) return { op, changed: false, ...keep, arrowFrom: null }
			return res([...op.marks, { id: newId('m'), kind: 'arrow', from: o.arrowFrom, to: hex, turn: o.turn, color: o.color, alt }], { arrowFrom: null })
		}
		case 'area': {
			const area = op.marks.find((m): m is AreaMark => m.kind === 'area' && m.id === o.areaId)
			if (!area) {
				const id = newId('m')
				return res([...op.marks, { id, kind: 'area', hexes: [hex], turn: o.turn, color: o.color, style: o.areaStyle, alt }], { areaId: id })
			}
			const hexes = area.hexes.includes(hex) ? area.hexes.filter((h) => h !== hex) : [...area.hexes, hex]
			if (!hexes.length) return res(op.marks.filter((m) => m !== area), { areaId: null })
			return res(op.marks.map((m) => (m === area ? { ...area, hexes } : m)))
		}
		case 'unit': {
			const same = op.marks.find((m) => m.kind === 'unit' && m.hex === hex)
			if (same) return res(op.marks.filter((m) => m !== same))
			return res([...op.marks, { id: newId('m'), kind: 'unit', hex, turn: o.turn, unit: o.unit, alt, ...(o.unitHero ? { hero: o.unitHero } : {}) }])
		}
		case 'label': {
			const same = op.marks.find((m) => m.kind === 'label' && m.hex === hex)
			if (same) return res(op.marks.filter((m) => m !== same))
			if (!o.text.trim()) return { op, changed: false, ...keep }
			return res([...op.marks, { id: newId('m'), kind: 'label', hex, turn: o.turn, text: o.text.trim().slice(0, 18), alt }])
		}
		case 'token': {
			if (!o.token) return { op, changed: false, ...keep }
			const same = op.marks.find((m) => m.kind === 'token' && m.hex === hex && m.token === o.token)
			if (same) return res(op.marks.filter((m) => m !== same))
			return res([...op.marks, { id: newId('m'), kind: 'token', hex, turn: o.turn, token: o.token, alt }])
		}
		case 'start':
			return { op: { ...op, start: op.start === hex ? '' : hex }, changed: true, ...keep }
		case 'erase': {
			const marks = op.marks.flatMap((m): Mark[] => {
				if (m.kind === 'area') { const hexes = m.hexes.filter((h) => h !== hex); return hexes.length ? [{ ...m, hexes }] : [] }
				return marksOn(m).includes(hex) ? [] : [m]
			})
			const changed = marks.length !== op.marks.length || marks.some((m, k) => m !== op.marks[k]) || op.start === hex
			return { op: { ...op, marks, start: op.start === hex ? '' : op.start }, changed, ...keep }
		}
		case 'pick': {
			const here = marksOnHex(op, hex)
			if (!here.length) return { op, changed: false, ...keep, picked: null }
			const k = here.findIndex((m) => m.id === o.picked)
			return { op, changed: false, ...keep, picked: here[(k + 1) % here.length].id }
		}
	}
}

/** one line naming a mark (the builder's list) */
export function markLabel(m: Mark, heroName: (id: string) => string = (id) => id): string {
	const t = m.turn ? `T${m.turn}` : 'Always'
	const alt = m.alt ? ' · alt' : ''
	switch (m.kind) {
		case 'step': return `${m.text?.trim() || `T${m.turn}`} chip · ${CARD_NAME[m.color]}${alt}`
		case 'ring': return `Ring · ${m.color}${m.taken ? ' · taken' : ''} · ${t}${alt}`
		case 'arrow': return `Arrow · ${m.color} · ${t}${alt}`
		case 'area': return `Area · ${m.hexes.length} ${m.hexes.length === 1 ? 'space' : 'spaces'} · ${t}${alt}`
		case 'unit': return `${m.unit === 'enemy' ? 'Enemy' : 'Ally'}${m.hero ? ` · ${heroName(m.hero)}` : ''} · ${t}${alt}`
		case 'label': return `Label "${m.text}" · ${t}`
		case 'token': return `Token · ${m.token.replace(/^(token|marker|rune)_/, '').replace(/_marker$/, '').replace(/_/g, ' ')} · ${t}`
	}
}
