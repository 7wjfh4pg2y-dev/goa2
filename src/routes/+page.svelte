<script lang="ts">
	import { onDestroy } from 'svelte';
	import { writable, type Readable } from 'svelte/store';
	import logoImage from '$lib/images/goa-logo.png';
	import { reveal } from '$lib/transitions';
	import { role, tryAdmin, enterAsPlayer, signOut } from '$lib/role';
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

	type Mode = 'choose' | 'admin' | 'adminhub' | 'menu' | 'create' | 'join' | 'in';
	let mode: Mode = 'choose';

	// admin
	let pw = '';
	let pwError = false;
	let busy = false;

	// player / match
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

	// per-step measured heights → animate the stage so steps overlap (no stacking)
	let hChoose = 0, hAdmin = 0, hAdminhub = 0, hMenu = 0, hCreate = 0, hJoin = 0, hIn = 0;
	$: stageH = { choose: hChoose, admin: hAdmin, adminhub: hAdminhub, menu: hMenu, create: hCreate, join: hJoin, in: hIn }[mode] ?? 0;

	function randomRoom() { room = Math.random().toString(36).slice(2, 6).toUpperCase(); }
	function ensureLoaded() {
		if (!maps.length) { maps = availableMaps(); mapId = maps[0]?.id ?? ''; }
		try {
			name ||= localStorage.getItem('goa2-name') ?? '';
			color = localStorage.getItem('goa2-color') ?? color;
		} catch {}
	}
	onDestroy(() => session?.leave());

	$: previewWaves = ruleset === 'custom' ? customWaves : wavesFor(ruleset);
	$: previewLife = ruleset === 'custom' ? customLife : lifeFor(ruleset, playerCount);

	// --- navigation ---
	function goHome() {
		session?.leave();
		session = null;
		signOut();
		pw = ''; pwError = false;
		mode = 'choose';
	}
	function goPlayer() {
		enterAsPlayer();
		ensureLoaded();
		randomRoom();
		mode = 'menu';
	}
	async function submitAdmin() {
		busy = true; pwError = false;
		const ok = await tryAdmin(pw);
		busy = false;
		if (ok) mode = 'adminhub';
		else { pwError = true; pw = ''; }
	}
	function onKey(e: KeyboardEvent) { if (e.key === 'Enter') submitAdmin(); }

	// --- match ---
	function persistMe() {
		if (!name.trim()) name = 'Player';
		try { localStorage.setItem('goa2-name', name); localStorage.setItem('goa2-color', color); } catch {}
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
		players = session.players; state = session.state;
		mode = 'in';
	}
	function joinGame() {
		persistMe();
		room = room.trim().toUpperCase();
		if (!room) return;
		session = joinMatch(room, { name, color }, {});
		players = session.players; state = session.state;
		mode = 'in';
	}
	function leaveRoom() {
		session?.leave();
		session = null;
		mode = 'menu';
		randomRoom();
	}
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<main class="wrap">
	<button class="home-link" on:click={goHome} aria-label="Main menu">
		<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	</button>

	<div class="stage" style:height={stageH ? stageH + 'px' : ''}>
		{#if mode === 'choose'}
			<div class="step" transition:reveal bind:clientHeight={hChoose}>
				<div class="cards">
					<button class="card p" on:click={goPlayer}>
						<span class="ic"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg></span>
						<span class="t">Player</span><span class="s">Join or create a match</span>
					</button>
					<button class="card a" on:click={() => (mode = 'admin')}>
						<span class="ic"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(45 12 12)"><path d="M12 20.5 V10.5" /><path d="M8.7 5.4 a3.4 3.4 0 1 0 6.6 0 l-2.1 2.1 h-2.4 l-2.1 -2.1 z" /></g></svg></span>
						<span class="t">Admin</span><span class="s">GM tools</span>
					</button>
				</div>
			</div>
		{:else if mode === 'admin'}
			<div class="step" transition:reveal bind:clientHeight={hAdmin}>
				<div class="card form narrow">
					<input class="field" type="password" placeholder="Password" bind:value={pw} on:keydown={onKey} autocomplete="off" />
					{#if pwError}<p class="err">Incorrect password.</p>{/if}
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'choose')}>← Back</button>
						<button class="primary" on:click={submitAdmin} disabled={busy || !pw}>{busy ? 'Checking…' : 'Unlock'}</button>
					</div>
				</div>
			</div>
		{:else if mode === 'adminhub'}
			<div class="step" transition:reveal bind:clientHeight={hAdminhub}>
				<div class="card form narrow">
					<p class="roomline">You're in as <b class="admincol">Admin</b>.</p>
					<p class="hint">GM tools coming soon.</p>
					<div class="row"><button class="ghost" on:click={goHome}>Sign out</button></div>
				</div>
			</div>
		{:else if mode === 'menu'}
			<div class="step" transition:reveal bind:clientHeight={hMenu}>
				<div class="cards">
					<button class="card p" on:click={() => (mode = 'create')}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
						<span class="t">Create game</span><span class="s">Set the ruleset & map</span>
					</button>
					<button class="card a" on:click={() => (mode = 'join')}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg></span>
						<span class="t">Join game</span><span class="s">Enter a room code</span>
					</button>
				</div>
			</div>
		{:else if mode === 'create'}
			<div class="step" transition:reveal bind:clientHeight={hCreate}>
				<div class="card form wide">
					<div class="grid2">
						<div class="col">
							<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>
							<div class="fld">
								<span>Your colour</span>
								<div class="swatches">
									{#each PLAYER_COLORS as c (c.id)}<button title={c.label} aria-label={c.label} class="sw" class:sel={color === c.id} style="--sc:{c.hex}" on:click={() => (color = c.id)}></button>{/each}
									<button class="chip" class:on={color === 'spectator'} on:click={() => (color = 'spectator')}>Spectator</button>
								</div>
							</div>
						</div>
						<div class="col">
							<div class="fld">
								<span>Ruleset</span>
								<div class="chips">
									<button class="chip" class:on={ruleset === 'quick'} on:click={() => (ruleset = 'quick')}>Quick · {wavesFor('quick')}</button>
									<button class="chip" class:on={ruleset === 'long'} on:click={() => (ruleset = 'long')}>Long · {wavesFor('long')}</button>
									<button class="chip" class:on={ruleset === 'custom'} on:click={() => (ruleset = 'custom')}>Custom</button>
								</div>
								{#if ruleset === 'custom'}
									<div class="two">
										<label class="mini"><span>Waves</span><input class="field" type="number" min="1" max="20" bind:value={customWaves} /></label>
										<label class="mini"><span>Life / team</span><input class="field" type="number" min="1" max="30" bind:value={customLife} /></label>
									</div>
								{:else}
									<div class="chips">{#each [4, 6] as n (n)}<button class="chip" class:on={playerCount === n} on:click={() => (playerCount = n)}>{n} players</button>{/each}</div>
								{/if}
								<p class="hint">{previewWaves} waves · {previewLife} Life / team</p>
							</div>
							<div class="fld">
								<span>Map</span>
								<div class="chips">{#each maps as m (m.id)}<button class="chip" class:on={mapId === m.id} on:click={() => (mapId = m.id)}>{m.label}</button>{/each}</div>
							</div>
						</div>
					</div>
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={createGame}>Create game</button>
					</div>
				</div>
			</div>
		{:else if mode === 'join'}
			<div class="step" transition:reveal bind:clientHeight={hJoin}>
				<div class="card form narrow">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>
					<label class="fld"><span>Room code</span><input class="field up" bind:value={room} maxlength="8" placeholder="code from the host" /></label>
					<div class="fld">
						<span>Your colour</span>
						<div class="swatches">
							{#each PLAYER_COLORS as c (c.id)}<button title={c.label} aria-label={c.label} class="sw" class:sel={color === c.id} style="--sc:{c.hex}" on:click={() => (color = c.id)}></button>{/each}
							<button class="chip" class:on={color === 'spectator'} on:click={() => (color = 'spectator')}>Spectator</button>
						</div>
					</div>
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={joinGame} disabled={!room.trim()}>Join game</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="step" transition:reveal bind:clientHeight={hIn}>
				<div class="card form narrow">
					<p class="roomline">Room <b class="mono">{room}</b></p>
					<div class="fld">
						<span>At the table ({$players.length})</span>
						<div class="players">
							{#each $players as p (p.id)}
								<span class="ptag"><span class="pdot" style="background:{p.color === 'spectator' ? 'transparent' : colorHex(p.color)};border-color:{p.color === 'spectator' ? '#64748b' : colorHex(p.color)}"></span>{p.name}{p.id === session?.clientId ? ' (you)' : ''}</span>
							{/each}
						</div>
					</div>
					<p class="hint">You're in. Board & HUD land next — share the room code with your table.</p>
					<div class="row"><button class="ghost" on:click={leaveRoom}>Leave</button></div>
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 8vh 20px 48px; gap: 30px; color: #f1f5f9; }
	.home-link { background: none; border: none; padding: 0; cursor: pointer; }
	.logo { width: min(260px, 60vw); filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.55)); }

	/* overlapping steps + animated height so switching never stacks or shifts the logo */
	.stage { position: relative; width: 100%; max-width: 640px; transition: height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.step { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: center; }

	.cards { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
	.card { background: rgba(12, 18, 32, 0.44); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); color: inherit; }
	.cards .card { width: 210px; padding: 28px 20px; display: flex; flex-direction: column; align-items: center; gap: 11px; cursor: pointer; transition: transform 0.15s, background 0.15s; }
	.cards .card:hover { transform: translateY(-4px); background: rgba(20, 28, 46, 0.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.ic { width: 62px; height: 62px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
	.t { font-size: 1.35rem; font-weight: 700; }
	.s { font-size: 0.78rem; color: #cbd5e1; }

	.card.form { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
	.form.narrow { width: min(380px, 92vw); }
	.form.wide { width: min(620px, 94vw); }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
	.col { display: flex; flex-direction: column; gap: 16px; }
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
	.err { color: #fca5a5; font-size: 0.82rem; margin: 0; }
	.row { display: flex; justify-content: space-between; gap: 10px; }
	.primary { border: 1px solid #f59e0b; background: #d97706; color: white; border-radius: 10px; padding: 0.55rem 1.2rem; cursor: pointer; font-weight: 600; }
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.roomline { margin: 0; font-size: 1.1rem; }
	.admincol { color: #fdba74; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.players { display: flex; flex-wrap: wrap; gap: 8px; }
	.ptag { display: inline-flex; align-items: center; gap: 5px; font-size: 0.85rem; }
	.pdot { width: 0.65rem; height: 0.65rem; border-radius: 50%; border: 1px solid; display: inline-block; }

	@media (max-width: 560px) {
		.grid2 { grid-template-columns: 1fr; gap: 16px; }
	}
</style>
