<script lang="ts">
	// Prepare Spells, for everyone (the user's idea, 2026-10-19 — the soul-absorbing of Onimusha): one wisp of energy per
	// spell coming back into the book, each in its school's colour, bursts out of Gydion's token, circles it once and is
	// SUCKED in — into his dash grimoire on his own screen, back into his token on everyone else's — with a flash where
	// they land. Effects → Essence switches it off.
	// Speed pass (2026-10-20): drawn on ONE canvas over just the stretch they fly, by a Web Worker (essence.worker.ts; the
	// painter is essence.ts) — as 378 animated spans (21 wisps × 18 puffs) every puff that started re-styled all the
	// others (~250 ms of main-thread work a second, a 200 ms hitch at the start), and a frame loop on the page still
	// committed the whole page every frame. Browsers without OffscreenCanvas draw on the page. The canvas leaves when
	// the flight ends. Same path, sizes and fades as before.
	import { onDestroy, tick } from 'svelte'
	import { flightPainter, flightMs, TRAIL, GAP, type Pt, type Flight } from './essence'

	let box: { x: number; y: number; w: number; h: number; id: number } | null = null
	let cv: HTMLCanvasElement
	let flash: { key: number; x: number; y: number; c: string; delay: number } | null = null
	let raf = 0, ids = 0, worker: Worker | null | undefined
	let guard: ReturnType<typeof setTimeout> | null = null

	function rgb(c: string): [number, number, number] {
		const x = document.createElement('canvas').getContext('2d')
		if (!x) return [216, 179, 106]
		x.fillStyle = c; const v = String(x.fillStyle)
		if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number]
		const m = v.match(/[\d.]+/g) ?? ['216', '179', '106']; return [+m[0], +m[1], +m[2]]
	}
	function workerOf(): Worker | null {
		if (worker !== undefined) return worker
		worker = null
		if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return null
		try {
			worker = new Worker(new URL('./essence.worker.ts', import.meta.url), { type: 'module' })
			worker.onmessage = (e: MessageEvent<{ id: number }>) => done(e.data.id)
		} catch { worker = null }
		return worker
	}
	function done(id: number) {
		if (box?.id !== id) return
		box = null
		const key = flash?.key
		setTimeout(() => { if (flash?.key === key) flash = null }, 900)
	}

	/** from = his token, to = where they are absorbed (screen px), colors = one per spell */
	export async function play(from: Pt, to: Pt, colors: string[]) {
		if (!colors.length) return
		if (raf) cancelAnimationFrame(raf)
		const n = colors.length, key = Date.now(), id = ++ids
		const R = Math.max(58, Math.min(120, 34 + n * 4))
		const wisps = colors.map((c, i) => ({
			rgb: rgb(c), a0: (i / n) * Math.PI * 2 + Math.random() * 0.6, r: R * (0.7 + Math.random() * 0.5), dir: i % 2 ? 1 : -1,
			turns: 1.3 + Math.random() * 0.5, ph: Math.random() * 6, sw: 0.14 + Math.random() * 0.12, dur: 2100 + Math.random() * 400, delay: i * 50,
			jit: Array.from({ length: TRAIL }, (_, k) => [Math.sin((key + i) * 0.37 + k * 1.9) * k * 0.7, Math.cos((key + i) * 0.53 + k * 1.3) * k * 0.7] as [number, number])
		}))
		const end = flightMs(wisps)
		flash = { key, ...to, c: colors[colors.length - 1], delay: Math.round(end - (TRAIL - 1) * GAP - 520) }
		// the canvas covers the flight: both ends, the widest circle (radius × 1.2 × the sway) and the biggest puff
		const pad = R * 1.2 * 1.26 + 70
		const x = Math.floor(Math.min(from.x, to.x) - pad), y = Math.floor(Math.min(from.y, to.y) - pad)
		const w = Math.ceil(Math.abs(to.x - from.x) + pad * 2), h = Math.ceil(Math.abs(to.y - from.y) + pad * 2)
		box = { x, y, w, h, id }
		await tick()
		if (!cv || box?.id !== id) return
		// soft glows: drawn at no more than ~0.4 megapixels whatever the box or the screen, stretched by CSS
		const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(400000 / (w * h)))
		const flight: Flight = { w, h, dpr, from: { x: from.x - x, y: from.y - y }, to: { x: to.x - x, y: to.y - y }, wisps }
		// in case the worker never answers, the canvas still goes
		if (guard) clearTimeout(guard)
		guard = setTimeout(() => done(id), end + 1500)
		const wk = workerOf()
		if (wk) {
			try { const off = cv.transferControlToOffscreen(); wk.postMessage({ canvas: off, flight, id }, [off]); return } catch { /* draw on the page */ }
		}
		cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
		const g = cv.getContext('2d')
		if (!g) return done(id)
		const draw = flightPainter(g, flight, () => { const c = document.createElement('canvas'); c.width = c.height = 64; return { cv: c, g: c.getContext('2d')! } })
		const t0 = performance.now()
		const step = (now: number) => { if (box?.id !== id) return; if (draw(now - t0)) raf = requestAnimationFrame(step); else { raf = 0; done(id) } }
		raf = requestAnimationFrame(step)
	}
	onDestroy(() => { if (raf) cancelAnimationFrame(raf); if (guard) clearTimeout(guard); worker?.terminate() })
</script>

<div class="ess" aria-hidden="true">
	{#if box}{#key box.id}<canvas bind:this={cv} style="left:{box.x}px;top:{box.y}px;width:{box.w}px;height:{box.h}px"></canvas>{/key}{/if}
	{#if flash}{#key flash.key}<span class="fl" style="left:{flash.x}px;top:{flash.y}px;--c:{flash.c};animation-delay:{flash.delay}ms"></span><span class="fl f2" style="left:{flash.x}px;top:{flash.y}px;animation-delay:{flash.delay + 260}ms"></span>{/key}{/if}
</div>

<style>
	.ess { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
	canvas { position: absolute; }
	.fl { position: absolute; width: 90px; height: 90px; margin: -45px; border-radius: 50%; opacity: 0; transform: scale(0.2);
		background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0, color-mix(in srgb, var(--c, #d8b36a) 70%, transparent) 30%, transparent 68%); animation: essfl 0.9s ease-out both; }
	.fl.f2 { background: radial-gradient(circle, transparent 52%, rgba(255, 244, 210, 0.8) 58%, transparent 66%); }
	@keyframes essfl { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.5); } }
</style>
