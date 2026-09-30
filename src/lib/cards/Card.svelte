<script lang="ts">
	// One real Guards of Atlantis II ability card. The face is painted once per
	// card by the card-painter engine (render.ts) and shared as an image, so
	// showing the same card in many places — or re-mounting it on every hover —
	// costs nothing after the first paint.
	import { browser } from '$app/environment';
	import { cardFace, cardKey, CARD_W, CARD_H } from './render';
	import type { HeroCardJson } from './deck';

	export let heroId: string;
	export let card: HeroCardJson;
	export let extraSlotIndex: number | null = null;
	export let showNumbers = true;

	let src = '';
	$: key = card ? cardKey(heroId, card, extraSlotIndex, showNumbers) : '';
	// keep showing the previous face until the new one is ready (no blank flash when swiping)
	$: if (browser && card && key) load(key, heroId, card, extraSlotIndex, showNumbers);
	async function load(k: string, h: string, c: HeroCardJson, x: number | null, n: boolean) {
		try {
			const url = await cardFace(h, c, x, n);
			if (k === key) src = url;
		} catch { /* painted next time it's asked for */ }
	}
</script>

<div class="card">
	<img class="cardface" src={src || undefined} width={CARD_W} height={CARD_H} alt="" draggable="false" />
</div>

<style>
	.card { width: 100%; aspect-ratio: 1192 / 1664; }
	.cardface { width: 100%; height: 100%; display: block; border-radius: 4%; user-select: none; -webkit-user-drag: none; }
	/* nothing to show yet: stay an empty, transparent box of the right size */
	.cardface:not([src]) { visibility: hidden; }
</style>
