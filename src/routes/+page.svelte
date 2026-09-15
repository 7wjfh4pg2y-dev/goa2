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
		/* Battlefield: orange (top-left) and blue (bottom-right) armies dominate and
		   blend through a purple centre; the map's green wilds only lightly tint the
		   other two corners. No dark seam — the colours flow into each other. */
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
	.logo {
		width: min(360px, 74vw);
		height: auto;
		filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.55));
	}
</style>
