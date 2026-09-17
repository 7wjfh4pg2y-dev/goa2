<script lang="ts">
	import type { Readable } from 'svelte/store';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import { heroById } from '$lib/heroes';
	import { zoneName } from '$lib/zones';
	import {
		colorHex, movePiece, nextTurn, prevTurn, teamForSeat,
		type MatchState, type Player, type MatchSession, type Team, type ConnStatus
	} from '$lib/match';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let room: string;
	export let onLeave: () => void;

	const status = session.status;
	const nameOf = (id: string) => $players.find((p) => p.id === id)?.name ?? 'Player';
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

	// orient the board so the local player's base sits at the bottom
	$: mySeat = $players.find((p) => p.id === clientId)?.seat ?? -1;
	$: myTeam = teamForSeat(mySeat, $ms.seats);
	$: orientation = myTeam === 'orange' ? 180 : 0;

	$: boardPieces = Object.values($ms.pieces).map((p) => ({
		id: p.id, hex: p.hex, team: p.team,
		label: p.hero ? (heroById(p.hero)?.name?.[0]?.toUpperCase() ?? '?') : (p.label ?? ''),
		color: p.color ? colorHex(p.color) : undefined
	}));

	let board: BoardCanvas;

	function move(id: string, hex: string) {
		const p = $ms.pieces[id];
		const label = p?.hero ? heroById(p.hero)?.name ?? 'a piece' : 'a piece';
		session.act(`moved ${label} → ${zoneName($ms.map, hex)}`, movePiece($ms, id, hex));
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
		session.act(`Round ${patch.round ?? $ms.round} · Turn ${patch.turn ?? $ms.turn}`, patch);
	}
	function flipTie() {
		const next: Team = $ms.tieBreaker === 'orange' ? 'blue' : 'orange';
		session.act(`Tie-breaker → ${next === 'orange' ? 'Orange' : 'Blue'}`, { tieBreaker: next });
	}

	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';

	let hudOpen = true;
	let logOpen = true;
	let confirmLeave = false;
	$: log = $ms.log ?? [];
	const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && confirmLeave && (confirmLeave = false)} />

