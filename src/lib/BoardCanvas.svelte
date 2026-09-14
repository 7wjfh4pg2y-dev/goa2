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
		<svg viewBox={vb} preserveAspectRatio="xMidYMid meet">
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
</style>
