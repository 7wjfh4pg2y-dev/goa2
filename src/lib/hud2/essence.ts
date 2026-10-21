// Gydion's essence wisps (EssenceWisps.svelte): the flight and the painting, shared by the worker that normally draws
// them (essence.worker.ts, off the main thread) and the page fallback for browsers without OffscreenCanvas.
export type Pt = { x: number; y: number }
export type WispSpec = { rgb: [number, number, number]; a0: number; r: number; dir: number; turns: number; ph: number; sw: number; dur: number; delay: number; jit: [number, number][] }
export type Flight = { w: number; h: number; dpr: number; from: Pt; to: Pt; wisps: WispSpec[] }
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Spr = { smoke: CanvasImageSource; core: CanvasImageSource; halo: CanvasImageSource }

// the head + seventeen puffs of smoke flying the same path a beat behind; further back = bigger, fainter, a little
// off the line (the trail wavers and spreads like smoke — the user, 2026-10-20: flowy, longer, ghostly)
export const TRAIL = 18
export const GAP = 20 // ms between puffs
const SPR = 64
const ss = (e0: number, e1: number, x: number) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u) }

/** how long the whole flight lasts (ms): the last wisp's last puff */
export const flightMs = (ws: WispSpec[]) => Math.max(...ws.map((w) => w.dur + w.delay)) + (TRAIL - 1) * GAP

/** the puffs, painted once per colour: smoke (the colour mixed 70 % with white → 40 % of the colour → clear), the
 *  head's bright core and its halo */
function sprites(make: () => { cv: CanvasImageSource; g: Ctx }, [r, g, b]: [number, number, number]): Spr {
	const paint = (stops: [number, string][]) => {
		const { cv, g: x } = make(), gr = x.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2)
		for (const [o, col] of stops) gr.addColorStop(o, col)
		x.fillStyle = gr; x.fillRect(0, 0, SPR, SPR); return cv
	}
	const w = (k: number) => [r, g, b].map((v) => Math.round(v * k + 255 * (1 - k))).join(',')
	const c = `${r},${g},${b}`
	return {
		smoke: paint([[0, `rgb(${w(0.7)})`], [0.34, `rgba(${c},0.4)`], [0.68, `rgba(${c},0)`], [1, `rgba(${c},0)`]]),
		core: paint([[0, '#fff'], [0.22, '#fff'], [0.48, `rgb(${c})`], [0.74, `rgba(${c},0)`], [1, `rgba(${c},0)`]]),
		halo: paint([[0, `rgba(${c},0.55)`], [0.66, `rgba(${c},0)`], [1, `rgba(${c},0)`]])
	}
}

/** a drawer for one flight: call it with the ms since the flight began; it returns false once the flight is over */
export function flightPainter(g: Ctx, f: Flight, make: () => { cv: CanvasImageSource; g: Ctx }) {
	const spr = f.wisps.map((w) => sprites(make, w.rgb)), end = flightMs(f.wisps)
	return (el: number): boolean => {
		g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); g.clearRect(0, 0, f.w, f.h)
		f.wisps.forEach((w, i) => {
			for (let k = 0; k < TRAIL; k++) {
				const t = (el - w.delay - k * GAP) / w.dur
				if (t <= 0 || t >= 1) continue
				// a spiral round a centre that slides from his token to where they land: it unwinds out of the token,
				// circles about one and a half turns with a slow breathing sway, then winds in tight as the centre glides home
				const m = ss(0.5, 1, t)
				const cx = f.from.x + (f.to.x - f.from.x) * m, cy = f.from.y + (f.to.y - f.from.y) * m
				const rho = w.r * ss(0, 0.22, t) * (1 - ss(0.55, 1, t)) * (1 + w.sw * Math.sin(t * 9 + w.ph))
				const th = w.a0 + w.dir * t * w.turns * Math.PI * 2 + 0.5 * Math.sin(t * 5 + w.ph)
				const s = t < 0.12 ? 0.3 + (t / 0.12) * 0.7 : t > 0.86 ? 1 - ((t - 0.86) / 0.14) * 0.75 : 1
				g.globalAlpha = (t < 0.06 ? t / 0.06 : t > 0.94 ? 1 - (t - 0.94) / 0.06 : 1) * (k ? 0.46 - k * 0.024 : 1)
				const px = cx + rho * Math.cos(th) + w.jit[k][0] * s, py = cy + rho * Math.sin(th) + w.jit[k][1] * s
				if (k) { const d = (14 + k * 2.4) * s; g.drawImage(spr[i].smoke, px - d / 2, py - d / 2, d, d) }
				else { const h = 76 * s, d = 20 * s; g.drawImage(spr[i].core, px - d / 2, py - d / 2, d, d); g.drawImage(spr[i].halo, px - h / 2, py - h / 2, h, h) } // the halo over the core
			}
		})
		g.globalAlpha = 1
		return el < end
	}
}
