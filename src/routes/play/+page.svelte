<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import boardUrl from '$lib/images/board/forgotten_island.webp'

	const BOARD = 2000
	const SQRT3 = Math.sqrt(3)

	// Global hex shape (tune on your first reference hex; all hexes share it).
	let orientation: 'pointy' | 'flat' = 'pointy'
	let size = 69
	let rot = 0

	type Hex = { id: string; x: number; y: number }
	let hexes: Hex[] = [] // every hex here is a playable cell
	let selectedId: string | null = null

	const KEY = 'goa2-board-map-v2'
	const uid = () => 'h' + Math.random().toString(36).slice(2, 9)

	function rotVec(x: number, y: number, deg: number) {
		const a = (deg * Math.PI) / 180
		return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
	}
	// size/orient/rotation are passed in (not read from closure) so Svelte tracks
	// them as dependencies of the markup and re-renders live when they change.
	function polyPoints(cx: number, cy: number, sz: number, orient: 'pointy' | 'flat', rotation: number) {
		const p = []
		for (let i = 0; i < 6; i++) {
			const ang = (Math.PI / 180) * (60 * i + (orient === 'pointy' ? -90 : 0) + rotation)
			p.push(`${(cx + sz * Math.cos(ang)).toFixed(1)},${(cy + sz * Math.sin(ang)).toFixed(1)}`)
		}
		return p.join(' ')
	}

	// ---- pointer interaction ----
	let svgEl: SVGSVGElement
	let activeId: string | null = null
	let moved = false
	let start = { x: 0, y: 0 }

	function toBoard(e: PointerEvent): [number, number] {
		const r = svgEl.getBoundingClientRect()
		return [((e.clientX - r.left) / r.width) * BOARD, ((e.clientY - r.top) / r.height) * BOARD]
	}
	function addAt(e: PointerEvent) {
		// click on empty board => drop a new hex there and select it
		const [x, y] = toBoard(e)
		const h = { id: uid(), x, y }
		hexes = [...hexes, h]
		selectedId = h.id
	}
	function hexDown(e: PointerEvent, h: Hex) {
		e.stopPropagation()
		activeId = h.id
		selectedId = h.id
		moved = false
		start = { x: e.clientX, y: e.clientY }
		svgEl.setPointerCapture(e.pointerId)
	}
	function moveHandler(e: PointerEvent) {
		if (!activeId) return
		if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true
		if (moved) {
			const [bx, by] = toBoard(e)
			const h = hexes.find((z) => z.id === activeId)
			if (h) { h.x = bx; h.y = by; hexes = hexes }
		}
	}
	function upHandler(e: PointerEvent) {
		activeId = null
		try { svgEl.releasePointerCapture(e.pointerId) } catch {}
	}

	function duplicate() {
		const h = hexes.find((z) => z.id === selectedId)
		if (!h) return
		const stepX = orientation === 'pointy' ? SQRT3 * size : 1.5 * size
		const [dx, dy] = rotVec(stepX, 0, rot) // east neighbour, rotated
		const n = { id: uid(), x: h.x + dx, y: h.y + dy }
		hexes = [...hexes, n]
		selectedId = n.id
	}
	function del() {
		if (!selectedId) return
		hexes = hexes.filter((z) => z.id !== selectedId)
		selectedId = null
	}
	function nudge(dx: number, dy: number) {
		const h = hexes.find((z) => z.id === selectedId)
		if (h) { h.x += dx; h.y += dy; hexes = hexes }
	}
	function onKey(e: KeyboardEvent) {
		if (!selectedId) return
		const s = e.shiftKey ? 10 : 1
		if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del() }
		else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-s, 0) }
		else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(s, 0) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -s) }
		else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, s) }
		else if (e.key === 'd') { e.preventDefault(); duplicate() }
	}

	$: try { localStorage.setItem(KEY, JSON.stringify({ orientation, size, rot, hexes })) } catch {}
	onMount(() => {
		try {
			const s = localStorage.getItem(KEY)
			if (s) { const d = JSON.parse(s); hexes = d.hexes ?? []; orientation = d.orientation ?? orientation; size = d.size ?? size; rot = d.rot ?? rot }
		} catch {}
		window.addEventListener('keydown', onKey)
	})
	onDestroy(() => window.removeEventListener('keydown', onKey))

	let copied = false
	async function exportMap() {
		const map = { board: 'forgotten_island', size, orientation, rot, hexes: hexes.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })) }
		try { await navigator.clipboard.writeText(JSON.stringify(map)); copied = true; setTimeout(() => (copied = false), 1500) } catch {}
	}
	function clearAll() { if (confirm('Delete all hexes?')) { hexes = []; selectedId = null } }
