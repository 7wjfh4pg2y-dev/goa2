<script lang="ts">
	import { onDestroy } from 'svelte';
	import { readable, type Readable } from 'svelte/store';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import CardLayer from '$lib/CardLayer.svelte';
	import DefeatSplash from '$lib/DefeatSplash.svelte';
	import BattleSplash from '$lib/BattleSplash.svelte';
	import PushSplash from '$lib/PushSplash.svelte';
	import VictorySplash from '$lib/VictorySplash.svelte';
	// the HUD in the Tide look: scoreline, log tab, menu (one layer; on a phone the same layer at zoom 1 with a one-row bar)
	import TopScore from '$lib/ui/TopScore.svelte';
	import TopLog from '$lib/ui/TopLog.svelte';
	import TopMenu from '$lib/ui/TopMenu.svelte';
	import TopIcon from '$lib/ui/TopIcon.svelte';
	import '$lib/ui/top-game.css';
	import { heroById, heroLogo } from '$lib/heroes';
	import { teamName, teamAdj, aMinion, placeName } from '$lib/teams';
	import { createRecorder } from '$lib/recorder';
	import { statsFromJournal } from '$lib/gamestats'; // battle report
	import { zoneName } from '$lib/zones';
	import { effectLabel } from '$lib/effects';
	import { battleZone, canBattleRemove, pushLane, laneNotes, heavyImmune } from '$lib/battle';
	import { heroCards } from '$lib/cards/deck';
	import { uiLayout, layoutVars, TOP_Y, TOP_H, RAIL_Y, RAIL_H, BOARD_TOP, BOARD_BOTTOM } from '$lib/layout';
	import { placeToken, moveToken, effectiveHex, MINES, tokenName, tokensLeft, removalOptions, applyRemoval, removalLog, canRemove, type ArmToken, type RemovalOption } from '$lib/tokens';
	import {
		colorHex, movePiece, teamForSeat, throneHex, minionCoins, heroDefeatSummary, canRespawn, freeSpawns, teamOf, clearable, boardLookOf, zoneGlowOf, boardFxOf, type BoardLook,
		type MatchState, type Player, type MatchSession, type Team
	} from '$lib/match';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let room: string;
	export let onLeave: () => void;
	// quietly journal the game; a full game (first turn → win) is filed away when it ends
	const recorder = createRecorder(room, clientId);
	$: recorder.tick($ms);
	$: gameStats = $ms.wonBy ? statsFromJournal(recorder.journal()) : null; // battle report: this browser's journal (null = it did not see the whole game)
	// pings (match.ts): the dash button arms one (the next board tap pings; pressed again =
	// a general ping on your own hero), Alt+click / a long press ping straight away
	const pingsS = session.pings ?? readable([]);
	let pingArmed = false;
	$: boardPings = $pingsS.map((p) => ({ id: p.id, hex: p.hex, color: colorHex(p.color) }));
	function doPing(hex: string | null) { pingArmed = false; if (hex) session.ping?.(hex); }
	function pingButton() {
		if (!pingArmed) { pingArmed = true; return; }
		const me = $ms.pieces?.[clientId];
		pingArmed = false;
		if (me) session.ping?.(me.hex);
	}

	const status = session.status;
	const canUndo = session.canUndo;
	let logOpen = false; // desktop log: a slim tab until opened
	const doUndo = () => session.undo();
	$: lifeMax = $ms.lifeMax || ($ms.lifeTok?.orange?.length ?? 8);

	// real game art for the HUD (life-counter medallions + tie-breaker token)
	const art = import.meta.glob('./cards/images/{life_counter,tiebreaker}_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const lifeArt = (t: Team, side: 'front' | 'back') => art[`./cards/images/life_counter_${t}_${side}.png`];
	const tieArt = (t: Team) => art[`./cards/images/tiebreaker_${t}.png`];

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
		session.act(`${teamAdj(team)} Life ${$ms.life[team]} → ${count}`,
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
	// splashes are drawn from your side: your team on the right (spectators watch as blue)
	$: viewTeam = (mySeat >= 0 && mySeat < $ms.seats ? myTeam : 'blue') as Team;
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
		return { seat, id, name: nm, hero, team: teamForSeat(seat, $ms.seats), present: !!id && presentIds.has(id),
			color: colorHex($ms.pieces?.[id]?.color ?? $players.find((p) => p.id === id)?.color ?? '') };
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
		color: p.color ? colorHex(p.color) : undefined,
		// heavies are immune while another minion of theirs stands in the battle zone (host can override)
		immune: p.role === 'heavy' && heavyImmune($ms, p.id) ? true : undefined,
		// hover label (mouse): the same name the toolbar shows, heroes/minions in their team colour
		name: labelOf(p), nameColor: teamText(p),
		locked: clearing || (p.role === 'heavy' && !iAmHost && heavyImmune($ms, p.id)) ? true : undefined
	}));

	let board: BoardCanvas;
	let cardLayer: CardLayer;
	// the host's board options: map visuals, and the outline round the battle zone (it follows the lane)
	$: boardLook = boardLookOf($ms);
	$: zoneGlow = zoneGlowOf($ms);
	$: glowZone = boardLook === 'island' && zoneGlow && !$ms.wonBy ? battleZone($ms) : null;
	function setBoardLook(v: BoardLook) { if (iAmHost) session.update({ boardLook: v }); }
	function setZoneGlow(v: boolean) { if (iAmHost) session.update({ zoneGlow: v }); }
	$: boardFx = boardFxOf($ms);
	function setBoardFx(v: boolean) { if (iAmHost) session.update({ boardFx: v }); }
	// every lingering card effect in play (switched on from a played card)
	$: activeFx = $ms.effects ?? [];
	// area radii (set from each player's dash): centred on that player's hero, in their colour
	$: areas = [...Object.entries($ms.radii ?? {}).flatMap(([pid, r]) => {
		const hero = $ms.pieces?.[pid];
		return hero && r > 0 ? [{ hex: hero.hex, r, color: colorHex(hero.color ?? '') }] : [];
	}), ...battleMarks, ...spawnMarks, ...clearMarks];

	// ── minion battle / lane (battle.ts) ──
	// the minions the battle's loser may take off glow red on the board
	// the minion battle splash plays first; the removal step shows once it has slashed away
	let battleDoneId: string | null = $ms.battleNews?.id ?? null; // joining mid-game: no replay
	$: battleNews = $ms.battleNews ?? null;
	$: battleSplashing = !!battleNews && battleNews.id !== battleDoneId && Date.now() - battleNews.at < 15000;
	$: armBattleFallback(battleSplashing ? battleNews?.id ?? null : null);
	function armBattleFallback(id: string | null) { if (id) setTimeout(() => (battleDoneId = id), 5000); } // if the splash never reports back
	$: battle = battleSplashing ? null : $ms.battle ?? null;
	$: battleMarks = battle ? Object.values($ms.pieces ?? {}).filter((p) => canBattleRemove($ms, p.id)).map((p) => ({ hex: p.hex, r: 0, color: battle?.loser === 'blue' ? '#8cc0ff' : '#ffb27a' })) : []; // the losing team's own colour
	$: iChooseBattle = !!battle && (iAmHost || (iPlay && myTeam === battle.loser));
	$: selImmune = !!selPiece && selPiece.role === 'heavy' && heavyImmune($ms, selPiece.id);
	$: canBattleSel = !!selPiece && iChooseBattle && canBattleRemove($ms, selPiece.id);
	function battleTakeSel() {
		if (!selPiece) return;
		const id = selPiece.id;
		board?.release();
		session.cardAction({ kind: 'battleRemove', pid: clientId, piece: id });
	}
	const battleAutoAll = () => session.cardAction({ kind: 'battleAuto', pid: clientId });
	// host override (edge cases): push the lane by hand — tap once to arm, again to confirm
	let pushArm: Team | null = null;
	let pushArmT: ReturnType<typeof setTimeout> | null = null;
	function manualPush(t: Team) {
		if (pushArm !== t) { pushArm = t; if (pushArmT) clearTimeout(pushArmT); pushArmT = setTimeout(() => (pushArm = null), 3000); return; }
		pushArm = null;
		const patch = pushLane($ms, t);
		session.act(laneNotes($ms, patch).join(' · ') + ' (by hand)', patch);
	}

	// ── game over ──
	// a team's Life hit 0: the host confirms before the game ends (a mis-click on a token can't end it)
	$: lifeOut = !$ms.wonBy ? ($ms.life.orange <= 0 ? 'orange' : $ms.life.blue <= 0 ? 'blue' : null) as Team | null : null;
	let lifeDismissed = '';
	$: askLifeEnd = iAmHost && !!lifeOut && lifeDismissed !== lifeOut;
	$: if (!lifeOut) lifeDismissed = '';
	function endOnLife() {
		if (!lifeOut) return;
		const win: Team = lifeOut === 'orange' ? 'blue' : 'orange';
		session.act(`${teamName(win)} win — ${teamName(lifeOut)} ran out of Life Tokens`, { wonBy: { team: win, reason: `${teamName(lifeOut)} ran out of Life Tokens` } });
	}
	// the host's "End the game?" must not open under the phone's waves / Life sheet
	$: if (askLifeEnd) lwOpen = false;
	// the victory splash: everyone, as soon as a winner is set (and again from the gold banner)
	let victoryClosed = false;
	$: if (!$ms.wonBy) victoryClosed = false;
	// a game-winning push plays "The throne falls / Final push" first, then the victory screen
	let victoryHold = false;
	let wonSeen: string | null | undefined = undefined;
	$: watchWon($ms.wonBy ? `${$ms.wonBy.team}:${$ms.wonBy.reason}` : null);
	function watchWon(k: string | null) {
		if (k === wonSeen) return;
		wonSeen = k;
		const p = $ms.pushNews;
		const wait = k && p?.won ? 5000 - (Date.now() - p.at) : 0;
		if (wait > 0) { victoryHold = true; setTimeout(() => (victoryHold = false), wait); }
	}

	// gear/star throne hexes, so the board can draw them and heroes/minions spawn there
	$: thrones = [
		{ hex: throneHex($ms.map ?? null, 'orange'), team: 'orange' },
		{ hex: throneHex($ms.map ?? null, 'blue'), team: 'blue' }
	].filter((t): t is { hex: string; team: string } => !!t.hex);

	function move(id: string, hex: string) {
		const p = $ms.pieces[id];
		if (heavyImmune($ms, id) && !iAmHost) return; // immune heavy: stays put
		const label = p?.hero ? heroById(p.hero)?.name ?? 'a piece' : 'a piece';
		if (p?.kind === 'token') {
			session.act(`moved ${p.token ? tokenName(p.token) : 'a token'} → ${placeName(zoneName($ms.map, hex))}`, { pieces: moveToken($ms.pieces, id, hex) });
			return;
		}
		session.act(`moved ${label} → ${placeName(zoneName($ms.map, hex))}`, movePiece($ms, id, hex));
	}

	// ── minion spawn (temporary manual controls) + piece delete ────────────────
	// pick a role → arm placement; the next hex tap drops the minion there.
	let pendingSpawn: { team: Team; role: 'melee' | 'ranged' | 'heavy' } | null = null;
	function armSpawn(team: Team | null, role: 'melee' | 'ranged' | 'heavy') {
		if (!team) return;
		pendingSpawn = { team, role };
	}
	// a token / marker picked off the dash shelf, waiting for its hex
	let pendingToken: ArmToken | null = null;
	function armToken(t: ArmToken) { pendingSpawn = null; pendingRespawn = false; pendingToken = t; selPieceId = null; }
	$: if (pendingSpawn) pendingToken = null;
	// a defeated hero coming back: tap a hex (a spawn point) to place yourself
	// (or, at the start of the game, entering it for the first time)
	let pendingRespawn = false;
	$: myDefeat = $ms.defeated?.[clientId];
	$: iCanRespawn = !!myDefeat && canRespawn($ms, clientId);
	$: myEntry = $ms.toSpawn?.[clientId] ?? null;
	$: heroToPlace = myDefeat?.piece ?? myEntry;
	$: if (!heroToPlace) pendingRespawn = false;
	$: placing = !!pendingSpawn || !!pendingToken || pendingRespawn;
	function placeMyHero() { cancelPlace(); selPieceId = null; actId = null; pendingRespawn = true; }
	// the free spawn points of your base light up while you place your hero
	$: spawnMarks = pendingRespawn && heroToPlace ? freeSpawns($ms, heroToPlace.team as Team).map((hex) => ({ hex, r: 0, color: '#fff3a8' })) : [];
	// what's held, drawn by the board as a see-through ghost under the cursor
	$: placeGhost = pendingRespawn && heroToPlace
		? { id: '__ghost', hex: '', team: heroToPlace.team, hero: heroToPlace.hero, sym: heroLogo(heroToPlace.hero ?? ''),
			label: heroById(heroToPlace.hero ?? '')?.name?.[0]?.toUpperCase() ?? '?', color: heroToPlace.color ? colorHex(heroToPlace.color) : undefined }
		: pendingSpawn
		? { id: '__ghost', hex: '', team: pendingSpawn.team, role: pendingSpawn.role }
		: pendingToken
			? pendingToken.token === 'companion'
				? { id: '__ghost', hex: '', team: pendingToken.team, letter: pendingToken.letter, color: colorHex(pendingToken.color ?? '') }
				: { id: '__ghost', hex: '', team: pendingToken.team, token: pendingToken.token }
			: null;
	// the hex under a held object lights up in your chosen colour
	$: myHoldColor = colorHex($players.find((p) => p.id === clientId)?.color ?? '');
	function cancelPlace() { pendingSpawn = null; pendingToken = null; pendingRespawn = false; }
	// board hex tapped while holding something: drop it right there
	function onBoardHex(hex: string) {
		if (pendingRespawn) {
			// only your base's free spawn points take a hero (a map without them: anywhere)
			const team = heroToPlace?.team as Team | undefined;
			if (team && throneHexesOf(team).length && !freeSpawns($ms, team).includes(hex)) return;
			session.cardAction(myDefeat ? { kind: 'respawn', pid: clientId, hex } : { kind: 'spawn', pid: clientId, hex });
			pendingRespawn = false;
			return;
		}
		if (pendingToken) {
			const t = pendingToken;
			const unique = t.token.startsWith('marker_') || t.token.startsWith('rune_'); // placing again moves it
			if (!unique && tokensLeft($ms.pieces ?? {}, t.owner, t.token) <= 0) { pendingToken = null; return; }
			const id = `tok_${t.owner}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
			const pieces = placeToken($ms.pieces, { id, hex, team: t.team, token: t.token, owner: t.owner, label: t.label, color: t.color });
			const what = t.token === 'companion' ? `deployed ${t.label}` : MINES.has(t.token) ? 'laid a mine' : `placed ${tokenName(t.token)}`;
			const on = pieces[id].attachedTo ? ` on ${heroById($ms.pieces[pieces[id].attachedTo!]?.hero ?? '')?.name ?? 'a hero'}` : ` → ${placeName(zoneName($ms.map, hex))}`;
			session.act(what + on, { pieces });
			pendingToken = null;
			return;
		}
		if (!pendingSpawn) return;
		const { team, role } = pendingSpawn;
		const id = `minion_${team}_${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
		session.act(`spawned ${aMinion(team, role)}`, { pieces: { ...$ms.pieces, [id]: { id, hex, team, kind: 'minion' as const, role } } });
		pendingSpawn = null;
	}

	let selPieceId: string | null = null;
	let previewId: string | null = null; // clicking a hero token opens that player's board
	function onSelectPiece(id: string | null) {
		const pc = id ? $ms.pieces[id] : null;
		// tapping any piece (heroes included) just picks it up to move it — a
		// player's board opens from the right-hand HUD instead. Minions / tokens
		// also get the delete toolbar (heroes don't).
		if (clearing) {
			// Clear: a tap on a token next to your hero ticks / unticks it (nothing is picked up)
			if (id && clearCands.some((p) => p.id === id)) clearSel = clearSel.includes(id) ? clearSel.filter((x) => x !== id) : [...clearSel, id];
			if (id) queueMicrotask(() => board?.release()); // so the same token can be tapped again
			return;
		}
		if (placing) return;
		selPieceId = pc ? id : null;
	}
	$: selPiece = selPieceId ? $ms.pieces[selPieceId] : null;
	// the piece a Defeat/Remove dialog is about — remembered before the board puts it down
	let actId: string | null = null;
	$: actPiece = actId ? $ms.pieces[actId] ?? null : null;
	$: actLabel = labelOf(actPiece);
	// Defeat: whoever presses it defeated the unit and collects the reward (match.ts rules)
	$: iPlay = !!$ms.cards?.[clientId];
	$: canDefeatSel = !!selPiece && iPlay && !!myTeam && (selPiece.kind === 'minion' || selPiece.kind === 'hero') && selPiece.team !== myTeam;
	// a small confirm takes the toolbar's place, right above the piece: attack a hero / remove a minion
	let confirmKind: 'attack' | 'defeat' | 'remove' | 'selfremove' | null = null;
	$: if (confirmKind && !actPiece) confirmKind = null;
	$: attackSum = (confirmKind === 'attack' || confirmKind === 'defeat') && actPiece ? heroDefeatSummary($ms, clientId, actPiece.id) : null;
	function defeatSel() {
		if (!selPiece) return;
		const p = selPiece;
		board?.release();
		if (p.kind === 'minion') { session.cardAction({ kind: 'defeatMinion', pid: clientId, piece: p.id }); selPieceId = null; }
	}
	// a hero can be attacked (they may defend) or simply defeated (a discard-or-die effect,
	// anything that isn't an attack) — same rewards and splash either way
	function attackSel(kind: 'attack' | 'defeat' = 'attack') {
		if (!selPiece) return;
		actId = selPiece.id; confirmKind = kind;
		board?.release();
	}
	function doDefeatHero() {
		if (actPiece) session.cardAction({ kind: 'defeatHero', pid: clientId, target: actPiece.id });
		closeConfirm();
	}
	function doAttack() {
		if (actPiece) session.cardAction({ kind: 'attack', pid: clientId, target: actPiece.id });
		closeConfirm();
	}
	function closeConfirm() { confirmKind = null; actId = null; selPieceId = null; }
	// your OWN hero: take it off the board (a card effect), say who defeated you (they get the
	// reward, their teammates the assists), or Clear instead of an attack (choose which of the
	// tokens next to you leave — yours, a friend's or the enemy's; rulebook p.13)
	$: ownHeroSel = !!selPiece && selPiece.kind === 'hero' && selPiece.id === clientId;
	$: ownCs = $ms.cards?.[clientId];
	$: ownCardIdx = ownCs ? (ownCs.turns?.[$ms.turn - 1] ?? ownCs.pending) : null;
	$: ownAttack = !!ownCs && ownCardIdx != null && ownCardIdx >= 0 && heroCards(ownCs.hero)[ownCardIdx]?.primaryAction === 'ATTACK';
	$: clearCount = ownHeroSel && ownAttack ? clearable($ms, clientId).length : 0;
	// Clear mode: the tokens next to you glow; tap the ones to remove, then confirm
	let clearing = false;
	let clearSel: string[] = [];
	$: clearCands = clearing ? clearable($ms, clientId) : [];
	$: clearPick = clearSel.filter((id) => clearCands.some((p) => p.id === id)); // still there and still adjacent
	$: clearMarks = clearCands.map((p) => ({ hex: p.hex, r: 0, color: clearPick.includes(p.id) ? '#ff5a4d' : '#ffe7a8' }));
	$: if (clearing && !ownAttack) cancelClear(); // the turn moved on
	function startClear() { board?.release(); selPieceId = null; actId = null; cancelPlace(); clearSel = []; clearing = true; }
	function cancelClear() { clearing = false; clearSel = []; }
	function clearAll() { clearSel = clearCands.map((p) => p.id); }
	let pickKiller = false;
	$: killers = pickKiller ? Object.keys($ms.cards ?? {}).filter((id) => id !== clientId && teamOf($ms, id) && teamOf($ms, id) !== teamOf($ms, clientId)) : [];
	function selfRemoveAsk() { if (!selPiece) return; actId = selPiece.id; confirmKind = 'selfremove'; board?.release(); }
	function doSelfRemove() { session.cardAction({ kind: 'removeHero', pid: clientId }); closeConfirm(); }
	function selfDefeatAsk() { board?.release(); pickKiller = true; }
	function selfDefeat(killer: string) { session.cardAction({ kind: 'defeatHero', pid: killer, target: clientId }); pickKiller = false; selPieceId = null; }
	function doClear() { if (clearPick.length) session.cardAction({ kind: 'clearAround', pid: clientId, ids: clearPick }); cancelClear(); }
	// attacks in flight (match.ts): the defender answers, the attacker waits
	$: attacks = $ms.attacks ?? {};
	$: incoming = attacks[clientId] && !attacks[clientId].defending ? attacks[clientId] : null;
	$: outgoing = Object.entries(attacks).filter(([, a]) => a.by === clientId);
	$: hostWatch = iAmHost ? Object.entries(attacks).filter(([t, a]) => a.by !== clientId && t !== clientId && !$players.some((p) => p.id === t)) : [];
	const answer = (target: string, result: 'defend' | 'defended' | 'defeated' | 'cancel') => session.cardAction({ kind: 'attackResolve', pid: clientId, target, result });
	const heroOf = (pid: string) => heroById($ms.pieces?.[pid]?.hero ?? $ms.cards?.[pid]?.hero ?? '')?.name ?? 'A hero';
	const whoOf = (pid: string) => `${heroOf(pid)} (${playerName(pid)})`;
	const throneHexesOf = (t: Team) => freeSpawns({ ...$ms, pieces: {} }, t);
	const playerName = (id: string) => $players.find((p) => p.id === id)?.name ?? 'A player';

	// Remove menu: the reasons the cards give for taking a token out of play (tokens.ts)
	let removing = false;
	let pickHeroFor: RemovalOption | null = null; // a mine going off: which enemy hero set it off
	$: canRemoveSel = !!selPiece && canRemove(selPiece, clientId, iAmHost);
	$: removeOpts = actPiece ? removalOptions(actPiece) : [];
	$: enemyHeroes = actPiece ? Object.values($ms.pieces ?? {}).filter((p) => p.kind === 'hero' && p.team !== actPiece?.team) : [];
	function openRemove() {
		actId = selPiece?.id ?? null; board?.release(); pickHeroFor = null;
		// a minion just needs a quick yes; tokens get the menu of reasons
		if (actId && $ms.pieces[actId]?.kind === 'minion') confirmKind = 'remove'; else removing = true;
	}
	function doRemoveMinion() {
		if (actPiece) session.cardAction({ kind: 'removeMinion', pid: clientId, piece: actPiece.id });
		closeConfirm();
	}
	function doRemove(opt: RemovalOption, heroPieceId?: string) {
		const selPiece = actPiece;
		if (!selPiece) return;
		if (opt.needsHero && !heroPieceId) { pickHeroFor = opt; return; }
		if (selPiece.kind === 'minion') session.cardAction({ kind: 'removeMinion', pid: clientId, piece: selPiece.id });
		else {
			const heroName = heroPieceId ? heroById($ms.pieces[heroPieceId]?.hero ?? '')?.name : undefined;
			session.act(removalLog(selPiece, opt.id, heroName), { pieces: applyRemoval($ms.pieces, selPiece.id, opt.id) });
		}
		removing = false; pickHeroFor = null; actId = null; selPieceId = null;
		board?.release();
	}
	// Min's mines: flip to reveal Blast / Dud (or back face down)
	function flipMine() {
		if (!selPiece) return;
		const up = !!selPiece.faceDown;
		session.act(up ? `flipped a mine — ${selPiece.token === 'token_blast' ? 'Blast!' : 'Dud'}` : 'turned a mine face down', { pieces: { ...$ms.pieces, [selPiece.id]: { ...selPiece, faceDown: !up } } });
		// the action is done: put the mine down, so the next click can't carry it somewhere else
		board?.release(); selPieceId = null;
	}
	// only Min (the mine's owner) and the host may flip a mine
	$: canFlip = !!selPiece?.token && MINES.has(selPiece.token) && (selPiece.owner === clientId || iAmHost);
	// the toolbar floats just above the selected piece. It is placed when the piece is selected and
	// re-placed when something could have moved it — the pieces, the window, any input that pans / zooms / turns
	// the board — then frame by frame only for as long as it is still moving. (It used to be read every frame
	// while a piece was selected; a running rAF loop makes the page produce every frame.)
	let tipPos: { x: number; y: number; below: number } | null = null; // x · just above the piece · just under it (px)
	let tipRaf = 0;
	let tipFor: string | null = null;
	function placeTip() {
		tipRaf = 0;
		const p = tipId ? board?.clientPos(tipId) : null;
		const x = p ? Math.round(p.x) : null, y = p ? Math.round(p.y - p.r - 8) : null;
		if (!p || x == null || y == null) { if (tipPos) tipPos = null; return; }
		if (tipPos && tipPos.x === x && tipPos.y === y) return; // at rest
		tipPos = { x, y, below: Math.round(p.y + p.r + 8) };
		tipRaf = requestAnimationFrame(placeTip); // it moved: look again next frame
	}
	const tipNudge = () => { if (tipId && !tipRaf) tipRaf = requestAnimationFrame(placeTip); };
	function trackTip() {
		if (typeof window === 'undefined') return;
		if (!tipId) { cancelAnimationFrame(tipRaf); tipRaf = 0; tipPos = null; tipFor = null; return; }
		if (tipFor !== tipId) { tipFor = tipId; cancelAnimationFrame(tipRaf); placeTip(); } // just selected: at once
		else tipNudge();
	}
	$: tipId = actId && confirmKind ? actId : selPieceId;
	$: tipId, mobile, $ms.pieces, gvw, gvh, trackTip();
	onDestroy(() => { if (typeof window !== 'undefined') cancelAnimationFrame(tipRaf); });
	// hero / minion names read in their team colour (a lighter tint so they stay legible)
	const teamText = (p: { kind?: string; role?: string; team: string } | null | undefined) =>
		p && (p.kind === 'hero' || p.role) ? (p.team === 'blue' ? '#6aa8ff' : p.team === 'orange' ? '#ff9a4a' : undefined) : undefined;
	const labelOf = (p: typeof selPiece) => !p ? '' : p.kind === 'hero' ? `${heroById(p.hero ?? '')?.name ?? 'Hero'} (${playerName(p.id)})`
		: p.role ? `${p.role} minion`
		: p.token === 'companion' ? (p.label ?? 'companion')
		: p.token && MINES.has(p.token) ? (p.faceDown ? 'mine (face down)' : tokenName(p.token))
		: p.token ? tokenName(p.token) : 'token';
	$: selLabel = labelOf(selPiece);
	// the ONLY way the round / turn moves: the real card-flow advance (host-routed:
	// locks played cards into their slots, refreshes hands after turn 4). No manual
	// stepping back or forth — that was for testing and desyncs a real game.
	function advanceTurn() { session.cardAction({ kind: 'advance', pid: clientId }); }
	let tieFlip = false;
	function flipTie() {
		const next: Team = $ms.tieBreaker === 'orange' ? 'blue' : 'orange';
		session.act(`Tie-breaker → ${teamName(next)}`, { tieBreaker: next });
	}

	let confirmLeave = false;

	// ── phone layout (≤760px wide): the same Tide layer at zoom 1 — a one-row bar, the roster row under it (CardLayer),
	// the board, the hand and a two-row bottom bar (CardLayer); the menu is a full-screen sheet ──
	let gvw = 1440, gvh = 900;
	$: mobile = gvw <= 760;
	// desktop/tablet: one UI scale for HUD, panels, dash and overlays (layout.ts); a phone is laid out in real px
	$: lay = uiLayout(gvw, gvh);
	$: us = mobile ? 1 : lay.s;
	let lwOpen = false; // the phone's waves / Life sheet
	// the waves/life sheet follows a downward drag and closes past a threshold
	let sheetY: number | null = null, sheetDy = 0, sheetDragged = false;
	const sheetDown = (e: PointerEvent) => { sheetY = e.clientY; sheetDy = 0; sheetDragged = false; };
	const sheetMove = (e: PointerEvent) => {
		if (sheetY == null) return;
		sheetDy = Math.max(0, e.clientY - sheetY);
		if (sheetDy > 8 && !sheetDragged) { sheetDragged = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
	};
	const sheetUp = () => {
		if (sheetY == null) return;
		if (sheetDy > 70) lwOpen = false;
		sheetY = null; sheetDy = 0;
	};
	// a drag shouldn't also flip the token it started on
	const sheetClick = (e: MouseEvent) => { if (sheetDragged) { e.stopPropagation(); e.preventDefault(); sheetDragged = false; } };
	const FX_SHORT: Record<string, string> = { 'This turn': 'Turn', 'Next turn': 'Next', 'This round': 'Round' };
	// the card effects in play (the log panel; the phone's menu): one row per hero, five card-colour pips —
	// the colour of a card with a live effect lights up
	const FX_COLORS: Array<[string, string]> = [['GOLD', '#e8b64a'], ['SILVER', '#c6d0db'], ['RED', '#e0524a'], ['BLUE', '#3f7fe0'], ['GREEN', '#41ae59']];
	const DUR_RANK: Record<string, number> = { turn: 0, next: 1, round: 2 };
	$: abilityRows = $players
		.filter((p) => p.seat >= 0 && p.seat < $ms.seats && $ms.cards?.[p.id])
		.sort((a, b) => a.seat - b.seat)
		.map((p) => {
			const hero = $ms.cards![p.id].hero;
			const fx = activeFx.filter((e) => e.pid === p.id);
			const lit = new Set(fx.map((e) => heroCards(e.hero)[e.idx]?.color));
			const longest = fx.slice().sort((a, b) => DUR_RANK[b.dur] - DUR_RANK[a.dur])[0];
			// all of this player's live cards, longest-lasting first — the zoom view pages through them
			const all = fx.slice().sort((a, b) => DUR_RANK[b.dur] - DUR_RANK[a.dur]).map((e) => ({ hid: e.hero, idx: e.idx, pid: e.pid }));
			return { id: p.id, hero, name: heroById(hero)?.name ?? '', team: teamForSeat(p.seat, $ms.seats), lit, fx: longest, all };
		});

	// ── saved views: 3 slots of rotation + zoom + pan, kept in this browser ─────
	// (they carry over to new games, so a player's preferred angle is one tap away)
	type SavedView = { spin: number; scale: number; panX: number; panY: number };
	const VIEWS_KEY = 'goa2-views-v1';
	let views: (SavedView | null)[] = [null, null, null];
	try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? 'null'); if (Array.isArray(v)) views = [0, 1, 2].map((i) => v[i] ?? null); } catch {}
	function saveView(i: number) {
		if (!board) return;
		views = views.map((v, k) => (k === i ? board.getView() : v));
		try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch {}
	}
	function goView(i: number) { const v = views[i]; if (v && board) board.setView(v); }
	const viewLabel = (v: SavedView) => `${Math.round(v.spin)}° · ${v.scale.toFixed(1)}×`;
	$: log = $ms.log ?? [];

	// ── top bar (☰ · scoreline · view), log tab, prompt line, piece toolbar ──
	let viewOpen = false;
	// the island's resting view fits between the top bar (with the initiative rail's lane under it) and the tips of
	// the tucked hand over the console (layout.ts)
	$: boardInset = mobile ? null : { t: BOARD_TOP * lay.s, b: BOARD_BOTTOM * lay.s };
	// what CardLayer is showing (it tells us): the initiative rail, and how far down each open player board reaches
	let railOn = false, boardL = 0, boardR = 0;
	let covered = false; // the deck hides the board: nothing under it needs to move
	// the prompt line sits under the top bar, or under the rail while that is up (phone: under the roster row)
	$: promptTop = mobile ? (railOn ? 146 : 100) : railOn ? RAIL_Y + RAIL_H + 6 : TOP_Y + TOP_H + 8;
	$: promptRows = ($ms.wonBy || clearing ? 1
		: battle && !pendingToken && !pendingRespawn ? 1
		: (outgoing.length || hostWatch.length) && !pendingToken && !pendingRespawn ? outgoing.length + hostWatch.length
		: myDefeat && !iCanRespawn && !pendingRespawn && !pendingToken ? 1 : 0)
		+ (incoming ? 1 : 0) + (placing ? 1 : 0) + (lifeOut && !iAmHost ? 1 : 0);
	// the log's "effects in play": every hero with a live card effect
	$: liveFx = abilityRows.flatMap((r) => r.fx ? [{ id: r.id, name: `${r.name} · ${r.fx.name}`, when: FX_SHORT[effectLabel(r.fx, $ms.round, $ms.turn)],
		dots: FX_COLORS.filter(([c]) => r.lit.has(c)).map(([, hex]) => hex) }] : []);
	function readFx(id: string) { const r = abilityRows.find((x) => x.id === id); if (r?.fx) cardLayer?.showCard(r.fx.hero, r.fx.idx, r.fx.pid, r.all); }
	// the toolbar holds actions only (the piece's name is its hover label), so it shows only when there is one —
	// except on a touch screen, which has no hover: there it also names the piece
	const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
	$: toolHas = !!selPiece && (canFlip || selImmune || canBattleSel || ownHeroSel
		|| (canDefeatSel && (selPiece.kind === 'hero' || !selImmune || iAmHost))
		|| (canRemoveSel && selPiece.kind !== 'hero' && (!selImmune || iAmHost)));
	// the toolbar stands just above its piece — under it when the top bar, the rail or a prompt is in the way — and
	// is kept between the open player boards (all in design px: the layer is zoomed by the UI scale)
	const TOOL_H = 44;
	let toolHalf = 0; // half the toolbar's width, measured when it appears
	function toolFit(node: HTMLElement, _key: unknown) {
		const read = () => {
			const layer = node.parentElement;
			// as a share of the layer, so it does not matter how this browser reports sizes under `zoom`
			toolHalf = layer?.offsetWidth ? ((node.offsetWidth / layer.offsetWidth) * (gvw / us)) / 2 : 0;
		};
		read();
		return { update: read };
	}
	$: tipStyle = (() => {
		const floor = promptTop + promptRows * (mobile ? 46 : 50); // the first free line under the bar / rail / prompts
		if (!tipPos) return `top:${floor}px`; // its piece is off screen
		const s = us, cw = gvw / s;
		const lo = (boardL ? 12 + 352 : 0) + 8 + toolHalf, hi = cw - (boardR ? 12 + 352 : 0) - 8 - toolHalf;
		const x = lo <= hi ? Math.min(hi, Math.max(lo, tipPos.x / s)) : tipPos.x / s;
		const under = tipPos.y / s - TOOL_H < floor;
		return `left:${x}px; top:${(under ? tipPos.below : tipPos.y) / s}px${under ? '; transform:translate(-50%, 0)' : ''}`;
	})();
</script>

<svelte:window on:keydown={(e) => { if (e.key !== 'Escape') return; if (confirmLeave) confirmLeave = false; else if (manageOpen) manageOpen = false; else if (lwOpen) lwOpen = false; else { pendingSpawn = null; pendingToken = null; pingArmed = false; if (clearing) cancelClear(); } }} on:pointermove={tipNudge} on:wheel|passive={tipNudge} on:click={tipNudge} bind:innerWidth={gvw} bind:innerHeight={gvh} />

<div class="gamewrap" class:sea={boardLook === 'island'} class:mob={mobile} style={mobile ? '' : layoutVars(lay)}>
	{#if $ms.wonBy && !victoryClosed && !victoryHold}
		<VictorySplash team={$ms.wonBy.team} reason={$ms.wonBy.reason} myTeam={mySeat >= 0 && mySeat < $ms.seats ? myTeam : null} {mobile} onClose={() => (victoryClosed = true)} round={$ms.round} stats={gameStats} />
	{/if}
	{#if askLifeEnd && lifeOut}
		<div class="dlgs tide top-dlg">
		<div class="modal-scrim" role="presentation">
			<div class="modal" role="dialog" aria-modal="true" tabindex="-1">
				<h3>{teamName(lifeOut)} are out of Life</h3>
				<div class="mrow">
					<button class="mcancel" on:click={() => (lifeDismissed = lifeOut ?? '')}>Not yet</button>
					<button class="mleave win" on:click={endOnLife}>End the game</button>
				</div>
			</div>
		</div>
		</div>
	{/if}
	<BattleSplash news={battleNews} {mobile} myTeam={viewTeam} onDone={() => (battleDoneId = battleNews?.id ?? null)} />
	<!-- a push (mid-turn, or from the battle) waits for the battle splash to finish -->
	<PushSplash news={battleSplashing ? null : $ms.pushNews ?? null} {mobile} myTeam={mySeat >= 0 && mySeat < $ms.seats ? myTeam : null} />
	<DefeatSplash news={$ms.lastDefeat ?? null} pieces={$ms.pieces} cards={$ms.cards ?? {}} defeated={$ms.defeated ?? {}} names={(id) => playerName(id)} {lifeArt} {mobile} myTeam={viewTeam} />
	<div class="ocean"></div>
	<!-- on a phone the board sits between the top bar + player strip and the dash -->
	<div class="boardarea" class:mob={mobile}>
	<BoardCanvas bind:this={board} map={$ms.map ?? {}} look={boardLook} {glowZone} effects={boardFx && !covered} inset={boardInset} rotation={orientation} interactive={true} {placing} {placeGhost} holdColor={myHoldColor} onCancelPlace={cancelPlace} {areas} pieces={boardPieces} onMovePiece={move} onSelect={onSelectPiece} onHex={onBoardHex} {thrones} pings={boardPings} onPing={doPing} {pingArmed} />
	</div>

	<CardLayer bind:this={cardLayer} {mobile} {session} {ms} {players} {clientId} onAdvanceTurn={advanceTurn} onRespawn={placeMyHero} onEnter={placeMyHero} onArmToken={armToken} holdingToken={!!pendingToken} {pingArmed} onPing={pingButton} bind:previewId bind:railOn bind:boardL bind:boardR bind:covered />

	<div class="dlgs tide top-dlg">
	{#if pickKiller}
		<div class="modal-scrim" on:click={() => (pickKiller = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<h3>Who defeated you?</h3>
				<div class="ropts">
					{#each killers as k (k)}
						<button class="ropt" on:click={() => selfDefeat(k)}><b style:color={teamText({ kind: 'hero', team: teamOf($ms, k) ?? '' })}>{whoOf(k)}</b></button>
					{/each}
					{#if !killers.length}<p class="rnone">No enemy heroes in the game.</p>{/if}
				</div>
				<div class="mrow"><button class="mcancel" on:click={() => (pickKiller = false)}>Cancel</button></div>
			</div>
		</div>
	{/if}

	{#if removing && actPiece}
		<div class="modal-scrim" on:click={() => (removing = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				{#if pickHeroFor}
					<h3>Who moved through it?</h3>
					<div class="ropts">
						{#each enemyHeroes as h (h.id)}
							<button class="ropt" on:click={() => pickHeroFor && doRemove(pickHeroFor, h.id)}>{heroById(h.hero ?? '')?.name ?? 'Hero'}</button>
						{/each}
						{#if !enemyHeroes.length}<p class="rnone">No enemy heroes on the board.</p>{/if}
					</div>
					<div class="mrow"><button class="mcancel" on:click={() => (pickHeroFor = null)}>Back</button></div>
				{:else}
					<h3>Remove the {actLabel.replace(' (face down)', '')}?</h3>
					<div class="ropts">
						{#each removeOpts as o (o.id)}
							<button class="ropt" class:plain={o.id === 'remove'} on:click={() => doRemove(o)}><b>{o.label}</b>{#if o.hint}<small>{o.hint}</small>{/if}</button>
						{/each}
					</div>
					<div class="mrow"><button class="mcancel" on:click={() => (removing = false)}>Cancel</button></div>
				{/if}
			</div>
		</div>
	{/if}

	{#if confirmLeave}
		<div class="modal-scrim" on:click={() => (confirmLeave = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<h3>Leave the game?</h3>
				<div class="mrow">
					<button class="mcancel" on:click={() => (confirmLeave = false)}>Stay</button>
					<button class="mleave" on:click={onLeave}>Leave</button>
				</div>
			</div>
		</div>
	{/if}
	</div>

	<!-- ───────── the top bar (☰ · scoreline · view), the log tab, the prompt line, the piece toolbar, the menu ─────────
	     One layer in design px (zoomed by the UI scale). The roster chips either side of the scoreline, the
	     initiative rail under it and the console at the bottom belong to CardLayer.
	     Phones (`.ph`): the same layer at zoom 1 — one 48px bar (☰ and the one-row scoreline), the prompts and the
	     toolbar under CardLayer's roster row, the menu as a full-screen sheet (it also holds the log, the effects in
	     play, the view controls and the host's Undo), and the waves / Life sheet. -->
	<div class="tide top" class:ph={mobile}>
		{#if mobile}
			<div class="p-top">
				<button class="hbtn menubtn" class:is-on={manageOpen} on:click={() => (manageOpen = !manageOpen)} aria-label="Menu">
					<TopIcon name="menu" /><i class="dot {$status}"></i>{#if iAmHost && seatRequests.length}<b class="num">{seatRequests.length}</b>{/if}
				</button>
				<TopScore compact view={viewTeam} round={$ms.round} turn={$ms.turn} lane={$ms.lane ?? 1} life={$ms.life} lifeTok={$ms.lifeTok} waveTok={$ms.waveTok ?? []} tie={$ms.tieBreaker}
					{flips} {tieFlip} {lifeArt} {tieArt} onLife={toggleLife} onWave={toggleWave} onTie={flipTie} onSheet={() => (lwOpen = true)} />
			</div>
		{:else}
			<button class="hbtn menubtn" class:is-on={manageOpen} on:click={() => (manageOpen = !manageOpen)} title="Menu" aria-label="Menu">
				<TopIcon name="menu" /><i class="dot {$status}"></i>{#if iAmHost && seatRequests.length}<b class="num">{seatRequests.length}</b>{/if}
			</button>
			<TopScore view={viewTeam} round={$ms.round} turn={$ms.turn} lane={$ms.lane ?? 1} life={$ms.life} lifeTok={$ms.lifeTok} waveTok={$ms.waveTok ?? []} tie={$ms.tieBreaker}
				{flips} {tieFlip} {lifeArt} {tieArt} onLife={toggleLife} onWave={toggleWave} onTie={flipTie} />
			<button class="hbtn viewbtn" class:is-on={viewOpen} on:click={() => (viewOpen = !viewOpen)} title="View" aria-label="View"><TopIcon name="compass" /></button>
			{#if viewOpen}
				<div class="viewcol" style:top={boardR ? `${boardR + 8}px` : null}>
					<button class="hbtn" on:click={() => board?.reset()} title="Recentre" aria-label="Recentre"><TopIcon name="target" /></button>
					<button class="hbtn" on:click={() => board?.rotateBy(-45)} title="Turn left" aria-label="Turn left"><TopIcon name="rotl" /></button>
					<button class="hbtn" on:click={() => board?.rotateBy(45)} title="Turn right" aria-label="Turn right"><TopIcon name="rotr" /></button>
					<button class="hbtn" on:click={() => board?.zoomBtn(1.2)} title="Zoom in" aria-label="Zoom in"><TopIcon name="plus" /></button>
					<button class="hbtn" on:click={() => board?.zoomBtn(1 / 1.2)} title="Zoom out" aria-label="Zoom out"><TopIcon name="minus" /></button>
				</div>
			{/if}

			<TopLog bind:open={logOpen} {log} fx={liveFx} undo={iAmHost ? doUndo : null} canUndo={$canUndo} onFx={readFx} top={boardL ? boardL + 8 : 0} />
		{/if}

		<!-- one line per thing that needs an answer; empty while nothing does -->
		<div class="prompts" style:top="{promptTop}px">
			{#if $ms.wonBy}
				{#if victoryClosed}<button class="prompt" on:click={() => (victoryClosed = false)}>{teamName($ms.wonBy.team)} win</button>{/if}
			{:else if clearing}
				<div class="prompt">
					<span>{clearCands.length ? 'Clear tokens' : 'Nothing to clear'}</span>
					{#if clearCands.length > 1}<button class="pbtn" on:click={clearAll}>All</button>{/if}
					{#if clearCands.length}<button class="pbtn bad" on:click={doClear} disabled={!clearPick.length}>Remove {clearPick.length}</button>{/if}
					<button class="pbtn" on:click={cancelClear}>Cancel</button>
				</div>
			{:else if battle && !pendingToken && !pendingRespawn}
				<!-- the minion battle's removal step: the losing team takes off its own minions -->
				<div class="prompt battle is-{battle.loser}" class:plain={!iChooseBattle}>
					<span><b>{teamName(battle.loser)}</b> remove {battle.remove}</span>
					<span class="pips">{#each Array(battle.remove) as _, k (k)}<i></i>{/each}</span>
					{#if iChooseBattle}<button class="pbtn" on:click={battleAutoAll} title="Melee first, heavies last">Auto</button>{/if}
				</div>
			{:else if (outgoing.length || hostWatch.length) && !pendingToken && !pendingRespawn}
				{#each outgoing as [t, a] (t)}
					<div class="prompt is-bad"><span>{a.defending ? `${whoOf(t)} defends` : `Attacking ${whoOf(t)}`}</span><button class="pbtn" on:click={() => answer(t, 'cancel')}>Call off</button></div>
				{/each}
				{#each hostWatch as [t, a] (t)}
					<div class="prompt is-bad">
						<span>{heroOf(a.by)} attacks {whoOf(t)} · away</span>
						<button class="pbtn" on:click={() => answer(t, 'defended')}>Defended</button>
						<button class="pbtn bad" on:click={() => answer(t, 'defeated')}>Defeated</button>
					</div>
				{/each}
			{:else if myDefeat && !iCanRespawn && !pendingRespawn && !pendingToken}
				<div class="prompt plain is-bad"><span>Defeated · respawn next turn</span></div>
			{/if}
			{#if incoming}
				<div class="prompt ask is-bad" role="alertdialog" aria-label="You are being attacked">
					<span><b>{mobile ? heroOf(incoming.by) : whoOf(incoming.by)}</b> attacks you</span>
					<button class="pbtn go" on:click={() => answer(clientId, 'defend')}>Defend</button>
					<button class="pbtn bad" on:click={() => answer(clientId, 'defeated')}>Defeated</button>
				</div>
			{/if}
			{#if placing}
				<div class="prompt place">
					<span>{pendingRespawn ? 'Pick a spawn point' : pendingToken ? `Place ${pendingToken.token === 'companion' ? pendingToken.label : tokenName(pendingToken.token)}` : pendingSpawn ? `Place ${pendingSpawn.role} minion` : ''}</span>
					<button class="pbtn" on:click={cancelPlace}>Cancel</button>
				</div>
			{/if}
			{#if lifeOut && !iAmHost}<div class="prompt plain"><span>{teamName(lifeOut)} out of Life · waiting for host</span></div>{/if}
		</div>

		<!-- the piece toolbar: actions only, above the selected piece; a confirm takes its place -->
		{#if confirmKind && actPiece}
			<div class="ptool confirm" class:free={!tipPos} style={tipStyle} use:toolFit={`${confirmKind}${actId}`}>
				{#if (confirmKind === 'attack' || confirmKind === 'defeat') && attackSum}
					<span class="lbl" style:color={teamText(actPiece)}>{whoOf(actPiece.id)}</span>
					<span class="gain" title="You get {attackSum.coins}{attackSum.assists.length ? `, each teammate ${attackSum.assist}` : ''}">
						<i class="coin"></i>+{attackSum.coins}{#if attackSum.assists.length}<em>/</em>+{attackSum.assist}{/if}
					</span>
					<span class="gain" title="The {teamName(attackSum.team)} lose {attackSum.lives} Life"><img src={lifeArt((attackSum.team ?? 'orange') as Team, 'front')} alt="" />−{attackSum.lives}</span>
					{#if confirmKind === 'attack'}<button class="pbtn go" on:click={doAttack}>Attack</button>
					{:else}<button class="pbtn bad" on:click={doDefeatHero}>Defeat</button>{/if}
				{:else if confirmKind === 'selfremove'}
					<span class="lbl">Your hero</span>
					<button class="pbtn bad" on:click={doSelfRemove}>Remove</button>
				{:else}
					<span class="lbl" style:color={teamText(actPiece)}>{actPiece.role ?? ''} minion</span>
					<button class="pbtn bad" on:click={doRemoveMinion}>Remove</button>
				{/if}
				<button class="pbtn x" on:click={closeConfirm} aria-label="Cancel"><TopIcon name="x" /></button>
			</div>
		{:else if selPiece && (toolHas || touch)}
			<div class="ptool" class:free={!tipPos} style={tipStyle} aria-label={selLabel} use:toolFit={`${selPieceId}${clearCount}${canFlip}${canBattleSel}`}>
				{#if touch}<span class="lbl" style:color={teamText(selPiece)}>{selLabel}</span>{/if}
				{#if canFlip}<button class="pbtn go" on:click={flipMine}>Flip</button>{/if}
				{#if selImmune}<span class="imm" title="Heavy minions can't be moved, defeated or removed while another minion of their team is in the battle zone">Immune</span>{/if}
				{#if canDefeatSel && selPiece.kind === 'hero'}
					<button class="pbtn go" on:click={() => attackSel('attack')} disabled={!!attacks[selPiece.id]}>Attack</button>
					<button class="pbtn bad" on:click={() => attackSel('defeat')} title="Not an attack: defeat them outright (same rewards)">Defeat</button>
				{:else if canDefeatSel && (!selImmune || iAmHost)}
					<button class="pbtn go" on:click={defeatSel}>Defeat <i class="coin"></i>{minionCoins(selPiece.role)}</button>
				{/if}
				{#if ownHeroSel}
					{#if ownAttack}<button class="pbtn go" on:click={startClear} disabled={!clearCount} title="Clear instead of attacking: remove tokens next to you">Clear{clearCount ? ` ${clearCount}` : ''}</button>{/if}
					<button class="pbtn bad" on:click={selfRemoveAsk} title="A card effect takes your hero off the board: no rewards, back with your next card">Remove</button>
					<button class="pbtn bad" on:click={selfDefeatAsk} title="You were defeated (not by an attack): choose who gets the reward">Defeat</button>
				{/if}
				{#if canBattleSel}<button class="pbtn go" on:click={battleTakeSel}>For the battle</button>{/if}
				{#if canRemoveSel && selPiece.kind !== 'hero' && (!selImmune || iAmHost)}<button class="pbtn bad" on:click={openRemove}>Remove</button>{/if}
			</div>
		{/if}

		{#if manageOpen}
			<TopMenu {room} mapName={$ms.map?.name ?? 'Board'} status={$status} host={iAmHost} hostId={$ms.host} me={clientId} {mySeat} seats={seatRows} requests={seatRequests} {myRequestSeat} {spectators}
				look={boardLook} glow={zoneGlow} fx={boardFx} views={views.map((v) => (v ? viewLabel(v) : null))} {pushArm} won={!!$ms.wonBy}
				onClose={() => (manageOpen = false)} onLeave={() => { manageOpen = false; confirmLeave = true; }} onKick={kickSeat} onRequestSeat={requestSeat} onResolveSeat={resolveSeat}
				onLook={setBoardLook} onGlow={setZoneGlow} onFx={setBoardFx} onGoView={(i) => { goView(i); manageOpen = false; }} onSaveView={saveView}
				onSpawn={(t, r) => { armSpawn(t, r); manageOpen = false; }} onPush={manualPush}
				phone={mobile} {log} effects={liveFx} onEffect={(id) => { manageOpen = false; readFx(id); }} undo={mobile && iAmHost ? doUndo : null} canUndo={$canUndo}
				onReset={() => board?.reset()} onRotate={(d) => board?.rotateBy(d)} onZoom={(f) => board?.zoomBtn(f)} />
		{/if}

		<!-- phone: waves and Life — tap a token to flip it; drag down to close -->
		{#if mobile && lwOpen}
			<div class="scrimx" on:click={() => (lwOpen = false)} on:keydown={() => {}} role="presentation"></div>
			<div class="p-sheet" class:drag={sheetY != null} style:transform={sheetDy ? `translateY(${sheetDy}px)` : null}
				on:pointerdown={sheetDown} on:pointermove={sheetMove} on:pointerup={sheetUp} on:pointercancel={sheetUp} on:click|capture={sheetClick} role="presentation">
				<span class="grab"></span>
				<div class="srow">
					<span class="t-label">Waves</span><b class="n">{$ms.waves}</b>
					<span class="toks">{#each $ms.waveTok ?? [] as full, i}<button class="wv" class:spent={!full} class:flip={flips[`w${i}`]} on:click={() => toggleWave(i)} aria-label="Wave token"></button>{/each}</span>
				</div>
				<div class="srow"><span class="t-label">Zone</span><span class="zone">{placeName(battleZone($ms))}</span></div>
				{#each [viewTeam === 'orange' ? 'blue' : 'orange', viewTeam] as t}
					<div class="srow is-{t}">
						<span class="t-label">{teamName(t)}</span><b class="n">{$ms.life[t as Team]}</b>
						<span class="toks">{#each $ms.lifeTok?.[t as Team] ?? [] as full, i}<button class="lt" class:lost={!full} class:flip={flips[`l${t}${i}`]} style="background-image:url({lifeArt(t as Team, full ? 'front' : 'back')})" on:click={() => toggleLife(t as Team, i)} aria-label="{teamAdj(t)} Life token"></button>{/each}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.gamewrap { position: fixed; inset: 0; color: #f1f5f9; overflow: hidden; overflow: clip; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
	.gamewrap.sea { background: #0b4f80; } /* island look: deep water behind everything (the phone bars sit outside the board) */
	/* ocean backdrop — deep water with layered swells + moving caustics so the hex island reads as floating on sea */
	.ocean { position: absolute; inset: 0;
		background:
			radial-gradient(60% 45% at 78% 12%, rgba(52, 128, 160, 0.35), transparent 60%),
			radial-gradient(70% 60% at 20% 88%, rgba(20, 70, 110, 0.4), transparent 62%),
			radial-gradient(140% 120% at 50% -15%, #1a4a63 0%, #0c3247 38%, #071f30 70%, #04121d 100%);
	}
	.boardarea { position: absolute; inset: 0; }
	/* phone: the board sits between the top bar + roster row and the bottom bar (the hand's tips lie over its lower edge) */
	.boardarea.mob { top: 92px; bottom: 124px; }
	.scrimx { position: fixed; inset: 0; z-index: 18; background: rgba(3, 11, 21, 0.5); }

	/* the small dialogs (the Tide look comes from ui/top-game.css) */
	.dlgs { display: contents; }
	.modal-scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3, 8, 14, 0.6); }
	.modal { width: min(360px, 90vw); background: rgba(12, 18, 32, 0.92); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
	.modal h3 { font-family: 'Modesto Poster', serif; font-size: 1.4rem; margin: 0 0 6px; }
	/* Remove menu: one button per reason, the plain Remove last */
	.ropts { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 14px; }
	.ropt { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 9px 12px; border-radius: 10px; cursor: pointer; text-align: left; font: inherit;
		color: #f6ead2; background: rgba(199, 154, 78, 0.16); border: 1px solid rgba(199, 154, 78, 0.5); }
	.ropt:hover { background: rgba(199, 154, 78, 0.3); }
	.ropt b { font-weight: normal; font-size: 0.95rem; }
	.ropt small { font-size: 0.7rem; color: #cbb488; }
	.ropt.plain { color: #ffb4b4; background: rgba(220, 60, 60, 0.16); border-color: rgba(239, 68, 68, 0.45); }
	.ropt.plain:hover { background: rgba(220, 60, 60, 0.3); }
	.rnone { font-size: 0.8rem; color: #93a3b8; }
	.modal p { margin: 0 0 16px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.45; }
	.mrow { display: flex; gap: 10px; justify-content: flex-end; }
	.mcancel, .mleave { border-radius: 10px; padding: 0.5rem 1.1rem; cursor: pointer; font-weight: 700; border: 1px solid transparent; }
	.mcancel { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.16); color: #e5e7eb; }
	.mcancel:hover { background: rgba(255, 255, 255, 0.16); }
	.mleave { background: #dc2626; color: #fff; }
	.mleave:hover { background: #ef4444; }
	/* desktop: the small dialogs scale with the UI (everything else of the desktop HUD sits in the zoomed .top layer) */
	.gamewrap:not(.mob) .modal { zoom: var(--uis, 1); }
</style>
