<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// A reusable renderer for a painted hex map (the "3D" board). Supports
	// pan / zoom (in and out) / rotate as a purely local view transform, applied
	// as an SVG matrix so piece dragging stays accurate under any transform.
	export let map: {
		cells?: Record<string, string>;
		meta?: Record<string, { m: string; dir: number }>;
		grid?: { size?: number };
		name?: string;
	} = {};
	export let interactive = true;
	export let rotation = 0; // base orientation in degrees (e.g. 180 so your base sits at the bottom)

	export let pieces: Array<{ id: string; hex: string; team: string; role?: string; label?: string; color?: string }> = [];
	export let onMovePiece: ((id: string, hex: string) => void) | null = null;
	export let onRemovePiece: ((id: string) => void) | null = null;

	const SQRT3 = Math.sqrt(3);
	const tileSprites = import.meta.glob('./images/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const minionSprites = import.meta.glob('./images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;

	$: cells = map.cells ?? {};
	$: meta = map.meta ?? {};
	$: size = map.grid?.size ?? 60;

	const isSpawn = (t: string) => t === 'spawnOrange' || t === 'spawnBlue';
	const isThrone = (t: string) => t === 'baseOrangeSpawn' || t === 'baseBlueSpawn';
	const baseTileFor = (t: string) => (t === 'baseOrangeSpawn' ? 'baseOrange' : 'baseBlue');
	const ZONE_TYPES = ['forest', 'beach', 'middle', 'terrain', 'baseOrange', 'baseBlue'];
	const ODDR = [
		[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
		[[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
	];
	function zoneOf(id: string): string {
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
	const zoneTile = (z: string) => tileSprites[`./images/tiles/${z}.png`];
	function spriteFor(id: string, t: string): string | undefined {
		if (t === 'spawnOrange') return minionSprites[`./images/minions/orange_${meta[id]?.m ?? 'melee'}.png`];
		if (t === 'spawnBlue') return minionSprites[`./images/minions/blue_${meta[id]?.m ?? 'melee'}.png`];
		return tileSprites[`./images/tiles/${t}.png`];
	}
	function poly(cx: number, cy: number, sz: number) {
		const p = [];
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 90); p.push(`${(cx + sz * Math.cos(a)).toFixed(1)},${(cy + sz * Math.sin(a)).toFixed(1)}`); }
		return p.join(' ');
	}

	$: hexes = Object.keys(cells).map((id) => {
		const [c, r] = id.split('_').map(Number);
		return { id, t: cells[id], x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r };
	});
	// viewBox with generous padding so the whole board is visible (not flush) by default
	$: bounds = (() => {
		if (!hexes.length) return { a: 0, b: 0, w: 100, h: 100 };
		const xs = hexes.map((h) => h.x), ys = hexes.map((h) => h.y), pad = size * 2.6;
		const a = Math.min(...xs) - pad, b = Math.min(...ys) - pad;
		return { a, b, w: Math.max(...xs) + pad - a, h: Math.max(...ys) + pad - b };
	})();
	$: vb = `${bounds.a} ${bounds.b} ${bounds.w} ${bounds.h}`;
	$: cx = bounds.a + bounds.w / 2;
	$: cy = bounds.b + bounds.h / 2;

	// ---- local view transform (pan / zoom / rotate) ---------------------------
	let scale = 1, panX = 0, panY = 0, spin = 0;
	$: rotEff = rotation + spin;
	function baseM(): DOMMatrix {
		return new DOMMatrix().translateSelf(cx, cy).scaleSelf(scale).rotateSelf(rotEff).translateSelf(-cx, -cy);
	}
	$: viewTf = (() => {
		void scale; void panX; void panY; void rotEff; void cx; void cy;
		if (typeof DOMMatrix === 'undefined') return ''; // SSR safety
		const m = new DOMMatrix().translateSelf(panX, panY).multiplySelf(baseM());
		return `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
	})();

	let svgEl: SVGSVGElement;
	let viewG: SVGGElement;
	let wrapEl: HTMLDivElement;
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
	// client px → SVG user coords (root; independent of the view transform)
	function toUser(clientX: number, clientY: number) {
		const m = svgEl?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	}
	// client px → board (child) coords, honouring pan/zoom/rotate
	function toChild(clientX: number, clientY: number) {
		const m = viewG?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	}

	function zoomAt(nextScale: number, clientX: number, clientY: number) {
		const before = toChild(clientX, clientY); // board point under cursor
		scale = clamp(nextScale, 0.4, 8);
		const target = toUser(clientX, clientY); // fixed screen point in user coords
		const q = new DOMPoint(before.x, before.y).matrixTransform(baseM());
		panX = target.x - q.x; panY = target.y - q.y; // keep `before` under the cursor
	}
	export function zoomBtn(f: number) {
		const r = wrapEl?.getBoundingClientRect();
		if (!r) return;
		zoomAt(scale * f, r.left + r.width / 2, r.top + r.height / 2);
	}
	export function rotateBy(deg: number) { spin += deg; }
	export function reset() { scale = 1; panX = 0; panY = 0; spin = 0; }

	function onWheel(e: WheelEvent) {
		if (!interactive) return;
		e.preventDefault();
		zoomAt(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
	}
	// pan by dragging empty board
	let panning = false, p0 = { x: 0, y: 0 }, pan0 = { x: 0, y: 0 };
	function down(e: PointerEvent) {
		if (!interactive) return;
		panning = true; p0 = toUser(e.clientX, e.clientY); pan0 = { x: panX, y: panY };
		wrapEl.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!panning) return;
		const p = toUser(e.clientX, e.clientY);
		panX = pan0.x + (p.x - p0.x); panY = pan0.y + (p.y - p0.y);
	}
	function up(e: PointerEvent) { panning = false; try { wrapEl.releasePointerCapture(e.pointerId); } catch {} }

	onMount(() => { if (interactive) wrapEl?.addEventListener('wheel', onWheel, { passive: false }); });
	onDestroy(() => wrapEl?.removeEventListener('wheel', onWheel));

	// ---- pieces: drag to snap onto the nearest hex ----------------------------
	// A small movement threshold means a *click* on a token never nudges it — you
	// only move a piece by deliberately dragging it, so clicking/panning near a
	// token no longer grabs it by accident.
	const DRAG_THRESHOLD = 6; // client px
	let drag: { id: string; x: number; y: number } | null = null;
	let pend: { id: string; hex: string; sx: number; sy: number; moved: boolean } | null = null;
	function centerOf(id: string) {
		const [c, r] = id.split('_').map(Number);
		return { x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r };
	}
	function nearestHex(x: number, y: number): string | null {
		let best: string | null = null, bd = Infinity;
		for (const h of hexes) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h.id; } }
		return best;
	}
	const pieceColor = (t: string) => (t === 'orange' ? '#ea6a1e' : t === 'blue' ? '#2f79e6' : '#9aa4b2');
	function startDrag(e: PointerEvent, p: { id: string; hex: string }) {
		if (!onMovePiece || !interactive) return;
		e.stopPropagation(); e.preventDefault();
		pend = { id: p.id, hex: p.hex, sx: e.clientX, sy: e.clientY, moved: false };
		window.addEventListener('pointermove', onDragMove);
		window.addEventListener('pointerup', onDragEnd);
	}
	function onDragMove(e: PointerEvent) {
		if (!pend) return;
		if (!pend.moved) {
			if (Math.hypot(e.clientX - pend.sx, e.clientY - pend.sy) < DRAG_THRESHOLD) return;
			pend.moved = true; // crossed the threshold → this is a real drag
		}
		const pt = toChild(e.clientX, e.clientY);
		drag = { id: pend.id, x: pt.x, y: pt.y };
	}
	function onDragEnd(e: PointerEvent) {
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', onDragEnd);
		const moved = pend?.moved, id = pend?.id;
		pend = null;
		drag = null;
		if (!moved || !id) return; // it was a click, not a drag — leave the piece put
		const pt = toChild(e.clientX, e.clientY);
		const hex = nearestHex(pt.x, pt.y);
		if (!hex) return;
		const c = centerOf(hex);
		const off = Math.hypot(c.x - pt.x, c.y - pt.y) > size * 1.3;
		if (off && onRemovePiece) onRemovePiece(id);
		else if (onMovePiece) onMovePiece(id, hex);
	}
	const minionHref = (team: string, role?: string) =>
		minionSprites[`./images/minions/${team === 'blue' ? 'blue' : 'orange'}_${role ?? 'melee'}.png`];
</script>

<div
	class="board-wrap"
	class:interactive
	bind:this={wrapEl}
	on:pointerdown={down}
	on:pointermove={move}
	on:pointerup={up}
	on:pointercancel={up}
	role="img"
	aria-label={map.name ? `Game board: ${map.name}` : 'Game board'}
>
	<svg viewBox={vb} preserveAspectRatio="xMidYMid meet" bind:this={svgEl}>
		<g bind:this={viewG} transform={viewTf}>
			{#each hexes as h (h.id)}
				{#if isSpawn(h.t) || isThrone(h.t)}
					<image href={zoneTile(isSpawn(h.t) ? zoneOf(h.id) : baseTileFor(h.t))} x={h.x - SQRT3 * size * 0.53} y={h.y - size * 1.06}
						width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none" />
					<image href={spriteFor(h.id, h.t)} x={h.x - SQRT3 * size * 1.06 * 0.36} y={h.y - SQRT3 * size * 1.06 * 0.36}
						width={SQRT3 * size * 1.06 * 0.72} height={SQRT3 * size * 1.06 * 0.72} preserveAspectRatio="xMidYMid meet"
						transform={isSpawn(h.t) && meta[h.id]?.dir ? `rotate(${meta[h.id].dir * 60} ${h.x} ${h.y})` : undefined} />
				{:else}
					<image href={spriteFor(h.id, h.t)} x={h.x - SQRT3 * size * 0.53} y={h.y - size * 1.06}
						width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none" />
				{/if}
				<polygon points={poly(h.x, h.y, size)} fill="none" stroke="rgba(6,10,18,.7)" stroke-width="4" stroke-linejoin="round" />
			{/each}

			{#each pieces as p (p.id)}
				{@const c = drag && drag.id === p.id ? { x: drag.x, y: drag.y } : centerOf(p.hex)}
				<g class="piece" class:draggable={!!onMovePiece} class:dragging={drag?.id === p.id}
					role="button" tabindex="-1"
					aria-label={p.role ? `${p.team} ${p.role} minion` : `${p.team} ${p.label ?? 'piece'}`}
					transform={rotEff ? `rotate(${-rotEff} ${c.x} ${c.y})` : undefined}
					on:pointerdown={(e) => startDrag(e, p)}
				>
					{#if p.role}
						<circle cx={c.x} cy={c.y} r={size * 0.66} fill="#e2e8f0" stroke={pieceColor(p.team)} stroke-width={size * 0.14} />
						<image href={minionHref(p.team, p.role)} x={c.x - size * 0.62} y={c.y - size * 0.62} width={size * 1.24} height={size * 1.24} preserveAspectRatio="xMidYMid meet" />
					{:else}
						<circle cx={c.x} cy={c.y} r={size * 0.62} fill={p.color ?? pieceColor(p.team)} stroke={pieceColor(p.team)} stroke-width={size * 0.16} />
						{#if p.label}
							<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.72} font-weight="800" fill="#0b1220" stroke="rgba(255,255,255,.6)" stroke-width={size * 0.02}>{p.label}</text>
						{/if}
					{/if}
				</g>
			{/each}
		</g>
	</svg>
	<slot />
</div>

<style>
	.board-wrap { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
	.board-wrap.interactive { cursor: grab; }
	.board-wrap.interactive:active { cursor: grabbing; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.piece.draggable { cursor: grab; }
	.piece.dragging { cursor: grabbing; }
	.piece.dragging circle { filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5)); }
</style>
