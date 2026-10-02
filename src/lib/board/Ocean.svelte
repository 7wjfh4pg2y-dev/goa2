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
	// coast) and the foam washing in and out.
	//
	// COST (this runs on every screen, on every PC): the canvas is kept SMALL — about 0.65
	// megapixels whatever the window or pixel density, stretched by CSS (water is soft, it
	// does not show) — the shelf's six wide strokes are drawn once per view into a spare
	// canvas and copied, and the sea moves 20 times a second. A full-size canvas redrawn 30
	// times a second with those strokes was the single biggest load on weak machines.
	import { onMount } from 'svelte';
	import { intHash } from './hexgeo';

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
	let coastPath: Path2D | null = null;
	$: coastPath = typeof Path2D !== 'undefined' && coast ? new Path2D(coast) : null;
	let streaks: CanvasPattern | null = null, swells: CanvasPattern | null = null;
	/** the shelf bands, drawn once per view (they do not move) */
	let shelf: HTMLCanvasElement | null = null, shelfKey = '';
	const BUDGET = 650_000; // canvas pixels
	const STREAK_N = 512, SWELL_N = 256;

	// ── textures (made once): fractal value noise that tiles seamlessly, 0..1
	function tileNoise(n: number, cellsAcross: number, octaves: number, seed: number): Float32Array {
		const out = new Float32Array(n * n);
		let amp = 1, total = 0;
		for (let o = 0; o < octaves; o++) {
			const P = cellsAcross << o;
			const lat = new Float32Array(P * P);
			for (let i = 0; i < P * P; i++) lat[i] = intHash(i % P, (i / P) | 0, seed + o * 31);
			for (let y = 0; y < n; y++) {
				const fy = (y / n) * P, y0 = Math.floor(fy), y1 = (y0 + 1) % P, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
				for (let x = 0; x < n; x++) {
					const fx = (x / n) * P, x0 = Math.floor(fx), x1 = (x0 + 1) % P, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
					const a = lat[y0 * P + x0], b = lat[y0 * P + x1], c = lat[y1 * P + x0], d = lat[y1 * P + x1];
					out[y * n + x] += (a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy) * amp;
				}
			}
			total += amp;
			amp *= 0.5;
		}
		for (let i = 0; i < out.length; i++) out[i] /= total;
		return out;
	}
	const smooth = (lo: number, hi: number, v: number) => { const x = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return x * x * (3 - 2 * x); };
	function texture(n: number, rgb: [number, number, number], alphaAt: (i: number) => number): HTMLCanvasElement {
		const c = document.createElement('canvas');
		c.width = c.height = n;
		const cx = c.getContext('2d')!, img = cx.createImageData(n, n);
		for (let i = 0; i < n * n; i++) {
			img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2];
			img.data[i * 4 + 3] = Math.round(255 * alphaAt(i));
		}
		cx.putImageData(img, 0, 0);
		return c;
	}
	function makeTextures(ctx: CanvasRenderingContext2D) {
		// streaks: the thin places where the noise crosses its middle make winding lines; a
		// second, broader noise breaks them into patches so they never read as a net
		const a = tileNoise(STREAK_N, 5, 4, 7), m = tileNoise(STREAK_N, 3, 3, 91);
		streaks = ctx.createPattern(texture(STREAK_N, [226, 248, 255], (i) => smooth(0.9, 1, 1 - Math.abs(2 * a[i] - 1)) * smooth(0.4, 0.66, m[i])), 'repeat');
		// swells: wide, soft, darker water
		const s = tileNoise(SWELL_N, 3, 3, 203);
		swells = ctx.createPattern(texture(SWELL_N, [5, 52, 96], (i) => smooth(0.47, 0.72, s[i])), 'repeat');
	}

	function draw() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !W || !H) return;
		if (!streaks) makeTextures(ctx);
		// viewBox → css px ("xMidYMid meet"), then the board's own view transform
		const s = Math.min(W / bounds.w, H / bounds.h);
		const ox = (W - s * bounds.w) / 2 - s * bounds.a, oy = (H - s * bounds.h) / 2 - s * bounds.b;
		const A = s * view.a, B = s * view.b, C = s * view.c, D = s * view.d, E = s * view.e + ox, F = s * view.f + oy;
		const k = Math.hypot(A, B) || 1; // css px per board unit
		const det = A * D - B * C || 1;

		// ── open water: bright over the shelf round the island, deep further out
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const wx = bounds.a + bounds.w / 2, wy = bounds.b + bounds.h / 2;
		const sx = A * wx + C * wy + E, sy = B * wx + D * wy + F;
		const R = Math.max(bounds.w, bounds.h) * k;
		const g = ctx.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 1.25);
		g.addColorStop(0, '#2aaed0');
		g.addColorStop(0.42, '#1a8fc2');
		g.addColorStop(0.75, '#106ba3');
		g.addColorStop(1, '#0a4c82');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);

		ctx.setTransform(dpr * A, dpr * B, dpr * C, dpr * D, dpr * E, dpr * F); // board units from here on
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		// what part of the board is on screen
		const inv = (px: number, py: number) => ({ x: (D * (px - E) - C * (py - F)) / det, y: (-B * (px - E) + A * (py - F)) / det });
		const cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)];
		const x0 = Math.min(...cs.map((p) => p.x)), x1 = Math.max(...cs.map((p) => p.x));
		const y0 = Math.min(...cs.map((p) => p.y)), y1 = Math.max(...cs.map((p) => p.y));
		// one layer of texture: `tile` board units across, stretched along the swell, turned, and drifting
		const layer = (p: CanvasPattern | null, n: number, tile: number, stretch: number, deg: number, dx: number, dy: number, alpha: number) => {
			if (!p) return;
			p.setTransform(new DOMMatrix().translateSelf(dx, dy).rotateSelf(deg).scaleSelf((tile * stretch) / n, tile / n));
			ctx.globalAlpha = alpha;
			ctx.fillStyle = p;
			ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
		};
		const u = size; // speeds are in hexes per second
		layer(swells, SWELL_N, u * 26, 1.5, 12, t * u * 0.1, t * u * 0.035, 0.5);

		// ── the shelf: the sea floor rising to the island, as soft bands hugging the coast
		//    (kept in a spare canvas: redrawn only when the view changes)
		ctx.globalAlpha = 1;
		if (coastPath) {
			const key = [A, B, C, D, E, F, canvas.width, canvas.height, size, coast.length].join();
			if (!shelf) shelf = document.createElement('canvas');
			if (key !== shelfKey) {
				shelfKey = key;
				shelf.width = canvas.width; shelf.height = canvas.height;
				const sc = shelf.getContext('2d')!;
				sc.setTransform(dpr * A, dpr * B, dpr * C, dpr * D, dpr * E, dpr * F);
				sc.lineCap = 'round'; sc.lineJoin = 'round';
				for (const [w, c] of [[6.2, 'rgba(60,196,222,.07)'], [4.9, 'rgba(70,204,226,.09)'], [3.8, 'rgba(84,212,230,.11)'], [2.8, 'rgba(104,222,234,.13)'], [1.95, 'rgba(130,230,238,.16)'], [1.3, 'rgba(166,240,242,.22)']] as Array<[number, string]>) {
					sc.lineWidth = size * w;
					sc.strokeStyle = c;
					sc.stroke(coastPath);
				}
			}
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(shelf, 0, 0);
			ctx.setTransform(dpr * A, dpr * B, dpr * C, dpr * D, dpr * E, dpr * F);
		}

		// ── light on the water: the same streaks twice, at different sizes and angles, crossing
		layer(streaks, STREAK_N, u * 13, 2.4, 8, t * u * 0.16, t * u * 0.05, 0.3);
		layer(streaks, STREAK_N, u * 21, 2.0, -14, -t * u * 0.09, t * u * 0.075, 0.2);
		ctx.globalAlpha = 1;

		// ── foam: two bands along the coast, breathing out of step (the island's own
		//    sand covers their inner half, so only the wash outside the shore shows)
		if (coastPath) {
			const b1 = 0.5 + 0.5 * Math.sin(t * 0.8), b2 = 0.5 + 0.5 * Math.sin(t * 0.8 + 2.1);
			ctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.1 * (1 - b2)).toFixed(3)})`;
			ctx.lineWidth = size * (1.25 + 0.4 * b2);
			ctx.stroke(coastPath);
			ctx.strokeStyle = `rgba(240,253,255,${(0.42 + 0.22 * (1 - b1)).toFixed(3)})`;
			ctx.lineWidth = size * (0.86 + 0.2 * b1);
			ctx.stroke(coastPath);
		}

		// ── the edges of the view fall away into deep water
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
		vg.addColorStop(0, 'rgba(3,28,60,0)');
		vg.addColorStop(1, 'rgba(3,28,60,.42)');
		ctx.fillStyle = vg;
		ctx.fillRect(0, 0, W, H);
	}

	// redraw as soon as something the picture depends on changes (pan / zoom must not lag behind
	// the island); one draw per frame at most
	let queued = 0;
	function soon() { if (!queued && typeof requestAnimationFrame !== 'undefined') queued = requestAnimationFrame(() => { queued = 0; draw(); }); }
	$: if (canvas) { void view; void bounds; void coastPath; void W; void H; void size; void still; soon(); }

	onMount(() => {
		reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const fit = () => {
			W = canvas.clientWidth; H = canvas.clientHeight;
			// `dpr` = canvas pixels per css px: never more than the screen's, and capped by the pixel budget
			dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(BUDGET / Math.max(1, W * H)));
			canvas.width = Math.max(1, Math.round(W * dpr));
			canvas.height = Math.max(1, Math.round(H * dpr));
			draw();
		};
		const ro = new ResizeObserver(fit);
		ro.observe(canvas);
		fit();
		// A plain 20-a-second timer (the water drifts well under a pixel per step), NOT requestAnimationFrame: a rAF loop makes the page produce a full frame at
		// the display's rate (60+/s) even on the ticks where the sea isn't redrawn, and every such frame also
		// re-ticks the board's GPU animations on the main thread (measured: about twice the idle work).
		let last = performance.now();
		const timer = setInterval(() => {
			const now = performance.now();
			if (still || reduce || document.hidden) { last = now; return; }
			t += Math.min(0.1, (now - last) / 1000);
			last = now;
			draw();
		}, 50);
		return () => { clearInterval(timer); ro.disconnect(); if (queued) cancelAnimationFrame(queued); };
	});
</script>

<canvas bind:this={canvas} class="ocean" aria-hidden="true"></canvas>

<style>
	.ocean { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #106ba3; }
</style>
