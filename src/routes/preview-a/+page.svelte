<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
	const HL = 'linear-gradient(120deg, #ef7d22, #2f7fe6)'; // A: orange → blue
</script>

<svelte:head><title>Highlights A</title></svelte:head>

<main class="wrap" style="--hl:{HL}">
	<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	<div class="card">
		<label class="fld"><span>Name</span><input class="field" placeholder="e.g. Zaheen" /></label>
		<div class="fld">
			<span>Game length</span>
			<div class="chips">
				<button class="chip">Quick</button>
				<button class="chip on">Long</button>
				<button class="chip">Custom</button>
			</div>
		</div>
		<div class="fld">
			<span>Players (seats)</span>
			<div class="chips">
				<button class="chip on">4</button>
				<button class="chip">6</button>
				<button class="chip">8</button>
				<button class="chip">10</button>
			</div>
		</div>
		<div class="fld">
			<span>Map</span>
			<div class="chips"><button class="chip on">Forgotten Island</button></div>
		</div>
		<div class="btnrow">
			<button class="ghost">Leave</button>
			<div class="rb">
				<button class="ghost danger">Close</button>
				<button class="primary">Begin</button>
				<button class="ready">✓ Ready</button>
			</div>
		</div>
	</div>
	<p class="cap">Option A · orange → blue</p>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 6vh 20px 40px; gap: 18px; color: #f1f5f9; }
	.logo { width: min(200px, 52vw); filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.5)); }
	.card { width: min(520px, 94vw); background: rgba(12, 18, 32, 0.46); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); }
	.fld { display: flex; flex-direction: column; gap: 7px; }
	.fld > span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.field { width: 100%; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(8, 12, 22, 0.6); padding: 0.55rem 0.7rem; color: white; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; border-radius: 999px; padding: 0.4rem 0.9rem; font-size: 0.9rem; cursor: pointer; }
	.chip.on { background: var(--hl); border-color: rgba(255, 255, 255, 0.3); color: #fff; font-weight: 600; }
	.btnrow { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
	.rb { display: flex; gap: 8px; flex-wrap: wrap; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.ghost.danger { border-color: rgba(239, 68, 68, 0.5); color: #fca5a5; }
	.primary { border: 1px solid rgba(255, 255, 255, 0.3); background: var(--hl); color: #fff; border-radius: 10px; padding: 0.55rem 1.2rem; font-weight: 600; cursor: pointer; }
	.ready { border: 1px solid #22c55e; background: #16a34a; color: #fff; border-radius: 10px; padding: 0.55rem 1.2rem; font-weight: 600; cursor: pointer; }
	.cap { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255, 255, 255, 0.55); }
</style>
