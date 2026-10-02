<script lang="ts">
	import { onDestroy } from 'svelte';
	import { readable, type Readable } from 'svelte/store';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import CardLayer from '$lib/CardLayer.svelte';
	import DefeatSplash from '$lib/DefeatSplash.svelte';
	import BattleSplash from '$lib/BattleSplash.svelte';
	import PushSplash from '$lib/PushSplash.svelte';
	import VictorySplash from '$lib/VictorySplash.svelte';
	// desktop / tablet HUD in the Tide look: scoreline, log tab, menu (the phone keeps its own bars)
	import TopScore from '$lib/ui/TopScore.svelte';
	import TopLog from '$lib/ui/TopLog.svelte';
	import TopMenu from '$lib/ui/TopMenu.svelte';
	import TopIcon from '$lib/ui/TopIcon.svelte';
	import '$lib/ui/top-game.css';
	import { heroById, heroLogo } from '$lib/heroes';
	import { teamName, teamAdj, aMinion, placeName } from '$lib/teams';
	import { createRecorder } from '$lib/recorder';
	import { zoneName } from '$lib/zones';
	import { effectLabel } from '$lib/effects';
	import { battleZone, canBattleRemove, pushLane, laneNotes, heavyImmune } from '$lib/battle';
	import lifeSplit from '$lib/images/life_split.png';
	import { heroCards } from '$lib/cards/deck';
	import { ultimateIndex, allowedMoves } from '$lib/cards/cardstate';
	import { uiLayout, layoutVars, TOP_Y, TOP_H, RAIL_Y, RAIL_H, BOARD_TOP, BOARD_BOTTOM } from '$lib/layout';
	import { placeToken, moveToken, effectiveHex, MINES, tokenName, tokensLeft, removalOptions, applyRemoval, removalLog, canRemove, type ArmToken, type RemovalOption } from '$lib/tokens';
	import {
		colorHex, movePiece, teamForSeat, throneHex, minionCoins, heroDefeatSummary, canRespawn, freeSpawns, teamOf, clearable, boardLookOf, zoneGlowOf, boardFxOf, type BoardLook,
		type MatchState, type Player, type MatchSession, type Team, type ConnStatus
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
	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

	// ── game over ──
	// a team's Life hit 0: the host confirms before the game ends (a mis-click on a token can't end it)
	$: lifeOut = !$ms.wonBy ? ($ms.life.orange <= 0 ? 'orange' : $ms.life.blue <= 0 ? 'blue' : null) as Team | null : null;
	let lifeDismissed = '';
	$: askLifeEnd = iAmHost && !!lifeOut && lifeDismissed !== lifeOut;
	$: if (!lifeOut) lifeDismissed = '';
	function endOnLife() {
		if (!lifeOut) return;
		const win: Team = lifeOut === 'orange' ? 'blue' : 'orange';
		session.act(`🏆 ${teamName(win)} win — ${teamName(lifeOut)} ran out of Life Tokens`, { wonBy: { team: win, reason: `${teamName(lifeOut)} ran out of Life Tokens` } });
	}
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
	const MINION_ROLES: Array<'melee' | 'ranged' | 'heavy'> = ['melee', 'ranged', 'heavy'];
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
	// desktop: the toolbar floats just above the selected piece. It is placed when the piece is selected and
	// re-placed when something could have moved it — the pieces, the window, any input that pans / zooms / turns
	// the board — then frame by frame only for as long as it is still moving. (It used to be read every frame
	// while a piece was selected; a running rAF loop makes the page produce every frame.)
	let tipPos: { x: number; y: number; below: number } | null = null; // x · just above the piece · just under it (px)
	let tipRaf = 0;
	let tipFor: string | null = null;
	function placeTip() {
		tipRaf = 0;
		const p = tipId && !mobile ? board?.clientPos(tipId) : null;
		const x = p ? Math.round(p.x) : null, y = p ? Math.round(p.y - p.r - 8) : null;
		if (!p || x == null || y == null) { if (tipPos) tipPos = null; return; }
		if (tipPos && tipPos.x === x && tipPos.y === y) return; // at rest
		tipPos = { x, y, below: Math.round(p.y + p.r + 8) };
		tipRaf = requestAnimationFrame(placeTip); // it moved: look again next frame
	}
	const tipNudge = () => { if (tipId && !mobile && !tipRaf) tipRaf = requestAnimationFrame(placeTip); };
	function trackTip() {
		if (typeof window === 'undefined') return;
		if (!tipId || mobile) { cancelAnimationFrame(tipRaf); tipRaf = 0; tipPos = null; tipFor = null; return; }
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

	const connLabel = (s: ConnStatus) =>
		s === 'connected' ? 'Connected' : s === 'reconnecting' ? 'Reconnecting…' : s === 'closed' ? 'Disconnected' : 'Connecting…';

	let confirmLeave = false;

	// ── phone layout (≤760px wide): top bar + ☰ menu instead of the left HUD ──
	let gvw = 1440, gvh = 900;
	$: mobile = gvw <= 760;
	// desktop/tablet: one UI scale for HUD, panels, dash and overlays (layout.ts)
	$: lay = uiLayout(gvw, gvh);
	let menuOpen = false, lwOpen = false;
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
	$: myCoins = $ms.cards?.[clientId]?.coins ?? null;
	// top-bar ULT: locked until level 8, then opens your ultimate
	$: myCs = $ms.cards?.[clientId];
	$: myUltIdx = myCs ? ultimateIndex(myCs.hero) : -1;
	// level 7 with all three Tier III and the coins: the top-bar button unlocks it
	$: ultReady = !!myCs && myUltIdx >= 0 && allowedMoves(myCs, myUltIdx).includes('hand');
	function coins(d: number) { session.cardAction({ kind: 'coins', pid: clientId, delta: d }); }
	const FX_SHORT: Record<string, string> = { 'This turn': 'Turn', 'Next turn': 'Next', 'This round': 'Round' };
	// "Active abilities" (☰ menu on phones, left HUD on desktop): one fixed row per hero (so the log never shifts),
	// five card-colour pips — the colour of a card with a live effect lights up
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

	// ── desktop / tablet: top bar (☰ · scoreline · view), log tab, prompt line, piece toolbar ──
	let viewOpen = false;
	// the island's resting view fits between the top bar (with the initiative rail's lane under it) and the tips of
	// the tucked hand over the console (layout.ts)
	$: boardInset = mobile ? null : { t: BOARD_TOP * lay.s, b: BOARD_BOTTOM * lay.s };
	// what CardLayer is showing (it tells us): the initiative rail, and how far down each open player board reaches
	let railOn = false, boardL = 0, boardR = 0;
	let covered = false; // the deck hides the board: nothing under it needs to move
	// the prompt line sits under the top bar, or under the rail while that is up
	$: promptTop = railOn ? RAIL_Y + RAIL_H + 6 : TOP_Y + TOP_H + 8;
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
			toolHalf = layer?.offsetWidth ? ((node.offsetWidth / layer.offsetWidth) * (gvw / lay.s)) / 2 : 0;
		};
		read();
		return { update: read };
	}
	$: tipStyle = (() => {
		const floor = promptTop + promptRows * 50; // the first free line under the bar / rail / prompts
		if (!tipPos) return `top:${floor}px`; // its piece is off screen
		const s = lay.s, cw = gvw / s;
		const lo = (boardL ? 12 + 352 : 0) + 8 + toolHalf, hi = cw - (boardR ? 12 + 352 : 0) - 8 - toolHalf;
		const x = lo <= hi ? Math.min(hi, Math.max(lo, tipPos.x / s)) : tipPos.x / s;
		const under = tipPos.y / s - TOOL_H < floor;
		return `left:${x}px; top:${(under ? tipPos.below : tipPos.y) / s}px${under ? '; transform:translate(-50%, 0)' : ''}`;
	})();
