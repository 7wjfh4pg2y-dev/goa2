<script lang="ts">
	import type { Readable } from 'svelte/store';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import { heroById } from '$lib/heroes';
	import {
		colorHex, movePiece, nextTurn, prevTurn,
		type MatchState, type Player, type MatchSession, type Team, type ConnStatus
	} from '$lib/match';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let room: string;
	export let onLeave: () => void;

	const status = session.status;

	const nameOf = (id: string) => $players.find((p) => p.id === id)?.name ?? 'Player';
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

	// pieces → BoardCanvas shape (player-coloured disc, hero initial as label)
	$: boardPieces = Object.values($ms.pieces).map((p) => ({
		id: p.id,
		hex: p.hex,
		team: p.team,
		label: p.hero ? (heroById(p.hero)?.name?.[0]?.toUpperCase() ?? '?') : (p.label ?? ''),
		color: p.color ? colorHex(p.color) : undefined
	}));

	function move(id: string, hex: string) {
		const p = $ms.pieces[id];
		const label = p?.hero ? heroById(p.hero)?.name ?? 'a piece' : 'a piece';
		session.act(`moved ${label}`, movePiece($ms, id, hex));
	}
	function adjLife(team: Team, d: number) {
		const cur = $ms.life[team];
		const next = clamp(cur + d, 0, 20);
		if (next !== cur) session.act(`${team === 'orange' ? 'Orange' : 'Blue'} Life ${cur} → ${next}`, { life: { ...$ms.life, [team]: next } });
	}
	function adjWaves(d: number) {
		const next = clamp($ms.waves + d, 0, 12);
		if (next !== $ms.waves) session.act(`Waves ${$ms.waves} → ${next}`, { waves: next });
	}
	function stepTurn(dir: 1 | -1) {
		const patch = dir === 1 ? nextTurn($ms) : prevTurn($ms);
		const round = patch.round ?? $ms.round;
		const turn = patch.turn ?? $ms.turn;
		session.act(`Round ${round} · Turn ${turn}`, patch);
	}
	function flipTie() {
		const next: Team = $ms.tieBreaker === 'orange' ? 'blue' : 'orange';
		session.act(`Tie-breaker → ${next === 'orange' ? 'Orange' : 'Blue'}`, { tieBreaker: next });
	}

	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';

	let hudOpen = true;
	let logOpen = true;
	$: log = $ms.log ?? [];
	const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<div class="gamewrap">
	<BoardCanvas map={$ms.map ?? {}} interactive={true} pieces={boardPieces} onMovePiece={move} />

	<!-- top bar -->
	<div class="bar">
		<button class="gbtn" on:click={onLeave}>← Leave</button>
		<div class="mid">
			<div class="ctl">
				<span class="lbl">Round {$ms.round} · Turn {$ms.turn}</span>
				<button class="mini" on:click={() => stepTurn(-1)} title="Previous turn">◀</button>
				<button class="mini" on:click={() => stepTurn(1)} title="Next turn">▶</button>
			</div>
			<div class="ctl">
				<span class="lbl">Waves</span>
				<button class="mini" on:click={() => adjWaves(-1)}>−</button>
				<span class="val">{$ms.waves}</span>
				<button class="mini" on:click={() => adjWaves(1)}>+</button>
			</div>
			<button class="ctl coin" on:click={flipTie} title="Flip the tie-breaker">
				<span class="cdotc {$ms.tieBreaker}"></span>Tie-breaker: {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'}
			</button>
		</div>
		<div class="right">
			<span class="conn {$status}" title="Connection"><span class="cdot"></span>{connLabel($status)}</span>
			<span class="mapname">{$ms.map?.name ?? 'Board'}</span>
			<span class="rc mono">{room}</span>
			<button class="gbtn sm" class:on={hudOpen} on:click={() => (hudOpen = !hudOpen)} title="Toggle counters">HUD</button>
		</div>
	</div>

	{#if hudOpen}
		<!-- team Life panels in the corners -->
		<div class="life orange">
			<span class="team">Orange</span>
			<div class="row"><button class="mini" on:click={() => adjLife('orange', -1)}>−</button><span class="big">{$ms.life.orange}</span><button class="mini" on:click={() => adjLife('orange', 1)}>+</button></div>
			<span class="cap">Life</span>
		</div>
		<div class="life blue">
			<span class="team">Blue</span>
			<div class="row"><button class="mini" on:click={() => adjLife('blue', -1)}>−</button><span class="big">{$ms.life.blue}</span><button class="mini" on:click={() => adjLife('blue', 1)}>+</button></div>
			<span class="cap">Life</span>
		</div>
	{/if}

	<!-- activity log -->
	<div class="logpanel" class:closed={!logOpen}>
		<button class="loghead" on:click={() => (logOpen = !logOpen)}>Activity {logOpen ? '▾' : '▸'}</button>
		{#if logOpen}
			<div class="logbody">
				{#each log.slice(-12) as e (e.id)}
					<div class="logline"><span class="lt">{hhmm(e.at)}</span> <b>{e.by}</b> {e.text}</div>
				{:else}
					<div class="logempty">No moves yet.</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.gamewrap { position: fixed; inset: 0; background: #0b0f17; color: #f1f5f9; }
	.bar { position: absolute; top: 0; left: 0; right: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: linear-gradient(180deg, rgba(9, 13, 22, 0.8), transparent); pointer-events: none; }
	.bar > * { pointer-events: auto; }
	.gbtn { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.5); color: #e5e7eb; border-radius: 10px; padding: 0.45rem 0.9rem; cursor: pointer; font-weight: 600; }
	.gbtn:hover { background: rgba(0, 0, 0, 0.7); }
	.gbtn.sm { padding: 0.4rem 0.7rem; font-size: 0.82rem; }
	.gbtn.sm.on { border-color: #f59e0b; color: #fcd34d; }
	.mid { display: flex; align-items: center; gap: 10px; background: rgba(9, 13, 22, 0.6); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 5px 8px; }
	.ctl { display: flex; align-items: center; gap: 6px; }
	.ctl .lbl { font-size: 0.85rem; font-weight: 600; }
	.ctl .val { min-width: 1.2rem; text-align: center; font-variant-numeric: tabular-nums; font-weight: 700; }
	.coin { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); border-radius: 999px; padding: 0.3rem 0.7rem; color: #e5e7eb; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
	.cdotc { width: 0.6rem; height: 0.6rem; border-radius: 50%; display: inline-block; }
	.cdotc.orange { background: #ef7d22; } .cdotc.blue { background: #2f7fe6; }
	.mini { width: 1.5rem; height: 1.5rem; border-radius: 7px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; cursor: pointer; font-weight: 700; line-height: 1; }
	.mini:hover { background: rgba(255, 255, 255, 0.14); }
	.right { display: flex; align-items: center; gap: 10px; }
	.mapname { font-family: 'Modesto Poster', serif; font-size: 1.1rem; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7); }
	.rc { color: #94a3b8; font-size: 0.78rem; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 600; color: #94a3b8; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; } .conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; } .conn.closed .cdot { background: #ef4444; }

	.life { position: absolute; top: 64px; z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 14px; border-radius: 14px; background: rgba(9, 13, 22, 0.66); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12); }
	.life.orange { left: 14px; border-top: 3px solid #ef7d22; }
	.life.blue { right: 14px; border-top: 3px solid #2f7fe6; }
	.life .team { font-family: 'Modesto Poster', serif; font-size: 0.95rem; }
	.life.orange .team { color: #ef9a5a; } .life.blue .team { color: #6ea8f0; }
	.life .row { display: flex; align-items: center; gap: 10px; }
	.life .big { font-size: 2rem; font-weight: 800; font-variant-numeric: tabular-nums; min-width: 2rem; text-align: center; }
	.life .cap { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; }

	.logpanel { position: absolute; bottom: 14px; right: 14px; z-index: 5; width: 260px; background: rgba(9, 13, 22, 0.72); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; overflow: hidden; }
	.logpanel.closed { width: auto; }
	.loghead { width: 100%; text-align: left; background: rgba(255, 255, 255, 0.05); border: none; color: #e5e7eb; padding: 6px 12px; cursor: pointer; font-weight: 700; font-size: 0.82rem; }
	.logbody { max-height: 200px; overflow-y: auto; padding: 6px 12px 8px; display: flex; flex-direction: column; gap: 3px; }
	.logline { font-size: 0.78rem; color: #cbd5e1; }
	.logline .lt { color: #64748b; font-variant-numeric: tabular-nums; margin-right: 3px; }
	.logline b { color: #f1f5f9; }
	.logempty { font-size: 0.78rem; color: #64748b; }
</style>
