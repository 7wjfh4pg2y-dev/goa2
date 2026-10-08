// The sea, drawn off the page's main thread: Ocean.svelte hands its canvas over (an OffscreenCanvas) and posts what
// the picture depends on — the size, the board's view, the coastline, still or moving. This worker owns the clock:
// 20 steps a second while the sea moves (the water drifts well under a pixel a step), and one fresh frame whenever
// the view changes, so pan / zoom never wait for the next step.
import { paintSea, seaPatterns, type SeaCache } from './seaPaint';

type Msg = Partial<{ canvas: OffscreenCanvas; W: number; H: number; dpr: number; view: { a: number; b: number; c: number; d: number; e: number; f: number };
	bounds: { a: number; b: number; w: number; h: number }; coast: string; size: number; still: boolean; hidden: boolean }>;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let W = 0, H = 0, dpr = 1, size = 60, still = false, hidden = false, t = 0;
let view = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, bounds = { a: 0, b: 0, w: 100, h: 100 };
let coastPath: Path2D | null = null, coast = '';
let streaks: CanvasPattern | null = null, swells: CanvasPattern | null = null;
const cache: SeaCache = { shelf: null, key: '' };

function draw() {
	if (!ctx || !canvas || !W || !H) return;
	if (!streaks) ({ streaks, swells } = seaPatterns(ctx));
	const s = Math.min(W / bounds.w, H / bounds.h);
	const ox = (W - s * bounds.w) / 2 - s * bounds.a, oy = (H - s * bounds.h) / 2 - s * bounds.b;
	const m = { A: s * view.a, B: s * view.b, C: s * view.c, D: s * view.d, E: s * view.e + ox, F: s * view.f + oy };
	paintSea(ctx, { W, H, dpr, bounds, m, coastPath, size, t, streaks, swells, cache });
}

// one draw per frame at most when messages arrive in a burst (a drag posts the view on every pointer move)
const raf: (f: () => void) => unknown = (self as unknown as { requestAnimationFrame?: (f: () => void) => number }).requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(f, 16));
let queued = false;
function soon() { if (queued) return; queued = true; raf(() => { queued = false; draw(); }); }

self.onmessage = (e: MessageEvent<Msg>) => {
	const d = e.data;
	if (d.canvas) { canvas = d.canvas; ctx = canvas.getContext('2d'); }
	let resized = false;
	if (d.W !== undefined && (d.W !== W || d.H !== H || d.dpr !== dpr)) { W = d.W; H = d.H ?? H; dpr = d.dpr ?? dpr; resized = true; }
	if (d.view) view = d.view;
	if (d.bounds) bounds = d.bounds;
	if (d.size !== undefined) size = d.size;
	if (d.still !== undefined) still = d.still;
	if (d.hidden !== undefined) hidden = d.hidden;
	if (d.coast !== undefined && d.coast !== coast) { coast = d.coast; coastPath = coast ? new Path2D(coast) : null; cache.key = ''; }
	if (resized && canvas) { canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr)); cache.key = ''; }
	soon();
};

let last = performance.now();
setInterval(() => {
	const now = performance.now();
	if (still || hidden) { last = now; return; }
	t += Math.min(0.1, (now - last) / 1000);
	last = now;
	draw();
}, 50);
