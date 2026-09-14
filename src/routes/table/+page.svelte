<script lang="ts">
	import { onDestroy } from 'svelte'
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
		TEAMS,
		PHASES,
		PHASE_LABELS,
		TURNS_PER_ROUND,
		type Team,
		type Phase,
		type MatchState,
		type Player,
		type MatchSession
	} from '$lib/match'
	import { writable, type Readable } from 'svelte/store'

	// --- join form ---
	let joined = false
	let name = ''
	let room = ''
	let team: Team | 'spectator' = 'spectator'
	let gameLength: 'quick' | 'long' = 'long'
	let playerCount = 6

	let session: MatchSession | null = null
	let state: Readable<MatchState> = writable(initialMatchState())
	let players: Readable<Player[]> = writable([])

	function randomRoom() {
		room = Math.random().toString(36).slice(2, 6).toUpperCase()
	}
	if (!room) randomRoom()

	function join() {
		if (!name.trim()) name = 'Player'
		room = room.trim().toUpperCase() || 'TABLE'
		const seed = initialMatchState({ length: gameLength, players: playerCount })
		session = joinMatch(room, { name, team }, seed)
		state = session.state
		players = session.players
		joined = true
	}

	function set(patch: Partial<MatchState>) {
		session?.update(patch)
	}
	function pickTeam(t: Team | 'spectator') {
		team = t
		session?.setSelf({ team: t })
	}

	function leave() {
		session?.leave()
		session = null
		joined = false
	}
	onDestroy(() => session?.leave())

	const teamLabel = (t: Team) => (t === 'orange' ? 'Orange' : 'Blue')
	const teamText = (t: Team) => (t === 'orange' ? 'text-orange-400' : 'text-blue-400')
	const teamBorder = (t: Team) => (t === 'orange' ? 'border-orange-500/70' : 'border-blue-500/70')
	const teamBtn = (t: Team) =>
		t === 'orange'
			? 'bg-orange-600 hover:bg-orange-700 border-orange-500'
			: 'bg-blue-600 hover:bg-blue-700 border-blue-500'
</script>

<svelte:head><title>Match Board — GoA2</title></svelte:head>

