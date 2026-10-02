<script lang="ts">
	// The pre-game backdrop: the real island in its moving sea (the same BoardCanvas the game
	// uses, as a picture — no pieces, no interaction), a few wisps of cloud drifting over it,
	// and a scrim that keeps whatever sits on top readable. The island NEVER moves or changes
	// size between screens (the user's rule: the map stays put, the crest and the menus move);
	// a `scene` only changes the scrim and the clouds.
	//   landing, menu — the island clear on the right (phones: filling the screen behind the crest)
	//   form, lobby   — the same picture, dimmed behind the panel
	import { onMount } from 'svelte';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import type { GameMap } from '$lib/maps';

	export let scene: 'landing' | 'menu' | 'form' | 'lobby' = 'landing';
	export let map: GameMap | null = null;
	export let mobile = false;
	/** the sea moves and the clouds drift (off = a still picture) */
	export let effects = true;

	let board: BoardCanvas;
	// where the island's centre sits (fractions of the screen) and how big it is — one staging for every scene
	const DESK = { x: 0.69, y: 0.5, s: 0.98 }, PHONE = { x: 0.5, y: 0.6, s: 1.5 };
	$: stage = mobile ? PHONE : DESK;
	let ready = false;
	$: if (ready && board && map) board.place(stage.x, stage.y, stage.s);
	onMount(() => { ready = true; });
	$: far = scene === 'landing' || scene === 'menu';
</script>

<div class="sea" class:far class:near={!far} class:mobile aria-hidden="true">
	{#if map}
		<div class="stagebox">
			<BoardCanvas bind:this={board} {map} look="island" interactive={false} pieces={[]} {effects} />
		</div>
	{/if}
	<!-- wisps of cloud: soft, pale, slow; they never cover more than a corner of the island at once -->
	{#if far}
		<div class="clouds" class:still={!effects}>
			<i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>
		</div>
	{/if}
	<div class="scrim"></div>
</div>

<style>
	.sea { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
	.stagebox { position: absolute; inset: 0; }
	.scrim { position: absolute; inset: 0; transition: opacity .6s ease; }
	/* far: dark water behind the left column, clear over the island */
	.sea.far .scrim { background:
		linear-gradient(90deg, rgba(4, 17, 32, .88) 0%, rgba(4, 17, 32, .74) 22%, rgba(4, 17, 32, .3) 42%, rgba(4, 17, 32, 0) 58%),
		radial-gradient(120% 100% at 70% 48%, transparent 55%, rgba(3, 11, 21, .5) 100%); }
	.sea.far.mobile .scrim { background:
		linear-gradient(180deg, rgba(4, 17, 32, .72) 0%, rgba(4, 17, 32, .25) 34%, rgba(4, 17, 32, .2) 60%, rgba(4, 17, 32, .8) 100%); }
	.sea.near .scrim { background: radial-gradient(110% 95% at 50% 45%, rgba(4, 17, 32, .56) 0%, rgba(3, 11, 21, .84) 100%); }

	.clouds { position: absolute; inset: 0; }
	/* a wisp = three overlapping soft ellipses, moved as one by a transform (GPU only) */
	.c { position: absolute; left: 0; width: 46vmax; height: 13vmax; opacity: .62; 
		background:
			radial-gradient(closest-side, rgba(255, 255, 255, .34), rgba(255, 255, 255, 0) 100%) 0% 55% / 62% 70% no-repeat,
			radial-gradient(closest-side, rgba(255, 255, 255, .28), rgba(255, 255, 255, 0) 100%) 58% 30% / 56% 62% no-repeat,
			radial-gradient(closest-side, rgba(255, 255, 255, .22), rgba(255, 255, 255, 0) 100%) 100% 70% / 50% 56% no-repeat;
		animation: drift linear infinite; }
	.c1 { top: 8%; animation-duration: 150s; animation-delay: -40s; }
	.c2 { top: 46%; width: 34vmax; height: 10vmax; opacity: .38; animation-duration: 190s; animation-delay: -120s; }
	.c3 { top: 70%; width: 52vmax; height: 12vmax; opacity: .42; animation-duration: 170s; animation-delay: -95s; }
	.c4 { top: 26%; width: 28vmax; height: 8vmax; opacity: .34; animation-duration: 210s; animation-delay: -10s; }
	@keyframes drift { from { transform: translate3d(-60vmax, 0, 0); } to { transform: translate3d(110vw, 0, 0); } }
	.clouds.still .c { animation-play-state: paused; }
	@media (prefers-reduced-motion: reduce) { .c { animation-play-state: paused; } }
</style>
