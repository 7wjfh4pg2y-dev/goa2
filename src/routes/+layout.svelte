<script lang="ts">
	import '../app.postcss';
	import '$lib/ui/tide.css';
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

<!-- Global backdrop, fixed behind every page -->
<div class="app-bg" aria-hidden="true"></div>

<slot />

<style>
	.app-bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		/* Deep water (the Tide theme): the pre-game screens put the live island and sea on top of this;
		   the editor and the lab pages just get the calm navy. */
		background: radial-gradient(120% 90% at 50% 40%, #0e4f80 0%, #08304f 45%, #06182a 100%);
		background-color: #06182a;
	}
</style>
