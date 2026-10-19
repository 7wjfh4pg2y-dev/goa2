<script lang="ts">
	// Gydion's dash button — the GRIMOIRE (the user's design, 2026-10-19, artifact "Gydion's Spellbook"): his white-bound
	// spellbook with his familiar owl on the cover, in the middle of the seven-school SIGIL WHEEL (each school's symbol,
	// joined like a transmutation circle: the heptagon, its seven-point star, a double inner ring and spokes).
	// idle (nothing of his to cast) = the owl sleeps, wings furled; the wheel dim silver and still · loaded (his casting
	// card / his silver is acting) = the owl wakes, eyes and breast in the card's school colour, every sigil lit, lines
	// silver · open (his spellbook window is up) = the book opens ON THE DASH at that school's page (the spells left on
	// the left page) · picked / cast = the lines and circles take the spell's colour, its sigil alone stays lit and the
	// wheel turns. The Archwizard: the outer circle rests violet, the owl's eyes go violet (the rest keeps the school's
	// colours), and three Wish fairy lights circle the book, weaving in and out of the sigils — a cast Wish burns gold.
	// Motion (turning, twinkling, breathing) = the Dashboard switch; only transform / opacity animate.
	import { schoolIcon, SCHOOL_COLOR, SCHOOLS } from '$lib/cards/spells'
	import { heroLogo } from '$lib/heroes'

	export let size = 48
	export let phone = false
	export let fx = true
	export let ult = false
	export let mode: 'idle' | 'loaded' | 'open' | 'picked' | 'cast' = 'idle'
	/** the school in play (the acting card's, the spell picked / cast); null = none (his silver) */
	export let school: string | null = null
	/** spells left in the book (shown on the open book's left page) */
	export let left = 0
	/** Wishes cast (0–3) */
	export let wishes = 0
	export let label = 'Spellbook'
	export let onPress: () => void = () => {}

	const COL: Record<string, string> = { gold: '#e0b440', red: '#d8443c', green: '#41ae59', blue: '#3d7be0', purple: '#9a5ce0', silver: '#c3ccd6' }
	const SILVER = '#c9d2dc'
	const sch = (s: string | null) => (s ? SCHOOL_COLOR[s] ?? null : null)
	const f = (n: number) => n.toFixed(1)
	const PT = SCHOOLS.map((_, i) => { const t = ((-90 + (i * 360) / 7) * Math.PI) / 180; return [60 + 55 * Math.cos(t), 60 + 55 * Math.sin(t)] })
	const logo = heroLogo('gydion')

	function wheel(m: string, sc: string | null, u: boolean) {
		const spellC = (m === 'cast' || m === 'picked') && sch(sc) ? COL[sch(sc)!] : null
		const ring = spellC ?? (u ? COL.purple : SILVER), web = spellC ?? SILVER
		const lit = (s: string) => (m === 'loaded' || m === 'open' ? true : m === 'picked' || m === 'cast' ? s === sc : false)
		const op = m === 'idle' ? 0.4 : spellC ? 0.95 : 0.7, w = m === 'idle' ? 0.7 : spellC ? 1.1 : 0.9
		const ln = (p: number[], q: number[], c = web, ww = w) => `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${c}" stroke-width="${ww}"/>`
		return `<svg viewBox="-9 -9 138 138">
			<circle cx="60" cy="60" r="55" fill="none" stroke="${ring}" stroke-width="${m === 'idle' ? 1.4 : 2}" opacity="${m === 'idle' ? (u ? 0.6 : 0.8) : 1}"/>
			<circle cx="60" cy="60" r="63" fill="none" stroke="${ring}" stroke-width="1" opacity="${m === 'idle' ? 0.3 : 0.55}" stroke-dasharray="2 4"/>
			${m !== 'idle' ? `<circle cx="60" cy="60" r="59" fill="none" stroke="${ring}" stroke-width="5" opacity=".35" class="br"/>` : ''}
			<g opacity="${op}" stroke-linecap="round">${PT.map((p, i) => ln(p, PT[(i + 1) % 7])).join('')}${PT.map((p, i) => ln(p, PT[(i + 2) % 7])).join('')}
				<circle cx="60" cy="60" r="44" fill="none" stroke="${web}" stroke-width="${w}"/><circle cx="60" cy="60" r="41.5" fill="none" stroke="${web}" stroke-width="${w * 0.6}"/>
				${PT.map((p) => ln(p, [60 + (p[0] - 60) * 0.8, 60 + (p[1] - 60) * 0.8])).join('')}</g>
			${spellC ? `<g stroke-linecap="round" opacity=".5" class="br">${PT.map((p, i) => ln(p, PT[(i + 2) % 7], spellC, 2.6)).join('')}</g>` : ''}
			${SCHOOLS.map((s, i) => { const on = lit(s), c = COL[SCHOOL_COLOR[s]]
				return `<g transform="translate(${f(PT[i][0])} ${f(PT[i][1])})" opacity="${m === 'idle' ? 0.6 : 1}">
					${on && (m === 'picked' || m === 'cast') ? `<circle r="13" fill="${c}" opacity=".5" class="br"/>` : ''}
					<circle r="9" fill="${on ? c : '#0b1422'}" stroke="${c}" stroke-width="${on ? 1.6 : 1.1}" ${on ? '' : 'stroke-opacity=".6"'}/>
					<image href="${schoolIcon(s)}" x="-6" y="-6" width="12" height="12" opacity="${on ? 1 : 0.42}"/></g>` }).join('')}</svg>`
	}
	function owl(m: string, sc: string | null, u: boolean) {
		const awake = m !== 'idle'
		const c = sch(sc) ? COL[sch(sc)!] : '#e6edf5', eye = u ? COL.purple : c
		const eyes = (x: number) => awake ? `<circle cx="${x}" cy="-7" r="4.4" fill="#120c06"/><circle cx="${x}" cy="-7" r="3.2" fill="${eye}" class="br"/><circle cx="${x}" cy="-7" r="1.2" fill="#000"/>`
			: `<path d="M${x - 3.6} -7 Q${x} -4.6 ${x + 3.6} -7" stroke="#1a120a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
		return `<g transform="translate(60 62)">
			${awake ? `<ellipse cx="0" cy="0" rx="17" ry="20" fill="${c}" opacity=".45" class="br" filter="url(#gyb-soft)"/>` : ''}
			<path d="M-8 -16 L-6 -10 M8 -16 L6 -10" stroke="#6b5338" stroke-width="3" stroke-linecap="round"/>
			<path d="M-11 -2 Q-14 8 -9 16 L-7 3 Z M11 -2 Q14 8 9 16 L7 3 Z" fill="#3d2c1b" stroke="#d8b36a" stroke-width=".5"/>
			<ellipse cx="0" cy="4" rx="10" ry="13" fill="#6b5338" stroke="#d8b36a" stroke-width=".6"/>
			<ellipse cx="0" cy="-6" rx="10.5" ry="7.5" fill="#6b5338"/>
			<circle cx="-4.6" cy="-7" r="4.6" fill="#e8dcc0" opacity=".9"/><circle cx="4.6" cy="-7" r="4.6" fill="#e8dcc0" opacity=".9"/>
			${eyes(-4.6)}${eyes(4.6)}<path d="M-1.4 -3 L0 0 L1.4 -3 Z" fill="#d8b36a"/>
			${awake && sc ? `<image href="${schoolIcon(sc)}" x="-5" y="2" width="10" height="10" filter="url(#gyb-t-${sch(sc)})"/>` : `<path d="M-4 6 q2 2 4 0 q2 2 4 0 M-3 10 q1.5 1.5 3 0 q1.5 1.5 3 0" stroke="#3d2c1b" stroke-width=".8" fill="none"/>`}
			<path d="M-6 17 l2 -2 M-2 17 l1 -2 M2 17 l-1 -2 M6 17 l-2 -2" stroke="#d8b36a" stroke-width="1"/></g>`
	}
	const closed = (m: string, sc: string | null, u: boolean) => `<svg viewBox="-9 -9 138 138">
		<rect x="37" y="28" width="50" height="66" rx="4" fill="#c9b994"/>
		<rect x="33" y="26" width="50" height="67" rx="5" fill="#f2ece0" stroke="#d8b36a" stroke-width="1.5"/>
		<rect x="33" y="26" width="8" height="67" rx="2.5" fill="#b8a77f" opacity=".55"/>
		<rect x="44" y="32" width="34" height="55" rx="3" fill="none" stroke="#b8923f" stroke-width="1" opacity=".8"/>
		<rect x="81" y="54" width="6" height="9" rx="1.5" fill="#d8b36a"/>
		<g transform="translate(61 60) scale(1.32) translate(-60 -62)">${owl(m, sc, u)}</g></svg>`
	const opened = (sc: string | null, n: number) => { const k = sch(sc) ? COL[sch(sc)!] : '#d8b36a'
		return `<svg viewBox="-9 -9 138 138"><g transform="translate(60 62) scale(.88) translate(-60 -62)">
		<circle cx="60" cy="58" r="24" fill="${k}" opacity=".45" class="br" filter="url(#gyb-soft)"/>
		<path d="M24 42 Q42 35 60 41 Q78 35 96 42 V84 Q78 77 60 83 Q42 77 24 84 Z" fill="#3b2618" stroke="#d8b36a" stroke-width="1.2"/>
		<path d="M29 44 Q44 38 59 44 V78 Q44 72 29 78 Z" fill="#efe3c6"/><path d="M91 44 Q76 38 61 44 V78 Q76 72 91 78 Z" fill="#e6d6b2"/>
		<text x="44" y="66" text-anchor="middle" font-family="Georgia,serif" font-weight="800" font-size="17" fill="#3a250f">${n}</text>
		<text x="44" y="73" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="5" letter-spacing=".8" fill="#6b4d26">LEFT</text>
		<path d="M60 43 V81" stroke="#6b4d26" stroke-width="1.2"/>
		${sc ? `<image href="${schoolIcon(sc)}" x="65" y="48" width="22" height="22" filter="url(#gyb-t-${sch(sc)})"/>` : `<image href="${logo}" x="65" y="48" width="22" height="22" opacity=".8"/>`}</g></svg>` }
	const WISPS = [[7, 0], [9.5, -3.2], [12, -7.4]]

	// the box holds the WHOLE wheel (the sigils and the dashed ring reach r 68 of the 120-unit drawing → a 138 view)
	$: S = phone ? Math.round((size + 8) * 1.15) : Math.round(size * 1.6)
	$: isOpen = mode === 'open' || mode === 'picked'
	$: spin = mode === 'picked' || mode === 'cast'
	$: motes = isOpen && !!school ? (COL[sch(school) ?? ''] ?? '#d8b36a') : ''
</script>

<!-- the filters the drawings use (tint a white symbol in a card colour; a soft glow) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
	{#each Object.entries(COL) as [n, c]}<filter id="gyb-t-{n}" color-interpolation-filters="sRGB"><feFlood flood-color={c === COL.red ? '#ff5a4e' : c === COL.green ? '#4fd06c' : c === COL.blue ? '#5b95ff' : c === COL.purple ? '#b27cf0' : c} /><feComposite in2="SourceAlpha" operator="in" /></filter>{/each}
	<filter id="gyb-soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
</defs></svg>

<button class="gyb" class:ph={phone} class:still={!fx} class:on={isOpen} class:spin style="--s:{S}px" title={label} aria-label={label} on:click={onPress}>
	<span class="wh">{@html wheel(mode, school, ult)}</span>
	<span class="cl">{@html closed(mode, school, ult)}</span>
	<span class="op">{@html opened(school, left)}{#if motes}{#each [0, 1, 2, 3] as i}<i class="mote" style="left:{30 + i * 11}%;bottom:{50 + (i % 2) * 6}%;animation-delay:{i * 0.6}s;--k:{motes}"></i>{/each}{/if}</span>
	{#if ult}
		<span class="wisps">{#each WISPS as [t, d], i}{@const lit = i < wishes}
			<span class="wisp" class:lit>{#each [6, 5, 4, 3, 2, 1, 0] as k}<i class="wo" class:hd={!k} class:tr={k > 0} style="--t:{t}s;--dl:{(d + k * 0.11).toFixed(2)}s;--w:{1.6 + i * 0.45}s;--k:{k};--a:{i * 120 + 30}deg"><i class="wr"><i class="wp" class:lit></i></i></i>{/each}</span>
		{/each}</span>
	{/if}
</button>

<style>
	.gyb { position: relative; width: var(--s); height: var(--s); padding: 0; border: 0; background: none; cursor: pointer; flex: none; }
	.gyb:not(.ph) { margin: calc((52px - var(--s)) / 2) 0; } /* centred in the dash's 52 px power slot */
	.gyb.ph { margin: -7px -5px; }
	.gyb > span { position: absolute; inset: 0; pointer-events: none; }
	.gyb :global(svg) { width: 100%; height: 100%; overflow: visible; display: block; }
	.wh { z-index: 1; }
	.cl, .op { z-index: 2; }
	.gyb.spin .wh { animation: gyspin 14s linear infinite; }
	.cl { transform-origin: 31% 50%; transition: transform 0.2s ease-in; }
	.op { transform: scaleX(0); transition: transform 0.28s 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.25); }
	.gyb.on .cl { transform: scaleX(0); }
	.gyb.on .op { transform: scaleX(1); }
	.gyb :global(.br) { animation: gybr 2.6s ease-in-out infinite; }
	@keyframes gyspin { to { transform: rotate(360deg); } }
	@keyframes gybr { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
	.mote { position: absolute; width: calc(var(--s) * 0.045); height: calc(var(--s) * 0.045); border-radius: 50%; background: var(--k); opacity: 0; animation: gymote 2.8s linear infinite; }
	@keyframes gymote { 0% { transform: translateY(0) scale(0.6); opacity: 0; } 20% { opacity: 0.9; } 100% { transform: translateY(calc(var(--s) * -0.42)) scale(1.1); opacity: 0; } }
	/* Wish fairy lights: a twinkling core with a halo and a glint; the trail = sparks flying the same path a beat behind */
	.wisps { z-index: 3; }
	.wisp { position: absolute; inset: 0; }
	.wisp:not(.lit) { opacity: 0.5; }
	.wo { position: absolute; left: 50%; top: 50%; width: 0; height: 0; animation: gyspin var(--t) linear infinite, gywz calc(var(--w) * 2) step-end infinite; animation-delay: var(--dl), var(--dl); z-index: 3; }
	.wr { position: absolute; left: 0; top: 0; animation: gyweave var(--w) ease-in-out infinite alternate; animation-delay: var(--dl); }
	@keyframes gyweave { from { transform: translateX(calc(var(--s) * 0.3)); } to { transform: translateX(calc(var(--s) * 0.5)); } }
	@keyframes gywz { 0% { z-index: 3; } 50% { z-index: 0; } }
	.hd .wp { position: absolute; width: calc(var(--s) * 0.05); height: calc(var(--s) * 0.05); margin: calc(var(--s) * -0.025); border-radius: 50%;
		background: radial-gradient(circle, #fff 0 30%, #ead9ff 45%, #b98cf5 70%, rgba(185, 140, 245, 0) 100%); animation: gytw 1.7s ease-in-out infinite; animation-delay: var(--dl); }
	.hd .wp::before { content: ''; position: absolute; inset: -180%; border-radius: 50%; background: radial-gradient(circle, rgba(205, 170, 255, 0.55) 0, rgba(165, 110, 240, 0.22) 35%, rgba(140, 80, 230, 0) 70%); }
	.hd .wp::after { content: ''; position: absolute; inset: -120%; opacity: 0.7; background:
		linear-gradient(90deg, transparent 47%, rgba(255, 255, 255, 0.85) 50%, transparent 53%) center/100% 18% no-repeat,
		linear-gradient(0deg, transparent 47%, rgba(255, 255, 255, 0.85) 50%, transparent 53%) center/18% 100% no-repeat; }
	.hd .wp.lit { width: calc(var(--s) * 0.062); height: calc(var(--s) * 0.062); margin: calc(var(--s) * -0.031); background: radial-gradient(circle, #fff 0 28%, #fff3c4 42%, #ffd25e 64%, rgba(255, 196, 60, 0) 100%); }
	.hd .wp.lit::before { background: radial-gradient(circle, rgba(255, 226, 140, 0.6) 0, rgba(255, 190, 60, 0.25) 35%, rgba(255, 170, 40, 0) 70%); }
	.hd .wp.lit::after { opacity: 0.9; }
	@keyframes gytw { 0%, 100% { opacity: 1; transform: scale(1); } 35% { opacity: 0.7; transform: scale(0.82); } 55% { opacity: 1; transform: scale(1.12); } 70% { opacity: 0.85; transform: scale(0.95); } }
	.tr .wp { position: absolute; width: calc(var(--s) * (0.04 - var(--k) * 0.0045)); height: calc(var(--s) * (0.04 - var(--k) * 0.0045)); margin: calc(var(--s) * (-0.02 + var(--k) * 0.00225)); border-radius: 50%;
		background: radial-gradient(circle, #f3e8ff 0 25%, rgba(190, 145, 250, 0.8) 45%, rgba(160, 110, 240, 0) 75%); opacity: calc(0.75 - var(--k) * 0.11); }
	.tr .wp.lit { background: radial-gradient(circle, #fff7d8 0 25%, rgba(255, 206, 90, 0.85) 45%, rgba(255, 180, 50, 0) 75%); }
	/* the Dashboard switch off: nothing moves (the trails go, the lights sit still) */
	.gyb.still .wh, .gyb.still :global(.br), .gyb.still .mote, .gyb.still .wo, .gyb.still .wr, .gyb.still .wp { animation: none; }
	.gyb.still .tr { display: none; }
	.gyb.still .wo { transform: rotate(var(--a)); }
	.gyb.still .wr { transform: translateX(calc(var(--s) * 0.4)); }
</style>
