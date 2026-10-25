<script lang="ts" module>
	let inks = 0;
</script>

<svelte:options namespace="svg" />
<script lang="ts">
	// The INK & WASH retheme (rethemes.ts): the map as a page of an old atlas — paper instead of the sea, ripple
	// lines inked round the coast, a watercolour wash per ground that bleeds past its hex, pen work on the ground
	// (cogs, steam and springs in the Atlantean base, snowflakes, frost curls and twinkles on the Titans' ice, fern
	// ticks, stippled sand, dry tufts), the coast inked twice with a wobble, the
	// zones' borders dotted, the rocks as inked boulders, the hero spawn points as the tie-breaker coin's faces in ink
	// and watercolour (the Atlanteans' gear, the Titans' star) and the minion spawn points as hexes hatched in the team's
	// colour with the minion models' emblem (minionArt.ts) washed over them. Static, no pointer events, placed by hash:
	// every player sees the same page. Drawn from the map data, like IslandLayer.
	import { hexCenter, hexCorner, hexPoints, hexHash, hexNeighbour, borderPath, intHash, type Pt } from './hexgeo';
	import { zoneType } from '../zones';
	import { MINION_ART, type MinionRole, type MinionTeam } from './minionArt';

	export let cells: Record<string, string> = {};
	export let meta: Record<string, { m: string; dir: number }> = {};
	export let size = 60;
	export let zones: Record<string, string> = {};
	export let activeZone: string | null = null;
	export let thrones: Record<string, string> = {};
	export let coast = '';
	/** the board's rotation on screen: the coins stay upright for the viewer */
	export let rot = 0;
	export let ground: Record<string, string> = {};
	const P = `ink${++inks}-`;

	const PAPER = '#ecdfc3';
	const SEP = '#3b2614';
	const f = (n: number) => n.toFixed(1);
	$: S = size;

	// watercolour per ground [hue, sat, light]: the Forgotten Island's six, then the map editor's extra grounds
	const WASH: Record<string, [number, number, number]> = {
		baseOrange: [24, 70, 48], baseBlue: [200, 55, 78], forest: [118, 38, 38], middle: [62, 30, 60], beach: [44, 70, 68], terrain: [30, 10, 56],
		stone: [214, 9, 62], marsh: [140, 25, 40], ash: [10, 15, 30], snow: [205, 40, 88], tundra: [178, 15, 62], steppe: [70, 25, 60],
		rocky: [18, 35, 50], scrub: [35, 35, 58], frostwood: [195, 30, 55], burntwood: [20, 15, 35], basalt: [215, 15, 34], ashwood: [30, 6, 64]
	};
	const hsla = (w: [number, number, number], a: number) => `hsl(${w[0]} ${w[1]}% ${w[2]}% / ${a})`;
	const groundOf = (id: string): string => {
		const t = cells[id];
		if (t === 'baseOrangeSpawn') return 'baseOrange';
		if (t === 'baseBlueSpawn') return 'baseBlue';
		if (t === 'terrain') return ground[id] && WASH[ground[id]] ? ground[id] : 'terrain';
		const z = zoneType(cells, id, ground);
		return WASH[z] ? z : 'middle';
	};
	const roleOf = (m?: string): MinionRole => (m === 'ranged' || m === 'heavy' ? m : 'melee');

	$: ids = Object.keys(cells);
	$: hexes = ids.map((id) => {
		const t = cells[id];
		const team: MinionTeam | null = t === 'spawnOrange' ? 'orange' : t === 'spawnBlue' ? 'blue' : null;
		return {
			id, c: hexCenter(id, S), g: groundOf(id),
			kind: t === 'terrain' ? 'rock' : team ? 'minion' : t === 'baseOrangeSpawn' || t === 'baseBlueSpawn' || thrones[id] ? 'hero' : 'ground',
			coin: (t === 'baseOrangeSpawn' ? 'orange' : t === 'baseBlueSpawn' ? 'blue' : thrones[id] ?? null) as string | null,
			spawn: team ? { team, role: roleOf(meta[id]?.m), dir: meta[id]?.dir ?? 0 } : null
		};
	});

	// ── the paper round the island: a big sheet, brown blotches, a vignette
	$: box = (() => {
		if (!hexes.length) return { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, r: 1 };
		const xs = hexes.map((h) => h.c.x), ys = hexes.map((h) => h.c.y);
		const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
		return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2 };
	})();
	$: blots = Array.from({ length: 110 }, (_, i) => ({
		x: box.cx + (intHash(i, 1, 71) - 0.5) * box.r * 3.2, y: box.cy + (intHash(i, 2, 71) - 0.5) * box.r * 3.2,
		r: S * (1 + intHash(i, 3, 71) * 5), o: 0.35 + intHash(i, 4, 71) * 0.65
	}));

	// ── the coast's edges (an edge with no hex across it), each with its outward direction
	$: coastEdges = hexes.flatMap((h) => [0, 1, 2, 3, 4, 5].filter((k) => !cells[hexNeighbour(h.id, k)]).map((k) => {
		const a = hexCorner(h.c, S, k), b = hexCorner(h.c, S, (k + 1) % 6);
		const mx = (a.x + b.x) / 2 - h.c.x, my = (a.y + b.y) / 2 - h.c.y, l = Math.hypot(mx, my);
		return { id: h.id, k, a, b, nx: mx / l, ny: my / l };
	}));
	// ripple lines: the (smoothed) coast offset outward — a ring cut out of the coast stroked wide (a mask each)
	const RIPPLES = [[0.35, 0.55], [0.62, 0.35], [0.9, 0.2], [1.2, 0.1]];
	// the coastline inked twice, each stroke a little off the line
	$: coastInk = [0, 1].map((j) => coastEdges.map((e) => {
		const w = (n: number) => (hexHash(e.id, 500 + j * 20 + e.k * 3 + n) - 0.5) * 0.06 * S;
		return `M${f(e.a.x + w(0))} ${f(e.a.y + w(1))}L${f(e.b.x + w(2))} ${f(e.b.y + w(1))}`;
	}).join(''));

	// ── the washes: a hex each, then a second, larger one a little off centre, so the edges bleed
	$: wash2 = hexes.map((h) => ({ id: h.id, g: h.g, c: { x: h.c.x + (hexHash(h.id, 11) - 0.5) * 0.25 * S, y: h.c.y + (hexHash(h.id, 12) - 0.5) * 0.25 * S } }));
	// watercolour pools darker where it dries (the hex's edge) and leaves soft blooms, darker or paler, inside it
	const dark = (w: [number, number, number]): [number, number, number] => [w[0], Math.min(100, w[1] + 8), Math.max(0, w[2] - 22)];
	$: blooms = hexes.flatMap((h) => {
		if (h.kind !== 'ground') return [];
		const r = (n: number) => hexHash(h.id, 650 + n), w = WASH[h.g];
		return [0, 1].filter((i) => r(i) < 0.7).map((i) => ({
			k: `${h.id}:${i}`, x: h.c.x + (r(2 + i) - 0.5) * 0.9 * S, y: h.c.y + (r(4 + i) - 0.5) * 0.9 * S,
			rx: S * (0.25 + 0.25 * r(6 + i)), ry: S * (0.16 + 0.16 * r(8 + i)), r: Math.round(r(10 + i) * 180),
			fill: i ? hsla([w[0], w[1], Math.min(96, w[2] + 14)], 0.22) : hsla(dark(w), 0.1)
		}));
	});
	$: grid = hexes.map((h) => `M${hexPoints(h.c, S).replace(/ /g, 'L')}Z`).join('');

	// ── pen work on plain ground, one path per kind
	// doodles for the bases (path data, board units)
	const cog = (cx: number, cy: number, R: number, turn: number) => {
		let d = '';
		const n = 8, ri = R * 0.72;
		for (let i = 0; i < n; i++) {
			const a = ((i / n) * 360 + turn) * (Math.PI / 180), w = Math.PI / n;
			const pts = [[a - w * 0.62, ri], [a - w * 0.38, R], [a + w * 0.38, R], [a + w * 0.62, ri]];
			for (const [b, rr] of pts) d += `${d ? 'L' : 'M'}${f(cx + Math.cos(b) * rr)} ${f(cy + Math.sin(b) * rr)}`;
		}
		const h = R * 0.3;
		return d + `ZM${f(cx - h)} ${f(cy)}a${f(h)} ${f(h)} 0 1 0 ${f(2 * h)} 0a${f(h)} ${f(h)} 0 1 0 ${f(-2 * h)} 0`;
	};
	// a puff of steam: three bumps on a cloud
	const puff = (cx: number, cy: number, R: number) =>
		`M${f(cx - R)} ${f(cy + R * 0.3)}a${f(R * 0.45)} ${f(R * 0.45)} 0 0 1 ${f(R * 0.5)} ${f(-R * 0.7)}a${f(R * 0.55)} ${f(R * 0.55)} 0 0 1 ${f(R)} ${f(-R * 0.1)}a${f(R * 0.45)} ${f(R * 0.45)} 0 0 1 ${f(R * 0.5)} ${f(R * 0.8)}Z`;
	// a coiled spring: a zigzag that loops
	const spring = (cx: number, cy: number, R: number) => {
		let d = `M${f(cx - R)} ${f(cy)}`;
		for (let i = 0; i < 4; i++) d += `a${f(R * 0.28)} ${f(R * 0.6)} 0 1 1 ${f(R * 0.5)} 0`;
		return d;
	};
	// a snowflake: three strokes through the middle, a little V on every arm
	const flake = (cx: number, cy: number, R: number, turn: number) => {
		let d = '';
		for (let i = 0; i < 6; i++) {
			const a = ((i * 60 + turn) * Math.PI) / 180, ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
			d += `M${f(cx)} ${f(cy)}L${f(ex)} ${f(ey)}`;
			const mx = cx + Math.cos(a) * R * 0.6, my = cy + Math.sin(a) * R * 0.6;
			for (const s2 of [-1, 1]) { const b = a + s2 * 0.75; d += `M${f(mx)} ${f(my)}L${f(mx + Math.cos(b) * R * 0.32)} ${f(my + Math.sin(b) * R * 0.32)}`; }
		}
		return d;
	};
	// a frost curl: a little spiral
	const curl = (cx: number, cy: number, R: number, flip: boolean) => {
		const s2 = flip ? 1 : 0;
		return `M${f(cx + R)} ${f(cy)}a${f(R)} ${f(R)} 0 0 ${s2} ${f(-2 * R)} 0a${f(R * 0.7)} ${f(R * 0.7)} 0 0 ${s2} ${f(R * 1.4)} 0a${f(R * 0.4)} ${f(R * 0.4)} 0 0 ${s2} ${f(-R * 0.8)} 0`;
	};
	// a twinkle: a four-point sparkle
	const twinkle = (cx: number, cy: number, R: number) => `M${f(cx)} ${f(cy - R)}L${f(cx)} ${f(cy + R)}M${f(cx - R)} ${f(cy)}L${f(cx + R)} ${f(cy)}M${f(cx - R * 0.45)} ${f(cy - R * 0.45)}L${f(cx + R * 0.45)} ${f(cy + R * 0.45)}M${f(cx + R * 0.45)} ${f(cy - R * 0.45)}L${f(cx - R * 0.45)} ${f(cy + R * 0.45)}`;
	$: pen = (() => {
		let cogs = '', steam = '', flakes = '', curls = '', ferns = '', stipple = '', tufts = '';
		for (const h of hexes) {
			if (h.kind !== 'ground') continue;
			const r = (n: number) => hexHash(h.id, 600 + n), { x, y } = h.c;
			// the bases are drawn for fun: little doodles round the rim of each hex, never in the middle where a piece stands
			const spot = (n: number, d = 0.5) => { const a = r(n) * Math.PI * 2; return { x: x + Math.cos(a) * d * S, y: y + Math.sin(a) * d * S, a }; };
			if (h.g === 'baseOrange') {
				// the Atlanteans' workshop: a cog, and now and then a puff of steam or a coiled spring
				const c = spot(0);
				cogs += cog(c.x, c.y, S * (0.16 + 0.05 * r(1)), r(2) * 30);
				const o = spot(0, 0.5), q = { x: x - (o.x - x), y: y - (o.y - y) }; // across the hex from the cog
				if (r(3) < 0.5) steam += puff(q.x, q.y, S * 0.14);
				else if (r(3) < 0.8) steam += spring(q.x, q.y, S * 0.13);
			} else if (h.g === 'baseBlue' || h.g === 'snow') {
				// the Titans' ice: a snowflake, a frost curl, a couple of twinkles
				const c = spot(0);
				flakes += flake(c.x, c.y, S * (0.15 + 0.05 * r(1)), r(2) * 60);
				const o = { x: x - (c.x - x), y: y - (c.y - y) };
				if (r(3) < 0.55) curls += curl(o.x, o.y, S * 0.12, r(4) < 0.5);
				else flakes += twinkle(o.x, o.y, S * 0.085);
				if (r(5) < 0.5) { const t = spot(6, 0.62); flakes += twinkle(t.x, t.y, S * 0.055); }
			} else if (h.g === 'forest' || h.g === 'frostwood' || h.g === 'marsh') {
				for (let i = 0; i < 3; i++) {
					const fx = x + (r(10 + i) - 0.5) * 1.2 * S, fy = y + (r(20 + i) - 0.5) * 1.2 * S, u = S;
					ferns += `M${f(fx)} ${f(fy + 0.14 * u)}L${f(fx)} ${f(fy - 0.14 * u)}M${f(fx)} ${f(fy)}l${f(-0.1 * u)} ${f(-0.1 * u)}M${f(fx)} ${f(fy)}l${f(0.1 * u)} ${f(-0.1 * u)}M${f(fx)} ${f(fy + 0.08 * u)}l${f(-0.1 * u)} ${f(-0.1 * u)}M${f(fx)} ${f(fy + 0.08 * u)}l${f(0.1 * u)} ${f(-0.1 * u)}`;
				}
			} else if (h.g === 'beach' || h.g === 'ash' || h.g === 'rocky') {
				for (let i = 0; i < 8; i++) { const sx = x + (r(30 + i) - 0.5) * 1.5 * S, sy = y + (r(40 + i) - 0.5) * 1.5 * S; stipple += `M${f(sx)} ${f(sy)}h.01`; }
			} else {
				for (let i = 0; i < 2; i++) {
					const tx = x + (r(50 + i) - 0.5) * 1.2 * S, ty = y + (r(55 + i) - 0.5) * 1.2 * S, u = S;
					tufts += `M${f(tx - 0.1 * u)} ${f(ty - 0.1 * u)}L${f(tx)} ${f(ty + 0.06 * u)}L${f(tx + 0.1 * u)} ${f(ty - 0.12 * u)}M${f(tx)} ${f(ty + 0.06 * u)}L${f(tx)} ${f(ty - 0.14 * u)}`;
				}
			}
		}
		return { cogs, steam, flakes, curls, ferns, stipple, tufts };
	})();

	$: borders = borderPath(ids, (id) => (cells[id] ? zones[id] ?? '' : undefined), S);

	// ── boulders: a lumpy outline, a grey wash, hatching, a light patch, the ink and a crack
	$: rocks = hexes.filter((h) => h.kind === 'rock').map((h) => {
		const r = (n: number) => hexHash(h.id, 700 + n);
		let d = '';
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * Math.PI * 2, rr = (0.52 + (r(k) - 0.5) * 0.14) * S;
			d += `${k ? 'L' : 'M'}${f(h.c.x + Math.cos(a) * rr)} ${f(h.c.y + Math.sin(a) * rr * 0.85 + 0.05 * S)}`;
		}
		const { x, y } = h.c;
		return { id: h.id, d: d + 'Z', x, y, crack: `M${f(x - 0.05 * S)} ${f(y - 0.35 * S)}L${f(x + 0.05 * S)} ${f(y - 0.05 * S)}L${f(x - 0.02 * S)} ${f(y + 0.2 * S)}` };
	});

	// ── the tie-breaker coin's faces, drawn in a 100-unit coin (radius 100) and scaled onto the hex
	const GEAR = (() => {
		let d = '';
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * Math.PI * 2 - Math.PI / 2, wt = 0.1;
			const pts = [[a - 0.26, 56], [a - wt - 0.02, 56], [a - wt, 70], [a + wt, 70], [a + wt + 0.02, 56], [a + 0.26, 56]];
			for (const [ang, rr] of pts) d += `${d ? 'L' : 'M'}${(Math.cos(ang) * rr).toFixed(1)} ${(Math.sin(ang) * rr).toFixed(1)}`;
		}
		return d + 'Z';
	})();
	const SPOKES = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `M${(Math.cos(a) * 10).toFixed(1)} ${(Math.sin(a) * 10).toFixed(1)}L${(Math.cos(a) * 41).toFixed(1)} ${(Math.sin(a) * 41).toFixed(1)}`; }).join('');
	const STAR = (() => { let d = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; d += `${i ? 'L' : 'M'}${(Math.cos(a) * 66).toFixed(1)} ${(Math.sin(a) * 66).toFixed(1)}`; } return d + 'Z'; })();
	const STUDS = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + Math.PI / 5 + (i * 2 * Math.PI) / 5; return { x: Math.cos(a) * 52, y: Math.sin(a) * 52 }; });
	const STONE_CRACKS = 'M-60 -22L-44 -14L-40 4M48 -40L38 -24L44 -10M-30 52L-16 44L-4 56M56 24L42 30';
	const coinTf = (c: Pt, rot = 0) => `translate(${f(c.x)} ${f(c.y)}) rotate(${-rot}) scale(${(S * 0.0074).toFixed(4)})`;

	// ── minion spawn points: a mark ON the map, never shaped like a piece (2026-10-25, the user's pick D): the hex hatched
	// in the team's colour and the model's emblem (minionArt) washed over it in the team colour, facing its way
	const WASHC = { orange: 'rgba(239,125,34,', blue: 'rgba(47,127,230,' };
	$: spawns = hexes.filter((h) => h.spawn).map((h) => {
		const s = h.spawn!, a = MINION_ART[s.team][s.role], k = (S * 0.5) / a.r;
		let brackets = '';
		if (activeZone && zones[h.id] === activeZone) {
			for (let i = 0; i < 6; i++) {
				const p = hexCorner(h.c, 0.86 * S, i), l = hexCorner(h.c, 0.86 * S, (i + 5) % 6), r = hexCorner(h.c, 0.86 * S, (i + 1) % 6), q = 0.26;
				brackets += `M${f(p.x + (l.x - p.x) * q)} ${f(p.y + (l.y - p.y) * q)}L${f(p.x)} ${f(p.y)}L${f(p.x + (r.x - p.x) * q)} ${f(p.y + (r.y - p.y) * q)}`;
			}
		}
		return {
			id: h.id, team: s.team, c: h.c, art: a, k, brackets,
			tf: `translate(${f(h.c.x)} ${f(h.c.y)}) rotate(${s.dir * 60 - 30}) scale(${k.toFixed(4)}) translate(${-a.cx} ${-a.cy})`
		};
	});
	// diagonal hatching over a hex (clipped to it where it's drawn)
	const hatchAt = (c: Pt) => { let d = ''; for (let i = -10; i <= 10; i++) { const x = c.x + i * S * 0.12; d += `M${f(x - S)} ${f(c.y + S)}L${f(x + S)} ${f(c.y - S)}`; } return d; };
	$: coins = hexes.filter((h) => h.kind === 'hero' && h.coin);
