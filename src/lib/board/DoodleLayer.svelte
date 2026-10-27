<script lang="ts" module>
	let doodles = 0;
</script>

<svelte:options namespace="svg" />
<script lang="ts">
	// The DOODLE retheme (rethemes.ts): flat colour tiles in thick black frames, cartoon drawings on them (the user's
	// reference sheet, 2026-10-26): jungle = round trees and pines, the middle = dusty rocky ground (pebbles, rocks,
	// cracks), beach = sand with dry tufts and shells, obstacles = dark mountains (now and then a volcano), the
	// Atlantean base = riveted copper deck plates, the Titan base = ice with snowy pines and crystals; minion spawn
	// points = the hex hatched in the team colour with M / R / H, hero spawn points = a brass gear / an ice star; a flat
	// sea with wave squiggles. Static, no pointer events, placed by hash (every player sees the same board); the
	// drawings stay upright for the viewer (`rot`). Drawn from the map data, like IslandLayer.
	import { hexCenter, hexHash, hexPoints, intHash, type Pt } from './hexgeo';
	import { zoneType } from '../zones';
	import { doodleDefs, type DoodlePart } from './doodleArt';

	export let cells: Record<string, string> = {};
	export let meta: Record<string, { m: string; dir: number }> = {};
	export let size = 60;
	export let activeZone: string | null = null;
	export let zones: Record<string, string> = {};
	export let thrones: Record<string, string> = {};
	/** the board's rotation on screen: the drawings and letters stay upright */
	export let rot = 0;
	export let ground: Record<string, string> = {};
	const P = `dd${++doodles}-`;
	const DEFS = doodleDefs(P);

	const SEA = '#6f9ab3';
	const FILL: Record<string, string> = {
		forest: '#4f7a45', middle: '#a8987c', beach: '#c9bd6a', baseOrange: '#7d4a2c', baseBlue: '#cfe3ea', terrain: '#555a63',
		// the map editor's grounds, in case a retheme ever covers one
		stone: '#8d9096', marsh: '#4d6b4f', ash: '#3a2f2b', snow: '#e4eef2', tundra: '#9fb5b0', steppe: '#b5b48a', rocky: '#9a5c48',
		scrub: '#a99a6a', frostwood: '#6f8f96', burntwood: '#4a3d34', basalt: '#4c5566', ashwood: '#9d968c'
	};
	const FORESTS = new Set(['forest', 'marsh', 'frostwood', 'burntwood', 'ashwood']);
	const f = (n: number) => n.toFixed(1);
	$: S = size;
	$: k = S / 60; // the drawings are made for a 60-unit hex

	const groundOf = (id: string): string => {
		const t = cells[id];
		if (t === 'baseOrangeSpawn') return 'baseOrange';
		if (t === 'baseBlueSpawn') return 'baseBlue';
		if (t === 'terrain') return 'terrain';
		const z = zoneType(cells, id, ground);
		return FILL[z] ? z : 'middle';
	};

	type Use = { part: DoodlePart; x: number; y: number; s: number };
	// up to n points inside a hex (a disc of `rad` × size), at least `minD` apart, top to bottom so lower ones overlap
	function pts(id: string, c: Pt, n: number, rad: number, minD: number, salt: number): Pt[] {
		const out: Pt[] = [];
		for (let j = 0; out.length < n && j < 60; j++) {
			const a = hexHash(id, salt + j * 2) * Math.PI * 2, d = Math.sqrt(hexHash(id, salt + j * 2 + 1)) * rad * S;
			const q = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.95 };
			if (out.every((o) => Math.hypot(o.x - q.x, o.y - q.y) > minD * k)) out.push(q);
		}
		return out.sort((a, b) => a.y - b.y);
	}
	const h2 = (id: string, salt: number) => hexHash(id, salt);

	$: tiles = Object.keys(cells).map((id) => {
		const t = cells[id], c = hexCenter(id, S), g = groundOf(id);
		const uses: Use[] = [];
		const put = (part: DoodlePart, q: Pt | undefined, s = 1) => { if (q) uses.push({ part, x: q.x, y: q.y, s }); };
		const spawnTeam = t === 'spawnOrange' ? 'o' : t === 'spawnBlue' ? 'b' : null;
		const coin = t === 'baseOrangeSpawn' ? 'orange' : t === 'baseBlueSpawn' ? 'blue' : thrones[id] ?? null;
		if (t === 'terrain') {
			const v = h2(id, 3);
			if (v < 0.12) { put('volcano', { x: c.x, y: c.y + 6 * k }); for (const q of pts(id, c, 4, 0.6, 16, 50)) if (Math.hypot(q.x - c.x, q.y - c.y) > 24 * k) put('pebble', q, 0.9); }
			else for (const q of pts(id, c, v > 0.6 ? 4 : 3, 0.45, 22, 10)) put(intHash(q.x, q.y, 1) < 0.5 ? 'peak' : 'peak2', q, 0.75 + intHash(q.x, q.y, 2) * 0.35);
		} else if (!spawnTeam && !coin) {
			if (FORESTS.has(g)) {
				const mode = h2(id, 4);
				for (const q of pts(id, c, 9, 0.62, 15, 20)) {
					const pine = mode < 0.33 || (mode >= 0.66 && intHash(q.x, q.y, 3) < 0.5);
					put(((pine ? 'pine' : 'tree') + (intHash(q.x, q.y, 4) < 0.5 ? '' : '2')) as DoodlePart, q, 0.62 + intHash(q.x, q.y, 5) * 0.18);
				}
				for (const q of pts(id, c, 3, 0.66, 12, 300)) put('tuft', q, 0.8);
			} else if (g === 'beach') {
				for (const q of pts(id, c, 4 + ((h2(id, 5) * 2) | 0), 0.6, 18, 40)) put('dry', q);
				if (h2(id, 6) < 0.2) put('shell', pts(id, c, 1, 0.45, 1, 88)[0]);
			} else if (g === 'baseBlue' || g === 'snow') {
				for (const q of pts(id, c, 4, 0.58, 20, 60)) put(intHash(q.x, q.y, 6) < 0.55 ? 'snowpine' : 'crystal', q, 0.62);
			} else if (g !== 'baseOrange') {
				// the dusty, rocky middle (and any other open ground)
				const v = h2(id, 6);
				if (v < 0.45) put(h2(id, 8) < 0.5 ? 'crack' : 'crack2', pts(id, c, 1, 0.3, 1, 66)[0]);
				for (const q of pts(id, c, 3 + ((h2(id, 5) * 3) | 0), 0.6, 15, 40)) {
					const r = intHash(q.x, q.y, 7);
					put(r < 0.45 ? 'stones' : r < 0.75 ? 'rock' : 'drytuft', q, 0.8 + intHash(q.x, q.y, 8) * 0.3);
				}
				if (v > 0.8) put('boulder', pts(id, c, 1, 0.35, 1, 99)[0], 0.9);
			}
		}
		if (coin) put(coin === 'orange' ? 'gearspawn' : 'starspawn', c, coin === 'orange' ? 1.15 : 1.25);
		return {
			id, c, fill: FILL[g] ?? FILL.middle, shade: 0.92 + h2(id, 7) * 0.12, uses,
			plate: g === 'baseOrange', seamAcross: h2(id, 10) < 0.5, plain: g === 'baseOrange' && !coin,
			spawn: spawnTeam ? { team: spawnTeam, letter: meta[id]?.m === 'heavy' ? 'H' : meta[id]?.m === 'ranged' ? 'R' : 'M', live: !!activeZone && zones[id] === activeZone } : null
		};
	});

	// the flat sea round the island, wave squiggles kept off the land
	$: box = (() => {
		const cs = tiles.map((t) => t.c);
		if (!cs.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
		const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
		return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
	})();
	$: seaBox = { x: box.x0 - S * 40, y: box.y0 - S * 40, w: box.x1 - box.x0 + S * 80, h: box.y1 - box.y0 + S * 80 };
	$: waves = (() => {
		const out: Pt[] = [], W = box.x1 - box.x0 + S * 12, H = box.y1 - box.y0 + S * 12;
		for (let i = 0; i < 260 && out.length < 150; i++) {
			const q = { x: box.x0 - S * 6 + intHash(i, 1, 41) * W, y: box.y0 - S * 6 + intHash(i, 2, 41) * H };
			if (tiles.some((t) => Math.abs(t.c.x - q.x) < S * 1.7 && Math.hypot(t.c.x - q.x, t.c.y - q.y) < S * 1.6)) continue;
			out.push(q);
		}
		return out;
	})();
	const rivets = (c: Pt) => [0, 1, 2, 3, 4, 5].flatMap((i) => {
		const a = (Math.PI / 180) * (60 * i - 90), b = a + Math.PI / 6;
		return [{ x: c.x + S * 0.78 * Math.cos(a), y: c.y + S * 0.78 * Math.sin(a), r: 3.2 }, { x: c.x + S * 0.69 * Math.cos(b), y: c.y + S * 0.69 * Math.sin(b), r: 2.6 }];
	});
	// `r` and `kk` come in as arguments: a `$:`-less template only re-runs for values it names itself, so reading `rot`
	// in here left every drawing at the first turn (upside down for the Atlanteans, whose board turns after mount)
	const up = (x: number, y: number, s: number, r: number, kk: number) => `translate(${f(x)} ${f(y)}) rotate(${-r}) scale(${(s * kk).toFixed(3)})`;
</script>

<defs>
	{@html DEFS}
	<pattern id="{P}hatch-o" patternUnits="userSpaceOnUse" width={11 * k} height={11 * k} patternTransform="rotate(45)"><line x1={3 * k} y1="0" x2={3 * k} y2={11 * k} stroke="#ef7d22" stroke-width={4 * k} /></pattern>
	<pattern id="{P}hatch-b" patternUnits="userSpaceOnUse" width={11 * k} height={11 * k} patternTransform="rotate(-45)"><line x1={3 * k} y1="0" x2={3 * k} y2={11 * k} stroke="#2f7fe6" stroke-width={4 * k} /></pattern>
</defs>
<g class="doodle" pointer-events="none">
	<rect x={f(seaBox.x)} y={f(seaBox.y)} width={f(seaBox.w)} height={f(seaBox.h)} fill={SEA} />
	{#each waves as w, i (i)}<use href="#{P}wave" transform={up(w.x, w.y, 1, rot, k)} />{/each}
	<!-- the black frames: every tile at full size underneath, the colour tiles inset on top -->
	<g fill="#111">{#each tiles as t (t.id)}<polygon points={hexPoints(t.c, S)} />{/each}</g>
	{#each tiles as t (t.id)}<polygon points={hexPoints(t.c, S * 0.9)} fill={t.fill} style="filter:brightness({t.shade.toFixed(2)})" />{/each}
	{#each tiles as t (t.id)}
		{#if t.plate}
			<polygon points={hexPoints(t.c, S * 0.7)} fill="#8f5a35" stroke="#2a160b" stroke-width={2 * k} />
			<polygon points={hexPoints(t.c, S * 0.62)} fill="none" stroke="#b47a48" stroke-width={1.5 * k} opacity=".7" />
			{#if t.plain}
				{#if t.seamAcross}<path d="M{f(t.c.x - S * 0.6)} {f(t.c.y)}H{f(t.c.x + S * 0.6)}" stroke="#2a160b" stroke-width={2 * k} />
				{:else}<path d="M{f(t.c.x)} {f(t.c.y - S * 0.7)}V{f(t.c.y + S * 0.7)}" stroke="#2a160b" stroke-width={2 * k} />{/if}
			{/if}
			{#each rivets(t.c) as r, i (i)}<circle cx={f(r.x)} cy={f(r.y)} r={f(r.r * k)} fill="#e3b06a" stroke="#1a0d05" stroke-width={1.4 * k} />{/each}
		{/if}
		{#if t.spawn}
			<polygon points={hexPoints(t.c, S * 0.76)} fill="url(#{P}hatch-{t.spawn.team})" opacity={t.spawn.live || !activeZone ? 0.78 : 0.5} />
			<polygon points={hexPoints(t.c, S * 0.76)} fill="none" stroke={t.spawn.team === 'o' ? '#ef7d22' : '#2f7fe6'} stroke-width={3 * k} stroke-dasharray="{9 * k} {6 * k}" stroke-linecap="round" />
			<text transform={up(t.c.x, t.c.y, 1, rot, k)} y="13" class="sl" fill={t.spawn.team === 'o' ? '#ffb36b' : '#8fc4ff'}>{t.spawn.letter}</text>
		{/if}
	{/each}
	{#each tiles as t (t.id)}{#each t.uses as u, i (i)}<use href="#{P}{u.part}" transform={up(u.x, u.y, u.s, rot, k)} />{/each}{/each}
</g>

<style>
	/* the app's own font (one font for the whole app) */
	.sl { font-size: 44px; text-anchor: middle; paint-order: stroke; stroke: #111; stroke-width: 7px; stroke-linejoin: round; }
</style>
