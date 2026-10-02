<script lang="ts">
	// The sea the island sits in: one canvas behind the board. Everything is drawn in BOARD
	// coordinates through the same view matrix as the board's svg, so the water pans, zooms
	// and turns with the island. Three things move: wave crests drifting on the wind, the
	// foam washing in and out along the coast, and the shallows' glow. It never touches the
	// svg above it, so the board itself is not repainted while the sea animates.
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

	function draw() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !W || !H) return;
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
		const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
		vg.addColorStop(0, 'rgba(3,28,60,0)');
		vg.addColorStop(1, 'rgba(3,28,60,.4)');
		ctx.fillStyle = vg;
		ctx.fillRect(0, 0, W, H);

		ctx.setTransform(dpr * A, dpr * B, dpr * C, dpr * D, dpr * E, dpr * F); // board units from here on
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// ── the shelf: the sea floor rising to the island, as soft bands hugging the coast
		if (coastPath) {
			for (const [w, c] of [[6.2, 'rgba(60,196,222,.07)'], [4.9, 'rgba(70,204,226,.09)'], [3.8, 'rgba(84,212,230,.11)'], [2.8, 'rgba(104,222,234,.13)'], [1.95, 'rgba(130,230,238,.16)'], [1.3, 'rgba(166,240,242,.22)']] as Array<[number, string]>) {
				ctx.lineWidth = size * w;
				ctx.strokeStyle = c;
				ctx.stroke(coastPath);
			}
		}

		// ── wave crests: little arcs on a grid of cells, each drifting across its own cell
		const inv = (px: number, py: number) => ({ x: (D * (px - E) - C * (py - F)) / det, y: (-B * (px - E) + A * (py - F)) / det });
		const cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)];
		const x0 = Math.min(...cs.map((p) => p.x)), x1 = Math.max(...cs.map((p) => p.x));
		const y0 = Math.min(...cs.map((p) => p.y)), y1 = Math.max(...cs.map((p) => p.y));
		let G = size * 2.3;
		while (G * k < 58 || ((x1 - x0) / G) * ((y1 - y0) / G) > 1500) G *= 2; // fewer, bigger crests when zoomed far out
		const lw = Math.max(size * 0.05, 1.3 / k);
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = lw;
		for (let gx = Math.floor(x0 / G) - 1; gx <= Math.ceil(x1 / G); gx++) {
			for (let gy = Math.floor(y0 / G) - 1; gy <= Math.ceil(y1 / G); gy++) {
				for (let j = 0; j < 2; j++) {
					const h1 = intHash(gx, gy, 11 + j), h2 = intHash(gx, gy, 23 + j), h3 = intHash(gx, gy, 37 + j), h4 = intHash(gx, gy, 51 + j);
					const fr = (h1 + t * (0.035 + 0.03 * h3)) % 1; // where it is across its cell (wraps while invisible)
					const alpha = Math.sin(Math.PI * fr) ** 2 * (0.16 + 0.26 * h4);
					if (alpha < 0.02) continue;
					const L = G * (0.2 + 0.26 * h3);
					const x = (gx + fr) * G, y = (gy + h2) * G + Math.sin(t * 0.9 + h4 * 6.28) * size * 0.07;
					ctx.globalAlpha = alpha;
					ctx.beginPath();
					ctx.moveTo(x - L / 2, y);
					ctx.quadraticCurveTo(x, y - L * 0.22, x + L / 2, y);
					ctx.stroke();
				}
			}
		}
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
	}

	// without animation: redraw whenever something the picture depends on changes
	$: if (canvas && (still || reduce)) { void view; void bounds; void coastPath; void W; void H; void size; draw(); }

	onMount(() => {
		reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const fit = () => {
			dpr = Math.min(window.devicePixelRatio || 1, 1.5); // the sea is soft: no need for full retina
			W = canvas.clientWidth; H = canvas.clientHeight;
			canvas.width = Math.max(1, Math.round(W * dpr));
			canvas.height = Math.max(1, Math.round(H * dpr));
			draw();
		};
		const ro = new ResizeObserver(fit);
		ro.observe(canvas);
		fit();
		let raf = 0, last = 0;
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			if (still || reduce || document.hidden) { last = now; return; }
			if (now - last < 31) return; // ~30 fps is plenty for water
			t += Math.min(0.1, (now - last) / 1000);
			last = now;
			draw();
		};
		raf = requestAnimationFrame(frame);
		return () => { cancelAnimationFrame(raf); ro.disconnect(); };
	});
</script>

<canvas bind:this={canvas} class="ocean" aria-hidden="true"></canvas>

<style>
	.ocean { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #106ba3; }
</style>
