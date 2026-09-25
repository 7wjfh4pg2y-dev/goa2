// Registry of playable maps.
//
// Bundled maps ship with the app; the "editor" map is whatever the player last
// painted in the Map Editor (kept in this browser). When a game is created the
// chosen map's full data travels through the room, so every player renders the
// same board even for a custom map they don't have locally.

export interface GameMap {
	name?: string
	grid?: { size?: number; [k: string]: unknown }
	cells?: Record<string, string>
	meta?: Record<string, { m: string; dir: number; start?: boolean }>
	/** Initial minion wave: which hexes get a minion at game start (set in the editor). */
	battleZone?: Array<{ hex: string; team: 'orange' | 'blue'; kind: 'melee' | 'ranged' | 'heavy' }>
	/** Wave-counter track length for this map, by game length (set in the editor). */
	waves?: { quick: number; long: number }
}

export interface MapChoice {
	id: string
	label: string
	data: GameMap
}

const EDITOR_KEY = 'goa2-map-work-v1' // the live working map
const SAVED_KEY = 'goa2-maps-v1' // named maps saved in the editor

// eager-import every bundled map JSON
const bundled = import.meta.glob('./maps/*.json', { eager: true }) as Record<
	string,
	{ default: GameMap }
>

function fileKey(path: string) {
	return path.split('/').pop()!.replace(/\.json$/, '')
}
function titleCase(k: string) {
	return k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const nonEmpty = (m?: GameMap) => !!(m?.cells && Object.keys(m.cells).length)

/**
 * Maps a player can choose from, labelled by the name given in the editor.
 * Bundled maps come FIRST and are the default, so every machine hosts the same
 * official board. A Map Editor copy (working or saved) with the same name as a
 * bundled map only appears if it actually differs, labelled "(edited)" —
 * otherwise a stale local copy used to silently replace the bundled map, giving
 * different minions/rotations depending on whose browser hosted.
 */
export function availableMaps(): MapChoice[] {
	const list: MapChoice[] = []
	const used = new Set<string>()
	const official = new Map<string, string>() // name key -> serialized bundled board
	const keyOf = (label: string) => label.trim().toLowerCase()
	// canonical board fingerprint: key order / defaults don't make a copy "different"
	const sorted = <T>(o: Record<string, T> | undefined) => Object.keys(o ?? {}).sort().map((k) => [k, o![k]])
	const board = (m: GameMap) => JSON.stringify([
		sorted(m.cells),
		sorted(m.meta).map(([k, v]) => { const x = v as { m: string; dir?: number; start?: boolean }; return [k, x.m, x.dir ?? 0, !!x.start] }),
		(m.battleZone ?? []).map((b) => `${b.hex}|${b.team}|${b.kind}`).sort()
	])
	const add = (id: string, label: string, data: GameMap) => {
		let key = keyOf(label)
		if (!key) return
		// one map per name in the setup: the bundled (official) board wins, so every
		// host plays the same one. A local editor copy stays in the editor.
		if (official.has(key)) return
		if (used.has(key)) return
		used.add(key)
		list.push({ id, label: label.trim(), data })
	}

	// bundled maps first — the shared, official boards
	for (const path in bundled) {
		const data = bundled[path].default
		const id = fileKey(path)
		const label = data?.name ?? titleCase(id)
		add(id, label, data)
		if (nonEmpty(data)) official.set(keyOf(label), board(data))
	}

	// live working map (autosaved in this browser)
	try {
		const raw = localStorage.getItem(EDITOR_KEY)
		if (raw) {
			const data = JSON.parse(raw) as GameMap
			if (nonEmpty(data)) add('editor', data.name?.trim() || 'My map', data)
		}
	} catch {
		/* ignore */
	}

	// named maps saved in the editor
	try {
		const raw = localStorage.getItem(SAVED_KEY)
		if (raw) {
			const saved = JSON.parse(raw) as Record<string, GameMap>
			for (const nm in saved) {
				const data = saved[nm]
				if (nonEmpty(data)) add(`saved:${nm}`, data.name?.trim() || nm, data)
			}
		}
	} catch {
		/* ignore */
	}

	return list
}

export function firstMap(): MapChoice | null {
	const maps = availableMaps()
	return maps[0] ?? null
}

/** The player's current Map Editor working map (this browser), or null. */
export function editorMap(): GameMap | null {
	try {
		const raw = localStorage.getItem(EDITOR_KEY)
		if (!raw) return null
		const data = JSON.parse(raw) as GameMap
		if (data?.cells && Object.keys(data.cells).length) return data
	} catch {
		/* ignore */
	}
	return null
}
