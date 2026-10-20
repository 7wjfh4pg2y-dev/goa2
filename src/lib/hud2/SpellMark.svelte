<script lang="ts">
	// The spell a Gydion turn cast (2026-10-20, the user's ask — everyone may see it): a small sigil under that turn's
	// slot on his boards, like Snorri's runes — the school's symbol in its colour on a dark disc (two spells, after a
	// Wish: the spell's sigil with a small violet pip). A tap opens the printed card(s) large (`onOpen`).
	import { spellOf, schoolIcon, SCHOOL_COLOR } from '$lib/cards/spells'
	export let spells: string[] | null = null
	export let size = 20
	export let now = false
	export let onOpen: (ids: string[]) => void = () => {}
	const COL: Record<string, string> = { gold: '#ffd25e', red: '#ff6a5e', green: '#55d071', blue: '#6a9cff', purple: '#c08cff' }
	$: last = spells?.length ? spells[spells.length - 1] : null
	$: school = last ? spellOf(last)?.school.toLowerCase() ?? '' : ''
	$: col = COL[SCHOOL_COLOR[school] ?? 'gold'] ?? COL.gold
	$: tip = (spells ?? []).map((id) => spellOf(id)?.name ?? id).join(' + ')
</script>

{#if last}
	<button class="sm" class:now style="--s:{size}px;--c:{col};--m:url({schoolIcon(school)})" title="{tip} — tap to read" aria-label="Spell: {tip}" on:click|stopPropagation={() => spells && onOpen(spells)}>
		<i></i>{#if spells && spells.length > 1}<b class="pip"></b>{/if}
	</button>
{/if}

<style>
	.sm { position: relative; width: var(--s); height: var(--s); padding: 0; border-radius: 50%; cursor: pointer; display: grid; place-items: center; pointer-events: auto;
		background: radial-gradient(circle at 50% 38%, #1d2a44, #090f1c 75%); border: 1.5px solid var(--c); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); }
	.sm.now { box-shadow: 0 0 0 1.5px #0a1a2c, 0 0 8px color-mix(in srgb, var(--c) 70%, transparent); }
	.sm i { width: 68%; height: 68%; background: var(--c); -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; }
	.pip { position: absolute; right: -2px; top: -2px; width: 34%; height: 34%; border-radius: 50%; background: #c08cff; box-shadow: 0 0 0 1.5px #0a1a2c; }
</style>
