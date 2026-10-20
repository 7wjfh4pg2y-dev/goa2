<script lang="ts">
	// Razzle's circus bits (DEMO on /splash-demo, 2026-10-20 — the user's picks), each played at a token (screen x / y =
	// its centre, size = its width), each transform / opacity only and gone from the page when done:
	//   confetti(x, y, size)  — a confetti cannon: ~40 cyan / magenta / gold scraps shot up and out, tumbling, falling (1.6 s)
	//   honk(x, y, size)      — a clown horn pops off her token as she falls: squeezed twice, then it
	//                           floats up and pops into a puff of dots (1.5 s)
	//   applause(x, y, size)  — an 'APPLAUSE!' marquee lights up above her: chase-light bulbs blinking round it (1.8 s)
	//   ticket(x, y, size)    — a carnival ticket flutters down onto a body: '+2 · STEP RIGHT UP' (1.4 s)
	type Item = { key: number; kind: 'confetti' | 'honk' | 'applause' | 'ticket'; x: number; y: number; s: number; bits?: Bit[] }
	type Bit = { c: string; frames: Keyframe[]; dur: number; w: number; h: number; round: boolean }
	let items: Item[] = []
	let n = 0
	const COLS = ['#2fd6e6', '#ff3bb4', '#ffd42a', '#ffffff', '#9b6bff']
	function add(it: Omit<Item, 'key'>, ms: number) {
		const key = ++n
		items = [...items, { ...it, key }]
		setTimeout(() => (items = items.filter((i) => i.key !== key)), ms)
	}
	export function confetti(x: number, y: number, size = 48) {
		const bits: Bit[] = Array.from({ length: 42 }, (_, i) => {
			// a cannon: mostly upward in a 120° fan, then gravity pulls each scrap down while it spins and flutters
			const a = (-90 + (Math.random() - 0.5) * 120) * (Math.PI / 180), v = size * (2.2 + Math.random() * 2.2)
			const vx = Math.cos(a) * v, vy = Math.sin(a) * v, g = size * 5.5, spin = (Math.random() - 0.5) * 1440
			const frames: Keyframe[] = []
			for (let k = 0; k <= 10; k++) {
				const t = k / 10, tt = t * 1.3
				frames.push({ transform: `translate(${(vx * tt + Math.sin(t * 9 + i) * size * 0.15).toFixed(1)}px, ${(vy * tt + 0.5 * g * tt * tt).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg) scaleX(${Math.cos(t * 12 + i).toFixed(2)})`, opacity: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25, offset: t })
			}
			return { c: COLS[i % COLS.length], frames, dur: 1300 + Math.random() * 400, w: 4 + Math.random() * 4, h: 7 + Math.random() * 6, round: i % 7 === 0 }
		})
		add({ kind: 'confetti', x, y, s: size, bits }, 1800)
	}
	export const honk = (x: number, y: number, size = 48) => add({ kind: 'honk', x, y, s: size }, 1550)
	export const applause = (x: number, y: number, size = 48) => add({ kind: 'applause', x, y, s: size }, 1850)
	export const ticket = (x: number, y: number, size = 48) => add({ kind: 'ticket', x, y, s: size }, 1450)
	function fly(node: HTMLElement, b: Bit) {
		const an = node.animate(b.frames, { duration: b.dur, fill: 'both', easing: 'linear' })
		return { destroy: () => an.cancel() }
	}
	const BULBS = Array.from({ length: 16 }, (_, i) => i)
</script>

