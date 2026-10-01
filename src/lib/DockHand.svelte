<script lang="ts">
	// The hand, docked in the desktop dash, as a RIBBON RACK: every card is a small hanging
	// spell ribbon (Gydion's spell-mark art, one per card colour) with its action icon and
	// value stamped on the cloth. Hover a ribbon → its full Runeterra-style banner pops up
	// above the dash. The dash's auto-hide toggle decides the rest: OFF (show always) keeps
	// the whole hand up as a stack of banners — previewing / committing never drops it.
	import CardBanner from '$lib/CardBanner.svelte';
	import { heroCards } from '$lib/cards/deck';

	export let heroId: string;
	export let hand: number[] = [];
	export let onPick: (idx: number) => void = () => {};
	export let fanned = false; // the hand stays up as banners (auto-hide off)

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	type C = { color?: string; name?: string; primaryAction?: string; primaryValue?: number; initiative?: number };
	$: cards = heroCards(heroId) as C[];
	const rib = (c?: C) => ic(`spell_mark_${(c?.color ?? 'gold').toLowerCase()}`);
	const act = (c?: C) => (c?.primaryAction ? ic(`${c.primaryAction.toLowerCase()}_${(c.color ?? 'gold').toLowerCase()}`) : '');

	let hover: number | null = null;
	function pick(i: number) { hover = null; onPick(i); }
</script>

<div class="rack" on:mouseleave={() => (hover = null)} role="group" aria-label="Your hand">
	<div class="ribbons">
		{#each hand as i (i)}
			{@const c = cards[i]}
			<button class="rb" class:hot={hover === i} on:mouseenter={() => (hover = i)} on:focus={() => (hover = i)} on:click={() => pick(i)} aria-label={c?.name}>
				<img class="cloth" src={rib(c)} alt="" />
				<span class="val">
					{#if act(c)}<img src={act(c)} alt="" />{/if}
					{#if c?.primaryValue != null}<b>{c.primaryValue}</b>{/if}
				</span>
			</button>
		{/each}
	</div>

	<!-- one card's banner on hover / the whole hand when it stays up: above the dash -->
	{#if fanned}
		<div class="pop stack">
			{#each hand as i (i)}<div class="bw"><CardBanner {heroId} idx={i} on:click={() => pick(i)} /></div>{/each}
		</div>
	{:else if hover != null}
		<div class="pop one"><div class="bw"><CardBanner {heroId} idx={hover} /></div></div>
	{/if}
</div>

<style>
	.rack { position: relative; height: 100%; display: flex; align-items: stretch; gap: 4px; }
	.ribbons { display: flex; align-items: stretch; gap: 3px; overflow: hidden; }
	/* a ribbon hangs from above the well: its top is cropped, the tassel sits at the bottom */
	.rb { position: relative; width: 24px; flex: none; padding: 0; border: none; background: none; cursor: pointer; overflow: hidden; transition: transform .12s, filter .12s; }
	.rb .cloth { position: absolute; left: 0; bottom: 0; width: 100%; height: auto; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .6)); pointer-events: none; }
	.rb:hover, .rb.hot { transform: translateY(-3px); filter: brightness(1.15); }
	/* the card's action + value, stamped on the cloth just above the brass cap */
	.val { position: absolute; left: 0; right: 0; bottom: 31px; height: 20px; display: grid; place-items: center; pointer-events: none; }
	.val img { grid-area: 1 / 1; width: 19px; height: 17px; object-fit: contain; filter: drop-shadow(0 1px 1px #000); }
	.val b { grid-area: 1 / 1; position: relative; font-weight: normal; font-size: .82rem; line-height: 1; color: #fff; -webkit-text-stroke: 2.5px #10131a; paint-order: stroke fill; }
	.pop { position: absolute; right: 0; bottom: calc(100% + 14px); width: 270px; display: flex; flex-direction: column; gap: 4px; z-index: 30; }
	.pop.one { pointer-events: none; }
	.bw { filter: drop-shadow(0 6px 14px rgba(0, 0, 0, .6)); animation: up .16s ease-out both; }
	.stack .bw:nth-child(n) { animation-delay: calc(var(--n, 0) * 30ms); }
	@keyframes up { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
</style>