</script>

<defs>
	<radialGradient id="{P}blot"><stop offset="0" stop-color="rgb(120,80,30)" stop-opacity=".07" /><stop offset="1" stop-color="rgb(120,80,30)" stop-opacity="0" /></radialGradient>
	<radialGradient id="{P}vig" gradientUnits="userSpaceOnUse" cx={box.cx} cy={box.cy} r={box.r * 1.9}>
		<stop offset=".4" stop-color="rgb(90,50,20)" stop-opacity="0" /><stop offset="1" stop-color="rgb(90,50,20)" stop-opacity=".34" />
	</radialGradient>
	<pattern id="{P}hatch" patternUnits="userSpaceOnUse" width={S * 0.1} height={S * 0.1} patternTransform="rotate(23)">
		<line x1="0" y1="0" x2="0" y2={S * 0.1} stroke="rgba(59,38,20,.55)" stroke-width={S * 0.025} />
	</pattern>
	{#each RIPPLES as [d], i}
		<mask id="{P}rip{i}" maskUnits="userSpaceOnUse" x={box.cx - box.r * 2} y={box.cy - box.r * 2} width={box.r * 4} height={box.r * 4}>
			<path d={coast} fill="none" stroke="#fff" stroke-width={S * (2 * d + 0.045)} stroke-linejoin="round" />
			<path d={coast} fill="#000" stroke="#000" stroke-width={S * (2 * d - 0.045)} stroke-linejoin="round" />
		</mask>
	{/each}
	{#each rocks as r (r.id)}<clipPath id="{P}rk{r.id}"><path d={r.d} /></clipPath>{/each}
</defs>

<g class="ink">
	<!-- the paper -->
	<rect x={box.cx - box.r * 3} y={box.cy - box.r * 3} width={box.r * 6} height={box.r * 6} fill={PAPER} />
	{#each blots as b, i (i)}<circle cx={f(b.x)} cy={f(b.y)} r={f(b.r)} fill="url(#{P}blot)" opacity={b.o.toFixed(2)} />{/each}
	<rect x={box.cx - box.r * 3} y={box.cy - box.r * 3} width={box.r * 6} height={box.r * 6} fill="url(#{P}vig)" />

	<!-- the sea: a pale wash hugging the coast, then ripple lines -->
	<path d={coast} fill="none" stroke="rgba(80,140,170,.12)" stroke-width={S * 4.4} stroke-linejoin="round" />
	<path d={coast} fill="none" stroke="rgba(80,140,170,.12)" stroke-width={S * 3} stroke-linejoin="round" />
	{#each RIPPLES as [, a], i}<rect x={box.cx - box.r * 2} y={box.cy - box.r * 2} width={box.r * 4} height={box.r * 4} fill="rgba(40,70,90,{a})" mask="url(#{P}rip{i})" />{/each}

	<!-- watercolour -->
	<path d={coast} fill={PAPER} />
	{#each hexes as h (h.id)}<polygon points={hexPoints(h.c, S * 1.02)} fill={hsla(WASH[h.g], 0.55)} />{/each}
	{#each hexes as h (h.id)}<polygon points={hexPoints(h.c, S * 0.94)} fill="none" stroke={hsla(dark(WASH[h.g]), 0.13)} stroke-width={S * 0.1} stroke-linejoin="round" />{/each}
	{#each blooms as b (b.k)}<ellipse cx={f(b.x)} cy={f(b.y)} rx={f(b.rx)} ry={f(b.ry)} transform="rotate({b.r} {f(b.x)} {f(b.y)})" fill={b.fill} />{/each}
	{#each wash2 as h (h.id)}<polygon points={hexPoints(h.c, S * 1.08)} fill={hsla(WASH[h.g], 0.18)} />{/each}
	<path d={grid} fill="none" stroke="rgba(59,38,20,.14)" stroke-width={S * 0.03} />

	<!-- pen work -->
	<g fill="none" stroke="rgba(59,38,20,.45)" stroke-width={S * 0.03} stroke-linecap="round" stroke-linejoin="round">
		<path d={pen.ferns} /><path d={pen.tufts} />
	</g>
	<!-- the bases' doodles: copper ink in the Atlanteans' workshop, blue ink on the Titans' ice -->
	<path d={pen.cogs} fill="rgba(236,190,140,.45)" fill-rule="evenodd" stroke="rgba(110,48,12,.7)" stroke-width={S * 0.026} stroke-linejoin="round" />
	<path d={pen.steam} fill="rgba(255,248,236,.5)" stroke="rgba(110,48,12,.6)" stroke-width={S * 0.024} stroke-linecap="round" stroke-linejoin="round" />
	<path d={pen.flakes} fill="none" stroke="rgba(28,72,128,.62)" stroke-width={S * 0.024} stroke-linecap="round" />
	<path d={pen.curls} fill="none" stroke="rgba(28,72,128,.55)" stroke-width={S * 0.024} stroke-linecap="round" />
	<path d={pen.stipple} fill="none" stroke="rgba(59,38,20,.35)" stroke-width={S * 0.045} stroke-linecap="round" />

	<!-- minion spawn points -->
	{#each spawns as s (s.id)}
		<!-- the hex hatched in the team's colour, the emblem washed over it -->
		<clipPath id="{P}sp{s.id}"><polygon points={hexPoints(s.c, S * 0.86)} /></clipPath>
		<g clip-path="url(#{P}sp{s.id})"><path d={hatchAt(s.c)} stroke="{WASHC[s.team]}.55)" stroke-width={S * 0.032} /></g>
		<path d={s.art.d} transform={s.tf} fill="{WASHC[s.team]}.72)" fill-rule="evenodd" />
		{#if s.brackets}<path d={s.brackets} fill="none" stroke={SEP} stroke-width={S * 0.06} stroke-linecap="round" stroke-linejoin="round" />{/if}
	{/each}

	<!-- the coast, the zones' borders -->
	<path d={coastInk[0]} fill="none" stroke={SEP} stroke-width={S * 0.09} stroke-linecap="round" />
	<path d={coastInk[1]} fill="none" stroke={SEP} stroke-width={S * 0.05} stroke-linecap="round" />
	<path d={borders} fill="none" stroke="rgba(59,38,20,.6)" stroke-width={S * 0.045} stroke-dasharray="{S * 0.06} {S * 0.12}" stroke-linecap="round" />

	<!-- boulders -->
	{#each rocks as r (r.id)}
		<path d={r.d} fill="rgba(120,110,95,.45)" />
		<g clip-path="url(#{P}rk{r.id})">
			<path d={r.d} fill="url(#{P}hatch)" />
			<ellipse cx={r.x - S * 0.15} cy={r.y - S * 0.12} rx={S * 0.42} ry={S * 0.34} fill="rgba(236,223,195,.75)" />
		</g>
		<path d={r.d} fill="none" stroke={SEP} stroke-width={S * 0.055} stroke-linejoin="round" />
		<path d={r.crack} fill="none" stroke={SEP} stroke-width={S * 0.03} stroke-linecap="round" stroke-linejoin="round" />
	{/each}

	<!-- hero spawn points: the tie-breaker coin, in ink and watercolour -->
	{#each coins as h (h.id)}
		<g transform={coinTf(h.c, rot)}>
			{#if h.coin === 'orange'}
				<circle cx={(hexHash(h.id, 901) - 0.5) * 10} cy={(hexHash(h.id, 902) - 0.5) * 10} r="106" fill="rgba(200,118,58,.2)" />
				<circle r="100" fill="hsl(24 62% 52% / .72)" stroke={SEP} stroke-width="6" />
				<circle r="82" fill="rgba(78,88,104,.62)" stroke={SEP} stroke-width="4" />
				<path d="M-64 -18A66 66 0 0 1 -18 -64" fill="none" stroke="rgba(236,223,195,.45)" stroke-width="5" stroke-linecap="round" />
				<path d={GEAR} fill="hsl(24 66% 55% / .92)" stroke={SEP} stroke-width="5" stroke-linejoin="round" />
				<circle r="41" fill="rgba(78,88,104,.75)" stroke={SEP} stroke-width="4" />
				<path d={SPOKES} stroke={SEP} stroke-width="13" stroke-linecap="round" />
				<path d={SPOKES} stroke="hsl(24 66% 57%)" stroke-width="7" stroke-linecap="round" />
				<circle r="11" fill="hsl(24 66% 57%)" stroke={SEP} stroke-width="4" />
				<path d="M-34 -30A44 44 0 0 1 -6 -48" fill="none" stroke="rgba(255,235,200,.5)" stroke-width="4" stroke-linecap="round" />
			{:else}
				<circle cx={(hexHash(h.id, 901) - 0.5) * 10} cy={(hexHash(h.id, 902) - 0.5) * 10} r="106" fill="rgba(60,130,200,.2)" />
				<circle r="100" fill="hsl(205 58% 55% / .72)" stroke={SEP} stroke-width="6" />
				<circle r="82" fill="rgba(150,72,52,.62)" stroke={SEP} stroke-width="4" />
				<path d={STONE_CRACKS} fill="none" stroke="rgba(59,38,20,.5)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
				<path d={STAR} fill="none" stroke={SEP} stroke-width="17" stroke-linejoin="round" />
				<path d={STAR} fill="none" stroke="hsl(205 62% 58%)" stroke-width="10" stroke-linejoin="round" />
				<path d={STAR} fill="none" stroke="rgba(230,245,255,.6)" stroke-width="2.4" stroke-linejoin="round" />
				{#each STUDS as p}<circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="8" fill="hsl(205 62% 58%)" stroke={SEP} stroke-width="3.4" /><circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3" fill="rgba(150,72,52,.9)" />{/each}
				<path d="M-64 -18A66 66 0 0 1 -18 -64" fill="none" stroke="rgba(236,223,195,.45)" stroke-width="5" stroke-linecap="round" />
			{/if}
		</g>
	{/each}
</g>
