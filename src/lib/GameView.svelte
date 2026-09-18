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
	let logOpen = true;
	$: lifeMax = $ms.lifeMax || ($ms.lifeTok?.orange?.length ?? 8);

	// real game art for the HUD (life-counter medallions + tie-breaker token)
	const art = import.meta.glob('./cards/images/{life_counter,tiebreaker}_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const lifeArt = (t: Team, side: 'front' | 'back') => art[`./cards/images/life_counter_${t}_${side}.png`];
	const tieArt = (t: Team) => art[`./cards/images/tiebreaker_${t}.png`];
	// waves = the shared minion waves; no dedicated counter art in the lib, so we
	// use the minion sprite as the wave token.
	const minionArt = import.meta.glob('./images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const waveIcon = minionArt['./images/minions/orange_melee.png'];

	// per-token flip animation (like the tie-breaker), keyed per token
	let flips: Record<string, boolean> = {};
	function flip(key: string) {
		flips = { ...flips, [key]: false };
		requestAnimationFrame(() => {
			flips = { ...flips, [key]: true };
			setTimeout(() => (flips = { ...flips, [key]: false }), 450);
		});
	}

	// Each token toggles independently: click a token to flip it full ↔ spent.
	function toggleLife(team: Team, i: number) {
		const arr = [...($ms.lifeTok?.[team] ?? [])];
		arr[i] = !arr[i];
		const count = arr.filter(Boolean).length;
		flip(`l${team}${i}`);
		session.act(`${team === 'orange' ? 'Orange' : 'Blue'} Life ${$ms.life[team]} → ${count}`,
			{ lifeTok: { ...$ms.lifeTok, [team]: arr }, life: { ...$ms.life, [team]: count } });
	}
	function toggleWave(i: number) {
		const arr = [...($ms.waveTok ?? [])];
		arr[i] = !arr[i];
		const count = arr.filter(Boolean).length;
		flip(`w${i}`);
		session.act(`Waves ${$ms.waves} → ${count}`, { waveTok: arr, waves: count });
	}

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
	function stepTurn(dir: 1 | -1) {
		const patch = dir === 1 ? nextTurn($ms) : prevTurn($ms);
		session.act(`Round ${patch.round ?? $ms.round} · Turn ${patch.turn ?? $ms.turn}`, patch);
	}
	function stepRound(dir: 1 | -1) {
		const round = Math.max(1, $ms.round + dir);
		if (round !== $ms.round) session.act(`Round → ${round}`, { round });
	}
	let tieFlip = false;
	function flipTie() {
		const next: Team = $ms.tieBreaker === 'orange' ? 'blue' : 'orange';
		tieFlip = false; // restart the flip even on rapid re-clicks
		requestAnimationFrame(() => { tieFlip = true; setTimeout(() => (tieFlip = false), 450); });
		session.act(`Tie-breaker → ${next === 'orange' ? 'Orange' : 'Blue'}`, { tieBreaker: next });
	}

	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';

	let confirmLeave = false;
	$: log = $ms.log ?? [];
	const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && confirmLeave && (confirmLeave = false)} />

<div class="gamewrap">
	<div class="ocean"></div>
	<BoardCanvas bind:this={board} map={$ms.map ?? {}} rotation={orientation} interactive={true} pieces={boardPieces} onMovePiece={move} />

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

	<!-- room / connection (top-left corner) -->
	<div class="corner">
		<span class="rc mono">{room}</span>
		<span class="conn {$status}"><span class="cdot"></span>{connLabel($status)}</span>
	</div>

	<!-- game HUD: right-side panel -->
	<div class="hud">
		<div class="mapname">{$ms.map?.name ?? 'Board'}</div>

		<div class="hsec rt">
			<div class="rline">
				<button class="mini" on:click={() => stepRound(-1)} title="Previous round">◀</button>
				<span class="rv">Round {$ms.round}</span>
				<button class="mini" on:click={() => stepRound(1)} title="Next round">▶</button>
			</div>
			<div class="rline">
				<button class="mini" on:click={() => stepTurn(-1)} title="Previous turn">◀</button>
				<span class="rv">Turn {$ms.turn}</span>
				<button class="mini" on:click={() => stepTurn(1)} title="Next turn">▶</button>
			</div>
		</div>

		<div class="hsec">
			<div class="slabel"><span>Waves</span><span class="cnt">{$ms.waves}</span></div>
			<div class="wtoks">
				{#each $ms.waveTok ?? [] as full, i}
					<button class="wtok" class:dep={!full} class:flip={flips[`w${i}`]}
						style="background-image:url({waveIcon})" on:click={() => toggleWave(i)}
						title="Wave token — click to spend / restore"></button>
				{/each}
			</div>
		</div>

		<!-- team Life: one token per starting Life; each toggles full ↔ spent -->
		<div class="hsec life orange">
			<div class="slabel"><span class="tn">Orange</span><span class="tc">{$ms.life.orange}<small>/{lifeMax}</small></span></div>
			<div class="tokens">
				{#each $ms.lifeTok?.orange ?? [] as full, i}
					<button class="ltok" class:dep={!full} class:flip={flips[`lorange${i}`]}
						style="background-image:url({lifeArt('orange', full ? 'front' : 'back')})"
						on:click={() => toggleLife('orange', i)} title="Orange Life token — click to spend / restore"></button>
				{/each}
			</div>
		</div>
		<div class="hsec life blue">
			<div class="slabel"><span class="tn">Blue</span><span class="tc">{$ms.life.blue}<small>/{lifeMax}</small></span></div>
			<div class="tokens">
				{#each $ms.lifeTok?.blue ?? [] as full, i}
					<button class="ltok" class:dep={!full} class:flip={flips[`lblue${i}`]}
						style="background-image:url({lifeArt('blue', full ? 'front' : 'back')})"
						on:click={() => toggleLife('blue', i)} title="Blue Life token — click to spend / restore"></button>
				{/each}
			</div>
		</div>

		<button class="tiebtn {$ms.tieBreaker}" on:click={flipTie} title="Flip the tie-breaker — {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'} breaks ties">
			<span class="coin"><img src={tieArt($ms.tieBreaker)} class:flip={tieFlip} alt="" /></span>
			<span>Tie-breaker: {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'}</span>
		</button>

		<!-- activity log fills the space between the tie-breaker and the controls; retractable -->
		<div class="logpanel" class:collapsed={!logOpen}>
			<button class="loghead" on:click={() => (logOpen = !logOpen)} title={logOpen ? 'Hide activity' : 'Show activity'}>
				<span>Activity</span><span class="chev">{logOpen ? '▾' : '▸'}</span>
			</button>
			{#if logOpen}
				<div class="logbody">
					{#each log.slice(-40) as e (e.id)}
						<div class="logline" title={hhmm(e.at)}><b>{e.by}</b> {e.text}</div>
					{:else}
						<div class="logempty">No moves yet.</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- view controls, docked at the bottom of the HUD -->
		<div class="viewctl">
			<button class="vbtn" on:click={() => board?.zoomBtn(1.2)} title="Zoom in">＋</button>
			<button class="vbtn" on:click={() => board?.zoomBtn(1 / 1.2)} title="Zoom out">−</button>
			<button class="vbtn" on:click={() => board?.rotateBy(-60)} title="Rotate counter-clockwise">⟲</button>
			<button class="vbtn" on:click={() => board?.rotateBy(60)} title="Rotate clockwise">⟳</button>
			<button class="vbtn" on:click={() => board?.reset()} title="Recenter">⤾</button>
			<button class="vbtn leave" on:click={() => (confirmLeave = true)} title="Leave game">⎋</button>
		</div>
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

	.viewctl { display: flex; gap: 5px; margin-top: auto; padding-top: 4px; }
	.vbtn { flex: 1; height: 2rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; cursor: pointer; font-size: 1rem; line-height: 1; }
	.vbtn:hover { background: rgba(255, 255, 255, 0.16); }
	.vbtn.leave { border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
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

	/* room / connection cluster, tucked in the top-left corner */
	.corner { position: absolute; top: 10px; right: 14px; z-index: 6; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8); }
	.rc { color: #94a3b8; font-size: 0.78rem; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
	.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600; color: #94a3b8; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; } .conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; } .conn.closed .cdot { background: #ef4444; }

	/* left-side HUD panel — tightened */
	.hud { position: absolute; top: 12px; left: 12px; bottom: 12px; z-index: 6; width: 194px; display: flex; flex-direction: column; gap: 6px;
		overflow-y: auto; background: rgba(9, 13, 22, 0.74); backdrop-filter: blur(8px); border: 1px solid rgba(199, 154, 78, 0.4);
		border-radius: 12px; padding: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 26px rgba(199, 154, 78, 0.06); }
	.hud .mapname { font-family: 'Modesto Poster', serif; font-size: 1.02rem; letter-spacing: 0.03em; color: #f6ead2; text-align: center; }

	.hsec { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 9px;
		background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); }
	.hsec.rt { gap: 4px; }
	.rline { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
	.rline .rv { font-weight: 700; font-size: 0.82rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.hsec.life.orange { border-left: 3px solid #ef7d22; } .hsec.life.blue { border-left: 3px solid #2f7fe6; }

	.slabel { display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
		font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: #93a3b8; }
	.slabel .cnt { color: #f1f5f9; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
	.slabel .tn { font-family: 'Modesto Poster', serif; font-size: 0.9rem; letter-spacing: 0.02em; text-transform: none; }
	.orange .tn { color: #ef9a5a; } .blue .tn { color: #6ea8f0; }
	.slabel .tc { font-weight: 800; font-variant-numeric: tabular-nums; font-size: 0.9rem; color: #f1f5f9; }
	.slabel .tc small { color: #94a3b8; font-weight: 600; font-size: 0.7rem; }

	.tokens { display: flex; gap: 2px; flex-wrap: wrap; max-width: 158px; } /* 5 life tokens per row (30px + 2 gap) */
	.ltok { width: 30px; height: 29px; padding: 0; border: none; background: transparent no-repeat center / contain; cursor: pointer;
		perspective: 80px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55)); transition: transform 0.1s, filter 0.15s, opacity 0.15s; }
	.ltok:hover { transform: translateY(-2px) scale(1.1); }
	.ltok.dep { opacity: 0.85; filter: grayscale(0.35) brightness(0.72) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)); }
	.ltok.dep:hover { opacity: 1; filter: grayscale(0.15) brightness(0.9); }
	.ltok.flip { animation: coinflip 0.45s ease-in-out; }

	.wtoks { display: flex; gap: 2px; flex-wrap: wrap; max-width: 156px; } /* 7 wave tokens per row (20px + 2 gap = 152, with slack) */
	.wtok { width: 20px; height: 20px; padding: 0; border: none; border-radius: 50%; cursor: pointer;
		background: rgba(0, 0, 0, 0.35) no-repeat center / 88%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); transition: transform 0.1s, filter 0.15s, opacity 0.15s; }
	.wtok:hover { transform: translateY(-2px) scale(1.12); }
	.wtok.dep { opacity: 0.55; filter: grayscale(0.9) brightness(0.5); }
	.wtok.dep:hover { opacity: 0.8; filter: grayscale(0.5) brightness(0.7); }
	.wtok.flip { animation: coinflip 0.45s ease-in-out; }

	.tiebtn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.05); border-radius: 9px; padding: 4px 8px; color: #e5e7eb; cursor: pointer; font-size: 0.76rem; font-weight: 600; }
	.tiebtn .coin { width: 1.5rem; height: 1.5rem; perspective: 60px; flex: none; }
	.tiebtn .coin img { width: 100%; height: 100%; display: block; }
	.tiebtn .coin img.flip { animation: coinflip 0.45s ease-in-out; }
	@keyframes coinflip { 0% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }
	.tiebtn.orange { box-shadow: inset 0 0 14px rgba(239, 125, 34, 0.3); border-color: rgba(239, 125, 34, 0.4); }
	.tiebtn.blue { box-shadow: inset 0 0 14px rgba(47, 127, 230, 0.3); border-color: rgba(47, 127, 230, 0.4); }
	.mini { width: 1.35rem; height: 1.35rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; cursor: pointer; font-weight: 700; line-height: 1; font-size: 0.75rem; flex: none; }
	.mini:hover { background: rgba(255, 255, 255, 0.16); }

	/* activity log lives inside the HUD, filling the gap above the controls; retractable */
	.logpanel { flex: 1; min-height: 56px; display: flex; flex-direction: column; overflow: hidden;
		border-radius: 9px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); }
	.logpanel.collapsed { flex: none; min-height: 0; }
	.loghead { display: flex; align-items: center; justify-content: space-between; width: 100%; border: none; cursor: pointer;
		padding: 5px 8px; background: rgba(255, 255, 255, 0.04); color: #93a3b8; font-weight: 700; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; }
	.loghead:hover { background: rgba(255, 255, 255, 0.08); }
	.loghead .chev { letter-spacing: 0; }
	.logbody { flex: 1; overflow-y: auto; padding: 5px 8px; display: flex; flex-direction: column; gap: 3px; }
	.logline { font-size: 0.72rem; color: #cbd5e1; line-height: 1.3; }
	.logline b { color: #f1f5f9; }
	.logempty { font-size: 0.72rem; color: #64748b; }
</style>
