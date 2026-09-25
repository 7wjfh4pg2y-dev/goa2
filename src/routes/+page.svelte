<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { writable, get, type Readable } from 'svelte/store';
	import logoImage from '$lib/images/goa-logo.png';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';
	import { reveal } from '$lib/transitions';
	import { role, tryAdmin, enterAsPlayer, signOut } from '$lib/role';
	import { availableMaps, type MapChoice } from '$lib/maps';
	import { announceRoom, browseRooms, type RoomInfo } from '$lib/lobby';
	import { claimIdentity, tabClientId, writeTicket, clearTicket, type ResumeTicket } from '$lib/identity';
	import {
		joinMatch,
		initialMatchState,
		wavesFor,
		lifeFor,
		colorHex,
		PLAYER_COLORS,
		teamForSeat,
		buildDraft,
		placeHeroes,
		placeMinions,
		buildSeatMap,
		draftPoolMin,
		DRAFT_SYSTEMS,
		DRAFT_LABELS,
		type MatchState,
		type Player,
		type MatchSession,
		type ConnStatus,
		type Team,
		type DraftSystem
	} from '$lib/match';
	import { HEROES } from '$lib/heroes';
	import { initCards } from '$lib/cards/cardstate';
	import HeroDraft from '$lib/HeroDraft.svelte';
	import GameView from '$lib/GameView.svelte';

	type Mode = 'landing' | 'choose' | 'admin' | 'adminhub' | 'menu' | 'create' | 'join' | 'lobby' | 'draft' | 'game';
	let mode: Mode = 'landing';
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
	let draftSystem: DraftSystem = 'all-pick';
	let draftStars = [1, 2, 3]; // 4★ heroes disabled for now (extra dev work pending)
	let maps: MapChoice[] = [];
	let mapId = '';

	// lobby / session
	let color = 'spectator';
	let ready = false;
	let joinError = '';
	let joining = false;
	let seatNotice = ''; // transient toast for seat-takeover grant/deny
	let session: MatchSession | null = null;
	let players: Readable<Player[]> = writable([]);
	let state: Readable<MatchState> = writable(initialMatchState());
	let connStatus: Readable<ConnStatus> = writable('connecting');
	let copied = false;
	let pick = ''; // colour chosen before flipping in (while still unseated)

	// coin-flip animation (each player flips their own team on joining)
	let coinShown = false;
	let coinRot = 0; // accumulated rotation (deg); lands on orange (mult of 360) or blue (+180)
	let coinDone = false;
	// Menus, lobby and hero select are laid out on a virtual ~1440×900 canvas and
	// scaled to fit the window, so a big laptop, a MacBook and an iPad all see the
	// same proportions (only the spare width changes with the aspect ratio). The
	// board (GameView) is already fluid and isn't scaled.
	let ui = 1;
	const fitUi = () => { if (browser) ui = Math.min(1.5, Math.max(0.7, Math.min(innerWidth / 1440, innerHeight / 900))); };
	fitUi();
	let coinCaption = '';
	let coinPending = 'Flipping…'; // caption while the coin spins

	// reconnect/resume: each tab keeps an expiring "resume ticket" for the room
	// it's in (identity.ts), so a refresh — or reopening a closed tab — rejoins
	// as the same player, while other tabs stay separate players. resumeSeed lets
	// a lone creator whose room emptied out while away recreate it.
	let myId = ''; // this tab's player id (claimed on mount)
	let pendingColor = '';
	let pendingSeat = -1;
	let resumeSeed: MatchState | null = null;
	function writeActive(patch: Partial<ResumeTicket>) {
		if (!myId) myId = tabClientId();
		writeTicket(myId, patch, { room, name, color, seat: mySeat, creator: false, seed: null });
	}
	function clearActive() { clearTicket(myId || tabClientId()); }
	// remember the last room the player was in so the Join screen can prefill the
	// code (kept even after an intentional Leave, so getting back is one tap)
	const LAST_ROOM = 'goa2-last-room';
	function rememberRoom(r: string) { try { if (r) localStorage.setItem(LAST_ROOM, r); } catch {} }
	function lastRoom(): string { try { return localStorage.getItem(LAST_ROOM) || ''; } catch { return ''; } }

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
		// work out who this tab is; if it was in a room (refresh, or reopening a
		// closed tab within the ticket's lifetime), rejoin it as the same player
		let alive = true;
		void claimIdentity().then(({ id, ticket }) => {
			if (!alive) return;
			myId = id;
			if (ticket && !q && !session) resume(ticket);
		});
		// keep this tab's resume ticket fresh while it's in a room
		const beat = setInterval(() => { if (session) writeActive({}); }, 60_000);
		return () => { alive = false; clearInterval(beat); };
	});

	// rejoin a room after a refresh / tab reopen, as the same player
	function resume(active: ResumeTicket) {
		enterAsPlayer();
		ensureLoaded();
		name = active.name || name;
		room = active.room;
		rememberRoom(room);
		pendingColor = active.color && active.color !== 'spectator' ? active.color : '';
		pendingSeat = typeof active.seat === 'number' ? active.seat : -1;
		resumeSeed = active.creator ? (active.seed as MatchState | null) : null; // fallback if room emptied out
		joinError = '';
		joining = true;
		session = joinMatch(room, { name, color: 'spectator' }, {});
		bindSession(false);
	}
	onDestroy(() => {
		session?.leave();
		roomHandle?.leave();
		browseHandle?.leave();
	});

	$: previewWaves = ruleset === 'custom' ? customWaves : wavesFor(ruleset);
	$: previewLife = ruleset === 'custom' ? customLife : lifeFor(ruleset, playerCount);
	// draft pool sizing: eligible heroes must cover the chosen system for the seats
	function toggleStar(s: number) {
		if (s === 4) return; // 4★ heroes are disabled for now
		draftStars = draftStars.includes(s) ? draftStars.filter((x) => x !== s) : [...draftStars, s].sort();
	}
	$: eligibleCount = HEROES.filter((h) => draftStars.includes(h.stars)).length;
	$: poolNeed = draftPoolMin(draftSystem, playerCount);
	$: poolShort = eligibleCount < poolNeed;
	$: shareLink = browser && room ? `${location.origin}${base}/?room=${room}` : '';

	// --- lobby derived ---
	$: me = session ? $players.find((p) => p.id === session!.clientId) : undefined;
	$: iAmHost = session ? $state.host === session.clientId : false;
	$: seatCount = $state.seats;
	$: half = Math.floor(seatCount / 2);
	// a player is "playing" once they hold a real seat (seat >= 0)
	$: seated = $players.filter((p) => p.seat >= 0 && p.seat < seatCount);
	$: spectators = $players.filter((p) => p.seat < 0);
	$: seatedCount = seated.length;
	$: allReady = seatedCount >= 1 && seated.every((p) => p.ready);
	$: mySeat = me?.seat ?? -1;
	$: myTeam = teamForSeat(mySeat, seatCount);
	// seat index → occupying player (last write wins on the rare collision)
	$: bySeat = (() => { const m: Record<number, Player> = {}; for (const p of $players) if (p.seat >= 0 && p.seat < seatCount && !m[p.seat]) m[p.seat] = p; return m; })();
	$: takenSeats = new Set($players.filter((p) => p.id !== session?.clientId && p.seat >= 0).map((p) => p.seat));
	$: takenColors = new Set($players.filter((p) => p.id !== session?.clientId && p.color !== 'spectator').map((p) => p.color));
	// first colour not taken by someone else (called on demand, not reactive, to
	// avoid a freeColor↔color reactive cycle)
	function firstFreeColor(): string {
		return PLAYER_COLORS.find((c) => !takenColors.has(c.id) && c.id !== color)?.id
			?? PLAYER_COLORS.find((c) => !takenColors.has(c.id))?.id ?? PLAYER_COLORS[0].id;
	}
	$: orangeSeats = Array.from({ length: half }, (_, i) => i);
	$: blueSeats = Array.from({ length: seatCount - half }, (_, i) => half + i);
	$: orangeCount = seated.filter((p) => p.seat < half).length;
	$: blueCount = seatedCount - orangeCount;

	// react to shared game transitions. The tie-breaker coin plays first (on Begin);
	// once it lands the host builds the draft, so everyone enters the draft screen,
	// then the board when the draft is done.
	$: if (mode === 'lobby' && $state.draft && !$state.started && !coinShown) mode = 'draft';
	$: if ((mode === 'lobby' || mode === 'draft') && $state.started && !coinShown) mode = 'game';
	$: if ((mode === 'lobby' || mode === 'draft' || mode === 'game') && $state.closed) bail('The host closed the game.');
	// host places hero tokens once, when the board first appears
	$: if (mode === 'game' && iAmHost && session && $state.draft && !Object.keys($state.pieces).length) {
		const s = get(state);
		session.update({
			pieces: { ...placeMinions(s), ...placeHeroes(s, get(players)) },
			cards: initCards(s.draft?.picks ?? {}),
			seatMap: buildSeatMap(get(players), s.seats)
		});
	}

	function bail(msg: string) {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		clearActive();
		notice = msg;
		mode = 'menu';
	}

	// host keeps the directory entry in sync with the room
	$: if (roomHandle) roomHandle.update({ count: seatedCount, started: $state.started });

	// host handoff: if the current host has left the room, the remaining player
	// with the smallest id claims host (deterministic, so everyone agrees).
	$: if (
		session &&
		$state.rev >= 0 &&
		(mode === 'lobby' || mode === 'draft' || mode === 'game') &&
		$state.host &&
		$players.length &&
		!$players.some((p) => p.id === $state.host)
	) {
		const cand = [...$players].map((p) => p.id).sort()[0];
		if (cand === session.clientId && $state.host !== cand) session.update({ host: cand });
	}

	// whoever is host keeps the room in the public directory (covers handoff),
	// in every in-game phase so it stays discoverable/spectatable throughout
	$: if (browser && session && iAmHost && !roomHandle && (mode === 'lobby' || mode === 'draft' || mode === 'game')) {
		roomHandle = announceRoom({ room, host: name, seats: $state.seats, count: seatedCount, started: $state.started });
	}

	// browse open rooms only while on the Join screen
	function manageBrowse(m: Mode) {
		if (m === 'join') {
			if (!room.trim()) room = lastRoom(); // prefill the last room so no retyping
			if (!browseHandle) browseHandle = browseRooms((rs) => (openRooms = rs));
		} else if (browseHandle) {
			browseHandle.leave();
			browseHandle = null;
			openRooms = [];
		}
	}
	$: if (browser) manageBrowse(mode);

	// --- navigation ---
	function enterFromLanding() {
		mode = 'choose';
	}
	function onLogo() {
		if (mode === 'landing') enterFromLanding();
		else goHome();
	}
	function goHome() {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		clearActive();
		signOut();
		pw = ''; pwError = false; notice = '';
		mode = 'landing';
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
		name = name.trim();
		try { localStorage.setItem('goa2-name', name); } catch {}
	}
	function bindSession(enterLobby: boolean) {
		const s = session!;
		players = s.players;
		state = s.state;
		connStatus = s.status;
		color = 'spectator';
		ready = false;
		s.kicked.subscribe((v) => { if (v && session === s) bail('You were removed from the game.'); });
		s.notFound.subscribe((v) => { if (v && session === s) failJoin(); });
		// granted a seat takeover → take the seat + colour and remember it for rejoin
		s.seatGranted.subscribe((g) => {
			if (!g || session !== s) return;
			const c = g.color && g.color !== 'spectator' ? g.color : firstFreeColor();
			color = c;
			s.setSelf({ seat: g.seat, color: c, ready: false });
			writeActive({ seat: g.seat, color: c });
			seatNotice = 'You took the seat!';
			setTimeout(() => (seatNotice = ''), 3000);
		});
		s.seatDenied.subscribe((t) => { if (t && session === s) { seatNotice = 'The host declined your seat request.'; setTimeout(() => (seatNotice = ''), 3000); } });
		// another player flipped in → show the same coin animation for everyone
		s.joinFlip.subscribe((f) => {
			if (!f || session !== s || f.id === s.clientId) return;
			playCoin(f.side, flipCaps(f.name, f.side));
		});
		if (enterLobby) mode = 'lobby';
	}
	// a join stays on the Join screen ("Joining…") until the room's real state
	// arrives (→ lobby) or it's confirmed there's no such game (→ error)
	$: if (joining && $state.rev >= 0) { joining = false; resumeSeed = null; mode = 'lobby'; }
	// Re-apply a remembered seat + colour once the room's state has arrived, in ANY
	// mode — a player rejoining a game already in draft/board must get their seat
	// (and hero) back, not come back as a spectator.
	$: if (pendingSeat >= 0 && $state.rev >= 0 && session) {
		const st = pendingSeat; pendingSeat = -1;
		const c = pendingColor || firstFreeColor(); pendingColor = '';
		if (!takenSeats.has(st)) { color = c; session.setSelf({ seat: st, color: c }); writeActive({ seat: st, color: c }); }
	}
	// Spin the coin so it actually animates: mount at the current angle, then bump
	// the rotation on the next frame so the CSS transition has something to run
	// from (otherwise it appears already at the final face — the "only blue" bug).
	function playCoin(side: Team, opts: { caption?: string; pending?: string; after?: () => void } = {}) {
		coinShown = true; coinDone = false;
		coinCaption = opts.caption ?? (side === 'orange' ? 'You’re Orange!' : 'You’re Blue!');
		coinPending = opts.pending ?? 'Flipping…';
		const start = coinRot;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			coinRot = Math.ceil((start + 1440) / 360) * 360 + (side === 'blue' ? 180 : 0);
		}));
		setTimeout(() => { coinDone = true; opts.after?.(); }, 1650);
		setTimeout(() => (coinShown = false), 2900);
	}
	// shared tie-breaker flip on Begin: everyone animates the same result
	let lastStartFlip = 0;
	$: if ($state.startFlip && $state.startFlip.at !== lastStartFlip) {
		lastStartFlip = $state.startFlip.at;
		const side = $state.startFlip.side;
		playCoin(side, {
			caption: side === 'orange' ? 'Orange goes first' : 'Blue goes first',
			after: () => { if (iAmHost) startDraft(side); }
		});
	}
	// host builds the shared draft from the seed config; the tie-breaker winner drafts first
	function startDraft(startingTeam: Team) {
		const pool = HEROES.filter((hr) => $state.draftStars.includes(hr.stars)).map((hr) => hr.id);
		const d = buildDraft($state.draftSystem, pool, $players, $state.seats, startingTeam);
		session?.update({ draft: d, startFlip: null });
	}
	// join reached a room code with no host → don't create one
	function failJoin() {
		// a lone creator whose room emptied out while away just recreates it
		if (resumeSeed) { const seed = resumeSeed; resumeSeed = null; recreateFrom(seed); return; }
		const st = session ? get(session.status) : 'reconnecting';
		session?.leave();
		session = null;
		joining = false;
		joinError = st === 'connected'
			? `No open game with code “${room}”.`
			: `Couldn't reach the server — check your connection and try again.`;
		clearActive();
		mode = 'join';
	}
	// recreate a room from a stored seed (creator resuming an emptied room)
	function recreateFrom(seed: MatchState) {
		session = joinMatch(room, { name, color: 'spectator' }, { seed });
		roomHandle = announceRoom({ room, host: name, seats: seed.seats, count: 0, started: false });
		writeActive({ creator: true, seed });
		bindSession(true);
	}
	function createGame() {
		persistName();
		if (!name) return; // name is required
		// Always mint a fresh room code. The create form has no code field, so a
		// stale/empty `room` must never fall back to a fixed code (e.g. "TABLE") —
		// that collides with a previous game's persisted state on the server and
		// drops the host into that old (often already-started) game instead.
		randomRoom();
		const chosen = maps.find((m) => m.id === mapId) ?? maps[0];
		const seed = initialMatchState({
			length: ruleset === 'custom' ? 'long' : ruleset,
			players: playerCount,
			waves: ruleset === 'custom' ? customWaves : undefined,
			life: ruleset === 'custom' ? customLife : undefined,
			mapId: chosen?.id ?? '',
			map: chosen?.data ?? null,
			draftSystem,
			draftStars
		});
		rememberRoom(room);
		session = joinMatch(room, { name, color: 'spectator' }, { seed });
		roomHandle = announceRoom({ room, host: name, seats: playerCount, count: 0, started: false });
		writeActive({ room, name, color: 'spectator', seat: -1, creator: true, seed });
		bindSession(true);
	}
	function joinGame() {
		persistName();
		if (!name) { joinError = 'Enter your name first.'; return; }
		room = room.trim().toUpperCase();
		if (!room || joining) return;
		joinError = '';
		joining = true;
		rememberRoom(room);
		session = joinMatch(room, { name, color: 'spectator' }, {});
		writeActive({ room, name, color: 'spectator', seat: -1, creator: false, seed: null });
		bindSession(false);
	}
	function leaveRoom() {
		session?.leave();
		session = null;
		roomHandle?.leave();
		roomHandle = null;
		clearActive();
		mode = 'menu';
		randomRoom();
	}
	function joinFromList(r: RoomInfo) {
		room = r.room;
		joinGame();
	}

	// --- lobby actions ---
	// open seats on a given side (used to keep flips balanced & valid)
	function openSeatsOn(team: Team): number[] {
		return (team === 'orange' ? orangeSeats : blueSeats).filter((i) => !takenSeats.has(i) && i !== mySeat);
	}
	// team-join flip captions, shown to everyone: "X is flipping…" → "X is Orange!"
	const flipCaps = (who: string, side: Team) => ({ pending: `${who} is flipping…`, caption: `${who} is ${side === 'orange' ? 'Orange' : 'Blue'}!` });
	// Flip a coin for your team, then take an open seat on that side. Balanced —
	// if the coin's side is full, you land on the other. (Or just tap a seat.)
	let flipping = false;
	function flipForTeam() {
		if (mySeat >= 0 || flipping) return;
		let side: Team = Math.random() < 0.5 ? 'orange' : 'blue';
		if (openSeatsOn(side).length === 0) side = side === 'orange' ? 'blue' : 'orange';
		const seat = openSeatsOn(side)[0];
		if (seat === undefined) return; // table full
		flipping = true;
		session?.flipJoin(side, name); // let everyone else see the flip too
		playCoin(side, { ...flipCaps(name, side), after: () => {
			flipping = false;
			const c = pick || firstFreeColor();
			color = c;
			session?.setSelf({ seat, color: c });
			writeActive({ seat, color: c });
		} });
	}
	// tap any open seat: take it if you're unseated, or move there if you're
	// already sitting (not while readied or mid-flip)
	function sit(i: number) {
		if (ready || flipping || takenSeats.has(i) || i === mySeat) return;
		if (mySeat < 0) {
			const c = pick || firstFreeColor();
			color = c;
			session?.setSelf({ seat: i, color: c });
			writeActive({ seat: i, color: c });
			return;
		}
		session?.setSelf({ seat: i });
		writeActive({ seat: i });
	}
	// leave the table (back to unseated → must flip again to rejoin)
	function spectate() {
		if (ready) return; // unready first
		color = 'spectator';
		session?.setSelf({ seat: -1, color: 'spectator', ready: false });
		writeActive({ seat: -1, color: 'spectator' });
	}
	// choose a token colour: before flipping it's just a preference; once seated it
	// recolours live — but not while readied (locked in until you unready)
	function pickColor(c: string) {
		if (takenColors.has(c)) return;
		if (mySeat < 0) { pick = c; return; }
		if (ready) return;
		color = c;
		session?.setSelf({ color: c });
		writeActive({ color: c });
	}
	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';
	function toggleReady() {
		if (mySeat < 0) return;
		ready = !ready;
		session?.setSelf({ ready });
	}
	// host begins: broadcast a shared tie-breaker coin flip. Everyone animates it
	// (via the $state.startFlip reactive); the host flips `started` on once the
	// coin lands, so all players see the result before the board appears.
	function beginGame() {
		if (!iAmHost || !allReady || $state.startFlip) return;
		const side: Team = Math.random() < 0.5 ? 'orange' : 'blue';
		session?.update({ tieBreaker: side, startFlip: { side, at: Date.now() } });
	}
	function closeGame() { session?.update({ closed: true }); }
	function kick(id: string) { session?.kick(id); }

	async function copyLink() {
		try { await navigator.clipboard.writeText(shareLink); copied = true; setTimeout(() => (copied = false), 1400); } catch {}
	}
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<svelte:window on:resize={fitUi} />

