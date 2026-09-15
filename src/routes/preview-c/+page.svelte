<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
</script>

<svelte:head><title>Preview C — Minimal pills</title></svelte:head>

<main class="wrap">
	<div class="col">
		<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
		<div class="pills">
			<button class="pill p"><span>Player</span></button>
			<button class="pill a"><span>Admin</span></button>
		</div>
	</div>
	<p class="note">Preview C · minimal pills</p>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; padding: 24px; color: #f1f5f9; }
	.col { display: flex; flex-direction: column; align-items: center; gap: 30px; width: min(360px, 86vw); }
	.logo { width: min(300px, 62vw); filter: drop-shadow(0 12px 34px rgba(0,0,0,.55)); }
	.pills { display: flex; flex-direction: column; gap: 14px; width: 100%; }
	.pill { width: 100%; padding: 16px 22px; border-radius: 12px; background: rgba(12,18,32,.42); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.16); color: #f1f5f9; font-size: 1.15rem; font-weight: 700; text-align: left; cursor: pointer; display: flex; align-items: center; box-shadow: 0 8px 26px rgba(0,0,0,.3); transition: transform .12s, background .15s; }
	.pill:hover { transform: translateY(-2px); background: rgba(20,28,46,.62); }
	.pill.p { border-left: 4px solid #38bdf8; }
	.pill.a { border-left: 4px solid #f97316; }
	.note { font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.4); }
</style>
