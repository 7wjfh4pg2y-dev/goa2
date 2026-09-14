<script lang="ts">
	import { onMount } from 'svelte'
	import BoardCanvas from '$lib/BoardCanvas.svelte'
	import fallbackMap from '$lib/maps/forgotten_island.json'
	import type { GameMap } from '$lib/maps'

	let map: GameMap = fallbackMap as GameMap
	let canvas: BoardCanvas

	onMount(() => {
		try {
			const s = localStorage.getItem('goa2-map-work-v1')
			if (s) {
				const m = JSON.parse(s)
				if (m?.cells && Object.keys(m.cells).length) map = m
			}
		} catch {}
	})
</script>

<svelte:head><title>Board — GoA2</title></svelte:head>

<div class="page">
	<div class="head">
		<h2>{map.name ?? 'map'}</h2>
		<span class="muted">{Object.keys(map.cells ?? {}).length} hexes · rendered board</span>
	</div>
	<div class="board-frame">
		<BoardCanvas {map} bind:this={canvas} />
		<div class="zoomctl">
			<button on:click={() => canvas.zoomBtn(1 / 1.2)}>−</button>
			<button on:click={() => canvas.zoomBtn(1.2)}>+</button>
			<button on:click={() => canvas.reset()}>⟲</button>
		</div>
	</div>
	<p class="hint">Pinch / Ctrl-scroll to zoom · two-finger scroll or drag to pan. This view reflects the map from the editor (saved in this browser), or the bundled Forgotten Island map.</p>
</div>

<style>
	.page { max-width: 1000px; margin: 0 auto; padding: 84px 16px 32px; color: #e5e7eb; }
	.head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
	.head h2 { margin: 0; text-transform: capitalize; }
	.muted { color: #9ca3af; font-size: 13px; }
	.board-frame { position: relative; width: 100%; max-width: 820px; margin: 0 auto; aspect-ratio: 1/1; border-radius: 14px; overflow: hidden; background: radial-gradient(circle at 50% 30%, #16233b, #0b1220); box-shadow: 0 10px 40px rgba(0,0,0,.55); }
	.zoomctl { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; z-index: 2; }
	.zoomctl button { width: 34px; padding: 6px 0; background: rgba(17,24,39,.9); border: 1px solid #374151; border-radius: 6px; color: #e5e7eb; font-size: 15px; cursor: pointer; }
	.hint { font-size: 12px; color: #6b7280; text-align: center; margin-top: 12px; }
</style>
