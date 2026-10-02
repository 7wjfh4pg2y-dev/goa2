<svelte:options namespace="svg" />
<script lang="ts">
	// The island, drawn from the map data alone (so any map made in the editor gets the same
	// treatment): a soft coastline, a tile per hex coloured by its zone, rocks on terrain, a
	// living jungle (palms, trees, bushes, ferns, mushrooms, logs, flowers), shells and
	// driftwood on the beaches, grass and old paving in the centre, the Atlanteans' riveted
	// brass deck and the Titans' ice, the cracks between zones and a glow round the battle zone.
	// Static — nothing here animates except the battle-zone glow — and it takes no pointer
	// events (the board works hexes out from coordinates). Everything is placed by a hash of
	// the hex id, so every player sees the same island.
	// Clarity rules: small things stay small and low in contrast; anything tall stands on the
	// RIM of its hex, never in the middle where a piece stands; no svg filters.
	import { hexCenter, hexPoints, hexHash, hexNeighbour, outlineLoops, loopsPath, borderPath, type Pt } from './hexgeo';
	import { zoneType } from '../zones';
	import { MINION_ART, type MinionRole, type MinionTeam } from './minionArt';

	export let cells: Record<string, string> = {};
	export let meta: Record<string, { m: string; dir: number }> = {};
	export let size = 60;
	/** the board's rotation on screen, so light and shadows always fall the same way */
	export let rot = 0;
	/** hex → zone name (zones.ts) for the cracks and the glow */
	export let zones: Record<string, string> = {};
	export let glowZone: string | null = null;
	/** hex → team for the two throne hexes */
	export let thrones: Record<string, string> = {};
	/** the coastline (svg path), shared with the sea */
	export let coast = '';

	// minion spawn points: the emblem's radius on the hex (in hex sizes), and the two teams' inks
	const EMBLEM = 0.6;
	const INK = { orange: { ink: '#4a2208', halo: '#ffd9a8', badge: '#3a1c07' }, blue: { ink: '#123c70', halo: '#f2fbff', badge: '#0c2444' } };
	const roleOf = (m?: string): MinionRole => (m === 'ranged' || m === 'heavy' ? m : 'melee');

	// ── palette: [hue, saturation, lightness] of the tile and of the darker seam under it
	type Z = 'beach' | 'middle' | 'forest' | 'terrain' | 'baseOrange' | 'baseBlue';
	const PAL: Record<Z, { t: [number, number, number]; g: [number, number, number] }> = {
		beach: { t: [43, 64, 73], g: [38, 46, 55] },
		middle: { t: [34, 42, 55], g: [30, 40, 38] },
		forest: { t: [98, 40, 43], g: [108, 42, 27] },
		terrain: { t: [28, 16, 40], g: [26, 16, 28] },
		baseOrange: { t: [24, 60, 47], g: [18, 58, 25] }, // copper deck plates
		baseBlue: { t: [202, 62, 69], g: [209, 54, 43] } // glacier ice
	};
	const ZS = Object.keys(PAL) as Z[];
	const VARIANTS = [-2.6, 0, 2.6]; // three slightly different lightnesses, so no two neighbours match exactly
	const hsl = (c: [number, number, number], dl = 0) => `hsl(${c[0]} ${c[1]}% ${Math.max(0, Math.min(100, c[2] + dl))}%)`;

	const zoneOf = (id: string): Z => {
		const t = cells[id];
		if (t === 'baseOrangeSpawn') return 'baseOrange';
		if (t === 'baseBlueSpawn') return 'baseBlue';
		const z = zoneType(cells, id);
		return (z in PAL ? z : 'middle') as Z;
	};

	// screen-down, in board coordinates (the board may be turned): shadows fall this way
	$: down = { x: Math.sin((rot * Math.PI) / 180), y: Math.cos((rot * Math.PI) / 180) };

	// an irregular rounded lump round `c` (rocks): the same salt gives the same shape at any radius
	function blob(c: Pt, r: number, id: string, salt: number, n = 9): string {
		let d = '';
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + (hexHash(id, salt + i) - 0.5) * 0.45;
			const rr = r * (0.8 + 0.3 * hexHash(id, salt + 40 + i));
			d += `${i ? 'L' : 'M'}${(c.x + Math.cos(a) * rr).toFixed(1)} ${(c.y + Math.sin(a) * rr).toFixed(1)}`;
		}
		return d + 'Z';
	}

	$: ids = Object.keys(cells);
	$: tiles = ids.map((id) => {
		const c = hexCenter(id, size), t = cells[id];
		const team: MinionTeam | null = t === 'spawnOrange' ? 'orange' : t === 'spawnBlue' ? 'blue' : null;
		// a spawn point is a full hex of its team's ground (copper deck / ice), whatever zone it lies in
		const z: Z = team === 'orange' ? 'baseOrange' : team === 'blue' ? 'baseBlue' : zoneOf(id);
		const v = Math.floor(hexHash(id, 1) * VARIANTS.length);
		return {
			id, c, z, v,
			full: hexPoints(c, size * 1.012),
			inner: hexPoints(c, size * 0.83),
			spawn: team ? { team, role: roleOf(meta[id]?.m), dir: meta[id]?.dir ?? 0 } : null,
			// a base's hero spawn points carry the team's emblem (gear / star); the throne is one of them
			emblem: t === 'baseOrangeSpawn' ? 'orange' : t === 'baseBlueSpawn' ? 'blue' : thrones[id] ?? null,
			rock: t === 'terrain'
		};
	});
	// rocks: a boulder per terrain hex (shadow, body, lit top), plus a pebble beside some
	$: rocks = tiles.filter((t) => t.rock).map((t) => {
		const r = size * (0.66 + 0.1 * hexHash(t.id, 5));
		const o = { x: (hexHash(t.id, 6) - 0.5) * size * 0.16, y: (hexHash(t.id, 7) - 0.5) * size * 0.16 };
		const c = { x: t.c.x + o.x, y: t.c.y + o.y };
		const pa = hexHash(t.id, 8) * Math.PI * 2;
		return {
			id: t.id,
			body: blob(c, r, t.id, 100), top: blob(c, r * 0.7, t.id, 100), glint: blob(c, r * 0.4, t.id, 100),
			pebble: hexHash(t.id, 9) > 0.45 ? blob({ x: t.c.x + Math.cos(pa) * size * 0.62, y: t.c.y + Math.sin(pa) * size * 0.62 }, size * 0.2, t.id, 200, 7) : ''
		};
	});

	// ── scenery ────────────────────────────────────────────────────────────────
	// `ref` names a drawing in <defs> (all in a 60-unit hex design space); `k` scales it to
	// the board. A tall thing casts a shadow: round (`sr`, design units) or its own shape
	// (`shade` → the drawing "<ref>-shade").
	type Deco = { key: string; ref: string; x: number; y: number; r: number; k: number; sr?: number; shade?: boolean };
	const U = 1 / 60;
	$: scenery = (() => {
		const low: Deco[] = [], tall: Deco[] = [], patches: Array<{ key: string; x: number; y: number; rx: number; ry: number; r: number; fill: string }> = [];
		const at = (c: Pt, deg: number, dist: number) => ({ x: c.x + Math.cos((deg * Math.PI) / 180) * dist, y: c.y + Math.sin((deg * Math.PI) / 180) * dist });
		for (const t of tiles) {
			if (t.emblem || t.rock || t.spawn) continue;
			const h = (n: number) => hexHash(t.id, n);
			const put = (list: Deco[], n: number, ref: string, p: Pt, scale: number, o: { sr?: number; shade?: boolean; r?: number } = {}) =>
				list.push({ key: `${t.id}:${n}`, ref, x: p.x, y: p.y, r: o.r ?? Math.round(h(300 + n) * 360), k: size * U * scale, sr: o.sr, shade: o.shade });
			const patch = (n: string, p: Pt, rx: number, ry: number, r: number, fill: string) => patches.push({ key: `${t.id}:${n}`, x: p.x, y: p.y, rx: size * rx, ry: size * ry, r: Math.round(r), fill });

			if (t.z === 'forest') {
				// the forest floor: darker leaf litter and a lighter mossy patch
				for (let i = 0; i < 2; i++) patch(`p${i}`, at(t.c, h(60 + i) * 360, size * 0.4 * h(62 + i)), 0.26 + 0.2 * h(64 + i), 0.18 + 0.14 * h(66 + i), h(68 + i) * 180, i ? 'rgba(170,214,104,.16)' : 'rgba(22,62,24,.2)');
				// growth round the rim, so whatever stands on the hex is framed, not hidden
				const n = t.spawn ? 2 : 3 + (h(70) > 0.5 ? 1 : 0), a0 = h(71) * 360;
				for (let i = 0; i < n; i++) {
					const p = at(t.c, a0 + (i * 360) / n + (h(72 + i) - 0.5) * 44, size * (0.52 + 0.13 * h(76 + i)));
					const w = h(80 + i), s = 0.85 + 0.35 * h(84 + i);
					if (w < 0.24) put(tall, i, 'palm', p, s * 0.52, { shade: true });
					else if (w < 0.5) put(tall, i, 'bush', p, s * 0.86, { sr: 15 });
					else if (w < 0.66) put(low, i, 'fern', p, s * 0.8);
					else if (w < 0.76) put(tall, i, 'tree', p, s * 0.82, { sr: 24 });
					else if (w < 0.86) put(low, i, 'shroom', p, s * 0.95);
					else if (w < 0.93) put(low, i, 'log', p, s * 0.85);
					else put(low, i, 'flowers', p, s);
				}
				// now and then something small on the forest floor itself
				if (!t.spawn && h(90) < 0.4) put(low, 9, h(91) < 0.4 ? 'flowers' : h(91) < 0.7 ? 'shroom' : 'fern', at(t.c, h(92) * 360, size * 0.26 * h(93)), 0.7);
			} else if (t.z === 'beach') {
				if (!t.spawn) {
					if (h(30) < 0.6) put(low, 0, 'ripple', at(t.c, h(31) * 360, size * (0.25 + 0.28 * h(32))), 1);
					const w = h(33), p = at(t.c, h(34) * 360, size * (0.28 + 0.3 * h(35)));
					if (w < 0.13) put(low, 1, 'shell', p, 0.95);
					else if (w < 0.2) put(low, 1, 'starfish', p, 0.9);
					else if (w < 0.36) put(low, 1, 'pebbles', p, 1);
					else if (w < 0.43) put(low, 1, 'driftwood', p, 1);
					else if (w < 0.5) put(low, 1, 'tuft-dry', p, 0.9);
				}
			} else if (t.z === 'middle') {
				if (!t.spawn) {
					const w = h(40), p = at(t.c, h(41) * 360, size * (0.26 + 0.3 * h(42)));
					if (w < 0.22) put(low, 0, 'crack', p, 1);
					else if (w < 0.42) put(low, 0, 'pebbles', p, 1.05);
					else if (w < 0.64) put(low, 0, 'tuft-dry', p, 1);
					else if (w < 0.72) put(low, 0, 'slab', p, 0.95);
					else if (w < 0.79) put(low, 0, 'shrub', p, 0.9);
					if (h(44) < 0.22) put(low, 1, 'pebbles', at(t.c, h(45) * 360, size * (0.4 + 0.2 * h(46))), 0.75);
				}
			} else if (t.z === 'baseOrange') {
				// the Atlanteans' deck: riveted plates, and here and there a vent, a porthole, a gauge, a valve, a pipe
				put(low, 0, 'plate', t.c, 1, { r: Math.floor(h(50) * 6) * 60 });
				const w = h(51), p = at(t.c, h(52) * 360, size * (0.3 + 0.2 * h(53)));
				if (w < 0.15) put(low, 1, 'vent', p, 1, { r: Math.floor(h(54) * 6) * 30 });
				else if (w < 0.28) put(low, 1, 'porthole', p, 1);
				else if (w < 0.38) put(low, 1, 'gauge', p, 1);
				else if (w < 0.47) put(low, 1, 'valve', p, 1);
				if (h(55) < 0.3) put(tall, 2, 'pipe', at(t.c, Math.floor(h(56) * 6) * 60 - 60, size * 0.68), 1, { shade: true, r: Math.floor(h(56) * 6) * 60 + 30 });
			} else if (t.z === 'baseBlue') {
				// the Titans' ground: frost on glacier ice, hairline cracks, snow, and crystals standing on the rims
				for (let i = 0; i < 2; i++) patch(`f${i}`, at(t.c, h(60 + i) * 360, size * 0.42 * h(62 + i)), 0.24 + 0.2 * h(64 + i), 0.15 + 0.13 * h(66 + i), h(68 + i) * 180, i ? 'rgba(255,255,255,.3)' : 'rgba(40,110,170,.16)');
				if (h(51) < 0.5) put(low, 0, 'icecrack', at(t.c, h(52) * 360, size * 0.22 * h(53)), 1.05);
				if (h(54) < 0.24) put(low, 1, 'snow', at(t.c, h(55) * 360, size * (0.3 + 0.2 * h(56))), 1);
				const n = h(57) < 0.42 ? (h(58) < 0.35 ? 2 : 1) : 0, a0 = h(59) * 360;
				for (let i = 0; i < n; i++) put(tall, 2 + i, 'shard', at(t.c, a0 + i * 150, size * (0.56 + 0.1 * h(160 + i))), 0.8 + 0.4 * h(162 + i), { shade: true });
			}
			// the jungle creeps out: grass, and sometimes a fern, where open ground meets forest
			if (t.z === 'beach' || t.z === 'middle') {
				for (let k = 0; k < 6; k++) {
					const nb = hexNeighbour(t.id, k);
					if (!cells[nb] || zoneOf(nb) !== 'forest') continue;
					const deg = 60 * k - 60; // the way edge k faces
					const p = at(at(t.c, deg, size * (0.6 + 0.1 * h(126 + k))), deg + 90, (h(120 + k) - 0.5) * size * 0.5);
					patch(`g${k}`, p, 0.34, 0.2, deg + 90, 'rgba(86,150,58,.3)');
					put(low, 20 + k, 'tuft', p, 0.95);
					if (h(132 + k) < 0.45) put(low, 30 + k, 'fern', at(p, deg + 90, size * 0.24 * (h(138 + k) > 0.5 ? 1 : -1)), 0.62);
				}
			}
		}
		return { low, tall, patches };
	})();

	$: cracks = borderPath(ids, (id) => (cells[id] ? zones[id] ?? '' : undefined), size);
	// the battle zone's light hugs the ground you can stand on (rocks belong to the zone but aren't lit)
	$: glow = glowZone ? loopsPath(outlineLoops(ids.filter((id) => zones[id] === glowZone && cells[id] !== 'terrain'), size), 0.45) : '';
	const tf = (d: Deco) => `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${d.r}) scale(${d.k.toFixed(3)})`;
	const PENTA = 'M0 -29L17 23.5L-27.6 -9L27.6 -9L-17 23.5Z'; // a five-point star drawn in one line
