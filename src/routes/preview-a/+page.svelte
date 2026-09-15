<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
</script>

<svelte:head><title>Preview A — Glass cards</title></svelte:head>

<main class="wrap">
	<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	<div class="cards">
		<button class="card p">
			<span class="ic">
				<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
			</span>
			<span class="t">Player</span>
			<span class="s">Join or create a match</span>
		</button>
		<button class="card a">
			<span class="ic">
				<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
			</span>
			<span class="t">Admin</span>
			<span class="s">GM tools</span>
		</button>
	</div>
	<p class="note">Preview A · glass cards</p>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding: 24px; color: #f1f5f9; }
	.logo { width: min(300px, 62vw); filter: drop-shadow(0 12px 34px rgba(0,0,0,.55)); }
	.cards { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; }
	.card { width: 210px; padding: 30px 22px; border-radius: 18px; background: rgba(12,18,32,.42); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.14); display: flex; flex-direction: column; align-items: center; gap: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.35); cursor: pointer; color: inherit; transition: transform .15s, background .15s; }
	.card:hover { transform: translateY(-4px); background: rgba(20,28,46,.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.ic { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }
	.t { font-size: 1.5rem; font-weight: 700; }
	.s { font-size: .8rem; color: #cbd5e1; }
	.note { font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,255,255,.4); }
</style>
