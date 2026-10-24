// The map editor's model (src/routes/editor): a map as LAYERS — the ground of every hex, its zone, and what stands
// on it (a minion spawn point, a hero spawn point or an obstacle) — plus the tools that paint them, the symmetry
// maths, the checks a playable map has to pass, and the trace image's calibration. Pure functions, tested in
// mapedit.test.ts. `toMap` writes the GameMap the game plays (maps.ts); `fromMap` reads any map, old ones too.
import type { GameMap } from './maps'
import { placeName } from './teams'
import { hexCenter, SQRT3, type Pt } from './board/hexgeo'
import { zoneTable, zoneType, hexCube, cubeDist, FOREST_TYPES } from './zones'

export type Team = 'orange' | 'blue'
export type Role = 'melee' | 'ranged' | 'heavy'
export type Ground = 'forest' | 'beach' | 'middle' | 'stone' | 'marsh' | 'ash' | 'snow' | 'tundra' | 'steppe' | 'rocky' | 'scrub' | 'frostwood' | 'burntwood' | 'baseOrange' | 'baseBlue'
export type Feature =
	| { kind: 'minion'; team: Team; role: Role; dir: number }
	| { kind: 'hero'; team: Team }
	| { kind: 'obstacle'; scatter?: string }
export type SymMode = 'none' | 'rotate' | 'mirrorV' | 'mirrorH'

export interface Doc {
	name: string
	size: number
	cols: number
	rows: number
	ground: Record<string, Ground>
	zone: Record<string, string>
	feat: Record<string, Feature>
	waves: { quick: number; long: number }
	sym: { mode: SymMode; cx?: number; cy?: number }
	/** the map's own zones beyond the seven built-in ones, and a built-in's kind changed (same key) */
	zdefs?: ZoneDef[]
}
/** What a zone is: part of a minion LANE, an OFF-LANE (jungles and the like), or a team's BASE. */
export type ZoneKind = 'lane' | 'offlane' | 'base'
export interface ZoneDef { key: string; color: string; kind: ZoneKind; team?: Team; lane?: number }

export const GROUNDS: Array<{ key: Ground; label: string; color: string }> = [
	{ key: 'forest', label: 'Jungle', color: '#3f7a35' },
	{ key: 'beach', label: 'Beach', color: '#dcc07a' },
	{ key: 'middle', label: 'Open ground', color: '#a08a63' },
	{ key: 'stone', label: 'Flagstones', color: '#7b818c' },
	{ key: 'marsh', label: 'Marsh', color: '#3a5a3a' },
	{ key: 'ash', label: 'Magma waste', color: '#7a2a16' },
	{ key: 'snow', label: 'Snow', color: '#dbe8f4' },
	// the Titan side's run snow → tundra → steppe → open ground, the Atlantean side's magma waste (`ash`) → rocky → scrub → open ground,
	// and the two side forests (2026-10-24)
	{ key: 'tundra', label: 'Tundra', color: '#9fb3b0' },
	{ key: 'steppe', label: 'Frost steppe', color: '#9aa576' },
	{ key: 'rocky', label: 'Rocky ground', color: '#6e5f56' },
	{ key: 'scrub', label: 'Scrubland', color: '#a2804f' },
	{ key: 'frostwood', label: 'Frost forest', color: '#5f8f9a' },
	{ key: 'burntwood', label: 'Burnt forest', color: '#4b3a2c' },
	{ key: 'baseOrange', label: 'Atlantean base', color: '#c4612c' },
	{ key: 'baseBlue', label: 'Titan base', color: '#7fb6e6' }
]
export const GROUND_BY: Record<string, (typeof GROUNDS)[number]> = Object.fromEntries(GROUNDS.map((g) => [g.key, g]))
const isGround = (g: unknown): g is Ground => typeof g === 'string' && g in GROUND_BY

/** The built-in zones, Atlantean end first. `lane` = its place in the game's minion lane (battle.ts LANE). */
export const ZONES: ZoneDef[] = [
	{ key: 'Orange Base', color: '#e0702a', kind: 'base', team: 'orange' },
	{ key: 'Orange Jungle', color: '#9a5a1e', kind: 'offlane', team: 'orange' },
	{ key: 'Orange Beach', color: '#f2b04a', kind: 'lane', lane: 0, team: 'orange' },
	{ key: 'Center', color: '#c9c3b2', kind: 'lane', lane: 1 },
	{ key: 'Blue Beach', color: '#7fd0f0', kind: 'lane', lane: 2, team: 'blue' },
	{ key: 'Blue Jungle', color: '#2c5f9e', kind: 'offlane', team: 'blue' },
	{ key: 'Blue Base', color: '#3d8ef0', kind: 'base', team: 'blue' }
]
export const ZONE_BY: Record<string, ZoneDef> = Object.fromEntries(ZONES.map((z) => [z.key, z]))
/** Every zone of this map: the built-in seven (with any kind the map gave them) and then its own. */
export function zonesOf(d: Doc): ZoneDef[] {
	const own = d.zdefs ?? [], by = new Map(own.map((z) => [z.key, z]))
	const base = ZONES.map((z) => { const o = by.get(z.key); return o ? { ...z, kind: o.kind } : z })
	return [...base, ...own.filter((z) => !ZONE_BY[z.key])]
}
export const zoneDef = (d: Doc, key: string): ZoneDef | undefined => zonesOf(d).find((z) => z.key === key)
/** A colour for a new zone of the map (a palette that keeps clear of the built-in ones). */
const ZONE_PAL = ['#c47ad8', '#6bd1a1', '#e0c84a', '#e07a9c', '#7ab0e0', '#a3d65c', '#d98f5a', '#62c8c8']
/** Add a zone (and, for a team's side, its twin on the other side — named the same, so mirrored painting works).
 *  Returns the new zone's key (the Atlantean one), or null when the name is empty or taken. */
