<script lang="ts">
	import { onMount } from 'svelte'
	import boardUrl from '$lib/images/board/forgotten_island.webp'

	const BOARD = 2000
	const SQRT3 = Math.sqrt(3)

	// --- scaffold parameters (used only to GENERATE the initial hex layout) ---
	let orientation: 'pointy' | 'flat' = 'pointy'
	let size = 69 // measured ~120px center-to-center -> pointy size ~69
	let ox = 250
	let oy = 250
	let rot = 0
	let cols = 15
	let rows = 15

	type Hex = { id: string; x: number; y: number; on: boolean }
	let hexes: Hex[] = []
	let showOff = true
	let showLines = true

	const KEY = 'goa2-board-map-v1'

	function rotate(x: number, y: number, deg: number) {
		const a = (deg * Math.PI) / 180
		const dx = x - BOARD / 2
		const dy = y - BOARD / 2
		return [BOARD / 2 + dx * Math.cos(a) - dy * Math.sin(a), BOARD / 2 + dx * Math.sin(a) + dy * Math.cos(a)]
	}

	function scaffoldCenter(c: number, r: number): [number, number] {
		let x: number, y: number
		if (orientation === 'pointy') {
			x = ox + size * SQRT3 * (c + 0.5 * (r & 1))
			y = oy + size * 1.5 * r
		} else {
			x = ox + size * 1.5 * c
			y = oy + size * SQRT3 * (r + 0.5 * (c & 1))
		}
		return rotate(x, y, rot)
	}

	function generate() {
		const out: Hex[] = []
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) {
				const [x, y] = scaffoldCenter(c, r)
				if (x < -size || x > BOARD + size || y < -size || y > BOARD + size) continue
				out.push({ id: `${c}_${r}`, x, y, on: true })
			}
		hexes = out
	}

	function polyPoints(cx: number, cy: number) {
		const pts = []
		for (let i = 0; i < 6; i++) {
			const ang = (Math.PI / 180) * (60 * i + (orientation === 'pointy' ? -90 : 0) + rot)
			pts.push(`${(cx + size * Math.cos(ang)).toFixed(1)},${(cy + size * Math.sin(ang)).toFixed(1)}`)
		}
		return pts.join(' ')
	}

	// --- editing: click toggles a hex on/off; drag repositions its center ---
	let svgEl: SVGSVGElement
	let activeId: string | null = null
	let moved = false
	let start = { x: 0, y: 0 }

	function toBoard(e: PointerEvent): [number, number] {
		const r = svgEl.getBoundingClientRect()
		return [((e.clientX - r.left) / r.width) * BOARD, ((e.clientY - r.top) / r.height) * BOARD]
	}
	function down(e: PointerEvent, h: Hex) {
		activeId = h.id
		moved = false
		start = { x: e.clientX, y: e.clientY }
		svgEl.setPointerCapture(e.pointerId)
	}
	function move(e: PointerEvent) {
		if (!activeId) return
		if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true
		if (moved) {
			const [bx, by] = toBoard(e)
			const h = hexes.find((z) => z.id === activeId)
			if (h) { h.x = bx; h.y = by; hexes = hexes }
		}
	}
	function up(e: PointerEvent) {
		if (activeId && !moved) {
			const h = hexes.find((z) => z.id === activeId)
			if (h) { h.on = !h.on; hexes = hexes }
		}
		activeId = null
		try { svgEl.releasePointerCapture(e.pointerId) } catch {}
	}

	$: onCount = hexes.filter((h) => h.on).length
	$: try { localStorage.setItem(KEY, JSON.stringify({ orientation, size, rot, hexes })) } catch {}

	onMount(() => {
		try {
			const s = localStorage.getItem(KEY)
			if (s) {
				const d = JSON.parse(s)
				if (d.hexes?.length) { hexes = d.hexes; orientation = d.orientation ?? orientation; size = d.size ?? size; rot = d.rot ?? rot; return }
			}
		} catch {}
		generate()
	})

	let copied = false
	async function exportMap() {
		const map = { board: 'forgotten_island', size, orientation, rot, hexes: hexes.filter((h) => h.on).map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })) }
		try { await navigator.clipboard.writeText(JSON.stringify(map)); copied = true; setTimeout(() => (copied = false), 1500) } catch {}
	}
</script>

<svelte:head><title>Board Editor — Guards of Atlantis</title></svelte:head>