<div class="max-w-4xl mx-auto px-3 md:mt-20 mt-16 mb-10 text-white">
	{#if !joined}
		<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-4 sm:p-6 space-y-5">
			<div>
				<h1 class="font-modesto text-3xl sm:text-4xl">Match Board</h1>
				<p class="text-dark-300 text-sm mt-1">
					A shared, live tracker for a table. Everyone who joins the same room code sees the same
					round, coin, waves and Life counters in real time.
				</p>
			</div>

			<label class="block space-y-1">
				<span class="font-semibold">Your name</span>
				<input class="field" bind:value={name} placeholder="e.g. Zaheen" />
			</label>

			<div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
				<label class="block space-y-1">
					<span class="font-semibold">Room code</span>
					<input class="field uppercase" bind:value={room} maxlength="8" />
				</label>
				<button on:click={randomRoom} class="ghost-button">Random</button>
			</div>

			<div class="space-y-2">
				<span class="font-semibold">Join as</span>
				<div class="flex flex-wrap gap-2">
					<button
						on:click={() => (team = 'orange')}
						class={`chip ${team === 'orange' ? teamBtn('orange') : 'bg-dark-700 border-dark-600'}`}
						>Orange</button
					>
					<button
						on:click={() => (team = 'blue')}
						class={`chip ${team === 'blue' ? teamBtn('blue') : 'bg-dark-700 border-dark-600'}`}
						>Blue</button
					>
					<button
						on:click={() => (team = 'spectator')}
						class={`chip ${team === 'spectator' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}
						>Spectator</button
					>
				</div>
			</div>

			<div class="space-y-2">
				<span class="font-semibold">Game length</span>
				<div class="flex flex-wrap gap-2">
					<button
						on:click={() => (gameLength = 'quick')}
						class={`chip ${gameLength === 'quick' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}
						>Quick · {wavesFor('quick')} waves</button
					>
					<button
						on:click={() => (gameLength = 'long')}
						class={`chip ${gameLength === 'long' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}
						>Long · {wavesFor('long')} waves</button
					>
				</div>
			</div>

			<div class="space-y-2">
				<span class="font-semibold">Players</span>
				<div class="flex flex-wrap gap-2">
					{#each [4, 6] as n (n)}
						<button
							on:click={() => (playerCount = n)}
							class={`chip ${playerCount === n ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}
							>{n} players</button
						>
					{/each}
				</div>
				<p class="text-dark-400 text-xs">
					Sets starting Life counters per team: <span class="text-dark-200"
						>{lifeFor(gameLength, playerCount)}</span
					>
					· Waves (shared): <span class="text-dark-200">{wavesFor(gameLength)}</span>
				</p>
			</div>

			<button on:click={join} class="primary-button">Join table</button>
		</div>
	{:else}
		{@const s = $state}
		<div class="space-y-5">
			<!-- header: room + presence -->
			<div
				class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dark-600 bg-dark-900/90 p-4"
			>
				<div>
					<p class="text-dark-300 text-xs uppercase tracking-wide">Room</p>
					<p class="font-mono text-2xl">{room}</p>
				</div>
				<div class="flex-1 min-w-[12rem]">
					<p class="text-dark-300 text-xs uppercase tracking-wide mb-1">
						At the table ({$players.length})
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each $players as p (p.id)}
							<span
								class={`text-xs px-2 py-0.5 rounded-full border ${p.team === 'orange' ? teamBorder('orange') + ' ' + teamText('orange') : p.team === 'blue' ? teamBorder('blue') + ' ' + teamText('blue') : 'border-dark-600 text-dark-300'}`}
							>
								{p.name}{p.id === session?.clientId ? ' (you)' : ''}
							</span>
						{/each}
					</div>
				</div>
				<button on:click={leave} class="ghost-button">Leave</button>
			</div>

			<!-- your seat -->
			<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-3 flex flex-wrap items-center gap-2">
				<span class="text-dark-300 text-sm mr-1">You are:</span>
				<button on:click={() => pickTeam('orange')} class={`chip ${team === 'orange' ? teamBtn('orange') : 'bg-dark-700 border-dark-600'}`}>Orange</button>
				<button on:click={() => pickTeam('blue')} class={`chip ${team === 'blue' ? teamBtn('blue') : 'bg-dark-700 border-dark-600'}`}>Blue</button>
				<button on:click={() => pickTeam('spectator')} class={`chip ${team === 'spectator' ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}>Spectator</button>
			</div>

			<!-- round / turn -->
			<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-4 sm:p-6">
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<div class="text-center">
						<p class="text-dark-300 text-xs uppercase tracking-wide">Round</p>
						<p class="font-mono text-5xl">{s.round}</p>
					</div>
					<div class="text-center">
						<p class="text-dark-300 text-xs uppercase tracking-wide">Turn</p>
						<p class="font-mono text-5xl">{s.turn}<span class="text-dark-500 text-2xl">/{TURNS_PER_ROUND}</span></p>
					</div>
					<div class="flex gap-2">
						<button on:click={() => set(prevTurn(s))} class="ghost-button">◀ Prev</button>
						<button on:click={() => set(nextTurn(s))} class="primary-button">Next turn ▶</button>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap gap-2">
					{#each PHASES as p (p)}
						<button
							on:click={() => set({ phase: p })}
							class={`chip ${s.phase === p ? 'bg-amber-600 border-amber-500' : 'bg-dark-700 border-dark-600'}`}
							>{PHASE_LABELS[p]}</button
						>
					{/each}
				</div>
			</div>

			<!-- tie breaker coin -->
			<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-4 flex items-center justify-between gap-4 flex-wrap">
				<div>
					<p class="text-dark-300 text-xs uppercase tracking-wide">Tie-breaker coin</p>
					<p class={`text-2xl font-semibold ${teamText(s.tieBreaker)}`}>{teamLabel(s.tieBreaker)} up</p>
				</div>
				<button on:click={() => set(flipCoin(s))} class="ghost-button">Flip coin ⟳</button>
			</div>

			<!-- shared wave counters + Push the Lane -->
			{#if winner(s)}
				{@const w = winner(s)}
				<div class={`rounded-lg border p-4 text-center ${teamBorder(w.team)}`}>
					<p class={`font-modesto text-3xl ${teamText(w.team)}`}>{teamLabel(w.team)} wins!</p>
					<p class="text-dark-300 text-sm">{w.reason}</p>
				</div>
			{/if}

			<div class="rounded-lg border border-dark-600 bg-dark-900/90 p-4">
				<div class="flex items-center justify-between flex-wrap gap-3">
					<div>
						<p class="text-dark-300 text-xs uppercase tracking-wide">Wave counters (shared)</p>
						<div class="flex items-center gap-2 mt-1">
							<button on:click={() => set(adjustWaves(s, -1))} class="step">−</button>
							<span class="font-mono text-4xl w-12 text-center">{s.waves}</span>
							<button on:click={() => set(adjustWaves(s, 1))} class="step">+</button>
						</div>
					</div>
					<div class="text-right">
						<p class="text-dark-300 text-xs uppercase tracking-wide mb-1">Push the Lane — won by</p>
						<div class="flex gap-2">
							{#each TEAMS as t (t)}
								<button
									on:click={() => set(pushLane(s, t))}
									disabled={s.waves <= 0}
									class={`chip ${teamBtn(t)} disabled:opacity-50`}>{teamLabel(t)}</button
								>
							{/each}
						</div>
					</div>
				</div>
				<p class="text-dark-500 text-xs mt-2">
					{#if s.lastPush}Last push won by <span class={teamText(s.lastPush)}>{teamLabel(s.lastPush)}</span>.
					{/if}A Push flips one shared counter; at 0 the last pusher wins.
				</p>
			</div>

			<!-- per-team Life counters -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{#each TEAMS as t (t)}
					<div class={`rounded-lg border bg-dark-900/90 p-4 ${teamBorder(t)}`}>
						<h2 class={`font-semibold text-lg mb-3 ${teamText(t)}`}>{teamLabel(t)}</h2>
						<div class="flex items-center justify-between">
							<span class="text-dark-300 text-sm">Life counters</span>
							<div class="flex items-center gap-2">
								<button on:click={() => set(adjustLife(s, t, -1))} class="step">−</button>
								<span class="font-mono text-3xl w-10 text-center">{s.life[t]}</span>
								<button on:click={() => set(adjustLife(s, t, 1))} class="step">+</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<p class="text-xs text-dark-500 text-center">
				Live-synced to everyone in room {room}. State is shared in real time; persistence lands
				with the Supabase hardening pass.
			</p>
		</div>
	{/if}
</div>

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
	.ghost-button:hover {
		background: rgb(55 65 81);
	}
	.chip {
		border-width: 1px;
		border-radius: 9999px;
		padding: 0.4rem 0.9rem;
		color: white;
		font-size: 0.9rem;
	}
	.step {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 0.375rem;
		border: 1px solid rgb(75 85 99);
		background: rgb(31 41 55);
		color: white;
		font-size: 1.2rem;
		line-height: 1;
	}
	.step:hover {
		background: rgb(55 65 81);
	}
</style>
