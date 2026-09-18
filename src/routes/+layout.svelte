<script lang="ts">
	import '../app.postcss';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { updated } from '$app/stores';

	// When SvelteKit detects a new deploy (via version polling), reload so players
	// always run the latest build — no manual hard refresh / cache clearing.
	$: if (browser && $updated) location.reload();

	// Also check the moment the tab regains focus, so returning picks up a deploy fast.
	onMount(() => {
		const check = () => { if (document.visibilityState === 'visible') updated.check(); };
		document.addEventListener('visibilitychange', check);
		window.addEventListener('focus', check);
		return () => {
			document.removeEventListener('visibilitychange', check);
			window.removeEventListener('focus', check);
		};
	});
</script>

<!-- Global battlefield background, fixed behind every page -->
<div class="app-bg" aria-hidden="true"></div>

<slot />

<style>
	.app-bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		/* Orange (top-left) & blue (bottom-right) armies dominate and blend through a
		   purple centre; the map's green wilds lightly tint the other two corners. */
		background:
			radial-gradient(70% 70% at 100% 0%, rgba(46, 132, 78, 0.3) 0%, transparent 55%),
			radial-gradient(70% 70% at 0% 100%, rgba(46, 132, 78, 0.3) 0%, transparent 55%),
			linear-gradient(
				135deg,
				rgba(216, 100, 26, 0.98) 0%,
				rgba(200, 88, 34, 0.92) 24%,
				rgba(122, 66, 146, 0.88) 50%,
				rgba(40, 112, 168, 0.92) 76%,
				rgba(34, 104, 162, 0.98) 100%
			);
		background-color: #17243a;
	}
</style>