export function addZone(d: Doc, name: string, side: Team | null, kind: ZoneKind): string | null {
	const nm = name.trim().replace(/\b(Orange|Blue|Atlantean|Titan)\b\s*/gi, '').replace(/\s+/g, ' ').trim()
	if (!nm) return null
	const keys = side ? [`Orange ${nm}`, `Blue ${nm}`] : [nm]
	const all = zonesOf(d)
	if (keys.some((k) => all.some((z) => z.key.toLowerCase() === k.toLowerCase()))) return null
	const n = (d.zdefs ?? []).filter((z) => !ZONE_BY[z.key]).length
	d.zdefs = [...(d.zdefs ?? []), ...keys.map((key, i) => ({ key, kind, color: ZONE_PAL[(n + i) % ZONE_PAL.length], ...(side ? { team: (i ? 'blue' : 'orange') as Team } : {}) }))]
	return keys[0]
}
/** Mark a zone (and its twin) as lane / off-lane / base. */
export function setZoneKind(d: Doc, key: string, kind: ZoneKind) {
	const twin = swapZone(key)
	for (const k of new Set([key, twin])) {
		const z = zoneDef(d, k)
		if (!z) continue
		const own = (d.zdefs ?? []).filter((x) => x.key !== k)
		d.zdefs = ZONE_BY[k] && ZONE_BY[k].kind === kind ? own : [...own, { ...z, kind }]
	}
}
/** Take a map's own zone (and its twin) away; its hexes go back to the zone the ground gives them. */
export function removeZone(d: Doc, key: string) {
	if (ZONE_BY[key]) return
	const gone = new Set([key, swapZone(key)])
	d.zdefs = (d.zdefs ?? []).filter((z) => !gone.has(z.key))
	for (const h of hexIds(d)) if (gone.has(d.zone[h])) d.zone[h] = 'Center'
}
export const isLaneZone = (d: Doc, key: string) => zoneDef(d, key)?.kind === 'lane'
export const LANE_ZONES = ZONES.filter((z) => z.lane != null).map((z) => z.key)
export const START_ZONE = 'Center'

export const blankDoc = (name = 'New map'): Doc => ({
	name, size: 60, cols: 22, rows: 22, ground: {}, zone: {}, feat: {}, waves: { quick: 3, long: 5 }, sym: { mode: 'rotate' }
})

// ── hex helpers ──────────────────────────────────────────────────────────────
export const parse = (id: string): [number, number] => id.split('_').map(Number) as [number, number]
export const idOf = (c: number, r: number) => `${c}_${r}`
export const hexIds = (d: Doc) => Object.keys(d.ground)
export const inGrid = (d: Doc, id: string) => { const [c, r] = parse(id); return c >= 0 && r >= 0 && c < d.cols && r < d.rows }
export const distance = (a: string, b: string) => cubeDist(hexCube(a), hexCube(b))

/** The hex whose centre is (x, y) in board units, or null if no hex centre is there. */
export function hexAtCentre(x: number, y: number, size: number): string | null {
	const rf = y / (1.5 * size), r = Math.round(rf)
	if (Math.abs(rf - r) > 1e-4) return null
	const cf = x / (size * SQRT3) - 0.5 * (r & 1), c = Math.round(cf)
	if (Math.abs(cf - c) > 1e-4) return null
	return idOf(c, r)
}
/** The hex under a point (any point, not just a centre). */
export function hexAtPoint(x: number, y: number, size: number): string {
	const q = ((SQRT3 / 3) * x - y / 3) / size, rr = ((2 / 3) * y) / size
	let cx = q, cz = rr, cy = -cx - cz
	let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz)
	const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz)
	if (dx > dy && dx > dz) rx = -ry - rz
	else if (dy > dz) ry = -rx - rz
	else rz = -rx - ry
	return idOf(rx + (rz - (rz & 1)) / 2, rz)
}

/** Every hex within `radius` of `id` inside the grid (the brush). */
export function brush(d: Doc, id: string, radius: number): string[] {
	if (radius <= 0) return inGrid(d, id) ? [id] : []
	const [c0, r0] = parse(id), out: string[] = []
	for (let r = r0 - radius; r <= r0 + radius; r++)
		for (let c = c0 - radius - 1; c <= c0 + radius + 1; c++) {
			const h = idOf(c, r)
			if (inGrid(d, h) && distance(id, h) <= radius) out.push(h)
		}
	return out
}

const NB = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]]
export function neighbours(id: string): string[] {
	const [c, r] = parse(id)
	return NB[r & 1].map(([dc, dr]) => idOf(c + dc, r + dr))
}

