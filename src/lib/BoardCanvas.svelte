<script lang="ts">
	import { portraitRect } from '$lib/heroes';
	import { onMount, onDestroy } from 'svelte';
	import Ocean from '$lib/board/Ocean.svelte';
	import IslandLayer from '$lib/board/IslandLayer.svelte';
	import { outlineLoops, loopsPath } from '$lib/board/hexgeo';
	import { zoneTable } from '$lib/zones';

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

	export let pieces: Array<{ id: string; hex: string; team: string; role?: string; label?: string; color?: string; token?: string; sym?: string; hero?: string; letter?: string;
		attachTo?: string; mine?: 'down' | 'up'; peek?: string; immune?: boolean; locked?: boolean; name?: string; nameColor?: string }> = [];
	// holding something to place (minion / token): every tap reports its hex, pieces
	// aren't picked up, and a hex with a hero on it is still a valid target
	export let placing = false;
	// temporary area-effect radii: every hex within r of a hero, in that player's colour
	export let areas: Array<{ hex: string; r: number; color: string }> = [];
	// something being placed from outside (minion spawn / shelf token), drawn as the ghost
	export let placeGhost: (typeof pieces)[number] | null = null;
	// the highlight colour for the hex under a held object (the viewer's chosen colour)
	export let holdColor = '#fde047';
	// placing, but released off the board → put it back (cancel)
	export let onCancelPlace: (() => void) | null = null;
	export let onMovePiece: ((id: string, hex: string) => void) | null = null;
	export let onSelect: (id: string | null) => void = () => {};
	// tap on an empty hex (no piece under the cursor, nothing carried) — used by
	// placement modes such as spawning a minion where you click.
	export let onHex: ((hex: string) => void) | null = null;
	// pings: rings on a hex in the pinger's colour. Alt+click (desktop) or a long press (touch)
	// pings straight away; with `pingArmed` the next tap pings (off the board = cancel)
	export let pings: Array<{ id: string; hex: string; color: string }> = [];
	export let onPing: ((hex: string | null) => void) | null = null;
	export let pingArmed = false;
	// hexes that hold a team's throne (gear/star) — drawn on top of the base tile
	export let thrones: Array<{ hex: string; team: string }> = [];
	// 'classic' = the flat tiles; 'island' = the island drawn from the map data, in a moving sea
	export let look: 'classic' | 'island' = 'classic';
	// island look: the zone (zones.ts name, e.g. 'Center') to light up as the battle zone
	export let glowZone: string | null = null;
	// island look: a still sea (no animation)
	export let seaStill = false;

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
	// (rotEff undoes the piece group's counter-rotation, keeping it map-relative,
	// so minions TURN WITH THE MAP.) rot/dirs are passed in from the template so
	// Svelte re-renders when the view rotates — reading them inside the function
	// isn't tracked, which left minions frozen on screen while the board turned.
	function minionRot(p: { team: string; role?: string }, cx: number, cy: number, rot: number, dirs: Record<string, number>): string | undefined {
		if (!p.role) return undefined;
		const deg = rot + (dirs[p.team] ?? 0) * 60;
		return deg ? `rotate(${deg} ${cx} ${cy})` : undefined;
	}

	// fan out pieces that share a hex so each stays individually grabbable
	$: pieceOffset = (() => {
		const groups: Record<string, string[]> = {};
		for (const p of pieces) if (!p.attachTo) (groups[p.hex] ??= []).push(p.id);
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
	$: viewM = (() => {
		void scale; void panX; void panY; void rotEff; void cx; void cy;
		if (typeof DOMMatrix === 'undefined') return null; // SSR safety
		const m = new DOMMatrix().translateSelf(panX, panY).multiplySelf(baseM());
		return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
	})();
	$: viewTf = viewM ? `matrix(${viewM.a},${viewM.b},${viewM.c},${viewM.d},${viewM.e},${viewM.f})` : '';
	// island look: the coastline (shared by the sea and the land) and every hex's zone name
	$: coast = look === 'island' ? loopsPath(outlineLoops(Object.keys(cells), size), 0.9) : '';
	$: zoneNames = look === 'island' ? zoneTable(map as Parameters<typeof zoneTable>[0]) : {};
	// The island is thousands of shapes, so it lives in its OWN svg and the view is applied to
	// that element as a CSS transform: panning / zooming slides one finished layer about on the
	// GPU instead of re-processing every shape (measured: 4–5× slower the other way). The same
	// matrix as `viewTf`, re-expressed in css px ("xMidYMid meet": px = s·user + o).
	let wrapW = 0, wrapH = 0;
	$: landTf = (() => {
		if (!viewM || !wrapW || !wrapH) return '';
		const s = Math.min(wrapW / bounds.w, wrapH / bounds.h);
		const ox = (wrapW - s * bounds.w) / 2 - s * bounds.a, oy = (wrapH - s * bounds.h) / 2 - s * bounds.b;
		const { a, b, c, d, e, f } = viewM;
		return `matrix(${a},${b},${c},${d},${s * e + ox - (a * ox + c * oy)},${s * f + oy - (b * ox + d * oy)})`;
	})();
	// while the view is moving the layer is only slid about (it may soften when zoomed in);
	// a moment after it settles the browser redraws it crisp at the new size
	let moving = false;
	let movingT: ReturnType<typeof setTimeout> | null = null;
	function viewMoved() { moving = true; if (movingT) clearTimeout(movingT); movingT = setTimeout(() => (moving = false), 240); }
	$: if (viewM && look === 'island') viewMoved();

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
	// saved views: rotation (relative to your team's orientation), zoom and pan
	type BoardView = { spin: number; scale: number; panX: number; panY: number };
	/** Put down whatever is picked up (tap-to-move hold / carry). */
	export function release() { selected = null; dragId = null; hoverHex = null; }
	/** Where a piece sits on screen (client px), for anchoring UI next to it. */
	export function clientPos(id: string): { x: number; y: number; r: number } | null {
		const p = pieces.find((q) => q.id === id);
		const m = viewG?.getScreenCTM();
		if (!p || !m) return null;
		const c = centerOf(p.hex);
		const pt = new DOMPoint(c.x, c.y).matrixTransform(m);
		return { x: pt.x, y: pt.y, r: size * 0.8 * Math.hypot(m.a, m.b) };
	}
	export function getView(): BoardView { return { spin: ((spin % 360) + 360) % 360, scale, panX, panY }; }
	export function setView(v: BoardView) { spin = v.spin; scale = clamp(v.scale, 0.4, 8); panX = v.panX; panY = v.panY; clampPan(); }

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
	type Piece = (typeof pieces)[number];
	// while holding something: where the pointer is, and the (on-board) hex under it
	let hoverPt = { x: 0, y: 0 };
	let hoverHex: string | null = null;
	// a locked piece (an immune heavy minion) can be selected but never carried
	const isLocked = (id: string | null) => !!id && !!pieces.find((q) => q.id === id)?.locked;
	$: carryId = dragId ?? (selected && !pieces.find((q) => q.id === selected)?.locked ? selected : null);
	$: ghostPiece = placing ? placeGhost : carryId ? pieces.find((q) => q.id === carryId) ?? null : null;
	$: if (!ghostPiece) hoverHex = null;
	function trackHover(clientX: number, clientY: number) {
		const pt = toChild(clientX, clientY);
		hoverPt = { x: pt.x, y: pt.y };
		hoverHex = hexAt(pt.x, pt.y);
	}
	let selected: string | null = null; // token picked up via tap (click-to-move)
	let lastSel: string | null | undefined = undefined;
	$: if (selected !== lastSel) { lastSel = selected; onSelect(selected); }
	// ---- two-finger pinch-to-zoom (touch) ----
	const activePointers = new Map<number, { x: number; y: number }>();
	let pinch: { dist: number; scale0: number } | null = null;
	const twoDist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
	let lpTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressed = false;
	const clearLongPress = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
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
		// Alt+click: ping that hex (no pan, no pick-up)
		if (e.altKey && onPing) {
			const pt = toChild(e.clientX, e.clientY);
			const hex = hexAt(pt.x, pt.y);
			if (hex) onPing(hex);
			activePointers.delete(e.pointerId);
			return;
		}
		// touch: a long press pings the hex under the finger
		clearLongPress();
		if (e.pointerType !== 'mouse' && onPing) {
			const cx = e.clientX, cy = e.clientY;
			lpTimer = setTimeout(() => {
				lpTimer = null;
				if (moved || pinch || activePointers.size !== 1) return;
				const pt = toChild(cx, cy);
				const hex = hexAt(pt.x, pt.y);
				if (hex) { longPressed = true; panning = false; pressId = null; onPing?.(hex); }
			}, 550);
		}
		// derive the pressed token fresh from the hit target — never a stale id
		const el = (e.target as Element)?.closest?.('[data-piece]');
		pressId = onMovePiece && el && !placing ? el.getAttribute('data-piece') : null;
		panning = true; moved = false; dragId = null;
		p0 = toUser(e.clientX, e.clientY); pan0 = { x: panX, y: panY };
		downC = { x: e.clientX, y: e.clientY };
	}
	// mouse hover over a piece: its name floats above it
	let hoverName: { text: string; color: string; x: number; y: number } | null = null;
	function trackName(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || dragId || placing) { hoverName = null; return; }
		const id = (e.target as Element)?.closest?.('[data-piece]')?.getAttribute('data-piece');
		const p = id && id !== selected ? pieces.find((q) => q.id === id) : null;
		const pos = p?.name ? clientPos(p.id) : null;
		if (!p?.name || !pos) { hoverName = null; return; }
		const r = wrapEl.getBoundingClientRect();
		hoverName = { text: p.name, color: p.nameColor ?? '#f1f5f9', x: pos.x - r.left, y: pos.y - pos.r - r.top };
	}
	function move(e: PointerEvent) {
		trackName(e);
		if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		// pinch: zoom around the midpoint of the two fingers
		if (pinch && activePointers.size >= 2) {
			const [a, b] = [...activePointers.values()];
			zoomAt(pinch.scale0 * (twoDist(a, b) / pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
			return;
		}
		if (dragId || selected || placing) trackHover(e.clientX, e.clientY);
		if (!panning && !dragId) return;
		if (!moved) {
			if (Math.hypot(e.clientX - downC.x, e.clientY - downC.y) < DRAG_THRESHOLD) return;
			moved = true;
			clearLongPress();
			if (pressId && onMovePiece && !isLocked(pressId)) { dragId = pressId; panning = false; } // grab the token
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
		clearLongPress();
		if (longPressed) { longPressed = false; panning = false; pressId = null; moved = false; return; } // that press was a ping
		if (pinch) { // finishing (or stepping out of) a pinch — don't treat as pan/tap
			if (activePointers.size < 2) pinch = null;
			panning = false; pressId = null; moved = false;
			return;
		}
		if (dragId) { // dropped a carried piece: onto a real hex, or back where it came from
			const pt = toChild(e.clientX, e.clientY);
			const hex = hexAt(pt.x, pt.y);
			const from = pieces.find((q) => q.id === dragId)?.hex;
			if (hex && hex !== from && onMovePiece) onMovePiece(dragId, hex);
			dragId = null; selected = null;
		} else if (!moved) {
			handleTap(e);
		}
		panning = false; pressId = null;
	}
	$: if (placing) selected = null;
	function handleTap(e: PointerEvent) {
		if (!interactive) return;
		if (pingArmed && onPing) { // ping mode: this tap pings (off the board = cancel)
			const pt = toChild(e.clientX, e.clientY);
			onPing(hexAt(pt.x, pt.y));
			return;
		}
		if (placing) { // drop what's held on the hex under the pointer; off the board → put it back
			const pt = toChild(e.clientX, e.clientY);
			const hex = hexAt(pt.x, pt.y);
			if (hex) onHex?.(hex); else onCancelPlace?.();
			return;
		}
		if (selected != null && onMovePiece && pressId !== selected) { // holding a piece → drop it where tapped
			const pt = toChild(e.clientX, e.clientY);
			const hex = hexAt(pt.x, pt.y);
			const from = pieces.find((q) => q.id === selected)?.hex;
			if (hex && hex !== from && !isLocked(selected)) onMovePiece(selected, hex); // off the board → stays where it was
			selected = null;
			return;
		}
		if (pressId != null && onMovePiece) { // pick up / put down
			selected = selected === pressId ? null : pressId;
			if (selected) trackHover(e.clientX, e.clientY);
			return;
		}
		// empty-hex tap → report which hex (placement modes)
		if (onHex && pressId == null) {
			const pt = toChild(e.clientX, e.clientY);
			const hex = hexAt(pt.x, pt.y);
			if (hex) onHex(hex);
		}
	}

	onMount(() => { if (interactive) wrapEl?.addEventListener('wheel', onWheel, { passive: false }); });
	// Esc puts a picked-up piece back down
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && (selected || dragId)) release(); }
	onDestroy(() => { wrapEl?.removeEventListener('wheel', onWheel); clearLongPress(); if (movingT) clearTimeout(movingT); });

	function centerOf(id: string) {
		const [c, r] = id.split('_').map(Number);
		return { x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r };
	}
	// the hex actually under a point — null when the point is off the board
	function hexAt(x: number, y: number): string | null {
		const h = nearestHex(x, y);
		if (!h) return null;
		const c = centerOf(h);
		return (c.x - x) ** 2 + (c.y - y) ** 2 <= (size * 0.95) ** 2 ? h : null;
	}
	function nearestHex(x: number, y: number): string | null {
		let best: string | null = null, bd = Infinity;
		for (const h of hexes) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h.id; } }
		return best;
	}
	// where a piece is drawn right now (follows the pointer while carried)
	$: posOf = (id: string, hex: string) => {
		if (dragId === id) return dragPt;
		const b = centerOf(hex), o = pieceOffset[id] ?? { x: 0, y: 0 };
		return { x: b.x + o.x, y: b.y + o.y };
	};
	// markers riding on a hero: small badges round its upper-right rim
	$: attached = pieces.filter((p) => p.attachTo);
	$: badgeIdx = (() => { const n: Record<string, number> = {}; const out: Record<string, number> = {}; for (const p of attached) { out[p.id] = n[p.attachTo!] = (n[p.attachTo!] ?? -1) + 1; } return out; })();
	// ── area radius overlay: hex distance on the odd-row offset grid ("c_r") ──
	const toCube = (id: string) => { const [c, r] = id.split('_').map(Number); const x = c - (r - (r & 1)) / 2; return { x, z: r, y: -x - r }; };
	const hexDist = (a: string, b: string) => { const p = toCube(a), q = toCube(b); return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z)); };
	// neighbour offsets (axial dq, dr) by the screen angle their shared edge faces
	const DIRS: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 60], [-1, 1, 120], [-1, 0, 180], [0, -1, 240], [1, -1, 300]];
	const axialId = (q: number, r: number) => `${q + (r - (r & 1)) / 2}_${r}`;
	$: areaShapes = areas.map((a) => {
		const inside = new Set(hexes.filter((h) => hexDist(h.id, a.hex) <= a.r).map((h) => h.id));
		const edges: string[] = [];
		for (const id of inside) {
			const { x: q, z: r } = toCube(id); const c = centerOf(id);
			for (const [dq, dr, ang] of DIRS) {
				if (inside.has(axialId(q + dq, r + dr))) continue;
				const a1 = ((ang - 30) * Math.PI) / 180, a2 = ((ang + 30) * Math.PI) / 180;
				edges.push(`M${(c.x + size * Math.cos(a1)).toFixed(1)} ${(c.y + size * Math.sin(a1)).toFixed(1)}L${(c.x + size * Math.cos(a2)).toFixed(1)} ${(c.y + size * Math.sin(a2)).toFixed(1)}`);
			}
		}
		return { color: a.color, cells: [...inside].map((id) => centerOf(id)), outline: edges.join('') };
	});
	const pieceColor = (t: string) => (t === 'orange' ? '#ea6a1e' : t === 'blue' ? '#2f79e6' : '#9aa4b2');
