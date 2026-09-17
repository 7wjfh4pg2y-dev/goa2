<script lang="ts">
	import { onMount, onDestroy } from 'svelte'

	// A reusable, read-only renderer for a painted hex map (the 3D board).
	// Renders zone tiles, zone-tinted minion spawns with team-emblem badges,
	// throne badges, and dark hex borders — with optional map-only zoom/pan.
	export let map: {
		cells?: Record<string, string>
		meta?: Record<string, { m: string; dir: number }>
		grid?: { size?: number }
		name?: string
	} = {}
	export let interactive = true

	// pieces on the board + callbacks when one is moved or dragged off the board
	export let pieces: Array<{ id: string; hex: string; team: string; role?: string; label?: string; color?: string }> = []
	export let onMovePiece: ((id: string, hex: string) => void) | null = null
	export let onRemovePiece: ((id: string) => void) | null = null

	const SQRT3 = Math.sqrt(3)
	const tileSprites = import.meta.glob('./images/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>
	const minionSprites = import.meta.glob('./images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>

	$: cells = map.cells ?? {}
	$: meta = map.meta ?? {}
	$: size = map.grid?.size ?? 60

	const isSpawn = (t: string) => t === 'spawnOrange' || t === 'spawnBlue'
	const isThrone = (t: string) => t === 'baseOrangeSpawn' || t === 'baseBlueSpawn'
	const baseTileFor = (t: string) => (t === 'baseOrangeSpawn' ? 'baseOrange' : 'baseBlue')
	const ZONE_TYPES = ['forest', 'beach', 'middle', 'terrain', 'baseOrange', 'baseBlue']
	const ODDR = [
		[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
		[[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
	]
	function zoneOf(id: string): string {
		const [c, r] = id.split('_').map(Number)
		const counts: Record<string, number> = {}
		for (const [dc, dr] of ODDR[r & 1]) {
			const n = cells[`${c + dc}_${r + dr}`]
			if (n && ZONE_TYPES.includes(n)) counts[n] = (counts[n] ?? 0) + 1
		}
		let best = 'middle', bc = 0
		for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k }
		return best
	}
	const zoneTile = (z: string) => tileSprites[`./images/tiles/${z}.png`]
	function spriteFor(id: string, t: string): string | undefined {
		if (t === 'spawnOrange') return minionSprites[`./images/minions/orange_${meta[id]?.m ?? 'melee'}.png`]
		if (t === 'spawnBlue') return minionSprites[`./images/minions/blue_${meta[id]?.m ?? 'melee'}.png`]
		return tileSprites[`./images/tiles/${t}.png`]
	}
	function poly(cx: number, cy: number, sz: number) {
		const p = []
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 90); p.push(`${(cx + sz * Math.cos(a)).toFixed(1)},${(cy + sz * Math.sin(a)).toFixed(1)}`) }
		return p.join(' ')
	}

	$: hexes = Object.keys(cells).map((id) => {
		const [c, r] = id.split('_').map(Number)
		return { id, t: cells[id], x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r }
	})
	$: vb = (() => {
		if (!hexes.length) return '0 0 100 100'
		const xs = hexes.map((h) => h.x), ys = hexes.map((h) => h.y), pad = size * 1.5
		const a = Math.min(...xs) - pad, b = Math.min(...ys) - pad, w = Math.max(...xs) + pad - a, h = Math.max(...ys) + pad - b
		return `${a} ${b} ${w} ${h}`
	})()

	// zoom / pan (contained to this element)
	let wrapEl: HTMLDivElement
	let scale = 1, panX = 0, panY = 0, panning = false, ps = { x: 0, y: 0 }
	function clampPan() { if (!wrapEl) return; const W = wrapEl.clientWidth, mn = W * (1 - scale); if (scale <= 1) { panX = 0; panY = 0 } else { panX = Math.min(0, Math.max(mn, panX)); panY = Math.min(0, Math.max(mn, panY)) } }
	function zoomAt(ns: number, mx: number, my: number) { ns = Math.min(8, Math.max(1, ns)); panX = mx - (mx - panX) * (ns / scale); panY = my - (my - panY) * (ns / scale); scale = ns; clampPan() }
	function onWheel(e: WheelEvent) { if (!interactive) return; e.preventDefault(); const r = wrapEl.getBoundingClientRect(); if (e.ctrlKey) zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top); else { panX -= e.deltaX; panY -= e.deltaY; clampPan() } }
	export function zoomBtn(f: number) { const W = wrapEl?.clientWidth ?? 0; zoomAt(scale * f, W / 2, W / 2) }
	export function reset() { scale = 1; panX = 0; panY = 0 }
	function down(e: PointerEvent) { if (!interactive) return; panning = true; ps = { x: e.clientX - panX, y: e.clientY - panY }; wrapEl.setPointerCapture(e.pointerId) }
	function move(e: PointerEvent) { if (!panning) return; panX = e.clientX - ps.x; panY = e.clientY - ps.y; clampPan() }
	function up(e: PointerEvent) { panning = false; try { wrapEl.releasePointerCapture(e.pointerId) } catch {} }

	onMount(() => { if (interactive) wrapEl?.addEventListener('wheel', onWheel, { passive: false }) })
	onDestroy(() => wrapEl?.removeEventListener('wheel', onWheel))

	// ---- pieces: render at hex centres, drag to snap onto the nearest hex ----
	let svgEl: SVGSVGElement
	let drag: { id: string; x: number; y: number } | null = null

	function centerOf(id: string) {
		const [c, r] = id.split('_').map(Number)
		return { x: size * SQRT3 * (c + 0.5 * (r & 1)), y: size * 1.5 * r }
	}
	function clientToSvg(clientX: number, clientY: number) {
		const ctm = svgEl?.getScreenCTM()
		if (!ctm) return { x: 0, y: 0 }
		const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
		return { x: p.x, y: p.y }
	}
	function nearestHex(x: number, y: number): string | null {
		let best: string | null = null
		let bd = Infinity
		for (const h of hexes) {
			const d = (h.x - x) ** 2 + (h.y - y) ** 2
			if (d < bd) { bd = d; best = h.id }
		}
		return best
	}
	const pieceColor = (t: string) => (t === 'orange' ? '#ea6a1e' : t === 'blue' ? '#2f79e6' : '#9aa4b2')
	function startDrag(e: PointerEvent, p: { id: string; hex: string }) {
		if (!onMovePiece || !interactive) return
		e.stopPropagation()
		e.preventDefault()
		const c = centerOf(p.hex)
		drag = { id: p.id, x: c.x, y: c.y }
		window.addEventListener('pointermove', onDragMove)
		window.addEventListener('pointerup', onDragEnd)
	}
	function onDragMove(e: PointerEvent) {
		if (!drag) return
		const pt = clientToSvg(e.clientX, e.clientY)
		drag = { ...drag, x: pt.x, y: pt.y }
	}
	function onDragEnd(e: PointerEvent) {
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragEnd)
		if (!drag) return
		const pt = clientToSvg(e.clientX, e.clientY)
		const hex = nearestHex(pt.x, pt.y)
		const id = drag.id
		drag = null
		if (!hex) return
		// dropped well away from every hex -> remove the piece
		const c = centerOf(hex)
		const off = Math.hypot(c.x - pt.x, c.y - pt.y) > size * 1.3
		if (off && onRemovePiece) onRemovePiece(id)
		else if (onMovePiece) onMovePiece(id, hex)
	}
	const minionHref = (team: string, role?: string) =>
		minionSprites[`./images/minions/${team === 'blue' ? 'blue' : 'orange'}_${role ?? 'melee'}.png`]
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
	<div class="viewport" style="transform: translate({panX}px,{panY}px) scale({scale});">
		<svg viewBox={vb} preserveAspectRatio="xMidYMid meet" bind:this={svgEl}>
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
				<g
					class="piece"
					class:draggable={!!onMovePiece}
					class:dragging={drag?.id === p.id}
					role="button"
					tabindex="-1"
					aria-label={p.role ? `${p.team} ${p.role} minion` : `${p.team} ${p.label ?? 'piece'}`}
					on:pointerdown={(e) => startDrag(e, p)}
				>
					{#if p.role}
						<!-- minion piece: light disc + team ring + emblem badge -->
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
		</svg>
	</div>
	<slot />
</div>

<style>
	.board-wrap { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
	.board-wrap.interactive { cursor: grab; }
	.board-wrap.interactive:active { cursor: grabbing; }
	.viewport { position: absolute; inset: 0; transform-origin: 0 0; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.piece.draggable { cursor: grab; }
	.piece.dragging { cursor: grabbing; }
	.piece.dragging circle { filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5)); }
</style>
