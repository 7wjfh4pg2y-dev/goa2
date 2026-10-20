<script lang="ts">
	// Razzle's shell game (DEMO on /splash-demo, 2026-10-20 — the user's pick): when one of her bodies is attacked, her
	// tokens shuffle like cups on a street-corner table — copies of each token, laid over the real ones, swap places in
	// pairs along arcs (one over, one under), three quick swaps, then slide home and fade, leaving the board exactly as it
	// was. ~1.5 s; WAAPI transform / opacity only on small spans.
	type Tok = { x: number; y: number; size: number; bg: string }
	type Run = { key: number; toks: Tok[]; frames: Keyframe[][]; dur: number }
	let run: Run | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	const SWAP = 300, HOLD = 120
	/** one token per body (screen centre, width, its face as a css background) */
	export function play(toks: Tok[]) {
		if (toks.length < 2) return
		const n = toks.length
		// slot each copy sits in (its index into toks), shuffled by pair swaps, then back home
		let slot = toks.map((_, i) => i)
		const steps: number[][] = [slot.slice()]
		for (let k = 0; k < 3; k++) {
			const a = Math.floor(Math.random() * n)
			let b = Math.floor(Math.random() * (n - 1)); if (b >= a) b++
			const next = slot.slice(); const ia = next.indexOf(a), ib = next.indexOf(b)
			next[ia] = b; next[ib] = a; slot = next; steps.push(slot.slice())
		}
		steps.push(toks.map((_, i) => i))
		// per copy: keyframes along each step (an arc between its old and new slot), offsets spread evenly
		const total = (steps.length - 1) * SWAP + HOLD * 2
		const frames: Keyframe[][] = toks.map((t, i) => {
			const fr: Keyframe[] = [{ transform: 'translate(0px, 0px)', opacity: 0, offset: 0 }, { transform: 'translate(0px, 0px)', opacity: 1, offset: HOLD / total }]
			for (let s = 1; s < steps.length; s++) {
				const from = toks[steps[s - 1][i]], to = toks[steps[s][i]]
				const t0 = (HOLD + (s - 1) * SWAP) / total, t1 = (HOLD + s * SWAP) / total
				const dx0 = from.x - t.x, dy0 = from.y - t.y, dx1 = to.x - t.x, dy1 = to.y - t.y
				// the arc's bulge: perpendicular to the move, one copy over and the other under (by index parity)
				const lift = from === to ? 0 : (i % 2 ? 1 : -1) * Math.min(60, Math.hypot(dx1 - dx0, dy1 - dy0) * 0.35)
				const mx = (dx0 + dx1) / 2 - ((dy1 - dy0) / Math.max(1, Math.hypot(dx1 - dx0, dy1 - dy0))) * lift
				const my = (dy0 + dy1) / 2 + ((dx1 - dx0) / Math.max(1, Math.hypot(dx1 - dx0, dy1 - dy0))) * lift
				fr.push({ transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) scale(1.12)`, offset: (t0 + t1) / 2, easing: 'ease-out' })
				fr.push({ transform: `translate(${dx1.toFixed(1)}px, ${dy1.toFixed(1)}px)`, offset: t1, easing: 'ease-in' })
			}
			fr.push({ transform: 'translate(0px, 0px)', opacity: 0, offset: 1 })
			return fr
		})
		run = { key: Date.now(), toks, frames, dur: total + HOLD }
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => (run = null), run.dur + 50)
	}
	function fly(node: HTMLElement, a: { fr: Keyframe[]; dur: number }) {
		const an = node.animate(a.fr, { duration: a.dur, fill: 'both' })
		return { destroy: () => an.cancel() }
	}
</script>

<div class="sg" aria-hidden="true">
	{#if run}
		{#key run.key}
			{#each run.toks as t, i}
				<span class="cup" style="left:{t.x}px;top:{t.y}px;--s:{t.size}px;{t.bg}" use:fly={{ fr: run.frames[i], dur: run.dur }}></span>
			{/each}
		{/key}
	{/if}
</div>

<style>
	.sg { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
	/* a copy of the token: its face in a magenta / cyan circus rim, lifted off the board */
	.cup { position: absolute; width: var(--s); height: var(--s); margin: calc(var(--s) * -0.5); border-radius: 50%; background-color: #1a0b24; background-size: cover; background-position: center;
		box-shadow: 0 0 0 3px #2fd6e6, 0 0 0 6px #ff3bb4, 0 8px 14px rgba(0, 0, 0, 0.5); opacity: 0; }
</style>