// ── reading / writing the game's map ─────────────────────────────────────────
export function fromMap(m: GameMap): Doc {
	const d = blankDoc(m.name ?? 'Map')
	const cells = m.cells ?? {}
	const g = (m.grid ?? {}) as { size?: number; cols?: number; rows?: number }
	d.size = g.size ?? 60
	const zones = m.zones ? null : zoneTable({ ...m, zones: undefined })
	for (const id in cells) {
		const t = cells[id]
		let ground: Ground
		if (isGround(t)) ground = t
		else if (t === 'baseOrangeSpawn') ground = isGround(m.ground?.[id]) ? (m.ground![id] as Ground) : 'baseOrange'
		else if (t === 'baseBlueSpawn') ground = isGround(m.ground?.[id]) ? (m.ground![id] as Ground) : 'baseBlue'
		else {
			const z = zoneType(cells, id, m.ground)
			ground = isGround(z) ? z : 'middle'
		}
		d.ground[id] = ground
		d.zone[id] = m.zones?.[id] ?? zones?.[id] ?? 'Center'
		if (t === 'spawnOrange' || t === 'spawnBlue') {
			const x = m.meta?.[id], role = x?.m === 'ranged' || x?.m === 'heavy' ? x.m : 'melee'
			d.feat[id] = { kind: 'minion', team: t === 'spawnOrange' ? 'orange' : 'blue', role, dir: ((x?.dir ?? 0) % 6 + 6) % 6 }
		} else if (t === 'baseOrangeSpawn' || t === 'baseBlueSpawn') d.feat[id] = { kind: 'hero', team: t === 'baseOrangeSpawn' ? 'orange' : 'blue' }
		else if (t === 'terrain') d.feat[id] = m.scatter?.[id] ? { kind: 'obstacle', scatter: m.scatter[id] } : { kind: 'obstacle' }
	}
	let mc = 0, mr = 0
	for (const id in cells) { const [c, r] = parse(id); mc = Math.max(mc, c + 1); mr = Math.max(mr, r + 1) }
	d.cols = Math.max(g.cols ?? 0, mc, 6)
	d.rows = Math.max(g.rows ?? 0, mr, 6)
	d.waves = { quick: m.waves?.quick ?? 3, long: m.waves?.long ?? 5 }
	const s = m.sym
	d.sym = s && ['none', 'rotate', 'mirrorV', 'mirrorH'].includes(s.mode) ? { mode: s.mode as SymMode, cx: s.cx, cy: s.cy } : { mode: 'rotate' }
	if (d.sym.mode !== 'none' && (d.sym.cx == null || d.sym.cy == null)) { const c = autoCentre(d); d.sym.cx = c.x; d.sym.cy = c.y } // an older map: its middle
	// the map's own zones and kinds; a zone name nobody defined becomes an off-lane of its own
	const kinds = m.zoneKinds ?? {}
	const defs: ZoneDef[] = Object.entries(kinds).map(([key, z]) => ({
		key, kind: z.kind === 'lane' || z.kind === 'base' ? z.kind : 'offlane', color: z.color ?? ZONE_BY[key]?.color ?? '#9a9a9a',
		...(z.team === 'orange' || z.team === 'blue' ? { team: z.team } : ZONE_BY[key]?.team ? { team: ZONE_BY[key].team } : {})
	}))
	const known = new Set([...ZONES.map((z) => z.key), ...defs.map((z) => z.key)])
	for (const id in d.zone) {
		const k = d.zone[id]
		if (known.has(k)) continue
		known.add(k)
		defs.push({ key: k, kind: 'offlane', color: ZONE_PAL[defs.length % ZONE_PAL.length], ...(/^Orange\b/.test(k) ? { team: 'orange' as Team } : /^Blue\b/.test(k) ? { team: 'blue' as Team } : {}) })
	}
	if (defs.length) d.zdefs = defs
	return d
}

/** The starting wave: every minion spawn point in the Center. */
export function startingWave(d: Doc): Array<{ hex: string; team: Team; kind: Role }> {
	return hexIds(d).sort().flatMap((h) => {
		const f = d.feat[h]
		return f?.kind === 'minion' && d.zone[h] === START_ZONE ? [{ hex: h, team: f.team, kind: f.role }] : []
	})
}

export function toMap(d: Doc): GameMap {
	const cells: Record<string, string> = {}, meta: Record<string, { m: string; dir: number; start?: boolean }> = {}
	const ground: Record<string, string> = {}, zones: Record<string, string> = {}, scatter: Record<string, string> = {}
	for (const id of hexIds(d).sort()) {
		const f = d.feat[id], g = d.ground[id]
		zones[id] = d.zone[id] ?? 'Center'
		if (!f) { cells[id] = g; continue }
		ground[id] = g
		if (f.kind === 'minion') {
			cells[id] = f.team === 'orange' ? 'spawnOrange' : 'spawnBlue'
			meta[id] = { m: f.role, dir: f.dir, ...(zones[id] === START_ZONE ? { start: true } : {}) }
		} else if (f.kind === 'hero') cells[id] = f.team === 'orange' ? 'baseOrangeSpawn' : 'baseBlueSpawn'
		else { cells[id] = 'terrain'; if (f.scatter) scatter[id] = f.scatter }
	}
	const zoneKinds = d.zdefs?.length ? Object.fromEntries(d.zdefs.map((z) => [z.key, { kind: z.kind, color: z.color, ...(z.team ? { team: z.team } : {}) }])) : undefined
	return {
		...(zoneKinds ? { zoneKinds } : {}),
		name: d.name.trim() || 'Untitled map',
		grid: { size: d.size, cols: d.cols, rows: d.rows },
		cells, meta, ground, zones, scatter,
		battleZone: startingWave(d),
		waves: { ...d.waves },
		sym: { ...d.sym }
	}
}

// ── painting ─────────────────────────────────────────────────────────────────
export type Paint =
	| { layer: 'ground'; ground: Ground }
	| { layer: 'zone'; zone: string }
	| { layer: 'obstacle'; scatter?: string }
	| { layer: 'minion'; team: Team; role: Role; dir: number }
	| { layer: 'hero'; team: Team }
	| { layer: 'clear' } // take the feature off, keep the hex
	| { layer: 'erase' } // take the hex off the map

/** A zone for a hex that just came onto the map: what most of its neighbours are in, else from its ground. */
function guessZone(d: Doc, id: string): string {
	const n: Record<string, number> = {}
	for (const h of neighbours(id)) { const z = d.zone[h]; if (z) n[z] = (n[z] ?? 0) + 1 }
	let best = '', bc = 0
	for (const z in n) if (n[z] > bc) { bc = n[z]; best = z }
	if (best) return best
	const g = d.ground[id]
	return g === 'baseOrange' ? 'Orange Base' : g === 'baseBlue' ? 'Blue Base' : 'Center'
}
const ensure = (d: Doc, id: string, g: Ground = 'middle') => {
	if (!d.ground[id]) { d.ground[id] = g; d.zone[id] = guessZone(d, id) }
}

