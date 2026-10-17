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

	export let size = 48
	export let phone = false
	export let fx = true
	export let ult = false
	/** the power the card acting opens now (null = rest) */
	export let kind: 'laugh' | 'grip' | 'name' | 'crack' | null = null
	export let doubt: NkColor | null = null
	export let enemies: NkEnemy[] = []
	export let laughed = false
	export let swapsLeft = 3
	/** the names his laugh would make discard (with the ultimate) */
	export let targets: string[] = []
	/** reach of the card acting: Mind Grip's range, Laughter's radius */
	export let reach = 0
	export let crackDir: number | null = null
	export let onLaugh: () => void = () => {}
	export let onSwap: (target: string, a: number, b: number) => void = () => {}
	export let onName: (c: NkColor) => void = () => {}
	export let onCrack: (dir: number) => void = () => {}
	export let onRead: (hero: string, idx: number) => void = () => {}

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
	const AXES = ['↗ ↙', '← →', '↘ ↖']

	$: z = phone ? size - 4 : size
	$: wl = phone ? 0.85 : 1
	$: hx = phone ? 1.06 : 1.14
	$: live = !!kind
	// the slot = the wings fully spread: 2 × (1.15·wl − 0.38) + 1 disc
	$: slotW = Math.ceil(z * (2 * (1.15 * wl - 0.38) + 1))
	let open = false
	$: if (!kind) open = false
	let pick: { pid: string; t: number } | null = null
	$: if (kind !== 'laugh') pick = null
	function tapSlot(pid: string, t: number) {
		if (swapsLeft <= 0) return
		if (!pick || pick.pid !== pid) { pick = { pid, t }; return }
		if (pick.t === t) { pick = null; return }
		onSwap(pid, pick.t, t); pick = null
	}
	$: tip = kind === 'laugh' ? 'Diabolical Laughter' : kind === 'grip' ? 'Mind Grip — read an enemy’s previous card' : kind === 'name' ? 'Name a colour' : kind === 'crack' ? 'Split the board' : 'NebKher'
	const onKey = (e: KeyboardEvent) => { if (open && e.key === 'Escape') open = false }
	const title = (k: typeof kind) => (k === 'laugh' ? 'Diabolical Laughter' : k === 'grip' ? 'Previous turn slots' : k === 'name' ? 'Name a colour' : 'Crack in Reality')
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
		<div class="np {phone ? 'sheet' : 'pop'}" role="dialog" tabindex="-1" aria-label={title(kind)} on:click|stopPropagation on:keydown|stopPropagation={(e) => e.key === 'Escape' && (open = false)}>
			<div class="nh"><b>{title(kind)}</b><button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
			{#if kind === 'laugh'}
				<button class="laugh" class:ult disabled={laughed} on:click={() => { onLaugh(); open = false }}>
					<b>{laughed ? 'Laughed' : 'Laugh'}</b>
					<small>{laughed ? 'once per card' : ult ? (targets.length ? `${targets.join(', ')} must discard or be defeated` : 'No enemy hero in radius') : 'Then choose up to three times'}</small>
				</button>
				<div class="sl">Swap two resolved cards <em>{swapsLeft} left</em></div>
				{#each enemies as e (e.pid)}
					<div class="er">
						<span class="en"><b>{e.name}</b>{#if e.dist != null}<em class:in={e.dist <= reach}>{e.dist} {e.dist === 1 ? 'space' : 'spaces'}{e.dist <= reach ? ' · in radius' : ''}</em>{/if}</span>
						<span class="slots">
							{#each [0, 1, 2, 3] as t (t)}
								{@const s = e.slots.find((x) => x.t === t)}
								<button class="sc" class:pick={pick?.pid === e.pid && pick.t === t} disabled={!s || swapsLeft <= 0} on:click={() => tapSlot(e.pid, t)} title={s ? (s.hidden ? 'Face down' : heroCards(e.hero)[s.idx]?.name ?? '') : ''}>
									<small>{['I', 'II', 'III', 'IV'][t]}</small>
									{#if s}<span class="cf">{#if s.hidden}<CardBack hero={e.hero} />{:else}<Card heroId={e.hero} card={heroCards(e.hero)[s.idx]} />{/if}</span>{/if}
								</button>
							{/each}
						</span>
					</div>
				{:else}<div class="none">No enemy heroes</div>{/each}
			{:else if kind === 'grip'}
				{#each enemies as e (e.pid)}
					<button class="gr" disabled={e.prev == null || e.prevHidden} on:click={() => e.prev != null && onRead(e.hero, e.prev)}>
						<span class="en"><b>{e.name}</b>{#if e.dist != null}<em class:in={e.dist <= reach}>{e.dist} {e.dist === 1 ? 'space' : 'spaces'}{e.dist <= reach ? ' · in range' : ''}</em>{/if}</span>
						{#if e.prev == null}<i>No previous card</i>{:else if e.prevHidden}<i>Face down</i>{:else}<span class="gc"><span class="cf"><Card heroId={e.hero} card={heroCards(e.hero)[e.prev]} /></span><span>{heroCards(e.hero)[e.prev]?.name ?? ''}</span></span>{/if}
					</button>
				{:else}<div class="none">No enemy heroes</div>{/each}
			{:else if kind === 'name'}
				<div class="cols">
					{#each NK_COLORS as c (c)}
						<button class="col" class:on={doubt === c} style="--gc:{GEM[c]}" on:click={() => onName(c)}><span class="dot"></span>{CNAME[c]}</button>
					{/each}
				</div>
			{:else if kind === 'crack'}
				<div class="axes">
					{#each [0, 1, 2] as d (d)}
						<button class="ax" class:on={crackDir === d} on:click={() => onCrack(d)}><svg viewBox="0 0 40 40" aria-hidden="true"><line x1="20" y1="20" x2={20 + 15 * Math.cos(((-60 + d * 60) * Math.PI) / 180)} y2={20 + 15 * Math.sin(((-60 + d * 60) * Math.PI) / 180)} /><line x1="20" y1="20" x2={20 - 15 * Math.cos(((-60 + d * 60) * Math.PI) / 180)} y2={20 - 15 * Math.sin(((-60 + d * 60) * Math.PI) / 180)} /><circle cx="20" cy="20" r="4" /></svg><small>{AXES[d]}</small></button>
					{/each}
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
	/* motion (the Dashboard switch): opacity / transform only */
	.fx .glow, .fx .wing :global(.tips), .fx .iris { animation: nkbr 2.6s ease-in-out infinite; }
	.fx .heat { animation: nkhl 2.6s ease-out infinite; }
	.live:not(.fx) .glow { opacity: 0.55; }
	@keyframes nkbr { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.95; } }
	@keyframes nkhl { 0% { opacity: 0.75; transform: scale(0.86); } 100% { opacity: 0; transform: scale(var(--hx)); } }
	@media (prefers-reduced-motion: reduce) { .unit * { animation: none !important; transition: none !important; } }

	/* the panel: above the button (desktop), a bottom sheet over the dash (phone) */
	.np { --brass: #d8b36a; --brass-hi: #f4dfa8; pointer-events: auto; z-index: 30; width: 340px; box-sizing: border-box; padding: 10px 12px 12px; border-radius: 14px; color: #f2ecdf; text-align: left;
		background: linear-gradient(180deg, rgba(16, 40, 66, 0.99), rgba(6, 19, 34, 0.99)); border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); display: flex; flex-direction: column; gap: 8px; }
	.np.pop { position: absolute; bottom: calc(100% + 24px); left: 50%; transform: translateX(-50%); }
	.np.pop::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: rgb(6, 19, 34); border-right: 1px solid rgba(216, 179, 106, 0.45); border-bottom: 1px solid rgba(216, 179, 106, 0.45); }
	.np.sheet { position: fixed; left: 8px; right: 8px; width: auto; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); }
	.nh { display: flex; align-items: center; gap: 8px; }
	.nh b { flex: 1; font-size: 15px; font-weight: normal; color: var(--brass-hi); letter-spacing: 0.02em; }
	.nx { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #c9d4df; font-size: 11px; cursor: pointer; }
	.laugh { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 10px; border-radius: 12px; cursor: pointer; color: #1b1204;
		background: linear-gradient(180deg, #f4dfa8, #d8b36a); border: 0; }
	.laugh.ult { background: linear-gradient(180deg, #e3c2ff, #9b5be0); color: #1a0b2c; }
	.laugh b { font-weight: normal; font-size: 17px; letter-spacing: 0.08em; text-transform: uppercase; }
	.laugh small { font-size: 11px; letter-spacing: 0.02em; text-align: center; }
	.laugh:disabled { opacity: 0.45; cursor: default; }
	.sl { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: #8a9fb3; letter-spacing: 0.04em; padding-top: 6px; border-top: 1px solid rgba(216, 179, 106, 0.22); }
	.sl em { font-style: normal; color: var(--brass-hi); margin-left: auto; }
	.er { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
	.en { display: flex; flex-direction: column; min-width: 0; }
	.en b { font-weight: normal; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.en em { font-style: normal; font-size: 10.5px; color: #8a9fb3; }
	.en em.in { color: #7fe0c4; }
	.slots { display: flex; gap: 4px; }
	.sc { position: relative; width: 34px; height: 46px; padding: 0; border-radius: 5px; border: 1px solid rgba(216, 179, 106, 0.3); background: rgba(0, 0, 0, 0.3); overflow: hidden; cursor: pointer; }
	.sc:disabled { cursor: default; opacity: 0.5; }
	.sc.pick { border: 2px solid var(--brass-hi); box-shadow: 0 0 8px rgba(244, 223, 168, 0.6); }
	.sc .cf { position: absolute; inset: 0; display: block; }
	.cf :global(.cardface), .cf :global(canvas), .cf :global(img) { width: 100%; height: 100%; display: block; }
	.sc small { position: absolute; left: 2px; top: 1px; font-size: 9px; color: #f4dfa8; text-shadow: 0 1px 2px #000; z-index: 1; }
	.gr { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(216, 179, 106, 0.25); background: rgba(0, 0, 0, 0.22); color: inherit; text-align: left; cursor: pointer; }
	.gr:disabled { cursor: default; opacity: 0.7; }
	.gr i { font-size: 11px; color: #8a9fb3; }
	.gc { display: flex; align-items: center; gap: 6px; max-width: 170px; }
	.gc .cf { position: relative; width: 30px; height: 42px; border-radius: 4px; overflow: hidden; flex: none; }
	.gc span { font-size: 12px; color: #f4dfa8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cols { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
	.col { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; border-radius: 10px; border: 1px solid rgba(216, 179, 106, 0.25); background: rgba(0, 0, 0, 0.22); color: #e9e2d2; font-size: 11px; cursor: pointer; }
	.col .dot { width: 20px; height: 20px; border-radius: 50%; background: var(--gc); box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.4); }
	.col.on { border-color: var(--brass-hi); background: rgba(216, 179, 106, 0.16); }
	.axes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.ax { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border-radius: 10px; border: 1px solid rgba(216, 179, 106, 0.25); background: rgba(0, 0, 0, 0.22); color: #c9d4df; cursor: pointer; }
	.ax svg { width: 40px; height: 40px; }
	.ax line { stroke: #d7b0ff; stroke-width: 3; stroke-linecap: round; }
	.ax circle { fill: #f4dfa8; }
	.ax small { font-size: 11px; }
	.ax.on { border-color: #d7b0ff; background: rgba(140, 85, 214, 0.2); }
	.none { font-size: 12px; color: #8a9fb3; }
</style>
