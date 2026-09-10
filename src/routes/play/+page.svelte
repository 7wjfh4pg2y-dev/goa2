<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import boardUrl from '$lib/images/board/forgotten_island.webp'

	const BOARD = 2000
	const SQRT3 = Math.sqrt(3)

	// Hex type palette (colors are the editor's; meanings map to game concepts).
	const PALETTE = [
		{ t: 'baseOrange', label: 'Orange base', c: '#ea580c' },
		{ t: 'baseBlue', label: 'Blue base', c: '#2563eb' },
		{ t: 'forest', label: 'Forest', c: '#16a34a' },
		{ t: 'beach', label: 'Beach', c: '#eab308' },
		{ t: 'middle', label: 'Middle', c: '#9ca3af' },
		{ t: 'terrain', label: 'Terrain', c: '#111827' },
		{ t: 'spawnOrange', label: 'Orange spawn', c: '#ef4444' },
		{ t: 'spawnBlue', label: 'Blue spawn', c: '#a855f7' },
	] as const
	type HexType = (typeof PALETTE)[number]['t']
	const colorOf = (t: HexType) => PALETTE.find((p) => p.t === t)?.c ?? '#fff'

	// grid geometry (regular pointy-top lattice; adjustable so it roughly covers
	// the image while tracing — precision doesn't matter, we paint whole cells)
	let size = 62
	let originX = 150
	let originY = 150
	let rot = 0
	let cols = 22
	let rows = 22

	let cells: Record<string, HexType> = {} // painted cells only: "c_r" -> type
	let name = 'forgotten_island'
	let selected: HexType | 'erase' = 'beach'

	let showImage = true
	let showEmpty = true // show faint outlines of unpainted hexes (edit mode)
	let painting = false
	let loaded = false

	function rotate(x: number, y: number, deg: number) {
		const a = (deg * Math.PI) / 180, dx = x - BOARD / 2, dy = y - BOARD / 2
		return [BOARD / 2 + dx * Math.cos(a) - dy * Math.sin(a), BOARD / 2 + dx * Math.sin(a) + dy * Math.cos(a)]
	}
	function centerOf(c: number, r: number, sz: number, ox: number, oy: number): [number, number] {
		const x = ox + sz * SQRT3 * (c + 0.5 * (r & 1))
		const y = oy + sz * 1.5 * r
		return rotate(x, y, rot) as [number, number]
	}
	function poly(cx: number, cy: number, sz: number, rotation: number) {
		const p = []
		for (let i = 0; i < 6; i++) {
			const ang = (Math.PI / 180) * (60 * i - 90 + rotation)
			p.push(`${(cx + sz * Math.cos(ang)).toFixed(1)},${(cy + sz * Math.sin(ang)).toFixed(1)}`)
		}
		return p.join(' ')
	}

	$: grid = (() => {
		const arr: { id: string; cx: number; cy: number }[] = []
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) {
				const [cx, cy] = centerOf(c, r, size, originX, originY)
				arr.push({ id: `${c}_${r}`, cx, cy })
			}
		return arr
	})()
	$: paintedCount = Object.keys(cells).length

	function paint(id: string) {
		if (selected === 'erase') { if (cells[id]) { delete cells[id]; cells = cells } }
		else if (cells[id] !== selected) { cells[id] = selected; cells = cells }
	}

	// ---- saved maps ----
	const WORK = 'goa2-map-work-v1'
	const MAPS = 'goa2-maps-v1'
	let saved: Record<string, any> = {}
	function snapshot() { return { name, grid: { size, originX, originY, rot, cols, rows }, cells } }
	function applyMap(m: any) {
		cells = m.cells ?? {}
		const g = m.grid ?? {}
		size = g.size ?? size; originX = g.originX ?? originX; originY = g.originY ?? originY
		rot = g.rot ?? rot; cols = g.cols ?? cols; rows = g.rows ?? rows
		name = m.name ?? name
	}
	function saveMap() { saved = { ...saved, [name]: snapshot() }; try { localStorage.setItem(MAPS, JSON.stringify(saved)) } catch {} }
	function loadMap(n: string) { if (saved[n]) applyMap(saved[n]) }
	function deleteMap(n: string) { const s = { ...saved }; delete s[n]; saved = s; try { localStorage.setItem(MAPS, JSON.stringify(saved)) } catch {} }
	function newMap() { if (confirm('Start a new blank map? (current unsaved paint is kept in autosave until you paint over it)')) { cells = {}; name = 'untitled' } }
	function clearPaint() { if (confirm('Clear all painted hexes on this map?')) cells = {} }

	$: if (loaded) { try { localStorage.setItem(WORK, JSON.stringify(snapshot())) } catch {} }
	onMount(() => {
		try { const s = localStorage.getItem(WORK); if (s) applyMap(JSON.parse(s)) } catch {}
		try { const m = localStorage.getItem(MAPS); if (m) saved = JSON.parse(m) } catch {}
		loaded = true
		window.addEventListener('pointerup', () => (painting = false))
	})
	onDestroy(() => {})

	let copied = false
	async function exportMap() {
		try { await navigator.clipboard.writeText(JSON.stringify(snapshot())); copied = true; setTimeout(() => (copied = false), 1500) } catch {}
	}
