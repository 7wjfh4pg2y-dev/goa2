<script lang="ts">
	// The game menu (desktop / tablet), opened from the ☰ button: the room, who sits where, the board
	// options, saved views, minion spawns and the host's push override, and the way out.
	import TopIcon from './TopIcon.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroById } from '$lib/heroes';
	import { teamAdj } from '$lib/teams';
	import type { BoardLook, ConnStatus, Player, Team } from '$lib/match';

	type Role = 'melee' | 'ranged' | 'heavy';
	export let room: string;
	export let mapName: string;
	export let status: ConnStatus;
	export let host = false; // am I the host
	export let hostId = '';
	export let me: string;
	export let mySeat = -1;
	export let seats: Array<{ seat: number; id: string; name: string; hero: string; team: Team | null; present: boolean; color: string }>;
	export let requests: Array<{ id: string; name: string; seat: number }> = [];
	export let myRequestSeat = -1;
	export let spectators: Player[] = [];
	export let look: BoardLook;
	export let glow: boolean;
	export let fx: boolean;
	/** the saved views: what each holds ("45° · 1.2×"), null = empty */
	export let views: Array<string | null> = [];
	export let pushArm: Team | null = null;
	export let won = false;
	export let onClose: () => void;
	export let onLeave: () => void;
	export let onKick: (id: string) => void;
	export let onRequestSeat: (seat: number) => void;
	export let onResolveSeat: (id: string, ok: boolean) => void;
	export let onLook: (v: BoardLook) => void;
	export let onGlow: (v: boolean) => void;
	export let onFx: (v: boolean) => void;
	export let onGoView: (i: number) => void;
	export let onSaveView: (i: number) => void;
	export let onSpawn: (t: Team, r: Role) => void;
	export let onPush: (t: Team) => void;

	const minionArt = import.meta.glob('../images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const TEAMS: Team[] = ['orange', 'blue'];
	const ROLES: Role[] = ['melee', 'ranged', 'heavy'];
	const CONN: Record<string, string> = { connecting: 'Connecting…', reconnecting: 'Reconnecting…', closed: 'Disconnected' };
</script>

<div class="menuscrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="menu" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1">
		<div class="head">
			<span class="ttl"><span class="t-label">{mapName}</span><b>Room {room}</b></span>
			{#if CONN[status]}<span class="conn">{CONN[status]}</span>{/if}
			<button class="pbtn lg x" on:click={onClose} aria-label="Close"><TopIcon name="x" /></button>
		</div>

		<div class="colm">
			<span class="t-label">Players</span>
			{#each requests as r (r.id)}
				{#if host}
					<div class="seatrow req">
						<span class="who"><b>{r.name}</b><small>Seat {r.seat + 1}</small></span>
						<button class="pbtn yes" on:click={() => onResolveSeat(r.id, true)}>Approve</button>
						<button class="pbtn" on:click={() => onResolveSeat(r.id, false)}>Deny</button>
					</div>
				{/if}
			{/each}
			{#each seats as s (s.seat)}
				<div class="seatrow is-{s.team}" class:away={!s.present}>
					{#if s.hero}<PlayerIcon hero={s.hero} team={s.team ?? 'orange'} color={s.color} size="38px" />{:else}<span class="nohero"></span>{/if}
					<span class="who"><b>{s.name || 'Open'}</b><small>{s.hero ? heroById(s.hero)?.name ?? '' : `Seat ${s.seat + 1}`}</small></span>
					{#if s.id && s.id === hostId}<span class="tag">Host</span>{/if}
					{#if host && s.present && s.id !== me}<button class="pbtn x kick" on:click={() => onKick(s.id)} title="Kick" aria-label="Kick {s.name}"><TopIcon name="x" /></button>{/if}
					{#if mySeat < 0 && !s.present}
						{#if myRequestSeat === s.seat}<span class="tag">Asked</span>
						{:else}<button class="pbtn" on:click={() => onRequestSeat(s.seat)} disabled={myRequestSeat >= 0}>Sit</button>{/if}
					{/if}
					{#if s.id}<i class="here" class:off={!s.present} title={s.present ? 'Here' : 'Away'}></i>{/if}
				</div>
			{/each}
			{#if spectators.length}
				<span class="t-label">Watching</span>
				<div class="specs">
					{#each spectators as sp (sp.id)}
						<span class="spec">{sp.name}{#if host && sp.id !== me}<button on:click={() => onKick(sp.id)} aria-label="Remove {sp.name}"><TopIcon name="x" /></button>{/if}</span>
					{/each}
				</div>
			{/if}
			<button class="pbtn lg bad leave" on:click={onLeave}><TopIcon name="door" />Leave</button>
		</div>

		<div class="colm">
			<span class="t-label">Board</span>
			<div class="optrow">Map
				<span class="seg" class:is-readonly={!host}>
					<button class="seg-opt" class:is-on={look === 'island'} disabled={!host} on:click={() => onLook('island')}>Island</button>
					<button class="seg-opt" class:is-on={look === 'classic'} disabled={!host} on:click={() => onLook('classic')}>Classic</button>
				</span>
			</div>
			<div class="optrow">Zone outline
				<button class="switch" class:is-on={glow && look === 'island'} role="switch" aria-checked={glow} aria-label="Battle zone outline" disabled={!host || look !== 'island'} on:click={() => onGlow(!glow)}><i></i></button>
			</div>
			<div class="optrow">Effects
				<button class="switch" class:is-on={fx} role="switch" aria-checked={fx} aria-label="Moving effects" disabled={!host} on:click={() => onFx(!fx)}><i></i></button>
			</div>
			<span class="t-label">View</span>
			<div class="views">
				{#each views as v, i}
					<span class="vcell">
						<button class="pbtn lg" disabled={!v} on:click={() => onGoView(i)} title={v ?? 'Empty'}>View {i + 1}</button>
						<button class="pbtn lg ic" on:click={() => onSaveView(i)} title="Save the current view" aria-label="Save view {i + 1}"><TopIcon name="save" /></button>
					</span>
				{/each}
			</div>
		</div>

		<div class="colm">
			<span class="t-label">Spawn</span>
			<div class="spawns">
				{#each TEAMS as t}
					{#each ROLES as r}
						<button class="spawn is-{t}" on:click={() => onSpawn(t, r)} title="{teamAdj(t)} {r} minion" aria-label="Spawn {teamAdj(t)} {r} minion"><img src={minionArt[`../images/minions/${t}_${r}.png`]} alt="" /></button>
					{/each}
				{/each}
			</div>
			{#if host && !won}
				<span class="t-label">Host</span>
				<div class="pushes">
					{#each TEAMS as t}
						<button class="pbtn lg is-{t}" class:arm={pushArm === t} on:click={() => onPush(t)}>{pushArm === t ? 'Confirm?' : `${teamAdj(t)} push`}</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.menuscrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3, 11, 21, 0.66); }
	.menu { width: min(1040px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow-y: auto; box-sizing: border-box;
		display: grid; grid-template-columns: 300px minmax(0, 1fr) 286px; gap: 20px 40px; padding: 20px 28px 28px;
		border-radius: var(--r-lg); background: var(--glass); border: 1px solid var(--brass-line); box-shadow: var(--sh-2); font-size: 18px; }
	.head { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding-bottom: 16px; border-bottom: 1px solid var(--brass-faint); }
	.ttl { display: flex; flex-direction: column; gap: 6px; margin-right: auto; }
	.ttl b { font-weight: 400; font-size: 34px; line-height: 1; }
	.conn { font-size: 15px; color: #fcd34d; }
	.colm { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
	.colm > .t-label:not(:first-child) { margin-top: 12px; }

	.seatrow { display: flex; align-items: center; gap: 10px; height: 56px; padding: 0 12px 0 8px; border-radius: var(--r-md); background: var(--well); border-left: 3px solid var(--tc, var(--brass)); }
	.seatrow.away .who { opacity: 0.55; }
	.who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
	.who b { font-weight: 400; font-size: 18px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.who small { font-size: 14px; line-height: 1; color: var(--ink-2); white-space: nowrap; }
	.kick:hover { color: var(--danger-hi); }
	.nohero { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 1.5px dashed rgba(255, 255, 255, 0.25); }
	.here { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #2ecc71; }
	.here.off { background: #f0a35a; }
	.specs { display: flex; flex-wrap: wrap; gap: 6px; }
	.spec { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border-radius: 15px; font-size: 15px; background: var(--well); border: 1px solid var(--hair); }
	.spec button { display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--danger-hi); font-size: 14px; }
	.colm > .leave { align-self: flex-start; margin-top: auto; }

	.optrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; white-space: nowrap; }
	.optrow .seg-opt { min-height: 36px; padding: 0 14px; font-size: 17px; }
	.optrow .seg-opt:disabled { cursor: default; }
	.switch { position: relative; flex: none; width: 54px; height: 30px; padding: 0; border-radius: 15px; background: var(--well); border: 1px solid var(--hair); }
	.switch i { position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--ink-3); }
	.switch.is-on { background: var(--brass-fill); border-color: #8a6a2c; }
	.switch.is-on i { left: 27px; background: var(--ink-dark); }
	.switch:disabled { cursor: default; opacity: 0.6; }
	.views { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.vcell { display: flex; }
	.vcell .pbtn:first-child { flex: 1; min-width: 0; justify-content: center; padding: 0 6px; border-radius: 10px 0 0 10px; }
	.vcell .ic { width: 36px; padding: 0; justify-content: center; border-left: 0; border-radius: 0 10px 10px 0; color: var(--brass); }

	.spawns { display: grid; grid-template-columns: repeat(3, 44px); gap: 6px; }
	.spawn { width: 44px; height: 44px; padding: 0; border-radius: 10px; display: grid; place-items: center; background: var(--well); border: 1px solid var(--tc-line); }
	.spawn:hover { border-color: var(--tc-hi); }
	.spawn img { width: 34px; height: 34px; object-fit: contain; }
	.pushes { display: flex; gap: 6px; }
	.pushes .pbtn { flex: 1; min-width: 0; justify-content: center; padding: 0 4px; border-color: var(--tc-line); color: var(--tc-hi); }
	.pushes .pbtn.arm { color: #fff; border-color: var(--danger); background: rgba(229, 72, 77, 0.3); }
</style>
