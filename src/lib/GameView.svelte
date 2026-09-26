<script lang="ts">
	import { afterUpdate } from 'svelte';
	import type { Readable } from 'svelte/store';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import CardLayer from '$lib/CardLayer.svelte';
	import { heroById, heroLogo } from '$lib/heroes';
	import { zoneName } from '$lib/zones';
	import { effectLabel } from '$lib/effects';
	import lifeSplit from '$lib/images/life_split.png';
	import { placeToken, moveToken, effectiveHex, MINES, tokenName, type ArmToken } from '$lib/tokens';
	import {
		colorHex, movePiece, teamForSeat, throneHex,
		type MatchState, type Player, type MatchSession, type Team, type ConnStatus
	} from '$lib/match';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let room: string;
	export let onLeave: () => void;

	const status = session.status;
	const canUndo = session.canUndo;
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
		session.act(`${team === 'orange' ? 'Orange' : 'Blue'} Life ${$ms.life[team]} → ${count}`,
			{ lifeTok: { ...$ms.lifeTok, [team]: arr }, life: { ...$ms.life, [team]: count } });
	}
	function toggleWave(i: number) {
		const arr = [...($ms.waveTok ?? [])];
		arr[i] = !arr[i];
		const count = arr.filter(Boolean).length;
		session.act(`Waves ${$ms.waves} → ${count}`, { waveTok: arr, waves: count });
	}

	// Flip animations are driven by the SHARED state: whenever a life/wave token or
	// the tie-breaker changes — whoever clicked it — every client plays the flip.
	function playTieFlip() {
		tieFlip = false; // restart the flip even on rapid re-clicks
		requestAnimationFrame(() => { tieFlip = true; setTimeout(() => (tieFlip = false), 450); });
	}
	let prevTok: { orange: boolean[]; blue: boolean[]; wave: boolean[]; tie: Team } | null = null;
	$: watchFlips($ms.lifeTok, $ms.waveTok, $ms.tieBreaker);
	function watchFlips(lifeTok: MatchState['lifeTok'] | undefined, waveTok: boolean[] | undefined, tie: Team) {
		const cur = { orange: [...(lifeTok?.orange ?? [])], blue: [...(lifeTok?.blue ?? [])], wave: [...(waveTok ?? [])], tie };
		if (prevTok) {
			const was = prevTok;
			(['orange', 'blue'] as Team[]).forEach((t) => cur[t].forEach((v, i) => { if (was[t][i] !== undefined && was[t][i] !== v) flip(`l${t}${i}`); }));
			cur.wave.forEach((v, i) => { if (was.wave[i] !== undefined && was.wave[i] !== v) flip(`w${i}`); });
			if (was.tie !== tie) playTieFlip();
		}
		prevTok = cur;
	}

	// orient the board so the local player's base sits at the bottom
	$: mySeat = $players.find((p) => p.id === clientId)?.seat ?? -1;
	$: myTeam = teamForSeat(mySeat, $ms.seats);
	$: orientation = myTeam === 'orange' ? 180 : 0;
	$: iAmHost = $ms.host === clientId;

	// ── in-game manage menu: seats, spectators, kick, seat-takeover approvals ──
	let manageOpen = false;
	$: presentIds = new Set($players.map((p) => p.id));
	$: spectators = $players.filter((p) => p.seat < 0);
	$: seatRequests = $ms.seatRequests ?? [];
	$: myRequestSeat = seatRequests.find((r) => r.id === clientId)?.seat ?? -1;
	$: seatRows = Array.from({ length: $ms.seats }, (_, seat) => {
		const owner = $ms.seatMap?.[String(seat)] ?? $players.find((p) => p.seat === seat) ?? null;
		const id = owner ? ('id' in owner ? owner.id : (owner as Player).id) : '';
		const nm = owner ? ('name' in owner ? owner.name : (owner as Player).name) : '';
		const hero = id ? ($ms.cards?.[id]?.hero ?? $ms.draft?.picks?.[id] ?? '') : '';
		return { seat, id, name: nm, hero, team: teamForSeat(seat, $ms.seats), present: !!id && presentIds.has(id) };
	});
	function kickSeat(id: string) { if (iAmHost && id) session.kick(id); }
	function requestSeat(seat: number) { session.requestSeat(seat); }
	function resolveSeat(id: string, ok: boolean) { if (iAmHost) session.resolveSeat(id, ok); }

	$: boardPieces = Object.values($ms.pieces).map((p) => ({
		id: p.id, hex: effectiveHex($ms.pieces, p), team: p.team, role: p.role, token: p.token === 'companion' ? undefined : p.token,
		// a marker riding on a hero is drawn as a small badge on that hero
		attachTo: p.attachedTo && $ms.pieces[p.attachedTo] ? p.attachedTo : undefined,
		// Min's mines: skull side up until flipped; the owner gets a tiny reminder of which is which
		mine: p.token && MINES.has(p.token) ? (p.faceDown ? 'down' : 'up') as 'down' | 'up' : undefined,
		peek: p.faceDown && p.owner === clientId ? (p.token === 'token_blast' ? 'B' : 'D') : undefined,
		// hero pieces draw the player icon (portrait); companions are letter discs
		hero: p.hero && !p.token ? p.hero : undefined,
		letter: p.token === 'companion' ? (p.label?.[0] ?? '?').toUpperCase() : undefined,
		sym: p.hero ? heroLogo(p.hero) : undefined,
		label: p.hero ? (heroById(p.hero)?.name?.[0]?.toUpperCase() ?? '?') : (p.label ?? ''),
		color: p.color ? colorHex(p.color) : undefined
	}));

	let board: BoardCanvas;
	let cardLayer: CardLayer;
	// every lingering card effect in play (switched on from a played card)
	$: activeFx = $ms.effects ?? [];
	const pColor = (pid: string) => colorHex($players.find((p) => p.id === pid)?.color ?? '');
	// area radii (set from each player's dash): centred on that player's hero, in their colour
	$: areas = Object.entries($ms.radii ?? {}).flatMap(([pid, r]) => {
		const hero = $ms.pieces?.[pid];
		return hero && r > 0 ? [{ hex: hero.hex, r, color: colorHex(hero.color ?? '') }] : [];
	});

	// gear/star throne hexes, so the board can draw them and heroes/minions spawn there
	$: thrones = [
		{ hex: throneHex($ms.map ?? null, 'orange'), team: 'orange' },
		{ hex: throneHex($ms.map ?? null, 'blue'), team: 'blue' }
	].filter((t): t is { hex: string; team: string } => !!t.hex);

	function move(id: string, hex: string) {
		const p = $ms.pieces[id];
		const label = p?.hero ? heroById(p.hero)?.name ?? 'a piece' : 'a piece';
		if (p?.kind === 'token') {
			session.act(`moved ${p.token ? tokenName(p.token) : 'a token'} → ${zoneName($ms.map, hex)}`, { pieces: moveToken($ms.pieces, id, hex) });
			return;
		}
		session.act(`moved ${label} → ${zoneName($ms.map, hex)}`, movePiece($ms, id, hex));
	}

	// ── minion spawn (temporary manual controls) + piece delete ────────────────
	let spawnTeam: Team | null = null; // which team's spawn menu is open
	const MINION_ROLES: Array<'melee' | 'ranged' | 'heavy'> = ['melee', 'ranged', 'heavy'];
	// pick a role → arm placement; the next hex tap drops the minion there.
	let pendingSpawn: { team: Team; role: 'melee' | 'ranged' | 'heavy' } | null = null;
	function armSpawn(team: Team | null, role: 'melee' | 'ranged' | 'heavy') {
		if (!team) return;
		pendingSpawn = { team, role };
		spawnTeam = null;
	}
	// a token / marker picked off the dash shelf, waiting for its hex
	let pendingToken: ArmToken | null = null;
	function armToken(t: ArmToken) { pendingSpawn = null; pendingToken = t; selPieceId = null; }
	$: if (pendingSpawn) pendingToken = null;
	$: placing = !!pendingSpawn || !!pendingToken;
	// what's held, drawn by the board as a see-through ghost under the cursor
	$: placeGhost = pendingSpawn
		? { id: '__ghost', hex: '', team: pendingSpawn.team, role: pendingSpawn.role }
		: pendingToken
			? pendingToken.token === 'companion'
				? { id: '__ghost', hex: '', team: pendingToken.team, letter: pendingToken.letter, color: colorHex(pendingToken.color ?? '') }
				: { id: '__ghost', hex: '', team: pendingToken.team, token: pendingToken.token }
			: null;
	// the hex under a held object lights up in your chosen colour
	$: myHoldColor = colorHex($players.find((p) => p.id === clientId)?.color ?? '');
	function cancelPlace() { pendingSpawn = null; pendingToken = null; }
	// board hex tapped while holding something: drop it right there
	function onBoardHex(hex: string) {
		if (pendingToken) {
			const t = pendingToken;
			const id = `tok_${t.owner}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
			const pieces = placeToken($ms.pieces, { id, hex, team: t.team, token: t.token, owner: t.owner, label: t.label, color: t.color });
			const what = t.token === 'companion' ? `deployed ${t.label}` : MINES.has(t.token) ? 'laid a mine' : `placed ${tokenName(t.token)}`;
			const on = pieces[id].attachedTo ? ` on ${heroById($ms.pieces[pieces[id].attachedTo!]?.hero ?? '')?.name ?? 'a hero'}` : ` → ${zoneName($ms.map, hex)}`;
			session.act(what + on, { pieces });
			pendingToken = null;
			return;
		}
		if (!pendingSpawn) return;
		const { team, role } = pendingSpawn;
		const id = `minion_${team}_${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
		session.act(`spawned a ${team} ${role} minion`, { pieces: { ...$ms.pieces, [id]: { id, hex, team, kind: 'minion' as const, role } } });
		pendingSpawn = null;
	}

	let selPieceId: string | null = null;
	let previewId: string | null = null; // clicking a hero token opens that player's board
	function onSelectPiece(id: string | null) {
		const pc = id ? $ms.pieces[id] : null;
		// tapping any piece (heroes included) just picks it up to move it — a
		// player's board opens from the right-hand HUD instead. Minions / tokens
		// also get the delete toolbar (heroes don't).
		if (placing) return;
		selPieceId = pc ? id : null;
	}
	$: selPiece = selPieceId ? $ms.pieces[selPieceId] : null;
	let confirmDelete = false;
	function doDelete() {
		if (!selPiece) return;
		const next = { ...$ms.pieces };
		delete next[selPiece.id];
		const what = selPiece.role ? `${selPiece.team} ${selPiece.role} minion` : (selPiece.token ? (selPiece.faceDown ? 'a mine' : tokenName(selPiece.token)) : 'a piece');
		session.act(`removed ${what}`, { pieces: next });
		confirmDelete = false; selPieceId = null;
	}
	// Min's mines: flip to reveal Blast / Dud (or back face down)
	function flipMine() {
		if (!selPiece) return;
		const up = !!selPiece.faceDown;
		session.act(up ? `flipped a mine — ${selPiece.token === 'token_blast' ? 'Blast!' : 'Dud'}` : 'turned a mine face down', { pieces: { ...$ms.pieces, [selPiece.id]: { ...selPiece, faceDown: !up } } });
	}
	$: selLabel = !selPiece ? '' : selPiece.role ? `${selPiece.team} ${selPiece.role} minion`
		: selPiece.token === 'companion' ? (selPiece.label ?? 'companion')
		: selPiece.token && MINES.has(selPiece.token) ? (selPiece.faceDown ? 'mine (face down)' : tokenName(selPiece.token))
		: selPiece.token ? tokenName(selPiece.token) : 'token';
	// the ONLY way the round / turn moves: the real card-flow advance (host-routed:
	// locks played cards into their slots, refreshes hands after turn 4). No manual
	// stepping back or forth — that was for testing and desyncs a real game.
	function advanceTurn() { session.cardAction({ kind: 'advance', pid: clientId }); }
	let tieFlip = false;
	function flipTie() {
		const next: Team = $ms.tieBreaker === 'orange' ? 'blue' : 'orange';
		session.act(`Tie-breaker → ${next === 'orange' ? 'Orange' : 'Blue'}`, { tieBreaker: next });
	}

	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';

	let confirmLeave = false;

	// ── phone layout (≤760px wide): top bar + ☰ menu instead of the left HUD ──
	let gvw = 1440;
	$: mobile = gvw <= 760;
	let menuOpen = false, lwOpen = false, goldOpen = false;
	$: myCoins = $ms.cards?.[clientId]?.coins ?? null;
	function coins(d: number) { session.cardAction({ kind: 'coins', pid: clientId, delta: d }); }
	const FX_SHORT: Record<string, string> = { 'This turn': 'Turn', 'Next turn': 'Next', 'This round': 'Round' };

	// ── saved views: 3 slots of rotation + zoom + pan, kept in this browser ─────
	// (they carry over to new games, so a player's preferred angle is one tap away)
	type SavedView = { spin: number; scale: number; panX: number; panY: number };
	const VIEWS_KEY = 'goa2-views-v1';
	let views: (SavedView | null)[] = [null, null, null];
	try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? 'null'); if (Array.isArray(v)) views = [0, 1, 2].map((i) => v[i] ?? null); } catch {}
	let viewsOpen = false;
	function saveView(i: number) {
		if (!board) return;
		views = views.map((v, k) => (k === i ? board.getView() : v));
		try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch {}
	}
	function goView(i: number) { const v = views[i]; if (v && board) board.setView(v); }
	const viewLabel = (v: SavedView) => `${Math.round(v.spin)}° · ${v.scale.toFixed(1)}×`;
	function viewsOutside(e: PointerEvent) {
		if (viewsOpen && !(e.target as Element | null)?.closest?.('.viewswrap, .mviews')) viewsOpen = false;
	}
	$: log = $ms.log ?? [];
	const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	// keep the activity log pinned to the most recent entry
	let logEl: HTMLDivElement | undefined;
	let lastLogLen = -1, lastOpen = false;
	afterUpdate(() => {
		if (logEl && (log.length !== lastLogLen || logOpen !== lastOpen)) {
			logEl.scrollTop = logEl.scrollHeight;
			lastLogLen = log.length; lastOpen = logOpen;
		}
	});
