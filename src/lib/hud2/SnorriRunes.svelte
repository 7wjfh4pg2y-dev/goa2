<script lang="ts">
	import { outside } from './outside'
	// Snorri's dash button: the rune active this turn, large, with the turn's numeral on a small tab (a dark, blank rune
	// before his first Inscribe), inside a RUNE CIRCLE (the user's pick A, 2026-10-16: the 24 Elder Futhark between two
	// thin circles). The circle rests dim and still; it lights ice-blue and turns while he can (re)inscribe — his silver
	// is the card acting — and violet all through his acting turn once Rune Mastery is his (second rune picked or not) (the turning + breathing glow = the
	// Dashboard switch). The second rune rides as a violet badge. A tap opens the rune panel (the phone: a bottom sheet).
	import { onDestroy } from 'svelte'
	import { RUNES, type Rune } from '$lib/heropower'
	import RuneMark from './RuneMark.svelte'
	import RunePanel from './RunePanel.svelte'

	export let runes: Rune[] | null = null
	export let turnIdx = 0
	export let second: Rune | null = null
	export let ult = false
	export let canEdit = false
	export let canSecond = false
	export let fx = true
	export let size = 48
	export let phone = false
	/** the arrangement to inscribe (the ring confirms it), or null when there's nothing to confirm */
	export let onDraft: (o: Rune[] | null) => void = () => {}
	export let onSecond: (r: Rune | null) => void = () => {}

	const ROMAN = ['I', 'II', 'III', 'IV']
	// the circle, drawn once: 200-unit box, centre 100,100; each rune a 10 × 16 stroke drawing, standing outward
	const FUTHARK = ['M3 0V16M3 4L9 0M3 8L9 4', 'M2 16V0L8 5V16', 'M3 0V16M3 4L8 8L3 12', 'M3 0V16M3 0L9 4M3 5L9 9', 'M2 16V0L8 4L2 8L8 16', 'M8 2L2 8L8 14', 'M1 2L9 14M9 2L1 14', 'M3 0V16M3 0L8 4L3 8',
		'M2 0V16M8 0V16M2 5L8 11', 'M5 0V16M2 5L8 11', 'M5 0V16', 'M4 2L1 6L4 10M6 6L9 10L6 14', 'M5 0V16M5 0L8 3M5 16L2 13', 'M2 1V15M2 1L6 5L8 2M2 15L6 11L8 14', 'M5 0V16M5 6L1 1M5 6L9 1', 'M7 0L2 6L8 10L3 16',
		'M5 0V16M5 0L1 5M5 0L9 5', 'M2 0V16M2 0L8 4L2 8L8 12L2 16', 'M1 16V0L5 6L9 0V16', 'M1 16V0L9 8M9 16V0L1 8', 'M3 16V0L8 5', 'M5 0L9 8L5 16L1 8Z', 'M1 0V16L9 0V16Z', 'M5 0L9 6L1 14M5 0L1 6L9 14']
	const K = 15 / 16, R = 72.5
	const GLYPHS = FUTHARK.map((d, i) => ({ d, tf: `rotate(${i * 15} 100 100) translate(${100 - 5 * K} ${100 - R - 8 * K}) scale(${K})` }))
	const uid = `snr${Math.random().toString(36).slice(2, 8)}`
	let open = false
	let draft: Rune[] = [...(runes ?? RUNES)]
	$: active = runes?.[turnIdx] ?? null
	// the circle lights: ice while he may inscribe, violet while Rune Mastery waits for a second rune
	$: lit = canEdit ? 'ice' : canSecond ? 'vio' : null
	// a new arrangement is offered to the ring only when it differs from what's inscribed (or nothing is yet)
	$: pending = open && canEdit && (!runes || draft.some((r, i) => r !== runes![i])) ? draft : null
	$: onDraft(pending)
	// the inscription landed (or the panel's chance passed): back to the runes as they are
	let seen = runes
	$: if (runes !== seen) { seen = runes; draft = [...(runes ?? RUNES)]; if (canEdit) open = false }
	function toggle() { open = !open; if (open) draft = [...(runes ?? RUNES)] }
	const onKey = (e: KeyboardEvent) => { if (open && e.key === 'Escape') open = false }
	onDestroy(() => onDraft(null))
</script>

