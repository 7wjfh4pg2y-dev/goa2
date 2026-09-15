<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { writable, type Readable } from 'svelte/store'
	import BoardCanvas from '$lib/BoardCanvas.svelte'
	import { availableMaps, editorMap, type MapChoice } from '$lib/maps'
	import {
		joinMatch,
		nextTurn,
		prevTurn,
		flipCoin,
		adjustWaves,
		pushLane,
		adjustLife,
		winner,
		wavesFor,
		lifeFor,
		initialMatchState,
		timerDisplayMs,
		startTimer,
		toggleTimer,
		resetTimer,
		addPiece,
		movePiece,
		clearPieces,
		newPieceId,
		PLAYER_COLORS,
		colorHex,
		TEAMS,
		TURNS_PER_ROUND,
		type Team,
		type MatchState,
		type Player,
		type MatchSession
	} from '$lib/match'

	// --- start screen ---
	let joined = false
	let mode: 'menu' | 'create' | 'join' = 'menu'
	let name = ''
	let room = ''
	let color = 'red'
	let ruleset: 'quick' | 'long' | 'custom' = 'long'
	let playerCount = 6
	let customWaves = 3
	let customLife = 6

	let maps: MapChoice[] = []
	let mapId = ''
	let boardCanvas: BoardCanvas
	let hasEditorMap = false

	let session: MatchSession | null = null
	let state: Readable<MatchState> = writable(initialMatchState())
	let players: Readable<Player[]> = writable([])

	// live clock for the shared timer
	let now = Date.now()
	let ticker: ReturnType<typeof setInterval> | null = null

	// per-viewer panel collapse (not synced)
	let colGame = false
	let colLife = false
	let colLog = false

	onMount(() => {
		ticker = setInterval(() => (now = Date.now()), 250)
		maps = availableMaps()
		mapId = maps[0]?.id ?? ''
		hasEditorMap = !!editorMap()
		try {
			colGame = localStorage.getItem('goa2-hud-game') === '1'
			colLife = localStorage.getItem('goa2-hud-life') === '1'
			colLog = localStorage.getItem('goa2-hud-log') === '1'
			name = localStorage.getItem('goa2-hud-name') ?? ''
		} catch {}
	})
	onDestroy(() => {
		if (ticker) clearInterval(ticker)
		session?.leave()
	})

	$: try {
		localStorage.setItem('goa2-hud-game', colGame ? '1' : '0')
		localStorage.setItem('goa2-hud-life', colLife ? '1' : '0')
		localStorage.setItem('goa2-hud-log', colLog ? '1' : '0')
	} catch {}

	function randomRoom() {
		room = Math.random().toString(36).slice(2, 6).toUpperCase()
	}
	if (!room) randomRoom()

	$: previewWaves = ruleset === 'custom' ? customWaves : wavesFor(ruleset)
	$: previewLife = ruleset === 'custom' ? customLife : lifeFor(ruleset, playerCount)

	function beginSession(seed?: MatchState) {
		if (!name.trim()) name = 'Player'
		try {
			localStorage.setItem('goa2-hud-name', name)
		} catch {}
		room = room.trim().toUpperCase() || 'TABLE'
		session = joinMatch(room, { name, color }, seed ? { seed } : {})
		state = session.state
		players = session.players
		joined = true
	}
	// creator: ruleset + map are authoritative for the room
	function createGame() {
		const chosen = maps.find((m) => m.id === mapId) ?? maps[0]
		beginSession(
			initialMatchState({
				waves: previewWaves,
				life: previewLife,
				mapId: chosen?.id ?? '',
				map: chosen?.data ?? null
			})
		)
	}
	// joiner: inherits the room's ruleset + map, brings only name + colour
	function joinGame() {
		beginSession(undefined)
	}

	// current shared state (for handlers passed as props)
	let cur: MatchState = initialMatchState()
	$: cur = $state

	// every mutation is attributed + logged
	function act(text: string, patch: Partial<MatchState>) {
		session?.act(text, patch)
	}
	function pickColor(c: string) {
		color = c
		session?.setSelf({ color: c })
	}
	function leave() {
		session?.leave()
		session = null
		joined = false
	}

	// --- action handlers (compute log text from before/after) ---
	function doNextTurn(s: MatchState) {
		const p = nextTurn(s)
		act(`Round ${p.round ?? s.round} · Turn ${p.turn ?? s.turn}`, p)
	}
	function doPrevTurn(s: MatchState) {
		const p = prevTurn(s)
		act(`Round ${p.round ?? s.round} · Turn ${p.turn ?? s.turn}`, p)
	}
	function doFlip(s: MatchState) {
		const p = flipCoin(s)
		act(`Coin → ${teamLabel(p.tieBreaker as Team)}`, p)
	}
	function doWaves(s: MatchState, d: number) {
		const p = adjustWaves(s, d)
		act(`Waves ${s.waves} → ${p.waves}`, p)
	}
	function doPush(s: MatchState, t: Team) {
		act(`${teamLabel(t)} Push · waves ${s.waves} → ${Math.max(0, s.waves - 1)}`, pushLane(s, t))
	}
	function doLife(s: MatchState, t: Team, d: number) {
		const p = adjustLife(s, t, d)
		act(`${teamLabel(t)} Life ${s.life[t]} → ${p.life![t]}`, p)
	}
	function doTimer(s: MatchState, kind: 'toggle' | 'reset' | 'start') {
		if (kind === 'reset') return act('Timer reset', resetTimer())
		if (kind === 'start') return act('Timer started', startTimer())
		act(s.timer.running ? 'Timer paused' : 'Timer resumed', toggleTimer(s.timer))
	}

	// --- pieces (slice 1: plain tokens) ---
	$: pieceList = Object.values(cur.pieces ?? {})
	function startHex(): string {
		const cells = cur.map?.cells ?? {}
		return Object.keys(cells)[0] ?? '0_0'
	}
	function addToken(t: Team) {
		const id = newPieceId()
		act(`added ${teamLabel(t)} token`, addPiece(cur, { id, hex: startHex(), team: t }))
	}
	function moveToken(id: string, hex: string) {
		if (cur.pieces[id]?.hex === hex) return
		act(`${teamLabel((cur.pieces[id]?.team as Team) ?? 'orange')} token → ${hex}`, movePiece(cur, id, hex))
	}
	function clearTokens() {
		if (Object.keys(cur.pieces ?? {}).length) act('cleared tokens', clearPieces())
	}

	// re-push this browser's current editor map into the live room
	function reloadMap() {
		const m = editorMap()
		if (!m) return
		act(`reloaded map from editor${m.name ? ` — ${m.name}` : ''}`, { map: m, mapId: 'editor' })
	}

	// --- display helpers ---
	const teamLabel = (t: Team) => (t === 'orange' ? 'Orange' : 'Blue')
	const teamText = (t: Team) => (t === 'orange' ? 'text-orange-400' : 'text-blue-400')
	const teamBorder = (t: Team) => (t === 'orange' ? 'border-orange-500/70' : 'border-blue-500/70')
	const teamBtn = (t: Team) =>
		t === 'orange'
			? 'bg-orange-600 hover:bg-orange-700 border-orange-500'
			: 'bg-blue-600 hover:bg-blue-700 border-blue-500'
	function fmt(ms: number) {
		const s = Math.floor(ms / 1000)
		const h = Math.floor(s / 3600)
		const m = Math.floor((s % 3600) / 60)
		const sec = s % 60
		const mm = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
		return h > 0 ? `${h}:${mm}` : mm
	}
	function clockAt(at: number) {
		const d = new Date(at)
		return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
	}