/** Apply one paint to one hex (in place). */
export function paintHex(d: Doc, id: string, p: Paint): void {
	switch (p.layer) {
		case 'ground': {
			const fresh = !d.ground[id]
			d.ground[id] = p.ground
			if (fresh) d.zone[id] = guessZone(d, id)
			if (d.feat[id]?.kind === 'obstacle') delete d.feat[id] // ground = open ground
			return
		}
		case 'zone': if (d.ground[id]) d.zone[id] = p.zone; return
		case 'obstacle': ensure(d, id); d.feat[id] = p.scatter ? { kind: 'obstacle', scatter: p.scatter } : { kind: 'obstacle' }; return
		case 'minion': ensure(d, id); d.feat[id] = { kind: 'minion', team: p.team, role: p.role, dir: ((p.dir % 6) + 6) % 6 }; return
		case 'hero': ensure(d, id, p.team === 'orange' ? 'baseOrange' : 'baseBlue'); d.feat[id] = { kind: 'hero', team: p.team }; return
		case 'clear': delete d.feat[id]; return
		case 'erase': delete d.ground[id]; delete d.zone[id]; delete d.feat[id]; return
	}
}

/** Paint a set of hexes, and — when `mirror` is on — their twins too, with the teams swapped. */
export function paint(d: Doc, ids: string[], p: Paint, mirror = false): string[] {
	const touched = new Set<string>()
	for (const id of ids) {
		paintHex(d, id, p); touched.add(id)
		if (!mirror || d.sym.mode === 'none') continue
		const t = twinOf(d, id)
		if (!t || t === id || !inGrid(d, t) || touched.has(t)) continue
		paintHex(d, t, swapPaint(p, d.sym.mode)); touched.add(t)
	}
	return [...touched]
}

/** The hexes connected to `id` that share its value on `layer` (an empty hex: the empty hexes round it, inside the grid). */
export function floodFill(d: Doc, id: string, layer: 'ground' | 'zone'): string[] {
	if (!inGrid(d, id)) return []
	const empty = !d.ground[id]
	const val = layer === 'ground' ? d.ground[id] : d.zone[id]
	const same = (h: string) => inGrid(d, h) && (empty ? !d.ground[h] : !!d.ground[h] && (layer === 'ground' ? d.ground[h] : d.zone[h]) === val)
	const seen = new Set([id]), q = [id]
	while (q.length) { const h = q.pop()!; for (const n of neighbours(h)) if (!seen.has(n) && same(n)) { seen.add(n); q.push(n) } }
	return [...seen]
}

/** What a hex holds, as the paint that would put it back (the eyedropper). */
export function pick(d: Doc, id: string, layer: 'ground' | 'zone' | 'feature'): Paint | null {
	if (!d.ground[id]) return null
	if (layer === 'ground') return { layer: 'ground', ground: d.ground[id] }
	if (layer === 'zone') return { layer: 'zone', zone: d.zone[id] }
	const f = d.feat[id]
	if (!f) return { layer: 'ground', ground: d.ground[id] }
	if (f.kind === 'minion') return { layer: 'minion', team: f.team, role: f.role, dir: f.dir }
	if (f.kind === 'hero') return { layer: 'hero', team: f.team }
	return { layer: 'obstacle', scatter: f.scatter }
}

// ── team swaps (for the twin of a hex) ───────────────────────────────────────
export const otherTeam = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')
/** The ground on the twin hex: the bases swap, and so do the two sides' themed grounds — the Titans' snow · tundra ·
 *  frost steppe · frost forest against the Atlanteans' ash · rocky ground · scrubland · burnt forest. */
const TWIN_GROUND: Partial<Record<Ground, Ground>> = {
	baseOrange: 'baseBlue', baseBlue: 'baseOrange', snow: 'ash', ash: 'snow', tundra: 'rocky', rocky: 'tundra',
	steppe: 'scrub', scrub: 'steppe', frostwood: 'burntwood', burntwood: 'frostwood'
}
export const swapGround = (g: Ground): Ground => TWIN_GROUND[g] ?? g
export const swapZone = (z: string): string => z.replace(/\b(Orange|Blue)\b/g, (w) => (w === 'Orange' ? 'Blue' : 'Orange'))
/** A minion's facing on the twin hex. dir k = facing the hex's edge k × 60° clockwise from the lower-right one
 *  (Forgotten Island: the Atlanteans 0, the Titans 3). */
export function twinDir(dir: number, mode: SymMode): number {
	const n = (x: number) => ((x % 6) + 6) % 6
	if (mode === 'rotate') return n(dir + 3)
	if (mode === 'mirrorV') return n(1 - dir) // left ↔ right
	if (mode === 'mirrorH') return n(4 - dir) // top ↔ bottom
	return n(dir)
}
export function swapPaint(p: Paint, mode: SymMode): Paint {
	switch (p.layer) {
		case 'ground': return { layer: 'ground', ground: swapGround(p.ground) }
		case 'zone': return { layer: 'zone', zone: swapZone(p.zone) }
		case 'minion': return { ...p, team: otherTeam(p.team), dir: twinDir(p.dir, mode) }
		case 'hero': return { ...p, team: otherTeam(p.team) }
		default: return p
	}
}
export function swapFeature(f: Feature | undefined, mode: SymMode): Feature | undefined {
	if (!f) return f
	if (f.kind === 'minion') return { ...f, team: otherTeam(f.team), dir: twinDir(f.dir, mode) }
	if (f.kind === 'hero') return { ...f, team: otherTeam(f.team) }
	return { ...f }
}

