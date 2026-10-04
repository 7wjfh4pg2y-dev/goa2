<script lang="ts">
	// The back of a hero's card — the ONE drawing every face-down card uses (turn slots, the deck,
	// the reveal curtain, the deck stack, the phone deck button): a cream card between two dark
	// bands with gold rules, the hero's symbol in the middle, and a faint honeycomb (the board's
	// hexes) laid over the cream and the bands, under the symbol. It fills its parent; the parent
	// gives it its size, rounding and shadow.
	import { heroLogo } from '$lib/heroes';

	export let hero = '';
	/** no symbol (e.g. the cards under the top of a stack) */
	export let blank = false;
</script>

<div class="cardback" aria-hidden="true">
	<span class="band top"></span>
	<span class="emblem">{#if hero && !blank}<img src={heroLogo(hero)} alt="" />{/if}</span>
	<span class="band bot"></span>
</div>

<style>
	/* one honeycomb tile (pointy-top hexes, r = 20): drawn in brown on the cream, in brass on the bands */
	.cardback { --hex-ink: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34.64' height='60' viewBox='0 0 34.64 60'%3E%3Cpath d='M17.32 0L34.64 10V30L17.32 40L0 30V10ZM17.32 40V60' fill='none' stroke='%23785a28' stroke-opacity='.11' stroke-width='1.1'/%3E%3C/svg%3E");
		--hex-brass: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34.64' height='60' viewBox='0 0 34.64 60'%3E%3Cpath d='M17.32 0L34.64 10V30L17.32 40L0 30V10ZM17.32 40V60' fill='none' stroke='%23d8b36a' stroke-opacity='.13' stroke-width='1.1'/%3E%3C/svg%3E");
		position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;
		background:
			radial-gradient(60% 46% at 50% 50%, rgba(253, 252, 248, 0.85), rgba(253, 252, 248, 0) 100%),
			var(--hex-ink) center / 16% auto,
			radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); }
	.band { position: relative; flex: none; height: 13%;
		background: var(--hex-brass) center / 16% auto, linear-gradient(180deg, #2c333f, #1a1f28); }
	.band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 1.5px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.band.top::after { bottom: 0; }
	.band.bot::after { top: 0; }
	.emblem { flex: 1; min-height: 0; display: grid; place-items: center; }
	/* the new symbols fill their image edge to edge, so they sit a little smaller than the old ones did */
	.emblem img { display: block; width: 72%; max-height: 82%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.38)); }
</style>