</script>

<svelte:window on:keydown={(e) => { if (e.key !== 'Escape') return; if (confirmLeave) confirmLeave = false; else { pendingSpawn = null; pendingToken = null; } }} on:pointerdown={(e) => { viewsOutside(e); if (goldOpen && !(e.target as Element | null)?.closest?.('.goldwrap')) goldOpen = false; }} bind:innerWidth={gvw} />

<div class="gamewrap" class:mob={mobile}>
	{#if pendingToken || (mobile && pendingSpawn)}
		<div class="placehint">
			{#if pendingToken}
				<span>Tap a hex to place {pendingToken.token === 'companion' ? pendingToken.label : tokenName(pendingToken.token)}{MINES.has(pendingToken.token) ? ' (face down)' : ''}</span>
			{:else if pendingSpawn}
				<span>Tap a hex to place the {pendingSpawn.team} {pendingSpawn.role}</span>
			{/if}
			<button class="spcancel" on:click={cancelPlace}>Cancel</button>
		</div>
	{/if}
	<div class="ocean"></div>
	<!-- on a phone the board sits between the top bar + player strip and the dash -->
	<div class="boardarea" class:mob={mobile}>
	<BoardCanvas bind:this={board} map={$ms.map ?? {}} rotation={orientation} interactive={true} {placing} {placeGhost} holdColor={myHoldColor} onCancelPlace={cancelPlace} {areas} pieces={boardPieces} onMovePiece={move} onSelect={onSelectPiece} onHex={onBoardHex} {thrones} />
	</div>

	<CardLayer bind:this={cardLayer} {mobile} {session} {ms} {players} {clientId} onAdvanceTurn={advanceTurn} onArmToken={armToken} holdingToken={!!pendingToken} bind:previewId />

	<!-- selected minion/token: offer delete (heroes aren't deletable) -->
	{#if selPiece && (selPiece.role || selPiece.token)}
		<div class="pietool">
			<span class="pietxt">{selLabel}</span>
			{#if selPiece.token && MINES.has(selPiece.token)}
				<button class="pieflip" on:click={flipMine}>{selPiece.faceDown ? 'Flip — reveal' : 'Flip face down'}</button>
			{/if}
			<button class="piedel" on:click={() => (confirmDelete = true)}>Delete</button>
		</div>
	{/if}

	{#if confirmDelete && selPiece}
		<div class="modal-scrim" on:click={() => (confirmDelete = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<h3>Delete this {selPiece.role ? 'minion' : 'token'}?</h3>
				<p>This removes the {selLabel} from the board.</p>
				<div class="mrow">
					<button class="mcancel" on:click={() => (confirmDelete = false)}>Cancel</button>
					<button class="mleave" on:click={doDelete}>Delete</button>
				</div>
			</div>
		</div>
	{/if}

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


	{#if manageOpen}
		<div class="modal-scrim" on:click={() => (manageOpen = false)} on:keydown={(e) => e.key === 'Escape' && (manageOpen = false)} role="presentation">
			<div class="managepanel" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="mphead"><h3>Game Lobby</h3><button class="ix" on:click={() => (manageOpen = false)}>✕</button></div>

				{#if iAmHost && seatRequests.length}
					<div class="mpsec">
						<div class="mplbl">Seat requests</div>
						{#each seatRequests as r (r.id)}
							<div class="mprow req">
								<span class="mpname">{r.name}<em>wants seat {r.seat + 1}</em></span>
								<span class="mpacts">
									<button class="act primary sm" on:click={() => resolveSeat(r.id, true)}>Approve</button>
									<button class="act ghost sm" on:click={() => resolveSeat(r.id, false)}>Deny</button>
								</span>
							</div>
						{/each}
					</div>
				{/if}

				<div class="mpsec">
					<div class="mplbl">Seats</div>
					{#each seatRows as s (s.seat)}
						<div class="mprow" style="--tint:{s.team === 'orange' ? '#ef7d22' : '#2f7fe6'}">
							<span class="mpseatno">{s.seat + 1}</span>
							<span class="mpname">
								{s.name || 'Open'}{#if s.id === clientId}<em>you</em>{:else if !s.present}<em class="away">away</em>{/if}
								<span class="mphero">{s.hero ? heroById(s.hero)?.name ?? '' : '—'}</span>
							</span>
							<span class="mpacts">
								{#if iAmHost && s.present && s.id !== clientId}
									<button class="act danger sm" on:click={() => kickSeat(s.id)}>Kick</button>
								{/if}
								{#if mySeat < 0 && !s.present}
									{#if myRequestSeat === s.seat}
										<span class="reqpending">Requested…</span>
									{:else}
										<button class="act sm" on:click={() => requestSeat(s.seat)} disabled={myRequestSeat >= 0}>Take seat</button>
									{/if}
								{/if}
							</span>
						</div>
					{/each}
				</div>

				<div class="mpsec">
					<div class="mplbl">Spectators <span class="ct">{spectators.length}</span></div>
					{#if spectators.length}
						<div class="mpspecs">
							{#each spectators as sp (sp.id)}
								<span class="mpspec">{sp.name}{sp.id === clientId ? ' (you)' : ''}{#if iAmHost && sp.id !== clientId}<button class="specx" title="Remove" on:click={() => kickSeat(sp.id)}>✕</button>{/if}</span>
							{/each}
						</div>
					{:else}<span class="empty-note">None</span>{/if}
				</div>

				{#if mySeat < 0}<p class="mphint">You're spectating. Request an open/away seat above — the host approves takeovers.</p>{/if}
			</div>
		</div>
	{/if}

	{#if mobile}
		<!-- ───────── phone top bar: ☰ · round/turn · tie-breaker · waves · life · gold ───────── -->
		<div class="mtop">
			<button class="mib" on:click={() => (menuOpen = true)} aria-label="Menu">☰</button>
			<span class="mpill rt"><b>R{$ms.round}</b>·<b>T{$ms.turn}</b></span>
			<button class="mib tie" on:click={flipTie} title="Tie-breaker: {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'} — tap to flip"><img src={tieArt($ms.tieBreaker)} class:flip={tieFlip} alt="" /></button>
			<button class="mpill" on:click={() => (lwOpen = true)} aria-label="Waves"><img class="wv" src={waveIcon} alt="" /><b class="n2">{$ms.waves}</b></button>
			<button class="mpill life" on:click={() => (lwOpen = true)} aria-label="Life"><b class="n2 lo">{$ms.life.orange}</b><img src={lifeSplit} alt="" /><b class="n2 lb">{$ms.life.blue}</b></button>
			<span class="msp"></span>
			{#if myCoins != null}
				<span class="goldwrap">
					<button class="mpill gold" on:click={() => (goldOpen = !goldOpen)} aria-label="Coins"><span class="gc"></span><b class="n2">{myCoins}</b></button>
					{#if goldOpen}
						<div class="goldpop"><button on:click={() => coins(-1)} aria-label="Remove coin">−</button><span class="gc big">{myCoins}</span><button on:click={() => coins(1)} aria-label="Add coin">+</button></div>
					{/if}
				</span>
			{/if}
		</div>

		<!-- ☰ menu: spawn, effects, activity, view, lobby / leave -->
		{#if menuOpen}
			<div class="mscrim" on:click={() => (menuOpen = false)} on:keydown={() => {}} role="presentation"></div>
			<div class="mdrawer">
				<div class="mdh">
					<div class="mdname">{$ms.map?.name ?? 'Board'}</div>
					<small>{room} · <span class="conn {$status}"><span class="cdot"></span>{connLabel($status)}</span></small>
				</div>
				<div class="msec">
					<div class="mlbl">Spawn</div>
					{#each ['orange', 'blue'] as t}
						<div class="spr"><span class="tm {t}">{t === 'orange' ? 'O' : 'B'}</span>
							{#each MINION_ROLES as r}<button class="mn" on:click={() => { armSpawn(t as Team, r); menuOpen = false; }} title="{t} {r}">{r[0].toUpperCase()}</button>{/each}
						</div>
					{/each}
				</div>
				{#if activeFx.length}
					<div class="msec">
						<div class="mlbl">Effects</div>
						{#each activeFx as e (e.id)}
							<button class="mfx" style="--fxc:{pColor(e.pid)}" on:click={() => { menuOpen = false; cardLayer?.showCard(e.hero, e.idx, e.pid); }}>
								<span>{heroById(e.hero)?.name ?? ''}</span><i>{FX_SHORT[effectLabel(e, $ms.round, $ms.turn)]}</i>
							</button>
						{/each}
					</div>
				{/if}
				<div class="msec mlog">
					<div class="mlbl">Activity</div>
					<div class="mlogb">
						{#each log.slice(-8) as e (e.id)}<p><b>{e.by}</b> {e.text}</p>{:else}<p>No moves yet.</p>{/each}
					</div>
				</div>
				<div class="msec mviews">
					<div class="mlbl">View</div>
					<div class="mvg">
						<button class="mvb rec" on:click={() => board?.reset()} aria-label="Recenter">⌖</button>
						<button class="mvb" on:click={() => board?.rotateBy(-45)} aria-label="Rotate left">⟲</button>
						<button class="mvb" on:click={() => board?.rotateBy(45)} aria-label="Rotate right">⟳</button>
						<button class="mvb" on:click={() => board?.zoomBtn(1.2)} aria-label="Zoom in">＋</button>
						<button class="mvb" on:click={() => board?.zoomBtn(1 / 1.2)} aria-label="Zoom out">−</button>
						<button class="mvb" class:on={viewsOpen} on:click={() => (viewsOpen = !viewsOpen)} aria-label="Saved views">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.4-2h6.8l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.6" /></svg>
						</button>
					</div>
					{#if viewsOpen}
						{#each views as v, i}
							<div class="vslot">
								<button class="vgo" disabled={!v} on:click={() => { goView(i); menuOpen = false; }}><b>{i + 1}</b><span>{v ? viewLabel(v) : 'Empty'}</span></button>
								<button class="vsave" on:click={() => saveView(i)}>{v ? 'Overwrite' : 'Save'}</button>
							</div>
						{/each}
					{/if}
				</div>
				<div class="mrow2">
					<button class="mbtn lob" on:click={() => { menuOpen = false; manageOpen = true; }}>👥 Lobby{#if iAmHost && seatRequests.length}<span class="reqbadge">{seatRequests.length}</span>{/if}</button>
					<button class="mbtn leave" on:click={() => { menuOpen = false; confirmLeave = true; }}>⎋ Leave</button>
				</div>
			</div>
		{/if}

		<!-- waves & life: tap a token to flip it -->
		{#if lwOpen}
			<div class="mscrim" on:click={() => (lwOpen = false)} on:keydown={() => {}} role="presentation"></div>
			<div class="msheet">
				<span class="grab"></span>
				<div class="lsec"><div class="lh"><span>Waves</span><b>{$ms.waves} / {($ms.waveTok ?? []).length}</b></div>
					<div class="lg w">{#each $ms.waveTok ?? [] as full, i}<button class="wtok" class:dep={!full} class:flip={flips[`w${i}`]} style="background-image:url({waveIcon})" on:click={() => toggleWave(i)} aria-label="Wave token"></button>{/each}</div></div>
				{#each ['orange', 'blue'] as t}
					<div class="lsec"><div class="lh {t}"><span>{t === 'orange' ? 'Orange' : 'Blue'} life</span><b>{$ms.life[t as Team]} / {lifeMax}</b></div>
						<div class="lg">{#each $ms.lifeTok?.[t as Team] ?? [] as full, i}<button class="ltok" class:dep={!full} class:flip={flips[`l${t}${i}`]} style="background-image:url({lifeArt(t as Team, full ? 'front' : 'back')})" on:click={() => toggleLife(t as Team, i)} aria-label="Life token"></button>{/each}</div></div>
				{/each}
			</div>
		{/if}
	{:else}
	<!-- game HUD: right-side panel -->
	<div class="hud">
		<div class="mapline">
			<button class="exitbtn" on:click={() => (confirmLeave = true)} title="Leave game" aria-label="Leave game">⎋</button>
			<div class="mapname" title={$ms.map?.name ?? 'Board'}>{$ms.map?.name ?? 'Board'}</div>
		</div>
		<!-- room code + connection, right under the map name -->
		<div class="roomline">
			<span class="rc">Room <b>{room}</b></span>
			<span class="conn {$status}"><span class="cdot"></span>{connLabel($status)}</span>
		</div>
		<button class="managebtn" class:alert={iAmHost && seatRequests.length} on:click={() => (manageOpen = true)} title="Game Lobby — players, seats and requests">
			👥 Game Lobby{#if iAmHost && seatRequests.length}<span class="reqbadge">{seatRequests.length}</span>{/if}
		</button>

		<div class="hsec rt">
			<!-- read-only: rounds/turns only advance through play (host's Next turn) -->
			<div class="rline"><span class="rv">Round {$ms.round}</span></div>
			<div class="rline"><span class="rv">Turn {$ms.turn}</span></div>
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

		<!-- temporary manual minion spawns (auto-waves WIP) -->
		<div class="hsec">
			<div class="slabel"><span>Spawn minion</span></div>
			<div class="spawnrow">
				<button class="spbtn orange" class:on={spawnTeam === 'orange'} on:click={() => (spawnTeam = spawnTeam === 'orange' ? null : 'orange')}>Orange ▾</button>
				<button class="spbtn blue" class:on={spawnTeam === 'blue'} on:click={() => (spawnTeam = spawnTeam === 'blue' ? null : 'blue')}>Blue ▾</button>
			</div>
			{#if spawnTeam}
				<div class="spmenu {spawnTeam}">
					{#each MINION_ROLES as role}
						<button class="sprole" on:click={() => armSpawn(spawnTeam, role)} title="Then click a hex to place">{role}</button>
					{/each}
				</div>
			{/if}
			{#if pendingSpawn}
				<div class="spawnhint {pendingSpawn.team}">
					<span>Tap a hex to place the {pendingSpawn.team} {pendingSpawn.role}</span>
					<button class="spcancel" on:click={() => (pendingSpawn = null)}>Cancel</button>
				</div>
			{/if}
		</div>

		<button class="tiebtn {$ms.tieBreaker}" on:click={flipTie} title="Flip the tie-breaker — {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'} breaks ties">
			<span class="coin"><img src={tieArt($ms.tieBreaker)} class:flip={tieFlip} alt="" /></span>
			<span>Tie-breaker: {$ms.tieBreaker === 'orange' ? 'Orange' : 'Blue'}</span>
		</button>

		<!-- active card effects: who, which card, how long — tap to read the card -->
		{#if activeFx.length}
			<div class="hsec fxlist">
				<div class="fxhd">Active effects</div>
				{#each activeFx as e (e.id)}
					<button class="fxrow" style="--fxc:{pColor(e.pid)}" on:click={() => cardLayer?.showCard(e.hero, e.idx, e.pid)} title="Read {e.name}">
						<span class="fxtxt"><b>{heroById(e.hero)?.name ?? ''}</b> · {e.name}</span>
						<span class="fxwhen">{effectLabel(e, $ms.round, $ms.turn)}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- activity log fills the space between the tie-breaker and the controls; retractable -->
		<div class="logpanel" class:collapsed={!logOpen}>
			<div class="loghdr">
				<button class="loghead" on:click={() => (logOpen = !logOpen)} title={logOpen ? 'Hide activity' : 'Show activity'}>
					<span>Activity</span><span class="chev">{logOpen ? '▾' : '▸'}</span>
				</button>
				{#if iAmHost}
					<button class="undobtn" on:click={() => session.undo()} disabled={!$canUndo}
						title={$canUndo ? `Undo: ${log[log.length - 1]?.text ?? ''}` : 'Nothing to undo this turn'}>↶ Undo</button>
				{/if}
			</div>
			{#if logOpen}
				<div class="logbody" bind:this={logEl}>
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
			<button class="vbtn recenter" on:click={() => board?.reset()} title="Recenter & reset view">⌖</button>
			<button class="vbtn" on:click={() => board?.rotateBy(-45)} title="Rotate counter-clockwise (45°)">⟲</button>
			<button class="vbtn" on:click={() => board?.rotateBy(45)} title="Rotate clockwise (45°)">⟳</button>
			<button class="vbtn" on:click={() => board?.zoomBtn(1.2)} title="Zoom in">＋</button>
			<button class="vbtn" on:click={() => board?.zoomBtn(1 / 1.2)} title="Zoom out">−</button>
			<!-- saved views: jump to (or overwrite) one of three remembered angles -->
			<div class="viewswrap">
				<button class="vbtn views" class:on={viewsOpen} on:click={() => (viewsOpen = !viewsOpen)} title="Saved views" aria-label="Saved views">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.4-2h6.8l1.4 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.6" /></svg>
				</button>
				{#if viewsOpen}
					<div class="viewspop">
						<div class="vplbl">Saved views</div>
						{#each views as v, i}
							<div class="vslot">
								<button class="vgo" disabled={!v} on:click={() => goView(i)} title={v ? 'Jump to this view' : 'Empty — save a view here first'}>
									<b>{i + 1}</b><span>{v ? viewLabel(v) : 'Empty'}</span>
								</button>
								<button class="vsave" on:click={() => saveView(i)} title={v ? 'Overwrite with the current view' : 'Save the current view here'}>{v ? 'Overwrite' : 'Save'}</button>
							</div>
						{/each}
						<div class="vphint">Saves rotation, zoom &amp; position in this browser.</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
	{/if}
</div>

<style>
	/* clip (not just hidden): a tucked hand extends past the bottom edge, and
	   overflow:hidden would still let focus/scrollIntoView scroll the whole view */
	.gamewrap { position: fixed; inset: 0; color: #f1f5f9; overflow: hidden; overflow: clip; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
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
	/* recenter: brass accent so it's easy to find */
	.vbtn.recenter { background: rgba(199, 154, 78, 0.22); border-color: rgba(214, 170, 92, 0.65); color: #f6e3b4; }
	.vbtn.recenter:hover { background: rgba(199, 154, 78, 0.36); }
	.viewswrap { position: relative; flex: 1; display: flex; }
	.vbtn.views { display: grid; place-items: center; }
	.vbtn.views svg { width: 1.05rem; height: 1.05rem; }
	.vbtn.views.on { background: rgba(255, 255, 255, 0.16); }
	.viewspop { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 12; width: 196px; padding: 9px; border-radius: 12px;
		background: rgba(11, 16, 26, 0.96); border: 1px solid rgba(199, 154, 78, 0.5); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); }
	.vplbl { font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; color: #b8a06a; margin: 1px 2px 6px; }
	.vslot { display: flex; gap: 5px; margin-bottom: 5px; }
	.vgo { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 5px 8px; border-radius: 8px; cursor: pointer; color: #e5e7eb; font-size: 0.72rem;
		background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); text-align: left; }
	.vgo b { color: #f0dcae; }
	.vgo span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.vgo:hover:not(:disabled) { background: rgba(199, 154, 78, 0.2); border-color: rgba(199, 154, 78, 0.5); }
	.vgo:disabled { cursor: default; color: #7b8697; }
	.vsave { flex: none; padding: 0 8px; border-radius: 8px; cursor: pointer; font-size: 0.62rem; color: #f6e3b4; background: rgba(199, 154, 78, 0.16); border: 1px solid rgba(199, 154, 78, 0.45); }
	.vsave:hover { background: rgba(199, 154, 78, 0.3); }
	.vphint { font-size: 0.56rem; color: #8b9bb0; margin: 2px 2px 0; }
	/* exit sits left of the map name */
	.mapline { display: flex; align-items: center; gap: 6px; }
	.hud .mapline .mapname { flex: 1; min-width: 0; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.exitbtn { flex: none; width: 1.6rem; height: 1.6rem; }
	.exitbtn { border-radius: 7px; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0; color: #fca5a5; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4); }
	.exitbtn:hover { background: rgba(80, 20, 24, 0.7); }

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
	/* in-game manage menu */
	.managebtn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border-radius: 9px; cursor: pointer;
		background: rgba(199, 154, 78, 0.12); border: 1px solid rgba(199, 154, 78, 0.4); color: #e8dcc0; font-weight: 700; font-size: 0.76rem; }
	.managebtn:hover { background: rgba(199, 154, 78, 0.24); }
	.managebtn.alert { border-color: rgba(239, 125, 34, 0.8); box-shadow: 0 0 12px rgba(239, 125, 34, 0.4); }
	.reqbadge { min-width: 1.05rem; height: 1.05rem; padding: 0 4px; border-radius: 999px; background: #ef7d22; color: #1a0f06; font-size: 0.62rem; font-weight: 900; display: grid; place-items: center; }
	.managepanel { width: min(460px, 94vw); max-height: 88vh; overflow-y: auto; color: #e5e7eb; background: rgba(11, 16, 26, 0.96); border: 1px solid rgba(199, 154, 78, 0.5); border-radius: 16px; padding: 16px 18px; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7); }
	.mphead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
	.mphead h3 { font-family: 'Modesto Poster', serif; font-size: 1.3rem; margin: 0; }
	.mphead .ix { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); color: #cbd5e1; border-radius: 7px; width: 1.8rem; height: 1.8rem; cursor: pointer; }
	.mpsec { margin-top: 12px; }
	.mplbl { font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 800; color: #b8a06a; margin-bottom: 6px; display: flex; gap: 6px; align-items: center; }
	.mplbl .ct { color: #f1f5f9; background: rgba(255, 255, 255, 0.08); border-radius: 5px; padding: 0 6px; }
	.mprow { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 10px; background: rgba(12, 18, 32, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-left: 3px solid var(--tint, rgba(255,255,255,.12)); margin-bottom: 5px; }
	.mprow.req { border-left-color: #ef7d22; background: rgba(239, 125, 34, 0.1); }
	.mpseatno { width: 1.4rem; height: 1.4rem; flex: none; display: grid; place-items: center; border-radius: 6px; background: rgba(255, 255, 255, 0.08); font-weight: 800; font-size: 0.78rem; color: #cbd5e1; }
	.mpname { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.15; font-family: 'Modesto Poster', serif; font-size: 0.98rem; color: #f6ead2; }
	.mpname em { font-style: normal; font-size: 0.58rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #8b9bb0; }
	.mpname em.away { color: #f0a35a; }
	.mphero { font-size: 0.66rem; color: #93a3b8; }
	.mpacts { display: flex; gap: 6px; flex: none; }
	.mpspecs { display: flex; flex-wrap: wrap; gap: 6px; }
	.mpspec { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); font-size: 0.78rem; }
	.specx { background: none; border: none; color: #fca5a5; cursor: pointer; padding: 0; font-size: 0.78rem; }
	.reqpending { font-size: 0.72rem; font-weight: 700; color: #f0c98a; }
	.mphint { font-size: 0.72rem; color: #93a3b8; margin: 12px 0 0; }
	.empty-note { color: #64748b; font-size: 0.8rem; }
	.managepanel .act { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.08); color: #e5e7eb; border-radius: 8px; padding: 5px 12px; font-weight: 700; cursor: pointer; font-size: 0.8rem; }
	.managepanel .act.sm { padding: 4px 10px; font-size: 0.76rem; }
	.managepanel .act.primary { background: #ef7d22; color: #1a0f06; border-color: transparent; }
	.managepanel .act.danger { background: rgba(220, 60, 60, 0.25); border-color: rgba(220, 60, 60, 0.5); color: #ffb4b4; }
	.managepanel .act.ghost { background: transparent; }

	.roomline { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -2px 2px 0; }
	.rc { color: #94a3b8; font-size: 0.72rem; letter-spacing: 0.04em; }
	.rc b { color: #e2e8f0; font-family: 'Modesto Poster', serif; font-weight: normal; letter-spacing: 0.1em; font-size: 0.86rem; }
	.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600; color: #94a3b8; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; } .conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; } .conn.closed .cdot { background: #ef4444; }

	/* left-side HUD panel — tightened */
	.hud { position: absolute; top: 12px; left: 12px; bottom: 12px; z-index: 6; width: 204px; display: flex; flex-direction: column; gap: 6px;
		overflow-y: auto; background: rgba(9, 13, 22, 0.74); backdrop-filter: blur(8px); border: 1px solid rgba(199, 154, 78, 0.4);
		border-radius: 12px; padding: 9px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 26px rgba(199, 154, 78, 0.06); }
	.hud .mapname { font-family: 'Modesto Poster', serif; font-size: 1.02rem; letter-spacing: 0.03em; color: #f6ead2; text-align: center; }

	.fxlist { gap: 3px; }
	.fxhd { font-size: 0.56rem; letter-spacing: 0.1em; text-transform: uppercase; color: #b8a06a; margin-bottom: 1px; }
	.fxrow { display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 6px; border-radius: 7px; cursor: zoom-in; text-align: left; color: #e5e7eb; font-size: 0.66rem;
		background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-left: 3px solid var(--fxc); }
	.fxrow:hover { background: rgba(255, 255, 255, 0.1); }
	.fxtxt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.fxtxt b { color: #f6ead2; font-weight: normal; }
	.fxwhen { flex: none; font-size: 0.56rem; color: #e8c173; }
	.hsec { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 9px;
		background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); }
	.hsec.rt { gap: 4px; }
	.rline { display: flex; align-items: center; justify-content: center; gap: 4px; }
	.rline .rv { font-weight: 700; font-size: 0.82rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.hsec.life.orange { border-left: 3px solid #ef7d22; } .hsec.life.blue { border-left: 3px solid #2f7fe6; }

	.slabel { display: flex; align-items: baseline; justify-content: space-between; gap: 6px;
		font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: #93a3b8; }
	.slabel .cnt { color: #f1f5f9; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
	.slabel .tn { font-family: 'Modesto Poster', serif; font-size: 0.9rem; letter-spacing: 0.02em; text-transform: none; }
	.orange .tn { color: #ef9a5a; } .blue .tn { color: #6ea8f0; }
	.slabel .tc { font-weight: 800; font-variant-numeric: tabular-nums; font-size: 0.9rem; color: #f1f5f9; }
	.slabel .tc small { color: #94a3b8; font-weight: 600; font-size: 0.7rem; }

	.tokens { display: flex; gap: 2px; flex-wrap: wrap; } /* 5 life tokens per row via 30px token + panel width */
	.ltok { width: 30px; height: 29px; padding: 0; border: none; background: transparent no-repeat center / contain; cursor: pointer;
		perspective: 80px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55)); transition: transform 0.1s, filter 0.15s, opacity 0.15s; }
	.ltok:hover { transform: translateY(-2px) scale(1.1); }
	.ltok.dep { opacity: 0.85; filter: grayscale(0.35) brightness(0.72) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)); }
	.ltok.dep:hover { opacity: 1; filter: grayscale(0.15) brightness(0.9); }
	.ltok.flip { animation: coinflip 0.45s ease-in-out; }

	.wtoks { display: flex; gap: 2px; flex-wrap: wrap; } /* 7 wave tokens per row via 20px token + panel width */
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

	/* minion spawn controls */
	.spawnrow { display: flex; gap: 5px; }
	.spbtn { flex: 1; border-radius: 8px; padding: 4px 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; color: #f1f5f9; border: 1px solid transparent; }
	.spbtn.orange { background: rgba(239, 125, 34, 0.18); border-color: rgba(239, 125, 34, 0.5); }
	.spbtn.orange.on, .spbtn.orange:hover { background: rgba(239, 125, 34, 0.34); }
	.spbtn.blue { background: rgba(47, 127, 230, 0.18); border-color: rgba(47, 127, 230, 0.5); }
	.spbtn.blue.on, .spbtn.blue:hover { background: rgba(47, 127, 230, 0.34); }
	.spmenu { display: flex; gap: 4px; margin-top: 5px; }
	.sprole { flex: 1; text-transform: capitalize; border-radius: 7px; padding: 4px 2px; font-size: 0.68rem; font-weight: 700; cursor: pointer;
		color: #e5e7eb; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.18); }
	.sprole:hover { background: rgba(255, 255, 255, 0.18); }
	.spmenu.orange .sprole:hover { background: rgba(239, 125, 34, 0.3); }
	.spmenu.blue .sprole:hover { background: rgba(47, 127, 230, 0.3); }
	.spawnhint { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; padding: 5px 8px; border-radius: 8px;
		font-size: 0.68rem; font-weight: 700; color: #f1f5f9; text-transform: capitalize; animation: hintpulse 1.4s ease-in-out infinite; }
	.spawnhint.orange { background: rgba(239, 125, 34, 0.22); border: 1px solid rgba(239, 125, 34, 0.55); }
	.spawnhint.blue { background: rgba(47, 127, 230, 0.22); border: 1px solid rgba(47, 127, 230, 0.55); }
	.spcancel { flex: none; border-radius: 6px; padding: 2px 7px; font-size: 0.66rem; font-weight: 700; cursor: pointer; text-transform: none;
		color: #e5e7eb; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.22); }
	.spcancel:hover { background: rgba(255, 255, 255, 0.2); }
	@keyframes hintpulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }

	/* floating delete toolbar for a selected minion/token */
	.pietool { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 8; display: flex; align-items: center; gap: 10px;
		padding: 6px 8px 6px 12px; border-radius: 999px; background: rgba(9, 13, 22, 0.9); backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
	.pieflip { border: 1px solid rgba(240, 200, 120, 0.55); background: rgba(199, 154, 78, 0.24); color: #f6e3b4; border-radius: 999px; padding: 4px 12px; font-weight: 700; cursor: pointer; font-size: 0.76rem; }
	.pieflip:hover { background: rgba(199, 154, 78, 0.4); }
	.placehint { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9; display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border-radius: 999px;
		background: rgba(11, 16, 26, 0.9); border: 1px solid rgba(240, 200, 120, 0.5); color: #f0dcae; font-size: 0.8rem; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
	.pietxt { font-size: 0.78rem; font-weight: 700; color: #e5e7eb; text-transform: capitalize; }
	.piedel { border: 1px solid rgba(239, 68, 68, 0.5); background: rgba(220, 60, 60, 0.28); color: #ffb4b4; border-radius: 999px; padding: 4px 12px; font-weight: 700; cursor: pointer; font-size: 0.76rem; }
	.piedel:hover { background: rgba(220, 60, 60, 0.45); }

	/* activity log lives inside the HUD, filling the gap above the controls; retractable */
	.logpanel { flex: 1; min-height: 56px; display: flex; flex-direction: column; overflow: hidden;
		border-radius: 9px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); }
	.logpanel.collapsed { flex: none; min-height: 0; }
	.loghdr { display: flex; align-items: stretch; }
	.loghead { display: flex; align-items: center; justify-content: space-between; flex: 1; border: none; cursor: pointer;
		padding: 5px 8px; background: rgba(255, 255, 255, 0.04); color: #93a3b8; font-weight: 700; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; }
	.loghead:hover { background: rgba(255, 255, 255, 0.08); }
	.undobtn { flex: none; border: none; border-left: 1px solid rgba(255, 255, 255, 0.08); cursor: pointer; padding: 5px 9px;
		background: rgba(199, 154, 78, 0.16); color: #f0dcae; font-weight: 800; font-size: 0.66rem; letter-spacing: 0.04em; }
	.undobtn:hover:not(:disabled) { background: rgba(199, 154, 78, 0.3); }
	.undobtn:disabled { opacity: 0.35; cursor: not-allowed; color: #93a3b8; background: rgba(255, 255, 255, 0.03); }
	.loghead .chev { letter-spacing: 0; }
	.logbody { flex: 1; overflow-y: auto; padding: 5px 8px; display: flex; flex-direction: column; gap: 3px; }
	.logline { font-size: 0.72rem; color: #cbd5e1; line-height: 1.3; }
	.logline b { color: #f1f5f9; }
	.logempty { font-size: 0.72rem; color: #64748b; }

	/* ═══════════ phone layout (≤760px wide) ═══════════ */
	.boardarea { position: absolute; inset: 0; }
	.boardarea.mob { top: 116px; bottom: 100px; }
	.gamewrap.mob .pietool, .gamewrap.mob .placehint { top: 124px; max-width: 94vw; }
	.mtop { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 14; display: flex; align-items: center; gap: 5px; padding: 0 8px;
		background: rgba(9, 13, 22, 0.96); border-bottom: 1px solid rgba(199, 154, 78, 0.35); }
	.mib { flex: none; width: 32px; height: 32px; padding: 0; border-radius: 9px; display: grid; place-items: center; cursor: pointer; font-size: 17px; color: #f0dcae;
		background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); }
	.mib.tie img { width: 24px; height: 24px; }
	.mib.tie img.flip { animation: coinflip 0.45s ease; }
	.mpill { flex: none; height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 7px; border-radius: 9px; cursor: pointer; font-size: 13px; color: #e5e7eb;
		background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); white-space: nowrap; }
	.mpill b { font-weight: normal; color: #fff; }
	/* fixed-width counters: one or two digits, nothing moves */
	.mpill .n2 { display: inline-block; min-width: 1.25em; text-align: center; font-variant-numeric: tabular-nums; }
	.mpill.rt { cursor: default; gap: 2px; }
	.mpill .wv { width: 18px; height: 18px; object-fit: contain; }
	.mpill.life img { width: 21px; height: 20px; }
	.mpill.life .lo { color: #ffb27a; } .mpill.life .lb { color: #8cc0ff; }
	.msp { flex: 1; }
	.goldwrap { position: relative; flex: none; }
	.mpill.gold { background: rgba(199, 154, 78, 0.14); border-color: rgba(199, 154, 78, 0.45); padding-left: 4px; }
	.gc { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center; background: radial-gradient(circle at 35% 30%, #ffe7a1, #d4a64a 60%, #9a6f22); border: 1px solid #fbe7b0; }
	.gc.big { width: 36px; height: 36px; font-size: 16px; color: #3a2604; }
	.goldpop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px;
		background: rgba(11, 16, 26, 0.97); border: 1px solid rgba(199, 154, 78, 0.55); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6); }
	.goldpop button { width: 34px; height: 34px; border-radius: 9px; cursor: pointer; font-size: 20px; color: #fff; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); }
	.mscrim { position: fixed; inset: 0; z-index: 30; background: rgba(2, 5, 10, 0.55); }
	.mdrawer { position: fixed; top: 0; bottom: 0; left: 0; z-index: 31; width: min(232px, 78vw); padding: 12px 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
		background: rgba(10, 15, 25, 0.98); border-right: 1px solid rgba(199, 154, 78, 0.45); box-shadow: 20px 0 50px rgba(0, 0, 0, 0.6); color: #e5e7eb; }
	.mdname { font-size: 15px; color: #f6ead2; }
	.mdh small { font-size: 10px; color: #93a3b8; display: flex; align-items: center; gap: 4px; }
	.msec { padding: 7px 8px; border-radius: 10px; background: rgba(12, 18, 32, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); }
	.mlbl { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #b8a06a; margin-bottom: 5px; }
	.spr { display: flex; gap: 4px; margin-top: 4px; }
	.tm { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; font-size: 13px; }
	.tm.orange { background: rgba(239, 125, 34, 0.3); border: 1px solid rgba(239, 125, 34, 0.7); }
	.tm.blue { background: rgba(47, 127, 230, 0.3); border: 1px solid rgba(47, 127, 230, 0.7); }
	.mn { flex: 1; height: 28px; border-radius: 7px; cursor: pointer; font-size: 12px; color: #e5e7eb; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); }
	.mfx { display: flex; justify-content: space-between; width: 100%; margin-top: 3px; padding: 3px 6px; border-radius: 6px; cursor: zoom-in; font-size: 11px; color: #e5e7eb;
		background: rgba(255, 255, 255, 0.04); border: none; border-left: 3px solid var(--fxc); }
	.mfx i { font-style: normal; font-size: 10px; color: #e8c173; }
	.mlogb p { font-size: 10.5px; line-height: 1.3; color: #d1d5db; margin-top: 2px; }
	.mlogb b { font-weight: normal; color: #fff; }
	.mvg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
	.mvb { height: 32px; border-radius: 8px; cursor: pointer; display: grid; place-items: center; font-size: 15px; color: #f0dcae; background: rgba(199, 154, 78, 0.14); border: 1px solid rgba(199, 154, 78, 0.4); }
	.mvb svg { width: 16px; height: 16px; }
	.mvb.rec, .mvb.on { background: rgba(199, 154, 78, 0.3); border-color: rgba(214, 170, 92, 0.7); }
	.mdrawer .vslot { margin-top: 5px; }
	.mrow2 { display: flex; gap: 6px; margin-top: auto; }
	.mbtn { position: relative; flex: 1; height: 32px; border-radius: 9px; cursor: pointer; font-size: 12px; color: #e5e7eb; background: rgba(255, 255, 255, 0.05); }
	.mbtn.lob { border: 1px solid rgba(199, 154, 78, 0.5); }
	.mbtn.leave { color: #fca5a5; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); }
	.msheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; max-height: 80vh; overflow-y: auto; padding: 18px 14px 20px; border-radius: 18px 18px 0 0;
		background: rgba(10, 15, 25, 0.98); border-top: 1px solid rgba(199, 154, 78, 0.5); box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.6); }
	.msheet .grab { position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 42px; height: 4px; border-radius: 3px; background: rgba(255, 255, 255, 0.45); }
	.lsec { margin-top: 12px; }
	.lh { display: flex; justify-content: space-between; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #b8a06a; margin-bottom: 6px; }
	.lh b { font-weight: normal; color: #fff; font-variant-numeric: tabular-nums; }
	.lh.orange span { color: #ef9a52; } .lh.blue span { color: #6ea8f0; }
	.lg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; justify-items: center; }
	.lg.w { grid-template-columns: repeat(7, 1fr); }
	.msheet .ltok { width: 44px; height: 42px; }
	.msheet .wtok { width: 34px; height: 34px; }
</style>
