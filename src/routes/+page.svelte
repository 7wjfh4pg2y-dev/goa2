<script lang="ts">
	import { teamName, aTeam } from '$lib/teams';
	import { sweepJournals } from '$lib/recorder';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { writable, get, type Readable } from 'svelte/store';
	import logoImage from '$lib/images/goa-logo.webp';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';
	import { reveal } from '$lib/transitions';
	import { role, tryAdmin, enterAsPlayer, signOut } from '$lib/role';
	import { availableMaps, type MapChoice, type GameMap } from '$lib/maps';
	import { announceRoom, browseRooms, type RoomInfo } from '$lib/lobby';
	import { claimIdentity, tabClientId, writeTicket, clearTicket, type ResumeTicket } from '$lib/identity';
	import { colorMoves } from '$lib/seatcolor';
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
		, boardLookOf, zoneGlowOf, boardFxOf
	} from '$lib/match';
	import { HEROES } from '$lib/heroes';
	import { initCards } from '$lib/cards/cardstate';
	import HeroDraft from '$lib/HeroDraft.svelte';
	import GameView from '$lib/GameView.svelte';
	// the pre-game screens: the Tide theme (tide.css is global; pregame.css adds what only these screens use)
	import '$lib/ui/pregame.css';
	import SeaBackdrop from '$lib/ui/SeaBackdrop.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import BoardCanvas from '$lib/BoardCanvas.svelte';

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
	// desktop: a virtual 1440×900 canvas scaled to fit. Phones (≤760px wide) render at
	// real size instead — their own portrait CSS takes over (see @media max-width 760px).
	let mobile = false; // phone layout (≤760px wide): also tells the backdrop how to stage the island
	let portrait = false; // a tablet held upright: the menu column is centred over the island
	const fitUi = () => { if (browser) { mobile = innerWidth <= 760; portrait = innerWidth < innerHeight; ui = mobile ? 1 : Math.min(2.2, Math.max(0.7, Math.min(innerWidth / 1440, innerHeight / 900))); } };
	fitUi();
	let coinCaption = '';
	let coinPending = 'Flipping…'; // caption while the coin spins
	let coinSide: Team = 'orange'; // where this flip lands (tints the caption once it has)
	let coinLabel = 'Coin flip'; // the small heading over the coin
	let coinSub = ''; // a quiet second line once it has landed

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
		sweepJournals();
		ensureLoaded(); // the maps: the backdrop shows the island from the first screen on
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

	$: chosenMap = maps.find((m) => m.id === mapId) ?? maps[0];
	// (a map may carry its own wave counts per game length — the same rule initialMatchState applies)
	const mapWaves = (m: GameMap | null | undefined, len: 'quick' | 'long') => m?.waves?.[len] ?? wavesFor(len);
	$: previewWaves = ruleset === 'custom' ? customWaves : mapWaves(chosenMap?.data, ruleset);
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
	// the host's board options, as the lobby shows them
	$: lobbyLook = boardLookOf({ boardLook: $state.boardLook });
	$: lobbyGlow = zoneGlowOf({ zoneGlow: $state.zoneGlow });
	$: lobbyFx = boardFxOf({ boardFx: $state.boardFx });
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
	// Two players sitting down together can both take the first free colour (each picked
	// before the other's presence arrived). Settle it the same way on every client
	// (seatcolor.ts: whoever took the colour first keeps it, the other moves on) — but only
	// once my own presence shows the colour I hold, so a move is never made twice. Not in
	// the game: by then the hero pieces carry their colours.
	$: if (session && me && !$state.started && color !== 'spectator' && me.color === color) settleColor($players);
	function settleColor(list: Player[]) {
		const to = colorMoves(list, PLAYER_COLORS.map((c) => c.id))[session!.clientId];
		if (!to) return;
		color = to;
		session!.setSelf({ color: to });
		writeActive({ color: to });
	}
	$: orangeSeats = Array.from({ length: half }, (_, i) => i);
	$: blueSeats = Array.from({ length: seatCount - half }, (_, i) => half + i);
	$: orangeCount = seated.filter((p) => p.seat < half).length;
	$: blueCount = seatedCount - orangeCount;

	// --- how the screens are staged (presentation only) ---
	// landing → join share one left column (crest + a stage of steps); create and lobby are their own screens
	$: family = mode === 'landing' || mode === 'choose' || mode === 'admin' || mode === 'adminhub' || mode === 'menu' || mode === 'join';
	// the island behind: large beside the column, pushed away and dimmed behind a form
	$: bgScene = (mode === 'landing' ? 'landing' : mode === 'lobby' ? 'lobby' : mode === 'create' || ((mobile || portrait) && (mode === 'join' || mode === 'admin')) ? 'form' : 'menu') as 'landing' | 'menu' | 'form' | 'lobby';
	$: bgMap = (mode === 'lobby' ? $state.map : null) ?? chosenMap?.data ?? null;
	// the lobby's caption under the live board: the real numbers of this room
	$: lobbyMapName = $state.map?.name?.trim() || maps.find((m) => m.id === $state.mapId)?.label || 'The board';
	$: lobbyWaves = $state.wavesMax;
	$: lobbyLife = $state.lifeMax;
	$: lobbyLength = lobbyLife === lifeFor('quick', seatCount) && lobbyWaves === mapWaves($state.map, 'quick') ? 'Quick game'
		: lobbyLife === lifeFor('long', seatCount) && lobbyWaves === mapWaves($state.map, 'long') ? 'Long game' : 'Custom game';
	// the live boards are pictures here: staged so the island sits clear of the caption
	let lobbyBoard: BoardCanvas | null = null;
	let createBoard: BoardCanvas | null = null;
	$: if (lobbyBoard) lobbyBoard.place(0.5, mobile ? 0.5 : 0.46, mobile ? 2.3 : 0.94);
	$: if (createBoard) createBoard.place(0.5, mobile ? 0.5 : 0.44, mobile ? 1.5 : 1.04);
	const initial = (n: string) => (n.trim()[0] ?? '?').toUpperCase();
	$: myColorLabel = PLAYER_COLORS.find((c) => c.id === (mySeat < 0 ? pick : color))?.label ?? '';

	// react to shared game transitions. The tie-breaker coin plays first (on Begin);
	// once it lands the host builds the draft, so everyone enters the draft screen,
	// then the board when the draft is done.
	$: if (mode === 'lobby' && $state.draft && !$state.started && !coinShown) mode = 'draft';
	$: if ((mode === 'lobby' || mode === 'draft') && $state.started && !coinShown) mode = 'game';
	$: if ((mode === 'lobby' || mode === 'draft' || mode === 'game') && $state.closed) bail('The host closed the game.');
	// host sets the board up once, when it first appears: the minions stand ready and
	// every hero waits off the board until its player places it on a base spawn point
	$: if (mode === 'game' && iAmHost && session && $state.draft && !Object.keys($state.pieces).length && !$state.toSpawn) {
		const s = get(state);
		session.update({
			pieces: placeMinions(s),
			toSpawn: placeHeroes(s, get(players)),
			cards: initCards(s.draft?.picks ?? {}),
			// keep owners recorded at draft start (someone may be mid-reconnect)
			seatMap: { ...(s.seatMap ?? {}), ...buildSeatMap(get(players), s.seats) }
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

	// (host hand-over lives in match.ts: a grace period, seat order, an epoch so a stale
	// update can't undo it, and the creator takes the role back when they're here)

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
	// Land straight in whatever stage the room is at. (Going via 'lobby' and
	// relying on the lobby→draft/game rules above doesn't work: those ran earlier
	// in this same update, so a rejoiner sat in the ready-up screen until the
	// next state change — forever, if everyone else had already picked.)
	$: if (joining && $state.rev >= 0) {
		joining = false; resumeSeed = null;
		mode = $state.started ? 'game' : $state.draft ? 'draft' : 'lobby';
	}
	// Re-apply a remembered seat + colour once the room's state has arrived, in ANY
	// mode — a player rejoining a game already in draft/board must get their seat
	// (and hero) back, not come back as a spectator.
	$: if (pendingSeat >= 0 && $state.rev >= 0 && session) {
		const st = pendingSeat; pendingSeat = -1;
		const c = pendingColor || firstFreeColor(); pendingColor = '';
		if (!takenSeats.has(st)) { color = c; session.setSelf({ seat: st, color: c }); writeActive({ seat: st, color: c }); }
	}
	// Once the draft has started the room records who owns each seat (seatMap).
	// If one is yours and it's free, sit back down — covers rejoining by room code
	// (after a kick, or from a fresh tab), not just an auto-resume.
	let reclaimFor: unknown = null;
	$: if (session && reclaimFor !== session && $state.rev >= 0 && pendingSeat < 0 && mySeat < 0 && $state.seatMap) {
		const owned = Object.entries($state.seatMap).find(([, o]) => o.id === session?.clientId);
		if (owned) {
			reclaimFor = session;
			const st = Number(owned[0]);
			if (!takenSeats.has(st)) {
				const c = color !== 'spectator' ? color : firstFreeColor();
				color = c; session.setSelf({ seat: st, color: c }); writeActive({ seat: st, color: c });
			}
		}
	}
	// Spin the coin so it actually animates: mount at the current angle, then bump
	// the rotation on the next frame so the CSS transition has something to run
	// from (otherwise it appears already at the final face — the "only blue" bug).
	function playCoin(side: Team, opts: { caption?: string; pending?: string; label?: string; sub?: string; after?: () => void } = {}) {
		coinShown = true; coinDone = false;
		coinCaption = opts.caption ?? `You’re ${aTeam(side)}!`;
		coinPending = opts.pending ?? 'Flipping…';
		coinSide = side; coinLabel = opts.label ?? 'Coin flip'; coinSub = opts.sub ?? '';
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
			caption: `The ${teamName(side)} go first`,
			label: 'Tie-breaker', sub: 'The hero draft begins in a moment…',
			after: () => { if (iAmHost) startDraft(side); }
		});
	}
	// host builds the shared draft from the seed config; the tie-breaker winner drafts first
	function startDraft(startingTeam: Team) {
		const pool = HEROES.filter((hr) => $state.draftStars.includes(hr.stars)).map((hr) => hr.id);
		const d = buildDraft($state.draftSystem, pool, $players, $state.seats, startingTeam);
		session?.update({ draft: d, startFlip: null, seatMap: buildSeatMap($players, $state.seats), gameId: Date.now().toString(36) });
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
		// leave the probing session first: the Supabase client has ONE channel per room, and a second
		// session would be handed the first one's (already subscribed → "cannot add presence callbacks")
		session?.leave();
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
	// team-join flip captions, shown to everyone: "X is flipping…" → "X joins the Atlanteans!"
	const flipCaps = (who: string, side: Team) => ({ pending: `${who} is flipping…`, caption: `${who} joins the ${teamName(side)}!` });
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

<!-- one team's panel in the lobby: the material header, its seats, the faint coin in the corner -->
{#snippet teamPanel(team: Team, seats: number[], count: number)}
	<section class="teamcard" class:is-orange={team === 'orange'} class:is-blue={team === 'blue'} aria-label={teamName(team)}>
		<div class="band" class:band--copper={team === 'orange'} class:band--ice={team === 'blue'}>
			<img src={team === 'orange' ? coinOrange : coinBlue} alt="" />{teamName(team)}<span class="band-count">{count} / {seats.length}</span>
		</div>
		<div class="tseats" class:many={seats.length > 3}>
			<img class="teammark" src={team === 'orange' ? coinOrange : coinBlue} alt="" />
			{#each seats as i (i)}
				{@const p = bySeat[i]}
				{#if p}
					{@const mine = p.id === session?.clientId}
					<div class="tseat seat" class:seat--me={mine} class:mine class:seat--ready={p.ready} class:isready={p.ready}>
						<span class="token" style="--pc:{colorHex(p.color)}">
							{#if p.id === $state.host}<span class="crown" title="Host"><Icon name="crown" fill /></span>{/if}
							{initial(p.name)}
							{#if p.ready}<span class="badge" title="Ready"><Icon name="check" /></span>{/if}
						</span>
						<span class="seat-body">
							<span class="seat-top">
								<span class="seat-name">{p.name}</span>
								{#if mine}<span class="tag">You</span>{/if}
								{#if p.id === $state.host}<span class="tag hosttag">Host</span>{/if}
							</span>
							<span class="state" class:is-ready={p.ready}>{#if p.ready}<Icon name="check" /> Ready{:else}Not ready{/if}</span>
						</span>
						{#if iAmHost && !mine}<button class="seat-kick kick" title="Kick" aria-label="Kick {p.name}" on:click={() => kick(p.id)}><Icon name="x" /></button>{/if}
					</div>
				{:else}
					<button class="tseat open seat seat--open" class:swap={!ready && !flipping} on:click={() => sit(i)} disabled={ready || flipping}>
						<span class="token"><Icon name="plus" /></span>
						<span class="seat-body"><span class="seat-name">Open <span class="deskonly">seat</span></span><span class="state">{#if ready || flipping}Empty{:else}Tap to {mySeat < 0 ? 'sit' : 'move'} <span class="deskonly">here</span>{/if}</span></span>
					</button>
				{/if}
			{/each}
		</div>
	</section>
{/snippet}

{#if mode === 'draft' && session}
	<div class="uiscale" style="--ui:{ui}">
		<HeroDraft {session} {state} {players} clientId={session.clientId} onLeave={leaveRoom} />
	</div>
{:else if mode === 'game' && session}
	<GameView {session} ms={state} {players} clientId={session.clientId} {room} onLeave={leaveRoom} />
	{#if seatNotice}<div class="seattoast">{seatNotice}</div>{/if}
{:else}
<SeaBackdrop scene={bgScene} map={bgMap} mobile={mobile || (portrait && family)} effects={mode !== 'lobby'} />
<div class="uiscale tide pre" style="--ui:{ui}">
	{#if family}
		<!-- landing · role · admin · menu · join: the crest and one column of steps beside the island -->
		<main class="screen s-col" class:landing={mode === 'landing'} class:compact={mode === 'join' || mode === 'admin'} transition:reveal>
			<div class="leftcol">
				<button id="crest-home" class="home" on:click={onLogo} aria-label={mode === 'landing' ? 'Enter' : 'Main menu'}>
					<img class="logo" src={logoImage} alt="Guards of Atlantis II" />
				</button>
				<div class="stage" style:height={stageH ? stageH + 'px' : ''}>
					{#if mode === 'landing'}
						<div class="step enterstep" transition:reveal bind:clientHeight={h['landing']}>
							<!-- the crest above is the button; this is its big visible label -->
							<label class="btn btn-duo btn-lg enter" for="crest-home">Enter</label>
							{#if joining}<p class="t-small rejoin">Rejoining room {room}…</p>{/if}
						</div>
					{:else if mode === 'choose'}
						<div class="step" transition:reveal bind:clientHeight={h['choose']}>
							<header class="head"><span class="t-label">Guards of Atlantis II</span><h1 class="t-h1">Choose your role</h1></header>
							{#if notice}<p class="alert notice">{notice}</p>{/if}
							<div class="choices">
								<button class="choice card p" on:click={goPlayer}>
									<span class="choice-ic"><Icon name="user" /></span>
									<span class="choice-txt"><span class="t-h2">Player</span><span class="t-body c-muted">Join or create a match</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</button>
								<button class="choice card a" on:click={() => (mode = 'admin')}>
									<span class="choice-ic"><Icon name="wrench" /></span>
									<span class="choice-txt"><span class="t-h2">Admin</span><span class="t-body c-muted">GM tools</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</button>
							</div>
						</div>
					{:else if mode === 'admin'}
						<div class="step" transition:reveal bind:clientHeight={h['admin']}>
							<header class="head"><span class="t-label">Admin</span><h1 class="t-h1">Enter the password</h1></header>
							<section class="panel formpanel">
								<label class="fld"><span class="t-label">Password</span><input class="field" class:is-error={pwError} type="password" placeholder="Password" bind:value={pw} on:keydown={onKey} autocomplete="off" /></label>
								{#if pwError}<p class="msg-error err">Incorrect password.</p>{/if}
								<div class="row">
									<button class="btn btn-ghost" on:click={() => (mode = 'choose')}><Icon name="back" /> Back</button>
									<button class="btn btn-primary" on:click={submitAdmin} disabled={busy || !pw}>{busy ? 'Checking…' : 'Unlock'}</button>
								</div>
							</section>
						</div>
					{:else if mode === 'adminhub'}
						<div class="step" transition:reveal bind:clientHeight={h['adminhub']}>
							<header class="head"><span class="t-label">You're in as Admin</span><h1 class="t-h1">GM tools</h1></header>
							<div class="choices">
								<button class="choice card p" on:click={() => (mode = 'menu')}>
									<span class="choice-ic"><Icon name="plus" /></span>
									<span class="choice-txt"><span class="t-h2">Create / Join</span><span class="t-body c-muted">Run a game</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</button>
								<a class="choice card a" href={base + '/editor'}>
									<span class="choice-ic"><Icon name="pen" /></span>
									<span class="choice-txt"><span class="t-h2">Map editor</span><span class="t-body c-muted">Paint maps & battle zones</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</a>
							</div>
							<div class="row"><button class="btn btn-ghost on-art" on:click={goHome}>Sign out</button></div>
						</div>
					{:else if mode === 'menu'}
						<div class="step" transition:reveal bind:clientHeight={h['menu']}>
							<header class="head"><span class="t-label">{$role === 'admin' ? 'Admin' : 'Player'}</span><h1 class="t-h1">Play a game</h1></header>
							{#if notice}<p class="alert notice">{notice}</p>{/if}
							<div class="choices">
								<button class="choice card p" on:click={() => (mode = 'create')}>
									<span class="choice-ic"><Icon name="plus" /></span>
									<span class="choice-txt"><span class="t-h2">Create game</span><span class="t-body c-muted">Set the ruleset & map</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</button>
								<button class="choice card a" on:click={() => { room = ''; joinError = ''; mode = 'join'; }}>
									<span class="choice-ic"><Icon name="join" /></span>
									<span class="choice-txt"><span class="t-h2">Join game</span><span class="t-body c-muted">Enter a room code</span></span>
									<span class="choice-go"><Icon name="go" /></span>
								</button>
							</div>
							<p class="t-small note">The crest takes you back to the start.</p>
						</div>
					{:else if mode === 'join'}
						<div class="step" transition:reveal bind:clientHeight={h['join']}>
							<header class="head"><span class="t-label">{$role === 'admin' ? 'Admin' : 'Player'}</span><h1 class="t-h1">Join a game</h1></header>
							<section class="panel formpanel">
								<label class="fld"><span class="t-label">Name</span><input class="field" bind:value={name} placeholder="Your name" /></label>
								<label class="fld"><span class="t-label">Room code</span><input class="field field--code up" class:is-error={!!joinError} bind:value={room} on:input={() => (joinError = '')} maxlength="8" placeholder="Code" /></label>
								{#if joinError}<p class="msg-error err">{joinError}</p>{/if}
								<div class="row">
									<button class="btn btn-ghost" on:click={() => (mode = 'menu')}><Icon name="back" /> Back</button>
									<button class="btn btn-primary" on:click={joinGame} disabled={!room.trim() || !name.trim() || joining}>{joining ? 'Joining…' : 'Join game'}</button>
								</div>
							</section>
							{#if openRooms.length}
								<section class="panel openpanel">
									<span class="t-label">Open games</span>
									<div class="glist">
										{#each openRooms as r (r.room)}
											{@const spectate = r.started || r.count >= r.seats}
											<button class="listrow gcard" on:click={() => joinFromList(r)}>
												<span class="state" class:is-live={r.started}></span>
												<span class="who">
													<span class="t-h3">{r.host} <span class="t-small t-mono">{r.room}</span></span>
													<span class="sub">
														<span class="seatdots">{#each Array(r.seats) as _, i (i)}<i class:on={i < r.count}></i>{/each}</span>
														<span class="t-small">{r.started ? 'in progress' : `${r.count} / ${r.seats} seated`}</span>
													</span>
												</span>
												<span class="go">{spectate ? 'Spectate' : 'Join'} <Icon name="go" /></span>
											</button>
										{/each}
									</div>
								</section>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</main>
	{:else if mode === 'create'}
		<main class="screen s-create" transition:reveal>
			<div class="cwrap">
				<section class="panel cbox">
					<header class="chead">
						<button class="home" on:click={onLogo} aria-label="Main menu"><img class="logo" src={logoImage} alt="Guards of Atlantis II" /></button>
						<h1 class="t-h1">Create game</h1>
					</header>
					<div class="cbody">
						<div class="cform">
							<div class="cgrid ctop">
								<div class="ccol">
									<label class="fld g-name"><span class="t-label">Your name</span><input class="field" bind:value={name} placeholder="Your name" /></label>
									<div class="fld g-length">
										<span class="t-label">Game length</span>
										<div class="seg seg--fill">
											<button class="seg-opt has-sub" class:is-on={ruleset === 'quick'} on:click={() => (ruleset = 'quick')}>Quick<span class="sub">{mapWaves(chosenMap?.data, 'quick')} waves · {lifeFor('quick', playerCount)} Life</span></button>
											<button class="seg-opt has-sub" class:is-on={ruleset === 'long'} on:click={() => (ruleset = 'long')}>Long<span class="sub">{mapWaves(chosenMap?.data, 'long')} waves · {lifeFor('long', playerCount)} Life</span></button>
											<button class="seg-opt has-sub" class:is-on={ruleset === 'custom'} on:click={() => (ruleset = 'custom')}>Custom<span class="sub">Set your own</span></button>
										</div>
										{#if ruleset === 'custom'}
											<div class="custom">
												<span class="cust"><span class="t-small">Waves</span>
													<span class="stepper"><button on:click={() => (customWaves = Math.max(1, customWaves - 1))} disabled={customWaves <= 1} aria-label="Fewer waves"><Icon name="minus" /></button><b>{customWaves}</b><button on:click={() => (customWaves = Math.min(7, customWaves + 1))} disabled={customWaves >= 7} aria-label="More waves"><Icon name="plus" /></button></span>
												</span>
												<span class="cust"><span class="t-small">Life <span class="deskonly">per team</span></span>
													<span class="stepper"><button on:click={() => (customLife = Math.max(3, customLife - 1))} disabled={customLife <= 3} aria-label="Less life"><Icon name="minus" /></button><b>{customLife}</b><button on:click={() => (customLife = Math.min(10, customLife + 1))} disabled={customLife >= 10} aria-label="More life"><Icon name="plus" /></button></span>
												</span>
											</div>
										{/if}
									</div>
									<div class="fld g-seats">
										<span class="t-label">Players (seats)</span>
										<div class="seg seg--fill">
											{#each [4, 6, 8, 10] as n (n)}
												<button class="seg-opt has-sub" class:is-on={playerCount === n} class:is-soon={n > 6} class:locked={n > 6} disabled={n > 6} title={n > 6 ? 'Coming soon' : ''} on:click={() => (playerCount = n)}>{n}{#if n > 6}<span class="soon">soon</span>{:else}<span class="sub">{n / 2} v {n / 2}</span>{/if}</button>
											{/each}
										</div>
									</div>
								</div>
								<i class="vrule"></i>
								<div class="fld g-map">
									<span class="t-label">Map</span>
									<div class="mapbox">
										<div class="boardframe mapframe">
											{#if chosenMap}<BoardCanvas bind:this={createBoard} map={chosenMap.data} look="island" interactive={false} pieces={[]} effects={false} />{/if}
											<div class="cap mapcap"><span><b>{chosenMap?.label ?? 'No map'}</b></span></div>
										</div>
										<div class="mapmeta">
											<div class="t-h3 mapname">{chosenMap?.label ?? 'No map'}</div>
											{#if maps.length > 1}
												<div class="mapchips">{#each maps as m (m.id)}<button class="chip" class:is-on={mapId === m.id} on:click={() => (mapId = m.id)}>{m.label}</button>{/each}</div>
											{:else}
												<span class="tag"><Icon name="check" /> Selected</span>
											{/if}
											<p class="t-small msum">{previewWaves} waves · {previewLife} Life per team · {playerCount} seats</p>
										</div>
									</div>
								</div>
							</div>
							<hr class="rule crule" />
							<div class="cgrid cbot">
								<div class="fld g-draft">
									<span class="t-label">Hero draft</span>
									<div class="seg seg--fill seg--grid">
										{#each DRAFT_SYSTEMS as sys (sys)}
											<button class="seg-opt has-sub" class:is-on={draftSystem === sys} class:is-soon={sys !== 'all-pick'} class:locked={sys !== 'all-pick'} disabled={sys !== 'all-pick'} title={sys !== 'all-pick' ? 'Coming soon' : ''} on:click={() => (draftSystem = sys)}>{DRAFT_LABELS[sys]}{#if sys !== 'all-pick'}<span class="soon">soon</span>{:else}<span class="sub">Everyone picks at once</span>{/if}</button>
										{/each}
									</div>
								</div>
								<i class="vrule"></i>
								<div class="fld g-cx">
									<span class="t-label">Hero complexity</span>
									<div class="cxchips">
										{#each [1, 2, 3, 4] as s (s)}
											<button class="chip star" class:is-on={draftStars.includes(s)} class:is-soon={s === 4} class:locked={s === 4} disabled={s === 4}
												title={s === 4 ? '4★ heroes coming soon' : ''} aria-label="{s} star{s > 1 ? 's' : ''}{s === 4 ? ', coming soon' : ''}" on:click={() => toggleStar(s)}>
												<span class="stars">{#each Array(s) as _, k (k)}<Icon name="star" fill />{/each}</span>{#if s === 4}<span class="soon">soon</span>{/if}
											</button>
										{/each}
									</div>
									<p class="t-small cxhint">Light up every complexity you want in the hero pool. 4-star heroes are coming soon.</p>
								</div>
							</div>
							{#if poolShort}
								<p class="alert warn">Only {eligibleCount} heroes — need {poolNeed} for {DRAFT_LABELS[draftSystem]} with {playerCount} players.</p>
							{/if}
						</div>
					</div>
					<footer class="cfoot">
						<button class="btn btn-ghost" on:click={() => (mode = 'menu')}><Icon name="back" /> Back</button>
						<div class="csum"><span class="pill">{previewWaves} waves</span><span class="pill">{previewLife} Life per team</span><span class="pill">{playerCount} seats</span><span class="pill" class:pill--bad={poolShort}>{eligibleCount} heroes in the pool</span></div>
						<button class="btn btn-primary createbtn" on:click={createGame} disabled={poolShort || !name.trim()}>Create game</button>
					</footer>
				</section>
			</div>
		</main>
	{:else if mode === 'lobby'}
		<main class="screen s-lobby" transition:reveal>
			<div class="lbox">
				<div class="lbody">
					<header class="lhead">
						<div class="ltop">
							<button class="home" on:click={onLogo} aria-label="Main menu"><img class="logo" src={logoImage} alt="Guards of Atlantis II" /></button>
							<div class="roomblock"><span class="t-label lbl">Room <span class="deskonly">code</span></span><span class="t-display t-mono roomcode">{room}</span></div>
							<button class="btn btn-secondary copybtn" class:done={copied} on:click={copyLink} aria-label="Copy invite link">
								<Icon name={copied ? 'check' : 'link'} /><span>{#if copied}<span class="deskonly">Link</span> copied{:else}Invite <span class="deskonly">link</span>{/if}</span>
							</button>
						</div>
						<div class="lyou">
							<span class="pill conn {$connStatus}" class:pill--ok={$connStatus === 'connected'} class:pill--warn={$connStatus === 'connecting' || $connStatus === 'reconnecting'} class:pill--bad={$connStatus === 'closed'} title="Realtime connection">
								<span class="dot cdot"></span><span class="connlbl">{connLabel($connStatus)}</span>
							</span>
							<!-- one slot: flip in while spectating, step out to spectate while seated -->
							{#if mySeat < 0}
								<span class="t-h3 you">Tap <span class="deskonly">an open</span><span class="phoneonly">a</span> seat, or</span>
								<button class="btn btn-duo btn-sm flipbtn hero" on:click={flipForTeam} disabled={flipping || seatedCount >= seatCount}><Icon name="coin" /> Flip for your team</button>
							{:else}
								<span class="t-h3 you">You are <span class="youteam {myTeam}" class:c-orange={myTeam === 'orange'} class:c-blue={myTeam === 'blue'}>{aTeam(myTeam)}</span></span>
								{#if ready}
									<span class="t-small swaphint"><Icon name="lock" /> Locked in <span class="deskonly">— unready to change</span></span>
								{:else}
									<button class="btn btn-secondary btn-sm flipbtn" on:click={spectate}><Icon name="eye" /> Spectate</button>
								{/if}
							{/if}
						</div>
					</header>
					{#if $connStatus === 'reconnecting' || $connStatus === 'closed'}
						<p class="alert alert--warn connbanner">Connection lost — trying to reconnect. Your seat is held.</p>
					{/if}

					<div class="ltable">
						{@render teamPanel('orange', orangeSeats, orangeCount)}
						<div class="boardframe lboard" class:classic={lobbyLook === 'classic'}>
							{#if $state.map}
								<BoardCanvas bind:this={lobbyBoard} map={$state.map} look={lobbyLook} glowZone={lobbyGlow && lobbyLook === 'island' ? 'Center' : null} effects={lobbyFx} interactive={false} pieces={[]} />
							{/if}
							<div class="cap"><span><b>{lobbyMapName}</b> · {lobbyLength.replace(' game', '')} <span class="deskonly">game</span> · {lobbyWaves} waves · {lobbyLife} Life <span class="deskonly">per team</span></span></div>
						</div>
						{@render teamPanel('blue', blueSeats, blueCount)}
					</div>

					<section class="panel setup">
						<div class="scol">
							<div class="lblrow">
								<span class="t-label">Your token</span>
								<span class="t-small hint">{#if mySeat < 0}Pick a colour, then flip in or tap a seat.{:else if ready}<Icon name="lock" /> {myColorLabel}. Locked in.{:else}{myColorLabel}. <span class="deskonly">Change it any time before you ready up.</span>{/if}</span>
							</div>
							<div class="swatches">
								{#each PLAYER_COLORS as c (c.id)}
									<button title={c.label} aria-label={c.label} class="swatch sw" class:is-on={(mySeat < 0 ? pick : color) === c.id} class:sel={(mySeat < 0 ? pick : color) === c.id} class:is-locked={!takenColors.has(c.id)} disabled={takenColors.has(c.id) || (mySeat >= 0 && ready)} style="--sc:{c.hex}" on:click={() => pickColor(c.id)}></button>
								{/each}
							</div>
							{#if spectators.length}
								<p class="t-small specs"><span class="speclbl">Spectating:</span>{#each spectators as sp (sp.id)}<span class="spec"><span class="c-ink">{sp.name}{sp.id === session?.clientId ? ' (you)' : ''}</span>{#if iAmHost && sp.id !== session?.clientId}<button class="seat-kick kickx" title="Kick" aria-label="Kick {sp.name}" on:click={() => kick(sp.id)}><Icon name="x" /></button>{/if}</span>{/each}</p>
							{/if}
						</div>
						<i class="vrule"></i>
						<div class="scol">
							<div class="lblrow">
								<span class="t-label">The board</span>
								<span class="t-small hint">{#if iAmHost}You are the host. <span class="deskonly">Everyone sees what you choose.</span>{:else}The host’s choice. <span class="deskonly">Everyone plays on this board.</span>{/if}</span>
							</div>
							<!-- the host's board options (everyone sees what was chosen) -->
							<div class="boardopts">
								<div class="fld optfld">
									<span class="t-label bolbl">Map visuals</span>
									<div class="seg seg--fill" class:is-readonly={!iAmHost}>
										<button class="seg-opt" class:is-on={lobbyLook === 'island'} disabled={!iAmHost} on:click={() => session?.update({ boardLook: 'island' })}>Island</button>
										<button class="seg-opt" class:is-on={lobbyLook === 'classic'} disabled={!iAmHost} on:click={() => session?.update({ boardLook: 'classic' })}>Classic</button>
									</div>
								</div>
								<div class="fld optfld">
									<span class="t-label bolbl">Battle zone outline</span>
									<div class="seg seg--fill" class:is-readonly={!iAmHost}>
										<button class="seg-opt" class:is-on={lobbyGlow} disabled={!iAmHost || lobbyLook !== 'island'} on:click={() => session?.update({ zoneGlow: true })}>On</button>
										<button class="seg-opt" class:is-on={!lobbyGlow} disabled={!iAmHost || lobbyLook !== 'island'} on:click={() => session?.update({ zoneGlow: false })}>Off</button>
									</div>
								</div>
								<div class="fld optfld">
									<span class="t-label bolbl" title="The moving sea, the minions' turning rims and the battle zone's pulse">Moving effects</span>
									<div class="seg seg--fill" class:is-readonly={!iAmHost}>
										<button class="seg-opt" class:is-on={lobbyFx} disabled={!iAmHost} on:click={() => session?.update({ boardFx: true })}>On</button>
										<button class="seg-opt" class:is-on={!lobbyFx} disabled={!iAmHost} on:click={() => session?.update({ boardFx: false })}>Off</button>
									</div>
								</div>
							</div>
						</div>
					</section>
				</div>

				<!-- the host's way out is Close (ends the room for everyone); guests just Leave -->
				<footer class="panel panel--bar lactions lobbybtns">
					{#if iAmHost}
						<button class="btn btn-danger leave" on:click={closeGame}>Close</button>
					{:else}
						<button class="btn btn-ghost on-art leave" on:click={leaveRoom}>Leave</button>
					{/if}
					{#if iAmHost && !allReady}<p class="t-small lhint">Everyone seated must ready up<span class="deskonly">{' '}before you can begin</span>.</p>{:else if !iAmHost && mySeat >= 0 && ready}<p class="t-small lhint">Waiting for the host to begin.</p>{/if}
					{#if mySeat >= 0}
						<button class="btn btn-ready btn-lg" class:is-on={ready} class:isready={ready} on:click={toggleReady}>{#if ready}<Icon name="check" /> Ready{:else}Ready up{/if}</button>
					{/if}
					{#if iAmHost}
						<button class="btn btn-primary btn-lg" disabled={!allReady} on:click={beginGame}>Begin</button>
					{/if}
				</footer>
			</div>
		</main>
	{/if}
	{#if seatNotice}<div class="toast toast--plain pretoast">{seatNotice}</div>{/if}
</div>
{/if}

{#if coinShown}
	<div class="tide overlay coinoverlay" style="--ui:{ui}" role="status" aria-live="polite">
		<div class="coinstage">
			<span class="t-label">{coinLabel}</span>
			<div class="coinring" class:done={coinDone} class:is-orange={coinSide === 'orange'} class:is-blue={coinSide === 'blue'}>
				<div class="coin" style="transform: rotateY({coinRot}deg)">
					<img class="face front" src={coinOrange} alt="Atlanteans" />
					<img class="face back" src={coinBlue} alt="Titans" />
				</div>
			</div>
			<p class="t-h1 coincap" class:done={coinDone} class:or={coinSide === 'orange'} class:bl={coinSide === 'blue'}>{coinDone ? coinCaption : coinPending}</p>
			<p class="t-body c-muted coinsub">{coinDone ? coinSub : ''}</p>
		</div>
	</div>
{/if}

<style>
	/* the scaled canvas: sized to the window ÷ scale, then scaled back up/down.
	   --vw/--vh are 1% of the VIRTUAL viewport, for use inside it. (The draft sits in one too.) */
	.uiscale { position: fixed; top: 0; left: 0; width: calc(100vw / var(--ui)); height: calc(100vh / var(--ui)); height: calc(100dvh / var(--ui));
		--vw: calc(1vw / var(--ui)); --vh: calc(1vh / var(--ui));
		transform: scale(var(--ui)); transform-origin: 0 0; overflow-x: hidden; overflow-y: auto; }
	/* the pre-game screens sit over the sea backdrop; each one is a full-canvas layer that scrolls by itself */
	.pre { z-index: 1; overflow: hidden; }
	.screen { position: absolute; inset: 0; display: flex; overflow-x: hidden; overflow-y: auto; }
	.home { display: block; flex: none; background: none; border: 0; padding: 0; }
	.logo { display: block; width: 100%; height: auto; filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.6)); }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.vrule { align-self: stretch; width: 1px; background: var(--hair); }
	.pretoast { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 30; }

	/* ------------------------------------------------ landing · role · admin · menu · join */
	.s-col { padding: 32px max(40px, 7%); }
	.leftcol { width: 500px; max-width: 100%; margin: auto 0; display: flex; flex-direction: column; align-items: flex-start; }
	.s-col .home { width: 168px; margin: 0 0 20px -10px; transition: width 0.6s cubic-bezier(0.2, 0.85, 0.2, 1), margin 0.6s cubic-bezier(0.2, 0.85, 0.2, 1); }
	.s-col.compact .home { width: 124px; margin-bottom: 14px; }
	.s-col.landing .home { width: 420px; margin: 0 0 30px -16px; }
	.s-col.landing .logo { filter: drop-shadow(0 20px 46px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 34px rgba(216, 179, 106, 0.26)); }
	.stage { position: relative; width: 100%; transition: height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.s-col.landing .stage { min-height: var(--h-btn-lg); } /* (room for Enter before the step is measured: no jump on load) */
	.step { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-direction: column; gap: 16px; }
	.phoneonly { display: none; }
	.enterstep { right: auto; width: 388px; align-items: center; gap: 14px; }
	.enter { min-width: 260px; cursor: pointer; letter-spacing: 0.08em; }
	.step .rejoin { color: var(--ink); }
	.head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
	.head .t-h1 { text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55); }
	.choices { display: flex; flex-direction: column; gap: 16px; width: 100%; }
	.step .note { margin-top: 6px; color: var(--ink-2); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7); }
	.step .formpanel { display: flex; flex-direction: column; gap: 16px; padding: 24px 26px; }
	.step .formpanel .row { margin-top: 4px; }
	.field.up { text-transform: uppercase; }
	.field--code::placeholder { letter-spacing: 0.12em; }
	.step .openpanel { display: flex; flex-direction: column; gap: 10px; padding: 18px 26px 22px; }
	.glist { display: flex; flex-direction: column; gap: 8px; max-height: 216px; overflow-y: auto; }

	/* ------------------------------------------------------------------- create game */
	/* a little more water over the island behind a full screen of panels */
	.s-create, .s-lobby { background: linear-gradient(180deg, rgba(4, 17, 32, 0.5) 0%, rgba(4, 17, 32, 0.22) 26%, rgba(4, 17, 32, 0.22) 72%, rgba(4, 17, 32, 0.55) 100%); }
	.s-create { padding: 20px 32px; }
	.cwrap { width: min(1080px, 100%); margin: auto; padding-top: 58px; }
	.cwrap .cbox { padding: 0 44px 24px; }
	/* the tide line along the top edge, the crest sitting on it */
	.cbox::before { content: ''; position: absolute; left: 18px; right: 18px; top: -1px; height: 3px; border-radius: 3px;
		background: linear-gradient(90deg, transparent 0%, var(--orange) 14%, var(--brass) 50%, var(--blue) 86%, transparent 100%); }
	.chead { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; margin: -58px 0 16px; }
	.chead .home { width: 120px; }
	.cform { display: flex; flex-direction: column; }
	.cgrid { display: grid; grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr); gap: 0 40px; }
	.ccol { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.cform .crule { margin: 18px 0; }
	.custom { display: flex; justify-content: space-between; gap: 12px; margin-top: 2px; }
	.cust :global(.stepper button) { width: 36px; height: 36px; }
	.cust :global(.stepper b) { min-width: 36px; }
	.cust { display: inline-flex; align-items: center; gap: 10px; }
	.cust .t-small { color: var(--ink); }
	.g-map { min-height: 0; }
	.mapbox { flex: 1; display: flex; flex-direction: column; min-height: 0; }
	.mapframe { flex: 1; min-height: 240px; }
	.mapframe .mapcap { justify-content: flex-start; }
	.mapframe .mapcap > span { font-size: var(--fs-h3); padding: 8px 18px; }
	.mapmeta .mapname, .mapmeta .tag, .mapmeta .msum { display: none; } /* (phones show these beside a small picture) */
	.mapchips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
	.cxchips { display: flex; gap: 8px; }
	.cxchips .chip { flex: 1 1 0; min-width: 0; min-height: 56px; padding: 0 4px; }
	.cxchips :global(.ico) { width: 20px; height: 20px; }
	.cxhint { color: var(--ink-2); max-width: 44ch; }
	.cform .warn { margin-top: 14px; }
	.cfoot { display: flex; align-items: center; gap: 16px; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--hair); }
	.csum { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 auto; }
	.createbtn { min-width: 220px; }

	/* ------------------------------------------------------------------------- lobby */
	.s-lobby { padding: 0 28px; }
	.lbox { width: min(1240px, 100%); margin: auto; padding: 18px 0; display: flex; flex-direction: column; gap: 16px; }
	.lbody { display: flex; flex-direction: column; gap: 16px; }
	.lhead { display: flex; align-items: center; gap: 20px; }
	.ltop { display: flex; align-items: center; gap: 18px; }
	.ltop .home { width: 84px; }
	.roomblock { display: flex; flex-direction: column; gap: 2px; }
	.roomblock .roomcode { color: var(--ink); text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6); }
	.copybtn.done { border-color: var(--ready); color: var(--ready-hi); }
	.lyou { display: flex; align-items: center; gap: 14px; margin-left: auto; }
	.you { text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7); white-space: nowrap; }
	.lyou .swaphint { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); white-space: nowrap; }
	.conn.connecting .cdot, .conn.reconnecting .cdot { animation: blink 1s ease-in-out infinite; }
	@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
	.connbanner { justify-content: center; }
	.ltable { display: grid; grid-template-columns: 330px minmax(0, 1fr) 330px; gap: 20px; height: 404px; }
	.tseats { position: relative; flex: 1; display: flex; flex-direction: column; gap: 10px; padding: 14px; min-height: 0; }
	.tseats.many { gap: 6px; padding: 10px; }
	.tseats.many .seat { min-height: 56px; padding: 4px 10px; }
	.tseats.many .token { width: 40px; height: 40px; font-size: 17px; border-width: 4px; }
	.tseats.many .seat.seat--open .token { border-width: 2px; }
	.tseats .seat--open .token :global(.ico) { width: 20px; height: 20px; }
	.seat-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.seat-top :global(.tag) { flex: none; }
	.tseats .crown :global(.ico), .tseats .badge :global(.ico) { width: 1em; height: 1em; stroke-width: 3; }
	.lboard { min-width: 0; }
	.lbody .setup { display: grid; grid-template-columns: minmax(0, 1fr) 1px auto; gap: 26px; padding: 16px 24px 18px; }
	.scol { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
	.lblrow { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 24px; }
	.lblrow .t-label { white-space: nowrap; }
	.lblrow .hint { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--ink-2); }
	.scol .swatches { flex-wrap: nowrap; align-items: center; gap: 8px; min-height: 44px; }
	.swatch.is-locked:disabled { opacity: 0.5; background: var(--sc); box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.3); }
	.swatch.is-locked.is-on:disabled { opacity: 1; box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.25), 0 0 0 2px var(--deep), 0 0 0 4px var(--brass-hi); }
	.specs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 16px; min-height: 30px; }
	.speclbl { margin-right: -8px; }
	.spec { display: inline-flex; align-items: center; gap: 2px; }
	.spec .kickx { width: 30px; height: 30px; }
	.boardopts { display: grid; grid-template-columns: auto auto auto; gap: 18px; }
	.boardopts .bolbl { white-space: nowrap; }
	.boardopts .seg-opt { min-width: 68px; }
	/* a guest reads the host's choice: still brass (blue only ever means the Titans), just quieter */
	.boardopts .seg.is-readonly .seg-opt.is-on:disabled { background: rgba(216, 179, 106, 0.2); border-color: var(--brass-line); color: var(--brass-hi); }
	.lbox .lactions { display: flex; align-items: center; gap: 14px; padding: 12px 14px; }
	.lactions .lhint { flex: 1; text-align: right; color: var(--ink); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8); }
	.lactions .btn-lg { min-width: 190px; }
	.lactions .leave { min-width: 120px; margin-right: auto; }

	/* in-game toast for a seat takeover (the game branch above) */
	.seattoast { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 40; padding: 8px 16px; border-radius: 999px;
		background: rgba(9, 13, 22, 0.92); border: 1px solid rgba(199, 154, 78, 0.5); color: #f6ead2; font-weight: 700; font-size: 0.85rem; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }

	/* --------------------------------------------------------------------- coin flip */
	.coinstage { display: flex; flex-direction: column; align-items: center; transform: scale(var(--ui)); }
	.coinring { position: relative; width: 230px; height: 230px; margin-top: 22px; border-radius: 50%; perspective: 900px; transition: box-shadow 0.5s ease; }
	.coinring::before { content: ''; position: absolute; inset: -70px; border-radius: 50%; background: radial-gradient(closest-side, rgba(216, 179, 106, 0.2), rgba(216, 179, 106, 0) 100%); }
	.coinring.done { box-shadow: 0 0 0 2px var(--brass), 0 0 0 10px rgba(216, 179, 106, 0.12), 0 0 70px var(--tc-line), 0 30px 60px rgba(0, 0, 0, 0.6); }
	.coin { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; transition: transform 1.55s cubic-bezier(0.2, 0.75, 0.2, 1); }
	.coin .face { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 50%; filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.55)); }
	.coin .back { transform: rotateY(180deg); }
	.coinstage .coincap { margin-top: 34px; color: var(--ink-2); text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6); }
	.coinstage .coincap.done { color: var(--ink); }
	.coinstage .coincap.done.or { color: var(--orange-hi); }
	.coinstage .coincap.done.bl { color: var(--blue-hi); }
	.coinsub { margin-top: 10px; min-height: 1.3em; }

	/* ------------------------------------------- an upright tablet: the column centred over the island */
	@media (min-width: 761px) and (max-aspect-ratio: 1/1) {
		.s-col { padding: 32px 40px; }
		.leftcol { margin: auto; align-items: center; }
		.s-col .home, .s-col.compact .home { margin-left: 0; }
		.s-col.landing .home { margin-left: 0; }
		.enterstep { right: 0; width: auto; }
		.head { align-items: center; text-align: center; }
		.step .note { align-self: center; }
	}
	/* a narrow window (the canvas is under 1440 wide): the lobby's settings stack */
	@media (min-width: 761px) and (max-width: 1007px) {
		.ltable { grid-template-columns: 290px minmax(0, 1fr) 290px; gap: 14px; }
		.lbody .setup { grid-template-columns: minmax(0, 1fr); gap: 14px; }
		.setup .vrule { display: none; }
		.seat-top { flex-wrap: wrap; row-gap: 2px; }
		.lhead { gap: 12px; }
		.lyou { gap: 10px; }
		.cust .t-small { white-space: nowrap; }
	}

	/* ------------------------------------------------------------------------ phones */
	@media (max-width: 760px) {
		.deskonly { display: none; }
		.phoneonly { display: inline; }
		.pre, .coinoverlay { --fs-label: 15px; } /* labels are sentences here: nothing under 15px on a phone */
		.s-col { padding: 20px 16px 24px; }
		.leftcol { width: 100%; margin: auto; align-items: center; }
		.s-col .home { width: 132px; margin: 0 0 14px; }
		.s-col.compact .home { width: 96px; margin-bottom: 10px; }
		.s-col.landing .home { width: min(300px, 74vw); margin: 0 0 26px; }
		.enterstep { right: 0; width: auto; }
		.enter { min-width: 220px; }
		.head { align-items: center; text-align: center; }
		.step .note { align-self: center; text-align: center; padding: 6px 14px; border-radius: var(--r-pill); background: rgba(4, 15, 28, 0.62); }
		.step .formpanel { padding: 16px; gap: 14px; }
		.step .openpanel { padding: 14px 16px 16px; }
		.choices { gap: 12px; }
		.choices :global(.choice) { min-height: 88px; padding: 12px 16px; gap: 14px; }
		.choices :global(.choice-ic) { width: 52px; height: 52px; font-size: 24px; }

		/* create: a top line, one scrolling panel, the actions pinned to the bottom edge */
		.s-create { padding: 0; overflow: hidden; }
		.cwrap { width: 100%; height: 100%; margin: 0; padding: 0; }
		.cwrap .cbox { height: 100%; display: flex; flex-direction: column; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
		.cbox::before { display: none; }
		.chead { flex: none; flex-direction: row; gap: 12px; margin: 0; padding: 12px 12px 8px; }
		.chead .home { width: 46px; }
		.cbody { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 12px 14px; }
		.cform { gap: 13px; padding: 14px; border-radius: var(--r-lg); border: 1px solid var(--brass-line); background: var(--glass); box-shadow: var(--sh-2), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
		.cgrid, .ccol { display: contents; }
		.cform .vrule, .crule { display: none; }
		.g-map { order: 9; }
		.cform .warn { order: 10; margin-top: 0; }
		.cform :global(.seg-opt.has-sub) { min-height: 46px; }
		.cform :global(.seg-opt .sub) { display: none; }
		.custom { flex-direction: column; gap: 8px; }
		.cust { justify-content: space-between; }
		.cust :global(.stepper button) { width: 42px; height: 42px; }
		.cust :global(.stepper b) { min-width: 48px; }
		.cxchips { gap: 6px; }
		.cxchips .chip { min-height: 46px; }
		.cxchips :global(.ico) { width: 15px; height: 15px; }
		.cxhint { display: none; }
		.mapbox { flex-direction: row; align-items: center; gap: 12px; }
		.mapbox .mapframe { flex: none; width: 118px; height: 72px; min-height: 0; border-radius: var(--r-md); }
		.mapframe .mapcap { display: none; }
		.mapmeta { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
		.mapmeta .mapname, .mapmeta .tag { display: inline-flex; }
		.mapmeta .msum { display: block; }
		.mapchips { margin-top: 0; }
		.cfoot { flex: none; gap: 8px; margin: 0; padding: 10px 12px 12px; background: rgba(4, 15, 28, 0.95); border-top: 1px solid var(--brass-line); box-shadow: 0 -12px 30px rgba(0, 6, 14, 0.5); }
		.csum { display: none; }
		.createbtn { flex: 1; min-width: 0; }

		/* lobby: the room line, the board as a strip, the two teams side by side, one panel of settings */
		.s-lobby { padding: 0; overflow: hidden; }
		.lbox { width: 100%; height: 100%; margin: 0; padding: 0; gap: 0; }
		.lbody { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-content: start; grid-auto-rows: max-content; gap: 10px; padding: 10px 12px 14px; }
		.lhead, .ltable { display: contents; }
		.ltop, .lyou, .lboard, .setup, .connbanner { grid-column: 1 / -1; }
		.ltop { order: 1; gap: 10px; }
		.lboard { order: 2; height: 124px; }
		.lyou { order: 3; margin: 0; gap: 10px; flex-wrap: wrap; min-height: 44px; }
		.connbanner { order: 4; }
		.lbody :global(.teamcard) { order: 5; border-radius: var(--r-md); }
		.setup { order: 6; }
		.ltop .home { width: 46px; }
		.roomblock { flex-direction: row; align-items: baseline; gap: 8px; margin-right: auto; }
		.roomblock .roomcode { font-size: 30px; }
		.ltop .copybtn { min-height: 44px; padding: 0 14px; font-size: var(--fs-body); }
		.lyou .you { flex: 1; order: -1; font-size: 16px; }
		.connlbl { display: none; }
		.lyou .conn { padding: 0 11px; }
		.lyou .flipbtn { padding: 0 12px; }
		.lyou .flipbtn :global(.ico) { display: none; }
		.conn.reconnecting .connlbl, .conn.closed .connlbl, .conn.connecting .connlbl { display: inline; }
		.lyou .swaphint { font-size: 15px; }
		.lboard :global(.cap) { left: 8px; right: 8px; bottom: 8px; }
		.lboard :global(.cap > span) { padding: 5px 12px; white-space: normal; text-align: center; border-radius: 14px; }
		.lbody :global(.band) { min-height: 44px; padding: 0 8px; gap: 5px; font-size: 16px; letter-spacing: 0.02em; }
		.lbody :global(.band img) { width: 22px; height: 22px; }
		.lbody :global(.band-count) { letter-spacing: 0; word-spacing: -0.12em; }
		.lbody :global(.teammark) { width: 130px; height: 130px; right: -24px; bottom: -26px; }
		.tseats, .tseats.many { gap: 6px; padding: 8px; }
		.tseats .seat, .tseats.many .seat { min-height: 62px; padding: 5px 6px; gap: 8px; }
		.tseats .token { width: 40px; height: 40px; font-size: 17px; border-width: 4px; }
		.tseats .seat.seat--open .token { border-width: 2px; }
		.tseats :global(.seat-name) { font-size: 17px; }
		.tseats :global(.seat-body) { gap: 3px; }
		.tseats :global(.state) { font-size: 15px; }
		.tseats .seat-top { flex-direction: column; align-items: flex-start; gap: 3px; }
		.tseats .seat-top :global(.seat-name) { max-width: 100%; }
		.tseats .hosttag { display: none; }
		.tseats div.seat :global(.state:not(.is-ready)), .tseats .seat--me :global(.state), .tseats :global(.state .ico) { display: none; }
		.tseats :global(.seat-kick) { width: 34px; margin-right: -2px; }
		.lbody .setup { display: flex; flex-direction: column; gap: 14px; padding: 12px; }
		.setup .vrule { display: none; }
		.lblrow { flex-wrap: wrap; gap: 2px 10px; }
		.scol .swatches { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; justify-items: center; }
		.swatches .swatch { width: 100%; max-width: 44px; }
		.boardopts { display: flex; flex-direction: column; gap: 6px; }
		.boardopts .bolbl { letter-spacing: 0.08em; }
		.boardopts .optfld { flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; }
		.boardopts .seg-opt { min-width: 62px; }
		.lbox .lactions { flex: none; flex-wrap: wrap; gap: 8px; padding: 10px 12px 12px; border: 0; border-radius: 0; background: rgba(4, 15, 28, 0.95); border-top: 1px solid var(--brass-line); box-shadow: 0 -12px 30px rgba(0, 6, 14, 0.5); }
		.lactions .lhint { order: -1; flex: 1 0 100%; text-align: center; }
		.lactions .btn-lg { flex: 1 1 0; min-width: 0; padding: 0 10px; }
		.lactions .leave { flex: 0 0 92px; min-width: 0; margin: 0; padding: 0 8px; min-height: var(--h-btn-lg); }

		.coinring { width: 190px; height: 190px; }
	}
</style>