// ── symmetry ─────────────────────────────────────────────────────────────────
// The bases sit at opposite ends, so each kind of symmetry swaps the teams: a turn of 180° about a point (Forgotten
// Island), a mirror across an up–down line (left ↔ right) or across a left–right line (top ↔ bottom). The centre has to
// sit where the twin of every hex centre is a hex centre: for a turn, on a hex centre or an edge's midpoint; for the
// up–down mirror, on a multiple of half a hex's width; for the left–right mirror, on a row.
const W = (size: number) => size * SQRT3

/** Snap a centre to the nearest place that works for this kind of symmetry. */
export function snapCentre(x: number, y: number, size: number, mode: SymMode): Pt {
	if (mode === 'mirrorV') return { x: Math.round(x / (W(size) / 2)) * (W(size) / 2), y }
	if (mode === 'mirrorH') return { x, y: Math.round(y / (1.5 * size)) * 1.5 * size }
	// a turn: 2 × centre must be a hex centre
	const h = hexAtPoint(2 * x, 2 * y, size), c = hexCenter(h, size)
	return { x: c.x / 2, y: c.y / 2 }
}
/** The middle of what is painted (or of the grid when nothing is), snapped. */
export function autoCentre(d: Doc, mode: SymMode = d.sym.mode): Pt {
	let ids = hexIds(d)
	if (!ids.length) ids = [idOf(0, 0), idOf(d.cols - 1, d.rows - 1)]
	const ps = ids.map((h) => hexCenter(h, d.size))
	const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y)
	return snapCentre((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, d.size, mode)
}
/** The middle of the grid, snapped. */
export function gridCentre(d: Doc, mode: SymMode = d.sym.mode): Pt {
	const a = hexCenter(idOf(0, 0), d.size), b = hexCenter(idOf(d.cols - 1, d.rows - 1), d.size)
	return snapCentre((a.x + b.x) / 2, (a.y + b.y) / 2, d.size, mode)
}
/** The symmetry's centre: the one set on the map, else the grid's middle (steady while you paint). */
export const symCentre = (d: Doc): Pt => (d.sym.cx != null && d.sym.cy != null ? { x: d.sym.cx, y: d.sym.cy } : gridCentre(d))
/** Pin the centre where it is now (before the grid moves under it). */
export function pinCentre(d: Doc): void {
	if (d.sym.mode === 'none' || (d.sym.cx != null && d.sym.cy != null)) return
	const c = gridCentre(d); d.sym.cx = c.x; d.sym.cy = c.y
}
/** Change the kind of symmetry; the centre snaps to a place that works for it. */
export function setSymMode(d: Doc, mode: SymMode): void {
	const c = symCentre(d)
	d.sym = mode === 'none' ? { mode } : { mode, ...(d.sym.cx != null ? (({ x, y }) => ({ cx: x, cy: y }))(snapCentre(c.x, c.y, d.size, mode)) : {}) }
}
/** A hex's twin under the map's symmetry (null: no symmetry, or no hex centre there). */
export function twinOf(d: Doc, id: string, c: Pt = symCentre(d)): string | null {
	const p = hexCenter(id, d.size)
	switch (d.sym.mode) {
		case 'rotate': return hexAtCentre(2 * c.x - p.x, 2 * c.y - p.y, d.size)
		case 'mirrorV': return hexAtCentre(2 * c.x - p.x, p.y, d.size)
		case 'mirrorH': return hexAtCentre(p.x, 2 * c.y - p.y, d.size)
		default: return null
	}
}

export interface SymDiff { hex: string; twin: string | null; what: 'missing' | 'ground' | 'zone' | 'feature' }
/** Every place the map breaks its symmetry (each pair once). */
export function symmetryReport(d: Doc): SymDiff[] {
	if (d.sym.mode === 'none') return []
	const c = symCentre(d), out: SymDiff[] = [], seen = new Set<string>()
	const same = (a?: Feature, b?: Feature) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
	for (const id of hexIds(d).sort()) {
		if (seen.has(id)) continue
		const t = twinOf(d, id, c)
		seen.add(id)
		if (!t || !d.ground[t]) { out.push({ hex: id, twin: t, what: 'missing' }); continue }
		seen.add(t)
		if (d.ground[t] !== swapGround(d.ground[id])) out.push({ hex: id, twin: t, what: 'ground' })
		else if (d.zone[t] !== swapZone(d.zone[id])) out.push({ hex: id, twin: t, what: 'zone' })
		else if (!same(d.feat[t], swapFeature(d.feat[id], d.sym.mode))) out.push({ hex: id, twin: t, what: 'feature' })
	}
	return out
}
/** A score out of 100: the share of hexes that match their twin. */
export function symmetryScore(d: Doc): number {
	const n = hexIds(d).length
	if (!n || d.sym.mode === 'none') return 0
	const bad = new Set<string>()
	for (const x of symmetryReport(d)) { bad.add(x.hex); if (x.twin && d.ground[x.twin]) bad.add(x.twin) }
	return Math.floor((100 * (n - bad.size)) / n) // 100 only when it really is
}

/** Which side of the symmetry a hex is on: 1 = the Atlanteans' half, −1 = the Titans', 0 = on the line / the centre. */
export function sideOf(d: Doc, id: string, c: Pt = symCentre(d)): number {
	const p = hexCenter(id, d.size), v = { x: p.x - c.x, y: p.y - c.y }
	// towards the Atlanteans: from the centre to their base (or up, before there is one)
	const ob = hexIds(d).filter((h) => d.ground[h] === 'baseOrange').map((h) => hexCenter(h, d.size))
	let a = ob.length ? { x: ob.reduce((s, q) => s + q.x, 0) / ob.length - c.x, y: ob.reduce((s, q) => s + q.y, 0) / ob.length - c.y } : { x: 0, y: -1 }
	if (d.sym.mode === 'mirrorV') a = { x: Math.sign(a.x) || -1, y: 0 }
	if (d.sym.mode === 'mirrorH') a = { x: 0, y: Math.sign(a.y) || -1 }
	const dot = v.x * a.x + v.y * a.y, eps = d.size * 1e-3
	if (dot > eps) return 1
	if (dot < -eps) return -1
	if (d.sym.mode !== 'rotate') return 0
	// on the line through the centre: split it by the other axis
	const cr = v.x * a.y - v.y * a.x
	return cr > eps ? 1 : cr < -eps ? -1 : 0
}