</script>

<!-- battle zone + host push override (desktop HUD and the phone waves sheet) -->
{#snippet laneCtl()}
	<div class="lane">
		<span class="bz" title="Battle zone — the minion battle is fought here; a push moves it one zone towards the loser's throne">⚔ {placeName(battleZone($ms))}</span>
		{#if iAmHost && !$ms.wonBy}
			<span class="pushes">
				{#each ['orange', 'blue'] as t}
					<button class="pushb {t}" class:arm={pushArm === t} on:click={() => manualPush(t as Team)} title="Host override: the {teamName(t)} push the lane">{pushArm === t ? 'Confirm?' : `${teamAdj(t)} push`}</button>
				{/each}
			</span>
		{/if}
	</div>
{/snippet}

<svelte:window on:keydown={(e) => { if (e.key !== 'Escape') return; if (confirmLeave) confirmLeave = false; else if (manageOpen) manageOpen = false; else { pendingSpawn = null; pendingToken = null; pingArmed = false; if (clearing) cancelClear(); } }} on:pointerdown={(e) => { viewsOutside(e); }} on:pointermove={tipNudge} on:wheel|passive={tipNudge} on:click={tipNudge} bind:innerWidth={gvw} bind:innerHeight={gvh} />

<div class="gamewrap" class:sea={boardLook === 'island'} class:mob={mobile} style={mobile ? '' : layoutVars(lay)}>
	{#if !mobile}
		<!-- desktop / tablet: the prompt line lives in the top layer (below) -->
	{:else if $ms.wonBy}
		<button class="placehint won" on:click={() => (victoryClosed = false)} title="Show the victory screen again">🏆 {teamName($ms.wonBy.team)} win — {$ms.wonBy.reason}</button>
	{:else if clearing}
		<!-- Clear action: choose which of the tokens next to your hero leave the board -->
		<div class="placehint clr">
			<span>{clearCands.length ? 'Clear — tap the glowing tokens next to you' : 'Clear — no tokens next to you'}</span>
			{#if clearCands.length > 1}<button class="spcancel" on:click={clearAll}>All</button>{/if}
			<button class="spcancel red" on:click={doClear} disabled={!clearPick.length}>Remove {clearPick.length}</button>
			<button class="spcancel" on:click={cancelClear}>Cancel</button>
		</div>
	{:else if battle && !pendingToken && !pendingRespawn && !(mobile && pendingSpawn)}
		<!-- the battle's removal step: who removes how many of THEIR OWN minions, impossible to miss -->
		<div class="battlebox" style="--lc:{battle.loser === 'blue' ? '#2f7fe6' : '#ef7d22'}; --lt:{battle.loser === 'blue' ? '#8cc0ff' : '#ffb27a'}">
			<div class="bbhead">⚔ Minion battle · <b class="to">Atlanteans {battle.orange}</b> : <b class="tb">{battle.blue} Titans</b></div>
			<div class="bbmain">
				<span>The <b class="lt">{teamName(battle.loser)}</b> remove <b class="n">{battle.remove}</b> of their own minion{battle.remove === 1 ? '' : 's'}</span>
				<span class="bbpips">{#each Array(battle.remove) as _, k (k)}<i></i>{/each}</span>
			</div>
			{#if iChooseBattle}
				<div class="bbsub">{myTeam === battle.loser ? 'Tap your glowing minions to remove them' : `Tap the glowing ${battle.loser} minions to remove them`} — the heavy goes last
					<button class="bbauto" on:click={battleAutoAll} title="Melee first, heavies last">Let the game choose</button></div>
			{:else}
				<div class="bbsub">Waiting for the {teamName(battle.loser)} to remove {battle.remove === 1 ? 'a minion' : `${battle.remove} minions`}…</div>
			{/if}
		</div>
	{:else if (outgoing.length || hostWatch.length) && !pendingToken && !pendingRespawn}
		<div class="placehint atk">
			{#each outgoing as [t, a] (t)}
				<span>⚔ {a.defending ? `${whoOf(t)} is defending…` : `Waiting for ${whoOf(t)} to answer…`}</span>
				<button class="spcancel" on:click={() => answer(t, 'cancel')}>Call off</button>
			{/each}
			{#each hostWatch as [t, a] (t)}
				<span>⚔ {heroOf(a.by)} attacks {whoOf(t)} (away)</span>
				<button class="spcancel" on:click={() => answer(t, 'defended')}>Defended</button>
				<button class="spcancel red" on:click={() => answer(t, 'defeated')}>Defeated</button>
			{/each}
		</div>
	{:else if myDefeat && !iCanRespawn && !pendingRespawn && !pendingToken}
		<div class="placehint defeat"><span>Defeated — play a card on your next turn to respawn</span></div>
	{/if}
	{#if mobile && incoming}
		<div class="atkask" role="alertdialog" aria-label="You are being attacked">
			<span><b>{whoOf(incoming.by)}</b> is attacking. Defend?</span>
			<span class="atkbtns">
				<button class="ab yes" style:--tc={myTeam === 'blue' ? '#2f7fe6' : '#ef7d22'} on:click={() => answer(clientId, 'defend')}>Yes</button>
				<button class="ab no" on:click={() => answer(clientId, 'defeated')}>No</button>
			</span>
		</div>
	{/if}
	{#if mobile && (pendingToken || pendingRespawn || pendingSpawn)}
		<div class="placehint">
			{#if pendingRespawn}
				<span>Tap a glowing spawn point in your base</span>
			{:else if pendingToken}
				<span>Tap a hex to place {pendingToken.token === 'companion' ? pendingToken.label : tokenName(pendingToken.token)}{MINES.has(pendingToken.token) ? ' (face down)' : ''}</span>
			{:else if pendingSpawn}
				<span>Tap a hex to place the {pendingSpawn.team} {pendingSpawn.role}</span>
			{/if}
			<button class="spcancel" on:click={cancelPlace}>Cancel</button>
		</div>
	{/if}
	{#if $ms.wonBy && !victoryClosed && !victoryHold}
		<VictorySplash team={$ms.wonBy.team} reason={$ms.wonBy.reason} myTeam={mySeat >= 0 && mySeat < $ms.seats ? myTeam : null} {mobile} onClose={() => (victoryClosed = true)} round={$ms.round} />
	{/if}
	{#if askLifeEnd && lifeOut}
		<div class="dlgs" class:tide={!mobile} class:top-dlg={!mobile}>
		<div class="modal-scrim" role="presentation">
			<div class="modal" role="dialog" aria-modal="true" tabindex="-1">
				{#if mobile}
					<h3>The {teamName(lifeOut)} have no Life Tokens left</h3>
					<p>End the game? <b style:color={lifeOut === 'orange' ? '#8cc0ff' : '#ffb27a'}>{teamName(lifeOut === 'orange' ? 'blue' : 'orange')}</b> win.</p>
				{:else}
					<h3>{teamName(lifeOut)} are out of Life</h3>
				{/if}
				<div class="mrow">
					<button class="mcancel" on:click={() => (lifeDismissed = lifeOut ?? '')}>Not yet</button>
					<button class="mleave win" on:click={endOnLife}>{mobile ? '🏆 End the game' : 'End the game'}</button>
				</div>
			</div>
		</div>
		</div>
	{:else if mobile && lifeOut && !iAmHost}
		<div class="placehint lifeout">The {teamName(lifeOut)} have no Life Tokens left — waiting for the host to end the game</div>
	{/if}
	<BattleSplash news={battleNews} {mobile} myTeam={viewTeam} onDone={() => (battleDoneId = battleNews?.id ?? null)} />
	<!-- a push (mid-turn, or from the battle) waits for the battle splash to finish -->
	<PushSplash news={battleSplashing ? null : $ms.pushNews ?? null} {mobile} myTeam={viewTeam} />
	<DefeatSplash news={$ms.lastDefeat ?? null} pieces={$ms.pieces} cards={$ms.cards ?? {}} defeated={$ms.defeated ?? {}} names={(id) => playerName(id)} {lifeArt} {mobile} myTeam={viewTeam} />
	<div class="ocean"></div>
	<!-- on a phone the board sits between the top bar + player strip and the dash -->
	<div class="boardarea" class:mob={mobile}>
	<BoardCanvas bind:this={board} map={$ms.map ?? {}} look={boardLook} {glowZone} effects={boardFx && !covered} inset={boardInset} rotation={orientation} interactive={true} {placing} {placeGhost} holdColor={myHoldColor} onCancelPlace={cancelPlace} {areas} pieces={boardPieces} onMovePiece={move} onSelect={onSelectPiece} onHex={onBoardHex} {thrones} pings={boardPings} onPing={doPing} {pingArmed} />
	</div>

	<CardLayer bind:this={cardLayer} {mobile} {session} {ms} {players} {clientId} onAdvanceTurn={advanceTurn} onRespawn={placeMyHero} onEnter={placeMyHero} onArmToken={armToken} holdingToken={!!pendingToken} {pingArmed} onPing={pingButton} bind:previewId bind:railOn bind:boardL bind:boardR bind:covered />

	<!-- phone: the selected piece's toolbar, under the player strip -->
	{#if !mobile}
		<!-- desktop / tablet: the toolbar lives in the top layer (below) -->
	{:else if confirmKind && actPiece}
		<div class="pietool confirm">
			{#if (confirmKind === 'attack' || confirmKind === 'defeat') && attackSum}
				<span class="pietxt nc">{confirmKind === 'attack' ? 'Attack' : 'Defeat'} <b style:color={teamText(actPiece)}>{whoOf(actPiece.id)}</b>?</span>
				<span class="rw" title="You get {attackSum.coins}{attackSum.assists.length ? `, each teammate ${attackSum.assist} assist` : ''}">
					<span class="gc sm"></span><b>{attackSum.coins}</b>{#if attackSum.assists.length}<i>/</i><span class="gc sm"></span><b>{attackSum.assist}</b>{/if}
				</span>
				<span class="rw" title="The {teamName(attackSum.team)} lose {attackSum.lives} Life"><img class="lt" src={lifeArt((attackSum.team ?? 'orange') as Team, 'back')} alt="" /><b>{attackSum.lives}</b></span>
				{#if confirmKind === 'attack'}<button class="piedefeat" on:click={doAttack}>⚔ Attack</button>
				{:else}<button class="piedefeat" on:click={doDefeatHero}>☠ Defeat</button>{/if}
			{:else if confirmKind === 'selfremove'}
				<span class="pietxt nc">Take your hero off the board? <small class="pienote">Back with your next card</small></span>
				<button class="piedel" on:click={doSelfRemove}>Remove</button>
			{:else}
				<span class="pietxt nc">Remove <b style:color={teamText(actPiece)}>{cap(actPiece.role ?? '')} Minion</b></span>
				<button class="piedel" on:click={doRemoveMinion}>Remove</button>
			{/if}
			<button class="piex" on:click={closeConfirm} aria-label="Cancel">✕</button>
		</div>
	{:else if selPiece && (selPiece.role || selPiece.token || (selPiece.kind === 'hero' && (canDefeatSel || ownHeroSel)))}
		<div class="pietool">
			<span class="pietxt" style:color={teamText(selPiece)}>{selLabel}</span>
			{#if canFlip}
				<button class="pieflip" on:click={flipMine}>{selPiece.faceDown ? 'Flip — reveal' : 'Flip face down'}</button>
			{/if}
			{#if selImmune}<span class="pieimm" title="Heavy minions can't be moved, defeated or removed while another minion of their team is in the battle zone{iAmHost ? ' — as host you can still override for card exceptions' : ''}">Immune</span>{/if}
			{#if canDefeatSel && selPiece.kind === 'hero'}
				<button class="piedefeat" on:click={() => attackSel('attack')} disabled={!!attacks[selPiece.id]}>{attacks[selPiece.id] ? 'Under attack…' : '⚔ Attack'}</button>
				<button class="piedel" on:click={() => attackSel('defeat')} title="Not an attack (e.g. a discard-or-die effect): defeat them outright — same rewards">☠ Defeat</button>
			{:else if canDefeatSel && (!selImmune || iAmHost)}
				<button class="piedefeat" on:click={defeatSel}>Defeat <span class="gc sm"></span>{minionCoins(selPiece.role)}</button>
			{/if}
			{#if ownHeroSel}
				{#if ownAttack}<button class="piedefeat" on:click={startClear} disabled={!clearCount} title="Clear instead of attacking: choose which tokens next to you leave the board">Clear{clearCount ? ` (${clearCount})` : ''}</button>{/if}
				<button class="piedel" on:click={selfRemoveAsk} title="A card effect takes your hero off the board — no rewards; back with your next card">Remove</button>
				<button class="piedel" on:click={selfDefeatAsk} title="You were defeated (not by an Attack): choose who gets the reward">☠ Defeat</button>
			{/if}
			{#if canBattleSel}<button class="piedefeat" on:click={battleTakeSel}>Remove for the battle</button>{/if}
			{#if canRemoveSel && selPiece.kind !== 'hero' && (!selImmune || iAmHost)}<button class="piedel" on:click={openRemove}>Remove</button>{/if}
		</div>
	{/if}

	<div class="dlgs" class:tide={!mobile} class:top-dlg={!mobile}>
	{#if pickKiller}
		<div class="modal-scrim" on:click={() => (pickKiller = false)} on:keydown={() => {}} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<h3>Who defeated you?</h3>
				{#if mobile}<p>They get the reward, their teammates the assist coins, and you respawn as usual.</p>{/if}
				<div class="ropts">
					{#each killers as k (k)}
						{@const sum = heroDefeatSummary($ms, k, clientId)}
						<button class="ropt" on:click={() => selfDefeat(k)}><b style:color={teamText({ kind: 'hero', team: teamOf($ms, k) ?? '' })}>{whoOf(k)}</b>{#if mobile}<small>+{sum.coins} coins{sum.assists.length ? ` · teammates +${sum.assist}` : ''} · the {teamName(sum.team)} lose {sum.lives} Life</small>{/if}</button>
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
					{#if mobile}<p>The mine is revealed and removed. A Blast makes that hero discard a card, if able.</p>{/if}
					<div class="ropts">
						{#each enemyHeroes as h (h.id)}
							<button class="ropt" on:click={() => pickHeroFor && doRemove(pickHeroFor, h.id)}>{heroById(h.hero ?? '')?.name ?? 'Hero'}</button>
						{/each}
						{#if !enemyHeroes.length}<p class="rnone">No enemy heroes on the board.</p>{/if}
					</div>
					<div class="mrow"><button class="mcancel" on:click={() => (pickHeroFor = null)}>Back</button></div>
				{:else}
					<h3>Remove the {mobile ? actLabel : actLabel.replace(' (face down)', '')}?</h3>
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
				{#if mobile}<p>You'll drop back to the menu. You can rejoin with the room code while the game is live.</p>{/if}
				<div class="mrow">
					<button class="mcancel" on:click={() => (confirmLeave = false)}>Stay</button>
					<button class="mleave" on:click={onLeave}>Leave</button>
				</div>
			</div>
		</div>
	{/if}
	</div>

	{#if manageOpen && mobile}
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

				<div class="mpsec">
					<div class="mplbl">Board{#if !iAmHost}<span class="ct">host's choice</span>{/if}</div>
					<div class="mprow">
						<span class="mpname">Map visuals</span>
						<span class="mpacts">
							<button class="act sm" class:primary={boardLook === 'island'} disabled={!iAmHost} on:click={() => setBoardLook('island')}>Island</button>
							<button class="act sm" class:primary={boardLook === 'classic'} disabled={!iAmHost} on:click={() => setBoardLook('classic')}>Classic</button>
						</span>
					</div>
					<div class="mprow">
						<span class="mpname">Battle zone outline</span>
						<span class="mpacts">
							<button class="act sm" class:primary={zoneGlow} disabled={!iAmHost || boardLook !== 'island'} on:click={() => setZoneGlow(true)}>On</button>
							<button class="act sm" class:primary={!zoneGlow} disabled={!iAmHost || boardLook !== 'island'} on:click={() => setZoneGlow(false)}>Off</button>
						</span>
					</div>
					<div class="mprow">
						<span class="mpname">Moving effects<span class="mphero">the sea · turning minion rims · the outline's pulse</span></span>
						<span class="mpacts">
							<button class="act sm" class:primary={boardFx} disabled={!iAmHost} on:click={() => setBoardFx(true)}>On</button>
							<button class="act sm" class:primary={!boardFx} disabled={!iAmHost} on:click={() => setBoardFx(false)}>Off</button>
						</span>
					</div>
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
			<button class="mib tie" on:click={flipTie} title="Tie-breaker: {teamName($ms.tieBreaker)} — tap to flip"><img src={tieArt($ms.tieBreaker)} class:flip={tieFlip} alt="" /></button>
			<button class="mpill" on:click={() => (lwOpen = true)} aria-label="Waves"><img class="wv" src={waveIcon} alt="" /><b class="n2">{$ms.waves}</b></button>
			<button class="mpill life" on:click={() => (lwOpen = true)} aria-label="Life"><b class="n2 lo">{$ms.life.orange}</b><img src={lifeSplit} alt="" /><b class="n2 lb">{$ms.life.blue}</b></button>
			<!-- your ultimate fills the gap between life and gold: always previewable; purple pulse once unlocked -->
			{#if myCs && myUltIdx >= 0}
				<button class="mib ult" class:on={myCs.ultimate} class:ready={ultReady} on:click={() => { if (!myCs) return; if (ultReady) cardLayer?.askUnlockUlt(); else cardLayer?.showCard(myCs.hero, myUltIdx); }}
					title={myCs.ultimate ? 'Your ultimate' : ultReady ? 'Unlock your ultimate' : 'Ultimate — unlocks at level 8'} aria-label="Ultimate">{#if ultReady}<span class="ulk rdy">★</span>{:else if !myCs.ultimate}<span class="ulk">🔒</span>{/if}<span class="ul-long">Ultimate</span><span class="ul-short">ULT</span></button>
			{:else}
				<span class="msp"></span>
			{/if}
			{#if myCoins != null}
				<span class="goldctl">
					<button class="gb" on:click={() => coins(-1)} aria-label="Remove coin">−</button>
					<span class="mpill gold"><span class="gc"></span><b class="n2">{myCoins}</b></span>
					<button class="gb" on:click={() => coins(1)} aria-label="Add coin">+</button>
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
						<div class="spr"><span class="tm {t}">{t === 'orange' ? 'A' : 'T'}</span>
							{#each MINION_ROLES as r}<button class="mn" on:click={() => { armSpawn(t as Team, r); menuOpen = false; }} title="{teamAdj(t)} {r}">{r[0].toUpperCase()}</button>{/each}
						</div>
					{/each}
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
				<div class="msec">
					<div class="mlbl">Active abilities</div>
					{#each abilityRows as r (r.id)}
						<button class="mab" class:live={!!r.fx} style="--tint:{r.team === 'orange' ? '#ef7d22' : '#2f7fe6'}" disabled={!r.fx}
							on:click={() => { if (r.fx) { menuOpen = false; cardLayer?.showCard(r.fx.hero, r.fx.idx, r.fx.pid, r.all); } }}>
							<span class="abn">{r.name}</span>
							<span class="abp">{#each FX_COLORS as [c, hex]}<i class:on={r.lit.has(c)} style="--pc:{hex}"></i>{/each}</span>
							<span class="abt">{r.fx ? FX_SHORT[effectLabel(r.fx, $ms.round, $ms.turn)] : '–'}</span>
						</button>
					{/each}
				</div>

				<div class="msec mlog">
					<div class="mlbl">Activity</div>
					<div class="mlogb">
						{#each log.slice(-8) as e (e.id)}<p><b>{e.by}</b> {e.text}</p>{:else}<p>No moves yet.</p>{/each}
					</div>
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
			<div class="msheet" class:drag={sheetY != null} style:transform={sheetDy ? `translateY(${sheetDy}px)` : null}
				on:pointerdown={sheetDown} on:pointermove={sheetMove} on:pointerup={sheetUp} on:pointercancel={sheetUp} on:click|capture={sheetClick} role="presentation">
				<span class="grab"></span>
				<div class="lsec"><div class="lh"><span>Waves</span><b>{$ms.waves} / {($ms.waveTok ?? []).length}</b></div>
					<div class="lg w">{#each $ms.waveTok ?? [] as full, i}<button class="wtok" class:dep={!full} class:flip={flips[`w${i}`]} style="background-image:url({waveIcon})" on:click={() => toggleWave(i)} aria-label="Wave token"></button>{/each}</div>
					{@render laneCtl()}</div>
				{#each ['orange', 'blue'] as t}
					<div class="lsec"><div class="lh {t}"><span>{teamAdj(t)} Life</span><b>{$ms.life[t as Team]} / {lifeMax}</b></div>
						<div class="lg">{#each $ms.lifeTok?.[t as Team] ?? [] as full, i}<button class="ltok" class:dep={!full} class:flip={flips[`l${t}${i}`]} style="background-image:url({lifeArt(t as Team, full ? 'front' : 'back')})" on:click={() => toggleLife(t as Team, i)} aria-label="Life token"></button>{/each}</div></div>
				{/each}
			</div>
		{/if}
	{:else}
	<!-- ───────── desktop / tablet: the top bar (☰ · scoreline · view), the log tab, the prompt line, the piece toolbar, the menu ─────────
	     One layer in design px (zoomed by the UI scale). The roster chips either side of the scoreline, the
	     initiative rail under it and the console at the bottom belong to CardLayer. -->
	<div class="tide top">
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

		<!-- one line per thing that needs an answer; empty while nothing does -->
		<div class="prompts" style:top="{promptTop}px">
			{#if $ms.wonBy}
				<button class="prompt" on:click={() => (victoryClosed = false)}>{teamName($ms.wonBy.team)} win</button>
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
					<span><b>{whoOf(incoming.by)}</b> attacks you</span>
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
				onSpawn={(t, r) => { armSpawn(t, r); manageOpen = false; }} onPush={manualPush} />
		{/if}
	</div>
	{/if}
</div>

<style>
	/* clip (not just hidden): a tucked hand extends past the bottom edge, and
	   overflow:hidden would still let focus/scrollIntoView scroll the whole view */
	.gamewrap.sea { background: #0b4f80; } /* island look: deep water behind everything (the phone bars sit outside the board) */
	.managepanel .act:disabled { cursor: default; opacity: .75; }
	.managepanel .act:disabled:not(.primary) { opacity: .4; }
	.gamewrap { position: fixed; inset: 0; color: #f1f5f9; overflow: hidden; overflow: clip; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
	/* ocean backdrop — deep water with layered swells + moving caustics so the hex island reads as floating on sea */
	.ocean { position: absolute; inset: 0;
		background:
			radial-gradient(60% 45% at 78% 12%, rgba(52, 128, 160, 0.35), transparent 60%),
			radial-gradient(70% 60% at 20% 88%, rgba(20, 70, 110, 0.4), transparent 62%),
			radial-gradient(140% 120% at 50% -15%, #1a4a63 0%, #0c3247 38%, #071f30 70%, #04121d 100%);
	}

	/* saved views (phone ☰ menu) */
	.vslot { display: flex; gap: 5px; margin-bottom: 5px; }
	.vgo { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 5px 8px; border-radius: 8px; cursor: pointer; color: #e5e7eb; font-size: 0.72rem;
		background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); text-align: left; }
	.vgo b { color: #f0dcae; }
	.vgo span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.vgo:hover:not(:disabled) { background: rgba(199, 154, 78, 0.2); border-color: rgba(199, 154, 78, 0.5); }
	.vgo:disabled { cursor: default; color: #7b8697; }
	.vsave { flex: none; padding: 0 8px; border-radius: 8px; cursor: pointer; font-size: 0.62rem; color: #f6e3b4; background: rgba(199, 154, 78, 0.16); border: 1px solid rgba(199, 154, 78, 0.45); }
	.vsave:hover { background: rgba(199, 154, 78, 0.3); }

	.dlgs { display: contents; } /* desktop: carries the Tide look for the small dialogs (ui/top-game.css) */
	.modal-scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3, 8, 14, 0.6); }
	.modal { width: min(360px, 90vw); background: rgba(12, 18, 32, 0.92); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
	.modal h3 { font-family: 'Modesto Poster', serif; font-size: 1.4rem; margin: 0 0 6px; }
	.piedefeat:disabled { opacity: .55; cursor: default; }
	.piedefeat { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(240, 200, 120, 0.6); background: linear-gradient(180deg, #e2a64a, #b8781f); color: #1a1206; border-radius: 999px; padding: 4px 12px; font-weight: 700; cursor: pointer; font-size: 0.76rem; }
	.piedefeat:hover { filter: brightness(1.1); }
	.placehint.defeat { border-color: rgba(239, 68, 68, 0.6); color: #ffc9c2; }
	.lane { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 6px; margin-top: 6px; font-size: 0.72rem; color: #d7c79c; }
	.lane .bz { white-space: nowrap; }
	.pushes { display: flex; gap: 4px; }
	.pushb { font: inherit; font-size: 0.64rem; padding: 2px 7px; border-radius: 999px; cursor: pointer; background: transparent; color: #e5e7eb; border: 1px solid rgba(255, 255, 255, 0.2); white-space: nowrap; }
	.pushb.orange { border-color: rgba(239, 125, 34, 0.6); } .pushb.blue { border-color: rgba(47, 127, 230, 0.6); }
	.pushb.arm { background: rgba(220, 60, 60, 0.35); border-color: rgba(239, 68, 68, 0.8); color: #fff; }
	.pietool.confirm { gap: 8px; }
	.pienote { display: block; font-size: .68rem; font-weight: 600; color: #94a3b8; text-transform: none; }
	.pietxt.nc { text-transform: none; } .pietxt.nc b { font-weight: inherit; }
	.rw { display: inline-flex; align-items: center; gap: 3px; font-size: 0.82rem; color: #f6ead2; white-space: nowrap; }
	.rw b { font-weight: normal; } .rw i { font-style: normal; color: #8592a6; margin: 0 2px; }
	.rw .lt { width: 18px; height: 18px; object-fit: contain; }
	.gc.sm { width: 13px; height: 13px; border-width: 1px; vertical-align: -2px; margin-right: 2px; }
	.piex { border: none; background: transparent; color: #9aa4b2; cursor: pointer; font-size: 0.85rem; padding: 2px 4px; }
	.piex:hover { color: #fff; }
	.placehint.atk { border-color: rgba(239, 68, 68, 0.6); flex-wrap: wrap; justify-content: center; }
	.spcancel.red { border-color: rgba(239, 68, 68, 0.7); color: #ffb4b4; }
	.spcancel:disabled { opacity: .45; cursor: default; }
	.placehint.clr { border-color: rgba(255, 90, 77, 0.6); }
	.atkask { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); z-index: 12; display: flex; align-items: center; gap: 12px; padding: 8px 10px 8px 16px; border-radius: 12px;
		background: rgba(30, 8, 8, 0.94); border: 1px solid rgba(239, 68, 68, 0.75); color: #ffe1dc; font-size: 0.9rem; box-shadow: 0 0 26px rgba(239, 68, 68, 0.35), 0 10px 28px rgba(0,0,0,.6); animation: atkpulse 1.2s ease-in-out infinite; }
	.atkask b { font-weight: normal; color: #fff; }
	.atkbtns { display: flex; gap: 6px; }
	.ab { font: inherit; border-radius: 8px; padding: 5px 16px; cursor: pointer; border: 1px solid transparent; }
	.ab.yes { background: var(--tc); color: #fff; }
	.ab.no { background: rgba(220, 60, 60, 0.3); border-color: rgba(239, 68, 68, 0.7); color: #ffc9c2; }
	@keyframes atkpulse { 0%, 100% { opacity: 1; } 50% { opacity: .8; } }
	.pieimm { font-size: 0.76rem; color: #2a2f38; padding: 4px 13px; border-radius: 999px; white-space: nowrap; letter-spacing: .04em; text-shadow: 0 1px 0 rgba(255,255,255,.6);
		background: linear-gradient(180deg, #ffffff, #d4d9df 48%, #a3acb7); border: 2px solid #d9a845; box-shadow: 0 0 0 1px #6b4a10, 0 2px 6px rgba(0,0,0,.45), inset 0 1px 0 #fff; }
	/* minion battle removal: a bigger panel at the top, in the losing team's colour */
	.battlebox { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 9; min-width: 380px; max-width: 92vw; box-sizing: border-box;
		display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 18px 12px; border-radius: 14px; text-align: center; color: #f6ead2;
		background: linear-gradient(180deg, color-mix(in srgb, var(--lc) 30%, rgba(11, 16, 26, .95)), rgba(11, 16, 26, .95)); border: 2px solid var(--lc);
		box-shadow: 0 0 26px color-mix(in srgb, var(--lc) 45%, transparent), 0 10px 28px rgba(0, 0, 0, .55); animation: bbIn .35s cubic-bezier(.3, 1.4, .5, 1) both; }
	@keyframes bbIn { from { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(.9); } to { opacity: 1; transform: translateX(-50%); } }
	@keyframes bbGlow { 50% { box-shadow: 0 0 40px color-mix(in srgb, var(--lc) 70%, transparent), 0 10px 28px rgba(0, 0, 0, .55); } }
	.battlebox b { font-weight: normal; } .battlebox .to { color: #ffb27a; } .battlebox .tb { color: #8cc0ff; }
	.bbhead { font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; color: #d9c79a; }
	.bbmain { display: flex; align-items: center; gap: 10px; font-size: 1.3rem; }
	.bbmain .lt { color: var(--lt); } .bbmain .n { color: #fff; font-size: 1.15em; }
	.bbpips { display: flex; gap: 4px; }
	.bbpips i { width: 12px; height: 12px; border-radius: 50%; background: var(--lt); box-shadow: 0 0 8px var(--lc); }
	.bbsub { font-size: .78rem; color: #cbd5e1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
	.bbauto { font: inherit; font-size: .74rem; padding: 3px 12px; border-radius: 999px; cursor: pointer; color: #fff; background: color-mix(in srgb, var(--lc) 55%, transparent); border: 1px solid var(--lt); }
	.placehint.lifeout { top: auto; bottom: 120px; border-color: rgba(240, 200, 120, .8); }
	button.placehint.won { font: inherit; cursor: pointer; }
	.placehint.won { padding: 8px 20px; font-size: 1rem; border-color: rgba(240, 200, 120, 0.9); color: #ffe7a8; box-shadow: 0 0 30px rgba(240, 200, 120, .35), 0 8px 24px rgba(0,0,0,.5); }
	.spcancel.go { background: linear-gradient(180deg, #e2a64a, #b8781f); color: #1a1206; border-color: #fbe7b0; }
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

	/* phone: the Game Lobby panel (desktop has ui/TopMenu.svelte) */
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

	.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 600; color: #94a3b8; }
	.conn .cdot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #64748b; }
	.conn.connected { color: #6ee7b7; } .conn.connected .cdot { background: #22c55e; box-shadow: 0 0 7px rgba(34, 197, 94, 0.7); }
	.conn.connecting .cdot, .conn.reconnecting .cdot { background: #fbbf24; }
	.conn.reconnecting, .conn.connecting { color: #fcd34d; }
	.conn.closed { color: #fca5a5; } .conn.closed .cdot { background: #ef4444; }

	/* desktop: the small dialogs scale with the UI (everything else of the desktop HUD sits in the zoomed .top layer) */
	.gamewrap:not(.mob) .modal { zoom: var(--uis, 1); }

	.mab.live:hover { background: rgba(255, 255, 255, 0.12); }

	/* life and wave tokens (phone sheet) */
	.ltok { width: 30px; height: 29px; padding: 0; border: none; background: transparent no-repeat center / contain; cursor: pointer;
		perspective: 80px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55)); transition: transform 0.1s, filter 0.15s, opacity 0.15s; }
	.ltok:hover { transform: translateY(-2px) scale(1.1); }
	.ltok.dep { opacity: 0.85; filter: grayscale(0.35) brightness(0.72) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)); }
	.ltok.dep:hover { opacity: 1; filter: grayscale(0.15) brightness(0.9); }
	.ltok.flip { animation: coinflip 0.45s ease-in-out; }

	.wtok { width: 20px; height: 20px; padding: 0; border: none; border-radius: 50%; cursor: pointer;
		background: rgba(0, 0, 0, 0.35) no-repeat center / 88%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); transition: transform 0.1s, filter 0.15s, opacity 0.15s; }
	.wtok:hover { transform: translateY(-2px) scale(1.12); }
	.wtok.dep { opacity: 0.55; filter: grayscale(0.9) brightness(0.5); }
	.wtok.dep:hover { opacity: 0.8; filter: grayscale(0.5) brightness(0.7); }
	.wtok.flip { animation: coinflip 0.45s ease-in-out; }

	@keyframes coinflip { 0% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }

	.spcancel { flex: none; border-radius: 6px; padding: 2px 7px; font-size: 0.66rem; font-weight: 700; cursor: pointer; text-transform: none;
		color: #e5e7eb; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.22); }
	.spcancel:hover { background: rgba(255, 255, 255, 0.2); }

	/* phone: toolbar for the selected piece, and the hints (desktop: .ptool / .prompt in ui/top-game.css) */
	.pietool { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 8; display: flex; align-items: center; gap: 10px;
		padding: 6px 8px 6px 12px; border-radius: 999px; background: rgba(9, 13, 22, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
	.pieflip { border: 1px solid rgba(240, 200, 120, 0.55); background: rgba(199, 154, 78, 0.24); color: #f6e3b4; border-radius: 999px; padding: 4px 12px; font-weight: 700; cursor: pointer; font-size: 0.76rem; }
	.pieflip:hover { background: rgba(199, 154, 78, 0.4); }
	.placehint { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9; display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border-radius: 999px;
		background: rgba(11, 16, 26, 0.9); border: 1px solid rgba(240, 200, 120, 0.5); color: #f0dcae; font-size: 0.8rem; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
	.pietxt { font-size: 0.78rem; font-weight: 700; color: #e5e7eb; text-transform: capitalize; }
	.piedel { border: 1px solid rgba(239, 68, 68, 0.5); background: rgba(220, 60, 60, 0.28); color: #ffb4b4; border-radius: 999px; padding: 4px 12px; font-weight: 700; cursor: pointer; font-size: 0.76rem; }
	.piedel:hover { background: rgba(220, 60, 60, 0.45); }

	/* ═══════════ phone layout (≤760px wide) ═══════════ */
	.boardarea { position: absolute; inset: 0; }
	.boardarea.mob { top: 116px; bottom: 106px; }
	.gamewrap.mob .pietool, .gamewrap.mob .placehint { top: 124px; max-width: 94vw; }
	.gamewrap.mob .pietool { top: 172px; }
	.gamewrap.mob .battlebox { top: 118px; min-width: 0; width: 94vw; padding: 8px 10px; } .gamewrap.mob .bbmain { font-size: 1rem; }
	.gamewrap.mob .atkask { top: 220px; max-width: 94vw; font-size: 0.8rem; }
	/* phone toolbar: everything stays inside the pill — the label gives way first */
	.gamewrap.mob .pietool { gap: 6px; padding: 5px 6px 5px 10px; box-sizing: border-box; }
	.gamewrap.mob .pietxt { min-width: 0; flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.72rem; }
	.gamewrap.mob .pieflip, .gamewrap.mob .piedel, .gamewrap.mob .piedefeat { flex: none; white-space: nowrap; padding: 4px 9px; font-size: 0.7rem; }
	.mtop { position: absolute; top: 0; left: 0; right: 0; height: 44px; z-index: 14; display: flex; align-items: center; gap: 2px; padding: 0 4px;
		background: rgba(9, 13, 22, 0.96); border-bottom: 1px solid rgba(199, 154, 78, 0.35); }
	.mib { flex: none; width: 29px; height: 30px; padding: 0; border-radius: 9px; display: grid; place-items: center; cursor: pointer; font-size: 17px; color: #f0dcae;
		background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); }
	.mib.tie img { width: 22px; height: 22px; }
	.mib.tie img.flip { animation: coinflip 0.45s ease; }
	.mpill { flex: none; height: 30px; display: flex; align-items: center; gap: 2px; padding: 0 4px; border-radius: 9px; cursor: pointer; font-size: 13px; color: #e5e7eb;
		background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); white-space: nowrap; }
	.mpill b { font-weight: normal; color: #fff; }
	/* fixed-width counters: one or two digits, nothing moves */
	.mpill .n2 { display: inline-block; min-width: 1.25em; text-align: center; font-variant-numeric: tabular-nums; }
	.mpill.rt { cursor: default; gap: 2px; }
	.mpill .wv { width: 18px; height: 18px; object-fit: contain; }
	.mpill.life img { width: 19px; height: 18px; }
	.mpill.life .lo { color: #ffb27a; } .mpill.life .lb { color: #8cc0ff; }
	.msp { flex: 1; }
	.goldctl { flex: none; display: flex; align-items: center; gap: 2px; }
	.gb { width: 19px; height: 30px; padding: 0; border-radius: 7px; cursor: pointer; font-size: 15px; line-height: 1; color: #f0dcae; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); }
	.mab { display: grid; grid-template-columns: 1fr auto 42px; align-items: center; gap: 6px; width: 100%; margin-top: 3px; padding: 3px 6px; border-radius: 6px; cursor: default;
		font-size: 11px; color: #9aa8bc; text-align: left; background: rgba(255, 255, 255, 0.03); border: none; border-left: 3px solid var(--tint); }
	.mab.live { cursor: zoom-in; color: #e5e7eb; background: rgba(255, 255, 255, 0.06); }
	.mab:disabled { opacity: 1; }
	.abn { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.abp { display: flex; gap: 3px; }
	.abp i { width: 7px; height: 7px; border-radius: 50%; background: var(--pc); opacity: 0.18; }
	.abp i.on { opacity: 1; box-shadow: 0 0 6px var(--pc); }
	.abt { text-align: right; font-size: 10px; color: #e8c173; }
	.mib.ult { flex: 1 1 0; min-width: 27px; width: auto; container-type: inline-size; font-size: 11px; letter-spacing: 0.06em; color: #8f7fae; background: rgba(120, 60, 190, 0.1); border-color: rgba(165, 110, 230, 0.25); overflow: visible; }
	.mib.ult { position: relative; }
	.mib.ult .ul-short { display: none; font-size: 8.5px; }
	@container (max-width: 58px) { .mib.ult .ul-long { display: none; } .mib.ult .ul-short { display: inline; } }
	.mib.ult .ulk { position: absolute; top: -5px; right: -4px; font-size: 8px; filter: grayscale(1); }
	/* ready to unlock: gold edge, pulsing — tap opens the unlock confirmation */
	.mib.ult.ready { color: #f6e3b4; background: rgba(120, 60, 190, 0.28); border-color: #f0c060; box-shadow: 0 0 10px rgba(240, 192, 96, 0.85); animation: ultrdy 1.3s ease-in-out infinite; }
	@keyframes ultrdy { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
	.mib.ult .ulk.rdy { filter: none; color: #f0c060; font-size: 10px; }
	/* unlocked: purple with the same breathing glow as the desktop dash */
	.mib.ult.on { color: #fff; background: linear-gradient(160deg, #9a5ce6, #5b2aa0); border-color: rgba(210, 175, 255, 0.85); text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
		box-shadow: 0 0 12px rgba(185, 130, 250, 0.8), inset 0 0 7px rgba(255, 255, 255, 0.22); animation: ultbtn 2.4s ease-in-out infinite; }
	@keyframes ultbtn { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
	.mpill.gold { background: rgba(199, 154, 78, 0.14); border-color: rgba(199, 154, 78, 0.45); padding-left: 3px; }
	.gc { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center; background: radial-gradient(circle at 35% 30%, #ffe7a1, #d4a64a 60%, #9a6f22); border: 1px solid #fbe7b0; }
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
		background: rgba(10, 15, 25, 0.98); border-top: 1px solid rgba(199, 154, 78, 0.5); box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.6);
		touch-action: none; transition: transform 0.22s ease; }
	.msheet.drag { transition: none; }
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