</script>

{#snippet pieceBody(p: Piece, c: { x: number; y: number }, sel: boolean, cid: string)}
		{#if p.letter}
			<!-- companion (Turret / Pyro): player-colour disc, its letter, team ring -->
			<circle cx={c.x} cy={c.y} r={size * 0.6} fill={p.color ?? pieceColor(p.team)} stroke={sel ? '#fde047' : pieceColor(p.team)} stroke-width={size * 0.16} />
			<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.7} font-weight="900" fill="#0b1220" pointer-events="none">{p.letter}</text>
		{:else if p.mine === 'down'}
			<!-- a mine, face down: the owner's colour, brass ring, skull & crossbones emblem -->
			{@const R = size * 0.6}
			<circle cx={c.x} cy={c.y} r={R} fill={p.color ?? pieceColor(p.team)} />
			<circle cx={c.x} cy={c.y} r={R} fill="url(#mine-shade)" />
			<circle cx={c.x} cy={c.y} r={R * 0.86} fill="none" stroke="#c79a4e" stroke-opacity=".85" stroke-width={R * 0.035} />
			<circle cx={c.x} cy={c.y} r={R} fill="none" stroke={sel ? '#fde047' : '#12161e'} stroke-width={R * 0.12} />
			<use href="#mine-skull" x={c.x - R} y={c.y - R} width={R * 2} height={R * 2} pointer-events="none" />
			{#if p.peek}
				<!-- only its owner sees which mine this is -->
				<circle cx={c.x + size * 0.46} cy={c.y + size * 0.42} r={size * 0.2} fill="#0b1220" stroke="#f4ecd8" stroke-width={size * 0.04} pointer-events="none" />
				<text x={c.x + size * 0.46} y={c.y + size * 0.43} text-anchor="middle" dominant-baseline="central" font-size={size * 0.24} fill="#f4ecd8" pointer-events="none">{p.peek}</text>
			{/if}
		{:else if p.token}
			<circle cx={c.x} cy={c.y} r={size * 0.6} fill="rgba(9,13,22,.82)" stroke={sel ? '#fde047' : pieceColor(p.team)} stroke-width={size * 0.12} />
			{#if tokenImg(p.token) ?? p.sym}
				<image href={tokenImg(p.token) ?? p.sym} x={c.x - size * 0.5} y={c.y - size * 0.5} width={size} height={size} preserveAspectRatio="xMidYMid meet" pointer-events="none" />
			{:else if p.label}
				<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.6} font-weight="800" fill="#f6ead2" pointer-events="none">{p.label[0]}</text>
			{/if}
		{:else if p.role}
			<image href={minionToken(p.team, p.role)} x={c.x - size * 0.7} y={c.y - size * 0.7} width={size * 1.4} height={size * 1.4} preserveAspectRatio="xMidYMid meet" pointer-events="none"
				transform={minionRot(p, c.x, c.y, rotEff, teamSpawnDir)} />
			<circle cx={c.x} cy={c.y} r={size * 0.66} fill="transparent" stroke={sel ? '#fde047' : pieceColor(p.team)} stroke-width={size * 0.14} />
			{#if p.immune}
				<!-- immune heavy: a silver shield with gold trim on the rim (same as the toolbar chip) -->
				<g transform="translate({c.x + size * 0.5} {c.y - size * 0.52}) scale({size / 150}) translate(-50 -50)" pointer-events="none" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.75))">
					<path d="M50 6 L88 18 V46 C88 70 70 86 50 95 C30 86 12 70 12 46 V18 Z" fill="url(#shield-silver)" stroke="#d9a845" stroke-width="8" stroke-linejoin="round" />
					<path d="M50 20 V82 M26 40 H74" stroke="#d9a845" stroke-width="5" stroke-linecap="round" opacity=".85" />
				</g>
			{/if}
		{:else}
			<!-- hero piece = the player icon: face portrait, team ring, player-colour outer ring -->
			{@const R = size * 0.68}
			<circle cx={c.x} cy={c.y} r={R} fill={p.color ?? pieceColor(p.team)} />
			<circle cx={c.x} cy={c.y} r={R * 0.84} fill={pieceColor(p.team)} />
			{#if p.hero}
				{@const pr = portraitRect(p.hero, c.x, c.y, R * 1.36)}
				<clipPath id="pc-{cid}"><circle cx={c.x} cy={c.y} r={R * 0.68} /></clipPath>
				<image href={pr.href} x={pr.x} y={pr.y} width={pr.w} height={pr.h} clip-path="url(#pc-{cid})" preserveAspectRatio="none" pointer-events="none" />
			{:else if p.sym}
				<image href={p.sym} x={c.x - size * 0.46} y={c.y - size * 0.46} width={size * 0.92} height={size * 0.92} preserveAspectRatio="xMidYMid meet" pointer-events="none" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))" />
			{:else if p.label}
				<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.72} font-weight="800" fill="#0b1220" stroke="rgba(255,255,255,.6)" stroke-width={size * 0.02} pointer-events="none">{p.label}</text>
			{/if}
		{/if}
{/snippet}