/** Make the map symmetric by copying one team's half onto the other (teams swapped). Returns the hexes written. */
export function mirrorHalf(d: Doc, from: Team): string[] {
	if (d.sym.mode === 'none') return []
	const c = symCentre(d), want = from === 'orange' ? 1 : -1
	const ids = hexIds(d)
	const keep = ids.filter((h) => sideOf(d, h, c) === want)
	// the other half goes; the line itself stays as it is
	for (const h of ids) if (sideOf(d, h, c) === -want) paintHex(d, h, { layer: 'erase' })
	const out: string[] = []
	for (const h of keep) {
		const t = twinOf(d, h, c)
		if (!t) continue
		d.ground[t] = swapGround(d.ground[h])
		d.zone[t] = swapZone(d.zone[h])
		const f = swapFeature(d.feat[h], d.sym.mode)
		if (f) d.feat[t] = f; else delete d.feat[t]
		out.push(t)
	}
	fitGrid(d)
	return out
}

// ── the grid ─────────────────────────────────────────────────────────────────
/** Move everything by (dc, dr); dr is kept even so every hex keeps its neighbours. */
export function shift(d: Doc, dc: number, dr: number): void {
	dr = Math.round(dr / 2) * 2
	if (!dc && !dr) return
	const move = <T>(o: Record<string, T>) => {
		const n: Record<string, T> = {}
		for (const id in o) { const [c, r] = parse(id); n[idOf(c + dc, r + dr)] = o[id] }
		return n
	}
	d.ground = move(d.ground); d.zone = move(d.zone); d.feat = move(d.feat)
	if (d.sym.cx != null && d.sym.cy != null) { d.sym.cx += dc * W(d.size); d.sym.cy += dr * 1.5 * d.size }
}
/** Grow (n > 0) or shrink the grid on one side; content on the left / top moves with it. */
export function growGrid(d: Doc, side: 'left' | 'right' | 'top' | 'bottom', n: number): void {
	pinCentre(d)
	if (side === 'left') { shift(d, n, 0); d.cols = Math.max(4, d.cols + n) }
	else if (side === 'right') d.cols = Math.max(4, d.cols + n)
	else if (side === 'top') { const m = Math.round(n / 2) * 2; shift(d, 0, m); d.rows = Math.max(4, d.rows + m) }
	else d.rows = Math.max(4, d.rows + n)
	for (const id of hexIds(d)) if (!inGrid(d, id)) paintHex(d, id, { layer: 'erase' })
}
/** Keep the grid just round the map (`pad` empty hexes all round): crop, or grow so nothing falls outside. */
export function fitGrid(d: Doc, pad = 2): void {
	const ids = hexIds(d)
	if (!ids.length) return
	pinCentre(d)
	const cs = ids.map((h) => parse(h)[0]), rs = ids.map((h) => parse(h)[1])
	const dc = pad - Math.min(...cs)
	let dr = pad - Math.min(...rs)
	if (dr & 1) dr += 1
	shift(d, dc, dr)
	const cs2 = hexIds(d).map((h) => parse(h)[0]), rs2 = hexIds(d).map((h) => parse(h)[1])
	d.cols = Math.max(...cs2) + 1 + pad
	d.rows = Math.max(...rs2) + 1 + pad
}

// ── zones ────────────────────────────────────────────────────────────────────
/** Zones worked out from the ground: bases → that base; jungle / marsh → the nearer team's jungle; beach → the nearer
 *  team's beach; everything else → the Center. Obstacles take the zone most of their neighbours are in. */
export function autoZones(d: Doc): void {
	const ids = hexIds(d)
	const base = (t: Ground) => ids.filter((h) => d.ground[h] === t && d.feat[h]?.kind !== 'obstacle')
	const ob = base('baseOrange'), bb = base('baseBlue')
	const near = (h: string, set: string[]) => (set.length ? Math.min(...set.map((b) => distance(h, b))) : Infinity)
	const side = (h: string) => (ob.length || bb.length ? (near(h, ob) <= near(h, bb) ? 'Orange' : 'Blue') : sideOf(d, h) < 0 ? 'Blue' : 'Orange')
	for (const h of ids) {
		const g = d.ground[h]
		d.zone[h] = g === 'baseOrange' ? 'Orange Base' : g === 'baseBlue' ? 'Blue Base'
			: FOREST_TYPES.includes(g) ? `${side(h)} Jungle` : g === 'beach' ? `${side(h)} Beach` : 'Center'
	}
	for (const h of ids) {
		if (d.feat[h]?.kind !== 'obstacle') continue
		const n: Record<string, number> = {}
		for (const x of neighbours(h)) if (d.ground[x] && d.feat[x]?.kind !== 'obstacle') n[d.zone[x]] = (n[d.zone[x]] ?? 0) + 1
		let best = d.zone[h], bc = 0
		for (const z in n) if (n[z] > bc) { bc = n[z]; best = z }
		d.zone[h] = best
	}
}

/** Point every team's minion spawn points at the enemy's base. One facing a team: the game turns every minion of a
 *  team the way most of its spawn points face. */
