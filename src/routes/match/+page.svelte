<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { writable, type Readable } from 'svelte/store';
	import logoImage from '$lib/images/goa-logo.png';
	import { reveal } from '$lib/transitions';
	import { availableMaps, type MapChoice } from '$lib/maps';
	import {
		joinMatch,
		initialMatchState,
		wavesFor,
		lifeFor,
		colorHex,
		PLAYER_COLORS,
		type MatchState,
		type Player,
		type MatchSession
	} from '$lib/match';

	type Step = 'menu' | 'create' | 'join' | 'in';
	let step: Step = 'menu';

	let name = '';
	let room = '';
	let color = 'red';
	let ruleset: 'quick' | 'long' | 'custom' = 'long';
	let playerCount = 6;
	let customWaves = 3;
	let customLife = 6;

	let maps: MapChoice[] = [];
	let mapId = '';

	let session: MatchSession | null = null;
	let players: Readable<Player[]> = writable([]);
	let state: Readable<MatchState> = writable(initialMatchState());

	function randomRoom() {
		room = Math.random().toString(36).slice(2, 6).toUpperCase();
	}

	onMount(() => {
		maps = availableMaps();
		mapId = maps[0]?.id ?? '';
		try {
			name = localStorage.getItem('goa2-name') ?? '';
			color = localStorage.getItem('goa2-color') ?? 'red';
		} catch {}
		randomRoom();
	});
	onDestroy(() => session?.leave());

	$: previewWaves = ruleset === 'custom' ? customWaves : wavesFor(ruleset);
	$: previewLife = ruleset === 'custom' ? customLife : lifeFor(ruleset, playerCount);

	function persistMe() {
		if (!name.trim()) name = 'Player';
		try {
			localStorage.setItem('goa2-name', name);
			localStorage.setItem('goa2-color', color);
		} catch {}
	}

	function createGame() {
		persistMe();
		room = room.trim().toUpperCase() || 'TABLE';
		const chosen = maps.find((m) => m.id === mapId) ?? maps[0];
		const seed = initialMatchState({
			length: ruleset === 'custom' ? 'long' : ruleset,
			players: playerCount,
			waves: ruleset === 'custom' ? customWaves : undefined,
			life: ruleset === 'custom' ? customLife : undefined,
			mapId: chosen?.id ?? '',
			map: chosen?.data ?? null
		});
		session = joinMatch(room, { name, color }, { seed });
		players = session.players;
		state = session.state;
		step = 'in';
	}
	function joinGame() {
		persistMe();
		room = room.trim().toUpperCase();
		if (!room) return;
		session = joinMatch(room, { name, color }, {});
		players = session.players;
		state = session.state;
		step = 'in';
	}
	function leave() {
		session?.leave();
		session = null;
		step = 'menu';
		randomRoom();
	}
	function backToMenu() {
		step = 'menu';
	}
</script>

<svelte:head><title>Match — Guards of Atlantis II</title></svelte:head>

