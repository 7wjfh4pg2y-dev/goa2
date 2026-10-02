// Scatter terrain: what can stand on a terrain hex instead of the plain boulder. A map carries
// its choices as `scatter: { hex: key }` (set in the map editor's Scatter tool); a terrain hex
// with no entry is a boulder. Drawn by board/IslandLayer.svelte (the drawing "#isl-<ref>").
export type ScatterKind = {
	key: string
	label: string
	/** the drawing in IslandLayer's <defs>; 'mossy' is the boulder with moss on it */
	ref: string
	/** CSS variables for the drawing (crystal colours) */
	style?: string
	/** a swatch for the editor */
	dot: string
}

const crystal = (name: string, c1: string, c2: string, c3: string, cg: string): ScatterKind => ({
	key: `crystal-${name.toLowerCase()}`, label: `${name} crystals`, ref: 'crystal', style: `--c1:${c1};--c2:${c2};--c3:${c3};--cg:${cg}`, dot: c2
})

export const SCATTER: ScatterKind[] = [
	{ key: 'mossy', label: 'Mossy rock', ref: 'mossy', dot: '#5f9440' },
	crystal('Purple', '#ead4ff', '#a86bea', '#5a2a9c', '#c08bff'),
	crystal('Red', '#ffd0cc', '#ef4b4b', '#8f1717', '#ff7a6a'),
	crystal('Yellow', '#fff5bb', '#f5c62a', '#96700c', '#ffe066'),
	crystal('Green', '#d0ffe0', '#3fd47a', '#167a3c', '#7dffb0'),
	{ key: 'bigshroom', label: 'Giant mushroom', ref: 'bigshroom', dot: '#d1456f' },
	{ key: 'anemone', label: 'Fan plant', ref: 'anemone', dot: '#c552e6' },
	{ key: 'maw', label: 'Toothed plant', ref: 'maw', dot: '#7c3192' },
	{ key: 'deadtree', label: 'Dead tree', ref: 'deadtree', dot: '#80603f' },
	{ key: 'orb', label: 'Orb on a stalk', ref: 'orb', dot: '#5ff09a' },
	{ key: 'pillar', label: 'Broken pillar', ref: 'pillar', dot: '#aab0bb' },
	{ key: 'runestone', label: 'Rune stone', ref: 'runestone', dot: '#7df3ff' },
	{ key: 'cube', label: 'Carved cube', ref: 'cube', dot: '#3fb8b0' },
	{ key: 'lava', label: 'Cooling lava', ref: 'lava', dot: '#ff5a1f' },
	{ key: 'floe', label: 'Ice floe', ref: 'floe', dot: '#cfeaff' }
]
export const SCATTER_BY_KEY: Record<string, ScatterKind> = Object.fromEntries(SCATTER.map((s) => [s.key, s]))