{#if mode === 'draft' && session}
	<div class="uiscale" style="--ui:{ui}">
		<HeroDraft {session} {state} {players} clientId={session.clientId} onLeave={leaveRoom} />
	</div>
{:else if mode === 'game' && session}
	<GameView {session} ms={state} {players} clientId={session.clientId} {room} onLeave={leaveRoom} />
	{#if seatNotice}<div class="seattoast">{seatNotice}</div>{/if}
{:else}
<div class="uiscale" style="--ui:{ui}">
<main class="wrap" class:landing={mode === 'landing'}>
	<button class="home-link" class:hero={mode === 'landing'} on:click={onLogo} aria-label={mode === 'landing' ? 'Enter' : 'Main menu'}>
		<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
		{#if mode === 'landing'}<span class="entrhint">Click the crest to enter</span>{/if}
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
				<p class="roomline center">You're in as <b class="admincol">Admin</b>.</p>
				<div class="cards">
					<button class="card p" on:click={() => (mode = 'menu')}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
						<span class="t">Create / Join</span><span class="s">Run a game</span>
					</button>
					<a class="card a" href={base + '/editor'}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg></span>
						<span class="t">Map editor</span><span class="s">Paint maps & battle zones</span>
					</a>
				</div>
				<div class="row center"><button class="ghost" on:click={goHome}>Sign out</button></div>
			</div>
		{:else if mode === 'menu'}
			<div class="step" transition:reveal bind:clientHeight={h['menu']}>
				{#if notice}<p class="notice">{notice}</p>{/if}
				<div class="cards">
					<button class="card p" on:click={() => (mode = 'create')}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
						<span class="t">Create game</span><span class="s">Set the ruleset & map</span>
					</button>
					<button class="card a" on:click={() => { room = ''; joinError = ''; mode = 'join'; }}>
						<span class="ic"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg></span>
						<span class="t">Join game</span><span class="s">Enter a room code</span>
					</button>
				</div>
			</div>
		{:else if mode === 'create'}
			<div class="step" transition:reveal bind:clientHeight={h['create']}>
				<div class="card form wide">
					<label class="fld"><span>Your name</span><input class="field" bind:value={name} placeholder="Your name" /></label>
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
								<div class="chips two">{#each [4, 6, 8, 10] as n (n)}<button class="chip" class:on={playerCount === n} class:locked={n > 6} disabled={n > 6} title={n > 6 ? 'Coming soon' : ''} on:click={() => (playerCount = n)}>{n}</button>{/each}</div>
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
					<div class="grid2 draftfld">
						<div class="fld">
							<span>Hero draft</span>
							<div class="chips two">
								{#each DRAFT_SYSTEMS as sys (sys)}
									<button class="chip" class:on={draftSystem === sys} class:locked={sys !== 'all-pick'} disabled={sys !== 'all-pick'} title={sys !== 'all-pick' ? 'Coming soon' : ''} on:click={() => (draftSystem = sys)}>{DRAFT_LABELS[sys]}</button>
								{/each}
							</div>
						</div>
						<div class="fld">
							<span>Hero complexity</span>
							<div class="chips">
								{#each [1, 2, 3, 4] as s (s)}
									<button class="chip star" class:on={draftStars.includes(s)} class:locked={s === 4} disabled={s === 4}
										title={s === 4 ? '4★ heroes coming soon' : ''} on:click={() => toggleStar(s)}>{'★'.repeat(s)}</button>
								{/each}
							</div>
						</div>
					</div>
					{#if poolShort}
						<p class="hint warn">Only {eligibleCount} heroes — need {poolNeed} for {DRAFT_LABELS[draftSystem]} with {playerCount} players.</p>
					{/if}
					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={createGame} disabled={poolShort || !name.trim()}>Create game</button>
					</div>
				</div>
			</div>
		{:else if mode === 'join'}
			<div class="step" transition:reveal bind:clientHeight={h['join']}>
				<div class="card form" class:wide={openRooms.length} class:narrow={!openRooms.length}>
					<div class="joincols" class:two={openRooms.length}>
						<div class="jcol">
							<label class="fld"><span>Name</span><input class="field" bind:value={name} placeholder="Your name" /></label>
							<label class="fld"><span>Room code</span><input class="field up" bind:value={room} on:input={() => (joinError = '')} maxlength="8" placeholder="code from the host" /></label>
							{#if joinError}<p class="err">{joinError}</p>{/if}
						</div>
						{#if openRooms.length}
							<div class="jcol right">
								<span class="collbl">Open games</span>
								<div class="glist">
									{#each openRooms as r (r.room)}
										{@const spectate = r.started || r.count >= r.seats}
										<button class="gcard" on:click={() => joinFromList(r)}>
											<span class="gdot" class:live={r.started}></span>
											<span class="gmain">
												<span class="gtop"><b>{r.host}</b><span class="grc mono">{r.room}</span></span>
												<span class="gsub">
													<span class="gseats">{#each Array(r.seats) as _, i (i)}<span class="seatdot" class:on={i < r.count}></span>{/each}</span>
													<span class="gstatus">{r.started ? 'in progress' : `${r.count}/${r.seats}`}</span>
												</span>
											</span>
											<span class="garrow">{spectate ? 'Spectate' : 'Join'} →</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<div class="row">
						<button class="ghost" on:click={() => (mode = 'menu')}>← Back</button>
						<button class="primary" on:click={joinGame} disabled={!room.trim() || !name.trim() || joining}>{joining ? 'Joining…' : 'Join game'}</button>
					</div>
				</div>
			</div>
		{:else if mode === 'lobby'}
			<div class="step" transition:reveal bind:clientHeight={h['lobby']}>
				<div class="card form lobby" style="width: min(96 * var(--vw), {$state.seats * 96 + 56}px)">
					<div class="lobbyhead">
						<div>
							<span class="lbl">Room code</span>
							<div class="mono roomcode">{room}</div>
						</div>
						<div class="headright">
							<span class="conn {$connStatus}" title="Realtime connection">
								<span class="cdot"></span>{connLabel($connStatus)}
							</span>
							<button class="copybtn" class:done={copied} on:click={copyLink} aria-label="Copy invite link">
								<span class="ci" aria-hidden="true">{copied ? '✓' : '🔗'}</span>
								<span>{copied ? 'Link copied' : 'Invite link'}</span>
							</button>
						</div>
					</div>
					{#if $connStatus === 'reconnecting' || $connStatus === 'closed'}
						<p class="connbanner">Connection lost — trying to reconnect. Your seat is held.</p>
					{/if}

					<div class="fld">
						<div class="teamstop">
							<span>Teams {mySeat < 0 ? '· flip, or tap an open seat' : myTeam === 'orange' ? '· you’re Orange' : '· you’re Blue'}</span>
							{#if mySeat < 0}
								<button class="flipbtn hero" on:click={flipForTeam} disabled={flipping || seatedCount >= seatCount}>🪙 Flip for your team</button>
							{:else if ready}
								<span class="swaphint">🔒 locked in — unready to change</span>
							{:else}
								<span class="swaphint">tap an open seat to switch sides</span>
							{/if}
						</div>
						<div class="teams">
							<div class="teampanel orange">
								<div class="teamhdr"><span class="tflag"></span>Orange <span class="tcount">{orangeCount}/{half}</span></div>
								<div class="tseats">
									{#each orangeSeats as i (i)}
										{@const p = bySeat[i]}
										{#if p}
											<div class="tseat" class:mine={p.id === session?.clientId} class:isready={p.ready}>
												<div class="av" style="background:{colorHex(p.color)}">
													{#if p.id === $state.host}<span class="crown" title="Host">♛</span>{/if}
													{#if p.ready}<span class="rok" title="Ready">✓</span>{/if}
													{#if iAmHost && p.id !== session?.clientId}<button class="kick" title="Kick" on:click={() => kick(p.id)}>✕</button>{/if}
												</div>
												<div class="hn">{p.name}{p.id === session?.clientId ? ' (you)' : ''}</div>
											</div>
										{:else}
											<button class="tseat open" class:swap={!ready && !flipping} on:click={() => sit(i)} disabled={ready || flipping}><div class="av av-empty"></div><div class="hn muted">open</div></button>
										{/if}
									{/each}
								</div>
							</div>
							<div class="teampanel blue">
								<div class="teamhdr"><span class="tflag"></span>Blue <span class="tcount">{blueCount}/{seatCount - half}</span></div>
								<div class="tseats">
									{#each blueSeats as i (i)}
										{@const p = bySeat[i]}
										{#if p}
											<div class="tseat" class:mine={p.id === session?.clientId} class:isready={p.ready}>
												<div class="av" style="background:{colorHex(p.color)}">
													{#if p.id === $state.host}<span class="crown" title="Host">♛</span>{/if}
													{#if p.ready}<span class="rok" title="Ready">✓</span>{/if}
													{#if iAmHost && p.id !== session?.clientId}<button class="kick" title="Kick" on:click={() => kick(p.id)}>✕</button>{/if}
												</div>
												<div class="hn">{p.name}{p.id === session?.clientId ? ' (you)' : ''}</div>
											</div>
										{:else}
											<button class="tseat open" class:swap={!ready && !flipping} on:click={() => sit(i)} disabled={ready || flipping}><div class="av av-empty"></div><div class="hn muted">open</div></button>
										{/if}
									{/each}
								</div>
							</div>
						</div>
					</div>

					<div class="fld">
						<span>Your token {mySeat < 0 ? '· pick a colour, then flip in' : ready ? '· 🔒 locked in' : ''}</span>
						<div class="tokenrow">
							<div class="swatches">
								{#each PLAYER_COLORS as c (c.id)}
									<button title={c.label} aria-label={c.label} class="sw" class:sel={(mySeat < 0 ? pick : color) === c.id} disabled={takenColors.has(c.id) || (mySeat >= 0 && ready)} style="--sc:{c.hex}" on:click={() => pickColor(c.id)}></button>
								{/each}
							</div>
							{#if mySeat >= 0 && !ready}<button class="chip spec" on:click={spectate}>Spectate</button>{/if}
						</div>
						{#if spectators.length}
							<p class="specs">Spectating: {#each spectators as sp, i (sp.id)}{sp.name}{sp.id === session?.clientId ? ' (you)' : ''}{#if iAmHost && sp.id !== session?.clientId}<button class="kickx" title="Kick" on:click={() => kick(sp.id)}>✕</button>{/if}{i < spectators.length - 1 ? ', ' : ''}{/each}</p>
						{/if}
					</div>

					<div class="row wraprow">
						<button class="ghost" on:click={leaveRoom}>Leave</button>
						<div class="rightbtns">
							{#if iAmHost}
								<button class="ghost danger" on:click={closeGame}>Close</button>
								<button class="primary" disabled={!allReady} on:click={beginGame}>Begin</button>
							{/if}
							{#if mySeat >= 0}
								<button class="primary" class:isready={ready} on:click={toggleReady}>{ready ? '✓ Ready' : 'Ready up'}</button>
							{/if}
						</div>
					</div>
					{#if iAmHost && !allReady}<p class="hint">Everyone seated must ready up before you can begin.</p>{/if}
				</div>
			</div>
		{/if}
	</div>
</main>
</div>
{/if}

{#if coinShown}
	<div class="coinoverlay">
		<div class="coinstage">
			<div class="coin" style="transform: rotateY({coinRot}deg)">
				<img class="face front" src={coinOrange} alt="Orange" />
				<img class="face back" src={coinBlue} alt="Blue" />
			</div>
			<p class="coincap" class:done={coinDone}>{coinDone ? coinCaption : coinPending}</p>
		</div>
	</div>
{/if}

<style>
	/* the scaled canvas: sized to the window ÷ scale, then scaled back up/down.
	   --vw/--vh are 1% of the VIRTUAL viewport, for use inside it. */
	.uiscale { position: fixed; top: 0; left: 0; width: calc(100vw / var(--ui)); height: calc(100vh / var(--ui)); height: calc(100dvh / var(--ui));
		--vw: calc(1vw / var(--ui)); --vh: calc(1vh / var(--ui));
		transform: scale(var(--ui)); transform-origin: 0 0; overflow-x: hidden; overflow-y: auto; }
	.wrap { --hl: linear-gradient(120deg, #ef7d22, #2f7fe6); min-height: 100%; display: flex; flex-direction: column; align-items: center; padding: calc(5 * var(--vh)) 20px 32px; gap: 22px; color: #f1f5f9; }
	.home-link { background: none; border: none; padding: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 18px; transition: transform 0.6s cubic-bezier(0.2, 0.85, 0.2, 1); transform: translateY(0); }
	.logo { width: min(224px, 54 * var(--vw)); filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.55)); transition: width 0.6s cubic-bezier(0.2, 0.85, 0.2, 1), filter 0.6s ease; }
	/* landing splash: crest large & centred, morphs up-and-shrink into the menu */
	.home-link.hero { transform: translateY(calc(18 * var(--vh))); }
	.home-link.hero .logo { width: min(400px, 80 * var(--vw)); filter: drop-shadow(0 20px 60px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 40px rgba(245, 158, 11, 0.28)); animation: crestBreathe 3.6s ease-in-out infinite; }
	@keyframes crestBreathe { 0%, 100% { filter: drop-shadow(0 20px 60px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 34px rgba(245, 158, 11, 0.22)); } 50% { filter: drop-shadow(0 20px 60px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 52px rgba(245, 158, 11, 0.4)); } }
	.entrhint { font-family: 'Modesto Poster', serif; font-size: 1.1rem; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6); animation: hintPulse 2.2s ease-in-out infinite; }
	@keyframes hintPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

	.stage { position: relative; width: 100%; max-width: 1040px; transition: height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.step { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; }

	.notice { margin: 0; font-size: 0.85rem; color: #fca5a5; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 6px 12px; }

	.cards { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
	.card { background: rgba(12, 18, 32, 0.44); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); color: inherit; }
	.cards .card { width: 210px; padding: 28px 20px; display: flex; flex-direction: column; align-items: center; gap: 11px; cursor: pointer; transition: transform 0.15s, background 0.15s; }
	a.card { text-decoration: none; }
	.center { text-align: center; justify-content: center; }
	.cards .card:hover { transform: translateY(-4px); background: rgba(20, 28, 46, 0.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.ic { width: 62px; height: 62px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
	.t { font-size: 1.35rem; font-weight: 700; }
	.s { font-size: 0.78rem; color: #cbd5e1; }

	.card.form { padding: 18px 20px; display: flex; flex-direction: column; gap: 11px; width: 100%; }
	.form.narrow { width: min(380px, 92 * var(--vw)); }
	.form.wide { width: min(560px, 94 * var(--vw)); }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
	.col { display: flex; flex-direction: column; gap: 16px; }
	.fld { display: flex; flex-direction: column; gap: 7px; }
	.fld > span { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.lbl { font-size: 0.78rem; color: #94a3b8; }
	.field { width: 100%; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(8, 12, 22, 0.6); padding: 0.55rem 0.7rem; color: white; }
	.field.up { text-transform: uppercase; }
	.chips, .swatches { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.chips.two { display: grid; grid-template-columns: 1fr 1fr; }
	.chip { border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.05); color: #e5e7eb; border-radius: 999px; padding: 0.35rem 0.8rem; font-size: 0.85rem; cursor: pointer; }
	.chip.on { background: var(--hl); border-color: rgba(255, 255, 255, 0.3); color: white; }
	.sw { width: 1.1rem; height: 1.1rem; flex: none; border-radius: 50%; background: var(--sc); border: 2px solid rgba(255, 255, 255, 0.25); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); cursor: pointer; padding: 0; }
	.sw.sel { outline: 2px solid #f59e0b; outline-offset: 2px; border-color: #fff; }
	.sw:disabled { opacity: 0.28; cursor: not-allowed; }
	.hint { font-size: 0.72rem; color: #94a3b8; margin: 2px 0 0; }
	.hint.warn { color: #fca5a5; }
	.draftfld { border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px; margin-top: 1px; }
	.chip.star { letter-spacing: 1px; }
	.chip.locked { opacity: 0.4; cursor: not-allowed; filter: grayscale(1); }
	.joincols { display: flex; flex-direction: column; gap: 14px; }
	.joincols.two { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
	.jcol { display: flex; flex-direction: column; gap: 13px; min-width: 0; }
	.jcol.right { gap: 8px; }
	.joincols.two .jcol.right { border-left: 1px solid rgba(255, 255, 255, 0.09); padding-left: 22px; }
	.collbl { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
	.glist { display: flex; flex-direction: column; gap: 8px; max-height: 232px; overflow-y: auto; }
	.gcard { display: flex; align-items: center; gap: 12px; text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 10px 13px; color: #e5e7eb; cursor: pointer; transition: background 0.14s, border-color 0.14s, transform 0.12s; }
	.gcard:hover { background: rgba(255, 255, 255, 0.09); border-color: rgba(245, 158, 11, 0.45); transform: translateY(-1px); }
	.gcard:hover .garrow { opacity: 1; transform: translateX(2px); }
	.gdot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.6); flex: 0 0 auto; }
	.gdot.live { background: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.6); }
	.gmain { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
	.gtop { display: flex; align-items: baseline; gap: 8px; }
	.gtop b { font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.grc { font-size: 0.72rem; color: #64748b; letter-spacing: 0.08em; }
	.gsub { display: flex; align-items: center; gap: 9px; }
	.gseats { display: flex; gap: 3px; }
	.seatdot { width: 0.42rem; height: 0.42rem; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.35); }
	.seatdot.on { background: #e5e7eb; border-color: #e5e7eb; }
	.gstatus { font-size: 0.68rem; color: #94a3b8; white-space: nowrap; }
	.garrow { font-size: 0.75rem; font-weight: 600; color: #fdba74; opacity: 0.75; white-space: nowrap; transition: opacity 0.14s, transform 0.14s; }
	.err { color: #fca5a5; font-size: 0.82rem; margin: 0; }
	.row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
	.row.wraprow { flex-wrap: wrap; }
	.rightbtns { display: flex; gap: 8px; flex-wrap: wrap; }
	.primary { border: 1px solid rgba(255, 255, 255, 0.3); background: var(--hl); color: white; border-radius: 10px; padding: 0.55rem 1.2rem; cursor: pointer; font-weight: 600; }
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.primary.isready { background: #16a34a; border-color: #22c55e; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.ghost.danger { border-color: rgba(239, 68, 68, 0.5); color: #fca5a5; }
	.copybtn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.5rem 0.95rem; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.12s; }
	.copybtn:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.32); transform: translateY(-1px); }
	.copybtn .ci { display: inline-block; font-size: 0.95rem; line-height: 1; }
	.copybtn.done { background: rgba(22, 163, 74, 0.22); border-color: #22c55e; color: #bbf7d0; }
	.copybtn.done .ci { animation: pop 0.34s ease; }
	@keyframes pop { 0% { transform: scale(0.3); opacity: 0; } 55% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
	.roomline { margin: 0; font-size: 1.1rem; }
	.admincol { color: #fdba74; }
	.mono { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }

	.lobbyhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.headright { display: flex; align-items: center; gap: 12px; }
	.roomcode { font-size: 1.5rem; font-weight: 700; }
	.conn { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 600; color: #94a3b8; white-space: nowrap; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; }
	.conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; animation: blink 1s ease-in-out infinite; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; }
	.conn.closed .cdot { background: #ef4444; }
	@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
	.connbanner { margin: 0; font-size: 0.78rem; color: #fcd34d; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.32); border-radius: 8px; padding: 6px 12px; }

	/* teams */
	.teamstop { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
	.flipbtn { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #f1f5f9; border-radius: 999px; padding: 0.32rem 0.8rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: background 0.15s, transform 0.12s; }
	.flipbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.13); transform: translateY(-1px); }
	.flipbtn:disabled { opacity: 0.4; cursor: not-allowed; }
	.flipbtn.hero { background: var(--hl); border-color: rgba(255, 255, 255, 0.35); padding: 0.42rem 1rem; font-size: 0.85rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
	.swaphint { font-size: 0.72rem; color: #94a3b8; }
	.tseat.open:disabled { cursor: default; opacity: 0.7; }
	.tseat.open.swap:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.45); transform: translateY(-2px); }
	.teams { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.teampanel { border-radius: 14px; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.1); }
	.teampanel.orange { background: linear-gradient(180deg, rgba(216, 100, 26, 0.16), rgba(216, 100, 26, 0.05)); border-color: rgba(239, 125, 34, 0.4); }
	.teampanel.blue { background: linear-gradient(180deg, rgba(40, 112, 168, 0.16), rgba(40, 112, 168, 0.05)); border-color: rgba(47, 127, 230, 0.4); }
	.teamhdr { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; margin-bottom: 9px; }
	.tflag { width: 0.7rem; height: 0.7rem; border-radius: 3px; }
	.orange .tflag { background: #ef7d22; }
	.blue .tflag { background: #2f7fe6; }
	.tcount { margin-left: auto; font-size: 0.75rem; font-weight: 600; color: #cbd5e1; }
	.tseats { display: flex; gap: 8px; flex-wrap: wrap; }
	.tseat { flex: 1 1 78px; min-width: 72px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 10px; padding: 8px 4px; }
	.tseat.mine { border-color: rgba(245, 158, 11, 0.7); box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4); }
	.tseat.open { border-style: dashed; cursor: pointer; transition: background 0.14s, border-color 0.14s, transform 0.12s; }
	.av { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3); position: relative; }
	.av-empty { background: rgba(255, 255, 255, 0.05); border-style: dashed; }
	.crown { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); font-size: 13px; color: #fcd34d; }
	.kick { position: absolute; top: -6px; right: -6px; border: none; background: #b91c1c; color: #fff; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; line-height: 1; font-size: 11px; padding: 0; }
	.hn { font-size: 0.8rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hn.muted { color: #64748b; }
	.tseat.isready .av { box-shadow: 0 0 0 2px #16a34a, 0 0 8px rgba(22, 163, 74, 0.6); }
	.rok { position: absolute; bottom: -5px; right: -5px; width: 15px; height: 15px; border-radius: 50%; background: #16a34a; color: #fff; font-size: 10px; font-weight: 900; display: grid; place-items: center; border: 1.5px solid #0b0f17; }
	.tokenrow { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
	.tokenrow .swatches { flex: 1; min-width: 0; gap: 5px; flex-wrap: nowrap; }
	.chip.spec { flex: none; white-space: nowrap; padding: 0.3rem 0.7rem; font-size: 0.8rem; }
	.seattoast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 40; padding: 8px 16px; border-radius: 999px;
		background: rgba(9, 13, 22, 0.92); border: 1px solid rgba(199, 154, 78, 0.5); color: #f6ead2; font-weight: 700; font-size: 0.85rem; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
	.specs { font-size: 0.75rem; color: #94a3b8; margin: 8px 0 0; }
	.kickx { border: none; background: transparent; color: #fca5a5; cursor: pointer; font-size: 0.7rem; padding: 0 2px; }

	/* coin flip */
	.coinoverlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(6, 10, 20, 0.72); backdrop-filter: blur(3px); animation: fadein 0.25s ease; }
	.coinstage { display: flex; flex-direction: column; align-items: center; gap: 18px; perspective: 900px; }
	.coin { width: 150px; height: 150px; position: relative; transform-style: preserve-3d; transition: transform 1.55s cubic-bezier(0.2, 0.75, 0.2, 1); }
	.coin .face { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 50%; filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.55)); }
	.coin .back { transform: rotateY(180deg); }
	.coincap { margin: 0; font-size: 1.05rem; font-weight: 700; letter-spacing: 0.02em; color: #e2e8f0; }
	.coincap.done { color: #6ee7b7; }
	@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }

	@media (max-width: 560px) {
		.grid2 { grid-template-columns: 1fr; gap: 16px; }
	}
</style>
