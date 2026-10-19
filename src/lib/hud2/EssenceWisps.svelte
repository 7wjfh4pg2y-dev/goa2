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
	const TRAIL = [0, 1, 2, 3, 4, 5, 6] // the head + six sparks a beat behind each other (a longer tail, the user 2026-10-19)

	/** from = his token, to = where they are absorbed (screen px), colors = one per spell */
	export function play(from: Pt, to: Pt, colors: string[]) {
		if (!colors.length) return
		const n = colors.length, base = Date.now()
		const intoToken = Math.hypot(to.x - from.x, to.y - from.y) < 4
		const R = Math.max(54, Math.min(110, 30 + n * 4))
		const pt = (p: Pt, r: number, a: number): Pt => ({ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) })
		const tf = (p: Pt, s: number) => `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${s})`
		wisps = colors.map((c, i) => {
			const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, r = R * (0.75 + Math.random() * 0.45), dir = 1
			const o1 = pt(from, r, a), o2 = pt(from, r * 0.95, a + dir * 2.1), o3 = pt(from, r * 0.8, a + dir * 3.9)
			// the last swing: tighter round the token, or halfway to the book with a sideways bow
			const mid = intoToken ? pt(from, r * 0.45, a + dir * 5.2) : (() => { const mx = (o3.x + to.x) / 2, my = (o3.y + to.y) / 2, dx = to.x - o3.x, dy = to.y - o3.y, d = Math.hypot(dx, dy) || 1; return { x: mx - (dy / d) * 50, y: my + (dx / d) * 50 } })()
			const frames: Keyframe[] = [
				{ transform: tf(from, 0.2), opacity: 0, offset: 0 },
				{ transform: tf(o1, 1), opacity: 1, offset: 0.16, easing: 'ease-in-out' },
				{ transform: tf(o2, 1), opacity: 1, offset: 0.4, easing: 'ease-in-out' },
				{ transform: tf(o3, 0.95), opacity: 1, offset: 0.62, easing: 'ease-in' },
				{ transform: tf(mid, 0.85), opacity: 1, offset: 0.8, easing: 'cubic-bezier(.55,0,1,.6)' },
				{ transform: tf(to, 0.25), opacity: 0.2, offset: 1 }
			]
			return { key: base + i, c, frames, dur: 1700 + Math.random() * 300, delay: i * 55 }
		})
		const end = Math.max(...wisps.map((w) => w.dur + w.delay))
		flash = { key: base, ...to, c: colors[colors.length - 1], delay: Math.round(end * 0.62) }
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => { wisps = []; flash = null }, end + 900)
	}
	/** a Svelte action: run the flight on a span (the trail = the same flight a beat behind) */
	function fly(node: HTMLElement, a: { w: Wisp; k: number }) {
		const an = node.animate(a.w.frames, { duration: a.w.dur, delay: a.w.delay + a.k * 32, fill: 'both' })
		return { destroy: () => an.cancel() }
	}
	onDestroy(() => { if (timer) clearTimeout(timer) })
</script>

<div class="ess" aria-hidden="true">
	{#each wisps as w (w.key)}
		{#each TRAIL as k}<span class="w" class:hd={!k} style="--c:{w.c};--k:{k}" use:fly={{ w, k }}><i></i></span>{/each}
	{/each}
	{#if flash}{#key flash.key}<span class="fl" style="left:{flash.x}px;top:{flash.y}px;--c:{flash.c};animation-delay:{flash.delay}ms"></span><span class="fl f2" style="left:{flash.x}px;top:{flash.y}px;animation-delay:{flash.delay + 260}ms"></span>{/key}{/if}
</div>

<style>
	.ess { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
	.w { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; }
	.w i { position: absolute; width: calc(20px - var(--k) * 2.2px); height: calc(20px - var(--k) * 2.2px); left: calc(-10px + var(--k) * 1.1px); top: calc(-10px + var(--k) * 1.1px); border-radius: 50%;
		background: radial-gradient(circle, #fff 0 18%, var(--c) 45%, transparent 72%); opacity: calc(0.8 - var(--k) * 0.11); }
	.w.hd i { background: radial-gradient(circle, #fff 0 22%, var(--c) 48%, transparent 74%); opacity: 1; }
	.w.hd i::before { content: ''; position: absolute; inset: -140%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent) 0, transparent 66%); }
	.fl { position: absolute; width: 90px; height: 90px; margin: -45px; border-radius: 50%; opacity: 0; transform: scale(0.2);
		background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0, color-mix(in srgb, var(--c, #d8b36a) 70%, transparent) 30%, transparent 68%); animation: essfl 0.9s ease-out both; }
	.fl.f2 { background: radial-gradient(circle, transparent 52%, rgba(255, 244, 210, 0.8) 58%, transparent 66%); }
	@keyframes essfl { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.5); } }
</style>
