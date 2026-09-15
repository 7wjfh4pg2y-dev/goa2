<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
	import { PLAYER_COLORS, colorHex } from '$lib/match';

	const NAMES = ['Zaheen', 'Mira', 'Kade', 'Lin', 'Omar', 'Tia', 'Bex', 'Jules', 'Rune', 'Vex'];
	let count = 6;
	$: seats = NAMES.slice(0, count).map((name, i) => ({
		name,
		color: PLAYER_COLORS[i % PLAYER_COLORS.length].id,
		host: i === 0,
		ready: i % 3 !== 2
	}));
</script>

<svelte:head><title>Preview B — vertical</title></svelte:head>

<main class="wrap">
	<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	<div class="pcount">Preview players: {#each [4, 6, 8, 10] as n (n)}<button class="chip" class:on={count === n} on:click={() => (count = n)}>{n}</button>{/each}</div>

	<div class="card">
		<div class="lobbyhead"><div><span class="lbl">Room code</span><div class="roomcode mono">NV44</div></div><button class="ghost">Copy invite link</button></div>
		<div class="fld">
			<span>Your colour</span>
			<div class="swatches">{#each PLAYER_COLORS as c (c.id)}<span class="sw" style="--sc:{c.hex}"></span>{/each}<span class="chip">Spectator</span></div>
		</div>
		<div class="fld">
			<span>At the table — {count}/{count} seated</span>
			<div class="vlist">
				{#each seats as p (p.name)}
					<div class="vseat">
						<span class="pdot" style="background:{colorHex(p.color)}"></span>
						<span class="pname">{p.name}{p.host ? ' · host' : ''}</span>
						<span class="tagm" class:ok={p.ready}>{p.ready ? 'ready' : 'not ready'}</span>
					</div>
				{/each}
			</div>
		</div>
		<div class="row"><button class="ghost">Leave</button><div class="rb"><button class="primary rdy">✓ Ready</button><button class="ghost danger">Close</button><button class="primary">Begin</button></div></div>
	</div>
	<p class="cap">Option B · vertical list</p>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 6vh 20px 40px; gap: 18px; color: #f1f5f9; }
	.logo { width: min(210px, 54vw); filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.5)); }
	.pcount { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #cbd5e1; }
	.card { width: min(560px, 94vw); background: rgba(12, 18, 32, 0.46); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); padding: 24px; display: flex; flex-direction: column; gap: 16px; }
	.lobbyhead { display: flex; justify-content: space-between; align-items: center; }
	.lbl { font-size: 0.78rem; color: #94a3b8; }
	.roomcode { font-size: 1.7rem; font-weight: 700; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.fld { display: flex; flex-direction: column; gap: 8px; }
	.fld > span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.sw { width: 1.7rem; height: 1.7rem; border-radius: 50%; background: var(--sc); border: 2px solid rgba(255, 255, 255, 0.25); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); }
	.chip { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; border-radius: 999px; padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer; }
	.chip.on { background: #d97706; border-color: #f59e0b; color: white; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.ghost.danger { border-color: rgba(239, 68, 68, 0.5); color: #fca5a5; }
	.primary { border: 1px solid #f59e0b; background: #d97706; color: #fff; border-radius: 10px; padding: 0.55rem 1.2rem; font-weight: 600; cursor: pointer; }
	.primary.rdy { background: #16a34a; border-color: #22c55e; }
	.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
	.rb { display: flex; gap: 8px; flex-wrap: wrap; }
	.cap { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255, 255, 255, 0.55); }
	.vlist { display: flex; flex-direction: column; gap: 6px; }
	.vseat { display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 7px 10px; }
	.pdot { width: 0.85rem; height: 0.85rem; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.4); flex: 0 0 auto; }
	.pname { flex: 1; font-size: 0.9rem; }
	.tagm { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
	.tagm.ok { color: #6ee7b7; }
</style>
