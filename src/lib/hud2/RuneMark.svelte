<script lang="ts">
	// One of Snorri's round rune markers, at any size. on = the active rune (brass ring, a still glow; with the
	// Dashboard switch a soft breathing halo — opacity only); second = Rune Mastery's pick this turn (violet ring);
	// otherwise it rests dim. empty = a socket with no rune yet. IGNITE (2026-10-20, the user's pick): the moment a rune
	// becomes the active one (the turn moves onto it) it flares — a ring and sparks in brass; the moment Rune Mastery's
	// second rune is picked it flares the same way in violet. Never on first showing. Effects → Ignite.
	import type { Rune } from '$lib/heropower'
	import { RUNE_NAME } from '$lib/heropower'
	import { runeArt } from './runes'

	export let rune: Rune | null = null
	export let size = 16
	export let on = false
	export let second = false
	export let fx = false
	import { boardPrefs } from '$lib/boardPrefs'
	let seen = false, wasOn = false, wasSec = false, burst = 0, violet = false
	let timer: ReturnType<typeof setTimeout> | null = null
	$: watch(on, second, rune)
	function watch(o: boolean, s: boolean, r: Rune | null) {
		if (seen && r && $boardPrefs.runeFlare && ((o && !wasOn) || (s && !wasSec))) {
			violet = s && !wasSec && !o; burst = Date.now()
			if (timer) clearTimeout(timer)
			timer = setTimeout(() => (burst = 0), 1300)
		}
		seen = true; wasOn = o; wasSec = s
	}
	const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315]
</script>

<span class="rm" class:on class:second class:empty={!rune} style="--s:{size}px" title={rune ? `${RUNE_NAME[rune]}${on ? ' · active' : second ? ' · active too (Rune Mastery)' : ''}` : 'No rune yet'}>
	{#if (on || second) && fx}<i class="halo"></i>{/if}
	{#if rune}<img src={runeArt(rune)} alt={RUNE_NAME[rune]} draggable="false" />{/if}
	{#if burst}{#key burst}<span class="ign" class:violet aria-hidden="true"><i class="ring"></i>{#each SPARKS as a}<i class="sk" style="--a:{a}deg"><i></i></i>{/each}</span>{/key}{/if}
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
	/* the ignite: a ring bursting out + eight sparks flying off (one-shot) */
	.ign { position: absolute; inset: 0; pointer-events: none; --g: #ffd98a; }
	.ign.violet { --g: #c9a2ff; }
	.ign .ring { position: absolute; inset: -10%; border-radius: 50%; border: 2px solid var(--g); opacity: 0; animation: igr 0.9s ease-out both; }
	@keyframes igr { 0% { opacity: 1; transform: scale(0.7); } 100% { opacity: 0; transform: scale(2.4); } }
	.ign .sk { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform: rotate(var(--a)); }
	.ign .sk i { position: absolute; left: -2px; top: -2px; width: 4px; height: 4px; border-radius: 50%; background: radial-gradient(circle, #fff 0 30%, var(--g) 60%, transparent 75%); opacity: 0; animation: igs 0.8s ease-out both; }
	@keyframes igs { 0% { opacity: 1; transform: translateY(0) scale(1.4); } 100% { opacity: 0; transform: translateY(calc(var(--s) * -1.25)) scale(0.6); } }
	@keyframes rmb { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }
</style>
