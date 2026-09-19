<script lang="ts">
	// A single turn slot on a player's board. Shows blank until a card is committed,
	// then the white card-back, then flips to the face-up card on reveal. Past turns
	// render a static face-up card. Used for opponents' mini strips and your own.
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroLogo } from '$lib/heroes';
	import { PASS } from '$lib/cards/cardstate';

	export let heroId: string;
	export let played: number | null = null; // a card locked into this past slot
	export let pending: number | null = null; // committed-but-not-locked card for the current turn
	export let isCurrent = false; // is this the turn now being played
	export let revealed = false; // has everyone readied (cards face-up)
	export let label = ''; // e.g. "1".."4" shown on an empty slot
	export let examinable = false;

	$: passed = isCurrent && pending === PASS;
	$: showFlip = isCurrent && pending != null && pending !== PASS; // back/front flipper
	$: faceIdx = played != null ? played : pending;
</script>

{#if played != null}
	<button class="slot static" class:btn={examinable} on:click on:keydown disabled={!examinable}>
		<Card {heroId} card={heroCards(heroId)[played]} />
	</button>
{:else if showFlip}
	<button class="slot" class:btn={examinable && revealed} on:click on:keydown disabled={!(examinable && revealed)}>
		<div class="flip" class:up={revealed}>
			<div class="face back">
				<span class="band top"></span>
				<span class="emblem"><img src={heroLogo(heroId)} alt="" /></span>
				<span class="band bot"></span>
			</div>
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
	.static :global(canvas) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5); }
	.slot.blank { display: grid; place-items: center; border: 1px dashed rgba(255, 255, 255, 0.14); border-radius: 5px;
		background: rgba(255, 255, 255, 0.02); color: #3d4a5e; font-size: 0.62rem; font-weight: 700; }
	.slot.blank.cur { border-color: rgba(239, 180, 106, 0.5); color: #8b9bb0; }
	.slot.blank.pass { color: #6b7a8d; font-size: 0.9rem; }

	/* 3D flip: back shown by default, flips to the face-up card on reveal */
	.flip { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.4, 0.15, 0.2, 1); }
	.flip.up { transform: rotateY(180deg); }
	.face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 6%; overflow: hidden; }
	.face.front { transform: rotateY(180deg); }
	.face.front :global(canvas) { display: block; width: 100%; border-radius: 6%; }
	/* white card back with grey bands + hero emblem (matches the big overlay back) */
	.back { display: flex; flex-direction: column;
		background: repeating-linear-gradient(135deg, rgba(90, 70, 40, 0.04) 0 1px, transparent 1px 5px), radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%);
		box-shadow: inset 0 0 0 1px rgba(120, 95, 55, 0.4), 0 3px 8px rgba(0, 0, 0, 0.45); animation: popin 0.2s ease; }
	.back .band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.back .band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 1.5px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.back .band.top::after { bottom: 0; }
	.back .band.bot::after { top: 0; }
	.back .emblem { flex: 1; display: grid; place-items: center; padding: 8%; }
	.back .emblem img { width: 82%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4)); }
	@keyframes popin { from { transform: scale(0.82); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
</style>