</script>

<svelte:head><title>Match Board — GoA2</title></svelte:head>

{#if !joined}
	<div class="max-w-lg mx-auto px-3 md:mt-20 mt-16 mb-10 text-white">
		<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-4 sm:p-6 space-y-5">
			<div>
				<h1 class="font-modesto text-3xl sm:text-4xl">Match Board</h1>
				<p class="text-dark-300 text-sm mt-1">
					A shared table HUD. Everyone in the same room sees the same timer, coin, waves and Life
					counters — all manual, all editable by anyone, with a running log of who did what.
				</p>
			</div>

			{#if mode === 'menu'}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<button on:click={() => (mode = 'create')} class="primary-button">Create game</button>
					<button on:click={() => (mode = 'join')} class="ghost-button">Join game</button>
				</div>
				<p class="text-dark-400 text-xs">
					<b>Create</b> sets the ruleset and map for the room. <b>Join</b> just needs the room code —
					you inherit the host's settings.
				</p>
			{:else}
				<label class="block space-y-1">
					<span class="font-semibold">Your name</span>
					<input class="field" bind:value={name} placeholder="e.g. Zaheen" />
				</label>

				<div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
					<label class="block space-y-1">
						<span class="font-semibold">Room code</span>
						<input class="field uppercase" bind:value={room} maxlength="8" placeholder={mode === 'join' ? 'code from the host' : ''} />
					</label>
					{#if mode === 'create'}<button on:click={randomRoom} class="ghost-button">Random</button>{/if}
				</div>

				<div class="space-y-2">
					<span class="font-semibold">Your colour</span>
					<div class="flex flex-wrap items-center gap-2">
						{#each PLAYER_COLORS as c (c.id)}
							<button title={c.label} aria-label={c.label} on:click={() => (color = c.id)} class="swatch" class:sel={color === c.id} style="--sc:{c.hex}"></button>
						{/each}
						<button on:click={() => (color = 'spectator')} class={`chip ${color === 'spectator' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>Spectator</button>
					</div>
				</div>

				{#if mode === 'create'}
					<div class="space-y-2">
						<span class="font-semibold">Ruleset</span>
						<div class="flex flex-wrap gap-2">
							<button on:click={() => (ruleset = 'quick')} class={`chip ${ruleset === 'quick' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>Quick · {wavesFor('quick')} waves</button>
							<button on:click={() => (ruleset = 'long')} class={`chip ${ruleset === 'long' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>Long · {wavesFor('long')} waves</button>
							<button on:click={() => (ruleset = 'custom')} class={`chip ${ruleset === 'custom' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>Custom</button>
						</div>

						{#if ruleset === 'custom'}
							<div class="grid grid-cols-2 gap-3 pt-1">
								<label class="space-y-1">
									<span class="text-sm text-dark-300">Wave counters (shared)</span>
									<input class="field" type="number" min="1" max="20" bind:value={customWaves} />
								</label>
								<label class="space-y-1">
									<span class="text-sm text-dark-300">Life counters (per team)</span>
									<input class="field" type="number" min="1" max="30" bind:value={customLife} />
								</label>
							</div>
						{:else}
							<div class="flex flex-wrap gap-2 pt-1">
								{#each [4, 6] as n (n)}
									<button on:click={() => (playerCount = n)} class={`chip ${playerCount === n ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>{n} players</button>
								{/each}
							</div>
						{/if}
						<p class="text-dark-400 text-xs">
							Starts with <span class="text-dark-200">{previewWaves}</span> shared waves ·
							<span class="text-dark-200">{previewLife}</span> Life per team.
						</p>
					</div>

					<div class="space-y-2">
						<span class="font-semibold">Map</span>
						{#if maps.length}
							<div class="flex flex-wrap gap-2">
								{#each maps as m (m.id)}
									<button on:click={() => (mapId = m.id)} class={`chip ${mapId === m.id ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>{m.label}</button>
								{/each}
							</div>
							<p class="text-dark-400 text-xs">The chosen board is shared with everyone in the room — even a custom one from the editor.</p>
						{:else}
							<p class="text-dark-400 text-xs">Loading maps…</p>
						{/if}
					</div>

					<button on:click={createGame} class="primary-button w-full">Create game</button>
				{:else}
					<button on:click={joinGame} class="primary-button w-full" disabled={!room.trim()}>Join game</button>
					<p class="text-dark-400 text-xs">You'll inherit the room's ruleset and map from the host.</p>
				{/if}

				<button on:click={() => (mode = 'menu')} class="backlink">← Back</button>
			{/if}
		</div>
	</div>
{:else}
	{@const s = $state}
	<div class="table-surface">
		<!-- the chosen board, rendered as the play surface -->
		{#if s.map}
			<BoardCanvas map={s.map} pieces={pieceList} onMovePiece={moveToken} bind:this={boardCanvas} />
			<div class="boardctl">
				<button on:click={() => boardCanvas.zoomBtn(1 / 1.2)}>−</button>
				<button on:click={() => boardCanvas.zoomBtn(1.2)}>+</button>
				<button on:click={() => boardCanvas.reset()}>⟲</button>
			</div>
		{/if}

		<!-- UPPER-LEFT: shared game state -->
		<section class="hud top-left" class:collapsed={colGame}>
			<header>
				<span>Game</span>
				<button class="tog" on:click={() => (colGame = !colGame)} title="Collapse">{colGame ? '▸' : '▾'}</button>
			</header>
			{#if !colGame}
				<div class="body">
					<!-- timer -->
					<div class="row">
						<span class="lbl">Timer</span>
						<span class="mono big">{fmt(timerDisplayMs(s.timer, now))}</span>
					</div>
					<div class="btnrow">
						<button class="mini" on:click={() => doTimer(s, 'toggle')}>{s.timer.running ? 'Pause' : 'Start'}</button>
						<button class="mini" on:click={() => doTimer(s, 'reset')}>Reset</button>
					</div>

					<!-- round / turn -->
					<div class="row">
						<span class="lbl">Round · Turn</span>
						<span class="mono big">{s.round} · {s.turn}<span class="dim">/{TURNS_PER_ROUND}</span></span>
					</div>
					<div class="btnrow">
						<button class="mini" on:click={() => doPrevTurn(s)}>◀</button>
						<button class="mini grow" on:click={() => doNextTurn(s)}>Next turn ▶</button>
					</div>

					<!-- tie breaker -->
					<div class="row">
						<span class="lbl">Coin</span>
						<span class={`mono ${teamText(s.tieBreaker)}`}>{teamLabel(s.tieBreaker)}</span>
					</div>
					<div class="btnrow"><button class="mini grow" on:click={() => doFlip(s)}>Flip coin ⟳</button></div>

					<!-- waves -->
					<div class="row">
						<span class="lbl">Waves (shared)</span>
						<span class="stepper">
							<button class="step" on:click={() => doWaves(s, -1)}>−</button>
							<b class="mono">{s.waves}</b>
							<button class="step" on:click={() => doWaves(s, 1)}>+</button>
						</span>
					</div>
					<div class="btnrow">
						{#each TEAMS as t (t)}
							<button class={`mini grow ${teamBtn(t)}`} disabled={s.waves <= 0} on:click={() => doPush(s, t)}>{teamLabel(t)} push</button>
						{/each}
					</div>

					<!-- tokens (slice 1) -->
					<div class="row">
						<span class="lbl">Tokens</span>
						<span class="dim">{pieceList.length} on board</span>
					</div>
					<div class="btnrow">
						<button class={`mini grow ${teamBtn('orange')}`} on:click={() => addToken('orange')}>+ Orange</button>
						<button class={`mini grow ${teamBtn('blue')}`} on:click={() => addToken('blue')}>+ Blue</button>
						<button class="mini" on:click={clearTokens}>Clear</button>
					</div>
					<p class="hint">Drag a token to move it — synced to everyone.</p>

					<!-- board / map -->
					<div class="row">
						<span class="lbl">Board</span>
						<span class="dim ellip">{s.map?.name ?? 'map'}</span>
					</div>
					<div class="btnrow">
						<button class="mini grow" on:click={reloadMap} disabled={!hasEditorMap} title={hasEditorMap ? 'Push your current Map Editor map into this room' : 'No editor map saved in this browser'}>↻ Reload map from editor</button>
					</div>
				</div>
			{/if}
		</section>

		<!-- UPPER-RIGHT: life per team -->
		<section class="hud top-right" class:collapsed={colLife}>
			<header>
				<span>Life</span>
				<button class="tog" on:click={() => (colLife = !colLife)} title="Collapse">{colLife ? '▸' : '▾'}</button>
			</header>
			{#if !colLife}
				<div class="body">
					{#each TEAMS as t (t)}
						<div class={`life ${teamBorder(t)}`}>
							<div class="row">
								<span class={`lbl ${teamText(t)}`}>{teamLabel(t)}</span>
								<span class="stepper">
									<button class="step" on:click={() => doLife(s, t, -1)}>−</button>
									<b class="mono big">{s.life[t]}</b>
									<button class="step" on:click={() => doLife(s, t, 1)}>+</button>
								</span>
							</div>
							<div class="pips">
								{#each Array(Math.min(s.life[t], 14)) as _, i (i)}
									<span class={`pip ${t === 'orange' ? 'pip-o' : 'pip-b'}`}></span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- victory -->
		{#if winner(s)}
			{@const w = winner(s)}
			<div class={`victory ${teamBorder(w.team)}`}>
				<p class={`font-modesto text-4xl ${teamText(w.team)}`}>{teamLabel(w.team)} wins!</p>
				<p class="text-dark-300 text-sm">{w.reason}</p>
			</div>
		{/if}

		<!-- BOTTOM-LEFT: room + seat -->
		<section class="hud bottom-left">
			<div class="body compact">
				<div class="row"><span class="lbl">Room</span><span class="mono">{room}</span></div>
				<div class="seat">
					{#each PLAYER_COLORS as c (c.id)}
						<button title={c.label} aria-label={c.label} on:click={() => pickColor(c.id)} class="swatch sm" class:sel={color === c.id} style="--sc:{c.hex}"></button>
					{/each}
					<button class={`chip sm ${color === 'spectator' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`} on:click={() => pickColor('spectator')}>Spec</button>
				</div>
				<div class="players">
					{#each $players as p (p.id)}
						<span class="ptag">
							<span class="pdot" style="background:{p.color === 'spectator' ? 'transparent' : colorHex(p.color)}; border-color:{p.color === 'spectator' ? '#64748b' : colorHex(p.color)}"></span>
							{p.name}{p.id === session?.clientId ? ' •' : ''}
						</span>
					{/each}
				</div>
				<button class="mini" on:click={leave}>Leave</button>
			</div>
		</section>

		<!-- BOTTOM-RIGHT: activity log -->
		<section class="hud bottom-right log" class:collapsed={colLog}>
			<header>
				<span>Log</span>
				<button class="tog" on:click={() => (colLog = !colLog)} title="Collapse">{colLog ? '▸' : '▾'}</button>
			</header>
			{#if !colLog}
				<div class="body logbody">
					{#if s.log.length === 0}
						<p class="empty">No actions yet.</p>
					{:else}
						{#each [...s.log].reverse() as e (e.id)}
							<p class="logline"><span class="dim">{clockAt(e.at)}</span> <b>{e.by}</b> · {e.text}</p>
						{/each}
					{/if}
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.font-modesto {
		font-family: 'Modesto Poster', serif;
	}
	@font-face {
		font-family: 'Modesto Poster';
		src: url('../../lib/fonts/modesto_poster.woff') format('woff');
	}
	.field {
		width: 100%;
		border-radius: 0.375rem;
		border: 1px solid rgb(75 85 99);
		background: rgb(17 24 39);
		padding: 0.5rem 0.65rem;
		color: white;
	}
	.primary-button {
		border: 1px solid rgb(245 158 11);
		border-radius: 0.375rem;
		background: rgb(217 119 6);
		padding: 0.55rem 1rem;
		color: white;
	}
	.primary-button:hover {
		background: rgb(180 83 9);
	}
	.ghost-button {
		border: 1px solid rgb(75 85 99);
		border-radius: 0.375rem;
		background: rgb(31 41 55);
		padding: 0.55rem 1rem;
		color: white;
	}
	.chip {
		border-width: 1px;
		border-radius: 9999px;
		padding: 0.4rem 0.9rem;
		color: white;
		font-size: 0.9rem;
	}
	.chip.sm {
		padding: 0.2rem 0.55rem;
		font-size: 0.78rem;
	}
	.swatch {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 9999px;
		background: var(--sc);
		border: 2px solid rgba(255, 255, 255, 0.25);
		cursor: pointer;
		padding: 0;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
	}
	.swatch.sm { width: 1.15rem; height: 1.15rem; border-width: 1px; }
	.swatch.sel { outline: 2px solid #f59e0b; outline-offset: 2px; border-color: #fff; }
	.backlink {
		background: none;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0;
	}
	.backlink:hover { color: #e5e7eb; }
	.pdot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 9999px;
		border: 1px solid;
		vertical-align: middle;
		margin-right: 0.15rem;
	}

	/* ---- table surface + HUD ---- */
	.table-surface {
		position: fixed;
		inset: 3.5rem 0 0 0; /* below the nav */
		background:
			radial-gradient(circle at 50% 38%, #16233b, #0b1220 70%),
			repeating-conic-gradient(from 30deg, rgba(255, 255, 255, 0.012) 0deg 60deg, transparent 60deg 120deg);
		overflow: hidden;
		color: #e5e7eb;
	}
	.hud {
		position: absolute;
		z-index: 5;
		background: rgba(15, 21, 34, 0.92);
		border: 1px solid rgb(55 65 81);
		border-radius: 0.6rem;
		box-shadow: 0 8px 26px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		width: 15rem;
		max-width: calc(50vw - 1rem);
	}
	.boardctl {
		position: absolute;
		z-index: 5;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.25rem;
	}
	.boardctl button {
		width: 2rem;
		padding: 0.3rem 0;
		background: rgba(17, 24, 39, 0.9);
		border: 1px solid #374151;
		border-radius: 0.35rem;
		color: #e5e7eb;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.top-left { top: 0.75rem; left: 0.75rem; }
	.top-right { top: 0.75rem; right: 0.75rem; }
	.bottom-left { bottom: 0.75rem; left: 0.75rem; width: 13rem; }
	.bottom-right { bottom: 0.75rem; right: 0.75rem; width: 17rem; }
	.hud.collapsed { width: auto; }

	.hud header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #cbd5e1;
		border-bottom: 1px solid rgb(55 65 81);
	}
	.hud.collapsed header { border-bottom: none; }
	.tog {
		background: transparent;
		color: #cbd5e1;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
	}
	.body { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.45rem; }
	.body.compact { gap: 0.35rem; padding: 0.5rem; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.lbl { font-size: 0.78rem; color: #9ca3af; }
	.mono { font-family: ui-monospace, monospace; }
	.big { font-size: 1.5rem; }
	.dim { color: #64748b; font-size: 0.8em; }
	.btnrow { display: flex; gap: 0.35rem; }
	.mini {
		flex: 0 0 auto;
		border: 1px solid rgb(75 85 99);
		background: rgb(31 41 55);
		color: white;
		border-radius: 0.35rem;
		padding: 0.3rem 0.55rem;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.mini:hover:enabled { background: rgb(55 65 81); }
	.mini:disabled { opacity: 0.45; cursor: not-allowed; }
	.mini.grow { flex: 1 1 auto; }
	.stepper { display: inline-flex; align-items: center; gap: 0.4rem; }
	.step {
		width: 1.7rem; height: 1.7rem;
		border: 1px solid rgb(75 85 99);
		background: rgb(31 41 55);
		color: white; border-radius: 0.3rem; font-size: 1rem; line-height: 1; cursor: pointer;
	}
	.step:hover { background: rgb(55 65 81); }

	.life { border: 1px solid; border-radius: 0.4rem; padding: 0.45rem 0.55rem; }
	.life + .life { margin-top: 0.45rem; }
	.pips { display: flex; flex-wrap: wrap; gap: 0.2rem; margin-top: 0.35rem; }
	.pip { width: 0.55rem; height: 0.55rem; border-radius: 9999px; }
	.pip-o { background: #f97316; }
	.pip-b { background: #3b82f6; }

	.seat { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
	.players { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.75rem; }
	.ptag { white-space: nowrap; }

	.log .logbody { max-height: 40vh; overflow-y: auto; gap: 0.15rem; }
	.logline { font-size: 0.78rem; line-height: 1.25; margin: 0; }
	.log .empty { font-size: 0.78rem; color: #64748b; margin: 0; }
	.hint { font-size: 0.7rem; color: #64748b; margin: 0.1rem 0 0; }
	.ellip { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }

	.victory {
		position: absolute;
		z-index: 6;
		top: 6.5rem; left: 50%; transform: translateX(-50%);
		text-align: center;
		background: rgba(15, 21, 34, 0.95);
		border: 1px solid; border-radius: 0.6rem;
		padding: 0.8rem 1.6rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55);
	}

	@media (max-width: 640px) {
		.hud { width: 11rem; font-size: 0.92em; }
		.bottom-left, .bottom-right { width: 11rem; }
	}
</style>