export function faceEnemy(d: Doc): void {
	const centre = (t: Ground) => {
		const ps = hexIds(d).filter((h) => d.ground[h] === t).map((h) => hexCenter(h, d.size))
		return ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : null
	}
	const bases = { orange: centre('baseBlue'), blue: centre('baseOrange') } // where each team's minions look
	for (const team of ['orange', 'blue'] as Team[]) {
		const to = bases[team]
		const own = hexIds(d).filter((h) => { const f = d.feat[h]; return f?.kind === 'minion' && f.team === team })
		if (!to || !own.length) continue
		let vx = 0, vy = 0
		for (const h of own) { const p = hexCenter(h, d.size), l = Math.hypot(to.x - p.x, to.y - p.y) || 1; vx += (to.x - p.x) / l; vy += (to.y - p.y) / l }
		const deg = (Math.atan2(vy, vx) * 180) / Math.PI // 60 = dir 0 (down-right)
		const dir = (((Math.round((deg - 60) / 60)) % 6) + 6) % 6
		for (const h of own) (d.feat[h] as { dir: number }).dir = dir
	}
}

// ── the checks ───────────────────────────────────────────────────────────────
export interface ZoneStat {
	zone: string
	hexes: number
	open: number
	obstacles: number
	minions: Record<Team, Record<Role, number>>
	heroes: Record<Team, number>
}
export function zoneStats(d: Doc): ZoneStat[] {
	const by: Record<string, ZoneStat> = {}
	const blank = (zone: string): ZoneStat => ({ zone, hexes: 0, open: 0, obstacles: 0, minions: { orange: { melee: 0, ranged: 0, heavy: 0 }, blue: { melee: 0, ranged: 0, heavy: 0 } }, heroes: { orange: 0, blue: 0 } })
	for (const z of zonesOf(d)) by[z.key] = blank(z.key)
	for (const h of hexIds(d)) {
		const z = (by[d.zone[h]] ??= blank(d.zone[h])), f = d.feat[h]
		z.hexes++
		if (f?.kind === 'obstacle') z.obstacles++; else z.open++
		if (f?.kind === 'minion') z.minions[f.team][f.role]++
		if (f?.kind === 'hero') z.heroes[f.team]++
	}
	return Object.values(by)
}
export const minionTotal = (s: ZoneStat, t: Team) => s.minions[t].melee + s.minions[t].ranged + s.minions[t].heavy

/** The pieces a set of hexes falls into (neighbour to neighbour). */
export function pieces(ids: Iterable<string>): string[][] {
	const set = new Set(ids), seen = new Set<string>(), out: string[][] = []
	for (const s of set) {
		if (seen.has(s)) continue
		const part: string[] = [], q = [s]
		seen.add(s)
		while (q.length) { const h = q.pop()!; part.push(h); for (const n of neighbours(h)) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n) } }
		out.push(part)
	}
	return out.sort((a, b) => b.length - a.length)
}

