// Human names for board hexes, so the activity log can say *where* a token moved.
// Names are functional for now (Orange Base / Blue Jungle / Center …) and easy
// to re-theme later.
import type { GameMap } from './maps';

const ODDR = [
	[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
	[[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
] as const;
const ZONE_TYPES = ['forest', 'beach', 'middle', 'terrain', 'baseOrange', 'baseBlue'];

// odd-r offset → cube, for hex distance
function cube(id: string): [number, number, number] {
	const [col, row] = id.split('_').map(Number);
	const x = col - (row - (row & 1)) / 2;
	const z = row;
	return [x, -x - z, z];
}
const dist = (a: [number, number, number], b: [number, number, number]) =>
	Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

// underlying zone for a hex (spawn tiles borrow the majority zone around them)
function zoneType(cells: Record<string, string>, id: string): string {
	const t = cells[id];
	if (ZONE_TYPES.includes(t)) return t;
	const [c, r] = id.split('_').map(Number);
	const counts: Record<string, number> = {};
	for (const [dc, dr] of ODDR[r & 1]) {
		const n = cells[`${c + dc}_${r + dr}`];
		if (n && ZONE_TYPES.includes(n)) counts[n] = (counts[n] ?? 0) + 1;
	}
	let best = 'middle', bc = 0;
	for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k; }
	return best;
}

/** A readable name for the zone a hex belongs to, e.g. "Orange Jungle", "Center". */
export function zoneName(map: GameMap | null | undefined, hex: string): string {
	const cells = map?.cells ?? {};
	if (!cells[hex]) return 'the board';
	const z = zoneType(cells, hex);
	if (z === 'baseOrange') return 'Orange Base';
	if (z === 'baseBlue') return 'Blue Base';
	if (z === 'middle' || z === 'terrain') return 'Center';

	// jungle (forest) / beach need a side: whichever base is nearer
	const oBase = Object.keys(cells).filter((k) => cells[k] === 'baseOrange' || cells[k] === 'baseOrangeSpawn').map(cube);
	const bBase = Object.keys(cells).filter((k) => cells[k] === 'baseBlue' || cells[k] === 'baseBlueSpawn').map(cube);
	const h = cube(hex);
	const near = (bs: [number, number, number][]) => bs.length ? Math.min(...bs.map((b) => dist(h, b))) : Infinity;
	const side = near(oBase) <= near(bBase) ? 'Orange' : 'Blue';
	const kind = z === 'forest' ? 'Jungle' : z === 'beach' ? 'Beach' : 'Lane';
	return `${side} ${kind}`;
}
