<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<main class="home">
	<img src={logoImage} alt="Guards of Atlantis II" class="logo" />
</main>

<style>
	.home {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		/* Battlefield: orange (top-left) and blue (bottom-right) armies, the map's
		   green wilds on the other two corners (top-right / bottom-left), all
		   clashing into a purple seam through the centre. */
		background:
			radial-gradient(78% 78% at 0% 0%, rgba(198, 92, 22, 0.95) 0%, rgba(150, 66, 20, 0.5) 30%, transparent 60%),
			radial-gradient(78% 78% at 100% 100%, rgba(38, 108, 158, 0.95) 0%, rgba(26, 78, 118, 0.5) 30%, transparent 60%),
			radial-gradient(78% 78% at 100% 0%, rgba(40, 128, 66, 0.9) 0%, rgba(26, 88, 50, 0.45) 30%, transparent 60%),
			radial-gradient(78% 78% at 0% 100%, rgba(40, 128, 66, 0.9) 0%, rgba(26, 88, 50, 0.45) 30%, transparent 60%),
			radial-gradient(62% 62% at 50% 50%, rgba(128, 58, 160, 0.6) 0%, rgba(92, 42, 122, 0.28) 42%, transparent 72%),
			#0b1220;
		background-color: #0b1220;
	}
	.logo {
		width: min(360px, 74vw);
		height: auto;
		filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.55));
	}
</style>