<div class="gamewrap">
	<div class="ocean"></div>
	<BoardCanvas bind:this={board} map={$ms.map ?? {}} rotation={orientation} interactive={true} pieces={boardPieces} onMovePiece={move} />

	<!-- view controls (bottom-left): zoom, rotate both ways, recenter -->
	<div class="viewctl">
		<button class="vbtn" on:click={() => board?.zoomBtn(1.2)} title="Zoom in">＋</button>
		<button class="vbtn" on:click={() => board?.zoomBtn(1 / 1.2)} title="Zoom out">−</button>
		<button class="vbtn" on:click={() => board?.rotateBy(-60)} title="Rotate counter-clockwise">⟲</button>
		<button class="vbtn" on:click={() => board?.rotateBy(60)} title="Rotate clockwise">⟳</button>
		<button class="vbtn" on:click={() => board?.reset()} title="Recenter">⤾</button>
		<button class="vbtn leave" on:click={() => (confirmLeave = true)} title="Leave game">⎋</button>
	</div>

	{#if confirmLeave}
		<div class="modal-scrim" on:click={() => (confirmLeave = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<h3>Leave the game?</h3>
				<p>You'll drop back to the menu. You can rejoin with the room code while the game is live.</p>
				<div class="mrow">
					<button class="mcancel" on:click={() => (confirmLeave = false)}>Stay</button>
					<button class="mleave" on:click={onLeave}>Leave</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- game HUD (right) -->
	<button class="hudtab" on:click={() => (hudOpen = !hudOpen)} title="Toggle HUD">{hudOpen ? '▶' : '◀'}</button>
	{#if hudOpen}
		<div class="hud">
			<div class="hhead">
				<span class="mapname">{$ms.map?.name ?? 'Board'}</span>
				<span class="rc mono">{room}</span>
				<span class="conn {$status}"><span class="cdot"></span>{connLabel($status)}</span>
			</div>
			<div class="hpanel">
				<div class="hrow">
					<button class="mini" on:click={() => stepTurn(-1)} title="Previous turn">◀</button>
					<span class="lbl">Round {$ms.round} · Turn {$ms.turn}</span>
					<button class="mini" on:click={() => stepTurn(1)} title="Next turn">▶</button>
				</div>
				<div class="hrow">
					<span class="lbl">Waves</span>
					<button class="mini" on:click={() => adjWaves(-1)}>−</button>
					<span class="val">{$ms.waves}</span>
					<button class="mini" on:click={() => adjWaves(1)}>+</button>
				</div>
				<button class="coin" on:click={flipTie} title="Flip the tie-breaker">
					<span class="cdotc {$ms.tieBreaker}"></span>Tie-breaker: {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'}
				</button>
			</div>
			<div class="lives">
				<div class="life orange">
					<span class="team">Orange</span>
					<div class="lrow"><button class="mini" on:click={() => adjLife('orange', -1)}>−</button><span class="big">{$ms.life.orange}</span><button class="mini" on:click={() => adjLife('orange', 1)}>+</button></div>
					<span class="cap">Life</span>
				</div>
				<div class="life blue">
					<span class="team">Blue</span>
					<div class="lrow"><button class="mini" on:click={() => adjLife('blue', -1)}>−</button><span class="big">{$ms.life.blue}</span><button class="mini" on:click={() => adjLife('blue', 1)}>+</button></div>
					<span class="cap">Life</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- activity log (bottom-right) -->
	<div class="logpanel" class:closed={!logOpen}>
		<button class="loghead" on:click={() => (logOpen = !logOpen)}>Activity {logOpen ? '▾' : '▸'}</button>
		{#if logOpen}
			<div class="logbody">
				{#each log.slice(-14) as e (e.id)}
					<div class="logline"><span class="lt">{hhmm(e.at)}</span> <b>{e.by}</b> {e.text}</div>
				{:else}
					<div class="logempty">No moves yet.</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.gamewrap { position: fixed; inset: 0; color: #f1f5f9; overflow: hidden; }
	/* ocean backdrop — deep water with layered swells + moving caustics so the hex island reads as floating on sea */
	.ocean { position: absolute; inset: 0;
		background:
			radial-gradient(60% 45% at 78% 12%, rgba(52, 128, 160, 0.35), transparent 60%),
			radial-gradient(70% 60% at 20% 88%, rgba(20, 70, 110, 0.4), transparent 62%),
			radial-gradient(140% 120% at 50% -15%, #1a4a63 0%, #0c3247 38%, #071f30 70%, #04121d 100%);
	}
	.ocean::before { content: ''; position: absolute; inset: -30%;
		background:
			repeating-linear-gradient(115deg, rgba(150, 220, 245, 0.045) 0 2px, transparent 2px 26px),
			repeating-linear-gradient(160deg, rgba(120, 200, 230, 0.03) 0 3px, transparent 3px 40px);
		animation: drift 24s linear infinite; }
	.ocean::after { content: ''; position: absolute; inset: -30%;
		background: repeating-linear-gradient(200deg, rgba(90, 175, 215, 0.035) 0 2px, transparent 2px 46px);
		mix-blend-mode: screen; animation: drift2 32s linear infinite; }
	@keyframes drift { to { transform: translate(64px, -22px); } }
	@keyframes drift2 { to { transform: translate(-58px, 18px); } }

	.viewctl { position: absolute; bottom: 14px; left: 14px; z-index: 6; display: flex; flex-direction: column; gap: 6px; }
	.vbtn { width: 2.2rem; height: 2.2rem; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(9, 13, 22, 0.7); backdrop-filter: blur(6px); color: #e5e7eb; cursor: pointer; font-size: 1.1rem; line-height: 1; }
	.vbtn:hover { background: rgba(20, 28, 46, 0.85); }
	.vbtn.leave { margin-top: 6px; border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
	.vbtn.leave:hover { background: rgba(80, 20, 24, 0.7); }

	.modal-scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3, 8, 14, 0.6); backdrop-filter: blur(3px); }
	.modal { width: min(360px, 90vw); background: rgba(12, 18, 32, 0.92); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
	.modal h3 { font-family: 'Modesto Poster', serif; font-size: 1.4rem; margin: 0 0 6px; }
	.modal p { margin: 0 0 16px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.45; }
	.mrow { display: flex; gap: 10px; justify-content: flex-end; }
	.mcancel, .mleave { border-radius: 10px; padding: 0.5rem 1.1rem; cursor: pointer; font-weight: 700; border: 1px solid transparent; }
	.mcancel { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.16); color: #e5e7eb; }
	.mcancel:hover { background: rgba(255, 255, 255, 0.16); }
	.mleave { background: #dc2626; color: #fff; }
	.mleave:hover { background: #ef4444; }

	.hudtab { position: absolute; top: 12px; right: 12px; z-index: 7; width: 1.8rem; height: 1.8rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(9, 13, 22, 0.75); color: #e5e7eb; cursor: pointer; }
	.hud { position: absolute; top: 50px; right: 12px; z-index: 6; width: 220px; display: flex; flex-direction: column; gap: 10px; }
	.hhead { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8); }
	.mapname { font-family: 'Modesto Poster', serif; font-size: 1.15rem; }
	.rc { color: #94a3b8; font-size: 0.78rem; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600; color: #94a3b8; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; } .conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; } .conn.closed .cdot { background: #ef4444; }

	.hpanel { display: flex; flex-direction: column; gap: 8px; background: rgba(9, 13, 22, 0.72); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 10px; }
	.hrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.hrow .lbl { font-size: 0.85rem; font-weight: 600; }
	.hrow .val { min-width: 1.2rem; text-align: center; font-variant-numeric: tabular-nums; font-weight: 700; }
	.coin { display: flex; align-items: center; gap: 7px; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); border-radius: 999px; padding: 0.35rem 0.7rem; color: #e5e7eb; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
	.cdotc { width: 0.6rem; height: 0.6rem; border-radius: 50%; display: inline-block; }
	.cdotc.orange { background: #ef7d22; } .cdotc.blue { background: #2f7fe6; }
	.mini { width: 1.5rem; height: 1.5rem; border-radius: 7px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; cursor: pointer; font-weight: 700; line-height: 1; }
	.mini:hover { background: rgba(255, 255, 255, 0.16); }

	.lives { display: flex; gap: 10px; }
	.life { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px; border-radius: 12px; background: rgba(9, 13, 22, 0.72); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12); }
	.life.orange { border-top: 3px solid #ef7d22; }
	.life.blue { border-top: 3px solid #2f7fe6; }
	.life .team { font-family: 'Modesto Poster', serif; font-size: 0.9rem; }
	.life.orange .team { color: #ef9a5a; } .life.blue .team { color: #6ea8f0; }
	.life .lrow { display: flex; align-items: center; gap: 7px; }
	.life .big { font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums; min-width: 1.6rem; text-align: center; }
	.life .cap { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; }

	.logpanel { position: absolute; bottom: 14px; right: 14px; z-index: 6; width: 270px; background: rgba(9, 13, 22, 0.76); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; overflow: hidden; }
	.logpanel.closed { width: auto; }
	.loghead { width: 100%; text-align: left; background: rgba(255, 255, 255, 0.05); border: none; color: #e5e7eb; padding: 6px 12px; cursor: pointer; font-weight: 700; font-size: 0.82rem; }
	.logbody { max-height: 190px; overflow-y: auto; padding: 6px 12px 8px; display: flex; flex-direction: column; gap: 3px; }
	.logline { font-size: 0.78rem; color: #cbd5e1; }
	.logline .lt { color: #64748b; font-variant-numeric: tabular-nums; margin-right: 3px; }
	.logline b { color: #f1f5f9; }
	.logempty { font-size: 0.78rem; color: #64748b; }
</style>
