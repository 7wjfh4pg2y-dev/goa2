<script lang="ts">
	// The map editor's drawing surface: one svg in board units (the same units the game draws in), with the trace image
	// under the hexes, the ground, the zones, what stands on each hex, the symmetry guide and the brush. It hit-tests by
	// coordinates (no per-hex events, so a 34 × 34 grid stays quick) and reports board points to the page; pan / zoom are
	// its own (wheel = zoom at the pointer, right / middle drag or Space = pan, two fingers = pinch).
	import { onMount } from 'svelte';
	import { hexCenter, hexCorner, borderPath, SQRT3, type Pt } from '$lib/board/hexgeo';
	import MinionDefs from '$lib/board/MinionDefs.svelte';
	import SpawnMark from '$lib/board/SpawnMark.svelte';
	import { SCATTER_BY_KEY } from '$lib/board/scatter';
	import { placeName } from '$lib/teams';
	import { GROUNDS, zonesOf, hexIds, idOf, pieces, traceTf, type Doc, type Trace, type SymMode } from '$lib/mapedit';

	export let doc: Doc;
	export let trace: Trace | null = null;
	export let traceSrc = '';
	export let traceOn = true;
	export let showZones = true;
	export let showGrid = true;
	export let showMarks = true;
	/** hexes to ring (a check's hexes) */
	export let highlight: string[] = [];
	/** the brush under the pointer, and its mirror */
	export let footprint: string[] = [];
	export let twinPrint: string[] = [];
	export let footColor = '#f4dfa8';
	export let centre: Pt | null = null;
	export let symMode: SymMode = 'none';
	export let calib: Array<{ x: number; y: number; label: string; img?: boolean }> = [];
	export let cursor = 'crosshair';
	export let panTool = false;
	export let onDown: (p: Pt, e: PointerEvent) => void = () => {};
	export let onMove: (p: Pt, e: PointerEvent) => void = () => {};
	export let onUp: (e: PointerEvent) => void = () => {};
	export let onLeave: () => void = () => {};

	let svg: SVGSVGElement;
	let W = 800, H = 600;
	let vx = 0, vy = 0, vw = 1000;
	$: vh = vw * (H / Math.max(1, W));
	$: S = doc.size;
	$: HW = S * SQRT3;

	const poly = (c: Pt, r: number) => {
		let d = '';
		for (let i = 0; i < 6; i++) { const p = hexCorner(c, r, i); d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
		return d + 'Z';
	};
	// the grid's frame
	$: frame = { x: -HW / 2 - S * 0.4, y: -S * 1.4, w: HW * (doc.cols + 0.5) + S * 0.8, h: 1.5 * S * (doc.rows - 1) + S * 2.8 };
	// empty hexes = one path
	$: gridPath = (() => {
		if (!showGrid) return '';
		let d = '';
		for (let r = 0; r < doc.rows; r++) for (let c = 0; c < doc.cols; c++) { const id = idOf(c, r); if (!doc.ground[id]) d += poly(hexCenter(id, S), S * 0.97); }
		return d;
	})();
	$: ids = hexIds(doc);
	// one path per ground
	$: groundPaths = GROUNDS.map((g) => ({ key: g.key, color: g.color, d: ids.filter((h) => doc.ground[h] === g.key && !isBare(h)).map((h) => poly(hexCenter(h, S), S)).join('') }));
	$: zoneDefs = zonesOf(doc);
	$: zonePaths = zoneDefs.map((z) => ({ key: z.key, color: z.color, d: ids.filter((h) => doc.zone[h] === z.key).map((h) => poly(hexCenter(h, S), S)).join('') }));
	$: zoneLines = showZones ? borderPath(ids, (h) => (doc.ground[h] ? doc.zone[h] ?? '' : undefined), S) : '';
	$: seams = borderPath(ids, (h) => (doc.ground[h] ? (isBare(h) ? '#' : doc.ground[h]) : undefined), S);
	// a dark rim round every hex, under the ground: what shows past the outer hexes is the coast
	$: coast = ids.map((h) => poly(hexCenter(h, S), S)).join('');
	$: labels = showZones
		? zoneDefs.flatMap((z) => pieces(ids.filter((h) => doc.zone[h] === z.key)).filter((p) => p.length >= 3).map((p, i) => {
			const cs = p.map((h) => hexCenter(h, S));
			const c = { x: cs.reduce((s, q) => s + q.x, 0) / cs.length, y: cs.reduce((s, q) => s + q.y, 0) / cs.length };
			return { key: `${z.key}${i}`, text: placeName(z.key), x: c.x, y: c.y, color: z.color };
		}))
		: [];
	// an obstacle stands on its ground; only one from a map that names none (Forgotten Island) keeps the stone tile
	const isBare = (h: string) => { const f = doc.feat[h]; return f?.kind === 'obstacle' && !!f.bare; };
	$: obstacles = ids.filter((h) => doc.feat[h]?.kind === 'obstacle').map((h) => {
		const f = doc.feat[h] as { scatter?: string };
		return { id: h, c: hexCenter(h, S), bare: !!(f as { bare?: boolean }).bare, dot: f.scatter ? SCATTER_BY_KEY[f.scatter]?.dot : null };
	});
	$: minions = ids.flatMap((h) => { const f = doc.feat[h]; return f?.kind === 'minion' ? [{ id: h, c: hexCenter(h, S), team: f.team, role: f.role, dir: f.dir }] : []; });
	$: heroes = ids.flatMap((h) => { const f = doc.feat[h]; return f?.kind === 'hero' ? [{ id: h, c: hexCenter(h, S), team: f.team }] : []; });
	$: hiPath = highlight.map((h) => poly(hexCenter(h, S), S * 0.9)).join('');
	$: footPath = footprint.map((h) => poly(hexCenter(h, S), S * 0.96)).join('');
	$: twinPath = twinPrint.map((h) => poly(hexCenter(h, S), S * 0.96)).join('');

	// a 12-tooth gear (the Atlanteans' throne mark) in a 60-unit hex
	const GEAR = (() => {
		let d = '';
		for (let i = 0; i < 24; i++) {
			const r = i % 2 ? 22 : 27, a0 = ((i - 0.38) / 24) * Math.PI * 2, a1 = ((i + 0.38) / 24) * Math.PI * 2;
			d += `${i ? 'L' : 'M'}${(r * Math.cos(a0)).toFixed(1)} ${(r * Math.sin(a0)).toFixed(1)}L${(r * Math.cos(a1)).toFixed(1)} ${(r * Math.sin(a1)).toFixed(1)}`;
		}
		return d + 'ZM9 0A9 9 0 1 0 -9 0A9 9 0 1 0 9 0Z';
	})();
	const PENTA = 'M0 -24L14 19.4L-22.8 -7.4L22.8 -7.4L-14 19.4Z';

	// ── view ──
	export function fit(hexList?: string[]) {
		let box = frame;
		if (hexList?.length) {
			const cs = hexList.map((h) => hexCenter(h, S));
			const xs = cs.map((c) => c.x), ys = cs.map((c) => c.y);
			const pad = S * 3;
			box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
		}
		const aspect = H / Math.max(1, W);
		vw = Math.max(box.w, box.h / aspect) * 1.04;
		vx = box.x + box.w / 2 - vw / 2;
		vy = box.y + box.h / 2 - (vw * aspect) / 2;
	}
	export function zoom(f: number, at?: Pt) {
		const p = at ?? { x: vx + vw / 2, y: vy + vh / 2 };
		const nw = Math.max(S * 4, Math.min(frame.w * 4, vw / f));
		vx = p.x - ((p.x - vx) * nw) / vw;
		vy = p.y - ((p.y - vy) * nw) / vw;
		vw = nw;
	}
	function toBoard(e: { clientX: number; clientY: number }): Pt {
		const r = svg.getBoundingClientRect();
		return { x: vx + ((e.clientX - r.left) / r.width) * vw, y: vy + ((e.clientY - r.top) / r.height) * vh };
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), toBoard(e));
		else { vx += (e.deltaX / W) * vw; }
	}
	let space = false;
	const touches = new Map<number, { x: number; y: number }>();
	let pan: { x: number; y: number; vx: number; vy: number } | null = null;
	let pinch: { d: number; vw: number; mid: Pt } | null = null;
	function down(e: PointerEvent) {
		svg.setPointerCapture(e.pointerId);
		if (e.pointerType === 'touch') {
			touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (touches.size === 2) {
				const [a, b] = [...touches.values()];
				pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vw, mid: toBoard({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
				onUp(e); // a second finger ends any stroke
				return;
			}
		}
		if (e.button === 1 || e.button === 2 || space || panTool) {
			pan = { x: e.clientX, y: e.clientY, vx, vy };
			return;
		}
		onDown(toBoard(e), e);
	}
	function move(e: PointerEvent) {
		if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
			touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pinch && touches.size === 2) {
				const [a, b] = [...touches.values()];
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				const nw = Math.max(S * 4, Math.min(frame.w * 4, pinch.vw * (pinch.d / Math.max(1, d))));
				const r = svg.getBoundingClientRect();
				const mx = ((a.x + b.x) / 2 - r.left) / r.width, my = ((a.y + b.y) / 2 - r.top) / r.height;
				vw = nw; vx = pinch.mid.x - mx * nw; vy = pinch.mid.y - my * nw * (H / Math.max(1, W));
				return;
			}
		}
		if (pan) {
			const r = svg.getBoundingClientRect();
			vx = pan.vx - ((e.clientX - pan.x) / r.width) * vw;
			vy = pan.vy - ((e.clientY - pan.y) / r.height) * vh;
			return;
		}
		onMove(toBoard(e), e);
	}
	function up(e: PointerEvent) {
		touches.delete(e.pointerId);
		if (touches.size < 2) pinch = null;
		if (pan) { pan = null; return; }
		onUp(e);
	}
	function key(e: KeyboardEvent, on: boolean) {
		if (e.code !== 'Space') return;
		const t = e.target as HTMLElement;
		if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
		space = on;
		if (on) e.preventDefault();
	}
	onMount(() => {
		svg.addEventListener('wheel', wheel, { passive: false });
		const ro = new ResizeObserver(() => { const r = svg.getBoundingClientRect(); const first = W === 800 && H === 600; W = r.width || 800; H = r.height || 600; if (first) fit(); });
		ro.observe(svg);
		const r = svg.getBoundingClientRect(); W = r.width || 800; H = r.height || 600; fit();
		return () => { ro.disconnect(); svg.removeEventListener('wheel', wheel); };
	});
	$: curs = pan ? 'grabbing' : space || panTool ? 'grab' : cursor;
