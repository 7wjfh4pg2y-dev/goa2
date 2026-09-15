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
		/* Two armies: orange advancing from the top-left, blue from the bottom-right,
		   clashing and fading into a darker seam through the centre. */
		background:
			radial-gradient(130% 130% at 0% 0%, rgba(196, 92, 24, 0.92) 0%, rgba(150, 66, 20, 0.5) 32%, rgba(120, 55, 20, 0) 62%),
			radial-gradient(130% 130% at 100% 100%, rgba(40, 108, 156, 0.92) 0%, rgba(28, 78, 116, 0.5) 32%, rgba(22, 60, 92, 0) 62%),
			linear-gradient(135deg, #241206 0%, #0c1320 48%, #0c1320 52%, #06131f 100%);
		background-color: #0b1220;
	}
	.logo {
		width: min(360px, 74vw);
		height: auto;
		filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.55));
	}
</style>
