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
	meta?: Record<string, { m: string; dir: number }>
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
 * Order: the live working map, then named saved maps, then bundled maps —
 * with names de-duplicated so an editor map hides a bundled one of the same
 * name (bundled maps are just a fallback for a browser with no editor map).
 */
export function availableMaps(): MapChoice[] {
	const list: MapChoice[] = []
	const used = new Set<string>()
	const add = (id: string, label: string, data: GameMap) => {
		const key = label.trim().toLowerCase()
		if (!key || used.has(key)) return
		used.add(key)
		list.push({ id, label: label.trim(), data })
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

	// bundled maps — only those not already covered by an editor map name
	for (const path in bundled) {
		const data = bundled[path].default
		const id = fileKey(path)
		add(id, data?.name ?? titleCase(id), data)
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
