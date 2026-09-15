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

const EDITOR_KEY = 'goa2-map-work-v1'

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

/** All maps a player can choose from right now (bundled + their editor map). */
export function availableMaps(): MapChoice[] {
	const list: MapChoice[] = []
	for (const path in bundled) {
		const data = bundled[path].default
		const id = fileKey(path)
		list.push({ id, label: data?.name ?? titleCase(id), data })
	}
	// the player's own editor map, if present and non-empty
	try {
		const raw = localStorage.getItem(EDITOR_KEY)
		if (raw) {
			const data = JSON.parse(raw) as GameMap
			if (data?.cells && Object.keys(data.cells).length) {
				list.unshift({ id: 'editor', label: `My map${data.name ? ` — ${data.name}` : ''} (editor)`, data })
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
