<script lang="ts">
	// NebKher's dash button — the WINGED EYE (the user's pick, 2026-10-17, artifact "NebKher's Laughter": the winged
	// scarab's wings, the Eye of Horus in the middle, the Aten's heat ring). At rest the wings lie folded along the
	// disc in weathered sandstone, still. While one of his power cards is the card acting (Diabolical Laughter, a gold,
	// a colour-naming blue, a Crack) the wings spread level in faience and gold, the iris breathes and a heat ring rolls
	// out from the rim. With the ultimate it is purple. A named colour = a scarab gem at the lower right (public).
	// The slot is always as wide as the spread wings, so nothing moves when they open. Motion = the Dashboard switch.
	// A tap opens the panel for the card acting (the phone: a bottom sheet).
	import { NK_COLORS, type NkColor, type NkEnemy } from '$lib/heropower'
	import Card from '$lib/cards/Card.svelte'
	import CardBack from '$lib/cards/CardBack.svelte'
	import { heroCards } from '$lib/cards/deck'
	import { portraitCss } from '$lib/heroes'

	export let size = 48
	export let phone = false
	export let fx = true
	export let ult = false
	/** the power the card acting opens now (null = rest) */
	export let kind: 'laugh' | 'grip' | 'name' | 'crack' | null = null
	export let doubt: NkColor | null = null
	/** the enemy heroes in reach of the card acting (Laughter: its radius; Mind Grip / Probe: its range) */
	export let enemies: NkEnemy[] = []
	export let laughed = false
	export let swapsLeft = 3
	/** the names his laugh would make discard (with the ultimate) */
	export let targets: string[] = []
	export let crackDir: number | null = null
	/** the Crack line he's looking at before he confirms it (only on his screen) */
	export let crackPick: number | null = null
	/** the colour picked and loaded onto the ring, not yet confirmed */
	export let namePick: NkColor | null = null
	export let onLaugh: () => void = () => {}
	/** a swap made on an enemy's board (acts at once, like a move) */
	export let onSwap: (target: string, a: number, b: number) => void = () => {}
	export let onName: (c: NkColor | null) => void = () => {}
	export let onCrack: (dir: number | null) => void = () => {}
	/** Spell Steal: load the stolen card onto the ring */
	export let onSteal: (target: string | null) => void = () => {}
	export let onRead: (hero: string, idx: number) => void = () => {}
	/** the enemy hero whose card he already stole with this Mind Grip (the pill reads Stolen) */
	export let stolen: string | null = null

	const f = (n: number) => n.toFixed(1)
	// one wing, drawn for the LEFT side (the right one is its mirror): eight feathers fanning from the root + a gold covert band
	function wing(mirror: boolean) {
		const fe: string[] = [], tips: string[] = []
		for (let k = 0; k < 8; k++) {
			const a = -6 + k * 5.2, L = 96 - k * 6, t = ((180 + a) * Math.PI) / 180, x = 100 + L * Math.cos(t), y = 22 - L * Math.sin(t)
			fe.push(`<path d="M100 22 L${f(x)} ${f(y - 4)} Q${f(x - 4)} ${f(y)} ${f(x)} ${f(y + 4)} Z" fill="${k % 2 ? 'var(--c2)' : 'var(--c)'}" stroke="#08131f" stroke-width=".8" stroke-linejoin="round"/>`)
			tips.push(`<circle cx="${f(x + 3)}" cy="${f(y)}" r="2" fill="#fff"/>`)
		}
		const cov = Array.from({ length: 7 }, (_, k) => { const x = 98 - k * 9; return `<path d="M${x} 10 Q${x - 6} 20 ${x} 30" fill="none" stroke="#08131f" stroke-width="1"/>` }).join('')
		return `<g ${mirror ? 'transform="translate(100 0) scale(-1 1)"' : ''}>${fe.reverse().join('')}<path d="M100 8 Q60 6 36 16 Q60 30 100 34 Z" fill="var(--gd)" stroke="#08131f" stroke-width="1"/>${cov}<g class="tips">${tips.join('')}</g></g>`
	}
	const WL = wing(false), WR = wing(true)
	const GEM: Record<NkColor, string> = { GOLD: '#e8bd52', SILVER: '#c9d2dc', RED: '#d6453a', BLUE: '#3b7fe0', GREEN: '#41ae59' }
	const CNAME: Record<NkColor, string> = { GOLD: 'Gold', SILVER: 'Silver', RED: 'Red', BLUE: 'Blue', GREEN: 'Green' }

	$: z = phone ? size - 4 : size
	$: wl = phone ? 0.85 : 1
	$: hx = phone ? 1.06 : 1.14
	$: live = !!kind
	// the slot = the wings fully spread: 2 × (1.15·wl − 0.38) + 1 disc
	$: slotW = Math.ceil(z * (2 * (1.15 * wl - 0.38) + 1))
	/** the panel is open (bound: the action ring opens it for Name a colour / Crack) */
	export let open = false
	let panelH = 0
	$: if (!kind) open = false
	// the side window: an enemy's board (Laughter's swaps) or a stolen card's preview (Mind Grip)
	let sideFor: string | null = null
	$: if (!open || (kind !== 'laugh' && kind !== 'grip')) sideFor = null
	$: if (sideFor && !enemies.some((e) => e.pid === sideFor)) sideFor = null
	$: if (kind === 'laugh' && (!laughed || swapsLeft <= 0) && sideFor) sideFor = null
	$: side = sideFor ? enemies.find((e) => e.pid === sideFor) ?? null : null
	$: onSteal(kind === 'grip' && open && stealing ? sideFor : null)
	let stealing = false
	$: if (!sideFor) stealing = false
	function pickFace(pid: string) { stealing = false; sideFor = sideFor === pid ? null : pid }
	$: if (!open && kind === 'crack' && crackPick != null) onCrack(null)
	$: if (!open && kind === 'name' && namePick != null) onName(null)
	// the swap board: drag a card onto another (or tap one, then the other)
	let held: number | null = null, drag: { t: number; x0: number; y0: number; dx: number; dy: number; z: number; moved: boolean } | null = null, over: number | null = null
	$: if (!side) { held = null; drag = null; over = null }
	const ROMAN = ['I', 'II', 'III', 'IV']
	function swapNow(a: number, b: number) { if (side && a !== b && swapsLeft > 0) onSwap(side.pid, a, b); held = null }
	function down(e: PointerEvent, t: number) {
		const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect()
		drag = { t, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, z: r.width / (el.offsetWidth || r.width), moved: false }
		el.setPointerCapture(e.pointerId)
	}
	function move(e: PointerEvent) {
		if (!drag) return
		const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0
		if (!drag.moved && Math.hypot(dx, dy) < 6) return
		drag = { ...drag, dx: dx / drag.z, dy: dy / drag.z, moved: true }
		const hit = (document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[]).find((x) => x.dataset?.nkslot != null && +x.dataset.nkslot! !== drag!.t)
		over = hit ? +hit.dataset.nkslot! : null
	}
	function up(t: number) {
		const d = drag; drag = null
		if (d?.moved) { const o = over; over = null; if (o != null && side?.cards[o]?.ok) swapNow(t, o); return }
		// a tap: pick this card, or swap it with the one picked
		if (held == null) held = t; else if (held === t) held = null; else swapNow(held, t)
	}
	// Crack in Reality: three straight lines of hexes run through a space (pointy-top: across, and both diagonals)
	const DIRS = [{ d: 0, a: -60, n: 'Diagonal ↗' }, { d: 1, a: 0, n: 'Across ↔' }, { d: 2, a: 60, n: 'Diagonal ↘' }]
	const hexPts = (cx: number, cy: number, r: number) => [0, 1, 2, 3, 4, 5].map((i) => { const t = ((60 * i - 90) * Math.PI) / 180; return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}` }).join(' ')
	const chain = (a: number) => [-1, 0, 1].map((k) => { const t = (a * Math.PI) / 180; return { x: 30 + k * 17.3 * Math.cos(t), y: 30 + k * 17.3 * Math.sin(t) } })
	$: tip = kind === 'laugh' ? 'Diabolical Laughter' : kind === 'grip' ? 'Mind Grip — read an enemy’s previous card' : kind === 'name' ? 'Name a colour' : kind === 'crack' ? 'Split the board' : 'NebKher'
	const onKey = (e: KeyboardEvent) => { if (open && e.key === 'Escape') open = false }
	const title = (k: typeof kind) => (k === 'laugh' ? 'Diabolical Laughter' : k === 'grip' ? 'Mind Grip' : k === 'name' ? 'Name a colour' : 'Crack in Reality')
</script>

<svelte:window on:keydown={onKey} />
<span class="nk" class:ph={phone} style="--s:{z}px; --wl:{wl}; --hx:{hx}; width:{slotW}px">
	<span class="unit" class:on={live && !ult} class:ult class:live class:fx={fx && live} class:doubt={!!doubt}>
		<span class="lay glow"></span>
		<span class="lay heat"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="58" fill="none" stroke-width="2.6" /></svg></span>
		<span class="wing l"><svg viewBox="0 0 100 60">{@html WL}</svg></span>
		<span class="wing r"><svg viewBox="0 0 100 60">{@html WR}</svg></span>
		<button class="btn" class:ready={live} class:open on:click={() => kind && (open = !open)} title={tip} aria-label={tip}>
			<svg viewBox="0 0 100 100" aria-hidden="true">
				<path d="M12 40 Q32 18 62 31 Q74 37 90 37" fill="none" stroke="var(--gd)" stroke-width="5" stroke-linecap="round" />
				<path d="M14 52 Q40 28 78 50 Q44 68 14 52 Z" fill="rgba(160,220,255,.06)" stroke="var(--c)" stroke-width="4.4" stroke-linejoin="round" />
				<circle class="iris" cx="46" cy="50" r="11" fill="var(--eye)" /><circle cx="46" cy="50" r="5" fill="#08131f" />
				<path d="M78 50 L93 56 M40 63 L37 84" stroke="var(--c)" stroke-width="4.4" stroke-linecap="round" />
				<path d="M52 63 Q67 71 63 83 Q59 90 52 84 Q52 78 57 79" fill="none" stroke="var(--c)" stroke-width="4.4" stroke-linecap="round" />
			</svg>
		</button>
		{#if doubt}
			<span class="gem" title="{CNAME[doubt]} named" style="--gc:{GEM[doubt]}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#0a1424" stroke="#ebbd4f" stroke-width="2" /><ellipse cx="20" cy="22" rx="10" ry="11" fill="var(--gc)" /><path d="M20 12 V33 M10 20 H30" stroke="rgba(0,0,0,.45)" stroke-width="1.6" /><ellipse cx="20" cy="11" rx="5" ry="3.4" fill="var(--gc)" /><path d="M12 15 L7 11 M28 15 L33 11 M11 28 L7 32 M29 28 L33 32" stroke="#ebbd4f" stroke-width="1.8" stroke-linecap="round" /></svg></span>
		{/if}
	</span>
	{#if open && kind}
		<div class="nw" class:ph={phone} role="dialog" tabindex="-1" aria-label={title(kind)} on:click|stopPropagation on:keydown|stopPropagation={(e) => e.key === 'Escape' && (sideFor ? (sideFor = null) : (open = false))}>
			<div class="np" bind:clientHeight={panelH}>
				{#if kind === 'laugh'}
					<div class="nh">
						<b>{title(kind)}</b>
						<button class="laugh" class:ult class:done={laughed} disabled={laughed} on:click={onLaugh} title={ult && targets.length ? `${targets.join(', ')} must discard or be defeated` : ''}>
							{laughed ? 'Laughed' : 'Laugh'}{#if ult && !laughed && targets.length}<em>☠ {targets.length}</em>{/if}
						</button>
						<button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button>
					</div>
					<div class="rule"><span>Swap cards</span><em>{laughed ? `${swapsLeft} left` : 'laugh first'}</em></div>
					{#if enemies.length}
						<div class="faces">
							{#each enemies as e (e.pid)}
								<button class="fc" class:on={sideFor === e.pid} disabled={!laughed || swapsLeft <= 0 || !e.cards.some((c) => c.ok)} on:click={() => pickFace(e.pid)} title="{e.name} · {e.player}">
									<span class="face" style={portraitCss(e.hero)}></span><small>{e.name}</small>
								</button>
							{/each}
						</div>
					{:else}<div class="none">No enemy hero in radius</div>{/if}
				{:else if kind === 'grip'}
					<div class="nh"><b>{title(kind)}</b><button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
					{#if enemies.length}
						<div class="faces">
							{#each enemies as e (e.pid)}
								<button class="fc" class:on={sideFor === e.pid} disabled={e.prev == null || e.prevHidden} on:click={() => pickFace(e.pid)} title="{e.name} · {e.player}{e.prev == null ? ' — no previous card' : ''}">
									<span class="face" style={portraitCss(e.hero)}></span><small>{e.name}</small>
								</button>
							{/each}
						</div>
					{:else}<div class="none">No enemy hero in range</div>{/if}
				{:else if kind === 'name'}
					<div class="nh"><b>{title(kind)}</b><button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
					<div class="cols">
						{#each NK_COLORS as c (c)}
							<button class="col" class:on={(namePick ?? doubt) === c} class:set={doubt === c} style="--gc:{GEM[c]}" on:click={() => onName(namePick === c ? null : c)}><span class="dot"></span>{CNAME[c]}</button>
						{/each}
					</div>
				{:else if kind === 'crack'}
					<div class="nh"><b>{title(kind)}</b><button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
					<div class="axes">
						{#each DIRS as x (x.d)}
							<button class="ax" class:on={(crackPick ?? crackDir) === x.d} class:set={crackDir === x.d} on:click={() => onCrack(crackPick === x.d ? null : x.d)} title={x.n}>
								<svg viewBox="0 0 60 60" aria-hidden="true">{#each chain(x.a) as h, i (i)}<polygon points={hexPts(h.x, h.y, 9.4)} class:mid={i === 1} />{/each}</svg>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if side && kind === 'laugh'}
				<div class="side board" style="--ph:{panelH}px">
					<div class="bh"><span class="face" style={portraitCss(side.hero)}></span><span class="bn"><b>{side.name}</b><small>{side.player}</small></span><em>{swapsLeft} {swapsLeft === 1 ? 'swap' : 'swaps'} left</em><button class="nx" on:click={() => (sideFor = null)} aria-label="Close">✕</button></div>
					<div class="slots">
						{#each side.cards as c (c.t)}
							<div class="slot" class:ok={c.ok} class:over={over === c.t} class:held={held === c.t} data-nkslot={c.ok ? c.t : null}>
								<small>{ROMAN[c.t]}{c.now ? ' · now' : ''}</small>
								{#if c.idx != null}
									<button class="sc" disabled={!c.ok} style={drag?.t === c.t && drag.moved ? `transform: translate(${drag.dx}px, ${drag.dy}px) rotate(-3deg); z-index: 5` : ''}
										on:pointerdown={(e) => c.ok && down(e, c.t)} on:pointermove={move} on:pointerup={() => c.ok && up(c.t)} on:pointercancel={() => { drag = null; over = null }}>
										{#if c.hidden}<CardBack hero={side.hero} />{:else}<Card heroId={side.hero} card={heroCards(side.hero)[c.idx]} />{/if}
									</button>
								{:else}<span class="empty"></span>{/if}
							</div>
						{/each}
					</div>
					<div class="hint">Drag a card onto another to swap them</div>
				</div>
			{:else if side && kind === 'grip' && side.prev != null}
				<div class="side prev" style="--ph:{panelH}px">
					<button class="pv" on:click={() => side && side.prev != null && onRead(side.hero, side.prev)} title="Read it"><Card heroId={side.hero} card={heroCards(side.hero)[side.prev]} /></button>
					<button class="steal" class:on={stealing} disabled={!!stolen} on:click={() => (stealing = !stealing)}>{stolen === side.pid ? 'Stolen' : 'Spell Steal'}</button>
				</div>
			{/if}
		</div>
	{/if}
</span>

<style>
	.nk { position: relative; display: inline-grid; place-items: center; height: var(--s); flex: none; }
	.nk.ph { height: 34px; }
	.unit { position: relative; width: var(--s); height: var(--s); flex: none;
		--c: #8b8270; --c2: #5c5546; --gd: #7d6c48; --g: transparent; --eye: #8b8270; }
	.unit.on { --c: #6fe6d4; --c2: #1f9c8c; --gd: #ebbd4f; --g: #26c9b2; --eye: #7ff8e6; }
	.unit.ult { --c: #b48ae0; --c2: #6d4a9c; --gd: #b89a5c; --eye: #c9a8ee; }
	.unit.ult.live { --c: #d7b0ff; --c2: #8c55d6; --gd: #e7c56f; --g: #a24bff; --eye: #e3c2ff; }
	.lay { position: absolute; left: calc(var(--s) * -0.5); top: calc(var(--s) * -0.5); width: calc(var(--s) * 2); height: calc(var(--s) * 2); pointer-events: none; display: block; }
	.lay > svg { width: 100%; height: 100%; overflow: visible; display: block; }
	.glow { border-radius: 50%; background: radial-gradient(circle closest-side, transparent 30%, var(--g) 52%, transparent 74%); opacity: 0; }
	.heat { opacity: 0; }
	.heat circle { stroke: var(--gd); }
	.btn { position: absolute; inset: 0; padding: 0; border: 0; border-radius: 50%; cursor: default; pointer-events: auto;
		background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.btn.ready { cursor: pointer; box-shadow: inset 0 0 0 2px #f4dfa8, 0 0 10px rgba(244, 223, 168, 0.45); }
	.ult .btn { box-shadow: inset 0 0 0 2px #a46be8, 0 2px 6px rgba(0, 0, 0, 0.5); }
	.btn svg { position: absolute; inset: 9%; width: 82%; height: 82%; overflow: visible; }
	.iris { opacity: 0.6; }
	.live .iris { opacity: 1; }
	/* the wings: folded along the disc's sides at rest, spread level while a power is live (a transition, no loop) */
	.wing { position: absolute; top: calc(var(--s) * -0.02); width: calc(var(--s) * 1.15 * var(--wl)); height: calc(var(--s) * 0.62 * var(--wl)); display: block; pointer-events: none; transition: transform 0.7s cubic-bezier(0.3, 1.4, 0.5, 1); }
	.wing svg { width: 100%; height: 100%; display: block; overflow: visible; }
	.wing.l { right: 62%; transform-origin: 100% 36%; transform: rotate(-26deg) scaleX(0.62); }
	.wing.r { left: 62%; transform-origin: 0 36%; transform: rotate(26deg) scaleX(0.62); }
	.live .wing.l, .live .wing.r { transform: none; }
	.wing :global(.tips) { opacity: 0; }
	.gem { position: absolute; right: -10%; bottom: -10%; width: 34%; height: 34%; pointer-events: none; }
	.gem svg { width: 100%; height: 100%; display: block; overflow: visible; }
	/* the phone's tools row is short: the gem tucks inside the disc's corner so the dash never cuts it */
	.ph .gem { right: -4%; bottom: -2%; width: 38%; height: 38%; }
	/* motion (the Dashboard switch): opacity / transform only */
	.fx .glow, .fx .wing :global(.tips), .fx .iris { animation: nkbr 2.6s ease-in-out infinite; }
	.fx .heat { animation: nkhl 2.6s ease-out infinite; }
	.live:not(.fx) .glow { opacity: 0.55; }
	@keyframes nkbr { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.95; } }
	@keyframes nkhl { 0% { opacity: 0.75; transform: scale(0.86); } 100% { opacity: 0; transform: scale(var(--hx)); } }
	@media (prefers-reduced-motion: reduce) { .unit * { animation: none !important; transition: none !important; } }

	/* the panel: above the button (desktop), a bottom sheet over the dash (phone); a side window beside it (desktop) or
	   stacked above it (phone): an enemy's board, or a stolen card */
	.nw { --brass: #d8b36a; --brass-hi: #f4dfa8; position: absolute; bottom: calc(100% + 24px); left: 50%; transform: translateX(-50%); z-index: 30; pointer-events: auto; color: #f2ecdf; text-align: left; }
	.np, .side { box-sizing: border-box; border-radius: 14px; background: linear-gradient(180deg, rgba(16, 40, 66, 0.99), rgba(6, 19, 34, 0.99)); border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); }
	.np { position: relative; width: max-content; min-width: 240px; max-width: 420px; padding: 9px 10px 10px; display: flex; flex-direction: column; gap: 7px; }
	.np::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: rgb(6, 19, 34); border-right: 1px solid rgba(216, 179, 106, 0.45); border-bottom: 1px solid rgba(216, 179, 106, 0.45); }
	.side { position: absolute; left: calc(100% + 14px); bottom: 0; padding: 9px 10px 10px; }
	.nw.ph { position: fixed; left: 8px; right: 8px; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); transform: none; }
	.nw.ph .np { width: auto; max-width: none; }
	.nw.ph .np::after { display: none; }
	.nw.ph .side { left: 0; right: 0; bottom: calc(var(--ph) + 8px); }
	.nh { display: flex; align-items: center; gap: 8px; }
	.nh b { flex: 1; font-size: 14px; font-weight: normal; color: var(--brass-hi); letter-spacing: 0.02em; white-space: nowrap; }
	.nx { flex: none; width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #c9d4df; font-size: 11px; cursor: pointer; }
	.laugh { flex: none; height: 26px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border-radius: 13px; cursor: pointer; color: #1b1204; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
		background: linear-gradient(180deg, #f4dfa8, #d8b36a); border: 0; }
	.laugh.ult { background: linear-gradient(180deg, #e3c2ff, #9b5be0); color: #1a0b2c; }
	.laugh em { font-style: normal; font-size: 11px; letter-spacing: 0; opacity: 0.8; }
	.laugh.done { background: rgba(0, 0, 0, 0.3); color: #8a9fb3; border: 1px solid rgba(216, 179, 106, 0.3); cursor: default; }
	.rule { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: #8a9fb3; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 6px; border-top: 1px solid rgba(216, 179, 106, 0.25); }
	.rule em { font-style: normal; color: var(--brass-hi); margin-left: auto; text-transform: none; letter-spacing: 0.02em; }
	.faces { display: flex; gap: 6px; justify-content: center; }
	.fc { width: 58px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 0 3px; border-radius: 10px; border: 1px solid transparent; background: none; color: #e9e2d2; cursor: pointer; }
	.fc .face { width: 44px; height: 44px; border-radius: 50%; display: block; box-shadow: 0 0 0 2px rgba(216, 179, 106, 0.55); background-color: #0b1b30; }
	.fc small { max-width: 56px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fc:hover:not(:disabled) { border-color: rgba(216, 179, 106, 0.35); }
	.fc.on { border-color: var(--brass-hi); background: rgba(216, 179, 106, 0.14); }
	.fc.on .face { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 10px rgba(244, 223, 168, 0.5); }
	.fc:disabled { cursor: default; opacity: 0.38; }
	.fc:disabled .face { filter: grayscale(0.8); }
	.cols { display: grid; grid-template-columns: repeat(5, 48px); gap: 6px; }
	.col { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; border-radius: 10px; border: 1px solid rgba(216, 179, 106, 0.25); background: rgba(0, 0, 0, 0.22); color: #e9e2d2; font-size: 10.5px; cursor: pointer; }
	.col .dot { width: 20px; height: 20px; border-radius: 50%; background: var(--gc); box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.4); }
	.col.on { border-color: var(--brass-hi); background: rgba(216, 179, 106, 0.16); }
	.col.set { box-shadow: inset 0 0 0 1px var(--brass-hi); }
	.nw.ph .cols { grid-template-columns: repeat(5, minmax(0, 1fr)); }
	.axes { display: flex; gap: 8px; justify-content: center; }
	.ax { width: 64px; height: 64px; padding: 2px; border-radius: 12px; border: 1px solid rgba(216, 179, 106, 0.25); background: rgba(0, 0, 0, 0.22); cursor: pointer; }
	.ax svg { width: 100%; height: 100%; display: block; }
	.ax polygon { fill: rgba(197, 140, 255, 0.18); stroke: #b98af0; stroke-width: 1.4; }
	.ax polygon.mid { fill: rgba(244, 223, 168, 0.35); stroke: #f4dfa8; }
	.ax.on { border-color: #c58cff; background: rgba(140, 85, 214, 0.22); }
	.ax.on polygon { fill: rgba(197, 140, 255, 0.5); }
	.ax.set { box-shadow: inset 0 0 0 1px #c58cff; }
	.none { font-size: 12px; color: #8a9fb3; text-align: center; padding: 4px 0; }
	/* an enemy's board: their four turn slots, the resolved ones draggable */
	.board { width: max-content; display: flex; flex-direction: column; gap: 8px; }
	.bh { display: flex; align-items: center; gap: 8px; }
	.bh .face { width: 30px; height: 30px; border-radius: 50%; display: block; flex: none; box-shadow: 0 0 0 2px rgba(216, 179, 106, 0.55); background-color: #0b1b30; }
	.bn { display: flex; flex-direction: column; line-height: 1.1; min-width: 0; flex: 1; }
	.bn b { font-weight: normal; font-size: 14px; color: var(--brass-hi); }
	.bn small { font-size: 11px; color: #8a9fb3; }
	.bh em { font-style: normal; font-size: 12px; color: var(--brass-hi); white-space: nowrap; }
	.slots { display: grid; grid-template-columns: repeat(4, var(--cw, 86px)); gap: 8px; }
	.nw.ph .board { width: auto; }
	.nw.ph .slots { --cw: minmax(0, 1fr); }
	.slot { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px; border-radius: 9px; border: 1px dashed rgba(255, 255, 255, 0.08); }
	.slot small { font-size: 10px; color: #8a9fb3; letter-spacing: 0.06em; }
	.slot.ok { border-color: rgba(216, 179, 106, 0.35); }
	.slot.over { border: 1.5px solid #c58cff; background: rgba(140, 85, 214, 0.2); }
	.slot.held { border: 1.5px solid var(--brass-hi); background: rgba(216, 179, 106, 0.14); }
	.sc { position: relative; width: 100%; aspect-ratio: 1192 / 1664; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: none; touch-action: none; cursor: grab; }
	.sc:disabled { cursor: default; opacity: 0.45; filter: grayscale(0.6); }
	.sc :global(.cardface), .sc :global(canvas) { width: 100%; height: 100%; display: block; }
	.slot .empty { width: 100%; aspect-ratio: 1192 / 1664; border-radius: 6px; background: rgba(0, 0, 0, 0.2); }
	.hint { font-size: 11px; color: #8a9fb3; text-align: center; }
	/* Mind Grip: the stolen card, large, and Spell Steal */
	.prev { width: 214px; display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
	.nw.ph .prev { width: auto; flex-direction: row; align-items: flex-end; }
	.pv { width: 100%; aspect-ratio: 1192 / 1664; padding: 0; border: 0; background: none; border-radius: 8px; overflow: hidden; cursor: zoom-in; }
	.nw.ph .pv { width: 140px; flex: none; }
	.pv :global(.cardface), .pv :global(canvas) { width: 100%; height: 100%; display: block; }
	.steal { height: 34px; border-radius: 17px; border: 0; cursor: pointer; color: #1a0b2c; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; background: linear-gradient(180deg, #e3c2ff, #9b5be0); }
	.nw.ph .steal { flex: 1; }
	.steal:disabled { opacity: 0.5; cursor: default; }
	.steal.on { box-shadow: 0 0 0 2px #f4dfa8, 0 0 12px rgba(197, 140, 255, 0.6); }
</style>
