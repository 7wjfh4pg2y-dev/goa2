<script lang="ts">
	// A single turn slot on a player's board. Shows blank until a card is committed,
	// then the white card-back, then flips to the face-up card on reveal. Past turns
	// render a static face-up card. Used for opponents' mini strips and your own.
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import CardBack from '$lib/cards/CardBack.svelte';
	import { PASS } from '$lib/cards/cardstate';

	export let heroId: string;
	export let played: number | null = null; // a card locked into this past slot
	export let pending: number | null = null; // committed-but-not-locked card for the current turn
	export let isCurrent = false; // is this the turn now being played
	export let revealed = false; // has everyone readied (cards face-up)
	export let label = ''; // e.g. "1".."4" shown on an empty slot
	export let examinable = false;
	export let peekable = false; // your own face-down card: click to read it (it stays face-down for everyone else)

	$: passed = isCurrent && pending === PASS;
	$: showFlip = isCurrent && pending != null && pending !== PASS; // back/front flipper
	$: faceIdx = played != null ? played : pending;
</script>

{#if played != null}
	<!-- not examinable ⇒ clicks pass through to the container (a disabled button
	     would swallow them, so e.g. a player row couldn't open their board) -->
	<button class="slot static" class:btn={examinable} class:thru={!examinable} tabindex={examinable ? 0 : -1} on:click on:keydown>
		<Card {heroId} card={heroCards(heroId)[played]} />
	</button>
{:else if showFlip}
	<button class="slot" class:btn={examinable && (revealed || peekable)} class:thru={!(examinable && (revealed || peekable))} tabindex={examinable && (revealed || peekable) ? 0 : -1} title={peekable && !revealed ? 'Your card — click to read it' : undefined} on:click on:keydown>
		<div class="flip" class:up={revealed}>
			<div class="face back"><CardBack hero={heroId} /></div>
			<div class="face front"><Card {heroId} card={heroCards(heroId)[faceIdx ?? 0]} /></div>
		</div>
	</button>
{:else if passed}
	<div class="slot blank pass" class:cur={isCurrent}>–</div>
{:else}
	<div class="slot blank" class:cur={isCurrent}>{label}</div>
{/if}

<style>
	.slot { width: 100%; aspect-ratio: 3 / 4; border: none; padding: 0; background: none; display: block; perspective: 700px; }
	.slot.btn { cursor: zoom-in; }
	.slot.thru { pointer-events: none; }
	.static :global(.cardface) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5); }
	.slot.blank { display: grid; place-items: center; border: 1px dashed rgba(255, 255, 255, 0.14); border-radius: 5px;
		background: rgba(255, 255, 255, 0.02); color: #3d4a5e; font-size: 0.62rem; font-weight: 700; }
	.slot.blank.cur { border-color: rgba(239, 180, 106, 0.5); color: #8b9bb0; }
	.slot.blank.pass { color: #6b7a8d; font-size: 0.9rem; }

	/* 3D flip: back shown by default, flips to the face-up card on reveal */
	.flip { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.4, 0.15, 0.2, 1); }
	.flip.up { transform: rotateY(180deg); }
	.face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 6%; overflow: hidden; }
	.face.front { transform: rotateY(180deg); }
	.face.front :global(.cardface) { display: block; width: 100%; border-radius: 6%; }
	/* the card back (CardBack): this face only adds the edge, the shadow and the pop-in */
	.back { box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45); animation: popin 0.2s ease; }
	.back::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(120, 95, 55, 0.4); pointer-events: none; }
	@keyframes popin { from { transform: scale(0.82); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
</style>
