<script lang="ts">
	// Confirmation for a level-up pick (or a same-round swap to the other path):
	// the card, what lands where, and what it costs. Fills its positioned parent.
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { levelOf, levelCost, twinOf, swapSource, tierIn, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let idx: number;
	export let kind: 'take' | 'swap' = 'take';
	export let teamStyle = '';
	export let onConfirm: () => void;
	export let onCancel: () => void;

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Area' };

	$: cards = heroCards(cs.hero);
	$: c = cards[idx];
	$: isUlt = c?.color === 'PURPLE';
	$: LV = levelOf(cs);
	$: cost = levelCost(LV);
	// take: the twin becomes the item; swap: this round's pick becomes the item
	$: itemCard = kind === 'swap' ? swapSource(cs, idx) ?? -1 : twinOf(cs.hero, idx);
	$: item = itemCard >= 0 ? cards[itemCard]?.item ?? '' : '';
	$: older = kind === 'take' && c && !isUlt
		? [...cs.hand, ...cs.discard, ...cs.turns, cs.pending].find((i) => i != null && i >= 0 && cards[i]?.color === c.color && (cards[i]?.level ?? 1) === tierIn(cs, c.color))
		: undefined;
</script>

<div class="lc" style={teamStyle} on:click|self={onCancel} on:keydown={(e) => e.key === 'Escape' && onCancel()} role="presentation">
	<div class="box" role="dialog" aria-modal="true" aria-label="Confirm level-up">
		<div class="cardw"><Card heroId={cs.hero} card={c} /></div>
		<div class="info">
			<h3>{kind === 'swap' ? 'Swap to this path?' : isUlt ? 'Unlock your ultimate?' : `Level up to ${LV + 1}?`}</h3>
			<ul>
				{#if isUlt}
					<li><i class="k u">Ultimate</i>{c?.name} <small>passive — always on</small></li>
				{:else}
					<li><i class="k">Hand</i>{c?.name}</li>
					{#if item}<li><i class="k it">Item</i><img src={ic(`item_${item.toLowerCase()}`)} alt="" />+1 {ITEM_NAME[item]} <small>from {cards[itemCard]?.name}</small></li>{/if}
					{#if older != null}<li><i class="k rm">Removed</i>{cards[older]?.name}</li>{/if}
				{/if}
			</ul>
			{#if kind === 'take'}
				<p class="cost"><span class="coin"></span>Costs <b>{cost}</b> · you have {cs.coins} → <b>{cs.coins - cost}</b></p>
				{#if !isUlt}<p class="note">You can still switch to the other path until the round ends.</p>{/if}
			{:else}
				<p class="note">Free — only this round's pick can be swapped.</p>
			{/if}
			<div class="btns">
				<button class="ok" on:click={onConfirm}>{kind === 'swap' ? 'Swap' : isUlt ? 'Unlock ★' : 'Level up'}</button>
				<button class="back" on:click={onCancel}>Back</button>
			</div>
		</div>
	</div>
</div>

<style>
	.lc { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(3,6,12,.72); border-radius: inherit; }
	.box { display: flex; gap: 22px; align-items: center; padding: 20px 24px; border-radius: 16px; background: rgba(11,16,26,.97); border: 1px solid rgba(199,154,78,.6); box-shadow: 0 24px 70px rgba(0,0,0,.7); color: #e5e7eb; }
	.cardw { width: 250px; flex: none; }
	.cardw :global(.cardface) { display: block; width: 100%; border-radius: 8px; box-shadow: 0 10px 26px rgba(0,0,0,.6); }
	.info { width: 300px; display: flex; flex-direction: column; gap: 10px; }
	h3 { margin: 0; font-weight: normal; font-size: 1.5rem; color: #f6ead2; }
	ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
	li { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
	li img { width: 20px; height: 15px; object-fit: contain; }
	small { font-size: .68rem; color: #7c8aa0; }
	.k { flex: none; width: 64px; font-style: normal; font-size: .62rem; text-align: center; padding: 2px 0; border-radius: 5px; letter-spacing: .06em; text-transform: uppercase; background: var(--tc, #ef7d22); color: #fff; }
	.k.it { background: #3f7fe0; }
	.k.rm { background: rgba(220,60,60,.35); color: #ffc9c9; }
	.k.u { background: #8a4fd6; }
	.cost { margin: 4px 0 0; display: flex; align-items: center; gap: 6px; font-size: .9rem; color: #f0dcae; }
	.cost b { font-weight: normal; color: #fff; }
	.coin { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff3c4, #e8b64a 45%, #9a6a18); box-shadow: 0 0 0 1px #6b4a10; }
	.note { margin: 0; font-size: .74rem; color: #93a3b8; }
	.btns { display: flex; gap: 8px; margin-top: 6px; }
	.btns button { font: inherit; height: 40px; padding: 0 22px; border-radius: 10px; cursor: pointer; font-size: .95rem; }
	.ok { border: none; background: var(--tc, #ef7d22); color: #fff; box-shadow: 0 3px 0 rgba(0,0,0,.35), 0 0 16px color-mix(in srgb, var(--tc, #ef7d22) 50%, transparent); }
	.ok:hover { filter: brightness(1.1); }
	.back { border: 1px solid rgba(255,255,255,.22); background: transparent; color: #e5e7eb; }
	@media (max-width: 760px) {
		.box { flex-direction: column; gap: 12px; padding: 14px; width: min(92vw, 360px); box-sizing: border-box; }
		.cardw { width: min(58vw, 220px); }
		.info { width: 100%; }
		h3 { font-size: 1.2rem; text-align: center; }
		.btns button { flex: 1; }
	}
</style>