<svelte:window on:keydown={onKey} />
<span class="sr" class:ph={phone} use:outside={{ on: open, close: () => (open = false) }} style="--z:{phone ? size - 7 : size}px">
	<span class="circ {lit ?? 'rest'}" class:spin={!!lit && fx} aria-hidden="true">
		{#if lit}
			<svg class="cg" viewBox="0 0 200 200"><defs><filter id={uid} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2" /></filter></defs>
				<g filter="url(#{uid})"><circle class="halo" cx="100" cy="100" r={R} /><circle class="ln" cx="100" cy="100" r="59" /><circle class="ln" cx="100" cy="100" r="86" />{#each GLYPHS as g}<path class="gl" d={g.d} transform={g.tf} />{/each}</g></svg>
		{/if}
		<svg class="cr" viewBox="0 0 200 200"><circle class="ln" cx="100" cy="100" r="59" /><circle class="ln" cx="100" cy="100" r="86" />{#each GLYPHS as g}<path class="gl" d={g.d} transform={g.tf} />{/each}</svg>
	</span>
	<button class="rb" class:ready={canEdit} class:ult class:open on:click={toggle} title={canEdit ? 'Inscribe the Runes — arrange them' : active ? 'Your runes' : 'No runes yet — play your silver to inscribe them'} aria-label="Runes">
		<RuneMark rune={active} size={(phone ? size - 7 : size) - 8} on={!!active} {fx} />
		<b class="tab">{ROMAN[turnIdx] ?? ''}</b>
		{#if second}<span class="two"><RuneMark rune={second} size={Math.round(size * 0.42)} second fx={false} /></span>{/if}
	</button>
	{#if open}
		<RunePanel {runes} bind:draft {turnIdx} {canEdit} {canSecond} {second} {fx} variant={phone ? 'sheet' : 'pop'} {onSecond} onClose={() => (open = false)} />
	{/if}
</span>

<style>
	.sr { position: relative; display: inline-grid; place-items: center; width: calc(var(--z) * 1.8); height: var(--z); }
	.rb { position: relative; width: var(--z); height: var(--z); padding: 0; border: 0; border-radius: 50%; background: none; display: grid; place-items: center; cursor: pointer; pointer-events: auto; }
	.rb::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.rb.ult::before { box-shadow: inset 0 0 0 2px #a46be8, 0 2px 6px rgba(0, 0, 0, 0.5); }
	.rb.ready::before { box-shadow: inset 0 0 0 2px #f4dfa8, 0 0 12px rgba(244, 223, 168, 0.6); }
	.rb.open::before { box-shadow: inset 0 0 0 2px #f4dfa8; }
	.rb > :global(.rm) { position: relative; }
	/* the rune circle: one span that turns (transform), its blurred twin breathing (opacity) — nothing else moves */
	.circ { position: absolute; left: calc(50% - var(--z)); top: calc(50% - var(--z)); width: calc(var(--z) * 2); height: calc(var(--z) * 2); pointer-events: none; --rl: #3d5068; --rg: #5d6e84; --rh: transparent; }
	/* the phone's tools row is short: a smaller button, the circle drawn tighter round it */
	.sr.ph { width: calc(var(--z) * 1.95); margin-left: -7px; }
	.sr.ph .circ { left: calc(50% - var(--z) * 0.95); top: calc(50% - var(--z) * 0.95); width: calc(var(--z) * 1.9); height: calc(var(--z) * 1.9); }
	.circ.ice { --rl: #7fd0ff; --rg: #cdeeff; --rh: #2f9bff; }
	.circ.vio { --rl: #c39bff; --rg: #efe0ff; --rh: #9a5cf0; }
	.circ svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.circ .ln { fill: none; stroke: var(--rl); stroke-width: 2.2; }
	.circ .gl { fill: none; stroke: var(--rg); stroke-width: 2.35; stroke-linecap: round; stroke-linejoin: round; }
	.circ.rest .cr { opacity: 0.7; }
	.circ .halo { fill: none; stroke: var(--rh); stroke-width: 30; opacity: 0.55; }
	.circ .cg { opacity: 0.8; }
	.circ.spin { animation: srspin 36s linear infinite; }
	.circ.spin .cg { animation: srbr 2.4s ease-in-out infinite; }
	@keyframes srspin { to { transform: rotate(360deg); } }
	@keyframes srbr { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .circ.spin, .circ.spin .cg { animation: none; } }
	.tab { position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); min-width: 16px; height: 13px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; display: grid; place-items: center;
		font-size: 9px; line-height: 1; font-weight: normal; color: #1b1206; background: #d8b36a; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
	.two { position: absolute; top: -5px; right: -6px; display: grid; }
</style>
