<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { writable, type Readable } from 'svelte/store';
	import logoImage from '$lib/images/goa-logo.png';
	import { reveal } from '$lib/transitions';
	import { role, tryAdmin, enterAsPlayer, signOut } from '$lib/role';
	import { availableMaps, type MapChoice } from '$lib/maps';
	import { announceRoom, browseRooms, type RoomInfo } from '$lib/lobby';
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

	type Mode = 'choose' | 'admin' | 'adminhub' | 'menu' | 'create' | 'join' | 'lobby' | 'game';
	let mode: Mode = 'choose';
	let notice = '';

	// admin
	let pw = '';
	let pwError = false;
	let busy = false;

	// create/join settings
	let name = '';
	let room = '';
	let ruleset: 'quick' | 'long' | 'custom' = 'quick';
	let playerCount = 4;
	let customWaves = 3;
	let customLife = 6;
	let maps: MapChoice[] = [];
	let mapId = '';

	// lobby / session
	let color = 'spectator';
	let ready = false;
	let session: MatchSession | null = null;
	let players: Readable<Player[]> = writable([]);
	let state: Readable<MatchState> = writable(initialMatchState());
	let copied = false;

	// public room directory
	let roomHandle: ReturnType<typeof announceRoom> | null = null;
	let browseHandle: ReturnType<typeof browseRooms> | null = null;
	let openRooms: RoomInfo[] = [];

	// measured heights → animated stage
	let h: Record<string, number> = {};
	$: stageH = h[mode] ?? 0;

	function randomRoom() { room = Math.random().toString(36).slice(2, 6).toUpperCase(); }
	function ensureLoaded() {
		if (!maps.length) { maps = availableMaps(); mapId = maps[0]?.id ?? ''; }
		try { name ||= localStorage.getItem('goa2-name') ?? ''; } catch {}
	}

	onMount(() => {
		// shareable link ?room=CODE → jump straight to Join, prefilled
		const q = new URLSearchParams(location.search).get('room');
		if (q) {
			enterAsPlayer();
			ensureLoaded();
			room = q.toUpperCase();
			mode = 'join';
		}
	});
	onDestroy(() => {
		session?.leave();
		roomHandle?.leave();
		browseHandle?.leave();
	});

	$: previewWaves = ruleset === 'custom' ? customWaves : wavesFor(ruleset);
	$: previewLife = ruleset === 'custom' ? customLife : lifeFor(ruleset, playerCount);
	$: shareLink = browser && room ? `${location.origin}${base}/?room=${room}` : '';

	// --- lobby derived ---
	$: me = session ? $players.find((p) => p.id === session!.clientId) : undefined;
	$: iAmHost = session ? $state.host === session.clientId : false;
	$: seated = $players.filter((p) => p.color !== 'spectator');
	$: spectators = $players.filter((p) => p.color === 'spectator');
	$: seatedCount = seated.length;
	$: allReady = seatedCount >= 1 && seated.every((p) => p.ready);
	$: takenColors = new Set($players.filter((p) => p.id !== session?.clientId && p.color !== 'spectator').map((p) => p.color));

	// react to shared game transitions
	$: if (mode === 'lobby' && $state.started) mode = 'game';
	$: if ((mode === 'lobby' || mode === 'game') && $state.closed) bail('The host closed the game.');

	function bail(msg: string) {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		notice = msg;
		mode = 'menu';
	}

	// host keeps the directory entry in sync with the room
	$: if (roomHandle) roomHandle.update({ count: seatedCount, started: $state.started });

	// browse open rooms only while on the Join screen
	function manageBrowse(m: Mode) {
		if (m === 'join') {
			if (!browseHandle) browseHandle = browseRooms((rs) => (openRooms = rs));
		} else if (browseHandle) {
			browseHandle.leave();
			browseHandle = null;
			openRooms = [];
		}
	}
	$: if (browser) manageBrowse(mode);

	// --- navigation ---
	function goHome() {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		signOut();
		pw = ''; pwError = false; notice = '';
		mode = 'choose';
	}
	function goPlayer() {
		enterAsPlayer();
		ensureLoaded();
		randomRoom();
		notice = '';
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
	function persistName() {
		if (!name.trim()) name = 'Player';
		try { localStorage.setItem('goa2-name', name); } catch {}
	}
	function bindSession() {
		players = session!.players;
		state = session!.state;
		color = 'spectator';
		ready = false;
		session!.kicked.subscribe((v) => { if (v) bail('You were removed from the game.'); });
		mode = 'lobby';
	}
	function createGame() {
		persistName();
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
		session = joinMatch(room, { name, color: 'spectator' }, { seed });
		roomHandle = announceRoom({ room, host: name, seats: playerCount, count: 0, started: false });
		bindSession();
	}
	function joinGame() {
		persistName();
		room = room.trim().toUpperCase();
		if (!room) return;
		session = joinMatch(room, { name, color: 'spectator' }, {});
		bindSession();
	}
	function leaveRoom() {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		mode = 'menu';
		randomRoom();
	}
	function joinFromList(r: RoomInfo) {
		room = r.room;
		joinGame();
	}

	// --- lobby actions ---
	function pickColor(c: string) {
		if (c === 'spectator') { color = 'spectator'; ready = false; session?.setSelf({ color: 'spectator', ready: false }); return; }
		if (takenColors.has(c)) return;
		if (color === 'spectator' && seatedCount >= $state.seats) return; // seats full
		color = c;
		session?.setSelf({ color: c });
	}
	function toggleReady() {
		if (color === 'spectator') return;
		ready = !ready;
		session?.setSelf({ ready });
	}
	function beginGame() { if (iAmHost && allReady) session?.update({ started: true }); }
	function closeGame() { session?.update({ closed: true }); }
	function kick(id: string) { session?.kick(id); }

	async function copyLink() {
		try { await navigator.clipboard.writeText(shareLink); copied = true; setTimeout(() => (copied = false), 1400); } catch {}
	}
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<main class="wrap">
	<button class="home-link" on:click={goHome} aria-label="Main menu">
		<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
	</button>

	<div class="stage" style:height={stageH ? stageH + 'px' : ''}>
		{#if mode === 'choose'}
			<div class="step" transition:reveal bind:clientHeight={h['choose']}>
				{#if notice}<p class="notice">{notice}</p>{/if}
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
			<div class="step" transition:reveal bind:clientHeight={h['admin']}>
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
			<div class="step" transition:reveal bind:clientHeight={h['adminhub']}>
				<div class="card form narrow">
					<p class="roomline">You're in as <b class="admincol">Admin</b>.</p>
					<p class="hint">GM tools coming soon.</p>
					<div class="row"><button class="ghost" on:click={goHome}>Sign out</button></div>
				</div>
			</div>
		{:else if mode === 'menu'}
			<div class="step" transition:reveal bind:clientHeight={h['menu']}>
				{#if notice}<p class="notice">{notice}</p>{/if}
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
			<div class="step" transition:reveal bind:clientHeight={h['create']}>
				<div class="card form wide">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>
					<div class="grid2">
						<div class="col">
							<div class="fld">
								<span>Game length</span>
								<div class="chips">
									<button class="chip" class:on={ruleset === 'quick'} on:click={() => (ruleset = 'quick')}>Quick</button>
									<button class="chip" class:on={ruleset === 'long'} on:click={() => (ruleset = 'long')}>Long</button>
									<button class="chip" class:on={ruleset === 'custom'} on:click={() => (ruleset = 'custom')}>Custom</button>
								</div>
							</div>
							{#if ruleset === 'custom'}
								<div class="fld">
									<span>Waves</span>
									<div class="chips">{#each [1, 2, 3, 4, 5, 6, 7] as w (w)}<button class="chip" class:on={customWaves === w} on:click={() => (customWaves = w)}>{w}</button>{/each}</div>
								</div>
								<div class="fld">
									<span>Life / team</span>
									<div class="chips">{#each [3, 4, 5, 6, 7, 8, 9, 10] as l (l)}<button class="chip" class:on={customLife === l} on:click={() => (customLife = l)}>{l}</button>{/each}</div>
								</div>
							{/if}
							<div class="fld">
								<span>Players (seats)</span>
								<div class="chips">{#each [4, 6, 8, 10] as n (n)}<button class="chip" class:on={playerCount === n} on:click={() => (playerCount = n)}>{n}</button>{/each}</div>
							</div>
						</div>
						<div class="col">
							<div class="fld">
								<span>Map</span>
								<div class="chips">{#each maps as m (m.id)}<button class="chip" class:on={mapId === m.id} on:click={() => (mapId = m.id)}>{m.label}</button>{/each}</div>
							</div>
							<p class="hint">{previewWaves} waves · {previewLife} Life per team · {playerCount} seats</p>
						</div>
					</div>
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={createGame}>Create game</button>
					</div>
				</div>
			</div>
		{:else if mode === 'join'}
			<div class="step" transition:reveal bind:clientHeight={h['join']}>
				<div class="card form narrow">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="e.g. Zaheen" /></label>
					<label class="fld"><span>Room code</span><input class="field up" bind:value={room} maxlength="8" placeholder="code from the host" /></label>
					<div class="fld">
						<span>Open games</span>
						{#if openRooms.length}
							<div class="roomlist">
								{#each openRooms as r (r.room)}
									<button class="roomrow" on:click={() => joinFromList(r)}>
										<span class="mono rc">{r.room}</span>
										<span class="rh">{r.host}'s game</span>
										<span class="rmeta">{r.started ? 'in progress' : `${r.count}/${r.seats} seated`}</span>
										<span class="rjoin">{r.started || r.count >= r.seats ? 'Spectate' : 'Join'}</span>
									</button>
								{/each}
							</div>
						{:else}
							<p class="hint">No open games right now — enter a code above or create one.</p>
						{/if}
					</div>
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={joinGame} disabled={!room.trim()}>Join game</button>
					</div>
				</div>
			</div>
		{:else if mode === 'lobby'}
			<div class="step" transition:reveal bind:clientHeight={h['lobby']}>
				<div class="card form lobby" style="width: min(96vw, {$state.seats * 96 + 56}px)">
					<div class="lobbyhead">
						<div>
							<span class="lbl">Room code</span>
							<div class="mono roomcode">{room}</div>
						</div>
						<button class="ghost" on:click={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
					</div>

					<div class="fld">
						<span>Your colour {seatedCount >= $state.seats && color === 'spectator' ? '· seats full' : ''}</span>
						<div class="swatches">
							{#each PLAYER_COLORS as c (c.id)}
								<button title={c.label} aria-label={c.label} class="sw" class:sel={color === c.id} disabled={takenColors.has(c.id) || (color === 'spectator' && seatedCount >= $state.seats)} style="--sc:{c.hex}" on:click={() => pickColor(c.id)}></button>
							{/each}
							<button class="chip" class:on={color === 'spectator'} on:click={() => pickColor('spectator')}>Spectator</button>
						</div>
					</div>

					<div class="fld">
						<span>At the table — {seatedCount}/{$state.seats} seated</span>
						<div class="hrow">
							{#each Array($state.seats) as _, i (i)}
								{@const p = seated[i]}
								{#if p}
									<div class="hseat" class:mine={p.id === session?.clientId}>
										<div class="av" style="background:{colorHex(p.color)}">
											{#if p.id === $state.host}<span class="crown" title="Host">♛</span>{/if}
											{#if iAmHost && p.id !== session?.clientId}<button class="kick" title="Kick" on:click={() => kick(p.id)}>✕</button>{/if}
										</div>
										<div class="hn">{p.name}{p.id === session?.clientId ? ' (you)' : ''}</div>
										<div class="hr" class:ok={p.ready}>{p.ready ? 'ready' : '…'}</div>
									</div>
								{:else}
									<div class="hseat empty"><div class="av av-empty"></div><div class="hn muted">open</div><div class="hr">&nbsp;</div></div>
								{/if}
							{/each}
						</div>
						{#if spectators.length}
							<p class="specs">Spectating: {#each spectators as sp, i (sp.id)}{sp.name}{sp.id === session?.clientId ? ' (you)' : ''}{#if iAmHost && sp.id !== session?.clientId}<button class="kickx" title="Kick" on:click={() => kick(sp.id)}>✕</button>{/if}{i < spectators.length - 1 ? ', ' : ''}{/each}</p>
						{/if}
					</div>

					<div class="row wraprow">
						<button class="ghost" on:click={leaveRoom}>Leave</button>
						<div class="rightbtns">
							{#if color !== 'spectator'}
								<button class="primary" class:isready={ready} on:click={toggleReady}>{ready ? '✓ Ready' : 'Ready up'}</button>
							{/if}
							{#if iAmHost}
								<button class="ghost danger" on:click={closeGame}>Close</button>
								<button class="primary" disabled={!allReady} on:click={beginGame}>Begin</button>
							{/if}
						</div>
					</div>
					{#if iAmHost && !allReady}<p class="hint">Everyone seated must ready up before you can begin.</p>{/if}
				</div>
			</div>
		{:else}
			<div class="step" transition:reveal bind:clientHeight={h['game']}>
				<div class="card form narrow">
					<p class="roomline">Game started — room <b class="mono">{room}</b></p>
					<p class="hint">The board & HUD land next.</p>
					<div class="row"><button class="ghost" on:click={leaveRoom}>Leave</button></div>
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 5vh 20px 32px; gap: 22px; color: #f1f5f9; }
	.home-link { background: none; border: none; padding: 0; cursor: pointer; }
	.logo { width: min(224px, 54vw); filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.55)); }

	.stage { position: relative; width: 100%; max-width: 1040px; transition: height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.step { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; }

	.notice { margin: 0; font-size: 0.85rem; color: #fca5a5; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 6px 12px; }

	.cards { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
	.card { background: rgba(12, 18, 32, 0.44); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); color: inherit; }
	.cards .card { width: 210px; padding: 28px 20px; display: flex; flex-direction: column; align-items: center; gap: 11px; cursor: pointer; transition: transform 0.15s, background 0.15s; }
	.cards .card:hover { transform: translateY(-4px); background: rgba(20, 28, 46, 0.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.ic { width: 62px; height: 62px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
	.t { font-size: 1.35rem; font-weight: 700; }
	.s { font-size: 0.78rem; color: #cbd5e1; }

	.card.form { padding: 20px; display: flex; flex-direction: column; gap: 13px; width: 100%; }
	.form.narrow { width: min(380px, 92vw); }
	.form.wide { width: min(560px, 94vw); }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
	.col { display: flex; flex-direction: column; gap: 16px; }
	.fld { display: flex; flex-direction: column; gap: 7px; }
	.fld > span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.lbl { font-size: 0.78rem; color: #94a3b8; }
	.field { width: 100%; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(8, 12, 22, 0.6); padding: 0.55rem 0.7rem; color: white; }
	.field.up { text-transform: uppercase; }
	.chips, .swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.chip { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; border-radius: 999px; padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer; }
	.chip.on { background: #d97706; border-color: #f59e0b; color: white; }
	.sw { width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--sc); border: 2px solid rgba(255, 255, 255, 0.25); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); cursor: pointer; padding: 0; }
	.sw.sel { outline: 2px solid #f59e0b; outline-offset: 2px; border-color: #fff; }
	.sw:disabled { opacity: 0.28; cursor: not-allowed; }
	.hint { font-size: 0.72rem; color: #94a3b8; margin: 2px 0 0; }
	.roomlist { display: flex; flex-direction: column; gap: 6px; max-height: 176px; overflow-y: auto; }
	.roomrow { display: flex; align-items: center; gap: 10px; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 8px 10px; color: #e5e7eb; cursor: pointer; transition: background 0.12s; }
	.roomrow:hover { background: rgba(255, 255, 255, 0.09); }
	.rc { font-size: 0.95rem; font-weight: 700; letter-spacing: 0.06em; }
	.rh { flex: 1; font-size: 0.82rem; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rmeta { font-size: 0.72rem; color: #94a3b8; }
	.rjoin { font-size: 0.78rem; font-weight: 600; color: #fdba74; }
	.err { color: #fca5a5; font-size: 0.82rem; margin: 0; }
	.row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
	.row.wraprow { flex-wrap: wrap; }
	.rightbtns { display: flex; gap: 8px; flex-wrap: wrap; }
	.primary { border: 1px solid #f59e0b; background: #d97706; color: white; border-radius: 10px; padding: 0.55rem 1.2rem; cursor: pointer; font-weight: 600; }
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.primary.isready { background: #16a34a; border-color: #22c55e; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.ghost.danger { border-color: rgba(239, 68, 68, 0.5); color: #fca5a5; }
	.roomline { margin: 0; font-size: 1.1rem; }
	.admincol { color: #fdba74; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }

	.lobbyhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.roomcode { font-size: 1.5rem; font-weight: 700; }

	.hrow { display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; }
	.hseat { flex: 1 1 84px; min-width: 84px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 8px 4px; }
	.hseat.mine { border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.08); }
	.hseat.empty { border-style: dashed; }
	.av { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3); position: relative; }
	.av-empty { background: rgba(255, 255, 255, 0.05); border-style: dashed; }
	.crown { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); font-size: 13px; color: #fcd34d; }
	.kick { position: absolute; top: -6px; right: -6px; border: none; background: #b91c1c; color: #fff; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; line-height: 1; font-size: 11px; padding: 0; }
	.hn { font-size: 0.8rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hn.muted { color: #64748b; }
	.hr { font-size: 0.62rem; text-transform: uppercase; color: #94a3b8; }
	.hr.ok { color: #6ee7b7; }
	.specs { font-size: 0.75rem; color: #94a3b8; margin: 8px 0 0; }
	.kickx { border: none; background: transparent; color: #fca5a5; cursor: pointer; font-size: 0.7rem; padding: 0 2px; }

	@media (max-width: 560px) {
		.grid2 { grid-template-columns: 1fr; gap: 16px; }
	}
</style>
