<script lang="ts">
	// Emmitt's dash button (the user's pick A, 2026-10-16, artifact 'Emmitt's Hourglass'): an hourglass in a CLOCK FACE —
	// twelve numerals and a minute ring round the button. A real clock face reads backwards: turning ANTICLOCKWISE is
	// time going on as normal, CLOCKWISE is time running back.
	//   idle  = dim slate, still.
	//   green = his gold acts (he may turn the next turn round) or he has: card-green, the face creeping anticlockwise
	//           (slow) until the reversed turn begins.
	//   rev   = the reversed turn, or a turn he bent time in (a swap, a rewind, a warp, a retrieve): magenta, the face
	//           spinning clockwise (fast), and the hourglass alone flips over; at the turn's end it flips back.
	// Motion = the Dashboard switch (transform / opacity only).
	export let mode: 'idle' | 'green' | 'rev' = 'idle';
	export let fx = true;
	export let size = 48;
	export let phone = false;
	export let ready = false; // a tap loads Reverse time onto the ring
	export let onPress: () => void = () => {};

	const pt = (a: number, r: number) => { const t = ((a - 90) * Math.PI) / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)]; };
	const ROM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
	const NUMS = ROM.map((n, i) => { const [x, y] = pt(i * 30, 73); return { n, x, y, a: i * 30 }; });
	const TICKS = Array.from({ length: 60 }, (_, i) => { const big = i % 5 === 0; const [x1, y1] = pt(i * 6, 84), [x2, y2] = pt(i * 6, big ? 91 : 88); return { x1, y1, x2, y2, big }; });
	const uid = `emc${Math.random().toString(36).slice(2, 8)}`;
	$: z = phone ? size - 7 : size;
	$: tip = mode === 'rev' ? 'Time runs backwards this turn' : mode === 'green' ? (ready ? 'Reverse time — next turn, lower initiative acts first' : 'Time reversed next turn') : 'Emmitt';
</script>

<button class="em {mode}" class:fx={fx && mode !== 'idle'} class:ph={phone} class:ready style="--z:{z}px" on:click={() => ready && onPress()} title={tip} aria-label={tip}>
	<svg class="lay glow" viewBox="0 0 200 200" aria-hidden="true"><defs><filter id={uid} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter></defs><circle cx="100" cy="100" r="74" fill="none" stroke="var(--g)" stroke-width="30" filter="url(#{uid})" /></svg>
	<svg class="lay face" viewBox="0 0 200 200" aria-hidden="true">
		<circle cx="100" cy="100" r="60" fill="none" stroke="var(--c2)" stroke-width="2" />
		{#each NUMS as n}<text x={n.x} y={n.y} transform="rotate({n.a} {n.x} {n.y})" text-anchor="middle" dominant-baseline="central" font-size="13" fill="var(--c)">{n.n}</text>{/each}
		{#each TICKS as t}<line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--c2)" stroke-width={t.big ? 2.2 : 1.2} />{/each}
	</svg>
	<span class="disc"></span>
	<span class="glass" aria-hidden="true">
		<svg viewBox="0 0 100 100">
			<rect x="22" y="8" width="56" height="7" rx="3" fill="var(--c2)" /><rect x="22" y="85" width="56" height="7" rx="3" fill="var(--c2)" />
			<path d="M28 15 C28 38 46 44 47 50 C46 56 28 62 28 85 L72 85 C72 62 54 56 53 50 C54 44 72 38 72 15 Z" fill="rgba(160,220,255,.08)" stroke="var(--c)" stroke-width="2.6" stroke-linejoin="round" />
			<path d="M34 24 L66 24 C64 36 54 42 50 47 C46 42 36 36 34 24 Z" fill="var(--c)" opacity=".85" />
			<path d="M32 83 C34 72 44 68 50 66 C56 68 66 72 68 83 Z" fill="var(--c)" opacity=".85" />
			<rect class="stream" x="49" y="47" width="2" height="20" fill="var(--c)" />
			<line x1="25" y1="15" x2="25" y2="85" stroke="var(--c2)" stroke-width="2.4" /><line x1="75" y1="15" x2="75" y2="85" stroke="var(--c2)" stroke-width="2.4" />
		</svg>
	</span>
</button>

<style>
	/* the numerals reach 0.91 of the button's size out from its centre: the box leaves room either side */
	.em { position: relative; width: calc(var(--z) * 1.85); height: var(--z); padding: 0; border: 0; background: none; cursor: default; flex: none; display: grid; place-items: center;
		--c: #5d7088; --c2: #3d5068; --g: transparent; font-family: 'Modesto Poster', serif; }
	.em.ph { width: calc(var(--z) * 1.95); margin-left: -7px; }
	.em.ready { cursor: pointer; }
	.em.green { --c: #8ff0a4; --c2: #41ae59; --g: #41ae59; }
	.em.rev { --c: #ffa0e6; --c2: #d04cb4; --g: #e040c0; }
	.lay { position: absolute; left: calc(50% - var(--z)); top: calc(50% - var(--z)); width: calc(var(--z) * 2); height: calc(var(--z) * 2); pointer-events: none; overflow: visible; }
	.face { opacity: 0.75; }
	.green .face, .rev .face { opacity: 1; }
	.glow { opacity: 0; }
	.disc { position: absolute; left: 50%; top: 50%; width: var(--z); height: var(--z); margin: calc(var(--z) * -0.5) 0 0 calc(var(--z) * -0.5); border-radius: 50%;
		background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.glass { position: absolute; left: 50%; top: 50%; width: calc(var(--z) * 0.74); height: calc(var(--z) * 0.74); margin: calc(var(--z) * -0.37) 0 0 calc(var(--z) * -0.37); display: grid; place-items: center; }
	.glass svg { width: 100%; height: 100%; overflow: visible; transition: transform 0.7s cubic-bezier(0.5, -0.3, 0.5, 1.3); }
	/* time reversing: the hourglass alone turns over (and back when the turn ends) */
	.rev .glass svg { transform: rotate(180deg); }
	/* normal time = anticlockwise, slow; reversed time = clockwise, noticeably faster */
	.fx.green .face { animation: emspin 60s linear infinite reverse; }
	.fx.rev .face { animation: emspin 9s linear infinite; }
	.fx .glow { animation: embr 2.4s ease-in-out infinite; }
	.fx .stream { animation: emst 0.5s linear infinite; }
	.green:not(.fx) .glow, .rev:not(.fx) .glow { opacity: 0.6; }
	@keyframes emspin { to { transform: rotate(360deg); } }
	@keyframes embr { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.95; } }
	@keyframes emst { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .fx .face, .fx .glow, .fx .stream { animation: none; } .glass svg { transition: none; } }
</style>
