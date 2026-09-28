<script lang="ts">
	// ARCHIVED (not used anywhere yet) — the desktop deck's right-hand list: every
	// card the hero owns as a Runeterra-style banner, grouped Hand / Deck / Items /
	// Removed / Ultimate. It was pulled from DeckView to give the tree the room; kept
	// working so it can be dropped back in (e.g. as a toggleable panel) later.
	import CardBanner from '$lib/CardBanner.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { levelOf, ultimateIndex, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let sel: number | null = null;
	export let onSelect: (idx: number) => void = () => {};
	export let onPreview: (idx: number) => void = () => {};

	const COLS = ['RED', 'BLUE', 'GREEN'];
	$: cards = heroCards(cs.hero);
	$: ult = ultimateIndex(cs.hero);
	$: held = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null)]);
	$: all = cards.map((_, i) => i).filter((i) => !cards[i].handicapped || held.has(i));
	$: basics = all.filter((i) => ['GOLD', 'SILVER'].includes(cards[i].color));
	$: heldList = [...basics.filter((i) => held.has(i)), ...COLS.flatMap((c) => all.filter((i) => cards[i].color === c && held.has(i)))];
	$: deckList = all.filter((i) => i !== ult && !basics.includes(i) && !held.has(i) && !cs.upgrade.includes(i) && !cs.removed.includes(i));
</script>

<div class="list">
	<div class="ls">Hand <b>{heldList.length}</b></div>
	{#each heldList as i (i)}<CardBanner heroId={cs.hero} idx={i} sel={i === sel} on:click={() => onSelect(i)} on:dblclick={() => onPreview(i)} />{/each}
	<div class="ls">Deck <b>{deckList.length}</b></div>
	{#each deckList as i (i)}<CardBanner heroId={cs.hero} idx={i} sel={i === sel} on:click={() => onSelect(i)} on:dblclick={() => onPreview(i)} />{/each}
	<div class="ls">Items <b>{cs.upgrade.length}</b></div>
	{#each cs.upgrade as i (i)}<CardBanner heroId={cs.hero} idx={i} item sel={i === sel} on:click={() => onSelect(i)} on:dblclick={() => onPreview(i)} />{/each}
	<div class="ls">Removed <b>{cs.removed.length}</b></div>
	{#each cs.removed as i (i)}<CardBanner heroId={cs.hero} idx={i} dim sel={i === sel} on:click={() => onSelect(i)} on:dblclick={() => onPreview(i)} />{/each}
	{#if ult >= 0}<div class="ls">Ultimate</div><CardBanner heroId={cs.hero} idx={ult} level={levelOf(cs)} unlocked={cs.ultimate} dim={!cs.ultimate} on:click={() => onPreview(ult)} />{/if}
</div>

<style>
	.list { width: 470px; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 12px; background: #0b111c; border: 1px solid #22314a; }
	.ls { margin-top: 5px; font-size: .6rem; letter-spacing: .14em; text-transform: uppercase; color: #6c7c96; }
	.ls:first-child { margin-top: 0; }
	.ls b { font-weight: normal; color: #cbd5e1; margin-left: 4px; }
</style>
