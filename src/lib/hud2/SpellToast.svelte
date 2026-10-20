<script lang="ts">
	// Gydion's spell toast, for everyone (GameView plays each gyNews once; Effects → Spells switches it off). Redone
	// 2026-10-20 (the user: too basic): a banner under the top bar — on the left a MAGIC CIRCLE ignites (a rune ring
	// turning one way, an inner star in the school's colour turning the other, the school's sigil glowing in the middle,
	// motes rising off it), the words write in beside it over a rule that draws out in the school colour, and the printed
	// spell card swings in on the right with a sheen running across it. Prepare Spells: the seven school sigils light
	// round the circle one after another and three of the returning spells fan in. Wish: a gold star turns in the circle.
	// ~3.4 s; only transform / opacity animate.
	import { spellOf, schoolIcon, SCHOOL_COLOR, SCHOOLS } from '$lib/cards/spells'
	import { heroLogo } from '$lib/heroes'

	export let phone = false
	const COL: Record<string, string> = { gold: '#ffd25e', red: '#ff6a5e', green: '#55d071', blue: '#6a9cff', purple: '#c08cff', silver: '#e3e9f0' }
	type Shown = { key: number; kind: 'cast' | 'prepare' | 'wish'; title: string; line: string; color: string; art: string; sym: string; fan: string[]; won: boolean }
	let shown: Shown | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	const logo = heroLogo('gydion')
	const DUR = 3400

	/** spell = a spell id, 'prepare' or 'wish'; line = the numbers; wish = the Wish count; moved = the spells Prepare brought back */
	export function play(spell: string, line = '', wish = 0, moved: string[] = []) {
		const kind = spell === 'prepare' ? 'prepare' : spell === 'wish' ? 'wish' : 'cast'
		const sp = kind === 'cast' ? spellOf(spell) : spellOf('wish')
		const school = kind === 'cast' ? sp?.school.toLowerCase() ?? '' : ''
		const color = kind === 'prepare' ? COL.silver : kind === 'wish' ? COL.gold : COL[SCHOOL_COLOR[school]] ?? COL.gold
		const n = moved.length
		shown = {
			key: Date.now(), kind, color,
			title: kind === 'prepare' ? 'Prepare Spells' : kind === 'wish' ? 'Wish' : sp?.name ?? spell,
			line: kind === 'prepare' ? (n ? `${n} spell${n === 1 ? '' : 's'} drawn back from the ether` : 'The spellbook is full again')
				: kind === 'wish' ? `Wish ${wish} of 3${wish >= 3 ? ' — his team wins!' : ''}`
				: [school && school[0].toUpperCase() + school.slice(1), line].filter(Boolean).join(' · '),
			art: kind === 'prepare' ? '' : sp?.art ?? '',
			sym: kind === 'cast' ? schoolIcon(school) : kind === 'wish' ? schoolIcon('wish') : logo,
			fan: kind === 'prepare' ? moved.slice(0, 3).map((id) => spellOf(id)?.art ?? '').filter(Boolean) : [],
			won: kind === 'wish' && wish >= 3
		}
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => (shown = null), DUR)
	}
	// the rune ring: 36 marks, every third a little rune stroke
	const RUNES = Array.from({ length: 36 }, (_, i) => { const a = (i * 10 * Math.PI) / 180, r0 = i % 3 ? 43 : 40, r1 = 47; return `M${(r0 * Math.sin(a)).toFixed(1)} ${(-r0 * Math.cos(a)).toFixed(1)}L${(r1 * Math.sin(a)).toFixed(1)} ${(-r1 * Math.cos(a)).toFixed(1)}` }).join('')
	const STAR = (k: number, r: number) => Array.from({ length: k }, (_, i) => { const a = ((i * 360) / k - 90) * (Math.PI / 180); return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}` })
	const HEX = STAR(6, 33)
	const SIGILS = SCHOOLS.map((s, i) => { const a = ((i * 360) / 7 - 90) * (Math.PI / 180); return { s, x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a), c: COL[SCHOOL_COLOR[s]] } })
	const MOTES = [0, 1, 2, 3, 4, 5, 6]
</script>

{#if shown}
	{#key shown.key}
		<div class="st {shown.kind}" class:ph={phone} class:won={shown.won} style="--c:{shown.color};--d:{DUR}ms" role="status">
			<span class="topline"></span>
			<span class="ghost" style="--m:url({shown.sym})"></span>
			<!-- the magic circle -->
			<span class="circ">
				<span class="glow"></span>
				<span class="ring"><svg viewBox="-50 -50 100 100"><circle r="47" /><circle r="39.5" /><path d={RUNES} /></svg></span>
				<span class="inner"><svg viewBox="-50 -50 100 100">
					{#if shown.kind === 'wish'}<polygon points={STAR(8, 34).map((p, i) => (i % 2 ? STAR(8, 16)[i] : p)).join(' ')} class="fill" /><polygon points={STAR(8, 34).map((p, i) => (i % 2 ? p : STAR(8, 16)[i])).join(' ')} class="fill f2" />
					{:else}<polygon points={[0, 2, 4].map((i) => HEX[i]).join(' ')} /><polygon points={[1, 3, 5].map((i) => HEX[i]).join(' ')} /><circle r="22" />{/if}
				</svg></span>
				{#if shown.kind === 'prepare'}
					{#each SIGILS as g, i}<span class="sig" style="left:{g.x}%;top:{g.y}%;--sc:{g.c};--m:url({schoolIcon(g.s)});animation-delay:{0.25 + i * 0.12}s"></span>{/each}
					<img class="core logo" src={shown.sym} alt="" />
				{:else}<span class="core" style="--m:url({shown.sym})"></span>{/if}
				{#each MOTES as k}<i class="mote" style="--k:{k};--x:{(k - 3) * 9}px;animation-delay:{0.5 + k * 0.17}s"></i>{/each}
			</span>
			<span class="txt">
				<em>{shown.kind === 'prepare' ? 'Gydion prepares' : shown.kind === 'wish' ? 'Gydion wishes' : 'Gydion casts'}</em>
				<b>{shown.title}</b>
				<span class="rule"></span>
				<small>{shown.line}</small>
			</span>
			<span class="cards">
				{#if shown.art}<span class="card" style="background-image:url({shown.art})"><i class="sheen"></i></span>
				{:else}{#each shown.fan as a, i}<span class="card fan" style="background-image:url({a});--i:{i - 1};animation-delay:{0.35 + i * 0.12}s"><i class="sheen"></i></span>{/each}{/if}
			</span>
		</div>
	{/key}
{/if}

<style>
	.st { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 58; width: 540px; max-width: 94vw; height: 108px; display: grid; grid-template-columns: 108px minmax(0, 1fr) 170px; align-items: center;
		pointer-events: none; overflow: hidden; border-radius: 16px; font-family: system-ui, sans-serif; transform: translateX(-50%); animation: stin var(--d) ease both;
		background: radial-gradient(ellipse at 12% 50%, color-mix(in srgb, var(--c) 22%, transparent), transparent 55%), linear-gradient(100deg, rgba(18, 12, 34, 0.98), rgba(8, 20, 38, 0.98) 70%);
		border: 1px solid color-mix(in srgb, var(--c) 55%, #0000); box-shadow: 0 16px 38px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 0 26px -12px var(--c); }
	@keyframes stin { 0% { opacity: 0; transform: translate(-50%, -16px) scale(0.95); } 9% { opacity: 1; transform: translate(-50%, 0) scale(1); } 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -10px); } }
	.topline { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--c), transparent); transform-origin: 18% 50%; animation: draw 0.7s 0.1s ease-out both; }
	@keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
	.ghost { position: absolute; right: 120px; top: -26px; width: 160px; height: 160px; background: var(--c); opacity: 0.07; -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; }

	/* the magic circle */
	.circ { position: relative; width: 88px; height: 88px; margin-left: 12px; animation: ign 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes ign { from { opacity: 0; transform: scale(0.35) rotate(-40deg); } to { opacity: 1; transform: none; } }
	.circ svg { width: 100%; height: 100%; display: block; overflow: visible; fill: none; stroke: var(--c); }
	.ring, .inner, .glow { position: absolute; inset: 0; }
	.ring svg { stroke-width: 1.4; opacity: 0.85; }
	.ring { animation: spin 9s linear infinite; }
	.inner { inset: 6px; animation: spin 6s linear infinite reverse; }
	.inner svg { stroke-width: 1.6; }
	.inner .fill { fill: color-mix(in srgb, var(--c) 30%, transparent); stroke-width: 1.2; }
	.inner .f2 { opacity: 0.5; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.glow { inset: -8px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 55%, transparent) 0, transparent 62%); animation: breathe 1.6s 0.4s ease-in-out infinite; opacity: 0.5; }
	@keyframes breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
	.core { position: absolute; left: 50%; top: 50%; width: 38px; height: 38px; margin: -19px; background: color-mix(in srgb, var(--c) 60%, #fff); -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat;
		animation: pop 0.5s 0.3s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.core.logo { width: 34px; height: 34px; margin: -17px; background: none; -webkit-mask: none; mask: none; animation-delay: 1.15s; }
	@keyframes pop { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: none; } }
	.sig { position: absolute; width: 17px; height: 17px; margin: -8.5px; background: var(--sc); -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; animation: pop 0.4s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	.mote { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px; border-radius: 50%; background: radial-gradient(circle, #fff 0 30%, var(--c) 60%, transparent 75%); opacity: 0;
		animation: rise 1.4s ease-out both; }
	@keyframes rise { 0% { opacity: 0; transform: translate(0, 0) scale(0.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--x), -58px) scale(1.2); } }

	/* the words */
	.txt { display: flex; flex-direction: column; min-width: 0; padding: 0 6px 0 14px; z-index: 1; }
	.txt em { font: 700 10.5px system-ui; letter-spacing: 0.22em; text-transform: uppercase; color: var(--c); font-style: normal; animation: wr 0.45s 0.2s ease-out both; }
	.txt b { font-family: 'Modesto Poster', serif; font-weight: normal; font-size: 27px; line-height: 1.05; color: #fff; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		text-shadow: 0 0 16px color-mix(in srgb, var(--c) 60%, transparent), 0 2px 0 #000; animation: wr 0.5s 0.32s ease-out both; }
	.rule { height: 1.5px; width: 80%; margin: 4px 0 4px; background: linear-gradient(90deg, var(--c), transparent); transform-origin: 0 50%; animation: draw 0.6s 0.55s ease-out both; }
	.txt small { font-size: 12.5px; color: #c8d3e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: wr 0.45s 0.7s ease-out both; }
	@keyframes wr { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }

	/* the card(s) */
	.cards { position: relative; height: 100%; }
	.card { position: absolute; right: 12px; top: 50%; width: 136px; aspect-ratio: 1192 / 831; margin-top: -47px; border-radius: 8px; background: #000 center/cover; overflow: hidden;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.65), 0 0 0 1px color-mix(in srgb, var(--c) 60%, #000); transform: rotate(-5deg); animation: cardin 0.65s 0.25s cubic-bezier(0.2, 1.3, 0.4, 1) both; }
	@keyframes cardin { from { opacity: 0; transform: translateX(70px) rotate(14deg); } to { opacity: 1; transform: rotate(-5deg); } }
	.card.fan { width: 104px; margin-top: -36px; right: calc(34px - var(--i) * 26px); transform: rotate(calc(var(--i) * 9deg)); animation-name: fanin; }
	@keyframes fanin { from { opacity: 0; transform: translateY(30px) rotate(0deg); } to { opacity: 1; transform: rotate(calc(var(--i) * 9deg)); } }
	.sheen { position: absolute; top: -20%; bottom: -20%; left: 0; width: 34%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.55), transparent); transform: translateX(-120%) skewX(-12deg); animation: sheen 0.9s 0.95s ease-in-out both; }
	@keyframes sheen { to { transform: translateX(380%) skewX(-12deg); } }
	.won { border-color: #ffe08a; }

	/* phones: smaller, under the phone's top bar */
	.ph { top: 64px; height: 88px; width: 380px; grid-template-columns: 86px minmax(0, 1fr) 120px; }
	.ph .circ { width: 70px; height: 70px; margin-left: 10px; }
	.ph .core { width: 30px; height: 30px; margin: -15px; }
	.ph .txt { padding-left: 10px; }
	.ph .txt b { font-size: 20px; }
	.ph .txt small { font-size: 11px; }
	.ph .card { width: 100px; margin-top: -35px; right: 8px; }
	.ph .card.fan { width: 78px; margin-top: -27px; right: calc(22px - var(--i) * 18px); }
	.ph .ghost { right: 70px; }
	@media (prefers-reduced-motion: reduce) { .st *, .st { animation-duration: 0.01s !important; animation-delay: 0s !important; } }
</style>