<main class="wrap">
	<a class="home-link" href="{base}/" aria-label="Home">
		<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	</a>

	<div class="stage">
		{#if step === 'menu'}
			<div class="step" transition:reveal>
				<div class="cards">
					<button class="card p" on:click={() => (step = 'create')}>
						<span class="ic">
							<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
						</span>
						<span class="t">Create game</span>
						<span class="s">Set the ruleset & map</span>
					</button>
					<button class="card a" on:click={() => (step = 'join')}>
						<span class="ic">
							<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
						</span>
						<span class="t">Join game</span>
						<span class="s">Enter a room code</span>
					</button>
				</div>
			</div>
		{:else if step === 'create'}
			<div class="step" transition:reveal>
				<div class="card form">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>

					<div class="fld">
						<span>Your colour</span>
						<div class="swatches">
							{#each PLAYER_COLORS as c (c.id)}
								<button title={c.label} aria-label={c.label} class="sw" class:sel={color === c.id} style="--sc:{c.hex}" on:click={() => (color = c.id)}></button>
							{/each}
							<button class="chip" class:on={color === 'spectator'} on:click={() => (color = 'spectator')}>Spectator</button>
						</div>
					</div>

					<div class="fld">
						<span>Ruleset</span>
						<div class="chips">
							<button class="chip" class:on={ruleset === 'quick'} on:click={() => (ruleset = 'quick')}>Quick · {wavesFor('quick')} waves</button>
							<button class="chip" class:on={ruleset === 'long'} on:click={() => (ruleset = 'long')}>Long · {wavesFor('long')} waves</button>
							<button class="chip" class:on={ruleset === 'custom'} on:click={() => (ruleset = 'custom')}>Custom</button>
						</div>
						{#if ruleset === 'custom'}
							<div class="two">
								<label class="mini"><span>Waves</span><input class="field" type="number" min="1" max="20" bind:value={customWaves} /></label>
								<label class="mini"><span>Life / team</span><input class="field" type="number" min="1" max="30" bind:value={customLife} /></label>
							</div>
						{:else}
							<div class="chips">
								{#each [4, 6] as n (n)}
									<button class="chip" class:on={playerCount === n} on:click={() => (playerCount = n)}>{n} players</button>
								{/each}
							</div>
						{/if}
						<p class="hint">{previewWaves} shared waves · {previewLife} Life per team</p>
					</div>

					<div class="fld">
						<span>Map</span>
						<div class="chips">
							{#each maps as m (m.id)}
								<button class="chip" class:on={mapId === m.id} on:click={() => (mapId = m.id)}>{m.label}</button>
							{/each}
						</div>
					</div>

					<div class="row">
						<button class="ghost" on:click={backToMenu}>← Back</button>
						<button class="primary" on:click={createGame}>Create game</button>
					</div>
				</div>
			</div>
		{:else if step === 'join'}
			<div class="step" transition:reveal>
				<div class="card form">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>
					<label class="fld"><span>Room code</span><input class="field up" bind:value={room} maxlength="8" placeholder="code from the host" /></label>
					<div class="fld">
						<span>Your colour</span>
						<div class="swatches">
							{#each PLAYER_COLORS as c (c.id)}
								<button title={c.label} aria-label={c.label} class="sw" class:sel={color === c.id} style="--sc:{c.hex}" on:click={() => (color = c.id)}></button>
							{/each}
							<button class="chip" class:on={color === 'spectator'} on:click={() => (color = 'spectator')}>Spectator</button>
						</div>
					</div>
					<div class="row">
						<button class="ghost" on:click={backToMenu}>← Back</button>
						<button class="primary" on:click={joinGame} disabled={!room.trim()}>Join game</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="step" transition:reveal>
				<div class="card form">
					<p class="roomline">Room <b class="mono">{room}</b></p>
					<div class="fld">
						<span>At the table ({$players.length})</span>
						<div class="players">
							{#each $players as p (p.id)}
								<span class="ptag">
									<span class="pdot" style="background:{p.color === 'spectator' ? 'transparent' : colorHex(p.color)};border-color:{p.color === 'spectator' ? '#64748b' : colorHex(p.color)}"></span>
									{p.name}{p.id === session?.clientId ? ' (you)' : ''}
								</span>
							{/each}
						</div>
					</div>
					<p class="hint">You're in. The board & HUD land next — share the room code with your table.</p>
					<div class="row">
						<button class="ghost" on:click={leave}>Leave</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 7vh 20px 40px; gap: 28px; color: #f1f5f9; }
	.home-link { display: inline-block; }
	.logo { width: min(220px, 52vw); filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.5)); }
	.stage { position: relative; width: 100%; max-width: 440px; }
	.step { width: 100%; }

	.cards { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
	.card {
		background: rgba(12, 18, 32, 0.44); backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); color: inherit;
	}
	.cards .card { width: 200px; padding: 28px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer; transition: transform 0.15s, background 0.15s; }
	.cards .card:hover { transform: translateY(-4px); background: rgba(20, 28, 46, 0.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.ic { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
	.t { font-size: 1.25rem; font-weight: 700; }
	.s { font-size: 0.78rem; color: #cbd5e1; }

	.card.form { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
	.fld { display: flex; flex-direction: column; gap: 7px; }
	.fld > span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.field { width: 100%; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(8, 12, 22, 0.6); padding: 0.55rem 0.7rem; color: white; }
	.field.up { text-transform: uppercase; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.mini { display: flex; flex-direction: column; gap: 5px; font-size: 0.78rem; color: #cbd5e1; }
	.chips, .swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.chip { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; border-radius: 999px; padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer; }
	.chip.on { background: #d97706; border-color: #f59e0b; color: white; }
	.sw { width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--sc); border: 2px solid rgba(255, 255, 255, 0.25); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); cursor: pointer; padding: 0; }
	.sw.sel { outline: 2px solid #f59e0b; outline-offset: 2px; border-color: #fff; }
	.hint { font-size: 0.72rem; color: #94a3b8; margin: 2px 0 0; }
	.row { display: flex; justify-content: space-between; gap: 10px; }
	.primary { border: 1px solid #f59e0b; background: #d97706; color: white; border-radius: 10px; padding: 0.55rem 1.2rem; cursor: pointer; font-weight: 600; }
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.roomline { margin: 0; font-size: 1.1rem; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.players { display: flex; flex-wrap: wrap; gap: 8px; }
	.ptag { display: inline-flex; align-items: center; gap: 5px; font-size: 0.85rem; }
	.pdot { width: 0.65rem; height: 0.65rem; border-radius: 50%; border: 1px solid; display: inline-block; }
</style>
