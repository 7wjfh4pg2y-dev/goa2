<script lang="ts">
	// Razzle's dash button — the BIG TOP JUGGLER (the user's pick, 2026-10-18, artifact "Razzle's Big Top"): her circus
	// tent seen from above, cyan and magenta stripes with a gold star on the king pole, and a ring of her star balls
	// round it — one ball for each of her on the board (dotted rings for the empty places). While one of her cards
	// opens something (Stunt Doubles after the attack, Crowd Control, Rummage / Ransack after the attack) the colours
	// come up, the tent turns slowly clockwise and the ring of balls orbits ANTICLOCKWISE while each ball spins
	// clockwise. Ultimate (Twin Strike): Velvet & Gold's plum and gold tent with Royal Big Top's balls, and small gold /
	// pink / lilac / silver sparkles (their own switch: Effects → Sparkles). Motion = the Dashboard switch.
	// A tap opens her panel: the shelf of faces for a double (Stunt Doubles), Remove doubles (Crowd Control), her
	// discard to retrieve from (Rummage / Ransack), else who of her is on the board.
	import Card from '$lib/cards/Card.svelte'
	import { heroCards } from '$lib/cards/deck'
	import { altFace, portraitCss } from '$lib/heroes'

	export let size = 48
	export let phone = false
	export let fx = true
	export let sparkle = true
	export let ult = false
	/** what the card acting opens now (null = rest) */
	export let kind: 'spawn' | 'clear' | 'retrieve' | null = null
	/** the faces of her bodies on the board (0 = her portrait), her own piece first */
	export let faces: number[] = [0]
	/** doubles left to spawn / cards left to retrieve for this card */
	export let left = 0
	/** her discard (Rummage / Ransack) */
	export let discard: number[] = []
	/** the face picked off the shelf, waiting for its space on the board */
	export let picking: number | null = null
	/** the panel is open (bound: the action ring opens it) */
	export let open = false
	export let onFace: (face: number | null) => void = () => {}
	export let onClear: () => void = () => {}
	export let onRetrieve: (idx: number) => void = () => {}

	const f = (n: number) => n.toFixed(1)
	const star = (cx: number, cy: number, R: number, r: number) => { let d = ''; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r : R, a = ((i * 36 - 90) * Math.PI) / 180; d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a)) } return d + 'Z' }
	const TENT = `<svg viewBox="0 0 100 100">${Array.from({ length: 12 }, (_, k) => {
		const a0 = ((k * 30 - 90) * Math.PI) / 180, a1 = (((k + 1) * 30 - 90) * Math.PI) / 180
		return `<path d="M50 50 L${f(50 + 46 * Math.cos(a0))} ${f(50 + 46 * Math.sin(a0))} A46 46 0 0 1 ${f(50 + 46 * Math.cos(a1))} ${f(50 + 46 * Math.sin(a1))} Z" fill="${k % 2 ? 'var(--a)' : 'var(--b)'}" stroke="#12081c" stroke-width=".8"/>`
	}).join('')}${Array.from({ length: 12 }, (_, k) => { const a = (((k + 0.5) * 30 - 90) * Math.PI) / 180; return `<circle cx="${f(50 + 44 * Math.cos(a))}" cy="${f(50 + 44 * Math.sin(a))}" r="5.4" fill="${k % 2 ? 'var(--b2)' : 'var(--a2)'}" stroke="#12081c" stroke-width=".8"/>` }).join('')}
		<circle cx="50" cy="50" r="15" fill="var(--core)" stroke="var(--gd)" stroke-width="2"/><path d="${star(50, 50, 12, 5)}" fill="var(--gd)" stroke="#12081c" stroke-width="1"/></svg>`
	const BALL = (i: number) => `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="12.5" fill="var(--k${i + 1})" stroke="var(--kr)" stroke-width="3"/><path d="${star(15, 15, 8, 3.6)}" fill="var(--bs)"/></svg>`
	const SPARK = `<svg viewBox="-10 -10 20 20"><path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10 Z" fill="var(--sp)"/></svg>`
	// the four ball places on the orbit, 90° apart from the top left
	const PLACES = [225, 315, 45, 135].map((deg) => { const a = ((deg - 90) * Math.PI) / 180; return [50 + 42.7 * Math.cos(a), 50 + 42.7 * Math.sin(a)] })
	// 14 small glints in four colours (gold · pink · lilac · silver), staggered so a few are always lit
	const SPK_C = ['#f2c95a', '#ff6fc8', '#c9a2ff', '#e8ecf5']
	const SPARKS = Array.from({ length: 14 }, (_, i) => { const a = (i * 137.5 * Math.PI) / 180, r = 30 + ((i * 53) % 19); return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), d: (i * 0.37) % 1.5, c: SPK_C[i % 4] } })
	const FACE_NAME = ['Razzle', 'Alleyoop', 'Hit and Gone', "Aaaand it's gone!"]
	const faceCss = (n: number) => (n ? `background-image:url('${altFace('razzle', n)}');background-size:cover;background-position:center;` : portraitCss('razzle'))

	$: z = phone ? size - 5 : size
	$: slotW = Math.ceil(z * (phone ? 1.32 : 1.66))
	$: live = !!kind
	$: count = Math.max(1, Math.min(4, faces.length))
	$: title = kind === 'spawn' ? 'Stunt Doubles' : kind === 'clear' ? 'Crowd Control' : kind === 'retrieve' ? 'Retrieve' : 'Razzle'
	$: tip = kind === 'spawn' ? 'Spawn a double' : kind === 'clear' ? 'Crowd Control: every other one of you leaves' : kind === 'retrieve' ? 'Take a discarded card back' : `${count} of you on the board`
	// the move the panel was opened for is over (the last retrieve, the card ended): fold it away
	let wasKind = kind
	$: if (kind !== wasKind) { if (wasKind && !kind) open = false; wasKind = kind }
	function pick(n: number) { const off = picking === n; onFace(off ? null : n); if (!off) open = false }
	const onKey = (e: KeyboardEvent) => { if (open && e.key === 'Escape') open = false }