</script>

<svelte:head><title>Map Editor — GoA2</title></svelte:head>

<div class="page">
	<div class="board-wrap" class:noimg={!showImage}>
		{#if showImage}<img src={boardUrl} alt="tracing guide" draggable="false" />{/if}
		<svg class="overlay" viewBox="0 0 {BOARD} {BOARD}" preserveAspectRatio="xMidYMid meet">
			{#each grid as h (h.id)}
				{#if cells[h.id]}
					<polygon points={poly(h.cx, h.cy, size, rot)} style="fill:{colorOf(cells[h.id])}"
						class="cell painted"
						on:pointerdown={(e) => { e.preventDefault(); painting = true; paint(h.id) }}
						on:pointerenter={() => painting && paint(h.id)} />
				{:else if showEmpty}
					<polygon points={poly(h.cx, h.cy, size, rot)} class="cell empty"
						on:pointerdown={(e) => { e.preventDefault(); painting = true; paint(h.id) }}
						on:pointerenter={() => painting && paint(h.id)} />
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel">
		<h3>Map editor</h3>
		<p class="sub">Pick a color, then click or drag across hexes to paint. Unpainted hexes aren't part of the map.</p>

		<div class="palette">
			{#each PALETTE as p}
				<button class="sw" class:on={selected === p.t} style="--c:{p.c}" on:click={() => (selected = p.t)}>
					<span class="dot" style="background:{p.c}"></span>{p.label}
				</button>
			{/each}
			<button class="sw erase" class:on={selected === 'erase'} on:click={() => (selected = 'erase')}>⌫ Erase</button>
		</div>

		<div class="row">
			<label class="ck"><input type="checkbox" bind:checked={showImage} /> tracing image</label>
			<label class="ck"><input type="checkbox" bind:checked={showEmpty} /> empty hexes</label>
		</div>
		<p class="tip">Uncheck both for a clean <b>play preview</b> — just the colored board.</p>

		<details>
			<summary>Grid geometry</summary>
			{#each [ ['size','Hex size',30,110,0.5],['originX','Origin X',0,500,1],['originY','Origin Y',0,500,1],['rot','Rotation°',-15,15,0.1],['cols','Columns',6,34,1],['rows','Rows',6,34,1] ] as [k,l,mn,mx,st]}
				<label class="sl"><span>{l}<b>{ {size,originX,originY,rot,cols,rows}[k] }</b></span>
					<input type="range" min={mn} max={mx} step={st} value={ {size,originX,originY,rot,cols,rows}[k] }
						on:input={(e)=>{const v=+e.currentTarget.value; if(k==='size')size=v;else if(k==='originX')originX=v;else if(k==='originY')originY=v;else if(k==='rot')rot=v;else if(k==='cols')cols=v;else rows=v;}} />
				</label>
			{/each}
		</details>

		<div class="maps">
			<label>Map name <input class="txt" bind:value={name} /></label>
			<div class="row">
				<button on:click={saveMap}>💾 Save</button>
				<button class="g" on:click={newMap}>New</button>
				<button class="danger" on:click={clearPaint}>Clear paint</button>
			</div>
			{#if Object.keys(saved).length}
				<div class="saved">
					{#each Object.keys(saved) as n}
						<div class="savedrow"><button class="link" on:click={() => loadMap(n)}>{n}</button><button class="x" on:click={() => deleteMap(n)}>✕</button></div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="row"><button on:click={exportMap} disabled={!paintedCount}>{copied ? 'Copied!' : 'Export map JSON'}</button></div>
		<p class="count"><b>{paintedCount}</b> hexes painted</p>
	</div>
</div>

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 84px 16px 32px; display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; color: #e5e7eb; }
	.board-wrap { position: relative; flex: 1 1 520px; max-width: 760px; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.5); background: #0b1220; }
	.board-wrap.noimg { background: #0b1220; }
	.board-wrap img { width: 100%; height: 100%; display: block; user-select: none; opacity: .85; }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
	.cell { stroke-width: 2; cursor: pointer; }
	.cell.painted { fill-opacity: .72; stroke: rgba(0,0,0,.45); }
	.cell.painted:hover { fill-opacity: .9; }
	.cell.empty { fill: rgba(255,255,255,.04); stroke: rgba(148,163,184,.35); }
	.cell.empty:hover { fill: rgba(56,189,248,.35); }
	.panel { flex: 1 1 320px; max-width: 400px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 16px; height: fit-content; }
	.panel h3 { margin: 0 0 4px; } .sub { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
	.palette { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
	.sw { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 7px 9px; border-radius: 8px; background: #1f2937; color: #e5e7eb; border: 2px solid transparent; cursor: pointer; text-align: left; }
	.sw.on { border-color: #fff; }
	.sw .dot { width: 14px; height: 14px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.3); }
	.sw.erase { grid-column: span 2; justify-content: center; }
	.row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
	.ck { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
	.tip { font-size: 11.5px; color: #93c5fd; margin: 2px 0 10px; }
	details { margin: 6px 0 12px; } summary { cursor: pointer; font-size: 13px; color: #cbd5e1; }
	label { display: block; font-size: 13px; margin-bottom: 8px; }
	label.sl span { display: flex; justify-content: space-between; margin-bottom: 3px; color: #cbd5e1; } label.sl b { color: #fff; }
	input[type=range] { width: 100%; }
	.txt { width: 100%; margin-top: 4px; background: #1f2937; color: #fff; border: 1px solid #374151; border-radius: 6px; padding: 6px; }
	.maps { border-top: 1px solid #374151; margin-top: 10px; padding-top: 10px; }
	.saved { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
	.savedrow { display: flex; justify-content: space-between; align-items: center; background: #0b1220; border: 1px solid #1e293b; border-radius: 6px; padding: 2px 4px 2px 8px; }
	.link { background: none; border: none; color: #93c5fd; cursor: pointer; font-size: 13px; padding: 4px 0; }
	.x { background: none; border: none; color: #ef4444; cursor: pointer; }
	button { font-size: 13px; padding: 7px 12px; border-radius: 8px; background: #2563eb; color: #fff; border: none; cursor: pointer; flex: 1; }
	button:disabled { opacity: .4; cursor: default; }
	button.g { background: #374151; } button.danger { background: #7f1d1d; }
	.count { font-size: 12px; color: #9ca3af; }
</style>
