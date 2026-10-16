<script lang="ts">
	// One of Snorri's round rune markers, at any size. on = the active rune (brass ring, a still glow; with the
	// Dashboard switch a soft breathing halo — opacity only); second = Rune Mastery's pick this turn (violet ring);
	// otherwise it rests dim. empty = a socket with no rune yet.
	import type { Rune } from '$lib/heropower'
	import { RUNE_NAME } from '$lib/heropower'
	import { runeArt } from './runes'

	export let rune: Rune | null = null
	export let size = 16
	export let on = false
	export let second = false
	export let fx = false
</script>

<span class="rm" class:on class:second class:empty={!rune} style="--s:{size}px" title={rune ? `${RUNE_NAME[rune]}${on ? ' · active' : second ? ' · active too (Rune Mastery)' : ''}` : 'No rune yet'}>
	{#if (on || second) && fx}<i class="halo"></i>{/if}
	{#if rune}<img src={runeArt(rune)} alt={RUNE_NAME[rune]} draggable="false" />{/if}
</span>

<style>
	.rm { position: relative; flex: none; width: var(--s); height: var(--s); border-radius: 50%; display: inline-grid; place-items: center; box-sizing: border-box;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7), 0 1px 3px rgba(0, 0, 0, 0.6); background: #0b1422; }
	/* the painted runes are dark stone: lifted so they read on the navy HUD (still filters, never animated) */
	.rm img { width: 100%; height: 100%; border-radius: 50%; display: block; opacity: 0.78; filter: brightness(1.3) saturate(0.7); }
	.rm.empty { background: rgba(0, 0, 0, 0.3); box-shadow: inset 0 0 0 1px rgba(216, 179, 106, 0.35); border: 1px dashed rgba(216, 179, 106, 0.35); }
	.rm.on img, .rm.second img { opacity: 1; filter: brightness(1.45) contrast(1.05); }
	.rm.on { box-shadow: 0 0 0 1.5px #f4dfa8, 0 0 calc(var(--s) * 0.45) rgba(244, 223, 168, 0.55); }
	.rm.second { box-shadow: 0 0 0 1.5px #b98af0, 0 0 calc(var(--s) * 0.45) rgba(164, 107, 232, 0.6); }
	.halo { position: absolute; inset: -30%; border-radius: 50%; pointer-events: none; background: radial-gradient(closest-side, rgba(244, 223, 168, 0.5), transparent); animation: rmb 2.4s ease-in-out infinite; }
	.second .halo { background: radial-gradient(closest-side, rgba(185, 138, 240, 0.55), transparent); }
	@keyframes rmb { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }
</style>