</script>

<svelte:window on:keydown={onKey} />
<span class="rz" class:ph={phone} style="--s:{z}px; width:{slotW}px">
	<span class="u" class:on={live} class:ult class:fx class:sparkle={sparkle && ult}>
		<span class="lay glow"></span>
		<button class="btn" class:ready={live} class:open on:click={() => (open = !open)} title={tip} aria-label={tip}>
			<span class="tent">{@html TENT}</span>
		</button>
		<span class="orbit">
			{#each PLACES as [x, y], i (i)}
				{#if i < count}<span class="ball" style="left:{f(x)}%;top:{f(y)}%">{@html BALL(i)}</span>
				{:else}<span class="vac" style="left:{f(x)}%;top:{f(y)}%"></span>{/if}
			{/each}
			{#if sparkle && ult}
				{#each SPARKS as k, i (i)}<span class="spk" style="left:{f(k.x)}%;top:{f(k.y)}%;--sp:{k.c};animation-delay:-{f(k.d)}s">{@html SPARK}</span>{/each}
			{/if}
		</span>
	</span>
	{#if open}
		<div class="nw" class:ph={phone} role="dialog" tabindex="-1" aria-label={title} on:click|stopPropagation on:keydown|stopPropagation={(e) => e.key === 'Escape' && (open = false)}>
			<div class="np">
				<div class="nh"><b>{title}</b>{#if kind === 'spawn' || kind === 'retrieve'}<em>{left} left</em>{/if}<button class="nx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
				{#if kind === 'spawn'}
					<div class="rule"><span>Pick a face · then a space</span></div>
					<div class="faces">
						{#each [1, 2, 3] as n (n)}
							{@const out = faces.includes(n)}
							<button class="fc" class:on={picking === n} disabled={out || left <= 0} on:click={() => pick(n)} title={out ? `${FACE_NAME[n]} — on the board` : FACE_NAME[n]}>
								<span class="face" style={faceCss(n)}></span><small>{out ? 'On the board' : FACE_NAME[n]}</small>
							</button>
						{/each}
					</div>
				{:else if kind === 'clear'}
					<div class="faces">{#each faces as n, i (i)}<span class="fc still"><span class="face" style={faceCss(n)}></span></span>{/each}</div>
					<button class="go" on:click={() => { onClear(); open = false }}>Remove doubles</button>
				{:else if kind === 'retrieve'}
					{#if discard.length}
						<div class="cards" style="--n:{Math.min(discard.length, 6)}">
							{#each discard as idx (idx)}
								<button class="cd" disabled={left <= 0} on:click={() => onRetrieve(idx)} title="Take {heroCards('razzle')[idx]?.name} back"><Card heroId="razzle" card={heroCards('razzle')[idx]} /></button>
							{/each}
						</div>
					{:else}<div class="none">Your discard is empty</div>{/if}
				{:else}
					<div class="rule"><span>On the board</span><em>{count} / 4</em></div>
					<div class="faces">{#each faces as n, i (i)}<span class="fc still"><span class="face" style={faceCss(n)}></span><small>{FACE_NAME[n]}</small></span>{/each}</div>
				{/if}
			</div>
		</div>
	{/if}
</span>

<style>
	.rz { position: relative; display: inline-grid; place-items: center; height: var(--s); flex: none; }
	.rz.ph { height: 34px; }
	/* palette: idle = faded greasepaint · on = cyan / magenta · ult = plum + gold tent, magenta / violet / plum balls */
	.u { position: relative; width: var(--s); height: var(--s); flex: none; display: block; --pd: 1.64;
		--a: #4f7f8c; --b: #8a5677; --a2: #2f515c; --b2: #573548; --gd: #8a7a52; --core: #160d22;
		--k1: #8a5677; --k2: #573548; --k3: #4f7f8c; --k4: #4a3a63; --kr: #8a7a52; --bs: #8a7a52; --g: transparent; }
	.ph .u { --pd: 1.3; }
	.u.on { --a: #2fe0f2; --b: #ff3fa8; --a2: #0f9fb4; --b2: #b71a72; --gd: #f2c95a; --k1: #ff3fa8; --k2: #b71a72; --k3: #2fe0f2; --k4: #7a3fc0; --kr: #f2c95a; --bs: #f2c95a; --g: #ff3fa8; }
	.u.ult { --a: #5a1f7a; --b: #f2c95a; --a2: #3a1050; --b2: #b8902e; --gd: #ff3fa8;
		--k1: #ff3fa8; --k2: #b71a72; --k3: #a65cff; --k4: #5b2596; --kr: #f2c95a; --bs: #f2c95a; --g: #b45cff; }
	.lay { position: absolute; left: calc(var(--s) * -0.5); top: calc(var(--s) * -0.5); width: calc(var(--s) * 2); height: calc(var(--s) * 2); pointer-events: none; display: block; }
	.glow { border-radius: 50%; background: radial-gradient(circle closest-side, transparent 34%, var(--g) 54%, transparent 76%); opacity: 0; }
	.btn { position: absolute; inset: 0; padding: 0; border: 0; border-radius: 50%; cursor: pointer; pointer-events: auto; overflow: hidden;
		background: radial-gradient(circle at 50% 38%, #3a1f52, #120a1e 72%); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.btn.ready { box-shadow: inset 0 0 0 2px #f4dfa8, 0 0 10px rgba(244, 223, 168, 0.45); }
	.tent { position: absolute; inset: 4%; display: block; }
	.tent :global(svg) { width: 100%; height: 100%; display: block; }
	.orbit { position: absolute; left: calc(var(--s) * (1 - var(--pd)) / 2); top: calc(var(--s) * (1 - var(--pd)) / 2); width: calc(var(--s) * var(--pd)); height: calc(var(--s) * var(--pd)); pointer-events: none; display: block; }
	.ball { position: absolute; width: 17%; height: 17%; margin: -8.5% 0 0 -8.5%; display: block; }
	.ball :global(svg) { width: 100%; height: 100%; display: block; overflow: visible; }
	.vac { position: absolute; width: 7%; height: 7%; margin: -3.5% 0 0 -3.5%; border-radius: 50%; border: 1.5px dashed rgba(242, 201, 90, 0.4); box-sizing: border-box; }
	.spk { position: absolute; width: 9%; height: 9%; margin: -4.5% 0 0 -4.5%; opacity: 0; display: block; }
	.spk :global(svg) { width: 100%; height: 100%; display: block; overflow: visible; }
	/* motion (the Dashboard switch): transform / opacity only, each on its own element */
	.fx.on .glow, .fx.ult.on .glow { animation: rzbr 2.4s ease-in-out infinite; }
	.on:not(.fx) .glow { opacity: 0.45; }
	.fx.on .tent { animation: rzcw 16s linear infinite; }
	.fx.on .orbit { animation: rzccw 6s linear infinite; }
	.fx.on .ball :global(svg) { animation: rzcw 1.4s linear infinite; }
	.fx.sparkle .spk { animation: rztw 1.5s ease-in-out infinite; }
	.sparkle:not(.fx) .spk { opacity: 0.8; transform: scale(0.8); }
	@keyframes rzbr { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.85; } }
	@keyframes rzcw { to { transform: rotate(360deg); } }
	@keyframes rzccw { to { transform: rotate(-360deg); } }
	@keyframes rztw { 0%, 100% { opacity: 0; transform: scale(0.2) rotate(0); } 45% { opacity: 1; transform: scale(1) rotate(45deg); } 70% { opacity: 0; transform: scale(0.4) rotate(90deg); } }
	@media (prefers-reduced-motion: reduce) { .u * { animation: none !important; } }

	/* the panel: above the button (desktop), a bottom sheet over the dash (phone) */
	.nw { --brass: #d8b36a; --brass-hi: #f4dfa8; position: absolute; bottom: calc(100% + 24px); left: 50%; transform: translateX(-50%); z-index: 30; pointer-events: auto; color: #f2ecdf; text-align: left; }
	.np { position: relative; box-sizing: border-box; width: max-content; min-width: 240px; max-width: 440px; padding: 9px 10px 10px; display: flex; flex-direction: column; gap: 7px; border-radius: 14px;
		background: linear-gradient(180deg, rgba(40, 20, 58, 0.99), rgba(14, 8, 26, 0.99)); border: 1px solid rgba(255, 79, 176, 0.45); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); }
	.np::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: rgb(14, 8, 26); border-right: 1px solid rgba(255, 79, 176, 0.45); border-bottom: 1px solid rgba(255, 79, 176, 0.45); }
	.nw.ph { position: fixed; left: 8px; right: 8px; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); transform: none; }
	.nw.ph .np { width: auto; max-width: none; }
	.nw.ph .np::after { display: none; }
	.nh { display: flex; align-items: center; gap: 8px; }
	.nh b { flex: 1; font-size: 14px; font-weight: normal; color: #ffb3dd; letter-spacing: 0.02em; white-space: nowrap; }
	.nh em { font-style: normal; font-size: 12px; color: var(--brass-hi); white-space: nowrap; }
	.nx { flex: none; width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #c9d4df; font-size: 11px; cursor: pointer; }
	.rule { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: #a99bb8; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 6px; border-top: 1px solid rgba(255, 79, 176, 0.25); }
	.rule em { font-style: normal; color: var(--brass-hi); margin-left: auto; text-transform: none; letter-spacing: 0.02em; }
	.faces { display: flex; gap: 8px; justify-content: center; }
	.fc { width: 74px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 0 4px; border-radius: 10px; border: 1px solid transparent; background: none; color: #f2e6f6; cursor: pointer; }
	.fc.still { cursor: default; width: 64px; }
	.fc .face { width: 52px; height: 52px; border-radius: 50%; display: block; box-shadow: 0 0 0 2px rgba(255, 79, 176, 0.6); background-color: #1a0d26; }
	.fc small { max-width: 72px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fc:hover:not(:disabled):not(.still) { border-color: rgba(255, 79, 176, 0.4); }
	.fc.on { border-color: #ffb3dd; background: rgba(255, 79, 176, 0.14); }
	.fc:disabled { cursor: default; opacity: 0.42; }
	.go { align-self: center; height: 30px; padding: 0 16px; border-radius: 15px; border: 0; cursor: pointer; color: #1b1204; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; background: linear-gradient(180deg, #f4dfa8, #d8b36a); }
	.cards { display: grid; grid-template-columns: repeat(var(--n, 6), 64px); gap: 6px; max-width: 420px; justify-content: center; }
	.nw.ph .fc { width: 100px; }
	.nw.ph .fc small { max-width: 98px; }
	.nw.ph .cards { max-width: none; grid-template-columns: repeat(auto-fill, 64px); }
	.cd { aspect-ratio: 1192 / 1664; padding: 0; border: 0; border-radius: 5px; overflow: hidden; background: none; cursor: pointer; }
	.cd:disabled { opacity: 0.45; cursor: default; }
	.cd :global(.cardface), .cd :global(canvas) { width: 100%; height: 100%; display: block; }
	.none { font-size: 12px; color: #a99bb8; text-align: center; padding: 4px 0; }
</style>