<div class="page">
	<div class="board-wrap">
		<img src={boardUrl} alt="Forgotten Island board" draggable="false" />
		<svg bind:this={svgEl} class="overlay" viewBox="0 0 {BOARD} {BOARD}" preserveAspectRatio="xMidYMid meet"
			on:pointermove={move} on:pointerup={up} on:pointercancel={up}>
			{#each hexes as h (h.id)}
				{#if h.on || showOff}
					<polygon
						points={polyPoints(h.x, h.y)}
						class="hex" class:off={!h.on} class:lines={showLines}
						on:pointerdown={(e) => down(e, h)}
					/>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel">
		<h3>Board editor</h3>
		<p class="sub">Click a hex to toggle it on/off · drag a hex to move its center onto the painted cell.</p>

		<details open>
			<summary>Scaffold (generate initial grid)</summary>
			<label>Orientation
				<select bind:value={orientation}><option value="pointy">pointy-top</option><option value="flat">flat-top</option></select>
			</label>
			{#each [ ['rot','Rotation°',-15,15,0.1], ['size','Hex size',30,110,0.5], ['ox','Origin X',0,600,1], ['oy','Origin Y',0,600,1], ['cols','Columns',4,26,1], ['rows','Rows',4,26,1] ] as [k,l,mn,mx,st]}
				<label class="sl"><span>{l}<b>{ {rot,size,ox,oy,cols,rows}[k] }</b></span>
					<input type="range" min={mn} max={mx} step={st}
						on:input={(e)=>{ const v=+e.currentTarget.value; if(k==='rot')rot=v; else if(k==='size')size=v; else if(k==='ox')ox=v; else if(k==='oy')oy=v; else if(k==='cols')cols=v; else rows=v; }}
						value={ {rot,size,ox,oy,cols,rows}[k] } />
				</label>
			{/each}
			<button class="warn" on:click={generate}>⟳ Regenerate grid (discards nudges)</button>
		</details>

		<label class="ck"><input type="checkbox" bind:checked={showOff} /> show off-hexes (dim)</label>
		<label class="ck"><input type="checkbox" bind:checked={showLines} /> show hex outlines</label>

		<div class="row">
			<button class="g" on:click={() => { hexes = hexes.map((h) => ({ ...h, on: true })) }}>All on</button>
			<button class="g" on:click={() => { hexes = hexes.map((h) => ({ ...h, on: false })) }}>All off</button>
		</div>
		<div class="row">
			<button on:click={exportMap}>{copied ? 'Copied!' : 'Export map JSON'}</button>
		</div>
		<p class="count"><b>{onCount}</b> hexes on · {hexes.length} total</p>
	</div>
</div>

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 84px 16px 32px; display: flex; gap: 20px; flex-wrap: wrap; color: #e5e7eb; }
	.board-wrap { position: relative; flex: 1 1 520px; max-width: 760px; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
	.board-wrap img { width: 100%; height: 100%; display: block; user-select: none; }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
	.hex { fill: rgba(56,189,248,.14); stroke: transparent; stroke-width: 2; cursor: pointer; }
	.hex.lines { stroke: rgba(56,189,248,.7); }
	.hex:hover { fill: rgba(56,189,248,.4); }
	.hex.off { fill: rgba(120,120,120,.12); }
	.hex.off.lines { stroke: rgba(150,150,150,.35); }
	.panel { flex: 1 1 300px; max-width: 380px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 16px; height: fit-content; }
	.panel h3 { margin: 0 0 4px; } .sub { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
	details { margin-bottom: 12px; } summary { cursor: pointer; font-size: 13px; color: #cbd5e1; margin-bottom: 8px; }
	label { display: block; font-size: 13px; margin-bottom: 10px; }
	label.sl span { display: flex; justify-content: space-between; margin-bottom: 3px; color: #cbd5e1; } label.sl b { color: #fff; }
	input[type=range] { width: 100%; }
	select { width: 100%; margin-top: 4px; background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 4px; }
	.ck { display: flex; align-items: center; gap: 8px; }
	.row { display: flex; gap: 8px; margin: 8px 0; }
	button { font-size: 13px; padding: 7px 12px; border-radius: 8px; background: #2563eb; color: #fff; border: none; cursor: pointer; }
	button.warn { background: #4b5563; width: 100%; margin-top: 4px; }
	button.g { background: #374151; flex: 1; }
	.count { font-size: 12px; color: #9ca3af; }
</style>