</script>

<svelte:window on:keydown={(e) => key(e, true)} on:keyup={(e) => key(e, false)} on:blur={() => (space = false)} />

<svg bind:this={svg} class="ec" viewBox="{vx} {vy} {vw} {vh}" style:cursor={curs} role="application" aria-label="Map canvas"
	on:pointerdown={down} on:pointermove={move} on:pointerup={up} on:pointercancel={up} on:pointerleave={() => onLeave()} on:contextmenu|preventDefault>
	<defs><MinionDefs /></defs>
	<rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={S * 0.6} class="frame" />
	{#if trace && traceSrc && traceOn}
		<g transform={traceTf(trace)} opacity={trace.opacity} style="pointer-events:none">
			<image href={traceSrc} x="0" y="0" width={trace.w} height={trace.h} preserveAspectRatio="none" />
		</g>
	{/if}
	{#if gridPath}<path d={gridPath} class="grid" />{/if}
	<g class="land" opacity={trace && traceSrc && traceOn ? 0.82 : 1}>
		<path d={coast} class="coast" />
		{#each groundPaths as g (g.key)}{#if g.d}<path d={g.d} fill={g.color} />{/if}{/each}
		{#if obstacles.length}<path d={obstacles.filter((o) => o.bare).map((o) => poly(o.c, S)).join('')} fill="#2b2f37" />{/if}
		<path d={seams} class="seam" stroke-width={S * 0.05} />
	</g>
	{#if showZones}
		<g class="zones">
			{#each zonePaths as z (z.key)}{#if z.d}<path d={z.d} fill={z.color} fill-opacity=".34" />{/if}{/each}
			<path d={zoneLines} class="zline" stroke-width={S * 0.12} />
			<path d={zoneLines} class="zline2" stroke-width={S * 0.04} />
		</g>
	{/if}
	{#if showMarks}
		{#each obstacles as o (o.id)}
			<circle cx={o.c.x} cy={o.c.y} r={S * 0.56} fill="#545a66" stroke="#1a1d22" stroke-width={S * 0.05} />
			<circle cx={o.c.x - S * 0.12} cy={o.c.y - S * 0.14} r={S * 0.3} fill="#727a87" />
			{#if o.dot}<circle cx={o.c.x} cy={o.c.y} r={S * 0.3} fill={o.dot} stroke="#fff" stroke-width={S * 0.05} />{/if}
		{/each}
		{#each minions as m (m.id)}
			<SpawnMark c={m.c} size={S} team={m.team} role={m.role} dir={m.dir} active={doc.zone[m.id] === 'Center'} />
		{/each}
		{#each heroes as h (h.id)}
			<g transform="translate({h.c.x.toFixed(1)} {h.c.y.toFixed(1)}) scale({(S / 60).toFixed(3)})">
				<circle r="31" fill={h.team === 'orange' ? '#3a2a22' : '#5a1e22'} stroke={h.team === 'orange' ? '#ffb878' : '#9ccbff'} stroke-width="3" />
				{#if h.team === 'orange'}<path d={GEAR} fill="#e08a3a" fill-rule="evenodd" />{:else}<path d={PENTA} fill="none" stroke="#e8edf6" stroke-width="3.6" stroke-linejoin="round" />{/if}
			</g>
		{/each}
	{/if}
	{#each labels as l (l.key)}
		<text x={l.x} y={l.y} dy="0.35em" class="zlabel" font-size={S * 0.42} stroke-width={S * 0.12}>{l.text}</text>
	{/each}
	{#if centre && symMode !== 'none'}
		<g class="sym" style="pointer-events:none">
			{#if symMode === 'mirrorV'}<line x1={centre.x} y1={frame.y} x2={centre.x} y2={frame.y + frame.h} stroke-width={S * 0.06} />{/if}
			{#if symMode === 'mirrorH'}<line x1={frame.x} y1={centre.y} x2={frame.x + frame.w} y2={centre.y} stroke-width={S * 0.06} />{/if}
			{#if symMode === 'rotate'}
				<circle cx={centre.x} cy={centre.y} r={S * 0.5} fill="none" stroke-width={S * 0.06} />
				<path d="M{centre.x - S * 0.8} {centre.y}H{centre.x + S * 0.8}M{centre.x} {centre.y - S * 0.8}V{centre.y + S * 0.8}" stroke-width={S * 0.05} />
			{/if}
		</g>
	{/if}
	{#if hiPath}<path d={hiPath} class="hi" stroke-width={S * 0.14} />{/if}
	{#if twinPath}<path d={twinPath} class="foot twin" stroke-width={S * 0.07} />{/if}
	{#if footPath}<path d={footPath} class="foot" stroke={footColor} stroke-width={S * 0.08} />{/if}
	{#each calib as c, i (i)}
		<g class="cal" class:img={c.img} transform="translate({c.x} {c.y})">
			<circle r={S * 0.32} stroke-width={S * 0.06} />
			<path d="M{-S * 0.55} 0H{S * 0.55}M0 {-S * 0.55}V{S * 0.55}" stroke-width={S * 0.04} />
			<text y={-S * 0.5} font-size={S * 0.4} stroke-width={S * 0.1}>{c.label}</text>
		</g>
	{/each}
</svg>

<style>
	.ec { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; background: radial-gradient(circle at 50% 40%, #0d2c48, #051424 75%); }
	.frame { fill: rgba(255, 255, 255, 0.015); stroke: rgba(216, 179, 106, 0.25); stroke-width: 3; stroke-dasharray: 12 10; }
	.grid { fill: rgba(255, 255, 255, 0.025); stroke: rgba(160, 190, 215, 0.22); stroke-width: 1.4; }
	.coast { fill: none; stroke: rgba(4, 12, 22, 0.9); stroke-width: 9; stroke-linejoin: round; }
	.seam { fill: none; stroke: rgba(10, 14, 20, 0.45); }
	.zline { fill: none; stroke: rgba(3, 10, 18, 0.85); stroke-linecap: round; }
	.zline2 { fill: none; stroke: rgba(255, 244, 214, 0.9); stroke-linecap: round; }
	.zlabel { fill: #fff8e6; stroke: rgba(4, 12, 22, 0.85); paint-order: stroke; text-anchor: middle; font-family: inherit; letter-spacing: 0.04em; pointer-events: none; }
	.sym { stroke: #f4dfa8; stroke-dasharray: 10 8; fill: none; opacity: 0.85; }
	.hi { fill: rgba(229, 72, 77, 0.18); stroke: #ff6b6f; stroke-linejoin: round; pointer-events: none; }
	.foot { fill: rgba(244, 223, 168, 0.16); stroke-linejoin: round; pointer-events: none; }
	.foot.twin { stroke: #9ccbff; stroke-dasharray: 8 6; fill: rgba(156, 203, 255, 0.1); }
	.cal circle { fill: rgba(22, 163, 74, 0.25); stroke: #6ee7a0; }
	.cal path { stroke: #6ee7a0; }
	.cal.img circle { fill: rgba(244, 223, 168, 0.25); stroke: #f4dfa8; }
	.cal.img path { stroke: #f4dfa8; }
	.cal text { fill: #fff; stroke: #04101c; paint-order: stroke; text-anchor: middle; font-family: inherit; }
</style>