export interface Issue { level: 'error' | 'warn' | 'ok'; text: string; hexes?: string[] }
/** Everything that would stop the map playing right (`error`), or that looks off (`warn`). */
export function validate(d: Doc, opts: { builtinNames?: string[] } = {}): Issue[] {
	const out: Issue[] = []
	const ids = hexIds(d)
	const A = (t: Team) => (t === 'orange' ? 'Atlantean' : 'Titan')
	if (!ids.length) return [{ level: 'error', text: 'The map is empty.' }]
	const name = d.name.trim()
	if (!name) out.push({ level: 'error', text: 'Give the map a name.' })
	else if (opts.builtinNames?.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
		out.push({ level: 'warn', text: `A built-in map is called "${name}" — the built-in one wins in Create game. Rename this one to play it.` })

	const stats = zoneStats(d), st = (z: string) => stats.find((s) => s.zone === z)!
	// the bases and the heroes' spawn points
	for (const t of ['orange', 'blue'] as Team[]) {
		const base = ids.filter((h) => d.ground[h] === (t === 'orange' ? 'baseOrange' : 'baseBlue'))
		if (!base.length) out.push({ level: 'error', text: `No ${A(t)} base.` })
		const heroes = ids.filter((h) => { const f = d.feat[h]; return f?.kind === 'hero' && f.team === t })
		if (!heroes.length) out.push({ level: 'error', text: `No ${A(t)} hero spawn points.` })
		else if (heroes.length < 3) out.push({ level: 'warn', text: `Only ${heroes.length} ${A(t)} hero spawn point${heroes.length === 1 ? '' : 's'} — heroes share them in bigger games.`, hexes: heroes })
		const away = heroes.filter((h) => d.zone[h] !== (t === 'orange' ? 'Orange Base' : 'Blue Base'))
		if (away.length) out.push({ level: 'warn', text: `${away.length} ${A(t)} hero spawn point${away.length === 1 ? ' is' : 's are'} outside the ${A(t)} base zone.`, hexes: away })
	}
	// the lane
	for (const z of LANE_ZONES) {
		const s = st(z), label = z.replace('Orange', 'Atlantean').replace('Blue', 'Titan')
		if (!s.hexes) { out.push({ level: 'error', text: `No ${label} zone — the lane runs Atlantean Beach · Center · Titan Beach.` }); continue }
		for (const t of ['orange', 'blue'] as Team[])
			if (!minionTotal(s, t)) out.push({ level: 'error', text: `The ${label} has no ${A(t)} minion spawn points.` })
	}
	const c = st(START_ZONE)
	if (c.hexes && minionTotal(c, 'orange') !== minionTotal(c, 'blue'))
		out.push({ level: 'warn', text: `The starting wave is uneven: ${minionTotal(c, 'orange')} Atlantean v ${minionTotal(c, 'blue')} Titan minions in the Center.` })
	const stray = ids.filter((h) => d.feat[h]?.kind === 'minion' && !isLaneZone(d, d.zone[h]))
	if (stray.length) out.push({ level: 'warn', text: `${stray.length} minion spawn point${stray.length === 1 ? ' is' : 's are'} outside a lane zone — minions only spawn in the battle zone.`, hexes: stray })
	const extra = zonesOf(d).filter((z) => z.kind === 'lane' && !LANE_ZONES.includes(z.key) && st(z.key)?.hexes)
	if (extra.length) out.push({ level: 'warn', text: `More lanes (${extra.map((z) => placeName(z.key)).join(', ')}) are marked on the map, but the game's minion battle still runs Atlantean Beach · Center · Titan Beach.`, hexes: ids.filter((h) => extra.some((z) => z.key === d.zone[h])) })
	// zones in one piece
	for (const z of zonesOf(d)) {
		const parts = pieces(ids.filter((h) => d.zone[h] === z.key))
		if (parts.length > 1) out.push({ level: 'warn', text: `The ${placeName(z.key)} is in ${parts.length} separate pieces.`, hexes: parts.slice(1).flat() })
	}
	const defined = new Set(zonesOf(d).map((z) => z.key))
	const odd = ids.filter((h) => !defined.has(d.zone[h]))
	if (odd.length) out.push({ level: 'warn', text: `${odd.length} hex${odd.length === 1 ? ' has' : 'es have'} no zone.`, hexes: odd })
	// can you walk everywhere?
	const open = ids.filter((h) => d.feat[h]?.kind !== 'obstacle')
	const parts = pieces(open)
	if (parts.length > 1) out.push({ level: 'warn', text: `${open.length - parts[0].length} open hex${open.length - parts[0].length === 1 ? '' : 'es'} can't be reached from the rest of the map.`, hexes: parts.slice(1).flat() })
	// waves
	if (d.waves.quick < 1 || d.waves.long < 1) out.push({ level: 'error', text: 'Wave counters have to be 1 or more.' })
	else if (d.waves.long < d.waves.quick) out.push({ level: 'warn', text: 'A long game has fewer wave counters than a quick one.' })
	// symmetry
	if (d.sym.mode !== 'none') {
		const diff = symmetryReport(d)
		if (diff.length) out.push({ level: 'warn', text: `${diff.length} place${diff.length === 1 ? '' : 's'} where the two halves don't match.`, hexes: diff.flatMap((x) => (x.twin ? [x.hex, x.twin] : [x.hex])) })
	}
	if (!out.some((x) => x.level !== 'ok')) out.push({ level: 'ok', text: 'Ready to play.' })
	return out
}

// ── the trace image ──────────────────────────────────────────────────────────
/** How the trace image sits on the board: board = translate(x, y) · rotate(rot°) · scale(scale) · image px. */
export interface Trace { x: number; y: number; scale: number; rot: number; opacity: number; w: number; h: number }
export const traceTf = (t: Trace) => `translate(${t.x} ${t.y}) rotate(${t.rot}) scale(${t.scale})`
export function toBoard(t: Trace, p: Pt): Pt {
	const a = (t.rot * Math.PI) / 180, x = p.x * t.scale, y = p.y * t.scale
	return { x: t.x + x * Math.cos(a) - y * Math.sin(a), y: t.y + x * Math.sin(a) + y * Math.cos(a) }
}
export function toImage(t: Trace, p: Pt): Pt {
	const a = (-t.rot * Math.PI) / 180, x = p.x - t.x, y = p.y - t.y
	return { x: (x * Math.cos(a) - y * Math.sin(a)) / t.scale, y: (x * Math.sin(a) + y * Math.cos(a)) / t.scale }
}
/** Calibrate: the two image points `i1`, `i2` (image px) should sit on the board points `b1`, `b2`. */
export function calibrate(t: Trace, i1: Pt, i2: Pt, b1: Pt, b2: Pt): Trace {
	const di = { x: i2.x - i1.x, y: i2.y - i1.y }, db = { x: b2.x - b1.x, y: b2.y - b1.y }
	const li = Math.hypot(di.x, di.y), lb = Math.hypot(db.x, db.y)
	if (li < 1e-6 || lb < 1e-6) return t
	const scale = lb / li
	const rot = ((Math.atan2(db.y, db.x) - Math.atan2(di.y, di.x)) * 180) / Math.PI
	const n = { ...t, scale, rot, x: 0, y: 0 }
	const p = toBoard(n, i1)
	return { ...n, x: b1.x - p.x, y: b1.y - p.y }
}
/** Fit the image over the grid (a first guess for a new upload). */
export function fitTrace(d: Doc, w: number, h: number, opacity = 0.55): Trace {
	const gw = W(d.size) * (d.cols + 0.5), gh = 1.5 * d.size * (d.rows - 1) + 2 * d.size
	const scale = Math.min(gw / w, gh / h)
	return { w, h, scale, rot: 0, opacity, x: -W(d.size) / 2 + (gw - w * scale) / 2, y: -d.size + (gh - h * scale) / 2 }
}
/** Forgotten Island's own painting, placed as the old editor had it (its `grid` origin and rotation, a 2000-unit square). */
export function legacyTrace(grid: { originX?: number; originY?: number; rot?: number } | undefined, w = 2000, h = 2000): Trace {
	const s = 2000 / w, rot = -(grid?.rot ?? 0), a = (rot * Math.PI) / 180
	// board = R(rot)·(s·px) + (C − R(rot)·C − origin), C = (1000, 1000)
	const C = { x: 1000, y: 1000 }, RC = { x: C.x * Math.cos(a) - C.y * Math.sin(a), y: C.x * Math.sin(a) + C.y * Math.cos(a) }
	return { w, h, scale: s, rot, opacity: 0.6, x: C.x - RC.x - (grid?.originX ?? 0), y: C.y - RC.y - (grid?.originY ?? 0) }
}
