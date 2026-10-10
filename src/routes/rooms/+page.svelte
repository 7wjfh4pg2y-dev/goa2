<script lang="ts">
	// GM tools → OPEN GAMES: every room in the public directory (lobby.ts), live — where it is (lobby / hero select /
	// round N), who is seated, the host — with Watch (opens Join with the code filled in) and End (tap twice: joins the
	// room as a watcher and closes it for everyone, match.ts closeRoom). GMs only (the soft gate in role.ts).
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { browseRooms, type RoomInfo } from '$lib/lobby';
	import { closeRoom } from '$lib/match';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';

	let rooms: RoomInfo[] = [];
	let seen = false; // the first listing has arrived
	let handle: ReturnType<typeof browseRooms> | null = null;
	let armed = ''; // room whose End waits for the second tap
	let armT: ReturnType<typeof setTimeout> | null = null;
	let busy: Record<string, string> = {}; // room → what's happening to it ('Closing…', 'Closed', 'Nobody there')
	let toast = '';
	let toastT: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		if ($role !== 'admin') return;
		handle = browseRooms((l) => { rooms = l; seen = true; });
		setTimeout(() => (seen = true), 4000);
	});
	onDestroy(() => { handle?.leave(); if (armT) clearTimeout(armT); if (toastT) clearTimeout(toastT); });

	function say(t: string) { toast = t; if (toastT) clearTimeout(toastT); toastT = setTimeout(() => (toast = ''), 5000); }
	async function end(r: RoomInfo) {
		if (busy[r.room]) return;
		if (armed !== r.room) {
			armed = r.room;
			if (armT) clearTimeout(armT);
			armT = setTimeout(() => (armed = ''), 3000);
			return;
		}
		armed = '';
		busy = { ...busy, [r.room]: 'Closing…' };
		const out = await closeRoom(r.room);
		busy = { ...busy, [r.room]: out === 'closed' ? 'Closed' : 'Nobody there' };
		say(out === 'closed' ? `${r.room} is closed — everyone in it went back to the menu.` : `Nobody answered in ${r.room}: it's a leftover and drops off the list within a minute.`);
		setTimeout(() => { const b = { ...busy }; delete b[r.room]; busy = b; }, 60000);
	}
	const where = (r: RoomInfo) => (r.started ? (r.round ? `Round ${r.round}` : 'In game') : r.phase === 'draft' ? 'Hero select' : 'Lobby');
	$: live = rooms.filter((r) => r.started).length;
</script>

<svelte:head><title>GoA2 · Open games</title></svelte:head>

<div class="rooms tide">
	<header class="top">
		<a class="btn btn-ghost btn-sm" href={base + '/'}><Icon name="back" /> <span class="hidem">Home</span></a>
		<h1 class="ttl">Open games</h1>
		{#if $role === 'admin'}<span class="count">{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}{#if live} · {live} playing{/if}</span>{/if}
	</header>

	<main class="body">
		{#if $role !== 'admin'}
			<section class="panel msg">
				<h2 class="t-h2">GMs only</h2>
				<p class="t-body c-muted">Sign in as Admin to see the open games.</p>
				<a class="btn btn-ghost" href={base + '/'}>Home</a>
			</section>
		{:else if !seen}
			<p class="note">Looking for games…</p>
		{:else if !rooms.length}
			<p class="note">No open games right now.</p>
		{:else}
			<div class="list">
				{#each rooms as r (r.room)}
					<article class="panel room" class:is-live={r.started} class:gone={!!busy[r.room] && busy[r.room] !== 'Closing…'}>
						<div class="head">
							<span class="dot" aria-hidden="true"></span>
							<span class="code">{r.room}</span>
							<span class="where">{where(r)}</span>
							<span class="seats">{r.count} / {r.seats} seated</span>
						</div>
						<div class="who">
							<span class="host"><small>Host</small>{r.host || '—'}</span>
							<span class="names">{#each r.names ?? [] as n, i (i)}<span class="nm">{n}</span>{:else}<span class="none">Nobody seated</span>{/each}</span>
						</div>
						<div class="acts">
							<a class="btn btn-ghost btn-sm" href={`${base}/?room=${encodeURIComponent(r.room)}`}><Icon name="eye" /> Watch</a>
							{#if busy[r.room]}<span class="state">{busy[r.room]}</span>
							{:else}<button class="btn btn-sm endb" class:arm={armed === r.room} on:click={() => end(r)}>{armed === r.room ? 'Tap again to end' : 'End game'}</button>{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</main>
	{#if toast}<div class="toast toast--plain pretoast">{toast}</div>{/if}
</div>

<style>
	.rooms { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); }
	.top { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid var(--brass-line); background: rgba(3, 11, 21, 0.72); }
	.ttl { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 0.04em; color: var(--brass-hi); white-space: nowrap; }
	.count { margin-left: auto; font-size: 14px; color: var(--ink-3); white-space: nowrap; }
	.body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
	.note { text-align: center; color: var(--ink-3); margin-top: 40px; }
	.msg { max-width: 420px; margin: 40px auto; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; text-align: center; }
	.list { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
	.room { display: grid; grid-template-columns: 1fr auto; gap: 8px 14px; padding: 14px 16px; border-left: 3px solid var(--hair); }
	.room.is-live { border-left-color: #22c55e; }
	.room.gone { opacity: 0.45; }
	.head { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: #8a9fb3; align-self: center; }
	.is-live .dot { background: #22c55e; }
	.code { font-size: 22px; letter-spacing: 0.12em; color: var(--brass-hi); }
	.where { font-size: 15px; color: var(--ink); }
	.seats { margin-left: auto; font-size: 13px; color: var(--ink-3); }
	.who { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
	.host { font-size: 15px; } .host small { margin-right: 8px; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	.names { display: flex; flex-wrap: wrap; gap: 6px; }
	.nm { padding: 2px 10px; border-radius: 999px; font-size: 13px; background: var(--well); border: 1px solid var(--hair); }
	.none { font-size: 13px; color: var(--ink-3); }
	.acts { align-self: end; display: flex; align-items: center; gap: 8px; }
	.endb { color: #ffb4a8; border: 1px solid rgba(194, 65, 47, 0.6); background: rgba(0, 0, 0, 0.3); }
	.endb.arm { color: #fff; border-color: #ffb4a8; background: linear-gradient(180deg, #e5484d, #8f1d1d); }
	.state { font-size: 13px; color: var(--ink-3); min-width: 110px; text-align: center; }
	@media (max-width: 640px) {
		.top { padding: 8px 12px; } .ttl { font-size: 22px; } .hidem { display: none; }
		.body { padding: 12px; }
		.room { grid-template-columns: 1fr; }
		.acts { justify-content: flex-end; }
	}
</style>
