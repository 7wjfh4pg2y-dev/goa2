<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<main class="home">
	<img src={logoImage} alt="Guards of Atlantis II" class="logo" />
	<p class="tagline">Digital table</p>
</main>

<style>
	.home {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px;
		text-align: center;
		background: radial-gradient(circle at 50% 30%, #16233b, #0b1220 75%);
		color: #e5e7eb;
	}
	.logo {
		width: min(340px, 72vw);
		height: auto;
		filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
	}
	.tagline {
		margin: 0;
		font-size: 0.95rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: #94a3b8;
	}
</style>
