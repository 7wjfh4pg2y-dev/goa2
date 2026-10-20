<script lang="ts">
	// Prepare Spells, for everyone (the user's idea, 2026-10-19 — the soul-absorbing of Onimusha): one wisp of energy per
	// spell coming back into the book, each in its school's colour, bursts out of Gydion's token, circles it once and is
	// SUCKED in — into his dash grimoire on his own screen, back into his token on everyone else's — with a flash where
	// they land. Effects → Essence switches it off. A fixed layer over the game; only transform / opacity animate
	// (WAAPI keyframes on small spans), every element leaves the page when its flight ends.
	import { onDestroy } from 'svelte'

	type Pt = { x: number; y: number }
	type Wisp = { key: number; c: string; frames: Keyframe[]; dur: number; delay: number }
	let wisps: Wisp[] = []
	let flash: { key: number; x: number; y: number; c: string; delay: number } | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	// the head + seventeen puffs of smoke flying the same path a beat behind; further back = bigger, fainter, a little
	// off the line (the trail wavers and spreads like smoke — the user, 2026-10-20: flowy, longer, ghostly)
	const TRAIL = Array.from({ length: 18 }, (_, k) => k)
	const GAP = 20 // ms between puffs

	/** from = his token, to = where they are absorbed (screen px), colors = one per spell */
	export function play(from: Pt, to: Pt, colors: string[]) {
		if (!colors.length) return
		const n = colors.length, base = Date.now()
		const R = Math.max(58, Math.min(120, 34 + n * 4))
		const ss = (e0: number, e1: number, x: number) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u) }
		const tf = (x: number, y: number, s: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(2)})`
		wisps = colors.map((c, i) => {
			// a spiral round a centre that slides from his token to where they land: it unwinds out of the token, circles
			// about one and a half turns with a slow breathing sway, then winds in tight as the centre glides home
			const a0 = (i / n) * Math.PI * 2 + Math.random() * 0.6, r = R * (0.7 + Math.random() * 0.5)
			const dir = i % 2 ? 1 : -1, turns = 1.3 + Math.random() * 0.5, ph = Math.random() * 6, sw = 0.14 + Math.random() * 0.12
			const frames: Keyframe[] = []
			const N = 36
			for (let j = 0; j <= N; j++) {
				const t = j / N, m = ss(0.5, 1, t)
				const cx = from.x + (to.x - from.x) * m, cy = from.y + (to.y - from.y) * m
				const rho = r * ss(0, 0.22, t) * (1 - ss(0.55, 1, t)) * (1 + sw * Math.sin(t * 9 + ph))
				const th = a0 + dir * t * turns * Math.PI * 2 + 0.5 * Math.sin(t * 5 + ph)
				const s = t < 0.12 ? 0.3 + (t / 0.12) * 0.7 : t > 0.86 ? 1 - ((t - 0.86) / 0.14) * 0.75 : 1
				frames.push({ transform: tf(cx + rho * Math.cos(th), cy + rho * Math.sin(th), s), opacity: t < 0.06 ? t / 0.06 : t > 0.94 ? 1 - (t - 0.94) / 0.06 : 1, offset: t })
			}
			return { key: base + i, c, frames, dur: 2100 + Math.random() * 400, delay: i * 50 }
		})
		const end = Math.max(...wisps.map((w) => w.dur + w.delay))
		flash = { key: base, ...to, c: colors[colors.length - 1], delay: Math.round(end - 520) }
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => { wisps = []; flash = null }, end + TRAIL.length * GAP + 900)
	}
	/** a Svelte action: run the flight on a span (the trail = the same flight a beat behind) */
	function fly(node: HTMLElement, a: { w: Wisp; k: number }) {
		const an = node.animate(a.w.frames, { duration: a.w.dur, delay: a.w.delay + a.k * GAP, fill: 'both' })
		return { destroy: () => an.cancel() }
	}
	/** each puff's fixed drift off the line (a smoke trail wavers) */
	const jit = (key: number, k: number) => { const v = Math.sin(key * 0.37 + k * 1.9) * k * 0.7; return `${v.toFixed(1)}px, ${(Math.cos(key * 0.53 + k * 1.3) * k * 0.7).toFixed(1)}px` }
	onDestroy(() => { if (timer) clearTimeout(timer) })
</script>

<div class="ess" aria-hidden="true">
	{#each wisps as w (w.key)}
		{#each TRAIL as k}<span class="w" class:hd={!k} style="--c:{w.c};--k:{k};--j:{jit(w.key, k)}" use:fly={{ w, k }}><i></i></span>{/each}
	{/each}
	{#if flash}{#key flash.key}<span class="fl" style="left:{flash.x}px;top:{flash.y}px;--c:{flash.c};animation-delay:{flash.delay}ms"></span><span class="fl f2" style="left:{flash.x}px;top:{flash.y}px;animation-delay:{flash.delay + 260}ms"></span>{/key}{/if}
</div>

<style>
	.ess { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
	.w { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; }
	/* smoke: a soft puff in the spell's colour fading to pale, bigger and fainter further back */
	.w i { position: absolute; width: calc(14px + var(--k) * 2.4px); height: calc(14px + var(--k) * 2.4px); left: calc(-7px - var(--k) * 1.2px); top: calc(-7px - var(--k) * 1.2px); border-radius: 50%;
		transform: translate(var(--j)); background: radial-gradient(circle, color-mix(in srgb, var(--c) 70%, #fff) 0, color-mix(in srgb, var(--c) 40%, transparent) 34%, transparent 68%);
		opacity: calc(0.46 - var(--k) * 0.024); }
	.w.hd i { width: 20px; height: 20px; left: -10px; top: -10px; transform: none; background: radial-gradient(circle, #fff 0 22%, var(--c) 48%, transparent 74%); opacity: 1; }
	.w.hd i::before { content: ''; position: absolute; inset: -140%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent) 0, transparent 66%); }
	.fl { position: absolute; width: 90px; height: 90px; margin: -45px; border-radius: 50%; opacity: 0; transform: scale(0.2);
		background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0, color-mix(in srgb, var(--c, #d8b36a) 70%, transparent) 30%, transparent 68%); animation: essfl 0.9s ease-out both; }
	.fl.f2 { background: radial-gradient(circle, transparent 52%, rgba(255, 244, 210, 0.8) 58%, transparent 66%); }
	@keyframes essfl { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.5); } }
</style>