</script>

<svelte:head><title>Board Editor — Guards of Atlantis</title></svelte:head>

<div class="page">
	<div class="board-wrap">
		<img src={boardUrl} alt="Forgotten Island board" draggable="false" />
		<svg bind:this={svgEl} class="overlay" viewBox="0 0 {BOARD} {BOARD}" preserveAspectRatio="xMidYMid meet"
			on:pointerdown={addAt} on:pointermove={moveHandler} on:pointerup={upHandler} on:pointercancel={upHandler}>
			{#each hexes as h (h.id)}
				<polygon points={polyPoints(h.x, h.y, size, orientation, rot)} class="hex" class:sel={selectedId === h.id}
					on:pointerdown={(e) => hexDown(e, h)} />
			{/each}
		</svg>
	</div>

	<div class="panel">
		<h3>Board editor</h3>
		<p class="sub">Click the board to drop a hex. Drag to move it. Select one, then <b>Duplicate</b> to clone it to the next cell.</p>

		<label>Orientation
			<select bind:value={orientation}><option value="pointy">pointy-top</option><option value="flat">flat-top</option></select>
		</label>
		<label class="sl"><span>Hex size<b>{size}</b></span><input type="range" min="30" max="110" step="0.5" bind:value={size} /></label>
		<label class="sl"><span>Rotation°<b>{rot}</b></span><input type="range" min="-30" max="30" step="0.1" bind:value={rot} /></label>

		<div class="hint">Tip: perfect ONE hex (size + rotation) on a painted cell first, then Duplicate outward. Arrow keys nudge the selected hex (Shift = ×10); <b>D</b> duplicates; Delete removes.</div>

		<div class="row">
			<button on:click={duplicate} disabled={!selectedId}>⧉ Duplicate</button>
			<button class="danger" on:click={del} disabled={!selectedId}>Delete</button>
		</div>
		<div class="row">
			<button on:click={exportMap} disabled={!hexes.length}>{copied ? 'Copied!' : 'Export map JSON'}</button>
			<button class="g" on:click={clearAll} disabled={!hexes.length}>Clear</button>
		</div>
		<p class="count"><b>{hexes.length}</b> hexes{#if selectedId} · 1 selected{/if}</p>
	</div>
</div>

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 84px 16px 32px; display: flex; gap: 20px; flex-wrap: wrap; color: #e5e7eb; }
	.board-wrap { position: relative; flex: 1 1 520px; max-width: 760px; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
	.board-wrap img { width: 100%; height: 100%; display: block; user-select: none; }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
	.hex { fill: rgba(56,189,248,.18); stroke: rgba(56,189,248,.8); stroke-width: 2; cursor: pointer; }
	.hex:hover { fill: rgba(56,189,248,.4); }
	.hex.sel { fill: rgba(250,204,21,.4); stroke: #facc15; stroke-width: 3; }
	.panel { flex: 1 1 300px; max-width: 380px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 16px; height: fit-content; }
	.panel h3 { margin: 0 0 4px; } .sub { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
	label { display: block; font-size: 13px; margin-bottom: 10px; }
	label.sl span { display: flex; justify-content: space-between; margin-bottom: 3px; color: #cbd5e1; } label.sl b { color: #fff; }
	input[type=range] { width: 100%; }
	select { width: 100%; margin-top: 4px; background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 4px; }
	.hint { font-size: 11.5px; color: #93c5fd; background: #0b1220; border: 1px solid #1e3a5f; border-radius: 6px; padding: 8px; margin: 10px 0; line-height: 1.5; }
	.row { display: flex; gap: 8px; margin: 8px 0; }
	button { font-size: 13px; padding: 7px 12px; border-radius: 8px; background: #2563eb; color: #fff; border: none; cursor: pointer; flex: 1; }
	button:disabled { opacity: .4; cursor: default; }
	button.danger { background: #7f1d1d; } button.g { background: #374151; }
	.count { font-size: 12px; color: #9ca3af; }
</style>