</script>

<defs>
	{#each ZS as z}
		{#each VARIANTS as dv, v}
			<radialGradient id="isl-{z}-{v}" cx="0.5" cy="0.46" r="0.72">
				<stop offset="0" stop-color={hsl(PAL[z].t, dv + 5)} />
				<stop offset="0.72" stop-color={hsl(PAL[z].t, dv)} />
				<stop offset="1" stop-color={hsl(PAL[z].t, dv - 8)} />
			</radialGradient>
		{/each}
	{/each}
	<radialGradient id="isl-brass" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffd08a" /><stop offset=".55" stop-color="#dd8a33" /><stop offset="1" stop-color="#96531a" /></radialGradient>
	<radialGradient id="isl-steel" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#a9dcfa" /><stop offset=".55" stop-color="#3f86c4" /><stop offset="1" stop-color="#1c4573" /></radialGradient>
	<radialGradient id="isl-slate" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#727a86" /><stop offset="1" stop-color="#3b414b" /></radialGradient>
	<radialGradient id="isl-stone" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#96604a" /><stop offset="1" stop-color="#5a3325" /></radialGradient>

	<!-- ── jungle ── everything is seen from straight above, lit evenly, so it can be turned any way -->
	<!-- a palm: fronds round a trunk (46 units long) -->
	<g id="isl-palm">
		{#each [0, 52, 103, 155, 206, 258, 309] as a, i}
			<path transform="rotate({a})" d="M0 0C9 -13 29 -17 46 -5C30 -3 14 1 0 0Z" fill={i % 2 ? '#3c8a34' : '#2f7630'} />
			<path transform="rotate({a})" d="M4 -1C16 -8 30 -9 42 -5" fill="none" stroke="#7cc45a" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round" />
		{/each}
		<circle r="5.5" fill="#4b3219" /><circle r="2.6" cx="-1" cy="-1" fill="#8a6a3a" />
	</g>
	<g id="isl-palm-shade">
		{#each [0, 52, 103, 155, 206, 258, 309] as a}<path transform="rotate({a})" d="M0 0C9 -13 29 -17 46 -5C30 -3 14 1 0 0Z" />{/each}
	</g>
	<!-- a broadleaf tree's crown: lobes of leaves, darker underneath -->
	<g id="isl-tree">
		{#each [0, 51, 103, 154, 206, 257, 309] as a}<circle transform="rotate({a})" cx="14" cy="0" r="10.5" fill="#1e5225" />{/each}
		<circle r="15" fill="#1e5225" />
		{#each [20, 80, 140, 200, 260, 320] as a}<circle transform="rotate({a})" cx="11.5" cy="0" r="8" fill="#2d7230" />{/each}
		<circle r="11" fill="#2d7230" />
		{#each [45, 165, 285] as a}<circle transform="rotate({a})" cx="6" cy="0" r="6.4" fill="#3f8d3a" />{/each}
		<circle r="5.6" fill="#4d9e42" />
		{#each [10, 130, 250] as a}<circle transform="rotate({a})" cx="13" cy="0" r="1.7" fill="#86cc62" fill-opacity=".6" />{/each}
		<circle cx="-2" cy="-2" r="1.6" fill="#9ad873" fill-opacity=".7" />
	</g>
	<!-- a low bush -->
	<g id="isl-bush">
		<circle cx="-6" cy="3.5" r="9" fill="#27622a" /><circle cx="6" cy="4" r="9.4" fill="#27622a" /><circle cx="0" cy="-6" r="9.6" fill="#27622a" />
		<circle cx="-5" cy="2" r="6.6" fill="#398233" /><circle cx="5" cy="2.6" r="7" fill="#398233" /><circle cx="0" cy="-5.6" r="7" fill="#398233" />
		<circle cx="0" cy="-1" r="5.2" fill="#55a542" />
		<circle cx="-5" cy="0" r="1.5" fill="#8fd06a" fill-opacity=".7" /><circle cx="4" cy="-5" r="1.4" fill="#8fd06a" fill-opacity=".7" /><circle cx="3.5" cy="4.5" r="1.3" fill="#8fd06a" fill-opacity=".7" />
	</g>
	<!-- a fern: a rosette of light fronds -->
	<g id="isl-fern">
		{#each [0, 45, 90, 135, 180, 225, 270, 315] as a, i}
			<path transform="rotate({a})" d="M0 0Q8 -3.4 {i % 2 ? 15 : 18} 0Q8 3.4 0 0Z" fill={i % 2 ? '#4c9a3e' : '#63b24b'} />
			<path transform="rotate({a})" d="M2 0H{i % 2 ? 12 : 15}" stroke="#2f6b2a" stroke-opacity=".55" stroke-width=".9" />
		{/each}
		<circle r="2.2" fill="#2f6b2a" />
	</g>
	<!-- three mushrooms, caps from above -->
	<g id="isl-shroom">
		<circle r="5.2" fill="#c93c29" stroke="#7d2217" stroke-width=".8" /><circle cx="-1.7" cy="-1.5" r="1.25" fill="#fff4e0" /><circle cx="1.9" cy=".5" r="1.05" fill="#fff4e0" /><circle cx="-.3" cy="2.7" r=".85" fill="#fff4e0" />
		<circle cx="8.4" cy="5" r="3.5" fill="#d8532f" stroke="#7d2217" stroke-width=".7" /><circle cx="7.7" cy="4.2" r=".9" fill="#fff4e0" /><circle cx="9.5" cy="5.9" r=".7" fill="#fff4e0" />
		<circle cx="-6.4" cy="6.8" r="2.7" fill="#e3b577" stroke="#8a6230" stroke-width=".6" />
	</g>
	<!-- a fallen log, moss along one side -->
	<g id="isl-log">
		<rect x="-16" y="-4.6" width="32" height="9.2" rx="4.6" fill="#6b4726" stroke="#3f2913" stroke-width="1" />
		<path d="M-11 -1.6H5M-6 1.8H10M-13 1.4H-9" stroke="#4a3018" stroke-width="1.1" stroke-linecap="round" fill="none" />
		<ellipse cx="14.6" cy="0" rx="3" ry="4.1" fill="#caa470" stroke="#7a5630" stroke-width=".9" /><ellipse cx="14.6" cy="0" rx="1.2" ry="1.8" fill="none" stroke="#9a7645" stroke-width=".7" />
		<ellipse cx="-5" cy="-3.4" rx="6.5" ry="2.2" fill="#5f9c40" fill-opacity=".85" />
	</g>
	<!-- a scatter of small flowers -->
	<g id="isl-flowers">
		<circle cx="-5" cy="-2" r="2.5" fill="#f7c9e3" /><circle cx="-5" cy="-2" r=".95" fill="#f2c230" />
		<circle cx="4" cy="-4.5" r="2.2" fill="#fff8ec" /><circle cx="4" cy="-4.5" r=".85" fill="#f2c230" />
		<circle cx="2" cy="4.5" r="2.4" fill="#ffe27a" /><circle cx="2" cy="4.5" r=".9" fill="#e88a2a" />
		<circle cx="-3.5" cy="5.5" r="1.7" fill="#f7c9e3" /><circle cx="-3.5" cy="5.5" r=".65" fill="#f2c230" />
	</g>
	<!-- a clump of grass from above: blades fanning out (green by the jungle, dry elsewhere) -->
	<g id="isl-tuft">
		{#each [8, 58, 112, 168, 222, 276, 328] as a, i}<path transform="rotate({a})" d="M0 0Q4 -1.6 {i % 2 ? 7.5 : 10.5} .4" fill="none" stroke={i % 3 ? '#5d9a3a' : '#86bf52'} stroke-width="1.7" stroke-linecap="round" />{/each}
	</g>
	<g id="isl-tuft-dry">
		{#each [8, 58, 112, 168, 222, 276, 328] as a, i}<path transform="rotate({a})" d="M0 0Q4 -1.6 {i % 2 ? 7 : 10} .4" fill="none" stroke={i % 3 ? '#9c9450' : '#bfb26a'} stroke-width="1.6" stroke-linecap="round" />{/each}
	</g>
	<!-- a dry shrub -->
	<g id="isl-shrub">
		<circle cx="-4" cy="2" r="6" fill="#6f7036" /><circle cx="4" cy="2.5" r="6.2" fill="#6f7036" /><circle cx="0" cy="-4" r="6.4" fill="#6f7036" />
		<circle cx="-3" cy="1" r="4" fill="#8f8d45" /><circle cx="3" cy="1.6" r="4.2" fill="#8f8d45" /><circle cx="0" cy="-3.6" r="4.2" fill="#8f8d45" />
		<circle cx="0" cy="-.6" r="2.6" fill="#aba757" />
	</g>

	<!-- ── beach ── -->
	<g id="isl-ripple">
		<path d="M-13 0Q-6 -5 0 0T13 0" fill="none" stroke="#fff6d8" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round" />
		<path d="M-9 7Q-3 3 3 7T12 7" fill="none" stroke="#b78f4c" stroke-opacity=".38" stroke-width="2" stroke-linecap="round" />
	</g>
	<g id="isl-shell">
		<path d="M0 6.5C-8.5 4.5 -9.5 -4 -5.4 -7.2C-2.2 -9.4 2.2 -9.4 5.4 -7.2C9.5 -4 8.5 4.5 0 6.5Z" fill="#f7e0cc" stroke="#c39a7c" stroke-width="1" stroke-linejoin="round" />
		<path d="M0 5.4L-5 -5.2M0 5.4L-2 -7.6M0 5.4L2 -7.6M0 5.4L5 -5.2" fill="none" stroke="#d6ad92" stroke-width=".9" stroke-linecap="round" />
	</g>
	<g id="isl-starfish">
		<path d="M0 -8L1.9 -2.6L7.6 -2.5L3 1L4.7 6.5L0 3.2L-4.7 6.5L-3 1L-7.6 -2.5L-1.9 -2.6Z" fill="#e8764b" stroke="#e8764b" stroke-width="2.2" stroke-linejoin="round" />
		<path d="M0 -8L1.9 -2.6L7.6 -2.5L3 1L4.7 6.5L0 3.2L-4.7 6.5L-3 1L-7.6 -2.5L-1.9 -2.6Z" fill="none" stroke="#a8472a" stroke-opacity=".35" stroke-width=".8" stroke-linejoin="round" />
		<circle r="1.5" fill="#ffc9a8" fill-opacity=".85" /><circle cy="-4.6" r=".8" fill="#ffc9a8" fill-opacity=".8" /><circle cx="4.3" cy="-1.5" r=".8" fill="#ffc9a8" fill-opacity=".8" /><circle cx="-4.3" cy="-1.5" r=".8" fill="#ffc9a8" fill-opacity=".8" />
	</g>
	<g id="isl-driftwood">
		<path d="M-15 2Q-4 -3 8 -1Q13 0 16 -3M2 -1.6Q6 -6 9 -8" fill="none" stroke="#a88d68" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M-12 1.2Q-4 -2.6 7 -1.4" fill="none" stroke="#d9c5a2" stroke-opacity=".8" stroke-width="1" stroke-linecap="round" />
	</g>
	<g id="isl-pebbles">
		<ellipse cx="-4" cy="1" rx="4.4" ry="3.3" fill="#8d867a" stroke="#5f5a52" stroke-width=".7" /><ellipse cx="-5" cy="0" rx="1.8" ry="1.1" fill="#b9b2a4" fill-opacity=".8" />
		<ellipse cx="4" cy="-2.6" rx="3" ry="2.3" fill="#a79d8c" stroke="#6d665c" stroke-width=".6" />
		<ellipse cx="3.4" cy="4.4" rx="2.1" ry="1.6" fill="#77716a" />
	</g>

	<!-- ── centre ── -->
	<g id="isl-crack">
		<path d="M-10 -2L-3 2L1 -3L9 1M-3 2L-5 8" fill="none" stroke="#6b4a26" stroke-opacity=".34" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
	</g>
	<!-- old paving: two worn slabs -->
	<g id="isl-slab">
		<rect x="-12" y="-7.5" width="15" height="13" rx="2.4" fill="#c7b288" stroke="#84704a" stroke-width="1.1" />
		<path d="M-7 -7.5L-5 -1L-8.5 5.5" fill="none" stroke="#84704a" stroke-opacity=".8" stroke-width=".9" />
		<rect x="-10" y="-5.4" width="4" height="2.6" rx="1" fill="#e3d4ae" fill-opacity=".7" />
		<rect x="5" y="-3" width="9" height="9.5" rx="2.2" fill="#bba67c" stroke="#84704a" stroke-width="1.1" transform="rotate(14 9.5 1.7)" />
	</g>

	<!-- ── the Atlanteans' base: machinery ── -->
	<!-- a riveted deck plate: seams and rivets across the whole hex -->
	<g id="isl-plate">
		<path d="M-44 -9H44M-9 -9V43M17 -9V-46" fill="none" stroke="#4a2209" stroke-opacity=".5" stroke-width="2.2" />
		<path d="M-44 -6.6H44M-6.6 -6V43" fill="none" stroke="#ffd9a0" stroke-opacity=".22" stroke-width="1" />
		{#each [[-36, -17], [-12, -17], [8, -17], [36, -17], [-36, -1], [-17, -1], [-1, -1], [36, -1], [-17, 30], [-1, 30], [9, -38], [25, -38]] as [x, y]}
			<circle cx={x} cy={y} r="2.1" fill="#ffcf8c" fill-opacity=".8" stroke="#4a2209" stroke-opacity=".6" stroke-width=".8" />
		{/each}
	</g>
	<g id="isl-vent">
		<rect x="-11" y="-8" width="22" height="16" rx="3" fill="#2e1b0e" stroke="#e3a455" stroke-width="1.7" />
		<path d="M-7.5 -4.5H7.5M-7.5 -1.5H7.5M-7.5 1.5H7.5M-7.5 4.5H7.5" fill="none" stroke="#8a5a2a" stroke-width="1.5" stroke-linecap="round" />
	</g>
	<g id="isl-porthole">
		<circle r="9.5" fill="url(#isl-brass)" stroke="#4a2608" stroke-width="1.3" />
		<circle r="6.3" fill="#0f4652" stroke="#4a2608" stroke-width="1" /><circle r="6.3" fill="#3fd0d8" fill-opacity=".28" />
		<path d="M-3.8 -2.6A4.6 4.6 0 0 1 .6 -4.6" fill="none" stroke="#dffcff" stroke-opacity=".85" stroke-width="1.4" stroke-linecap="round" />
		{#each [45, 135, 225, 315] as a}<circle transform="rotate({a})" cx="7.9" cy="0" r=".95" fill="#5a2f0b" />{/each}
	</g>
	<g id="isl-gauge">
		<circle r="8.6" fill="url(#isl-brass)" stroke="#4a2608" stroke-width="1.3" /><circle r="6.2" fill="#f6e9c8" stroke="#6b4a26" stroke-width=".7" />
		{#each [-120, -80, -40, 0, 40, 80, 120] as a}<path transform="rotate({a})" d="M0 -5.6V-4.2" stroke="#4a3018" stroke-width=".8" />{/each}
		<path d="M0 .4L3.6 -3.4" stroke="#c0392b" stroke-width="1.4" stroke-linecap="round" /><circle r="1.2" fill="#4a2608" />
	</g>
	<g id="isl-valve">
		<circle r="7.4" fill="none" stroke="#b03226" stroke-width="2.8" /><circle r="7.4" fill="none" stroke="#e86a55" stroke-opacity=".6" stroke-width=".9" />
		{#each [0, 60, 120] as a}<rect transform="rotate({a})" x="-1.2" y="-7" width="2.4" height="14" fill="#b03226" />{/each}
		<circle r="2.6" fill="url(#isl-brass)" stroke="#4a2608" stroke-width=".8" />
	</g>
	<g id="isl-pipe">
		<rect x="-21" y="-5" width="42" height="10" rx="2" fill="#b9682a" stroke="#4a2608" stroke-width="1.2" />
		<path d="M-19 -2.2H19" stroke="#ffd4a0" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round" /><path d="M-19 2.6H19" stroke="#5a2a0c" stroke-opacity=".45" stroke-width="1.4" />
		{#each [-11, 8] as x}<rect {x} y="-6.8" width="4.4" height="13.6" rx="1.2" fill="#8a4a1a" stroke="#4a2608" stroke-width="1" /><path d="M{x + 2.2} -5V5" stroke="#f0b575" stroke-opacity=".5" stroke-width="1" />{/each}
	</g>
	<g id="isl-pipe-shade"><rect x="-21" y="-6.4" width="42" height="12.8" rx="2.4" /></g>

	<!-- ── the Titans' base: ice ── -->
	<g id="isl-icecrack">
		<path d="M-15 3L-6 -1L0 4L8 -3L15 -1M-6 -1L-8 -9M8 -3L10 -10M0 4L2 11" fill="none" stroke="#f4fcff" stroke-opacity=".8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M-14 4.4L-6 .6L0 5.4" fill="none" stroke="#2c6fa6" stroke-opacity=".3" stroke-width="1" stroke-linecap="round" />
	</g>
	<g id="isl-snow">
		<ellipse rx="11.5" ry="8.2" fill="#e6f4ff" /><ellipse cx="-2.6" cy="-2" rx="6.8" ry="4.4" fill="#ffffff" /><ellipse cx="4.4" cy="4.4" rx="5.4" ry="2.3" fill="#a9d3ee" fill-opacity=".75" />
	</g>
	<!-- ice crystals: a clump of faceted spikes all leaning one way out of a frosted root -->
	<g id="isl-shard">
		<ellipse cx="0" cy="1" rx="8" ry="5" fill="#d9f1ff" fill-opacity=".85" />
		<path d="M6 1L10.5 -1L11.5 3.6L8 5Z" fill="#bfe6fb" stroke="#2a6a9c" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round" />
		{#each [[-36, 0.72], [42, 0.6], [3, 1]] as [a, s]}
			<g transform="rotate({a}) scale({s})">
				<path d="M0 2L-5 -8L0 -25Z" fill="#e2f6ff" /><path d="M0 2L5 -8L0 -25Z" fill="#74c2ec" />
				<path d="M0 2L-5 -8L0 -25L5 -8Z" fill="none" stroke="#2a6a9c" stroke-opacity=".75" stroke-width="1" stroke-linejoin="round" />
				<path d="M-1.6 -6L-.4 -17" stroke="#ffffff" stroke-opacity=".9" stroke-width="1" stroke-linecap="round" />
			</g>
		{/each}
	</g>
	<g id="isl-shard-shade">
		{#each [[-36, 0.72], [42, 0.6], [3, 1]] as [a, s]}<path transform="rotate({a}) scale({s})" d="M0 2L-5 -8L0 -25L5 -8Z" />{/each}
	</g>

	<!-- hero spawn points, after the two faces of the tie-breaker coin: the Atlanteans' copper
	     gear on slate, the Titans' five-point star in a ring on red stone -->
	<g id="isl-emblem-orange">
		<circle r="40" fill="url(#isl-brass)" stroke="#4a2608" stroke-width="3" />
		<circle r="32.5" fill="url(#isl-slate)" stroke="#4a2608" stroke-width="1.6" />
		{#each [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as a}<rect transform="rotate({a})" x="-4.2" y="-30.5" width="8.4" height="9" rx="1.4" fill="#e08c35" stroke="#5a2f0b" stroke-width="1.2" />{/each}
		<circle r="23.5" fill="#e08c35" stroke="#5a2f0b" stroke-width="1.4" />
		<circle r="15.5" fill="url(#isl-slate)" stroke="#5a2f0b" stroke-width="1.2" />
		{#each [0, 60, 120] as a}<rect transform="rotate({a})" x="-2.1" y="-16" width="4.2" height="32" fill="#e08c35" stroke="#5a2f0b" stroke-width=".9" />{/each}
		<circle r="4.6" fill="#f0a54a" stroke="#5a2f0b" stroke-width="1" />
		<circle r="36.3" fill="none" stroke="#ffe3ad" stroke-opacity=".45" stroke-width="1.3" />
	</g>
	<g id="isl-emblem-blue">
		<circle r="40" fill="url(#isl-steel)" stroke="#0c2038" stroke-width="3" />
		<circle r="32.5" fill="url(#isl-stone)" stroke="#0c2038" stroke-width="1.6" />
		{#each [-54, 18, 90, 162, 234] as a}<circle transform="rotate({a})" cx="20.5" cy="0" r="3.1" fill="#16416f" stroke="#6cc4f5" stroke-width="1.7" />{/each}
		<path d={PENTA} fill="none" stroke="#12305a" stroke-width="7.4" stroke-linejoin="round" />
		<path d={PENTA} fill="none" stroke="#4ea3e2" stroke-width="4.4" stroke-linejoin="round" />
		<path d={PENTA} fill="none" stroke="#b6e4ff" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round" />
		<circle r="36.3" fill="none" stroke="#d2f1ff" stroke-opacity=".5" stroke-width="1.3" />
	</g>
</defs>

<g class="island" pointer-events="none">
	<!-- the island's footing: its shadow on the sea floor, then a skirt of pale sand that
	     rounds the coast off (the tiles sit on top of it) -->
	<path d={coast} transform="translate({(down.x * size * 0.3).toFixed(1)} {(down.y * size * 0.3).toFixed(1)})" fill="#063a5c" fill-opacity=".42" stroke="#063a5c" stroke-opacity=".42" stroke-width={size * 0.62} stroke-linejoin="round" />
	<path d={coast} fill="#ecd9a4" stroke="#ecd9a4" stroke-width={size * 0.56} stroke-linejoin="round" />
	<path d={coast} fill="none" stroke="#c9a868" stroke-opacity=".55" stroke-width={size * 0.09} stroke-linejoin="round" />

	<!-- one tile per hex: a darker seam, then the rounded tile itself, lit from its middle -->
	{#each tiles as t (t.id)}
		<polygon points={t.full} fill={hsl(PAL[t.z].g)} />
		<polygon points={t.inner} fill="url(#isl-{t.z}-{t.v})" stroke="url(#isl-{t.z}-{t.v})" stroke-width={size * 0.19} stroke-linejoin="round" />
	{/each}

	<!-- the shore is damp: a darker band just inside the waterline -->
	<path d={coast} fill="none" stroke="#7a5326" stroke-opacity=".17" stroke-width={size * 0.6} stroke-linejoin="round" />

	<!-- ground cover: leaf litter, moss, frost, grass spreading out of the jungle -->
	{#each scenery.patches as p (p.key)}
		<ellipse cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} rx={p.rx.toFixed(1)} ry={p.ry.toFixed(1)} transform="rotate({p.r} {p.x.toFixed(1)} {p.y.toFixed(1)})" fill={p.fill} />
	{/each}

	<!-- small things lying on the ground -->
	{#each scenery.low as d (d.key)}<use href="#isl-{d.ref}" transform={tf(d)} />{/each}

	<!-- spawn points and thrones keep their plates -->
	{#each tiles as t (t.id)}
		{#if t.emblem}
			<circle cx={t.c.x} cy={t.c.y} r={size * 0.98} fill={t.emblem === 'orange' ? '#ffb057' : '#bfeaff'} fill-opacity=".28" />
			<circle cx={t.c.x + down.x * size * 0.07} cy={t.c.y + down.y * size * 0.07} r={size * 0.68} fill="#000" fill-opacity=".32" />
			<use href="#isl-emblem-{t.emblem}" transform="translate({t.c.x.toFixed(1)} {t.c.y.toFixed(1)}) scale({(size / 60).toFixed(3)})" />
		{:else if t.spawn}
			{@const a = MINION_ART[t.spawn.team][t.spawn.role]}
			{@const k = (size * EMBLEM) / a.r}
			{@const ink = INK[t.spawn.team]}
			<!-- a minion spawn point: a plate of the team's ground with that minion engraved on it (facing the way it
			     will march), and a small badge for its type that always sits at the foot of the hex, upright -->
			<polygon points={hexPoints(t.c, size * 0.86)} fill="none" stroke={ink.halo} stroke-opacity=".34" stroke-width={size * 0.035} stroke-linejoin="round" />
			<use href="#mn-art-{t.spawn.team}-{t.spawn.role}" transform="translate({t.c.x.toFixed(1)} {t.c.y.toFixed(1)}) rotate({t.spawn.dir * 60 - 30}) scale({k.toFixed(4)}) translate({-a.cx} {-a.cy})"
				fill={ink.ink} fill-rule="evenodd" stroke={ink.halo} stroke-opacity=".6" stroke-width={(size * 0.035 / k).toFixed(2)} stroke-linejoin="round" paint-order="stroke" />
			<g transform="translate({(t.c.x + down.x * size * 0.74).toFixed(1)} {(t.c.y + down.y * size * 0.74).toFixed(1)}) rotate({-rot}) scale({(size * 0.2 / 10).toFixed(3)})">
				<circle r="10" fill={ink.badge} stroke={ink.halo} stroke-opacity=".85" stroke-width="1.3" />
				<use href="#mn-role-{t.spawn.role}" fill="#fff" stroke="#fff" transform="scale(.74)" />
			</g>
		{/if}
	{/each}

	<!-- the cracks where two zones meet -->
	<path d={cracks} fill="none" stroke="#2a1a0c" stroke-opacity=".5" stroke-width={size * 0.13} stroke-linecap="round" />
	<path d={cracks} fill="none" stroke="#fff3d0" stroke-opacity=".16" stroke-width={size * 0.035} stroke-linecap="round" />

	<!-- rocks stand on the terrain hexes -->
	{#each rocks as r (r.id)}
		<path d={r.body} transform="translate({(down.x * size * 0.17).toFixed(1)} {(down.y * size * 0.17).toFixed(1)})" fill="#0a0f18" fill-opacity=".4" />
		{#if r.pebble}<path d={r.pebble} fill="#4a4e58" stroke="#262a33" stroke-width={size * 0.035} stroke-linejoin="round" />{/if}
		<path d={r.body} fill="#434853" stroke="#22262e" stroke-width={size * 0.06} stroke-linejoin="round" />
		<path d={r.top} transform="translate({(-down.x * size * 0.13).toFixed(1)} {(-down.y * size * 0.13).toFixed(1)})" fill="#6a707c" stroke="#7d8490" stroke-width={size * 0.05} stroke-linejoin="round" />
		<path d={r.glint} transform="translate({(-down.x * size * 0.22).toFixed(1)} {(-down.y * size * 0.22).toFixed(1)})" fill="#8b919c" fill-opacity=".75" />
	{/each}

	<!-- things that stand up: each casts a shadow down-screen, then is drawn -->
	{#each scenery.tall as d (d.key)}
		{#if d.shade}
			<use href="#isl-{d.ref}-shade" transform="translate({(d.x + down.x * size * 0.1).toFixed(1)} {(d.y + down.y * size * 0.1).toFixed(1)}) rotate({d.r}) scale({d.k.toFixed(3)})" fill="#08141c" fill-opacity=".34" />
		{:else if d.sr}
			<circle cx={(d.x + down.x * size * 0.09).toFixed(1)} cy={(d.y + down.y * size * 0.09).toFixed(1)} r={(d.sr * d.k).toFixed(1)} fill="#0c2410" fill-opacity=".34" />
		{/if}
		<use href="#isl-{d.ref}" transform={tf(d)} />
	{/each}

	<!-- the battle zone, softly lit -->
	{#if glow}
		<path class="zglow wide" d={glow} fill="none" stroke="#ffc93a" stroke-width={size * 0.5} stroke-linejoin="round" />
		<path d={glow} fill="none" stroke="#5a3608" stroke-opacity=".6" stroke-width={size * 0.2} stroke-linejoin="round" />
		<path class="zglow" d={glow} fill="none" stroke="#ffd95e" stroke-width={size * 0.11} stroke-linejoin="round" />
	{/if}
</g>

<style>
	.zglow { opacity: .85; animation: zglow 3.2s ease-in-out infinite; }
	.zglow.wide { opacity: .3; animation-name: zglowwide; }
	@keyframes zglow { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }
	@keyframes zglowwide { 0%, 100% { opacity: .2; } 50% { opacity: .42; } }
	@media (prefers-reduced-motion: reduce) { .zglow { animation: none; } }
</style>