<div class="cx" aria-hidden="true">
	{#each items as it (it.key)}
		<span class="it {it.kind}" style="left:{it.x}px;top:{it.y}px;--s:{it.s}px">
			{#if it.kind === 'confetti'}
				<i class="boom"></i>
				{#each it.bits ?? [] as b}<i class="cf" class:round={b.round} style="background:{b.c};width:{b.w}px;height:{b.round ? b.w : b.h}px" use:fly={b}></i>{/each}
			{:else if it.kind === 'honk'}
				<span class="horn">
					<svg viewBox="0 0 120 70">
						<!-- brass bell + tube, red rubber bulb -->
						<path d="M60 35 L92 22 Q104 18 108 12 L112 12 L112 58 L108 58 Q104 52 92 48 Z" fill="#f2c14e" stroke="#2a1838" stroke-width="3" stroke-linejoin="round" />
						<rect x="44" y="30" width="18" height="10" rx="3" fill="#d9a52f" stroke="#2a1838" stroke-width="3" />
						<g class="rb"><ellipse cx="28" cy="35" rx="22" ry="20" fill="#e5383b" stroke="#2a1838" stroke-width="3" /><ellipse cx="21" cy="27" rx="7" ry="5" fill="#ff8a8c" /></g>
					</svg>
				</span>
				{#each [0, 1, 2, 3, 4, 5, 6, 7] as k}<i class="pop" style="--a:{k * 45}deg"></i>{/each}
			{:else if it.kind === 'applause'}
				<span class="sign">
					{#each BULBS as k}<i class="bulb" class:odd={k % 2 === 1} style="--k:{k}"></i>{/each}
					<b>APPLAUSE!</b>
				</span>
			{:else}
				<span class="tk">
					<span class="tkin"><b>+2</b><small>STEP RIGHT UP</small></span>
				</span>
			{/if}
		</span>
	{/each}
</div>

<style>
	.cx { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.it { position: absolute; width: 0; height: 0; }
	/* ── confetti ── */
	.boom { position: absolute; width: calc(var(--s) * 1.6); height: calc(var(--s) * 1.6); margin: calc(var(--s) * -0.8); border-radius: 50%; opacity: 0;
		background: radial-gradient(circle, #fff 0 18%, rgba(255, 59, 180, 0.7) 34%, rgba(47, 214, 230, 0.4) 50%, transparent 70%); animation: cxboom 0.5s ease-out both; }
	@keyframes cxboom { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.3); } }
	.cf { position: absolute; left: 0; top: 0; margin: -4px; border-radius: 1px; box-shadow: 0 0 0 1px rgba(26, 11, 36, 0.35); }
	.cf.round { border-radius: 50%; }
	/* ── honk ── */
	.horn { position: absolute; width: calc(var(--s) * 1.5); height: calc(var(--s) * 0.9); margin: calc(var(--s) * -1.25) 0 0 calc(var(--s) * -0.75); animation: hkhorn 1.5s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes hkhorn { 0% { opacity: 0; transform: translateY(40%) scale(0.3) rotate(-20deg); } 14% { opacity: 1; transform: none; } 70% { opacity: 1; transform: translateY(-10%) rotate(4deg); } 100% { opacity: 0; transform: translateY(-60%) scale(0.9) rotate(8deg); } }
	.horn svg { width: 100%; height: 100%; overflow: visible; display: block; }
	.horn .rb { transform-origin: 28px 35px; transform-box: view-box; animation: hksq 1.5s both; }
	@keyframes hksq { 0%, 22% { transform: none; } 28% { transform: scale(0.72, 1.12); } 36% { transform: none; } 44% { transform: scale(0.72, 1.12); } 52%, 100% { transform: none; } }
	/* the horn floats off and pops into dots */
	.pop { position: absolute; width: 7px; height: 7px; margin: calc(var(--s) * -1.1) 0 0 -3.5px; border-radius: 50%; background: #e5383b; box-shadow: 0 0 0 1.5px #2a1838; opacity: 0; animation: hkpop 0.45s 1.15s ease-out both; }
	.pop:nth-of-type(even) { background: #ffd42a; }
	@keyframes hkpop { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * -0.7)) scale(0.4); } }
	/* ── applause marquee ── */
	.sign { position: absolute; width: calc(var(--s) * 2.6); height: calc(var(--s) * 0.78); margin: calc(var(--s) * -1.45) 0 0 calc(var(--s) * -1.3); display: grid; place-items: center; border-radius: 8px;
		background: linear-gradient(180deg, #b0124f, #6d0a3a); box-shadow: 0 0 0 3px #ffd42a, 0 0 0 6px #2a1838, 0 8px 18px rgba(0, 0, 0, 0.5); animation: apin 1.8s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes apin { 0% { opacity: 0; transform: translateY(30%) scale(0.5); } 14% { opacity: 1; transform: none; } 84% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-20%); } }
	.sign b { font-weight: normal; font-size: calc(var(--s) * 0.3); letter-spacing: 0.08em; color: #fff6d0; -webkit-text-stroke: 1.5px #2a1838; paint-order: stroke fill; text-shadow: 0 0 10px rgba(255, 212, 42, 0.8), 2px 2px 0 #2a1838; animation: apword 0.5s 0.2s steps(2, jump-none) 3 both; }
	@keyframes apword { from { opacity: 0.35; } to { opacity: 1; } }
	/* bulbs round the rim: 6 along each long side, 2 at each end; odd / even blink out of step (a chase) */
	.bulb { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: #fff3b0; box-shadow: 0 0 6px 2px rgba(255, 212, 42, 0.8); animation: apbulb 0.28s steps(1) infinite; }
	.bulb.odd { animation-delay: 0.14s; }
	@keyframes apbulb { 0% { opacity: 1; } 50% { opacity: 0.25; } }
	.bulb:nth-child(-n + 6) { top: 4px; left: calc(10% + (var(--k) * 16%)); }
	.bulb:nth-child(n + 7):nth-child(-n + 12) { bottom: 4px; left: calc(10% + ((var(--k) - 6) * 16%)); }
	.bulb:nth-child(13) { left: 4px; top: 30%; } .bulb:nth-child(14) { left: 4px; top: 62%; }
	.bulb:nth-child(15) { right: 4px; top: 30%; } .bulb:nth-child(16) { right: 4px; top: 62%; }
	/* ── ticket: flutters down from above onto the body, settles, fades ── */
	.tk { position: absolute; width: calc(var(--s) * 1.2); height: calc(var(--s) * 0.62); margin: calc(var(--s) * -0.95) 0 0 calc(var(--s) * -0.6); animation: tkfall 1.4s cubic-bezier(0.3, 0.7, 0.4, 1) both; }
	@keyframes tkfall { 0% { opacity: 0; transform: translateY(-140%); } 10% { opacity: 1; } 60% { transform: translateY(0); } 85% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-15%); } }
	.tkin { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; border-radius: 3px; background: #fff3d6;
		box-shadow: inset 0 0 0 3px #e5383b, inset 0 0 0 5px #fff3d6, inset 0 0 0 6px #e5383b, 0 0 0 1.5px #2a1838, 0 6px 10px rgba(0, 0, 0, 0.45);
		-webkit-mask: radial-gradient(circle at 0 50%, transparent 7px, #000 7.5px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 7px, #000 7.5px) right / 51% 100% no-repeat;
		mask: radial-gradient(circle at 0 50%, transparent 7px, #000 7.5px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 7px, #000 7.5px) right / 51% 100% no-repeat;
		animation: tksway 1.4s ease-in-out both; }
	@keyframes tksway { 0% { transform: rotate(-24deg); } 18% { transform: rotate(18deg); } 34% { transform: rotate(-12deg); } 48% { transform: rotate(8deg); } 60%, 100% { transform: rotate(-4deg); } }
	.tkin b { font-weight: normal; font-size: calc(var(--s) * 0.3); line-height: 1; color: #e5383b; }
	.tkin small { font-size: calc(var(--s) * 0.11); letter-spacing: 0.08em; color: #2a1838; }
	@media (prefers-reduced-motion: reduce) { .cx * { animation-duration: 0.01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
</style>
