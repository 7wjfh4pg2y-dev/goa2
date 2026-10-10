<script lang="ts" module>
	export type SeatRow = { seat: number; id: string; name: string; hero: string; present: boolean; team: 'orange' | 'blue' | null };
</script>

<script lang="ts">
	// ☰ in the 2.0 HUD = the game lobby, in the middle of the screen: the room and the connection, both teams (the
	// host can kick), the watchers and their seat requests, Leave. (Your HUD — 2.0 / classic — is in the wheel's Version.)
	import { portraitCss, heroById } from '$lib/heroes';

	export let room = '';
	export let conn = '';
	export let connClass = '';
	export let seats: SeatRow[] = [];
	export let watchers: { id: string; name: string }[] = [];
	export let requests: { id: string; name: string; seat: number }[] = [];
	export let host = false;
	export let clientId = '';
	export let mySeat = -1;
	export let myRequest = -1;
	export let colorOf: (id: string) => string = () => '#888';
	export let onKick: (id: string) => void = () => {};
	export let onSit: (seat: number) => void = () => {};
	export let onResolve: (id: string, ok: boolean) => void = () => {};
	/** the host: put a watcher in an away / open seat (tap Seat on the watcher, then Give on the seat) */
	export let onGive: (id: string, seat: number) => void = () => {};
	let giving: string | null = null;
	$: if (giving && !watchers.some((w) => w.id === giving)) giving = null;
	$: givingName = watchers.find((w) => w.id === giving)?.name ?? '';
	export let onLeave: () => void = () => {};
	/** the host: end the game for everyone (tap, then tap again to confirm) */
	export let onEnd: () => void = () => {};
	let endArm = false, endT: ReturnType<typeof setTimeout> | null = null;
	function endTap() {
		if (!endArm) { endArm = true; if (endT) clearTimeout(endT); endT = setTimeout(() => (endArm = false), 3000); return; }
		endArm = false; onEnd();
	}
	export let onClose: () => void = () => {};
	/** the phone's ☰: the whole screen, with the log (newest first) and the host's Undo */
	export let phone = false;
	export let log: { id: string; by: string; text: string }[] = [];
	export let canUndo = false;
	export let onUndo: () => void = () => {};

	$: teams = [['blue', 'Titans'], ['orange', 'Atlanteans']].map(([t, label]) => ({ t, label, rows: seats.filter((s) => s.team === t) }));
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && onClose()} />
<div class="scrim" class:phone role="presentation" on:pointerdown|self={onClose}>
	<div class="glob" role="dialog" aria-modal="true" aria-label="Game lobby">
		<div class="ghead"><b>Game lobby</b><span class="groom">Room <em>{room}</em></span><span class="gconn {connClass}"><i></i>{conn}</span><button class="gx" on:click={onClose} aria-label="Close">✕</button></div>
		<div class="gteams">
			{#each teams as tm (tm.t)}
				<div class="gteam is-{tm.t}">
					<small>{tm.label}</small>
					{#each tm.rows as s (s.seat)}
						<span class="gp" class:away={!s.present}>
							<span class="gface" class:blank={!s.hero} style="--pc:{s.id ? colorOf(s.id) : '#555'}; {s.hero ? portraitCss(s.hero) : ''}"></span>
							<span class="gn"><b>{s.hero ? heroById(s.hero)?.name ?? '' : 'Open seat'}</b><em>{s.name || '—'}{s.id === clientId ? ' · you' : !s.present && s.name ? ' · away' : ''}</em></span>
							{#if host && s.present && s.id && s.id !== clientId}<button class="gkick" on:click={() => onKick(s.id)}>Kick</button>{/if}
							{#if host && giving && !s.present}<button class="gok give" on:click={() => { onGive(giving ?? '', s.seat); giving = null; }} title="Give this seat to {givingName}">Give</button>
							{:else if mySeat < 0 && !s.present}
								{#if myRequest === s.seat}<span class="greq">Requested…</span>
								{:else}<button class="gok" on:click={() => onSit(s.seat)} disabled={myRequest >= 0}>Take seat</button>{/if}
							{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
		{#if requests.length || watchers.length}
			<div class="gspec">
				<small>Watching</small>
				{#each watchers as w (w.id)}
					{@const r = requests.find((q) => q.id === w.id)}
					<span class="gp">
						<span class="gface blank"></span>
						<span class="gn"><b>{w.name}{w.id === clientId ? ' (you)' : ''}</b><em>{r ? `wants seat ${r.seat + 1}` : 'watching'}</em></span>
						{#if host && r}<button class="gok" on:click={() => onResolve(w.id, true)}>Approve</button><button class="gkick" on:click={() => onResolve(w.id, false)}>Deny</button>
						{:else if host && w.id !== clientId}
							{#if seats.some((x) => !x.present)}<button class="gok" class:on={giving === w.id} on:click={() => (giving = giving === w.id ? null : w.id)}>{giving === w.id ? 'Pick a seat' : 'Seat'}</button>{/if}
							<button class="gkick" on:click={() => onKick(w.id)}>Remove</button>{/if}
					</span>
				{/each}
			</div>
		{/if}
		{#if phone}
			<div class="glog">
				<div class="glh"><small>Log</small>{#if host}<button class="gundo" disabled={!canUndo} on:click={onUndo}>↶ Undo</button>{/if}</div>
				<div class="gll">{#each [...log].reverse().slice(0, 40) as e (e.id)}<p><b>{e.by}</b> {e.text}</p>{:else}<p class="none">No moves yet</p>{/each}</div>
			</div>
		{/if}
		<div class="gfoot">
			<button class="gleave" class:half={host} on:click={onLeave}>Leave</button>
			{#if host}<button class="gend" class:arm={endArm} on:click={endTap}>{endArm ? 'Tap again to end' : 'End game'}</button>{/if}
		</div>
	</div>
</div>

<style>
	.scrim { position: fixed; inset: 0; z-index: 46; display: grid; place-items: center; background: rgba(3, 8, 16, 0.5); }
	.glob { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); zoom: var(--uis, 1); width: 520px; max-height: 86vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 0 18px 18px; border-radius: 18px; color: #f5f1e8;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.98), rgba(6, 21, 38, 0.98)); border: 1px solid var(--line); border-top: 3px solid var(--brass); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.7); }
	button { font: inherit; }
	.ghead { display: flex; align-items: center; gap: 12px; margin: 0 -18px; padding: 12px 18px; border-bottom: 1px solid var(--line); }
	.ghead b { font-weight: 400; font-size: 20px; }
	.groom { font-size: 13px; color: #bccbd9; } .groom em { font-style: normal; color: var(--brass-hi); letter-spacing: 0.12em; }
	.gconn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #fcd34d; } .gconn i { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }
	.gconn.connected { color: #86efac; } .gconn.connected i { background: #22c55e; }
	.gconn.closed { color: #fca5a5; } .gconn.closed i { background: #ef4444; }
	.gx { margin-left: auto; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); background: none; color: #bccbd9; cursor: pointer; }
	.gteams { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.gteam { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; background: var(--tg); box-shadow: inset 0 3px 0 var(--tc); }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.16); --th: #ffb878; } .is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.18); --th: #9ccbff; }
	small { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-hi); }
	.gteam small { color: var(--th); }
	.gp { display: flex; align-items: center; gap: 8px; }
	.gp.away { opacity: 0.6; }
	.gface { width: 30px; height: 30px; flex: none; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--pc, #555); }
	.gface.blank { background: rgba(255, 255, 255, 0.08); box-shadow: 0 0 0 1px var(--line); }
	.gn { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.gn b { font-weight: 400; font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gn em { font-style: normal; font-size: 11px; color: #8a9fb3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.gkick, .gok { height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11px; cursor: pointer; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); }
	.gkick { color: #ffb4a8; border-color: rgba(194, 65, 47, 0.6); }
	.gok { color: #86efac; border-color: rgba(34, 197, 94, 0.6); }
	.gok:disabled { opacity: 0.4; cursor: default; }
	.gok.on, .gok.give { color: #2a1c06; border-color: #f9ebc6; background: linear-gradient(180deg, #f6e2ad, #d8b36a); }
	.greq { font-size: 11px; color: #8a9fb3; }
	.gspec { display: flex; flex-direction: column; gap: 8px; }
	/* phone: the whole screen */
	.scrim.phone { place-items: stretch; }
	.phone .glob { zoom: 1; width: auto; max-height: none; height: 100dvh; border-radius: 0; padding: 0 14px calc(14px + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.phone .ghead { flex-wrap: wrap; row-gap: 4px; }
	.phone .gteams { grid-template-columns: 1fr; gap: 8px; }
	.glog { flex: 1; min-height: 120px; display: flex; flex-direction: column; gap: 6px; }
	.glh { display: flex; align-items: center; justify-content: space-between; }
	.gundo { height: 28px; padding: 0 12px; border-radius: 999px; font-size: 12px; color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); border: 0; cursor: pointer; }
	.gundo:disabled { opacity: 0.4; cursor: default; }
	.gll { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; border-radius: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); }
	.gll p { margin: 0 0 6px; font-size: 13px; line-height: 1.3; color: #d6dee8; }
	.gll p b { font-weight: 400; color: #f4dfa8; }
	.gll .none { color: #8a9fb3; }
	.gfoot { align-self: stretch; display: flex; gap: 8px; }
	.gleave.half { flex: 0 0 calc(50% - 4px); }
	.gend { flex: 1; height: 38px; border-radius: 12px; font: inherit; font-size: 14px; cursor: pointer; color: #2a1c06; border: 1px solid #f9ebc6; background: linear-gradient(180deg, #f6e2ad, #d8b36a 50%, #b98e42); }
	.gend.arm { color: #fff; border-color: #ffb4a8; background: linear-gradient(180deg, #e5484d, #8f1d1d); }
	.gleave { flex: 1; height: 38px; border-radius: 12px; font-size: 14px; color: #fff; background: linear-gradient(180deg, #c2412f, #8f2a1c); border: 0; cursor: pointer; }
</style>
