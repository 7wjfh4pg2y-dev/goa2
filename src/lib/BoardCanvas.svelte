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

	export let pieces: Array<{ id: string; hex: string; team: string; role?: string; label?: string; color?: string; token?: string; sym?: string }> = [];
	export let onMovePiece: ((id: string, hex: string) => void) | null = null;
	export let onSelect: (id: string | null) => void = () => {};
	// hexes that hold a team's throne (gear/star) — drawn on top of the base tile
	export let thrones: Array<{ hex: string; team: string }> = [];

	const SQRT3 = Math.sqrt(3);
	const tileSprites = import.meta.glob('./images/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const minionSprites = import.meta.glob('./images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const minionTokens = import.meta.glob('./images/minion_tokens/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const minionToken = (team: string, role?: string) =>
		minionTokens[`./images/minion_tokens/${team === 'blue' ? 'blue' : 'orange'}_${role ?? 'melee'}.png`];
	const tokenArt = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const tokenImg = (name?: string) => (name ? tokenArt[`./cards/images/${name}.png`] : undefined);

	$: cells = map.cells ?? {};
	$: meta = map.meta ?? {};
	$: size = map.grid?.size ?? 60;
	$: throneAt = Object.fromEntries(thrones.map((t) => [t.hex, t.team]));
	const throneTile = (team: string) => tileSprites[`./images/tiles/${team === 'orange' ? 'baseOrangeSpawn' : 'baseBlueSpawn'}.png`];

	// each team's minion facing = the direction its spawn hexes point on the map
	// (dominant meta.dir among that team's spawn cells). Minions — including ones
	// spawned from the HUD — always face this way, matching the spawn points.
	$: teamSpawnDir = (() => {
		const acc: Record<string, Record<number, number>> = { orange: {}, blue: {} };
		for (const id in cells) {
			const team = cells[id] === 'spawnOrange' ? 'orange' : cells[id] === 'spawnBlue' ? 'blue' : null;
			if (!team) continue;
			const d = meta[id]?.dir ?? 0;
			acc[team][d] = (acc[team][d] ?? 0) + 1;
		}
		const dom = (o: Record<number, number>) => { let bd = 0, bc = -1; for (const k in o) if (o[k] > bc) { bc = o[k]; bd = +k; } return bd; };
		return { orange: dom(acc.orange), blue: dom(acc.blue) } as Record<string, number>;
	})();
	// board-space rotation for a minion so it matches its team's spawn tiles.
	// (rotEff undoes the piece group's counter-rotation, keeping it map-relative.)
	function minionRot(p: { team: string; role?: string }, cx: number, cy: number): string | undefined {
		if (!p.role) return undefined;
		const deg = rotEff + (teamSpawnDir[p.team] ?? 0) * 60;
		return deg ? `rotate(${deg} ${cx} ${cy})` : undefined;
	}

	// fan out pieces that share a hex so each stays individually grabbable
	$: pieceOffset = (() => {
		const groups: Record<string, string[]> = {};
		for (const p of pieces) (groups[p.hex] ??= []).push(p.id);
		const off: Record<string, { x: number; y: number }> = {};
		for (const hex in groups) {
			const ids = groups[hex], n = ids.length;
			ids.forEach((id, i) => {
				if (n === 1) { off[id] = { x: 0, y: 0 }; return; }
				const ang = (i / n) * Math.PI * 2 - Math.PI / 2, rad = size * (n > 4 ? 0.5 : 0.4);
				off[id] = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
			});
		}
		return off;
	})();

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

	// Keep the board from being panned off-screen: allow the overflow created by
	// zoom, plus a fixed slice of wiggle room, but never enough to lose the board.
	function clampPan() {
		const margin = 0.28; // fraction of the board size you may pan past the edge
		const mx = Math.max(0, (bounds.w * scale - bounds.w) / 2) + bounds.w * margin;
		const my = Math.max(0, (bounds.h * scale - bounds.h) / 2) + bounds.h * margin;
		panX = clamp(panX, -mx, mx);
		panY = clamp(panY, -my, my);
	}
	function zoomAt(nextScale: number, clientX: number, clientY: number) {
		const before = toChild(clientX, clientY); // board point under cursor
		scale = clamp(nextScale, 0.4, 8);
		const target = toUser(clientX, clientY); // fixed screen point in user coords
		const q = new DOMPoint(before.x, before.y).matrixTransform(baseM());
		panX = target.x - q.x; panY = target.y - q.y; // keep `before` under the cursor
		clampPan();
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
		// Figma/Maps convention: pinch (trackpad) or ctrl/⌘+wheel = zoom;
		// plain two-finger swipe / wheel = pan.
		if (e.ctrlKey || e.metaKey) {
			zoomAt(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
		} else {
			const m = svgEl?.getScreenCTM();
			if (!m) return;
			panX -= e.deltaX / m.a;
			panY -= e.deltaY / m.d;
			clampPan();
		}
	}
	// ---- pan / move-piece interaction -----------------------------------------
	// Only the visible disc of a token is clickable (sprite images are pointer
	// transparent), so panning works everywhere else. Press an empty spot and
	// drag → pan. Press a token and drag → carry it (click-hold-drag). Tap a
	// token → pick it up (highlight); tap a hex → drop it there (click-to-move);
	// tap it again → put it down.
	const DRAG_THRESHOLD = 6; // client px; below this a pointerup counts as a tap
	let panning = false, moved = false, p0 = { x: 0, y: 0 }, pan0 = { x: 0, y: 0 }, downC = { x: 0, y: 0 };
	let pressId: string | null = null; // token pressed at gesture start, if any
	let dragId: string | null = null;  // token currently being carried
	let dragPt = { x: 0, y: 0 };
	let selected: string | null = null; // token picked up via tap (click-to-move)
	let lastSel: string | null | undefined = undefined;
	$: if (selected !== lastSel) { lastSel = selected; onSelect(selected); }
	// ---- two-finger pinch-to-zoom (touch) ----
	const activePointers = new Map<number, { x: number; y: number }>();
	let pinch: { dist: number; scale0: number } | null = null;
	const twoDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
	function down(e: PointerEvent) {
		if (!interactive) return;
		e.preventDefault(); // stop native text/element selection + image drag
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		try { wrapEl.setPointerCapture(e.pointerId); } catch {}
		if (activePointers.size >= 2) {
			// second finger down → start a pinch, cancel any pan/drag in progress
			const [a, b] = [...activePointers.values()];
			pinch = { dist: twoDist(a, b) || 1, scale0: scale };
			panning = false; moved = true; dragId = null; pressId = null;
			return;
		}
		// derive the pressed token fresh from the hit target — never a stale id
		const el = (e.target as Element)?.closest?.('[data-piece]');
		pressId = onMovePiece && el ? el.getAttribute('data-piece') : null;
		panning = true; moved = false; dragId = null;
		p0 = toUser(e.clientX, e.clientY); pan0 = { x: panX, y: panY };
		downC = { x: e.clientX, y: e.clientY };
	}
	function move(e: PointerEvent) {
		if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		// pinch: zoom around the midpoint of the two fingers
		if (pinch && activePointers.size >= 2) {
			const [a, b] = [...activePointers.values()];
			zoomAt(pinch.scale0 * (twoDist(a, b) / pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
			return;
		}
		if (!panning && !dragId) return;
		if (!moved) {
			if (Math.hypot(e.clientX - downC.x, e.clientY - downC.y) < DRAG_THRESHOLD) return;
			moved = true;
			if (pressId && onMovePiece) { dragId = pressId; panning = false; } // grab the token
		}
		if (dragId) {
			const pt = toChild(e.clientX, e.clientY);
			dragPt = { x: pt.x, y: pt.y };
		} else if (panning) {
			const p = toUser(e.clientX, e.clientY);
			panX = pan0.x + (p.x - p0.x); panY = pan0.y + (p.y - p0.y);
			clampPan();
		}
	}
	function up(e: PointerEvent) {
		try { wrapEl.releasePointerCapture(e.pointerId); } catch {}
		activePointers.delete(e.pointerId);
		if (pinch) { // finishing (or stepping out of) a pinch — don't treat as pan/tap
			if (activePointers.size < 2) pinch = null;
			panning = false; pressId = null; moved = false;
			return;
		}
		if (dragId) { // dropped a carried token
			const pt = toChild(e.clientX, e.clientY);
			const hex = nearestHex(pt.x, pt.y);
			if (hex && onMovePiece) onMovePiece(dragId, hex);
			dragId = null; selected = null;
		} else if (!moved) {
			handleTap(e);
		}
		panning = false; pressId = null;
	}
	function handleTap(e: PointerEvent) {
		if (!interactive || !onMovePiece) return;
		if (pressId != null) { selected = selected === pressId ? null : pressId; return; } // pick up / put down
		if (selected != null) { // tapped a hex with a token in hand → move it
			const pt = toChild(e.clientX, e.clientY);
			const hex = nearestHex(pt.x, pt.y);
			if (hex) onMovePiece(selected, hex);
			selected = null;
		}
	}

	onMount(() => { if (interactive) wrapEl?.addEventListener('wheel', onWheel, { passive: false }); });
	onDestroy(() => wrapEl?.removeEventListener('wheel', onWheel));

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
					{#if throneAt[h.id]}
						<image href={throneTile(throneAt[h.id])} x={h.x - SQRT3 * size * 0.53} y={h.y - size * 1.06}
							width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none" pointer-events="none" />
					{/if}
				{/if}
				<polygon points={poly(h.x, h.y, size)} fill="none" stroke="rgba(6,10,18,.7)" stroke-width="4" stroke-linejoin="round" />
			{/each}

			{#each pieces as p (p.id)}
				{@const carry = dragId === p.id}
				{@const base = centerOf(p.hex)}
				{@const off = pieceOffset[p.id] ?? { x: 0, y: 0 }}
				{@const c = carry ? dragPt : { x: base.x + off.x, y: base.y + off.y }}
				{@const sel = selected === p.id || carry}
				<g class="piece" class:selectable={!!onMovePiece} class:selected={sel} class:carry
					role="button" tabindex="-1" data-piece={p.id}
					aria-label={p.role ? `${p.team} ${p.role} minion` : `${p.team} ${p.label ?? 'piece'}`}
					transform={rotEff ? `rotate(${-rotEff} ${c.x} ${c.y})` : undefined}
				>
					{#if sel}
						<circle class="selring" cx={c.x} cy={c.y} r={size * 0.82} fill="none" stroke="#fde047" stroke-width={size * 0.1} stroke-dasharray="{size * 0.32} {size * 0.22}" pointer-events="none" />
					{/if}
					{#if p.token}
						<circle cx={c.x} cy={c.y} r={size * 0.6} fill="rgba(9,13,22,.82)" stroke={sel ? '#fde047' : pieceColor(p.team)} stroke-width={size * 0.12} />
						{#if tokenImg(p.token) ?? p.sym}
							<image href={tokenImg(p.token) ?? p.sym} x={c.x - size * 0.5} y={c.y - size * 0.5} width={size} height={size} preserveAspectRatio="xMidYMid meet" pointer-events="none" />
						{:else if p.label}
							<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.6} font-weight="800" fill="#f6ead2" pointer-events="none">{p.label[0]}</text>
						{/if}
					{:else if p.role}
						<image href={minionToken(p.team, p.role)} x={c.x - size * 0.7} y={c.y - size * 0.7} width={size * 1.4} height={size * 1.4} preserveAspectRatio="xMidYMid meet" pointer-events="none"
							transform={minionRot(p, c.x, c.y)} />
						<circle cx={c.x} cy={c.y} r={size * 0.66} fill="transparent" stroke={sel ? '#fde047' : pieceColor(p.team)} stroke-width={size * 0.14} />
					{:else}
						<!-- hero token: team-colour disc, hero symbol, player-colour outline -->
						<circle cx={c.x} cy={c.y} r={size * 0.62} fill={pieceColor(p.team)} stroke={sel ? '#fde047' : (p.color ?? pieceColor(p.team))} stroke-width={size * 0.16} />
						{#if p.sym}
							<image href={p.sym} x={c.x - size * 0.46} y={c.y - size * 0.46} width={size * 0.92} height={size * 0.92} preserveAspectRatio="xMidYMid meet" pointer-events="none" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))" />
						{:else if p.label}
							<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.72} font-weight="800" fill="#0b1220" stroke="rgba(255,255,255,.6)" stroke-width={size * 0.02} pointer-events="none">{p.label}</text>
						{/if}
					{/if}
				</g>
			{/each}
		</g>
	</svg>
	<slot />
</div>

<style>
	.board-wrap { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
	.board-wrap :global(image) { -webkit-user-drag: none; user-select: none; }
	.board-wrap.interactive { cursor: grab; }
	.board-wrap.interactive:active { cursor: grabbing; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.piece.selectable { cursor: pointer; }
	.piece.carry { cursor: grabbing; }
	.piece.selected circle { filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6)); }
	.selring { animation: spin 8s linear infinite; transform-box: fill-box; transform-origin: center; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
