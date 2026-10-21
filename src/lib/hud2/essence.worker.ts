// Gydion's essence wisps, drawn off the page's main thread: EssenceWisps.svelte hands over a canvas (an OffscreenCanvas)
// with the flight; this worker runs the frames and says 'done' when it is over. (A frame loop on the page made every
// frame commit the page's whole layer tree: ~150 ms of main-thread work a second while they flew.)
import { flightPainter, type Flight } from './essence'

const raf: (f: (t: number) => void) => unknown = (self as unknown as { requestAnimationFrame?: (f: (t: number) => void) => number }).requestAnimationFrame?.bind(self) ?? ((f) => setTimeout(() => f(performance.now()), 16))
let run = 0
self.onmessage = (e: MessageEvent<{ canvas: OffscreenCanvas; flight: Flight; id: number }>) => {
	const { canvas, flight, id } = e.data
	const g = canvas.getContext('2d')
	if (!g) { self.postMessage({ id }); return }
	canvas.width = Math.round(flight.w * flight.dpr); canvas.height = Math.round(flight.h * flight.dpr)
	const me = ++run
	const draw = flightPainter(g, flight, () => { const cv = new OffscreenCanvas(64, 64); return { cv, g: cv.getContext('2d')! } })
	const t0 = performance.now()
	const step = () => { if (me !== run) return; if (draw(performance.now() - t0)) raf(step); else self.postMessage({ id }) }
	raf(step)
}
