<script lang="ts" context="module">
	export type PopKind = 'hit' | 'ko' | 'boo' | 'block' | 'crowd' | 'cheer' | 'poofIn' | 'poofOut'
</script>

<script lang="ts">
	// Razzle's comic sound effects (DEMO on /splash-demo, 2026-10-20 — after the user's comic-book sheets, then 'go
	// crazy'): a sticker pops out at a token — every pop picks a SHAPE, a comic FONT, a palette and a lettering style for
	// its moment, and the letters pop in one after another:
	//   hit    her attack lands          BOP! POW! ZAP! …     spike · jag · balloon · caption box · sunburst
	//   ko     she defeats a hero        SMASH! KA-POW! K.O.!  jag · sunburst · explosion — bigger, a shake
	//   boo    her attack is defended    AWW! BOO! WOMP WOMP!  drippy splat · droopy cloud · balloon — sags and slides off, tears drop
	//   block  she defends               BLOCKED! NOPE! CLANG! shield · caption box · spike — rattles
	//   crowd  she defends with Crowd Control (her silver) — the big one: a gold sunburst turning behind a red ribbon,
	//          '★ CROWD CONTROL ★' over ENCORE! / BRAVO! / …, marquee bulbs blinking along the ribbon, stars thrown out
	//   cheer  with the confetti         YAY! WOW! HURRAY! …   sunburst · star · heart · cloud — bounces, hearts float up
	//   poofIn / poofOut  a double appears / vanishes  TA-DA! PRESTO! / POOF! FWOOSH! …  puffy cloud
	// Fonts: Bangers, Luckiest Guy, Bungee, Permanent Marker, Rubik Wet Paint, Monoton, Chewy (@fontsource, bundled —
	// the user's ask; the rest of the app keeps Modesto Poster). ~1–2 s; transform / opacity only; each leaves when done.
	import '@fontsource/bangers/latin-400.css'
	import '@fontsource/luckiest-guy/latin-400.css'
	import '@fontsource/bungee/latin-400.css'
	import '@fontsource/permanent-marker/latin-400.css'
	import '@fontsource/rubik-wet-paint/latin-400.css'
	import '@fontsource/monoton/latin-400.css'
	import '@fontsource/chewy/latin-400.css'

	type Shape = 'spike' | 'jag' | 'cloud' | 'balloon' | 'box' | 'burst' | 'splat' | 'shield' | 'star' | 'heart' | 'boom'
	type Font = 'bangers' | 'luckiest' | 'bungee' | 'marker' | 'wet' | 'monoton' | 'chewy'
	type Pal = { fill: string; shade: string; word: string; acc: string }
	type Motion = 'pop' | 'slam' | 'droop' | 'rattle' | 'grand' | 'bounce'
	type Spec = { words: string[]; shapes: Shape[]; fonts: Font[]; pals: Pal[]; size: number; motion: Motion; ms: number; lines: boolean; bits: 'stars' | 'puffs' | 'tears' | 'hearts' | 'none' }
	const FONT: Record<Font, { fam: string; k: number }> = {
		bangers: { fam: "'Bangers', 'Modesto Poster', sans-serif", k: 1.18 },
		luckiest: { fam: "'Luckiest Guy', 'Modesto Poster', sans-serif", k: 0.98 },
		bungee: { fam: "'Bungee', 'Modesto Poster', sans-serif", k: 0.86 },
		marker: { fam: "'Permanent Marker', 'Modesto Poster', sans-serif", k: 1 },
		wet: { fam: "'Rubik Wet Paint', 'Modesto Poster', sans-serif", k: 0.96 },
		monoton: { fam: "'Monoton', 'Modesto Poster', sans-serif", k: 0.9 },
		chewy: { fam: "'Chewy', 'Modesto Poster', sans-serif", k: 1.14 }
	}
	const P = {
		blueOnYellow: { fill: '#ffd42a', shade: '#f5a623', word: '#1e88e5', acc: '#1e88e5' },
		redOnYellow: { fill: '#ffd42a', shade: '#f5a623', word: '#e53935', acc: '#e53935' },
		yellowOnRed: { fill: '#e53935', shade: '#b71c1c', word: '#ffe14a', acc: '#ffe14a' },
		yellowOnBlue: { fill: '#2fa8f0', shade: '#1976d2', word: '#ffe14a', acc: '#ffe14a' },
		orangeOnGreen: { fill: '#8bd13a', shade: '#5ea524', word: '#ff5a1f', acc: '#ff5a1f' },
		orangeOnPink: { fill: '#e0237f', shade: '#a8125b', word: '#ff9a1f', acc: '#ffd42a' },
		limeOnPurple: { fill: '#8e44ff', shade: '#5b1fbf', word: '#d6ff3a', acc: '#d6ff3a' },
		pinkOnCyan: { fill: '#2fd6e6', shade: '#159fb0', word: '#ff3bb4', acc: '#ff3bb4' },
		redOnCream: { fill: '#fff3d6', shade: '#ffd9a0', word: '#e53935', acc: '#1e88e5' },
		sadBlue: { fill: '#9aa7c7', shade: '#6c7a9e', word: '#eef3ff', acc: '#5aa8ff' },
		sadLilac: { fill: '#c9b8e8', shade: '#9b86c4', word: '#4a2d7a', acc: '#7fb2ff' },
		steel: { fill: '#d5dde8', shade: '#8a9bb0', word: '#1e5fbf', acc: '#ffd42a' },
		poofPink: { fill: '#ffffff', shade: '#e6dcff', word: '#ff3bb4', acc: '#ffd42a' },
		poofCyan: { fill: '#ffffff', shade: '#d6f6ff', word: '#18a8c0', acc: '#ff3bb4' }
	}
	const SPEC: Record<PopKind, Spec> = {
		hit: { words: ['BOP!', 'POW!', 'ZAP!', 'BAM!', 'WHAM!', 'BONK!', 'BIFF!', 'WHACK!', 'THWACK!', 'ZOINK!'], shapes: ['spike', 'jag', 'balloon', 'box', 'burst'], fonts: ['bangers', 'luckiest', 'bungee', 'marker'],
			pals: [P.blueOnYellow, P.redOnYellow, P.yellowOnRed, P.yellowOnBlue, P.orangeOnGreen, P.orangeOnPink, P.limeOnPurple, P.pinkOnCyan, P.redOnCream], size: 1.8, motion: 'pop', ms: 1100, lines: true, bits: 'stars' },
		ko: { words: ['SMASH!', 'KA-POW!', 'KABOOM!', 'CRASH!', 'K.O.!', 'BOOM!'], shapes: ['jag', 'burst', 'boom'], fonts: ['bangers', 'luckiest', 'bungee'],
			pals: [P.yellowOnRed, P.redOnYellow, P.blueOnYellow, P.redOnCream], size: 2.2, motion: 'slam', ms: 1250, lines: true, bits: 'stars' },
		boo: { words: ['AWW!', 'BOO!', 'WOMP WOMP', "D'OH!", 'PFFT!', 'DRAT!'], shapes: ['splat', 'cloud', 'balloon'], fonts: ['wet', 'marker', 'chewy'],
			pals: [P.sadBlue, P.sadLilac], size: 1.8, motion: 'droop', ms: 1500, lines: false, bits: 'tears' },
		block: { words: ['BLOCKED!', 'NOPE!', 'CLANG!', 'MISSED ME!', 'NOT TODAY!', 'HA-HA!'], shapes: ['shield', 'box', 'spike'], fonts: ['bungee', 'bangers', 'luckiest'],
			pals: [P.steel, P.yellowOnBlue, P.pinkOnCyan], size: 1.8, motion: 'rattle', ms: 1150, lines: true, bits: 'stars' },
		crowd: { words: ['ENCORE!', 'BRAVO!', 'TA-DAAA!', 'OOH-AAH!', 'MAGNIFICO!'], shapes: ['burst'], fonts: ['luckiest'],
			pals: [{ fill: '#ffd42a', shade: '#f5a623', word: '#fff3d6', acc: '#ff3bb4' }], size: 2.6, motion: 'grand', ms: 2100, lines: true, bits: 'stars' },
		cheer: { words: ['YAY!', 'WOW!', 'HURRAY!', 'WOO-HOO!', 'BRAVO!', 'YIPPEE!', 'HUZZAH!'], shapes: ['burst', 'star', 'heart', 'cloud'], fonts: ['chewy', 'luckiest', 'monoton', 'bangers'],
			pals: [P.orangeOnPink, P.pinkOnCyan, P.limeOnPurple, P.redOnYellow, P.yellowOnBlue], size: 2, motion: 'bounce', ms: 1600, lines: true, bits: 'hearts' },
		poofIn: { words: ['TA-DA!', 'PRESTO!', 'VOILÀ!', 'BAMF!', 'SHAZAM!'], shapes: ['cloud'], fonts: ['chewy', 'luckiest', 'bangers'],
			pals: [P.poofPink, P.poofCyan], size: 1.6, motion: 'pop', ms: 1050, lines: false, bits: 'puffs' },
		poofOut: { words: ['POOF!', 'FWOOSH!', 'VANISH!', 'ZOOP!', '*POP*'], shapes: ['cloud'], fonts: ['chewy', 'luckiest', 'bangers'],
			pals: [P.poofCyan, P.poofPink], size: 1.6, motion: 'pop', ms: 1050, lines: false, bits: 'puffs' }
	}
	type Bit = { x: number; y: number; r: number; d: number }
	type Pop = { key: number; x: number; y: number; s: number; kind: PopKind; narrow: boolean; spec: Spec; word: string; chars: string[]; tilt: number; side: number; path: string; flip: boolean; pal: Pal; font: Font; tstyle: string; bits: Bit[]; lines: number[] }
	let pops: Pop[] = []
	let n = 0
	function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
	const f = (v: number) => v.toFixed(1)
	const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z'
	/** the outline of a sticker in a ~120 × 90 box round 0,0 */
	function shapePath(shape: Shape): string {
		const pts: [number, number][] = []
		const ring = (k: number, rIn: () => number, rOut: () => number, rx = 46, ry = 33) => {
			for (let i = 0; i < k * 2; i++) { const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? rIn() : rOut(); pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]) }
			return poly(pts)
		}
		if (shape === 'spike') return ring(14, () => 0.68 + Math.random() * 0.06, () => 0.98 + Math.random() * 0.1)
		if (shape === 'jag') return ring(11, () => 0.62 + Math.random() * 0.1, () => 0.9 + Math.random() * 0.38)
		if (shape === 'burst') return ring(22, () => 0.72, () => 1.06 + Math.random() * 0.12, 48, 36)
		if (shape === 'boom') return ring(9, () => 0.7 + Math.random() * 0.12, () => 1 + Math.random() * 0.25, 50, 36)
		if (shape === 'star') return ring(5, () => 0.5, () => 1.12, 50, 46)
		if (shape === 'box') { const j = () => (Math.random() - 0.5) * 6; return poly([[-52 + j(), -27 + j()], [54 + j(), -33 + j()], [49 + j(), 29 + j()], [-55 + j(), 32 + j()]]) }
		if (shape === 'shield') return 'M-44,-32 Q0,-44 44,-32 L41,4 Q33,30 0,44 Q-33,30 -41,4 Z'
		if (shape === 'heart') return 'M0,40 C-70,-2 -42,-50 0,-20 C42,-50 70,-2 0,40 Z'
		if (shape === 'balloon') {
			const p = (deg: number) => { const a = (deg * Math.PI) / 180; return `${f(Math.cos(a) * 47)},${f(Math.sin(a) * 31)}` }
			return `M${p(122)} A47,31 0 1 1 ${p(98)} L-30,52 Z`
		}
		if (shape === 'splat') {
			// a lumpy blob with three drips running down
			const ph = Math.random() * 6, drips = [70, 98, 122].map((d) => (d * Math.PI) / 180)
			for (let i = 0; i < 80; i++) {
				const a = (i / 80) * Math.PI * 2
				let r = 1 + 0.08 * Math.sin(a * 5 + ph) + 0.05 * Math.sin(a * 9 + ph * 2)
				const x = Math.cos(a) * 44 * r
				let y = Math.sin(a) * 30 * r
				for (const da of drips) { const dd = Math.abs(a - da); if (dd < 0.11) y += Math.cos((dd / 0.11) * (Math.PI / 2)) * 18 }
				pts.push([x, y])
			}
			return poly(pts)
		}
		// cloud: lobes = arcs bulging outward between points on an ellipse
		const k = 9, out: string[] = []
		for (let i = 0; i <= k; i++) { const a = (i / k) * Math.PI * 2 + 0.2; pts.push([Math.cos(a) * 44, Math.sin(a) * 31]) }
		out.push(`M${f(pts[0][0])},${f(pts[0][1])}`)
		for (let i = 1; i <= k; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const r = Math.hypot(x1 - x0, y1 - y0) * (0.55 + Math.random() * 0.12); out.push(`A${f(r)},${f(r)} 0 0 1 ${f(x1)},${f(y1)}`) }
		return out.join('') + 'Z'
	}
	/** screen x / y = the token's centre, size = its width */
	export function play(x: number, y: number, size = 48, kind: PopKind = 'hit') {
		const spec = SPEC[kind], key = ++n, side = Math.random() < 0.5 ? -1 : 1
		const shape = pick(spec.shapes), word = pick(spec.words)
		const corners = [[-0.55, -0.45], [0.58, -0.4], [0.52, 0.45], [-0.52, 0.46]]
		const bits: Bit[] = spec.bits === 'tears' ? [{ x: -0.18, y: 0.3, r: 1, d: 0.35 }, { x: 0.2, y: 0.32, r: 0.8, d: 0.55 }]
			: spec.bits === 'hearts' ? [-0.4, -0.15, 0.12, 0.38].map((hx, i) => ({ x: hx, y: 0.1, r: 0.8 + (i % 2) * 0.3, d: 0.25 + i * 0.12 }))
			: spec.bits === 'none' ? [] : corners.filter(() => Math.random() < 0.75).map(([bx, by]) => ({ x: bx, y: by, r: 0.08 + Math.random() * 0.05, d: 0 }))
		const p: Pop = {
			key, x, y, kind, spec, word, narrow: shape === 'shield' || shape === 'star' || shape === 'heart', chars: [...word].map((c) => (c === ' ' ? ' ' : c)),
			s: Math.max(56, Math.min(150, size * spec.size)), tilt: kind === 'crowd' ? -3 : side * (5 + Math.random() * 8), side,
			path: shapePath(shape), flip: shape === 'balloon' && side > 0, pal: pick(spec.pals), font: pick(spec.fonts),
			tstyle: kind === 'crowd' ? 'glow' : pick(['ink', 'pop', 'deep']), bits,
			lines: Array.from({ length: 12 }, (_, i) => i * 30 + Math.random() * 14)
		}
		pops = [...pops, p]
		setTimeout(() => (pops = pops.filter((q) => q.key !== key)), spec.ms + 60)
	}
	const STAR = 'M0,-10 L2.9,-3.1 L9.5,-3.1 L4.2,1.2 L6.2,8.1 L0,4 L-6.2,8.1 L-4.2,1.2 L-9.5,-3.1 L-2.9,-3.1Z'
	const PUFF = 'M-8,4 A6,6 0 0 1 -6,-5 A7,7 0 0 1 6,-6 A6,6 0 0 1 9,4 Z'
	const TEAR = 'M0,-8 Q6,2 0,8 Q-6,2 0,-8Z'
	const HEART = 'M0,7 C-12,0 -8,-9 0,-4 C8,-9 12,0 0,7Z'
	const BULBS = Array.from({ length: 9 }, (_, i) => i)
