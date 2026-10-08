<script lang="ts">
	// The sea the island sits in: one canvas behind the board. Everything is drawn in BOARD
	// coordinates through the same view matrix as the board's svg, so the water pans, zooms
	// and turns with the island. It never touches the svg above it, so the board itself is
	// not repainted while the sea animates.
	//
	// The open water is two soft textures made once from noise — broad darker swells, and a
	// broken net of pale streaks (light on the surface) — the streaks laid down twice at
	// different sizes and angles, sliding past each other, which is what makes water look
	// like water instead of a pattern. Round the island: the shelf (pale bands hugging the
	// coast) and the foam washing in and out. The painting itself is `seaPaint.ts`.
	//
	// COST (this runs on every screen, on every PC): the canvas is kept SMALL — about 0.65
	// megapixels whatever the window or pixel density, stretched by CSS (water is soft, it
	// does not show) — the shelf's six wide strokes are drawn once per view into a spare
	// canvas and copied, and the sea moves 20 times a second. And it is drawn OFF the page's
	// main thread: the canvas is handed to a Web Worker (`sea.worker.ts`, an OffscreenCanvas),
	// so the page never waits on it. Measured without a GPU canvas: rasterising the sea took
	// over half of the main thread (~540 ms of every second) — now it takes none. Browsers
	// without OffscreenCanvas draw it here, on a 20-a-second timer, as before.
	import { onMount } from 'svelte';
	import { paintSea, seaPatterns, type SeaCache } from './seaPaint';

	/** the board svg's viewBox */
	export let bounds = { a: 0, b: 0, w: 100, h: 100 };
	/** the board's view transform (pan / zoom / rotate), in viewBox units */
	export let view = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
	/** the island's coastline (svg path, board units) */
	export let coast = '';
	export let size = 60;
	/** draw once per change instead of animating (also forced by "reduce motion") */
	export let still = false;

	let canvas: HTMLCanvasElement;
	let W = 0, H = 0, dpr = 1;
	let t = 0;
	let reduce = false;
	let worker: Worker | null = null;
	let coastPath: Path2D | null = null;
	$: coastPath = !worker && typeof Path2D !== 'undefined' && coast ? new Path2D(coast) : null;
	let streaks: CanvasPattern | null = null, swells: CanvasPattern | null = null;
	/** the shelf bands, drawn once per view (they do not move) */
	const cache: SeaCache = { shelf: null, key: '' };
	$: { void coastPath; cache.key = ''; } // a new coastline redraws the shelf
	const BUDGET = 650_000; // canvas pixels

	function draw() {
		if (worker) return;
		const ctx = canvas?.getContext('2d');
		if (!ctx || !W || !H) return;
		if (!streaks) ({ streaks, swells } = seaPatterns(ctx));
		// viewBox → css px ("xMidYMid meet"), then the board's own view transform
		const s = Math.min(W / bounds.w, H / bounds.h);
		const ox = (W - s * bounds.w) / 2 - s * bounds.a, oy = (H - s * bounds.h) / 2 - s * bounds.b;
		const m = { A: s * view.a, B: s * view.b, C: s * view.c, D: s * view.d, E: s * view.e + ox, F: s * view.f + oy };
		paintSea(ctx, { W, H, dpr, bounds, m, coastPath, size, t, streaks, swells, cache });
	}

	// tell the worker what changed (it draws on its next frame), or draw here — at most once a frame
	let queued = 0;
	function soon() { if (!queued && typeof requestAnimationFrame !== 'undefined') queued = requestAnimationFrame(() => { queued = 0; draw(); }); }
	$: if (worker) worker.postMessage({ view, bounds, size, still: still || reduce });
	$: if (worker) worker.postMessage({ coast });
	$: if (canvas && !worker) { void view; void bounds; void coastPath; void W; void H; void size; void still; soon(); }

	function startWorker(): Worker | null {
		if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !('transferControlToOffscreen' in canvas)) return null;
		try {
			const w = new Worker(new URL('./sea.worker.ts', import.meta.url), { type: 'module' });
			const off = canvas.transferControlToOffscreen();
			w.postMessage({ canvas: off, W, H, dpr, view, bounds, coast, size, still: still || reduce }, [off]);
			return w;
		} catch {
			return null;
		}
	}

	onMount(() => {
		reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const measure = () => {
			W = canvas.clientWidth; H = canvas.clientHeight;
			// `dpr` = canvas pixels per css px: never more than the screen's, and capped by the pixel budget
			dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(BUDGET / Math.max(1, W * H)));
		};
		measure();
		worker = startWorker();
		const fit = () => {
			measure();
			if (worker) { worker.postMessage({ W, H, dpr }); return; }
			canvas.width = Math.max(1, Math.round(W * dpr));
			canvas.height = Math.max(1, Math.round(H * dpr));
			draw();
		};
		const ro = new ResizeObserver(fit);
		ro.observe(canvas);
		fit();
		const vis = () => worker?.postMessage({ hidden: document.hidden });
		document.addEventListener('visibilitychange', vis);
		// A plain 20-a-second timer (the water drifts well under a pixel per step), NOT requestAnimationFrame: a rAF loop makes the page produce a full frame at
		// the display's rate (60+/s) even on the ticks where the sea isn't redrawn, and every such frame also
		// re-ticks the board's GPU animations on the main thread (measured: about twice the idle work).
		let last = performance.now();
		const timer = worker ? 0 : setInterval(() => {
			const now = performance.now();
			if (still || reduce || document.hidden) { last = now; return; }
			t += Math.min(0.1, (now - last) / 1000);
			last = now;
			draw();
		}, 50);
		return () => { if (timer) clearInterval(timer); ro.disconnect(); document.removeEventListener('visibilitychange', vis); if (queued) cancelAnimationFrame(queued); worker?.terminate(); worker = null; };
	});
</script>

<canvas bind:this={canvas} class="ocean" aria-hidden="true"></canvas>

<style>
	.ocean { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #106ba3; }
</style>
