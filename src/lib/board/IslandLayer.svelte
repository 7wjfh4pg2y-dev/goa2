<svelte:options namespace="svg" />
<script lang="ts">
	// The island, drawn from the map data alone (so any map made in the editor gets the same
	// treatment): a soft coastline, a tile per hex coloured by its zone, rocks on terrain,
	// palms in the jungle, the cracks between zones and a glow round the battle zone.
	// Static — nothing here animates except the battle-zone glow — and it takes no pointer
	// events (the board works hexes out from coordinates).
	import { hexCenter, hexPoints, hexHash, outlineLoops, loopsPath, borderPath, SQRT3, type Pt } from './hexgeo';
	import { zoneType } from '../zones';

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

	const minionSprites = import.meta.glob('../images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;

	// ── palette: [hue, saturation, lightness] of the tile and of the darker seam under it
	type Z = 'beach' | 'middle' | 'forest' | 'terrain' | 'baseOrange' | 'baseBlue';
	const PAL: Record<Z, { t: [number, number, number]; g: [number, number, number] }> = {
		beach: { t: [43, 64, 73], g: [38, 46, 55] },
		middle: { t: [34, 42, 55], g: [30, 40, 38] },
		forest: { t: [98, 40, 43], g: [108, 42, 27] },
		terrain: { t: [28, 16, 40], g: [26, 16, 28] },
		baseOrange: { t: [27, 64, 52], g: [21, 62, 32] },
		baseBlue: { t: [207, 40, 46], g: [212, 44, 27] }
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
	const isSpawn = (t: string) => t === 'spawnOrange' || t === 'spawnBlue';

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
		const c = hexCenter(id, size), t = cells[id], z = zoneOf(id);
		const v = Math.floor(hexHash(id, 1) * VARIANTS.length);
		return {
			id, c, z, v,
			full: hexPoints(c, size * 1.012),
			inner: hexPoints(c, size * 0.83),
			spawn: isSpawn(t) ? { href: minionSprites[`../images/minions/${t === 'spawnOrange' ? 'orange' : 'blue'}_${meta[id]?.m ?? 'melee'}.png`], dir: meta[id]?.dir ?? 0, team: t === 'spawnOrange' ? 'orange' : 'blue' } : null,
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
	// palms: two or three per jungle hex, out towards its rim so they frame whatever stands there
	$: palms = tiles.filter((t) => t.z === 'forest' && !t.spawn).flatMap((t) => {
		const n = 2 + (hexHash(t.id, 12) > 0.55 ? 1 : 0), a0 = hexHash(t.id, 13) * 360;
		return Array.from({ length: n }, (_, i) => {
			const a = ((a0 + (i * 360) / n + (hexHash(t.id, 14 + i) - 0.5) * 50) * Math.PI) / 180;
			const d = size * (0.5 + 0.14 * hexHash(t.id, 17 + i));
			return { key: `${t.id}:${i}`, x: t.c.x + Math.cos(a) * d, y: t.c.y + Math.sin(a) * d, k: (size * (0.3 + 0.12 * hexHash(t.id, 20 + i))) / 46, r: Math.round(hexHash(t.id, 23 + i) * 360) };
		});
	});
	// small marks on the open ground: ripples in the sand, pebbles and tufts in the centre
	$: marks = tiles.filter((t) => (t.z === 'beach' || t.z === 'middle') && !t.spawn && hexHash(t.id, 30) < 0.62).map((t) => {
		const a = hexHash(t.id, 31) * Math.PI * 2, d = size * (0.28 + 0.26 * hexHash(t.id, 32));
		return { id: t.id, z: t.z, x: t.c.x + Math.cos(a) * d, y: t.c.y + Math.sin(a) * d, r: Math.round(hexHash(t.id, 33) * 360), k: size / 60, alt: hexHash(t.id, 34) > 0.5 };
	});
	// rivets / runes on the two bases
	$: studs = tiles.filter((t) => (t.z === 'baseOrange' || t.z === 'baseBlue') && !t.emblem).map((t) => ({ id: t.id, z: t.z, c: t.c, r: Math.round(hexHash(t.id, 40) * 6) * 60 }));

	$: cracks = borderPath(ids, (id) => (cells[id] ? zones[id] ?? '' : undefined), size);
	$: glow = glowZone ? loopsPath(outlineLoops(ids.filter((id) => zones[id] === glowZone && cells[id] !== 'terrain'), size), 0.45) : '';
	const W = SQRT3; // hex width in sizes
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
	<!-- a palm seen from above: fronds round a trunk (46 units long) -->
	<g id="isl-palm">
		{#each [0, 52, 103, 155, 206, 258, 309] as a, i}
			<path transform="rotate({a})" d="M0 0C9 -13 29 -17 46 -5C30 -3 14 1 0 0Z" fill={i % 2 ? '#3c8a34' : '#2f7630'} />
			<path transform="rotate({a})" d="M4 -1C16 -8 30 -9 42 -5" fill="none" stroke="#7cc45a" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round" />
		{/each}
		<circle r="5.5" fill="#4b3219" /><circle r="2.6" cx="-1" cy="-1" fill="#8a6a3a" />
	</g>
	<!-- hero spawn points (60-unit design space): the Atlanteans' brass gear, the Titans' rune star -->
	<radialGradient id="isl-brass" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffd98f" /><stop offset=".55" stop-color="#e09a3a" /><stop offset="1" stop-color="#9a5a17" /></radialGradient>
	<radialGradient id="isl-steel" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#9fd4f5" /><stop offset=".55" stop-color="#3f7fb8" /><stop offset="1" stop-color="#1c3f6b" /></radialGradient>
	<g id="isl-emblem-orange">
		<circle r="40" fill="url(#isl-brass)" stroke="#4a2608" stroke-width="3.4" />
		<circle r="33" fill="none" stroke="#fff0c8" stroke-opacity=".45" stroke-width="1.6" />
		{#each [0, 45, 90, 135, 180, 225, 270, 315] as a}<rect transform="rotate({a})" x="-5.5" y="-29" width="11" height="12" rx="2" fill="#5a2f0b" />{/each}
		<circle r="20" fill="#5a2f0b" /><circle r="13.5" fill="url(#isl-brass)" />
		{#each [0, 60, 120] as a}<rect transform="rotate({a})" x="-1.9" y="-13" width="3.8" height="26" fill="#5a2f0b" />{/each}
		<circle r="4.6" fill="#5a2f0b" /><circle r="2" fill="#ffe2a6" />
	</g>
	<g id="isl-emblem-blue">
		<circle r="40" fill="url(#isl-steel)" stroke="#0c2038" stroke-width="3.4" />
		<circle r="33" fill="none" stroke="#c9f4ff" stroke-opacity=".5" stroke-width="1.6" />
		<path d="M0 -28L24.2 14L-24.2 14Z" fill="#12305a" stroke="#8fe9ff" stroke-width="2.6" stroke-linejoin="round" />
		<path d="M0 28L24.2 -14L-24.2 -14Z" fill="#12305a" fill-opacity=".55" stroke="#8fe9ff" stroke-width="2.6" stroke-linejoin="round" />
		<circle r="6.5" fill="#bff6ff" /><circle r="11" fill="none" stroke="#8fe9ff" stroke-opacity=".6" stroke-width="1.6" />
	</g>
	<g id="isl-palm-shade">
		{#each [0, 52, 103, 155, 206, 258, 309] as a}<path transform="rotate({a})" d="M0 0C9 -13 29 -17 46 -5C30 -3 14 1 0 0Z" />{/each}
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

	<!-- ground marks -->
	{#each marks as m (m.id)}
		<g transform="translate({m.x.toFixed(1)} {m.y.toFixed(1)}) rotate({m.r}) scale({m.k.toFixed(3)})">
			{#if m.z === 'beach'}
				<path d="M-13 0Q-6 -5 0 0T13 0" fill="none" stroke="#fff6d8" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round" />
				<path d="M-9 7Q-3 3 3 7T12 7" fill="none" stroke="#b78f4c" stroke-opacity=".38" stroke-width="2" stroke-linecap="round" />
			{:else if m.alt}
				<ellipse cx="-5" cy="1" rx="5" ry="3.6" fill="#7d5c36" fill-opacity=".55" /><ellipse cx="5" cy="-3" rx="3.4" ry="2.6" fill="#6f5130" fill-opacity=".5" /><ellipse cx="4" cy="5" rx="2.4" ry="1.8" fill="#d9bd8a" fill-opacity=".45" />
			{:else}
				<path d="M-10 -2L-3 2L1 -3L9 1M-3 2L-5 8" fill="none" stroke="#6b4a26" stroke-opacity=".34" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			{/if}
		</g>
	{/each}

	<!-- the bases: brass rivets for the Atlanteans, rune light for the Titans -->
	{#each studs as s (s.id)}
		<g transform="translate({s.c.x.toFixed(1)} {s.c.y.toFixed(1)}) rotate({s.r}) scale({(size / 60).toFixed(3)})">
			{#if s.z === 'baseOrange'}
				{#each [0, 120, 240] as a}<circle transform="rotate({a})" cx="0" cy="-36" r="3.2" fill="#ffd89a" fill-opacity=".75" stroke="#6b3a12" stroke-opacity=".6" stroke-width="1.2" />{/each}
				<circle r="15" fill="none" stroke="#ffcf8c" stroke-opacity=".22" stroke-width="2.4" />
			{:else}
				<path d="M-14 -20L0 -34L14 -20M-9 26L0 34L9 26" fill="none" stroke="#8fe9ff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
				<circle r="15" fill="none" stroke="#9eeaff" stroke-opacity=".2" stroke-width="2.4" />
			{/if}
		</g>
	{/each}

	<!-- spawn points and thrones keep their plates -->
	{#each tiles as t (t.id)}
		{#if t.emblem}
			<circle cx={t.c.x} cy={t.c.y} r={size * 0.98} fill={t.emblem === 'orange' ? '#ffb057' : '#6fd6ff'} fill-opacity=".26" />
			<circle cx={t.c.x + down.x * size * 0.07} cy={t.c.y + down.y * size * 0.07} r={size * 0.68} fill="#000" fill-opacity=".32" />
			<use href="#isl-emblem-{t.emblem}" transform="translate({t.c.x.toFixed(1)} {t.c.y.toFixed(1)}) scale({(size / 60).toFixed(3)})" />
		{:else if t.spawn}
			<circle cx={t.c.x + down.x * size * 0.07} cy={t.c.y + down.y * size * 0.07} r={size * 0.64} fill="#000" fill-opacity=".28" />
			<image href={t.spawn.href} x={t.c.x - W * size * 0.385} y={t.c.y - W * size * 0.385} width={W * size * 0.77} height={W * size * 0.77} preserveAspectRatio="xMidYMid meet"
				transform={t.spawn.dir ? `rotate(${t.spawn.dir * 60} ${t.c.x} ${t.c.y})` : undefined} />
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

	<!-- palms -->
	{#each palms as p (p.key)}
		<use href="#isl-palm-shade" transform="translate({(p.x + down.x * size * 0.1).toFixed(1)} {(p.y + down.y * size * 0.1).toFixed(1)}) rotate({p.r}) scale({p.k.toFixed(3)})" fill="#0c2410" fill-opacity=".36" />
		<use href="#isl-palm" transform="translate({p.x.toFixed(1)} {p.y.toFixed(1)}) rotate({p.r}) scale({p.k.toFixed(3)})" />
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
