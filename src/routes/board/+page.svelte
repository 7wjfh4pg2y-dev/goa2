<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import fallbackMap from '$lib/maps/forgotten_island.json'

	const SQRT3 = Math.sqrt(3)
	const tileSprites = import.meta.glob('../../lib/images/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>
	const minionSprites = import.meta.glob('../../lib/images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>

	let cells: Record<string, string> = {}
	let meta: Record<string, { m: string; dir: number }> = {}
	let size = 60
	let mapName = ''

	function spriteFor(id: string, t: string): string | undefined {
		if (t === 'spawnOrange') return minionSprites[`../../lib/images/minions/orange_${meta[id]?.m ?? 'melee'}.png`]
		if (t === 'spawnBlue') return minionSprites[`../../lib/images/minions/blue_${meta[id]?.m ?? 'melee'}.png`]
		return tileSprites[`../../lib/images/tiles/${t}.png`]
	}
	function poly(cx: number, cy: number, sz: number) {
		const p = []
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 90); p.push(`${(cx + sz * Math.cos(a)).toFixed(1)},${(cy + sz * Math.sin(a)).toFixed(1)}`) }
		return p.join(' ')
	}

	// upright hex centers, keyed by "col_row"
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

	// zoom / pan (map only)
	let wrapEl: HTMLDivElement
	let scale = 1, panX = 0, panY = 0, panning = false, ps = { x: 0, y: 0 }
	function clampPan() { if (!wrapEl) return; const W = wrapEl.clientWidth, mn = W * (1 - scale); if (scale <= 1) { panX = 0; panY = 0 } else { panX = Math.min(0, Math.max(mn, panX)); panY = Math.min(0, Math.max(mn, panY)) } }
	function zoomAt(ns: number, mx: number, my: number) { ns = Math.min(8, Math.max(1, ns)); panX = mx - (mx - panX) * (ns / scale); panY = my - (my - panY) * (ns / scale); scale = ns; clampPan() }
	function onWheel(e: WheelEvent) { e.preventDefault(); const r = wrapEl.getBoundingClientRect(); if (e.ctrlKey) zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top); else { panX -= e.deltaX; panY -= e.deltaY; clampPan() } }
	function zoomBtn(f: number) { const W = wrapEl?.clientWidth ?? 0; zoomAt(scale * f, W / 2, W / 2) }
	function reset() { scale = 1; panX = 0; panY = 0 }
	function down(e: PointerEvent) { panning = true; ps = { x: e.clientX - panX, y: e.clientY - panY }; wrapEl.setPointerCapture(e.pointerId) }
	function move(e: PointerEvent) { if (!panning) return; panX = e.clientX - ps.x; panY = e.clientY - ps.y; clampPan() }
	function up(e: PointerEvent) { panning = false; try { wrapEl.releasePointerCapture(e.pointerId) } catch {} }

	onMount(() => {
		let m: any = null
		try { const s = localStorage.getItem('goa2-map-work-v1'); if (s) m = JSON.parse(s) } catch {}
		if (!m || !m.cells || !Object.keys(m.cells).length) m = fallbackMap
		cells = m.cells ?? {}; meta = m.meta ?? {}; size = m.grid?.size ?? 60; mapName = m.name ?? 'map'
		wrapEl?.addEventListener('wheel', onWheel, { passive: false })
	})
	onDestroy(() => wrapEl?.removeEventListener('wheel', onWheel))
</script>

<svelte:head><title>Board — GoA2</title></svelte:head>

<div class="page">
	<div class="head">
		<h2>{mapName}</h2>
		<span class="muted">{hexes.length} hexes · rendered board</span>
	</div>
	<div class="board-wrap" bind:this={wrapEl} on:pointerdown={down} on:pointermove={move} on:pointerup={up} on:pointercancel={up}>
		<div class="viewport" style="transform: translate({panX}px,{panY}px) scale({scale});">
			<svg viewBox={vb} preserveAspectRatio="xMidYMid meet">
				{#each hexes as h (h.id)}
					<image href={spriteFor(h.id, h.t)} x={h.x - SQRT3 * size * 0.53} y={h.y - size * 1.06}
						width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none"
						transform={(h.t === 'spawnOrange' || h.t === 'spawnBlue') && meta[h.id]?.dir ? `rotate(${meta[h.id].dir * 60} ${h.x} ${h.y})` : undefined} />
					<polygon points={poly(h.x, h.y, size)} fill="none" stroke="rgba(6,10,18,.7)" stroke-width="4" stroke-linejoin="round" />
				{/each}
			</svg>
		</div>
		<div class="zoomctl">
			<button on:click={() => zoomBtn(1 / 1.2)}>−</button>
			<button on:click={() => zoomBtn(1.2)}>+</button>
			<button on:click={reset}>⟲</button>
		</div>
	</div>
	<p class="hint">Pinch / Ctrl-scroll to zoom · two-finger scroll or drag to pan. This view reflects the map from the editor (saved in this browser), or the bundled Forgotten Island map.</p>
</div>

<style>
	.page { max-width: 1000px; margin: 0 auto; padding: 84px 16px 32px; color: #e5e7eb; }
	.head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
	.head h2 { margin: 0; text-transform: capitalize; }
	.muted { color: #9ca3af; font-size: 13px; }
	.board-wrap { position: relative; width: 100%; max-width: 820px; margin: 0 auto; aspect-ratio: 1/1; border-radius: 14px; overflow: hidden; background: radial-gradient(circle at 50% 30%, #16233b, #0b1220); box-shadow: 0 10px 40px rgba(0,0,0,.55); cursor: grab; touch-action: none; }
	.board-wrap:active { cursor: grabbing; }
	.viewport { position: absolute; inset: 0; transform-origin: 0 0; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.zoomctl { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; }
	.zoomctl button { width: 34px; padding: 6px 0; background: rgba(17,24,39,.9); border: 1px solid #374151; border-radius: 6px; color: #e5e7eb; font-size: 15px; cursor: pointer; }
	.hint { font-size: 12px; color: #6b7280; text-align: center; margin-top: 12px; }
</style>
