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
	}
	.logo {
		width: min(360px, 74vw);
		height: auto;
		filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.55));
	}
</style>
