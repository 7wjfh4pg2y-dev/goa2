<script lang="ts">
	// Snorri's dash button: the rune active this turn, large, with the turn's numeral on a small tab (a dark, blank rune
	// before his first Inscribe). It glows when he can (re)inscribe — his silver is the card acting — and carries Rune
	// Mastery's second rune as a violet badge. A tap opens the rune panel above it (the phone: a bottom sheet).
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
	let open = false
	let draft: Rune[] = [...(runes ?? RUNES)]
	$: active = runes?.[turnIdx] ?? null
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
<span class="sr" style="--z:{size}px">
	<button class="rb" class:ready={canEdit} class:ult class:open on:click={toggle} title={canEdit ? 'Inscribe the Runes — arrange them' : active ? 'Your runes' : 'No runes yet — play your silver to inscribe them'} aria-label="Runes">
		{#if canEdit && fx}<i class="glow"></i>{/if}
		<RuneMark rune={active} size={size - 8} on={!!active} {fx} />
		<b class="tab">{ROMAN[turnIdx] ?? ''}</b>
		{#if second}<span class="two"><RuneMark rune={second} size={Math.round(size * 0.42)} second fx={false} /></span>{/if}
	</button>
	{#if open}
		<RunePanel {runes} bind:draft {turnIdx} {canEdit} {canSecond} {second} {fx} variant={phone ? 'sheet' : 'pop'} {onSecond} onClose={() => (open = false)} />
	{/if}
</span>

<style>
	.sr { position: relative; display: inline-grid; place-items: center; width: var(--z); height: var(--z); }
	.rb { position: relative; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 50%; background: none; display: grid; place-items: center; cursor: pointer; pointer-events: auto; }
	.rb::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.rb.ult::before { box-shadow: inset 0 0 0 2px #a46be8, 0 2px 6px rgba(0, 0, 0, 0.5); }
	.rb.ready::before { box-shadow: inset 0 0 0 2px #f4dfa8, 0 0 12px rgba(244, 223, 168, 0.6); }
	.rb.open::before { box-shadow: inset 0 0 0 2px #f4dfa8; }
	.rb > :global(.rm) { position: relative; }
	.glow { position: absolute; inset: -18%; border-radius: 50%; background: radial-gradient(closest-side, rgba(244, 223, 168, 0.55), transparent); animation: srg 1.8s ease-in-out infinite; pointer-events: none; }
	@keyframes srg { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
	.tab { position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); min-width: 16px; height: 13px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; display: grid; place-items: center;
		font-size: 9px; line-height: 1; font-weight: normal; color: #1b1206; background: #d8b36a; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
	.two { position: absolute; top: -5px; right: -6px; display: grid; }
</style>