<svelte:window on:keydown={onKey} />
<div
	class="board-wrap"
	class:interactive
	bind:this={wrapEl}
	on:pointerdown={down}
	on:pointermove={move}
	on:pointerup={up}
	on:pointercancel={up}
	on:pointerleave={() => { if (!dragId) hoverHex = null; hoverName = null; }}
	bind:clientWidth={wrapW}
	bind:clientHeight={wrapH}
	class:holding={!!ghostPiece}
	class:pinging={pingArmed}
	role="img"
	aria-label={map.name ? `Game board: ${map.name}` : 'Game board'}
>
	{#if look === 'island' && viewM}
		<Ocean {bounds} view={viewM} {coast} {size} still={seaStill} />
		<svg class="land" class:moving viewBox={vb} preserveAspectRatio="xMidYMid meet" style:transform={landTf} aria-hidden="true">
			<IslandLayer {cells} {meta} {size} rot={rotEff} zones={zoneNames} {glowZone} thrones={throneAt} {coast} />
		</svg>
	{/if}
	<svg class="pieces" viewBox={vb} preserveAspectRatio="xMidYMid meet" bind:this={svgEl}>
		<defs>
			<linearGradient id="shield-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset=".45" stop-color="#cfd5dc" /><stop offset="1" stop-color="#7d8792" /></linearGradient>
			<linearGradient id="mine-bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecd9" /><stop offset="1" stop-color="#c7b894" /></linearGradient>
			<radialGradient id="mine-shade"><stop offset=".55" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".42" /></radialGradient>
			<!-- skull & crossbones for face-down mines (100×100 design space) -->
			<symbol id="mine-skull" viewBox="0 0 100 100">
				<g transform="translate(50 50) scale(.8) translate(-50 -46)">
					<g stroke="#12161e" stroke-width="4.4" fill="#12161e"><g transform="translate(50 57) rotate(28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g><g transform="translate(50 57) rotate(-28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g></g>
					<g fill="url(#mine-bone)"><g transform="translate(50 57) rotate(28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g><g transform="translate(50 57) rotate(-28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g></g>
					<path d="M50 12 C35 12 25 22 25 36 C25 42 27 46 29 49 C30 51 30 53 29.5 55 C29 58 31 60 34 60.5 C36 61 37.5 62.5 38 64.5 L39 70 C39.4 71.6 40.8 72.6 42.4 72.6 L57.6 72.6 C59.2 72.6 60.6 71.6 61 70 L62 64.5 C62.5 62.5 64 61 66 60.5 C69 60 71 58 70.5 55 C70 53 70 51 71 49 C73 46 75 42 75 36 C75 22 65 12 50 12 Z" fill="#12161e" stroke="#12161e" stroke-width="4.4" stroke-linejoin="round"/>
					<path d="M50 12 C35 12 25 22 25 36 C25 42 27 46 29 49 C30 51 30 53 29.5 55 C29 58 31 60 34 60.5 C36 61 37.5 62.5 38 64.5 L39 70 C39.4 71.6 40.8 72.6 42.4 72.6 L57.6 72.6 C59.2 72.6 60.6 71.6 61 70 L62 64.5 C62.5 62.5 64 61 66 60.5 C69 60 71 58 70.5 55 C70 53 70 51 71 49 C73 46 75 42 75 36 C75 22 65 12 50 12 Z" fill="url(#mine-bone)"/>
					<path d="M31.5 38.5 C34 36 40 35.5 45 37.5 C46.5 38.2 47 39.8 46.4 41.4 L44 47 C43 49.2 40.6 50.2 38.3 49.6 C34.5 48.6 31.8 45.5 31.2 41.6 C31 40.4 31.1 39.3 31.5 38.5 Z" fill="#12161e"/><path d="M68.5 38.5 C66.0 36 60.0 35.5 55.0 37.5 C53.5 38.2 53.0 39.8 53.6 41.4 L56.0 47 C57.0 49.2 59.4 50.2 61.7 49.6 C65.5 48.6 68.2 45.5 68.8 41.6 C69.0 40.4 68.9 39.3 68.5 38.5 Z" fill="#12161e"/>
					<path d="M50 49 C48.6 51.5 46.6 54.8 46.2 57 C46 58.3 47.2 59 48.3 58.4 L50 57.5 L51.7 58.4 C52.8 59 54 58.3 53.8 57 C53.4 54.8 51.4 51.5 50 49 Z" fill="#12161e"/>
					<path d="M39.6 65.6 H60.4 M42.6 62.8 V72 M46.3 62.4 V72.4 M50 62.3 V72.6 M53.7 62.4 V72.4 M57.4 62.8 V72" stroke="#12161e" stroke-width="1.3" fill="none"/>
					<path d="M31 56 C33 58.5 35.5 59.5 37.5 59.5" stroke="#12161e" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M69.0 56 C67.0 58.5 64.5 59.5 62.5 59.5" stroke="#12161e" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/>
					<path d="M33 24 C37 18.5 43 16 48 15.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/>
				</g>
			</symbol>
		</defs>
		<g bind:this={viewG} transform={viewTf}>
			{#if look !== 'island'}
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
			{/if}

			<!-- the hex a held object would land on, in the viewer's colour -->
			{#if ghostPiece && hoverHex}
				{@const hc = centerOf(hoverHex)}
				<polygon points={poly(hc.x, hc.y, size)} fill={holdColor} fill-opacity=".3" stroke={holdColor} stroke-opacity=".9" stroke-width={size * 0.07} stroke-linejoin="round" pointer-events="none" />
			{/if}

			<!-- area radii (under the pieces): translucent fill + a solid outer edge -->
			{#each areaShapes as a}
				<g pointer-events="none">
					{#each a.cells as c}<polygon points={poly(c.x, c.y, size)} fill={a.color} fill-opacity=".2" />{/each}
					<path d={a.outline} fill="none" stroke={a.color} stroke-width={size * 0.07} stroke-linecap="round" stroke-opacity=".95" />
				</g>
			{/each}

			{#each pieces.filter((q) => !q.attachTo) as p (p.id)}
				{@const base = centerOf(p.hex)}
				{@const off = pieceOffset[p.id] ?? { x: 0, y: 0 }}
				{@const c = { x: base.x + off.x, y: base.y + off.y }}
				{@const sel = selected === p.id || dragId === p.id}
				<g class="piece" class:selectable={!!onMovePiece} class:selected={sel} class:lifted={sel && !!hoverHex}
					role="button" tabindex="-1" data-piece={p.id}
					aria-label={p.role ? `${p.team === "blue" ? "Titan" : "Atlantean"} ${p.role} minion` : (p.label ?? "piece")}
					transform={rotEff ? `rotate(${-rotEff} ${c.x} ${c.y})` : undefined}
				>
					{#if look === 'island'}<circle cx={c.x + size * 0.05} cy={c.y + size * 0.13} r={size * 0.68} fill="#000" fill-opacity=".34" pointer-events="none" />{/if}
					{#if sel}
						<circle class="selring" cx={c.x} cy={c.y} r={size * 0.82} fill="none" stroke="#fde047" stroke-width={size * 0.1} stroke-dasharray="{size * 0.32} {size * 0.22}" pointer-events="none" />
					{/if}
					{@render pieceBody(p, c, sel, p.id)}
				</g>
			{/each}

			{#each attached as p (p.id)}
				{@const host = pieces.find((q) => q.id === p.attachTo)}
				{#if host}
					{@const hc = posOf(host.id, host.hex)}
					{@const ang = ((-45 - rotEff) * Math.PI) / 180 + (badgeIdx[p.id] ?? 0) * 0.62} <!-- upper-right on screen, whatever the board's rotation -->
					{@const c = { x: hc.x + Math.cos(ang) * size * 0.66, y: hc.y + Math.sin(ang) * size * 0.66 }}
					{@const sel = selected === p.id || dragId === p.id}
					<!-- a marker riding on a hero (poison / bounty): a small badge that moves with them -->
					<g class="piece" class:selectable={!!onMovePiece} class:selected={sel} class:lifted={sel && !!hoverHex} role="button" tabindex="-1" data-piece={p.id} aria-label="{p.token ?? 'marker'} on a hero"
						transform={rotEff ? `rotate(${-rotEff} ${c.x} ${c.y})` : undefined}>
						<circle cx={c.x} cy={c.y} r={size * 0.3} fill="rgba(9,13,22,.9)" stroke={sel ? '#fde047' : '#f4ecd8'} stroke-width={size * 0.06} />
						{#if tokenImg(p.token)}
							<image href={tokenImg(p.token)} x={c.x - size * 0.27} y={c.y - size * 0.27} width={size * 0.54} height={size * 0.54} preserveAspectRatio="xMidYMid meet" pointer-events="none" />
						{/if}
					</g>
				{/if}
			{/each}

			<!-- pings: rings rippling out from the hex, in the pinger's colour -->
			{#each pings as pg (pg.id)}
				{@const c = centerOf(pg.hex)}
				<g class="ping" pointer-events="none" style="--pc:{pg.color}">
					<circle class="pring" cx={c.x} cy={c.y} r={size * 1.1} stroke-width={size * 0.14} />
					<circle class="pring late" cx={c.x} cy={c.y} r={size * 1.1} stroke-width={size * 0.14} />
					<circle class="pdot" cx={c.x} cy={c.y} r={size * 0.3} />
				</g>
			{/each}

			<!-- the held object's ghost, riding under the cursor (only over real hexes) -->
			{#if ghostPiece && hoverHex}
				<g class="ghost" opacity=".62" pointer-events="none" transform={rotEff ? `rotate(${-rotEff} ${hoverPt.x} ${hoverPt.y})` : undefined}>
					{@render pieceBody(ghostPiece, hoverPt, false, 'ghost')}
				</g>
			{/if}
		</g>
	</svg>
	{#if hoverName}<div class="pname" style="left:{hoverName.x}px; top:{hoverName.y}px; color:{hoverName.color}">{hoverName.text}</div>{/if}
</div>

<style>
	.pname { position: absolute; transform: translate(-50%, calc(-100% - 4px)); pointer-events: none; white-space: nowrap; z-index: 3;
		padding: 2px 9px; border-radius: 999px; font-size: .78rem; background: rgba(9, 13, 22, .88); border: 1px solid rgba(255, 255, 255, .16); box-shadow: 0 4px 12px rgba(0,0,0,.45); text-transform: capitalize; }
	.board-wrap { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
	.board-wrap :global(image) { -webkit-user-drag: none; user-select: none; }
	.board-wrap.interactive { cursor: grab; }
	.board-wrap.interactive:active { cursor: grabbing; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	svg.land { transform-origin: 0 0; pointer-events: none; overflow: visible; }
	svg.land.moving { will-change: transform; }
	.piece.selectable { cursor: pointer; }
	/* holding something: the closed hand everywhere over the board, and the picked-up
	   piece dims while its ghost rides the cursor */
	.board-wrap.holding, .board-wrap.holding :global(*) { cursor: grabbing !important; }
	.piece.lifted { opacity: .4; }
	.piece.selected circle { filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6)); }
	.board-wrap.pinging, .board-wrap.pinging :global(*) { cursor: crosshair !important; }
	.ping .pring { fill: none; stroke: var(--pc); transform-box: fill-box; transform-origin: center; animation: pring 1.1s ease-out 3; opacity: 0; }
	.ping .pring.late { animation-delay: .4s; }
	.ping .pdot { fill: var(--pc); stroke: #fff; stroke-width: 1.5; animation: pdot 3.5s ease forwards; }
	@keyframes pring { 0% { transform: scale(.25); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
	@keyframes pdot { 0% { opacity: 0; } 8% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
	.selring { animation: spin 8s linear infinite; transform-box: fill-box; transform-origin: center; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
