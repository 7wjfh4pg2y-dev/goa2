<script lang="ts">
	// A Gydion turn's spell, large (from a SpellMark): the printed card, its name and school; ‹ › when the turn cast two
	// (a Wish and the spell it opened). Esc / a tap outside closes.
	import { spellOf, schoolIcon, SCHOOL_COLOR } from '$lib/cards/spells'
	export let ids: string[] | null = null
	export let phone = false
	export let title = ''
	/** a row of school-coloured pips to jump through a long list (the ether) */
	export let pips = false
	const COL: Record<string, string> = { gold: '#ffd25e', red: '#ff6a5e', green: '#55d071', blue: '#6a9cff', purple: '#c08cff' }
	let i = 0, was: string[] | null = null
	$: if (ids !== was) { was = ids; i = ids ? ids.length - 1 : 0 }
	$: id = ids?.[i] ?? ''
	$: sp = spellOf(id)
	$: school = sp?.school.toLowerCase() ?? ''
	const close = () => (ids = null)
	const step = (d: number) => { if (ids && ids.length > 1) i = (i + d + ids.length) % ids.length }
	function key(e: KeyboardEvent) {
		if (!ids) return
		if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else return
		e.stopPropagation(); e.preventDefault()
	}
</script>

<svelte:window on:keydown|capture={key} />
{#if ids && sp}
	<div class="spv" class:ph={phone} role="dialog" tabindex="-1" aria-label="Spell" on:pointerdown|self={close}>
		<div class="box">
			<div class="art" style="background-image:url({sp.art})"></div>
			<div class="bar" style="--c:{COL[SCHOOL_COLOR[school] ?? 'gold']}">
				{#if ids.length > 1}<button class="nav" on:click={() => step(-1)} aria-label="Previous">‹</button>{/if}
				<span class="nm"><i style="--m:url({schoolIcon(school)})"></i><b>{sp.name}</b><small>{title ? `${title} · ` : ''}{school[0]?.toUpperCase() + school.slice(1)}{ids.length > 1 ? ` · ${i + 1} / ${ids.length}` : ''}</small></span>
				{#if ids.length > 1}<button class="nav" on:click={() => step(1)} aria-label="Next">›</button>{/if}
				<button class="x" on:click={close} aria-label="Close">✕</button>
			</div>
			{#if pips && ids.length > 1}
				<div class="pips">{#each ids as pid, k (pid)}{@const sc = spellOf(pid)?.school.toLowerCase() ?? ''}<button class="pip" class:on={k === i} style="--c:{COL[SCHOOL_COLOR[sc] ?? 'gold']}" title={spellOf(pid)?.name} aria-label={spellOf(pid)?.name} on:click={() => (i = k)}></button>{/each}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.spv { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: rgba(2, 8, 16, 0.72); pointer-events: auto; }
	.box { width: 720px; max-width: calc(100vw / var(--uis, 1) - 60px); display: flex; flex-direction: column; gap: 10px; }
	.ph .box { width: calc(100vw - 20px); max-width: none; }
	.art { width: 100%; aspect-ratio: 1192 / 831; border-radius: 16px; background: #000 center/contain no-repeat; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7); }
	.bar { display: flex; align-items: center; gap: 12px; color: #f5f1e8; font-family: system-ui, sans-serif; }
	.nm { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; }
	.nm i { width: 22px; height: 22px; flex: none; background: var(--c); -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; }
	.nm b { font-size: 17px; white-space: nowrap; }
	.nm small { color: #b9c6d4; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.nav, .x { width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(216, 179, 106, 0.5); background: rgba(2, 11, 22, 0.75); color: #f4dfa8; font: 700 20px/1 system-ui; cursor: pointer; padding: 0; flex: none; }
	.x { font-size: 14px; }
	.pips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
	.pip { width: 12px; height: 12px; padding: 0; border-radius: 50%; border: 1.5px solid var(--c); background: transparent; cursor: pointer; opacity: 0.7; }
	.pip.on { background: var(--c); opacity: 1; box-shadow: 0 0 6px var(--c); }
</style>
