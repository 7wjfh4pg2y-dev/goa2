<script lang="ts">
	import { onMount } from 'svelte'
	import boardUrl from '$lib/images/board/forgotten_island.webp'

	// The board image is 2000x2000. We express the hex grid in the board's own
	// pixel coordinates via an SVG viewBox of 0..2000, so calibration values are
	// resolution-independent and portable regardless of on-screen size.
	const BOARD = 2000

	type Cal = {
		orientation: 'pointy' | 'flat'
		size: number // center-to-corner radius, in board px
		ox: number // x of grid origin (col 0,row 0 center)
		oy: number
		cols: number
		rows: number
		rot: number // whole-grid rotation in degrees (board is slightly tilted)
		opacity: number
		show: boolean
	}

	const DEFAULT: Cal = {
		orientation: 'pointy',
		size: 60,
		ox: 210,
		oy: 190,
		cols: 17,
		rows: 19,
		rot: 0,
		opacity: 0.6,
		show: true,
	}

	let cal: Cal = { ...DEFAULT }
	let hovered = -1

	const KEY = 'goa2-hex-cal-v1'
	onMount(() => {
		try {
			const s = localStorage.getItem(KEY)
			if (s) cal = { ...DEFAULT, ...JSON.parse(s) }
		} catch {}
	})
	$: try { localStorage.setItem(KEY, JSON.stringify(cal)) } catch {}

	const SQRT3 = Math.sqrt(3)

	// Hex center for offset coords (odd-r for pointy, odd-q for flat).
	function center(c: number, r: number, k: Cal) {
		if (k.orientation === 'pointy') {
			const x = k.ox + k.size * SQRT3 * (c + 0.5 * (r & 1))
			const y = k.oy + k.size * 1.5 * r
			return [x, y]
		} else {
			const x = k.ox + k.size * 1.5 * c
			const y = k.oy + k.size * SQRT3 * (r + 0.5 * (c & 1))
			return [x, y]
		}
	}

	function polyPoints(cx: number, cy: number, s: number, orient: 'pointy' | 'flat') {
		const pts = []
		for (let i = 0; i < 6; i++) {
			const ang = (Math.PI / 180) * (60 * i + (orient === 'pointy' ? -90 : 0))
			pts.push([cx + s * Math.cos(ang), cy + s * Math.sin(ang)])
		}
		return pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
	}

	type Hex = { id: number; c: number; r: number; pts: string }
	$: hexes = (() => {
		const out: Hex[] = []
		let id = 0
		const margin = cal.size
		for (let r = 0; r < cal.rows; r++) {
			for (let c = 0; c < cal.cols; c++) {
				const [cx, cy] = center(c, r, cal)
				if (cx < -margin || cx > BOARD + margin || cy < -margin || cy > BOARD + margin) {
					id++
					continue
				}
				out.push({ id: id++, c, r, pts: polyPoints(cx, cy, cal.size, cal.orientation) })
			}
		}
		return out
	})()

	let copied = false
	async function copyCal() {
		try { await navigator.clipboard.writeText(JSON.stringify(cal, null, 2)); copied = true; setTimeout(() => (copied = false), 1500) } catch {}
	}
	function reset() { cal = { ...DEFAULT } }
</script>

<svelte:head><title>Board Calibration — Guards of Atlantis</title></svelte:head>

<div class="page">
	<div class="board-wrap">
		<img src={boardUrl} alt="Forgotten Island board" draggable="false" />
		{#if cal.show}
			<svg class="overlay" viewBox="0 0 {BOARD} {BOARD}" preserveAspectRatio="xMidYMid meet">
				<g transform="rotate({cal.rot} {BOARD / 2} {BOARD / 2})">
					{#each hexes as h (h.id)}
						<polygon
							points={h.pts}
							class="hex"
							class:hovered={hovered === h.id}
							style="stroke: rgba(255,60,60,{cal.opacity})"
							on:pointerenter={() => (hovered = h.id)}
							on:pointerleave={() => (hovered === h.id && (hovered = -1))}
						/>
					{/each}
				</g>
			</svg>
		{/if}
	</div>

	<div class="panel">
		<h3>Hex grid calibration</h3>
		<p class="sub">Nudge until the red grid sits on the board's printed hexes. Values are in board pixels (0–2000).</p>

		<label>Orientation
			<select bind:value={cal.orientation}>
				<option value="pointy">pointy-top</option>
				<option value="flat">flat-top</option>
			</select>
		</label>

		{#each [ ['rot','Rotation°',-15,15,0.1], ['size','Hex size',20,120,0.5], ['ox','Origin X',-200,600,1], ['oy','Origin Y',-200,600,1], ['cols','Columns',1,40,1], ['rows','Rows',1,40,1], ['opacity','Line opacity',0,1,0.05] ] as [key,label,min,max,step]}
			<label class="slider">
				<span>{label}<b>{cal[key]}</b></span>
				<input type="range" min={min} max={max} step={step} bind:value={cal[key]} />
			</label>
		{/each}

		<label class="check"><input type="checkbox" bind:checked={cal.show} /> Show grid</label>

		<div class="row">
			<button on:click={copyCal}>{copied ? 'Copied!' : 'Copy calibration JSON'}</button>
			<button class="ghost" on:click={reset}>Reset</button>
		</div>
		<p class="count">{hexes.length} hexes drawn · hover one to test hittability</p>
		<pre class="json">{JSON.stringify(cal)}</pre>
	</div>
</div>

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 84px 16px 32px; display: flex; gap: 20px; flex-wrap: wrap; color: #e5e7eb; }
	.board-wrap { position: relative; flex: 1 1 520px; max-width: 760px; aspect-ratio: 1 / 1; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
	.board-wrap img { width: 100%; height: 100%; display: block; user-select: none; }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
	.hex { fill: transparent; stroke-width: 2; pointer-events: all; transition: fill 0.08s; }
	.hex:hover, .hex.hovered { fill: rgba(80,180,255,0.35); stroke: #38bdf8 !important; }
	.panel { flex: 1 1 300px; max-width: 380px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 16px; height: fit-content; }
	.panel h3 { margin: 0 0 4px; }
	.sub { font-size: 12px; color: #9ca3af; margin: 0 0 14px; }
	label { display: block; font-size: 13px; margin-bottom: 12px; }
	label.slider span { display: flex; justify-content: space-between; margin-bottom: 4px; color: #cbd5e1; }
	label.slider b { color: #fff; }
	input[type=range] { width: 100%; }
	select { width: 100%; margin-top: 4px; background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 4px; }
	.check { display: flex; align-items: center; gap: 8px; }
	.row { display: flex; gap: 8px; margin: 8px 0; }
	button { font-size: 13px; padding: 7px 12px; border-radius: 8px; background: #2563eb; color: #fff; border: none; cursor: pointer; }
	button.ghost { background: #374151; }
	.count { font-size: 12px; color: #9ca3af; }
	.json { font-size: 11px; background: #0b1220; border: 1px solid #374151; border-radius: 6px; padding: 8px; overflow-x: auto; color: #93c5fd; }
</style>