</script>

<div class="cp" aria-hidden="true">
	{#each pops as p (p.key)}
		{@const fs = (p.chars.length > 9 ? 0.15 : p.chars.length > 6 ? 0.18 : 0.23) * (p.narrow ? 0.82 : 1)}
		<!-- up and to one side of the token, so it stays in sight (the big ones sit straight above) -->
		<span class="pop {p.kind} m-{p.spec.motion} t-{p.tstyle}" style="left:{p.x + (p.kind === 'crowd' || p.kind.startsWith('poof') ? 0 : p.side * p.s * 0.2)}px;top:{p.y - p.s * (p.kind === 'crowd' ? 0.55 : p.kind.startsWith('poof') ? 0.7 : 0.42)}px;--s:{p.s}px;--t:{p.tilt}deg;--ms:{p.spec.ms}ms;--fill:{p.pal.fill};--shade:{p.pal.shade};--word:{p.pal.word};--acc:{p.pal.acc};--ff:{FONT[p.font].fam};--fs:{fs * FONT[p.font].k}">
			{#if p.spec.lines}{#each p.lines as a, j}<i class="ln" class:acc={j % 3 === 0} style="--a:{a}deg"></i>{/each}{/if}
			<span class="body">
				{#if p.kind === 'crowd'}<i class="rays"></i>{/if}
				<svg viewBox="-60 -46 120 92">
					<g transform={p.flip ? 'scale(-1 1)' : ''}>
						<path class="edge" d={p.path} />
						<path class="fill" d={p.path} />
						<path class="shd" d={p.path} transform="translate(4 5) scale(.78)" />
						<path class="fill2" d={p.path} transform="scale(.78)" />
					</g>
					{#if p.kind === 'crowd'}
						<!-- the red ribbon across the sunburst, folded ends behind -->
						<path class="rib-end" d="M-50,-2 L-70,-2 L-62,11 L-70,24 L-44,24 Z" /><path class="rib-end" d="M50,-2 L70,-2 L62,11 L70,24 L44,24 Z" />
						<path class="rib" d="M-56,-16 Q0,-24 56,-16 L56,18 Q0,10 -56,18 Z" />
					{/if}
					{#each p.bits as b}
						{#if p.spec.bits === 'stars'}<path class="star" d={STAR} transform="translate({b.x * 120} {b.y * 104}) scale({b.r * 14})" />
						{:else if p.spec.bits === 'puffs'}<path class="puff" d={PUFF} transform="translate({b.x * 120} {b.y * 104}) scale({b.r * 18})" />{/if}
					{/each}
				</svg>
				{#if p.kind === 'crowd'}{#each BULBS as k}<i class="bulb" class:odd={k % 2 === 1} style="--k:{k}"></i>{/each}{/if}
				<b>
					{#if p.kind === 'crowd'}<small class="kick">★ CROWD CONTROL ★</small>{/if}
					<span class="word">{#each p.chars as ch, i}<span class="ch" style="--i:{i}"><span class="ci">{ch}</span></span>{/each}</span>
				</b>
			</span>
			{#if p.spec.bits === 'tears'}{#each p.bits as b}<i class="tear" style="--x:{b.x};--y:{b.y};--d:{b.d}s;--r:{b.r}"><svg viewBox="-8 -9 16 18"><path d={TEAR} /></svg></i>{/each}{/if}
			{#if p.spec.bits === 'hearts'}{#each p.bits as b}<i class="hrt" style="--x:{b.x};--d:{b.d}s;--r:{b.r}"><svg viewBox="-13 -11 26 20"><path d={HEART} /></svg></i>{/each}{/if}
		</span>
	{/each}
</div>

<style>
	.cp { position: fixed; inset: 0; z-index: 61; pointer-events: none; overflow: hidden; }
	.pop { position: absolute; width: var(--s); height: calc(var(--s) * 0.77); margin: calc(var(--s) * -0.385) 0 0 calc(var(--s) * -0.5); }
	.body { position: absolute; inset: 0; display: grid; place-items: center; animation: var(--anim, cppop) var(--ms) cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.body svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	/* motions: the sticker as a whole */
	.m-pop { --anim: cppop; }
	.m-slam { --anim: cpslam; }
	.m-droop { --anim: cpdroop; }
	.m-rattle { --anim: cprattle; }
	.m-grand { --anim: cpgrand; }
	.m-bounce { --anim: cpbounce; }
	@keyframes cppop { 0% { opacity: 0; transform: scale(0.1) rotate(calc(var(--t) * -2)); } 18% { opacity: 1; transform: scale(1.16) rotate(var(--t)); } 28% { transform: scale(0.94) rotate(calc(var(--t) * 0.6)); } 36% { transform: scale(1.03) rotate(var(--t)); } 80% { opacity: 1; transform: scale(1) rotate(var(--t)); } 100% { opacity: 0; transform: scale(1.18) rotate(var(--t)) translateY(-8%); } }
	@keyframes cpslam { 0% { opacity: 0; transform: scale(2.4) rotate(calc(var(--t) * 3)); } 14% { opacity: 1; transform: scale(0.9) rotate(var(--t)); } 18% { transform: scale(1.06) translateX(-4%) rotate(var(--t)); } 22% { transform: translateX(4%) rotate(var(--t)); } 26% { transform: translateX(-3%) rotate(var(--t)); } 30% { transform: translateX(0) rotate(var(--t)); } 82% { opacity: 1; transform: scale(1) rotate(var(--t)); } 100% { opacity: 0; transform: scale(1.25) rotate(var(--t)); } }
	@keyframes cpdroop { 0% { opacity: 0; transform: scale(0.2); } 16% { opacity: 1; transform: scale(1.06) rotate(var(--t)); } 26% { transform: scale(1) rotate(var(--t)); } 55% { transform: translateY(4%) rotate(calc(var(--t) - 8deg)) scaleY(0.96); } 80% { opacity: 1; transform: translateY(14%) rotate(calc(var(--t) - 12deg)) scaleY(0.92); } 100% { opacity: 0; transform: translateY(40%) rotate(calc(var(--t) - 16deg)) scaleY(0.9); } }
	@keyframes cprattle { 0% { opacity: 0; transform: scale(0.2); } 16% { opacity: 1; transform: scale(1.1) rotate(var(--t)); } 22% { transform: rotate(calc(var(--t) + 8deg)); } 28% { transform: rotate(calc(var(--t) - 8deg)); } 34% { transform: rotate(calc(var(--t) + 5deg)); } 40% { transform: rotate(calc(var(--t) - 3deg)); } 46% { transform: rotate(var(--t)); } 82% { opacity: 1; transform: rotate(var(--t)); } 100% { opacity: 0; transform: scale(0.85) rotate(var(--t)); } }
	@keyframes cpgrand { 0% { opacity: 0; transform: scale(0.2) rotate(-14deg); } 12% { opacity: 1; transform: scale(1.12) rotate(4deg); } 20% { transform: scale(0.96) rotate(-2deg); } 28% { transform: scale(1) rotate(var(--t)); } 86% { opacity: 1; transform: scale(1) rotate(var(--t)); } 100% { opacity: 0; transform: scale(1.1) translateY(-10%) rotate(var(--t)); } }
	@keyframes cpbounce { 0% { opacity: 0; transform: translateY(40%) scale(0.3); } 14% { opacity: 1; transform: translateY(-12%) scale(1.1) rotate(var(--t)); } 24% { transform: translateY(4%) scale(0.95, 1.05) rotate(var(--t)); } 32% { transform: translateY(-6%) rotate(var(--t)); } 40% { transform: translateY(0) rotate(var(--t)); } 84% { opacity: 1; transform: rotate(var(--t)); } 100% { opacity: 0; transform: translateY(-20%) rotate(var(--t)); } }
	/* the sticker: a white edge inside an ink outline, the flat fill with a shade offset inside */
	.edge { fill: #fff; stroke: #15101c; stroke-width: 5; stroke-linejoin: round; }
	.fill { fill: var(--fill); stroke: #15101c; stroke-width: 2; stroke-linejoin: round; transform: scale(0.86); }
	.shd { fill: var(--shade); opacity: 0.55; }
	.fill2 { fill: var(--fill); }
	.star { fill: var(--acc); stroke: #15101c; stroke-width: 1.6; stroke-linejoin: round; }
	.puff { fill: #fff; stroke: #15101c; stroke-width: 1.8; stroke-linejoin: round; }
	/* the lettering: each letter pops in a beat after the last */
	.body b { position: relative; display: grid; justify-items: center; font-weight: normal; font-family: var(--ff); line-height: 1; color: var(--word); transform: skewX(-8deg) rotate(-4deg); white-space: nowrap; }
	.word { font-size: calc(var(--s) * var(--fs)); letter-spacing: 0.01em; -webkit-text-stroke: calc(var(--s) * 0.022) #15101c; paint-order: stroke fill; }
	.ch { display: inline-block; animation: cpch 0.34s calc(0.1s + var(--i) * 0.04s) cubic-bezier(0.2, 1.8, 0.4, 1) both; }
	@keyframes cpch { from { opacity: 0; transform: translateY(40%) scale(0.3); } to { opacity: 1; transform: none; } }
	/* the second motion of a letter rides on its inner span (never two transform animations on one element) */
	.ci { display: inline-block; }
	.m-bounce .ci { animation: cpwave 0.5s calc(0.5s + var(--i) * 0.06s) ease-in-out 2 alternate; }
	@keyframes cpwave { to { transform: translateY(-14%); } }
	.m-droop .ch:nth-child(odd) .ci { animation: cpsag 0.6s 0.7s ease-in forwards; }
	@keyframes cpsag { to { transform: translateY(14%) rotate(-6deg); } }
	/* lettering styles: ink outline + hard shadow · an accent shadow under the ink one · a deep extruded stack */
	.t-ink .word { text-shadow: calc(var(--s) * 0.03) calc(var(--s) * 0.035) 0 #15101c; }
	.t-pop .word { text-shadow: calc(var(--s) * 0.022) calc(var(--s) * 0.026) 0 var(--acc), calc(var(--s) * 0.045) calc(var(--s) * 0.05) 0 #15101c; }
	.t-deep .word { text-shadow: 1px 1px 0 #15101c, 2px 2px 0 #15101c, 3px 3px 0 #15101c, 4px 4px 0 #15101c, 5px 5px 0 #15101c; }
	.t-glow .word { color: #fff3d6; text-shadow: 0 2px 0 #6d0a1e, 0 0 12px rgba(255, 212, 42, 0.9); }
	/* thin burst lines shooting out, every third in the accent colour */
	.ln { position: absolute; left: 50%; top: 50%; width: 2px; height: calc(var(--s) * 0.14); margin-left: -1px; border-radius: 1px; background: #15101c; transform-origin: 50% 0; opacity: 0; animation: cpln 0.42s 0.05s ease-out both; }
	.ln.acc { width: 3px; background: var(--acc); }
	@keyframes cpln { 0% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.3)) scaleY(0.3); } 30% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--s) * 0.68)) scaleY(1); } }
	/* boo: tears roll off the bottom */
	.tear { position: absolute; left: calc(50% + var(--x) * var(--s)); top: calc(50% + var(--y) * var(--s)); width: calc(var(--s) * 0.09 * var(--r)); height: calc(var(--s) * 0.11 * var(--r)); opacity: 0; animation: cptear 0.8s var(--d) ease-in both; }
	.tear svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.tear path { fill: #7fc8ff; stroke: #15101c; stroke-width: 1.5; }
	@keyframes cptear { 0% { opacity: 0; transform: translateY(0) scale(0.4); } 20% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: translateY(calc(var(--s) * 0.45)); } }
	/* cheer: little hearts float up */
	.hrt { position: absolute; left: calc(50% + var(--x) * var(--s)); top: 30%; width: calc(var(--s) * 0.12 * var(--r)); height: calc(var(--s) * 0.1 * var(--r)); opacity: 0; animation: cphrt 1s var(--d) ease-out both; }
	.hrt svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.hrt path { fill: #ff3bb4; stroke: #15101c; stroke-width: 1.5; }
	.hrt:nth-of-type(even) path { fill: #ffd42a; }
	@keyframes cphrt { 0% { opacity: 0; transform: translateY(0) scale(0.3); } 25% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: translateY(calc(var(--s) * -0.7)) rotate(18deg); } }
	/* crowd: a gold sunburst turning behind, the ribbon, marquee bulbs blinking along it, a small kicker over the word */
	.rays { position: absolute; inset: -30%; border-radius: 50%; background: repeating-conic-gradient(from 0deg, rgba(255, 212, 42, 0.55) 0 7deg, transparent 7deg 18deg);
		-webkit-mask: radial-gradient(closest-side, #000 40%, transparent 100%); mask: radial-gradient(closest-side, #000 40%, transparent 100%); animation: cprays 4s linear infinite; }
	@keyframes cprays { to { transform: rotate(360deg); } }
	.rib { fill: #d42a3a; stroke: #15101c; stroke-width: 2.5; stroke-linejoin: round; }
	.rib-end { fill: #8e1222; stroke: #15101c; stroke-width: 2.5; stroke-linejoin: round; }
	.bulb { position: absolute; left: calc(10% + var(--k) * 10%); top: 31%; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%; background: #fff3b0; box-shadow: 0 0 5px 1px rgba(255, 212, 42, 0.9); animation: cpbulb 0.3s steps(1) infinite; }
	.bulb.odd { animation-delay: 0.15s; top: 64%; }
	@keyframes cpbulb { 0% { opacity: 1; } 50% { opacity: 0.25; } }
	.kick { font-family: 'Bungee', 'Modesto Poster', sans-serif; font-size: calc(var(--s) * 0.06); letter-spacing: 0.1em; color: #ffd42a; -webkit-text-stroke: 0; text-shadow: 0 1px 0 #15101c; margin-bottom: 1px; }
	.crowd .word { font-size: calc(var(--s) * var(--fs) * 0.8); -webkit-text-stroke: calc(var(--s) * 0.014) #6d0a1e; }
	@media (prefers-reduced-motion: reduce) { .cp * { animation-duration: 0.01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
</style>
