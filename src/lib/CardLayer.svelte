<script lang="ts">
	// In-game card surface (manual digital tabletop).
	//
	// Reveal is DERIVED, not stored: when every seated player has committed, all
	// cards are considered revealed and flip face-up simultaneously on every client
	// — nothing to desync. Committing/advancing route through the host (single
	// writer for the card map). Advancing locks the turn's cards into their slots.
	import { teamName } from '$lib/teams';
	import type { Readable } from 'svelte/store';
	import type { MatchSession, MatchState, Player } from '$lib/match';
	import { teamForSeat, colorHex, battlePatch, levelPatch, canRespawn } from '$lib/match';
	import { battleResult, battleText, laneNotes } from '$lib/battle';
	import Card from '$lib/cards/Card.svelte';
	import DeckView from '$lib/DeckView.svelte';
	import { uiLayout, layoutVars } from '$lib/layout';
	import CardBanner from '$lib/CardBanner.svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroCards, heroName, heroTitle, heroStat } from '$lib/cards/deck';
	import { heroAvatar, heroLogo, heroSplash } from '$lib/heroes';
	import { detectDuration, endOf, effectLabel, DUR_LABEL, type Effect, type EffectDur } from '$lib/effects';
	import { HERO_KIT, COMPANIONS, MINES, statusFrom, toggleStatusMarker, tokenName, tokensLeft, type ArmToken } from '$lib/tokens';
	import { PASS, statDeltas, levelOf, levelCost, ultimateIndex, mustLevel, canPick, canAfford, swapSource, twinOf, allowedMoves, type PlayerCardState, type StatKey, type CardZone } from '$lib/cards/cardstate';
	import LevelConfirm from '$lib/LevelConfirm.svelte';
	import TurnSplash from '$lib/TurnSplash.svelte';
	import DockHand from '$lib/DockHand.svelte';
	import LevelSplash from '$lib/LevelSplash.svelte';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let onAdvanceTurn: () => void = () => {};
	export let previewId: string | null = null; // set by the board to open a player's overlay
	export let onArmToken: (t: ArmToken) => void = () => {}; // pick a token off the shelf → place it on a hex
	export let holdingToken = false; // a shelf token is in hand, waiting for its hex
	export let onRespawn: () => void = () => {}; // defeated hero: pick a spawn point to come back on
	export let onEnter: () => void = () => {}; // game start: pick a spawn point for your hero
	export let pingArmed = false; // the next board tap pings
	export let onPing: () => void = () => {}; // arm a ping (pressed again: ping your own hero)
	export let mobile = false; // phone layout (set by GameView at ≤760px wide): strip + compact dash

	const ORANGE = '#ef7d22';
	const BLUE = '#2f7fe6';
	const STAT_DEFS: { key: StatKey; icon: string; baseIdx: number | null; label: string }[] = [
		{ key: 'atk', icon: 'item_attack', baseIdx: 0, label: 'Attack' },
		{ key: 'def', icon: 'item_defense', baseIdx: 1, label: 'Defense' },
		{ key: 'init', icon: 'item_initiative', baseIdx: 2, label: 'Initiative' },
		{ key: 'move', icon: 'item_movement', baseIdx: 3, label: 'Mobility' },
		{ key: 'range', icon: 'item_range', baseIdx: null, label: 'Range' },
		{ key: 'radius', icon: 'item_area', baseIdx: null, label: 'Radius' }
	];
	const ui = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const icon = (n: string) => ui[`./cards/images/${n}.png`];
	const GLOW: Record<string, string> = { GOLD: '#e8b64a', SILVER: '#c6d0db', RED: '#e0524a', GREEN: '#41ae59', BLUE: '#3f7fe0', PURPLE: '#a56ee6' };
	// the detailed stat art (phone layout) — keyed like STAT_DEFS
	const statArt = import.meta.glob('./images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const STAT_FILE: Record<string, string> = { atk: 'attack', def: 'defense', init: 'initiative', move: 'movement', range: 'range', radius: 'area' };
	const statImg = (k: string) => statArt[`./images/stats/${STAT_FILE[k]}.png`];
	const canUndoS = session.canUndo;
	const cardGlow = (hero: string, idx: number) => GLOW[heroCards(hero)[idx]?.color] ?? '#efb46a';

	$: seated = ($players ?? []).filter((p) => p.seat >= 0 && p.seat < $ms.seats).sort((a, b) => a.seat - b.seat);
	$: cards = $ms.cards ?? {};
	// level-up picks stay private until the round locks them in: everyone else's board is
	// shown as it was when the level-up step opened (yours is always live). Display only —
	// the game logic (who still has to level, readiness…) always reads `cards`.
	$: viewCards = $ms.levelPhase && $ms.levelBase
		? Object.fromEntries(Object.entries(cards).map(([pid, c]) => [pid, pid === clientId ? c : $ms.levelBase?.[pid] ?? c]))
		: cards;
	$: others = seated.filter((p) => p.id !== clientId);
	$: teamTint = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'orange' ? ORANGE : BLUE);
	$: seatTeamName = (p: Player) => teamName(teamForSeat(p.seat, $ms.seats));
	// team hue as CSS vars: --tc hex, --tcr base rgb, --tcl light rgb (for highlights)
	const TEAM_VARS: Record<'orange' | 'blue', string> = {
		orange: '--tc:#ef7d22; --tcr:239 125 34; --tcl:255 196 140;',
		blue: '--tc:#2f7fe6; --tcr:47 127 230; --tcl:165 205 255;'
	};
	const teamVars = (t: string | null | undefined) => TEAM_VARS[t === 'blue' ? 'blue' : 'orange'];
	$: pTeam = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'blue' ? 'blue' : 'orange');
	// trash-can glyph for discard piles (drawn faint, like the turn numerals)
	// this turn's CARD initiative (card + upgrades) uses a stopwatch, so it reads apart
	// from the initiative STAT, which keeps the game's own initiative icon
	const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.8"/><path d="M10 2.8h4"/><path d="M12 2.8V6"/><path d="M18.4 6.6l1.3-1.3"/></svg>';
	const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

	// ── HUD status markers (Tigerclaw poison, Bain bounty) ─────────────────────
	// DERIVED from the board: a poison / bounty marker attached to a hero = that
	// player has the status. Moving the marker off, deleting it or the round ending
	// clears it. There is ONE of each marker.
	$: statusMap = statusFrom($ms.pieces ?? {});
	const EMPTY_STATUS = { poison: 0, bounty: 0 };
	// toggled from a player board: attach the marker to that hero (or take it off)
	function toggleStatus(pid: string, key: 'poison' | 'bounty') {
		const on = !statusMap[pid]?.[key];
		// the marker belongs to whoever plays Tigerclaw (poison) / Bain (bounty), if anyone
		const ownerHero = key === 'poison' ? 'tigerclaw' : 'bain';
		const owner = Object.keys(cards).find((id) => cards[id].hero === ownerHero) ?? clientId;
		const ownerP = seated.find((p) => p.id === owner);
		const team = (ownerP ? teamForSeat(ownerP.seat, $ms.seats) : null) ?? 'neutral';
		const who = seated.find((p) => p.id === pid)?.name ?? 'A player';
		session.act(on ? `${who} is marked with ${key}` : `${who}'s ${key} marker removed`, { pieces: toggleStatusMarker($ms.pieces ?? {}, key, pid, owner, team) });
	}

	$: iAmHost = $ms.host === clientId;
	$: turnIdx = $ms.turn - 1;
	// the temp action slot, most urgent first: respawn · enter the board · defend
	$: iCanRespawn = !!$ms.defeated?.[clientId] && canRespawn($ms, clientId);
	$: iMustEnter = !!$ms.toSpawn?.[clientId];
	$: spawnWaiting = seated.filter((p) => $ms.toSpawn?.[p.id]);
	$: myAttack = $ms.attacks?.[clientId] ?? null;
	$: iDefending = !!myAttack?.defending;
	const answerAttack = (result: 'defended' | 'defeated') => session.cardAction({ kind: 'attackResolve', pid: clientId, target: clientId, result });
	$: seatedWithCards = seated.filter((p) => cards[p.id]);
	// reveal layout: 1–2 players share one row; more split by team — your team on
	// top (orange when spectating), the other team underneath
	$: curtainRows = revealRows(seatedWithCards, pTeam, (mySeat >= 0 && teamForSeat(mySeat, $ms.seats)) || 'orange');
	// each team's row may wrap (e.g. 3 + 2 on a portrait phone): pick the column
	// count that gives the biggest cards for this screen
	let vhPx = 800;
	$: curtainFit = fitReveal(curtainRows.map((r) => r.length), vw, vhPx);
	$: curtainCols = curtainFit.cols;
	function fitReveal(counts: number[], w: number, h: number) {
		const most = Math.max(1, ...counts), gap = Math.min(26, Math.max(16, w * 0.024));
		let best = { cols: most, rows: counts.length, cw: 0 };
		for (let c = 1; c <= most; c++) {
			const rows = counts.reduce((n, k) => n + Math.ceil(k / c), 0);
			const cw = Math.min(320, (w - 32 - (c - 1) * gap) / c, ((h - 120) / rows - 44) * 1192 / 1664);
			if (cw > best.cw + 0.5) best = { cols: c, rows, cw };
		}
		return best;
	}
	function revealRows(ps: Player[], teamOf: (p: Player) => string, first: string): Player[][] {
		const a = ps.filter((p) => teamOf(p) === first), b = ps.filter((p) => teamOf(p) !== first);
		return ps.length <= 2 ? [[...a, ...b]] : [a, b].filter((r) => r.length);
	}
	// DERIVED reveal: everyone ready ⇒ all cards face-up (same for every client).
	// A player is ready when they've committed, or when they simply have no cards
	// left to play (there is no "pass" in GoA2 — you play a card unless you can't).
	const isReady = (cs: PlayerCardState) => cs.pending != null || cs.hand.length === 0;
	$: readyCount = seatedWithCards.filter((p) => isReady(cards[p.id])).length;
	// everyone in ⇒ the reveal is armed, but cards only flip face-up after a synced
	// 3-2-1 countdown (host sets $ms.revealAt). Anyone can uncommit during it.
	$: allCommitted = seatedWithCards.length > 0 && readyCount === seatedWithCards.length;
	$: revealAt = $ms.revealAt ?? null;
	$: countdownActive = allCommitted && revealAt != null && countNow < revealAt;
	// four beats over the countdown: 3 · 2 · 1 · Reveal!
	$: countdownLabel = !countdownActive ? '' : (() => {
		const left = revealAt! - countNow;
		return left > 3300 ? '3' : left > 2100 ? '2' : left > 900 ? '1' : 'Reveal!';
	})();
	$: revealed = allCommitted && revealAt != null && countNow >= revealAt;
	// tick a local clock only while the countdown is live, to drive 3→2→1 and the flip
	// the countdown runs on the HOST's clock (revealAt is host time): a device whose clock is off
	// used to sit on "3" for seconds, or skip it
	let countNow = session?.hostNow?.() ?? Date.now();
	let countTick: ReturnType<typeof setInterval> | null = null;
	$: manageCountTick(allCommitted && revealAt != null && countNow < revealAt);
	function manageCountTick(live: boolean) {
		if (live && !countTick) { countNow = session?.hostNow?.() ?? Date.now(); countTick = setInterval(() => (countNow = session?.hostNow?.() ?? Date.now()), 100); }
		else if (!live && countTick) { clearInterval(countTick); countTick = null; }
	}
	// end-of-round flow: turn 4 → Minion Battle (battle.ts) → removals → host's Level Up → Next round
	$: isFinalTurn = $ms.turn >= 4;
	$: battlePhase = $ms.battlePhase ?? false;
	$: levelPhase = $ms.levelPhase ?? false;
	// the battle's removals come first; then the host opens the level-up step
	function startLevelUp() { session.act('level up!', levelPatch($ms)); }
	// the level-up step opening: a splash for you — Level up, or (can't afford one) a pity coin
	let levelSplash: LevelSplash;
	let wasLevel: boolean | null = null;
	let splashUntil = 0; // the forced deck waits for the splash to finish
	$: watchLevel(levelPhase);
	// enough coins to pay every level from here up to 8 (the ultimate)
	function reachesUlt(c: PlayerCardState) {
		let need = 0;
		for (let l = levelOf(c); l < 8; l++) need += levelCost(l);
		return levelOf(c) < 8 && c.coins >= need;
	}
	function watchLevel(on: boolean) {
		if (wasLevel === false && on && mine) splashUntil = Date.now() + (levelSplash?.play(mustLevel(mine) ? 'up' : 'pity', mine.coins, reachesUlt(mine)) ?? 0);
		wasLevel = on;
	}
	// the battle hands every card back (like a round end) so players can level up / swap now
	// it also runs the end-of-turn push check and counts the battle zone (battle.ts)
	function startBattle() {
		const patch = battlePatch($ms);
		session.act([...laneNotes($ms, patch), battleText(battleResult({ ...$ms, ...patch })), 'cards return to hand'].join(' · '), patch);
	}
	// then the level-up phase: forced while you can afford it (the deck opens by
	// itself), and the host's "Next round" waits until everyone present is done
	$: levelWaiting = levelPhase ? seatedWithCards.filter((p) => mustLevel(cards[p.id])) : [];
	$: iMustLevel = levelPhase && !!mine && mustLevel(mine);
	let autoOpened = false;
	$: if (!levelPhase) autoOpened = false;
	$: if (iMustLevel && !autoOpened) { autoOpened = true; setTimeout(openForced, Math.max(0, splashUntil - Date.now())); }
	function openForced() { if (levelPhase && mine && mustLevel(mine)) { deckOpen = true; deckTab = 'deck'; } }
	// phone level-up / swap confirmation
	let lvConfirm: { kind: 'take' | 'swap'; idx: number } | null = null;
	function confirmLevel() {
		if (lvConfirm && mine) {
			// the ultimate unlocks through the paid manual move (works outside the level-up phase too)
			if (lvConfirm.idx === myUlt) moveTo(myUlt, 'hand');
			else session.cardAction({ kind: lvConfirm.kind, pid: clientId, idx: lvConfirm.idx });
		}
		lvConfirm = null; deckSel = null;
	}
	const canTakeNow = (cs: PlayerCardState, i: number) => levelPhase && canAfford(cs) && canPick(cs, i);

	// a splash (the crest) for every new turn / new round
	let turnSplash: TurnSplash;
	let lastRT: string | null = null;
	$: watchTurn($ms.round, $ms.turn);
	function watchTurn(r: number, t: number) {
		const k = `${r}.${t}`;
		if (lastRT !== null && k !== lastRT) {
			const [pr, pt] = lastRT.split('.').map(Number);
			if (r > pr) turnSplash?.play('round', r, t);
			else if (r === pr && t > pt) turnSplash?.play('turn', r, t);
		}
		if (k !== lastRT) railId = null;
		lastRT = k;
	}

	const allStats = (cs: PlayerCardState) => {
		const deltas = statDeltas(cs);
		return STAT_DEFS.map((d) => {
			const base = d.baseIdx !== null ? heroStat(cs.hero, d.baseIdx) : null;
			const delta = deltas[d.key] ?? 0;
			return { ...d, base, delta, cur: (base ?? 0) + delta };
		});
	};

	// overlay + examine
	let overlayId: string | null = null;
	type ExCard = { hid: string; idx: number; pid?: string; secret?: boolean };
	// `list`: several cards to page through (e.g. a player's active effects) — ‹ › / swipe
	let examine: (ExCard & { list?: ExCard[] }) | null = null;
	$: exList = examine?.list && examine.list.length > 1 ? examine.list : null;
	$: exPos = exList && examine ? exList.findIndex((c) => c.hid === examine!.hid && c.idx === examine!.idx) : -1;
	function stepExamine(d: number) {
		if (!examine || !exList) return;
		const n = exList[((exPos < 0 ? 0 : exPos) + d + exList.length) % exList.length];
		examine = { ...n, list: exList };
	}
	let exSwipeX: number | null = null;
	const exSwipeEnd = (e: PointerEvent) => {
		if (exSwipeX == null) return;
		const dx = e.clientX - exSwipeX; exSwipeX = null;
		if (Math.abs(dx) > 40) stepExamine(dx < 0 ? 1 : -1);
	};
	$: ovPlayer = seated.find((p) => p.id === overlayId) ?? null;
	// board hands us a player id to preview → open their overlay, then clear it
	$: if (previewId) { openBoard(previewId); previewId = null; }

	// local player
	$: mine = cards[clientId] ?? null;
	$: myReady = mine?.pending != null;
	$: canCommit = !!mine && !myReady && !revealed && !battlePhase && !spawnWaiting.length; // no playing cards between the battle and the next round, or before every hero is on the board
	let selected: number | null = null; // card being previewed (centered)
	let previewSrc: 'hand' | 'discard' = 'hand'; // where the previewed card came from
	let committing = false; // preview flip animation on commit
	$: myName = seated.find((p) => p.id === clientId)?.name ?? 'You';
	$: myColor = seated.find((p) => p.id === clientId)?.color ?? 'spectator';
	$: myInit = mine ? initOf(mine, true) : null;
	// your hand, always in colour order: Silver, Gold, Red, Blue, Green (then the rest)
	const COLOR_ORDER: Record<string, number> = { SILVER: 0, GOLD: 1, RED: 2, BLUE: 3, GREEN: 4 };
	const colorRank = (hero: string, idx: number) => COLOR_ORDER[heroCards(hero)[idx]?.color] ?? 9;
	$: handOrdered = mine ? [...mine.hand].sort((a, b) => colorRank(mine!.hero, a) - colorRank(mine!.hero, b) || a - b) : [];

	// initiative of the card a player has in play this turn = the card's printed
	// initiative + their initiative upgrades (NOT the hero's base stat).
	// Opponents' is shown only once revealed.
	function initOf(cs: PlayerCardState, show: boolean): number | null {
		const idx = cs.pending;
		if (!show || idx == null || idx === PASS) return null;
		const v = heroCards(cs.hero)[idx]?.initiative;
		return v == null ? null : v + (statDeltas(cs).init ?? 0);
	}

	// click a turn slot: a face-up card previews; anything else falls through to
	// the container (a player row / your dash opens the full board)
	function peekSlot(e: Event, cs: PlayerCardState, t: number) {
		// your own face-down card can be read any time (no need to take it back); others' stay hidden
		const own = pidOf(cs) === clientId && t === turnIdx && !revealed;
		const i = cs.turns[t] ?? (t === turnIdx && (revealed || own) ? cs.pending : null);
		if (i != null && i !== PASS) { e.stopPropagation(); examine = { hid: cs.hero, idx: i, pid: pidOf(cs), secret: own && cs.turns[t] == null }; }
	}
	const pidOf = (cs: PlayerCardState) => Object.keys(cards).find((k) => cards[k] === cs || viewCards[k] === cs);
	// the card sitting in turn slot t (played, or this turn's once revealed)
	const slotIdx = (cs: PlayerCardState, t: number) => { const i = cs.turns[t] ?? (t === turnIdx && revealed ? cs.pending : null); return i != null && i !== PASS ? i : null; };

	// ── lingering card effects (see effects.ts) ──────────────────────────────
	// Switched on from a played card's zoom view by its owner (or the host); the
	// card glows in the player's colour with a duration badge, the player's row gets
	// a chip, the left HUD lists it, and it ends itself when its time runs out.
	$: effects = $ms.effects ?? [];
	$: fxFor = (pid: string | undefined, idx: number | null) => (pid && idx != null ? effects.find((e) => e.pid === pid && e.idx === idx) : undefined);
	$: fxLabel = (e: Effect) => effectLabel(e, $ms.round, $ms.turn);
	$: colorOf = (pid: string) => colorHex(seated.find((p) => p.id === pid)?.color ?? '');
	$: examineFx = examine?.pid ? fxFor(examine.pid, examine.idx) : undefined;
	$: examineDetected = examine ? detectDuration(heroCards(examine.hid)[examine.idx]?.description) : null;
	// (not on your own still-hidden card: an effect would show it to everyone before the reveal)
	$: canFx = !!examine?.pid && (examine.pid === clientId || iAmHost) && !examine.secret;
	// a played card (turn slot / this turn's card) can be discarded by an effect (owner or host)
	$: exOwner = examine?.pid ? cards[examine.pid] : undefined;
	$: canDiscardEx = canFx && !!exOwner && !!examine && (exOwner.turns.includes(examine.idx) || exOwner.pending === examine.idx);
	let fxOpen = false; // "Activate effect" pressed → pick how long
	$: if (examine) fxOpen = false;
	function discardEx() {
		if (!examine?.pid) return;
		session.cardAction({ kind: 'discardPlayed', pid: examine.pid, idx: examine.idx });
		examine = null;
	}
	function activateFx(pid: string, hero: string, idx: number, dur: EffectDur) {
		const name = heroCards(hero)[idx]?.name ?? 'Effect';
		const e: Effect = { id: `fx_${pid}_${idx}_${Date.now().toString(36)}`, pid, hero, idx, name, dur, round: $ms.round, turn: $ms.turn, ...endOf(dur, $ms.round, $ms.turn) };
		session.act(`${name} — ${DUR_LABEL[dur].toLowerCase()} effect active`, { effects: [...effects.filter((x) => !(x.pid === pid && x.idx === idx)), e] });
	}
	// the corner flame marking a card whose effect is live (glow + flame; no badge under it)
	// After the reveal, if YOUR card this turn names a lingering effect, the dash
	// action asks "Activate effect?" — No: carry on; Yes: pick how long (✕ = back).
	let fxDecided = new Set<string>();
	let fxStage: 'ask' | 'pick' = 'ask';
	$: myTurnCard = mine && revealed ? slotIdx(mine, turnIdx) : null;
	$: myTurnDur = mine && myTurnCard != null ? detectDuration(heroCards(mine.hero)[myTurnCard]?.description) : null;
	$: fxKey = `${$ms.round}-${$ms.turn}-${myTurnCard}`;
	$: fxAsking = !!mine && myTurnCard != null && !!myTurnDur && !fxFor(clientId, myTurnCard) && !fxDecided.has(fxKey);
	$: if (!fxAsking) fxStage = 'ask';
	function fxNo() { fxDecided = new Set(fxDecided).add(fxKey); fxStage = 'ask'; }
	function fxPickDur(d: EffectDur) {
		if (mine && myTurnCard != null) activateFx(clientId, mine.hero, myTurnCard, d);
		fxDecided = new Set(fxDecided).add(fxKey); fxStage = 'ask';
	}
	function endFx(e: Effect) { session.act(`${e.name} — effect ended`, { effects: effects.filter((x) => x.id !== e.id) }); }
	// the left HUD's effects list opens a card through here
	export function showCard(hid: string, idx: number, pid?: string, list?: ExCard[]) { examine = { hid, idx, pid, list }; }
	// phone top bar: the Ultimate button opens the unlock confirmation once it's affordable
	export function askUnlockUlt() { if (mine && myUlt >= 0) lvConfirm = { kind: 'take', idx: myUlt }; }

	// discard piles (dash + boards): hover (mouse) or tap to fan out every card;
	// click one to preview it (your own open in the hand preview, so you can recover)
	let discOpen: string | null = null; // 'dash' or the board owner's id
	let discTimer: ReturnType<typeof setTimeout> | null = null;
	function discEnter(e: PointerEvent, key: string) {
		if (e.pointerType !== 'mouse') return;
		if (discTimer) { clearTimeout(discTimer); discTimer = null; }
		discOpen = key;
	}
	function discLeave(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		if (discTimer) clearTimeout(discTimer);
		discTimer = setTimeout(() => { discOpen = null; discTimer = null; }, 260);
	}
	function discTap(key: string) { discOpen = discOpen === key ? null : key; }
	function openDiscard(hero: string, idx: number, own: boolean) {
		discOpen = null;
		if (own) preview(idx, 'discard');
		else examine = { hid: hero, idx };
	}

	function preview(idx: number, src: 'hand' | 'discard' = 'hand') { selected = idx; previewSrc = src; }
	function closePreview() { if (!committing) selected = null; }
	// previewing a hand card: swipe (or ‹ ›) through the rest of your hand
	$: pvList = previewSrc === 'hand' ? handOrdered : [];
	$: pvPos = selected != null ? pvList.indexOf(selected) : -1;
	function stepPreview(d: number) {
		if (committing || pvList.length < 2 || pvPos < 0) return;
		selected = pvList[(pvPos + d + pvList.length) % pvList.length];
	}
	let swipeX: number | null = null;
	function swipeStart(e: PointerEvent) { swipeX = e.clientX; }
	function swipeEnd(e: PointerEvent) {
		if (swipeX == null) return;
		const dx = e.clientX - swipeX; swipeX = null;
		if (Math.abs(dx) > 40) stepPreview(dx < 0 ? 1 : -1);
	}
	function commit(idx: number) {
		if (!canCommit) return;
		committing = true; // flip the preview to its back, then send + close
		setTimeout(() => {
			session.cardAction({ kind: 'commit', pid: clientId, idx });
			committing = false;
			selected = null;
		}, 460);
	}
	function takeBack() { if (mine && !revealed) session.cardAction({ kind: 'uncommit', pid: clientId }); }
	function defend(idx: number) { if (mine) { session.cardAction({ kind: 'defend', pid: clientId, idx }); selected = null; } }
	function pullBack(idx: number) { if (mine) { session.cardAction({ kind: 'undiscard', pid: clientId, idx }); selected = null; } }
	function changeCoins(d: number) { if (mine) session.cardAction({ kind: 'coins', pid: clientId, delta: d }); }
	const ROMAN = ['I', 'II', 'III', 'IV'];

	// ── deck view: manage your cards across hand / deck / upgrade / removed ──────
	// The upgrade cards (Tier II & III) sit in a fixed grid. Columns run RED, BLUE,
	// GREEN with each colour's primary (variant A) left of its alternative (B); the
	// top row is Tier II, the bottom Tier III:
	//   PR2 AR2 PB2 AB2 PG2 AG2   (level 2)
	//   PR3 AR3 PB3 AB3 PG3 AG3   (level 3)
	let deckOpen = false;
	// phones: one deck section at a time (tabs) instead of one long scroll
	let deckTab: 'hand' | 'deck' | 'upgrade' | 'removed' = 'hand';
	let deckSel: number | null = null; // card being managed (selected in the deck view)
	const GRID_COLORS = ['RED', 'BLUE', 'GREEN'];
	function findCard(hero: string, color: string, level: number, first: number): number {
		return heroCards(hero).findIndex(
			(c) => c.color === color && (c.level ?? 1) === level && (c.variant?.first ?? 1) === first
		);
	}
	// grid rows (level 2 then 3); each row is 6 cells, ordered by colour then variant
	function deckGrid(hero: string) {
		return [2, 3].map((level) =>
			GRID_COLORS.flatMap((color) =>
				[1, 2].map((first) => ({ color, level, first, idx: findCard(hero, color, level, first) }))
			)
		);
	}
	$: myGrid = mine ? deckGrid(mine.hero) : [];
	// phone grid is 3 wide: order each tier as R B G (variant A) then R B G (variant B),
	// so every colour sits in its own column
	const phoneCells = (grid: ReturnType<typeof deckGrid>) =>
		grid.map((row) => [1, 2].flatMap((first) => GRID_COLORS.map((color) => row.find((c) => c.color === color && c.first === first)!)).filter(Boolean));
	// basics never leave the hand — pin them to the right with a partition
	const isBasic = (hero: string, idx: number) => ['GOLD', 'SILVER'].includes(heroCards(hero)[idx]?.color);
	// phone Hand tab: one slot per colour (the card you currently hold in it); anything else goes in `extra`
	const SLOT_COLORS: Array<[string, string, string]> = [['RED', 'Red', '#e0524a'], ['BLUE', 'Blue', '#3f7fe0'], ['GREEN', 'Green', '#41ae59']];
	function colourSlots(hero: string, rest: number[]) {
		const used = new Set<number>();
		const slots = SLOT_COLORS.map(([color, label, hex]) => {
			const idx = rest.find((i) => !used.has(i) && heroCards(hero)[i]?.color === color);
			if (idx != null) used.add(idx);
			return { color, label, hex, idx: idx ?? null };
		});
		return { slots, extra: rest.filter((i) => !used.has(i)) };
	}
	function handSplit(cs: PlayerCardState) {
		const basics: number[] = [], rest: number[] = [];
		for (const i of cs.hand) (isBasic(cs.hero, i) ? basics : rest).push(i);
		return { basics, rest };
	}
	// which zone a card index is in for this player (null = still in the draw deck)
	function zoneOf(cs: PlayerCardState, idx: number): CardZone | null {
		if (cs.hand.includes(idx)) return 'hand';
		if (cs.upgrade.includes(idx)) return 'upgrade';
		if (cs.removed.includes(idx)) return 'removed';
		return null; // in the deck
	}
	// count of upgrade cards still available to draw (not held, upgraded or removed)
	function deckCards(cs: PlayerCardState) {
		return deckGrid(cs.hero).flat().map((g) => g.idx).filter((i) => i >= 0 && zoneOf(cs, i) === null);
	}
	function moveTo(idx: number, to: CardZone) {
		if (mine && idx >= 0) session.cardAction({ kind: 'cardmove', pid: clientId, idx, to });
		deckSel = null;
	}
	function statIcon(itemName: string | undefined) {
		const map: Record<string, string> = { ATTACK: 'item_attack', DEFENSE: 'item_defense', INITIATIVE: 'item_initiative', MOVEMENT: 'item_movement', RANGE: 'item_range', AREA: 'item_area' };
		return itemName ? icon(map[itemName]) : undefined;
	}
	// the ultimate (PURPLE) card — shown separately, unlocked at level 8
	$: myUlt = mine ? ultimateIndex(mine.hero) : -1;
	// double-click any card in the deck view to examine it full size
	function examineCard(hid: string, idx: number) { if (idx >= 0) examine = { hid, idx }; }

	// ── dramatic reveal curtain: when everyone's ready, all cards flip up at once ──
	import { onDestroy } from 'svelte';
	let curtain = false; // overlay visible
	let curtainFlip = false; // cards flipped face-up
	let wasRevealed = false;
	let curtainTimers: ReturnType<typeof setTimeout>[] = [];
	$: syncCurtain(revealed);
	function syncCurtain(r: boolean) {
		if (r && !wasRevealed) { wasRevealed = true; showCurtain(); }
		else if (!r) { wasRevealed = false; }
	}
	function showCurtain() {
		curtainTimers.forEach(clearTimeout);
		curtain = true;
		curtainFlip = false;
		curtainTimers = [
			setTimeout(() => (curtainFlip = true), 650), // flip all at once
			setTimeout(() => (curtain = false), 6600) // hold ~6s (big cards to read) then return
		];
	}
	function skipCurtain() { curtainTimers.forEach(clearTimeout); curtain = false; }
	onDestroy(() => { curtainTimers.forEach(clearTimeout); if (countTick) clearInterval(countTick); if (lowerTimer) clearTimeout(lowerTimer); if (discTimer) clearTimeout(discTimer); });

	// ── token / marker shelf: each hero's own kit (see tokens.ts) ──────────────
	// Pick one → it rides under the cursor → tap a hex to place it (GameView).
	let tokenDrawer = false;
	$: myKit = mine ? HERO_KIT[mine.hero] ?? [] : [];
	type ShelfItem = { key: string; img: string | undefined; letter?: string; title: string; cls: string; label: string; arm: ArmToken };
	$: mySeat = seated.find((p) => p.id === clientId)?.seat ?? -1;
	$: myTeam = mySeat >= 0 ? teamForSeat(mySeat, $ms.seats) : 'orange';
	$: shelf = myKit.map((tk): ShelfItem => {
		if (tk === 'companion') {
			const name = COMPANIONS[mine!.hero] ?? 'Companion';
			return { key: tk, img: undefined, letter: name[0], title: `Deploy ${name}`, cls: 'emblem comp', label: name,
				arm: { token: 'companion', letter: name[0], label: name, color: myColor, team: myTeam ?? 'neutral', owner: clientId } };
		}
		const nm = tokenName(tk);
		return { key: tk, img: icon(tk), title: MINES.has(tk) ? `${nm} (placed face down)` : nm, cls: tk.startsWith('token_') ? '' : 'marker', label: '',
			arm: { token: tk, img: icon(tk), color: myColor, team: myTeam ?? 'neutral', owner: clientId } };
	});
	$: myTokenCount = Object.values($ms.pieces ?? {}).filter((p) => p.kind === 'token' && p.owner === clientId).length;
	// supply left per token (a marker/rune placed again just moves, so it never runs out)
	$: leftOf = (tk: string) => (tk.startsWith('marker_') || tk.startsWith('rune_') ? Infinity : tokensLeft($ms.pieces ?? {}, clientId, tk));
	// the shelf stays open while you place (so you can drop several, one at a time);
	// clicking anywhere else closes it
	function armToken(it: ShelfItem) { onArmToken(it.arm); }

	// ── area radius: a temporary, translucent area around your hero (1–8 hexes),
	// in your colour, seen by everyone; it clears when the turn advances
	$: myRadius = $ms.radii?.[clientId] ?? 0;
	let radiusOpen = false;
	function setRadius(n: number) {
		const next = { ...($ms.radii ?? {}) };
		if (n > 0) next[clientId] = n; else delete next[clientId];
		session.act(n > 0 ? `shows a radius ${n} area` : 'cleared their radius', { radii: next });
		radiusOpen = false;
	}
	function clearTokens() {
		const next = { ...$ms.pieces };
		for (const id in next) if (next[id].kind === 'token' && next[id].owner === clientId) delete next[id];
		session.act('cleared their tokens', { pieces: next });
	}

	const fan = (k: number, n: number) => {
		const t = n === 1 ? 0 : k / (n - 1) - 0.5;
		return { rot: t * 11, y: Math.abs(t) * Math.abs(t) * 34 };
	};

	// ── hand display prefs (per viewer, remembered in this browser) ────────────
	// autoRetract: the hand tucks behind the dash leaving the card tips; hovering
	// (mouse) or a first tap (touch) raises it. spreadHand: lay cards side by side
	// with no overlap instead of fanning them.
	const PREF_RETRACT = 'goa2-hand-retract';
	const PREF_SPREAD = 'goa2-hand-spread';
	const PREF_DOCK = 'goa2-hand-dock'; // dock: cards sit inside the dash, none over the board
	const readPref = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v === '1'; } catch { return dflt; } };
	const writePref = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };
	let autoRetract = readPref(PREF_RETRACT, true);
	let spreadHand = readPref(PREF_SPREAD, false);
	function toggleRetract() { autoRetract = !autoRetract; writePref(PREF_RETRACT, autoRetract); handUp = false; }
	let dockHand = readPref(PREF_DOCK, false);
	// phone: the fan button turns the hand into a stack of banners (hand + ultimate);
	// "hide" then tucks them against the right edge, only the coloured markers showing
	const PREF_BANNERS = 'goa2-hand-banners';
	let bannerHand = readPref(PREF_BANNERS, false);
	// phone hand button cycles: fanned cards → spread cards → banners → fanned …
	function cycleHandStyle() {
		if (bannerHand) { bannerHand = false; spreadHand = false; }
		else if (spreadHand) { bannerHand = true; spreadHand = false; }
		else spreadHand = true;
		writePref(PREF_BANNERS, bannerHand); writePref(PREF_SPREAD, spreadHand); handUp = false; bannerOpen = null;
	}
	// hidden banners: each one tucks on its own — tap one to pull it out (the last
	// one goes back), tap it again to read it, tap anywhere else to tuck them all
	let bannerOpen: number | null = null;
	function bannerTap(key: number, open: () => void) {
		if (autoRetract && bannerOpen !== key) { bannerOpen = key; return; }
		open();
	}

	// Desktop/tablet: ONE UI scale for the whole layout (see layout.ts)
	let vw = 1440;
	$: dashVars = layoutVars(uiLayout(vw, vhPx));
	let handUp = false;
	let lowerTimer: ReturnType<typeof setTimeout> | null = null;
	function raiseHand(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		if (lowerTimer) { clearTimeout(lowerTimer); lowerTimer = null; }
		handUp = true;
	}
	// small delay so sliding between overlapping cards doesn't drop the hand
	function lowerHandSoon(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		if (lowerTimer) clearTimeout(lowerTimer);
		lowerTimer = setTimeout(() => { handUp = false; lowerTimer = null; }, 350);
	}
	// touch: the first tap on a tucked hand raises it; the next tap previews
	function handCardClick(idx: number) {
		if (autoRetract && !handUp) { handUp = true; return; }
		preview(idx);
	}
	// tapping anywhere outside the hand tucks it away again
	function onWindowDown(e: PointerEvent) {
		const t = e.target as Element | null;
		if (handUp && !t?.closest?.('.tray')) handUp = false;
		if (bannerOpen != null && !t?.closest?.('.bstack, .pvwrap, .pvbar, .scrim2')) bannerOpen = null;
		if (discOpen && !t?.closest?.('.discwrap')) discOpen = null;
		// token shelf: close on any outside click — except the click that drops a held token
		if (radiusOpen && !t?.closest?.('.radwrap')) radiusOpen = false;
		if (tokenDrawer && !t?.closest?.('.tokwrap') && !(holdingToken && t?.closest?.('.board-wrap, .placehint'))) tokenDrawer = false;
	}
	$: retracted = autoRetract && !handUp;

	// ═════════ desktop: the helm (the phone layout never reads any of this) ═════════
	// Roster chips in the top bar · initiative rail under it · a player's board dropping from
	// their chip · the hand rising from the console · the console with ONE action button.
	// viewer-relative like every splash: the enemy on the LEFT, your team on the RIGHT (spectators watch as blue)
	$: viewTeam = mySeat >= 0 && myTeam === 'orange' ? 'orange' : 'blue';
	$: chipsL = seated.filter((p) => pTeam(p) !== viewTeam);
	$: chipsR = [...seated.filter((p) => pTeam(p) === viewTeam && p.id !== clientId), ...seated.filter((p) => pTeam(p) === viewTeam && p.id === clientId)];
	// this turn's card on a chip: nothing yet · face down · face up (its initiative) · defeated
	type ChipCard = { k: 'none' | 'skip' | 'back' | 'up' | 'dead'; n?: number | null; idx?: number; c?: string };
	$: chipCard = (p: Player, cs: PlayerCardState | undefined): ChipCard => {
		if (!cs) return { k: 'none' };
		const d = $ms.defeated?.[p.id];
		if (d && d.round === $ms.round && d.turn === $ms.turn) return { k: 'dead' };
		const up = revealed && cs.turns[turnIdx] == null && cs.pending != null && cs.pending !== PASS ? cs.pending : null;
		if (up != null) return { k: 'up', idx: up, n: initOf(cs, true), c: cardGlow(cs.hero, up) };
		// your own committed card already shows you its number
		if (cs.pending != null && cs.pending !== PASS) return { k: 'back', n: p.id === clientId ? initOf(cs, true) : null };
		if (d) return { k: 'dead' };
		return { k: cs.pending === PASS || (!battlePhase && cs.hand.length === 0) ? 'skip' : 'none' };
	};
	// the rail: the revealed cards, highest initiative first; a tie goes to the team on the tie-breaker coin
	$: rail = revealed
		? seatedWithCards
				.map((p) => {
					const cs = cards[p.id], idx = cs.turns[turnIdx] == null && cs.pending != null && cs.pending !== PASS ? cs.pending : null;
					return idx == null ? null : { p, hero: cs.hero, idx, n: initOf(cs, true) ?? 0, c: cardGlow(cs.hero, idx), tie: pTeam(p) === $ms.tieBreaker ? 0 : 1 };
				})
				.filter((r): r is NonNullable<typeof r> => !!r)
				.sort((a, b) => b.n - a.n || a.tie - b.tie)
		: [];
	// who is acting: nothing in the shared state says, so it is this viewer's own marker —
	// it starts on the first card; click a later one when its turn comes
	let railId: string | null = null;
	$: railPos = Math.max(0, rail.findIndex((r) => r.p.id === railId));

	// a player's board: on a phone the overlay; here it drops from their chip, one per side
	let dosL: string | null = null, dosR: string | null = null;
	function openBoard(pid: string) {
		if (mobile) { overlayId = pid; return; }
		const p = seated.find((x) => x.id === pid);
		if (!p) return;
		if (pTeam(p) === viewTeam) dosR = dosR === pid ? null : pid;
		else dosL = dosL === pid ? null : pid;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || mobile || deckOpen || examine || selected != null) return;
		armed = null; dosL = dosR = null;
	}

	// arm, then commit: a click lifts a hand card and the action button becomes Commit;
	// a second click (or any click when you can't commit) opens it full size, as before
	let armed: number | null = null;
	$: if (armed != null && (!canCommit || !mine?.hand.includes(armed))) armed = null;
	function deskCardClick(idx: number) {
		if (autoRetract && !handUp) { handUp = true; return; } // touch: the first tap raises the hand
		if (canCommit && armed !== idx) { armed = idx; return; }
		preview(idx);
	}
	function commitArmed() {
		if (armed == null || !canCommit) return;
		session.cardAction({ kind: 'commit', pid: clientId, idx: armed });
		armed = null;
	}
	// one hand tool: click = fan → side by side → ribbons in the console; right-click / long-press = keep it up
	function cycleHand() {
		if (dockHand) { dockHand = false; spreadHand = false; }
		else if (spreadHand) dockHand = true;
		else spreadHand = true;
		writePref(PREF_DOCK, dockHand); writePref(PREF_SPREAD, spreadHand); handUp = false;
	}

	// the ONE action button: a main action (brass), a way back (quiet), or who we are waiting for
	type Order = { label: string; sub?: string; kind: 'go' | 'quiet' | 'wait' | 'off'; pulse?: boolean; hook?: string; run?: () => void };
	const waitFor = (ps: Player[]) => (ps.length === 1 ? ps[0].name : `${ps.length} players`);
	let order: Order = { label: 'Commit', kind: 'off' };
	$: {
		if (iCanRespawn) order = { label: 'Respawn', kind: 'go', pulse: true, run: onRespawn };
		else if (iMustEnter) order = { label: 'Spawn hero', kind: 'go', pulse: true, hook: 'spawnglow', run: onEnter };
		else if (iDefending) order = { label: 'Defended', kind: 'go', run: () => answerAttack('defended') };
		else if (spawnWaiting.length) order = { label: 'Waiting', sub: waitFor(spawnWaiting), kind: 'wait' };
		else if (battlePhase) {
			if ($ms.battle?.remove) order = { label: 'Waiting', sub: teamName($ms.battle.loser), kind: 'wait' };
			else if (!levelPhase) order = iAmHost ? { label: 'Level up', kind: 'go', run: startLevelUp } : { label: 'Waiting', sub: 'Host', kind: 'wait' };
			else if (iMustLevel) order = { label: 'Level up', kind: 'go', pulse: true, run: () => (deckOpen = true) };
			else if (levelWaiting.length) order = { label: 'Waiting', sub: waitFor(levelWaiting), kind: 'wait' };
			else order = iAmHost ? { label: 'Next round', kind: 'go', run: onAdvanceTurn } : { label: 'Waiting', sub: 'Host', kind: 'wait' };
		} else if (revealed) order = !iAmHost ? { label: 'Waiting', sub: 'Host', kind: 'wait' } : isFinalTurn ? { label: 'Minion battle', kind: 'go', run: startBattle } : { label: 'Next turn', kind: 'go', run: onAdvanceTurn };
		else if (myReady) order = { label: 'Take back', kind: 'quiet', run: takeBack };
		else if (armed != null && canCommit) order = { label: 'Commit', kind: 'go', pulse: true, run: commitArmed };
		else if (mine && !mine.hand.length) order = { label: 'Waiting', kind: 'wait' };
		else order = { label: 'Commit', kind: 'off' };
	}
	$: orderPx = [22, 22, 22, 22, 22, 22, 20, 16, 14][Math.min(8, Math.max(...order.label.split(' ').map((w) => w.length)))];
	// the 8-step level ring round your token
	const RING = Array.from({ length: 8 }, (_, i) => {
		const r = 52, c = 56, a0 = ((-90 + i * 45 + 3.4) * Math.PI) / 180, a1 = ((-90 + (i + 1) * 45 - 3.4) * Math.PI) / 180;
		const pt = (a: number) => `${(c + r * Math.cos(a)).toFixed(1)} ${(c + r * Math.sin(a)).toFixed(1)}`;
		return `M${pt(a0)} A${r} ${r} 0 0 1 ${pt(a1)}`;
	});
	const statWord = (r: { key: string; label: string }) => (r.key === 'move' ? 'Movement' : r.label);
	// the card view's dials: the card's values your items raise (the card itself prints the rest)
	$: pvDials = (() => {
		if (!mine || selected == null) return [];
		const c = heroCards(mine.hero)[selected], d = statDeltas(mine), clr = (c?.color ?? 'gold').toLowerCase();
		if (!c) return [];
		const out: { img: string | undefined; v: number; up: number; label: string }[] = [];
		const add = (img: string | undefined, v: number | undefined, up: number | undefined, label: string) => { if (v != null && up) out.push({ img, v: v + up, up, label }); };
		add(icon('initiative'), c.initiative, d.init, 'Initiative');
		const pa = c.primaryAction ?? '';
		if (pa === 'ATTACK') add(icon(`attack_${clr}`), c.primaryValue, d.atk, 'Attack');
		else if (pa.startsWith('DEFENSE')) add(icon(`defense_${clr}`), c.primaryValue, d.def, 'Defense');
		else if (pa === 'MOVEMENT') add(icon(`movement_${clr}`), c.primaryValue, d.move, 'Movement');
		if (c.secondaryDefense) add(icon('defense'), c.secondaryDefense, d.def, 'Defense');
		if (c.secondaryMovement) add(icon('movement'), c.secondaryMovement, d.move, 'Movement');
		return out;
	})();
</script>

<svelte:window on:pointerdown={onWindowDown} on:keydown={onKey} bind:innerWidth={vw} bind:innerHeight={vhPx} />

<!-- controls shared by the desktop dash and the phone dash -->
{#snippet radiusCtl()}
	<span class="radwrap">
					<button class="radbtn" class:on={myRadius > 0} on:click={() => (radiusOpen = !radiusOpen)} title={myRadius ? `Radius ${myRadius} showing — click to change or clear` : 'Show an area radius around your hero'} aria-label="Area radius">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2.4" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></svg>
						<b class:nil={!myRadius}>{myRadius || '–'}</b>
					</button>
					{#if radiusOpen}
						<div class="radpop">
							<div class="toklbl">Area radius</div>
							<div class="radgrid">
								{#each [1, 2, 3, 4, 5, 6, 7, 8] as n}
									<button class="radn" class:on={myRadius === n} on:click={() => setRadius(n)}>{n}</button>
								{/each}
							</div>
							<div class="tokfoot">
								<span class="tokhint">Clears at end of turn</span>
								<button class="tokclear" disabled={!myRadius} on:click={() => setRadius(0)}>Clear</button>
							</div>
						</div>
					{/if}
				</span>
{/snippet}
{#snippet tokenCtl()}
	<div class="tokwrap">
		<button class="tokbtn" class:on={tokenDrawer} disabled={!shelf.length} on:click={() => (tokenDrawer = !tokenDrawer)} title={shelf.length ? 'Tokens and Markers' : 'Your hero has no tokens or markers'}>
			{#if !shelf.length}<span class="tokglyph">◈</span>{:else if shelf[0].letter}<span class="ltrdisc" style="--pc:{colorHex(myColor)}">{shelf[0].letter}</span>{:else}<img src={shelf[0].img} alt="" />{/if}
			{#if myTokenCount}<span class="tokct">{myTokenCount}</span>{/if}
		</button>
		{#if tokenDrawer}
			<div class="tokdrawer">
				<div class="toklbl">Tokens and Markers</div>
				<div class="tokgrid">
					{#each shelf as it (it.key)}
						{@const left = leftOf(it.key)}
						<button class="tok {it.cls}" class:out={left === 0} disabled={left === 0} on:click={() => armToken(it)} title={left === 0 ? `${it.title} — all in play` : it.title}>
							{#if it.letter}<span class="ltrdisc" style="--pc:{colorHex(myColor)}">{it.letter}</span>{:else}<img src={it.img} alt="" />{/if}{#if it.label}<span class="toktag">{it.label}</span>{/if}
							{#if left !== Infinity}<span class="tokleft">{left}</span>{/if}
						</button>
					{/each}
				</div>
				<div class="tokfoot">
					<span class="tokhint">Pick one · tap a hex to place</span>
					<button class="tokclear" disabled={!myTokenCount} on:click={clearTokens} title="Remove every token and marker you've placed">Clear</button>
				</div>
			</div>
		{/if}
	</div>
{/snippet}
{#snippet actionBody()}
		{#if iCanRespawn}
			<button class="act tohand" style={teamVars(myTeam)} on:click={onRespawn}>⤴ Respawn</button>
		{:else if iMustEnter}
			<button class="act tohand spawnglow" style={teamVars(myTeam)} on:click={onEnter}>⤴ Spawn hero</button>
		{:else if iDefending}
			<button class="act tohand" style={teamVars(myTeam)} on:click={() => answerAttack('defended')} title="You defended (discard your defence card first)">🛡 Defended</button>
			<button class="act takeback" on:click={() => answerAttack('defeated')}>Defeated</button>
		{:else if spawnWaiting.length}
			<span class="waithost">Waiting for {spawnWaiting.map((p) => p.name).join(', ')} to spawn…</span>
		{:else}

		{#if fxAsking && fxStage === 'ask'}
			<span class="fxq">Activate effect?</span>
			<span class="fxrow2"><button class="fxb yes" on:click={() => (fxStage = 'pick')}>Yes</button><button class="fxb" on:click={fxNo}>No</button></span>
		{:else if fxAsking}
			<span class="fxrow2">
				{#each ['turn', 'next', 'round'] as d}
					<button class="fxb dur" class:on={myTurnDur === d} on:click={() => fxPickDur(d as EffectDur)} title={DUR_LABEL[d as EffectDur]}>{d === 'turn' ? 'Turn' : d === 'next' ? 'Next' : 'Round'}</button>
				{/each}
				<button class="fxb x" on:click={() => (fxStage = 'ask')} title="Back">✕</button>
			</span>
		{:else if battlePhase && iAmHost}
			<!-- after the battle every card is back in hand (nothing is "revealed" any more),
			     so the level-up phase gets its own branch: the host moves on to the next round -->
			{#if $ms.battle?.remove}
				<span class="waithost">Waiting for the {teamName($ms.battle.loser)} to remove {$ms.battle.remove} minion{$ms.battle.remove === 1 ? '' : 's'}…</span>
			{:else if !levelPhase}
				<button class="act primary" on:click={startLevelUp}>Level Up ⬆</button>
			{:else if levelWaiting.length}
				<span class="waithost" title="Level-ups are forced while a hero can afford them">Waiting for {levelWaiting.map((p) => p.name).join(', ')} to level up…</span>
			{:else}
				<button class="act primary" on:click={onAdvanceTurn}>Next round →</button>
			{/if}
		{:else if battlePhase}
			<span class="waithost">Waiting for host…</span>
		{:else if revealed && iAmHost}
			{#if !isFinalTurn}
				<button class="act primary" on:click={onAdvanceTurn}>Next turn →</button>
			{:else}
				<button class="act primary" on:click={startBattle}>Minion Battle</button>
			{/if}
		{:else if revealed}
			<span class="waithost">Waiting for host…</span>
		{:else if myReady}
			<button class="act takeback" on:click={takeBack}>↩ Take back</button>
		{/if}
		{/if}
{/snippet}

{#if $ms.cards}
	<!-- ───────── phone: the other players, a sideways-scrolling strip ───────── -->
	{#if mobile}
		<div class="mstrip">
			{#each others as p (p.id)}
				{@const cs = viewCards[p.id]}
				{#if cs}
					{@const ini = initOf(cs, revealed)}
					{@const cfx = fxFor(p.id, slotIdx(cs, turnIdx))}
					<div class="mpc" class:fxon={effects.some((e) => e.pid === p.id)} style="{teamVars(pTeam(p))} --fxc:{colorOf(p.id)}" role="button" tabindex="0" on:click={() => (overlayId = p.id)} on:keydown={(e) => e.key === 'Enter' && (overlayId = p.id)}>
						<span class="mpic"><PlayerIcon hero={cs.hero} team={pTeam(p)} color={colorHex(p.color)} size="28px" ring={2} ult={cs.ultimate} /></span>
						<span class="mpn"><b>{p.name}</b><small>{heroName(cs.hero)}</small></span>
						<span class="mlv"><em>Lv {levelOf(cs)}</em><i class="mini" class:off={ini == null}>{@html CLOCK}<b>{ini ?? '–'}</b></i></span>
						<span class="mcard fxwrap" class:fx={!!cfx} style="--fxc:{colorOf(p.id)}"><TurnSlot heroId={cs.hero} played={cs.turns[turnIdx]} pending={cs.pending} isCurrent {revealed} peekable={p.id === clientId} examinable on:click={(e) => peekSlot(e, cs, turnIdx)} /></span>
						<span class="msx">{#each allStats(cs) as r}<span class:up={r.delta > 0}>{#if r.delta > 0}<span class="pp">{#each Array(r.delta) as _}<i></i>{/each}</span>{/if}<img src={statImg(r.key)} alt={r.label} /></span>{/each}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- ───────── phone overlay: a player's whole board (desktop: the board drops from their chip) ───────── -->
	{#if mobile && overlayId && ovPlayer && viewCards[overlayId]}
		{@const cs = viewCards[overlayId]}
		{@const oh = cs.hero}
		{@const od = heroCards(oh)}
		{@const oid = ovPlayer.id}
		{@const ost = statusMap[oid] ?? EMPTY_STATUS}
		{@const own = oid === clientId}
		<div class="scrim" on:click={() => (overlayId = null)} on:keydown={(e) => e.key === 'Escape' && (overlayId = null)} role="presentation">
			<!-- the hero's art sits faintly behind the board -->
			<div class="modal board" style="{teamVars(pTeam(ovPlayer))} --bgimg:url('{heroSplash(oh)}')" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="mhead">
					<PlayerIcon hero={oh} team={pTeam(ovPlayer)} color={colorHex(ovPlayer.color)} size="3rem" ult={cs.ultimate} />
					<div class="mtitle">
						<div class="mnm">{ovPlayer.name} · {heroName(oh)}</div>
						<div class="mtt" style="color:{teamTint(ovPlayer)}">{heroTitle(oh)} · {seatTeamName(ovPlayer)} · Lv {levelOf(cs)}</div>
					</div>
					{#if cs.ultimate && ultimateIndex(oh) >= 0}
						<button class="ultchip" on:click={() => examineCard(oh, ultimateIndex(oh))} title="Ultimate — click to enlarge">
							<span class="ultchip-card"><Card heroId={oh} card={od[ultimateIndex(oh)]} /></span>
							<span class="ultchip-tx"><b>Ultimate Unlocked</b><em>{od[ultimateIndex(oh)]?.name}</em></span>
						</button>
					{/if}
					<span class="coin lg" title="Coins">{cs.coins}</span>
					<button class="ix" on:click={() => (overlayId = null)}>✕</button>
				</div>
				<div class="statusctl">
					<span class="sclbl">Status</span>
					<!-- one of each marker exists: tap to put it on this player (it leaves anyone else), tap again to remove -->
					<button class="sctog pois" class:on={!!ost.poison} aria-pressed={!!ost.poison} on:click={() => toggleStatus(oid, 'poison')}>
						<img src={icon('marker_poison')} alt="" /><span>Poison</span>
					</button>
					<button class="sctog bnty" class:on={!!ost.bounty} aria-pressed={!!ost.bounty} on:click={() => toggleStatus(oid, 'bounty')}>
						<img src={icon('marker_bounty')} alt="" /><span>Bounty</span>
					</button>
				</div>
				<div class="stats6">
					{#each allStats(cs) as r}
						<div class="stat6" class:up={r.delta > 0}>
							<div class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</div>
							<img class="si" src={icon(r.icon)} alt={r.label} />
							<div class="sv">{r.delta > 0 ? '+' + r.delta : '–'}</div>
							<div class="slbl">{r.label}</div>
						</div>
					{/each}
				</div>
				<!-- the four turns, then the discard pile at the same size -->
				<div class="turns">
					{#each [0, 1, 2, 3] as t}
						<div class="tbox" class:current={t === turnIdx} style="--tint:{teamTint(ovPlayer)}">
							<div class="tlabel">Turn {t + 1}</div>
							<div class="tslot">
								<span class="tbroman">{ROMAN[t]}</span>
								<span class="fxwrap" class:fx={!!fxFor(oid, slotIdx(cs, t))} style="--fxc:{colorOf(oid)}"><TurnSlot heroId={oh} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} peekable={oid === clientId} examinable on:click={(e) => peekSlot(e, cs, t)} /></span>
							</div>
						</div>
					{/each}
					<div class="tbox disc" style="--tint:{teamTint(ovPlayer)}">
						<div class="tlabel">Discard{#if cs.discard.length}<span class="ct">{cs.discard.length}</span>{/if}</div>
						<div class="tslot discwrap" role="group" aria-label="Discard pile" on:pointerenter={(e) => cs.discard.length > 1 && discEnter(e, oid)} on:pointerleave={discLeave}>
							<span class="tbroman trash">{@html TRASH}</span>
							{#if cs.discard.length}
								<!-- one card: open it straight away; several: fan them out to choose -->
								<button class="dstack" on:click={() => (cs.discard.length === 1 ? openDiscard(oh, cs.discard[0], own) : discTap(oid))} title={cs.discard.length === 1 ? 'Preview' : 'Show the discard pile'}>
									{#each cs.discard.slice(-3) as i, di (i)}
										<span class="dsk" style="--i:{di}; --n:{Math.min(3, cs.discard.length)}"><Card heroId={oh} card={od[i]} /></span>
									{/each}
								</button>
								{#if discOpen === oid}
									<div class="discpop">
										{#each cs.discard as i (i)}
											<button class="dpc" on:click={() => openDiscard(oh, i, own)} title={own ? 'Preview (you can recover it to your hand)' : 'Preview'}><Card heroId={oh} card={od[i]} /></button>
										{/each}
									</div>
								{/if}
							{/if}
						</div>
					</div>
				</div>
				<!-- removed cards: small, across the whole bottom row -->
				<div class="removedrow">
					<div class="ilabel">Removed <span class="ct">{cs.removed.length}</span></div>
					<div class="rrow">
						{#each cs.removed as i (i)}<button class="rmini" on:click={() => (examine = { hid: oh, idx: i })}><Card heroId={oh} card={od[i]} /></button>{/each}
						{#if !cs.removed.length}<span class="empty-note">—</span>{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ───────── examine one card ───────── -->
	{#if examine}
		<div class="scrim2" class:desk={!mobile} style={mobile ? '' : dashVars} on:click={() => (examine = null)} on:keydown={(e) => e.key === 'Escape' && (examine = null)} role="presentation">
			<div class="bigwrap" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
				<div class="exrow" class:multi={!!exList}>
					{#if exList}<button class="pvnav prev" on:click={() => stepExamine(-1)} aria-label="Previous card">‹</button>{/if}
					<div class="bigcard" class:fxon={!!examineFx} style="--fxc:{examine.pid ? colorOf(examine.pid) : '#fde047'}"
						on:pointerdown={(e) => (exSwipeX = e.clientX)} on:pointerup={exSwipeEnd} on:pointercancel={() => (exSwipeX = null)} role="presentation"><Card heroId={examine.hid} card={heroCards(examine.hid)[examine.idx]} /></div>
					{#if exList}<button class="pvnav next" on:click={() => stepExamine(1)} aria-label="Next card">›</button>{/if}
				</div>
				{#if exList}<span class="exdots">{#each exList as c, i (i)}<i class:on={i === exPos}></i>{/each}</span>{/if}
				{#if !mobile && examine.pid && (canFx || examineFx)}
					<!-- a played card: switch its effect on (pick how long — ★ = named in the card text), end it, or discard the card -->
					<div class="exacts">
						{#if examineFx}
							<span class="exlbl">{fxLabel(examineFx)}</span>
							{#if canFx}<button class="hb sm fxend" on:click={() => endFx(examineFx)}>End effect</button>{/if}
						{:else}
							<span class="exlbl">Effect</span>
							<span class="fxdurs">
								{#each ['turn', 'next', 'round'] as d}
									<button class="hb sm fxdur" class:go={examineDetected === d} on:click={() => examine?.pid && activateFx(examine.pid, examine.hid, examine.idx, d as EffectDur)}>{#if examineDetected === d}★ {/if}{DUR_LABEL[d as EffectDur]}</button>
								{/each}
							</span>
						{/if}
						{#if canDiscardEx}<button class="hb sm bad fxdisc" on:click={discardEx}>Discard</button>{/if}
					</div>
				{:else if examine.pid && (canFx || examineFx)}
					<!-- a played card: Activate effect (then how long) or Discard; a live effect can be ended -->
					<div class="fxctl">
						{#if examineFx}
							<span class="fxstate">Effect active · <b>{fxLabel(examineFx)}</b></span>
							{#if canFx}<button class="fxend" on:click={() => endFx(examineFx)}>End effect</button>{/if}
							{#if canDiscardEx}<button class="fxdisc" on:click={discardEx}>Discard</button>{/if}
						{:else if fxOpen}
							<div class="fxdurs">
								{#each ['turn', 'next', 'round'] as d}
									<button class="fxdur" class:on={examineDetected === d} on:click={() => examine?.pid && activateFx(examine.pid, examine.hid, examine.idx, d as EffectDur)} title={examineDetected === d ? 'From the card text' : ''}>
										{DUR_LABEL[d as EffectDur]}{#if examineDetected === d}<i>✦</i>{/if}
									</button>
								{/each}
							</div>
							<button class="fxend" on:click={() => (fxOpen = false)} title="Back">✕</button>
						{:else}
							<button class="fxgo" on:click={() => (fxOpen = true)}>Activate effect</button>
							{#if canDiscardEx}<button class="fxdisc" on:click={discardEx}>Discard</button>{/if}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ───────── desktop deck: upgrade tree + every card as a banner ───────── -->
	{#if deckOpen && mine && !mobile}
		<DeckView cs={mine} teamStyle={teamVars(myTeam)} onClose={() => { deckOpen = false; deckSel = null; }}
			levelPhase={levelPhase} onMove={(i, to) => moveTo(i, to)}
			onTake={(i) => session.cardAction({ kind: 'take', pid: clientId, idx: i })}
			onSwap={(i) => session.cardAction({ kind: 'swap', pid: clientId, idx: i })}
			onPreview={(i) => mine && examineCard(mine.hero, i)} />
	{/if}

	<!-- ───────── phone deck view: tabs across the four zones ───────── -->
	{#if deckOpen && mine && mobile}
		{@const dh = mine.hero}
		{@const split = handSplit(mine)}
		{@const selZone = deckSel != null ? zoneOf(mine, deckSel) : null}
		{@const selInGrid = deckSel != null && myGrid.flat().some((g) => g.idx === deckSel)}
		<div class="scrim" on:click={() => { deckOpen = false; deckSel = null; }} on:keydown={(e) => e.key === 'Escape' && (deckOpen = false)} role="presentation">
			<div class="deckmodal" class:mob={mobile} style={teamVars(myTeam)} on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="mhead">
					<span class="mav" style="--tint:{ORANGE}"><img src={heroLogo(dh)} alt="" /></span>
					<div class="mtitle">
						<div class="mnm">{heroName(dh)} · Deck<em class="lvtag">Lv {levelOf(mine)}</em></div>
						<div class="mtt">{mobile ? 'Tap a card, then choose where it goes' : 'Select a card, then send it to your hand, upgrade area or removed pile'}</div>
					</div>
					<button class="ix" on:click={() => { deckOpen = false; deckSel = null; }}>✕</button>
				</div>
				<div class="dklv" class:hot={iMustLevel}>
					<span class="coin lg" title="Coins">{mine.coins}</span>
					{#if levelOf(mine) >= 8}Max level — ultimate active
					{:else if iMustLevel}⬆ Level up! {levelOf(mine)} → {levelOf(mine) + 1} costs {levelCost(levelOf(mine))} · pick a glowing card
					{:else if levelPhase && (mine.roundPicks ?? []).length}Levelled up · swap this round's pick until the round ends
					{:else if levelPhase}Not enough coins · +1 pity coin at round end
					{:else}Next level costs {levelCost(levelOf(mine))}{/if}
				</div>
				{#if mobile}
					<div class="dktabs" role="tablist">
						{#each [['hand', 'Hand', mine.hand.length], ['deck', 'Deck', deckCards(mine).length], ['upgrade', 'Upgrade', mine.upgrade.length], ['removed', 'Removed', mine.removed.length]] as [k, lbl, n] (k)}
							<button class="dktab {k}" class:on={deckTab === k} role="tab" aria-selected={deckTab === k} on:click={() => (deckTab = k as typeof deckTab)}>{lbl}<b>{n}</b></button>
						{/each}
					</div>
				{/if}

				<!-- HAND (phones): shelves — basics · your colours · ultimate -->
				{#if mobile && deckTab === 'hand'}
					{@const cols = colourSlots(dh, split.rest)}
					<div class="hshelves">
						<div class="hshelf">
							<div class="hs-h"><span>Basics</span><em>🔒 always in hand</em></div>
							<div class="hs-pair">
								{#each split.basics as i (i)}
									<button class="hs-card basic {heroCards(dh)[i]?.color === 'GOLD' ? 'g' : 's'}" on:click={() => examineCard(dh, i)} title="Tap to preview">
										<Card heroId={dh} card={heroCards(dh)[i]} /><span class="dklock">🔒</span>
									</button>
								{/each}
							</div>
						</div>
						<div class="hshelf">
							<div class="hs-h"><span>Your colours</span><em>swap as you level up</em></div>
							<div class="hs-tri">
								{#each cols.slots as sl (sl.color)}
									<div class="hs-col" style="--c:{sl.hex}">
										<span class="hs-pill">{sl.label}{sl.idx != null ? ` · ${ROMAN[(heroCards(dh)[sl.idx]?.level ?? 1) - 1]}` : ''}</span>
										{#if sl.idx != null}
											<button class="hs-card col" class:sel={deckSel === sl.idx} on:click={() => (deckSel = sl.idx)}><Card heroId={dh} card={heroCards(dh)[sl.idx]} /></button>
										{:else}
											<div class="hs-empty">—</div>
										{/if}
									</div>
								{/each}
							</div>
							{#if cols.extra.length}
								<div class="hs-extra">
									{#each cols.extra as i (i)}<button class="hs-card" class:sel={deckSel === i} on:click={() => (deckSel = i)}><Card heroId={dh} card={heroCards(dh)[i]} /></button>{/each}
								</div>
							{/if}
						</div>
						{#if myUlt >= 0}
							{@const ultReady = allowedMoves(mine, myUlt).includes('hand')}
							<div class="hs-ult" class:on={mine.ultimate}>
								<button class="hs-ultthumb" on:click={() => examineCard(dh, myUlt)} title="Tap to preview your ultimate"><Card heroId={dh} card={heroCards(dh)[myUlt]} /></button>
								<div class="hs-ultinfo">
									<b>Ultimate · {heroCards(dh)[myUlt]?.name}</b>
									<div class="hs-lv">{#each Array(8) as _, k (k)}<i class:on={k < levelOf(mine) || (k === 7 && ultReady)} class:rdy={k === 7 && ultReady}></i>{/each}</div>
									<span>{mine.ultimate ? 'Unlocked · tap to read' : 'Unlocks at level 8 · tap to preview'}</span>
								</div>
								{#if mine.ultimate && allowedMoves(mine, myUlt).includes('deck')}
									<button class="act ghost sm" on:click={() => moveTo(myUlt, 'deck')}>↺ Undo</button>
								{:else if mine.ultimate}
									<span class="hs-seal">★</span>
								{:else if allowedMoves(mine, myUlt).includes('hand')}
									<button class="act sm ultbtn" on:click={() => (lvConfirm = { kind: 'take', idx: myUlt })}>Unlock ★</button>
								{:else}
									<span class="hs-seal">🔒</span>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- UPGRADE DECK grid (fixed positions; status shows where each card is) -->
				{#if !mobile || deckTab === 'deck'}
				<div class="dklabel">Upgrade deck — Tier II &amp; III <span class="ct">{deckCards(mine).length} in deck</span></div>
				<div class="dkgrid">
					{#each phoneCells(myGrid) as row}
						{#each row as cell (cell.color + cell.level + cell.first)}
							{#if cell.idx >= 0}
								{@const z = zoneOf(mine, cell.idx)}
								<button class="dkcard" class:zpick={canTakeNow(mine, cell.idx)} class:sel={deckSel === cell.idx} class:zhand={z === 'hand'} class:zupg={z === 'upgrade'} class:zrem={z === 'removed'} class:zdeck={z === null}
									on:click={() => (deckSel = cell.idx)} on:dblclick={() => examineCard(dh, cell.idx)}>
									<Card heroId={dh} card={heroCards(dh)[cell.idx]} />
									{#if z === 'hand'}<span class="dkbadge hand">In hand</span>
									{:else if z === 'upgrade'}<span class="dkbadge upg">Upgrade</span>
									{:else if z === 'removed'}<span class="dkbadge rem">Removed</span>{/if}
								</button>
							{:else}
								<div class="dkcard empty"></div>
							{/if}
						{/each}
					{/each}
				</div>
				{/if}

				<!-- UPGRADE + REMOVED zones -->
				<div class="dkzones">
					{#if !mobile || deckTab === 'upgrade'}
					<div class="dkzone upg">
						<div class="dklabel">
							Upgrade area <span class="ct">{mine.upgrade.length}</span>
							<span class="zhint">stat growth · hidden from others</span>
							<span class="zgrow">
								{#each allStats(mine).filter((r) => r.delta > 0) as r}
									<span class="growchip"><img src={icon(r.icon)} alt={r.label} />+{r.delta}</span>
								{/each}
							</span>
						</div>
						<div class="dkrow">
							{#each mine.upgrade as i (i)}
								{@const it = heroCards(dh)[i]?.item}
								<button class="dkcard sm" class:sel={deckSel === i} on:click={() => (deckSel = i)} on:dblclick={() => examineCard(dh, i)}>
									<Card heroId={dh} card={heroCards(dh)[i]} />
									{#if statIcon(it)}<span class="dkitem"><img src={statIcon(it)} alt="" />+1</span>{/if}
								</button>
							{/each}
							{#if !mine.upgrade.length}<span class="empty-note">Cards you skip on level-up go here</span>{/if}
						</div>
					</div>
					{/if}
					{#if !mobile || deckTab === 'removed'}
					<div class="dkzone rem">
						<div class="dklabel">Removed <span class="ct">{mine.removed.length}</span> <span class="zhint">open to all players</span></div>
						<div class="dkrow">
							{#each mine.removed as i (i)}
								<button class="dkcard sm" class:sel={deckSel === i} on:click={() => (deckSel = i)} on:dblclick={() => examineCard(dh, i)}>
									<Card heroId={dh} card={heroCards(dh)[i]} />
								</button>
							{/each}
							{#if !mine.removed.length}<span class="empty-note">Drop cards taken out of play here</span>{/if}
						</div>
					</div>
					{/if}
				</div>

				<!-- action bar: destinations for the selected card -->
				{#if deckSel != null}
					<div class="dkbar">
						<span class="dksel">Selected · {heroCards(dh)[deckSel]?.name}</span>
						<!-- one row: preview · destinations · cancel -->
						<div class="dkacts">
							{#if mobile}<button class="act ghost sm" on:click={() => examineCard(dh, deckSel!)}>Preview</button>{/if}
							{#if canTakeNow(mine, deckSel)}
								{@const tw = twinOf(dh, deckSel)}
								<button class="act tohand sm lvtake" on:click={() => (lvConfirm = { kind: 'take', idx: deckSel! })}>Take{#if tw >= 0 && heroCards(dh)[tw]?.item} · +1 <img src={statIcon(heroCards(dh)[tw]?.item)} alt="" />{/if}</button>
							{:else if levelPhase && swapSource(mine, deckSel) != null}
								<button class="act tohand sm lvtake" on:click={() => (lvConfirm = { kind: 'swap', idx: deckSel! })}>Swap to this path</button>
							{:else}
							{@const ok = allowedMoves(mine, deckSel)}
							{#if ok.includes('hand')}<button class="act tohand sm" on:click={() => moveTo(deckSel!, 'hand')}>→ Hand</button>{/if}
							{#if ok.includes('upgrade')}<button class="act sm" on:click={() => moveTo(deckSel!, 'upgrade')}>→ Upgrade</button>{/if}
							{#if ok.includes('deck')}<button class="act todeck sm" on:click={() => moveTo(deckSel!, 'deck')}>→ Deck</button>{/if}
							{#if ok.includes('removed')}<button class="act danger sm" on:click={() => moveTo(deckSel!, 'removed')}>→ Remove</button>{/if}
							{/if}
							<button class="act ghost sm" on:click={() => (deckSel = null)}>Cancel</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if lvConfirm && mine && mobile}
		<div class="lvwrap"><LevelConfirm cs={mine} idx={lvConfirm.idx} kind={lvConfirm.kind} teamStyle={teamVars(myTeam)} onConfirm={confirmLevel} onCancel={() => (lvConfirm = null)} /></div>
	{/if}

	<!-- ───────── desktop card view: the card, what it gives with your items, Discard · Commit ───────── -->
	{#if mine && selected != null && !mobile}
		{@const pc = heroCards(mine.hero)[selected]}
		<div class="cardview" style={dashVars} on:click={closePreview} role="presentation">
			<div class="cv-col" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="cv-main">
					<div class="pvcard" on:pointerdown={swipeStart} on:pointerup={swipeEnd} on:pointercancel={() => (swipeX = null)} role="presentation">
						<div class="pvflip" class:up={committing}>
							<div class="pvface front"><Card heroId={mine.hero} card={pc} /></div>
							<div class="pvface back">
								<span class="cb-band top"></span><span class="emblem sym"><img src={heroLogo(mine.hero)} alt="" /></span><span class="cb-band bot"></span>
							</div>
						</div>
					</div>
					{#if previewSrc === 'hand'}
						<div class="dials">
							{#each pvDials as d}
								<span class="dial"><span class="dface"><img src={d.img} alt="" />{d.v}<small>+{d.up}</small></span>{d.label}</span>
							{/each}
						</div>
					{/if}
				</div>
				{#if pvList.length > 1}
					<div class="pager">
						{#each pvList as c (c)}<button class:on={c === selected} on:click={() => !committing && (selected = c)} aria-label={heroCards(mine.hero)[c]?.name}><Card heroId={mine.hero} card={heroCards(mine.hero)[c]} /></button>{/each}
					</div>
				{/if}
				<div class="pvbar">
					{#if previewSrc === 'discard'}
						<button class="hb go act tohand" on:click={() => pullBack(selected!)}>Recover</button>
					{:else}
						<!-- discard any time, as often as effects demand -->
						{#if mine.hand.includes(selected)}<button class="hb bad act discard" on:click={() => defend(selected!)}>Discard</button>{/if}
						{#if canCommit}<button class="hb go act tohand" on:click={() => commit(selected!)}>Commit</button>{/if}
					{/if}
				</div>
			</div>
			<button class="cvx" on:click={closePreview} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
		</div>
	{/if}

	<!-- ───────── phone: centered preview of a picked hand card ───────── -->
	{#if mine && selected != null && mobile}
		<div class="pvscrim" on:click={closePreview} on:keydown={(e) => e.key === 'Escape' && closePreview()} role="presentation"></div>
		<div class="pvwrap" role="presentation" style={dashVars}>
			{#if pvList.length > 1}<button class="pvnav prev" on:click={() => stepPreview(-1)} aria-label="Previous card">‹</button>{/if}
			<div class="pvcard" style="--glow:{cardGlow(mine.hero, selected)}" on:pointerdown={swipeStart} on:pointerup={swipeEnd} on:pointercancel={() => (swipeX = null)} role="presentation">
				<div class="pvflip" class:up={committing}>
					<div class="pvface front"><Card heroId={mine.hero} card={heroCards(mine.hero)[selected]} /></div>
					<div class="pvface back">
						<span class="cb-band top"></span><span class="emblem sym"><img src={heroLogo(mine.hero)} alt="" /></span><span class="cb-band bot"></span>
					</div>
				</div>
			</div>
			{#if pvList.length > 1}<button class="pvnav next" on:click={() => stepPreview(1)} aria-label="Next card">›</button>{/if}
		</div>
		<!-- actions sit in the freed space below the hand -->
		<div class="pvbar" style={dashVars}>
			{#if pvList.length > 1}<span class="pvdots">{#each pvList as c (c)}<i class:on={c === selected}></i>{/each}</span>{/if}
			{#if previewSrc === 'discard'}
				<button class="act tohand" style={teamVars(myTeam)} on:click={() => pullBack(selected!)}>Recover to hand</button>
			{:else}
				{#if canCommit}<button class="act tohand" style={teamVars(myTeam)} on:click={() => commit(selected!)}>Commit · Turn {$ms.turn}</button>{/if}
				<!-- discard any time, as often as effects demand -->
				{#if mine?.hand.includes(selected!)}<button class="act discard" on:click={() => defend(selected!)}>Discard</button>{/if}
			{/if}
			<button class="act" on:click={closePreview}>Close</button>
		</div>
	{/if}

	<!-- ───────── bottom: hand floats ABOVE the dashboard (unless docked) ───────── -->
	{#if mine && mobile}
		<!-- ───────── phone: hand tips above a compact dash ───────── -->
		{#if bannerHand}
			<!-- hand as banners (+ the ultimate and its level bar); hidden = tucked to the right edge, markers showing -->
			<div class="bstack">
				{#each handOrdered as idx (idx)}
					<div class="bwrap" class:tucked={autoRetract && bannerOpen !== idx}>
						<CardBanner heroId={mine.hero} {idx} sel={selected === idx} on:click={() => bannerTap(idx, () => preview(idx))} />
					</div>
				{/each}
				{#if myUlt >= 0}
					<span class="bsgap"></span>
					<div class="bwrap" class:tucked={autoRetract && bannerOpen !== myUlt}>
						<CardBanner heroId={mine.hero} idx={myUlt} level={levelOf(mine)} unlocked={mine.ultimate} dim={!mine.ultimate}
							on:click={() => bannerTap(myUlt, () => mine && examineCard(mine.hero, myUlt))} />
					</div>
				{/if}
			</div>
		{:else}
			<div class="tray mob" class:retracted class:spread={spreadHand}>
				{#each handOrdered as idx, k (idx)}
					{@const f = fan(k, handOrdered.length)}
					<button class="hc" style="--rot:{spreadHand ? 0 : f.rot}deg; --y:{spreadHand ? 0 : f.y}px" on:click={() => handCardClick(idx)}>
						<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
					</button>
				{/each}
			</div>
		{/if}
		<div class="mdash" class:ultdash={mine.ultimate} style={teamVars(myTeam)}>
			<div class="mdl">
				<div class="mdtop">
					<button class="mdme" on:click={() => (overlayId = clientId)} title="Open your board"><PlayerIcon hero={mine.hero} team={myTeam ?? 'orange'} color={colorHex(myColor)} size="32px" ring={2} ult={mine.ultimate} /></button>
					<button class="mdid" on:click={() => (overlayId = clientId)}><b>{myName}</b><small>{heroName(mine.hero)}<em>Lv {levelOf(mine)}</em></small></button>
				</div>
				<span class="msx">{#each allStats(mine) as r}<span class:up={r.delta > 0}>{#if r.delta > 0}<span class="pp">{#each Array(r.delta) as _}<i></i>{/each}</span>{/if}<img src={statImg(r.key)} alt={r.label} /></span>{/each}</span>
			</div>
			<!-- middle: turn slots, and under them the action (Take back / Activate effect? / Next turn) -->
			<div class="mmid">
			<div class="mslots">
				{#each [0, 1, 2, 3] as t}
					{@const dfx = fxFor(clientId, slotIdx(mine, t))}
					<span class="msl fxwrap" class:fx={!!dfx} style="--fxc:{colorOf(clientId)}"><TurnSlot heroId={mine.hero} played={mine.turns[t]} pending={mine.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} peekable examinable on:click={(e) => peekSlot(e, mine, t)} /></span>
				{/each}
				<span class="msep"></span>
				<span class="msl mdisc discwrap" role="group" aria-label="Discard pile">
					{#if mine.discard.length}
						<button class="mdstack" on:click={() => (mine.discard.length === 1 ? openDiscard(mine.hero, mine.discard[0], true) : discTap('dash'))} title="Discard">
							<Card heroId={mine.hero} card={heroCards(mine.hero)[mine.discard[mine.discard.length - 1]]} />
							<span class="ds-count">{mine.discard.length}</span>
						</button>
						{#if discOpen === 'dash'}
							<div class="discpop up">
								{#each mine.discard as i (i)}
									<button class="dpc" on:click={() => openDiscard(mine.hero, i, true)}><Card heroId={mine.hero} card={heroCards(mine.hero)[i]} /></button>
								{/each}
							</div>
						{/if}
					{:else}<span class="mtrash">{@html TRASH}</span>{/if}
				</span>
				<button class="msl mdeck" class:lvup={iMustLevel} on:click={() => (deckOpen = true)} title="Your deck — {deckCards(mine).length} cards"><img src={heroLogo(mine.hero)} alt="" /><b>{deckCards(mine).length}</b></button>
			</div>
			<div class="mact">{@render actionBody()}</div>
			</div>
			<div class="mbtns">
				<span class="mb" class:off={myInit == null} title="Your initiative this turn"><i class="inicon">{@html CLOCK}</i><b>{myInit ?? '–'}</b></span>
				{@render radiusCtl()}
				<button class="mb" class:on={!autoRetract} on:click={toggleRetract} aria-label="Show / hide hand" title={autoRetract ? 'Hand hidden — tap to show' : 'Hand shown — tap to hide'}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
						<rect x="4.5" y="2.5" width="8" height="11" rx="1.4" fill="rgba(9,13,22,.9)" transform="rotate(-9 8.5 8)" />
						<rect x="11.5" y="2.5" width="8" height="11" rx="1.4" fill="rgba(9,13,22,.9)" transform="rotate(9 15.5 8)" />
						<path d="M2.5 15.5h19" />
						{#if autoRetract}<path d="M9 18.5l3 3 3-3" />{:else}<path d="M9 21.5l3-3 3 3" />{/if}
					</svg>
				</button>
				<button class="mb" class:on={bannerHand || spreadHand} on:click={cycleHandStyle} aria-label="Hand style: fan, spread or banners" title={bannerHand ? 'Banners — tap to fan the cards' : spreadHand ? 'Spread — tap for banners' : 'Fanned — tap to spread'}>
					<svg viewBox="0 0 24 24" fill="rgba(9,13,22,.9)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
						{#if bannerHand}
							<path d="M3 4.5h18v4H3z" /><path d="M3 10h18v4H3z" /><path d="M3 15.5h18v4H3z" /><path d="M7 4.5v15" fill="none" />
						{:else if spreadHand}
							<rect x="1.5" y="6" width="6.2" height="10" rx="1.2" /><rect x="8.9" y="6" width="6.2" height="10" rx="1.2" /><rect x="16.3" y="6" width="6.2" height="10" rx="1.2" />
						{:else}
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" transform="rotate(-22 12 21)" />
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" transform="rotate(22 12 21)" />
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" />
						{/if}
					</svg>
				</button>
				{@render tokenCtl()}
				<!-- undo is the host's; red so it reads apart, disabled for everyone else -->
				<button class="mb undo" disabled={!iAmHost || !$canUndoS} on:click={() => session.undo()} title={iAmHost ? 'Undo the last move this turn' : 'Only the host can undo'} aria-label="Undo">↶</button>
			</div>
		</div>
	{/if}

	<!-- ═════════ desktop: the helm — roster chips · initiative rail · player boards · the hand · the console ═════════
	     ONE layer in design px (1440 × 900, wider / taller on bigger windows), scaled by the one UI scale -->
	{#if !mobile}
	<div class="helm" style={dashVars}>
		{@render roster('l', chipsL)}
		{@render roster('r', chipsR)}

		{#if rail.length}
			<div class="rail" class:tight={rail.length > 5}>
				{#each rail as r, i (r.p.id)}
					<button class="ini" class:done={i < railPos || !!$ms.defeated?.[r.p.id]} class:now={i === railPos} style="--cc:{r.c}" title="{heroCards(r.hero)[r.idx]?.name} · {r.p.name}"
						on:click={() => (i === railPos ? (examine = { hid: r.hero, idx: r.idx, pid: r.p.id }) : (railId = r.p.id))}>
						<b class="flag">{r.n}</b>
						<PlayerIcon hero={r.hero} team={pTeam(r.p)} color={colorHex(r.p.color)} size="24px" ring={2} />
						<span class="nm">{r.p.name}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if dosL}{@render dossier(dosL, 'l')}{/if}
		{#if dosR}{@render dossier(dosR, 'r')}{/if}

		{#if mine}
			<!-- the hand rises from the console's top edge (unless it is docked as ribbons) -->
			{#if !dockHand}
				<div class="tray dk" class:retracted class:spread={spreadHand}>
					{#each handOrdered as idx, k (idx)}
						{@const f = fan(k, handOrdered.length)}
						<button class="hc" class:armed={armed === idx} style="--rot:{spreadHand ? 0 : f.rot * 0.7}deg; --y:{spreadHand ? 0 : f.y * 0.6}px"
							on:click={() => deskCardClick(idx)} on:pointerenter={raiseHand} on:pointerleave={lowerHandSoon}>
							<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
						</button>
					{/each}
				</div>
			{/if}

			<div class="console" style={teamVars(myTeam)}>
				<div class="hull">
					{@render gauges(mine)}
					<i class="div"></i>
					<!-- this round's four turns as card wells, then the discard and the deck -->
					<div class="slots">
						{#each [0, 1, 2, 3] as t}
							{@const sfx = fxFor(clientId, slotIdx(mine, t))}
							<div class="wslot" class:now={t === turnIdx} role="button" tabindex="-1" on:click={() => openBoard(clientId)} on:keydown={(e) => e.key === 'Enter' && openBoard(clientId)}>
								<span class="cwell dm-on" class:fxlit={!!sfx} style="--fxc:{colorOf(clientId)}">
									<TurnSlot well heroId={mine.hero} played={mine.turns[t]} pending={mine.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} peekable examinable on:click={(e) => peekSlot(e, mine, t)} />
								</span>
								{#if t === turnIdx && fxAsking}<i class="fxstar" title="This card has an effect — open it to switch it on">★</i>{/if}
							</div>
						{/each}
						<div class="wslot pile discwrap" role="group" aria-label="Discard" on:pointerenter={(e) => mine.discard.length > 1 && discEnter(e, 'dash')} on:pointerleave={discLeave}>
							{#if mine.discard.length}
								<button class="cwell" title="Discard" on:click={() => (mine.discard.length === 1 ? openDiscard(mine.hero, mine.discard[0], true) : discTap('dash'))}>
									<Card heroId={mine.hero} card={heroCards(mine.hero)[mine.discard[mine.discard.length - 1]]} />
									<b class="num">{mine.discard.length}</b>
								</button>
								{#if discOpen === 'dash'}
									<div class="discpop up">
										{#each mine.discard as i (i)}
											<button class="dpc" on:click={() => openDiscard(mine.hero, i, true)}><Card heroId={mine.hero} card={heroCards(mine.hero)[i]} /></button>
										{/each}
									</div>
								{/if}
							{:else}
								<span class="cwell empty" title="Discard">{@html TRASH}</span>
							{/if}
						</div>
						<button class="wslot deck" class:lvup={iMustLevel} on:click={() => (deckOpen = true)} title="Deck">
							<span class="cwell cback"><img src={heroLogo(mine.hero)} alt="" /></span>
						</button>
					</div>
					<i class="div"></i>
					{#if dockHand}
						<div class="dockhand"><DockHand heroId={mine.hero} hand={handOrdered} fanned={!autoRetract} onPick={(i) => preview(i)} /></div>
					{/if}
					<div class="tools">
						{@render radiusCtl()}
						<button class="hbtn pingbtn" class:on={pingArmed} on:click={onPing} aria-label="Ping" title="Ping">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg>
						</button>
						{@render tokenCtl()}
						<button class="hbtn" class:on={!autoRetract} on:click={cycleHand} on:contextmenu|preventDefault={toggleRetract} aria-label="Hand"
							title="Hand: {dockHand ? 'ribbons' : spreadHand ? 'side by side' : 'fan'}{autoRetract ? '' : ', kept up'} — click to change, right-click to keep it up">
							<svg viewBox="0 0 24 24" aria-hidden="true">
								{#if dockHand}
									<path d="M6 3v15l2.5-2.5L11 18V3zM13 3v15l2.5-2.5L18 18V3z" />
								{:else if spreadHand}
									<rect x="2.5" y="6" width="5.6" height="12" rx="1.2" /><rect x="9.2" y="6" width="5.6" height="12" rx="1.2" /><rect x="15.9" y="6" width="5.6" height="12" rx="1.2" />
								{:else}
									<rect x="3.5" y="7" width="8" height="12" rx="1.5" transform="rotate(-12 7.5 13)" /><rect x="11.5" y="6" width="8" height="12" rx="1.5" transform="rotate(10 15.5 12)" />
								{/if}
							</svg>
						</button>
					</div>
				</div>
				<!-- left: you — your token in the 8-step level ring, your coins under it -->
				<button class="medal" on:click={() => openBoard(clientId)} title="{myName} · {heroName(mine.hero)} · Level {levelOf(mine)}" aria-label="Your board">
					<svg viewBox="0 0 112 112" aria-hidden="true">{#each RING as d, i (i)}<path {d} class:on={i < levelOf(mine)} class:u={i === 7} />{/each}</svg>
					<PlayerIcon hero={mine.hero} team={myTeam ?? 'orange'} color={colorHex(myColor)} size="74px" ring={4} />
				</button>
				{@render purse()}
				<!-- right: the one action -->
				<div class="dact">
					{#if iDefending}<button class="oalt" on:click={() => answerAttack('defeated')}>Defeated</button>{/if}
					<button class="order {order.kind} {order.hook ?? ''}" class:pulse={order.pulse} disabled={!order.run} on:click={() => order.run?.()}>
						<span class="oface" style="font-size:{orderPx}px">{order.label}{#if order.sub}<small>{order.sub}</small>{/if}</span>
					</button>
				</div>
			</div>
		{/if}
	</div>
	{/if}

	{#snippet roster(side: 'l' | 'r', list: Player[])}
		<div class="roster {side}" class:compact={list.length > 2} class:tiny={list.length > 4}>
			{#each list as p (p.id)}
				{@const cs = viewCards[p.id]}
				{@const st = chipCard(p, cs)}
				<div class="rchip" class:me={p.id === clientId} class:open={dosL === p.id || dosR === p.id} class:out={!!$ms.defeated?.[p.id]} style={teamVars(pTeam(p))} role="button" tabindex="0"
					title="{p.name}{cs ? ` · ${heroName(cs.hero)}` : ''}" on:click={() => openBoard(p.id)} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openBoard(p.id)}>
					<PlayerIcon hero={cs?.hero ?? ''} team={pTeam(p)} color={colorHex(p.color)} size={list.length > 4 ? '31px' : '38px'} ring={2.5} />
					{#if cs}<b class="lv" class:ult={cs.ultimate}>{levelOf(cs)}</b>{/if}
					<span class="who"><b>{p.name}</b><small>{cs ? heroName(cs.hero) : ''}</small></span>
					{#if cs && st.k === 'up' && st.idx != null}
						<button class="cst up" style="--cc:{st.c}" title={heroCards(cs.hero)[st.idx]?.name} on:click|stopPropagation={() => (examine = { hid: cs.hero, idx: st.idx ?? 0, pid: p.id })}>{st.n}</button>
					{:else if cs && st.k === 'back'}
						<span class="cst back">{#if st.n != null}{st.n}{:else}<img src={heroLogo(cs.hero)} alt="" />{/if}</span>
					{:else if st.k === 'dead'}
						<span class="cst dead"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a7 7 0 0 1 14 0c0 2.6-1.2 4-2.5 5v3h-9v-3C6.2 15 5 13.6 5 11z" /><circle cx="9.5" cy="11.5" r="1.4" /><circle cx="14.5" cy="11.5" r="1.4" /></svg></span>
					{:else}
						<span class="cst">{st.k === 'skip' ? '–' : ''}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/snippet}

	{#snippet gauges(cs: PlayerCardState)}
		<span class="gauges">
			{#each allStats(cs) as r (r.key)}
				<span class="gauge" class:on={r.delta > 0} title={statWord(r)}><img src={icon(r.icon)} alt="" />{#if r.delta > 0}<b>+{r.delta}</b>{/if}</span>
			{/each}
		</span>
	{/snippet}

	{#snippet purse()}
		{#if mine}
			<span class="purse" title="Coins">
				<button class="pm" on:click={() => changeCoins(-1)} aria-label="Remove a coin">−</button>
				<span class="gcoin">{mine.coins}</span>
				<button class="pm" on:click={() => changeCoins(1)} aria-label="Add a coin">+</button>
			</span>
		{/if}
	{/snippet}

	<!-- a player's board, dropped from their chip beside the island (yours carries your controls) -->
	{#snippet dossier(pid: string, side: 'l' | 'r')}
		{@const p = seated.find((x) => x.id === pid)}
		{@const cs = viewCards[pid]}
		{#if p && cs}
			{@const own = pid === clientId}
			{@const st = statusMap[pid] ?? EMPTY_STATUS}
			{@const ult = ultimateIndex(cs.hero)}
			<aside class="dossier {side}" style={teamVars(pTeam(p))}>
				<div class="dos-head" style="background-image: linear-gradient(90deg, rgba(5,16,28,.94) 0%, rgba(5,16,28,.6) 45%, rgba(5,16,28,.05) 80%), url('{heroAvatar(cs.hero)}')">
					<b>{heroName(cs.hero)}</b>
					<span><PlayerIcon hero={cs.hero} team={pTeam(p)} color={colorHex(p.color)} size="20px" ring={2} />{p.name}</span>
					<button class="dx" on:click={() => (side === 'l' ? (dosL = null) : (dosR = null))} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
				</div>
				<div class="dos-body">
					<div class="dos-row">
						<span class="lvbar" title="Level {levelOf(cs)}">{#each Array(8) as _, k (k)}<i class:on={k < levelOf(cs)} class:u={k === 7}></i>{/each}</span>
						<span class="sp"></span>
						{#if own}{@render purse()}{:else}<span class="gcoin" title="Coins">{cs.coins}</span>{/if}
					</div>
					{@render gauges(cs)}
					<div class="slots">
						{#each [0, 1, 2, 3] as t}
							<span class="cwell" class:now={t === turnIdx} class:fxlit={!!fxFor(pid, slotIdx(cs, t))} style="--fxc:{colorOf(pid)}">
								<TurnSlot well heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} peekable={own} examinable on:click={(e) => peekSlot(e, cs, t)} />
							</span>
						{/each}
					</div>
					<div class="dos-row">
						<span class="dcount" title="Hand"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7" width="8" height="12" rx="1.5" transform="rotate(-12 7.5 13)" /><rect x="11.5" y="6" width="8" height="12" rx="1.5" transform="rotate(10 15.5 12)" /></svg><b>{cs.hand.length}</b></span>
						<span class="dcount discwrap" role="group" aria-label="Discard" on:pointerenter={(e) => cs.discard.length > 1 && discEnter(e, pid)} on:pointerleave={discLeave}>
							<button class="dbtn" disabled={!cs.discard.length} title="Discard" on:click={() => (cs.discard.length === 1 ? openDiscard(cs.hero, cs.discard[0], own) : discTap(pid))}>{@html TRASH}<b>{cs.discard.length}</b></button>
							{#if discOpen === pid}
								<div class="discpop">
									{#each cs.discard as i (i)}
										<button class="dpc" on:click={() => openDiscard(cs.hero, i, own)}><Card heroId={cs.hero} card={heroCards(cs.hero)[i]} /></button>
									{/each}
								</div>
							{/if}
						</span>
						<span class="sp"></span>
						<!-- one of each marker exists: click to put it on this hero (it leaves anyone else), again to take it off -->
						<button class="dmark" class:on={!!st.poison} aria-pressed={!!st.poison} title="Poison" on:click={() => toggleStatus(pid, 'poison')}><img src={icon('marker_poison')} alt="Poison" /></button>
						<button class="dmark" class:on={!!st.bounty} aria-pressed={!!st.bounty} title="Bounty" on:click={() => toggleStatus(pid, 'bounty')}><img src={icon('marker_bounty')} alt="Bounty" /></button>
						{#if ult >= 0}
							<button class="dult" class:on={cs.ultimate} title="Ultimate" on:click={() => examineCard(cs.hero, ult)}><Card heroId={cs.hero} card={heroCards(cs.hero)[ult]} /></button>
						{/if}
					</div>
					{#if cs.removed.length}
						<div class="dos-row removed" title="Removed">
							{#each cs.removed as i (i)}<button class="rmini" on:click={() => (examine = { hid: cs.hero, idx: i })}><Card heroId={cs.hero} card={heroCards(cs.hero)[i]} /></button>{/each}
						</div>
					{/if}
				</div>
			</aside>
		{/if}
	{/snippet}

	<!-- ───────── synced pre-reveal countdown (take back your card to cancel) ───────── -->
	{#if countdownActive}
		<div class="countdown">
			{#key countdownLabel}<span class="cd-num" class:go={countdownLabel === 'Reveal!'}>{countdownLabel}</span>{/key}
			{#if mobile}<span class="cd-sub">Revealing…</span>{/if}
		</div>
	{/if}

	<!-- ───────── new turn / new round splash ───────── -->
	<TurnSplash bind:this={turnSplash} {mobile} />
	<LevelSplash bind:this={levelSplash} {mobile} />

	<!-- ───────── dramatic simultaneous reveal ───────── -->
	{#if curtain}
		<div class="curtain" class:desk={!mobile} on:click={skipCurtain} on:keydown={(e) => e.key === 'Escape' && skipCurtain()} role="presentation">
			<div class="curtain-inner">
				<div class="curtain-title">Reveal — Turn {$ms.turn}</div>
				<div class="curtain-cards" style="--cols:{curtainCols}; --rows:{curtainFit.rows}">
					{#each curtainRows as row, ri (ri)}
					<div class="cc-row">
					{#each row as p (p.id)}
						{@const cs = viewCards[p.id]}
						{@const idx = cs.pending}
						<div class="cc" style="--tint:{teamTint(p)}">
							{#if idx != null && idx !== PASS}
								<div class="cc-flip" class:up={curtainFlip}>
									<div class="cc-face cc-back"><span class="cb-band top"></span><span class="emblem"><img src={heroLogo(cs.hero)} alt="" /></span><span class="cb-band bot"></span></div>
									<div class="cc-face cc-front"><Card heroId={cs.hero} card={heroCards(cs.hero)[idx]} /></div>
								</div>
							{:else}
								<div class="cc-flip skip">—</div>
							{/if}
							<div class="cc-name"><PlayerIcon hero={cs.hero} team={pTeam(p)} color={colorHex(p.color)} size="1.6em" ring={2} /><span>{p.name}</span></div>
						</div>
					{/each}
					</div>
					{/each}
				</div>
				{#if mobile}<div class="curtain-hint">Resuming…</div>{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	/* status controls in the phone's board overlay */
	.statusctl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 10px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.1); }
	.sctog { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px 4px 5px; border-radius: 999px; cursor: pointer; font-size: .76rem; font-weight: 700;
		color: #94a3b8; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14); transition: background .12s, color .12s, box-shadow .12s; }
	.sctog img { width: 1.25rem; height: 1.25rem; object-fit: contain; border-radius: 50%; filter: grayscale(1) opacity(.6); }
	.sctog:hover { background: rgba(255,255,255,.1); color: #e5e7eb; }
	.sctog.on img { filter: none; }
	.sctog.pois.on { color: #c8f5cf; background: rgba(65,174,89,.24); border-color: rgba(65,174,89,.6); box-shadow: 0 0 10px rgba(65,174,89,.35); }
	.sctog.bnty.on { color: #ffe6a6; background: rgba(232,182,74,.22); border-color: rgba(232,182,74,.6); box-shadow: 0 0 10px rgba(232,182,74,.35); }
	.statusctl .sclbl { font-size: .58rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; color: #93a3b8; }
	/* gold coin chip */
	.coin { display: inline-flex; align-items: center; justify-content: center; min-width: 1.05rem; height: 1.05rem; padding: 0 4px; border-radius: 999px;
		background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: .58rem; font-weight: 900; font-variant-numeric: tabular-nums;
		border: 1px solid rgba(0,0,0,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.45); }
	.coin.lg { min-width: 1.8rem; font-variant-numeric: tabular-nums; height: 1.5rem; font-size: .82rem; }

	/* overlay */
	.scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3,6,12,.62); }
	.modal.board { width: min(1040px, 96vw); background: linear-gradient(180deg, rgba(11,16,26,.8), rgba(11,16,26,.9) 55%, rgba(11,16,26,.95)), var(--bgimg) center 22% / cover no-repeat, #0b101a; }
	.modal { zoom: var(--uis, 1); width: min(780px, 94vw); max-height: 90vh; overflow-y: auto; padding: 16px 18px; color: #e5e7eb; background: rgba(11,16,26,.94); border: 1px solid rgba(199,154,78,.5); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.7); }
	.mhead { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
	.mav { position: relative; width: 3rem; height: 3rem; border-radius: 50%; overflow: hidden; border: 2px solid var(--tint); flex: none; }
	.mav img { width: 100%; height: 100%; object-fit: cover; }
	.mnm { font-family: 'Modesto Poster', serif; font-size: 1.25rem; color: #f6ead2; }
	.mtt { font-family: 'Modesto Poster', serif; font-size: .72rem; letter-spacing: .03em; color: #b8a06a; }
	/* opponent overlay: compact ultimate chip next to the name (only once unlocked) */
	.ultchip { display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: 10px; cursor: zoom-in;
		background: linear-gradient(90deg, rgba(139,79,214,.34), rgba(139,79,214,.14)); border: 1px solid rgba(180,130,240,.55); }
	.ultchip:hover { background: linear-gradient(90deg, rgba(139,79,214,.5), rgba(139,79,214,.22)); }
	.ultchip-card { width: 34px; border-radius: 4px; overflow: hidden; flex: none; box-shadow: 0 0 0 1.5px #b482f0, 0 2px 6px rgba(0,0,0,.5); }
	.ultchip-card :global(.cardface) { display: block; width: 100%; border-radius: 4px; }
	.ultchip-tx { display: flex; flex-direction: column; line-height: 1.05; text-align: left; }
	.ultchip-tx b { font-size: .6rem; letter-spacing: .06em; text-transform: uppercase; color: #cbb0f0; }
	.ultchip-tx em { font-family: 'Modesto Poster', serif; font-style: normal; font-size: .82rem; color: #efe0ff; }
	.ix { margin-left: auto; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: #cbd5e1; border-radius: 7px; width: 1.9rem; height: 1.9rem; cursor: pointer; flex: none; }
	.ilabel { font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #93a3b8; display: flex; align-items: center; gap: 6px; margin: 10px 0 6px; }
	.ilabel .ct { color: #f1f5f9; background: rgba(255,255,255,.08); border-radius: 5px; padding: 0 6px; }
	.stats6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
	.stat6 { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 4px 7px; border-radius: 12px; background: rgba(12,18,32,.5); border: 1px solid rgba(255,255,255,.1); }
	.stat6 .si { height: 1.3rem; filter: brightness(0) invert(1); opacity: .55; }
	.stat6 .sv { font-size: 1.1rem; font-weight: 800; color: #c3ccd8; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 3px; }
	.stat6 .slbl { font-size: .5rem; letter-spacing: .08em; text-transform: uppercase; color: #6b7a8d; }
	.stat6 .stripes { position: absolute; top: 5px; left: 0; right: 0; display: flex; justify-content: center; gap: 3px; height: 5px; }
	.stat6 .stripe { width: 9px; height: 3px; transform: skewX(-24deg); border-radius: 1px; background: linear-gradient(90deg, rgb(var(--tcl, 239 180 106)), var(--tc, #ef7d22)); box-shadow: 0 0 5px rgb(var(--tcr, 239 125 34) / .6); }
	.stat6.up { background: linear-gradient(180deg, rgb(var(--tcr, 239 125 34) / .24), rgb(var(--tcr, 239 125 34) / .06)); border-color: rgb(var(--tcr, 239 125 34) / .55); box-shadow: 0 0 0 1px rgb(var(--tcr, 239 125 34) / .15), 0 6px 18px rgb(var(--tcr, 239 125 34) / .14); }
	.stat6.up .si { opacity: 1; } .stat6.up .sv { color: rgb(var(--tcl, 255 215 173)); } .stat6.up .slbl { color: rgb(var(--tcl, 216 168 120) / .85); }
	.turns { display: flex; align-items: stretch; gap: 10px; margin-top: 10px; }
	.tbox { flex: 1; display: flex; flex-direction: column; gap: 7px; padding: 9px 8px 10px; border-radius: 16px; background: rgba(12,18,32,.46); border: 1px solid rgba(255,255,255,.12); border-bottom: 3px solid var(--tint); box-shadow: 0 12px 30px rgba(0,0,0,.4); }
	.tbox.current { border-color: rgba(199,154,78,.5); border-bottom-color: #efb46a; box-shadow: 0 0 0 1px rgba(199,154,78,.3), 0 12px 34px rgba(199,154,78,.18); }
	.tlabel { text-align: center; font-family: 'Modesto Poster', serif; font-size: .78rem; letter-spacing: .04em; color: #f6ead2; }
	.tslot { position: relative; }
	.tbroman { position: absolute; inset: 0; display: grid; place-items: center; font-family: 'Modesto Poster', serif; font-size: 3.4rem; line-height: 1; color: rgba(255,255,255,.07); pointer-events: none; z-index: 0; }
	.tbroman.trash { padding: 22%; color: rgba(255,255,255,.08); }
	.tbroman.trash :global(svg) { width: 100%; height: 100%; }
	.tslot :global(.slot) { position: relative; z-index: 1; }
	.tbox.disc .tlabel .ct { margin-left: 5px; font-size: .62rem; font-weight: 800; color: #f1f5f9; background: rgba(255,255,255,.1); border-radius: 5px; padding: 0 5px; }
	/* discard: the same footprint as a turn slot; a slightly fanned stack */
	.discwrap { position: relative; }
	.tbox.disc .discwrap { aspect-ratio: 3 / 4; }
	.dstack { position: absolute; inset: 0; z-index: 1; padding: 0; background: none; border: none; cursor: pointer; }
	.dsk { position: absolute; top: 0; left: 0; width: 100%; border-radius: 6%; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.55);
		transform: translateX(calc((var(--i) - var(--n) + 1) * 6%)) rotate(calc((var(--i) - var(--n) + 1) * 3deg)); transform-origin: bottom left; z-index: var(--i); }
	.dsk :global(.cardface) { display: block; width: 100%; }
	.dstack:hover .dsk { filter: brightness(1.08); }
	/* fanned-out discard (hover / tap) — click a card to preview it */
	.discpop { position: absolute; z-index: 30; right: 0; bottom: calc(100% + 10px); display: flex; gap: 6px; padding: 8px; max-width: min(760px, 92vw); overflow-x: auto;
		border-radius: 12px; background: rgba(9,13,22,.95); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 14px 36px rgba(0,0,0,.6); animation: popin .16s ease; }
	.discpop.up { right: auto; left: 50%; transform: translateX(-50%); animation: popinc .16s ease; }
	@keyframes popin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes popinc { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translateX(-50%); } }
	.dpc { flex: none; width: 76px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 6%; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.55); transition: transform .12s; }
	.dpc :global(.cardface) { display: block; width: 100%; }
	.dpc:hover { transform: translateY(-4px); }
	.removedrow { margin-top: 10px; padding: 7px 10px 9px; border-radius: 12px; background: rgba(12,18,32,.4); border: 1px solid rgba(255,255,255,.08); }
	.removedrow .ilabel { margin: 0 0 6px; }
	.rrow { display: flex; flex-wrap: wrap; gap: 6px; min-height: 30px; align-items: center; }
	.rmini { width: 44px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; opacity: .85; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.rmini :global(.cardface) { display: block; width: 100%; }
	.rmini:hover { opacity: 1; outline: 2px solid rgba(199,154,78,.6); }
	.empty-note { color: #55637a; font-size: .8rem; padding: 4px; }

	/* deck view (manage cards across zones) */
	.deckmodal { width: min(880px, 95vw); max-height: 92vh; overflow-y: auto; scrollbar-gutter: stable; padding: 16px 18px 12px; color: #e5e7eb; background: rgba(11,16,26,.96); border: 1px solid rgba(199,154,78,.5); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.7); }
	.deckmodal .lvtag { font-style: normal; font-size: .62rem; font-weight: 800; letter-spacing: .04em; color: #f0dcae; background: rgba(199,154,78,.2); border: 1px solid rgba(199,154,78,.45); border-radius: 6px; padding: 1px 7px; margin-left: 9px; vertical-align: middle; }
	.deckmodal .mav { overflow: visible; border-color: rgba(199,154,78,.6); display: grid; place-items: center; }
	.deckmodal .mav img { width: 76%; height: 76%; object-fit: contain; border-radius: 0; }
	.dklabel { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: #93a3b8; display: flex; align-items: center; gap: 6px; margin: 12px 0 7px; flex-wrap: wrap; }
	.dklabel .ct { color: #f1f5f9; background: rgba(255,255,255,.08); border-radius: 5px; padding: 0 6px; text-transform: none; letter-spacing: normal; }
	.zhint { text-transform: none; letter-spacing: normal; font-weight: 600; color: #6b7a8d; font-size: .62rem; }
	.zgrow { display: inline-flex; gap: 5px; margin-left: auto; }
	.growchip { display: inline-flex; align-items: center; gap: 2px; font-size: .64rem; font-weight: 800; color: #ffcfa3; background: rgba(239,125,34,.16); border: 1px solid rgba(239,125,34,.4); border-radius: 6px; padding: 1px 5px; text-transform: none; }
	.growchip img { height: .74rem; filter: brightness(0) invert(1); }
	.dkgrid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
	.dkcard { position: relative; width: 100%; padding: 0; background: none; border: none; cursor: pointer; border-radius: 6px; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.5); transition: transform .12s; }
	.dkcard.sm { width: 58px; }
	.dkcard:hover { transform: translateY(-4px); z-index: 2; }
	.dkcard :global(.cardface) { display: block; width: 100%; border-radius: 6px; }
	.dkcard.sel { outline: 3px solid #efb46a; box-shadow: 0 0 0 3px rgba(239,180,106,.4), 0 6px 16px rgba(0,0,0,.6); }
	.dkcard.empty { cursor: default; box-shadow: none; aspect-ratio: 1192 / 1664; border: 1px dashed rgba(255,255,255,.1); background: rgba(255,255,255,.02); }
	.dkcard.empty:hover { transform: none; }
	.dkcard.basic { cursor: zoom-in; }
	.dkcard.basic:hover { transform: none; }
	.dklock { position: absolute; top: 3px; right: 4px; font-size: .7rem; filter: drop-shadow(0 1px 2px #000); }
	/* ultimate slot in the deck view: never in hand, locked until level 8 */
	.dkcard.ult { width: 72px; box-shadow: 0 0 0 2px rgba(165,110,230,.7), 0 6px 16px rgba(0,0,0,.55); cursor: zoom-in; }
	.ultbtn { background: linear-gradient(180deg, rgba(165,110,230,.3), rgba(165,110,230,.16)); border-color: rgba(180,130,240,.6); color: #efe0ff; }
	/* grid card status: available = bright, placed elsewhere = tinted + dim */
	/* the deck grid shows what's still available: cards in the deck are bright; ones already moved out dim, with a badge saying where */
	.dkgrid .dkcard.zhand { outline: 2px solid var(--tc, #ef7d22); }
	.dkgrid .dkcard.zupg { outline: 2px solid #3f7fe0; }
	.dkgrid .dkcard.zrem { outline: 2px solid rgba(150,160,175,.6); }
	.dkgrid .dkcard.zhand :global(.cardface), .dkgrid .dkcard.zupg :global(.cardface) { filter: grayscale(.55) brightness(.5); }
	.dkgrid .dkcard.zrem :global(.cardface) { filter: grayscale(.9) brightness(.42); }
	.dkgrid .dkcard.sel :global(.cardface) { filter: none; }
	.dkbadge { position: absolute; left: 3px; bottom: 3px; right: 3px; font-size: .54rem; font-weight: 800; letter-spacing: .02em; text-align: center; padding: 2px 0; border-radius: 5px; }
	.dkbadge.hand { background: var(--tc, #ef7d22); color: #fff; }
	.dkbadge.upg { background: rgba(63,127,224,.92); color: #04122b; }
	.dkbadge.rem { background: rgba(150,160,175,.9); color: #10151d; }
	.dkitem { position: absolute; bottom: 3px; right: 3px; display: inline-flex; align-items: center; gap: 1px; font-size: .56rem; font-weight: 900; color: #ffcfa3; background: rgba(20,14,6,.85); border: 1px solid rgba(239,125,34,.5); border-radius: 5px; padding: 0 3px; }
	.dkitem img { height: .66rem; filter: brightness(0) invert(1); }
	.dkzones { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-top: 4px; }
	.dkzone { padding: 8px; border-radius: 12px; }
	.dkzone.upg { background: rgba(63,127,224,.08); border: 1px solid rgba(63,127,224,.28); }
	.dkzone.rem { background: rgba(150,160,175,.06); border: 1px solid rgba(150,160,175,.22); }
	.dkrow { display: flex; flex-wrap: wrap; gap: 6px; min-height: 42px; align-items: center; }
	/* action bar for the selected card */
	.dkbar { position: sticky; bottom: 0; margin: 12px -18px -12px; padding: 10px 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
		background: linear-gradient(0deg, rgba(11,16,26,.99), rgba(11,16,26,.9)); border-top: 1px solid rgba(199,154,78,.4); }
	.dksel { font-size: .74rem; font-weight: 700; color: #f0dcae; margin-right: auto; }
	.dkacts { display: flex; gap: 8px; flex-wrap: wrap; }
	/* sending to hand = your team colour; back to deck = the deck's brass */
	.act.tohand { background: var(--tc, #ef7d22); color: #fff; border-color: transparent; box-shadow: 0 3px 0 rgb(var(--tcr, 239 125 34) / .55); text-shadow: 0 1px 1px rgba(0,0,0,.35); }
	.act.todeck { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.65); color: #f0dcae; }
	/* ── phone deck: full-screen sheet, tabs, big tap targets, sticky actions ── */
	.deckmodal.mob { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; max-height: none; border-radius: 0; border: none; padding: 10px 12px 0;
		display: flex; flex-direction: column; scrollbar-gutter: auto; }
	.deckmodal.mob .mhead { flex: none; }
	.dktabs { position: sticky; top: -10px; z-index: 3; flex: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 8px -12px 0; padding: 8px 12px;
		background: rgba(11,16,26,.98); border-bottom: 1px solid rgba(255,255,255,.08); }
	.dktab { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 2px; border-radius: 10px; cursor: pointer; font-size: .7rem; letter-spacing: .03em; color: #93a3b8;
		background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }
	.dktab b { font-weight: normal; font-size: .95rem; color: #f1f5f9; font-variant-numeric: tabular-nums; }
	.dktab.on { color: #fff; }
	.dktab.hand.on { background: rgba(239,125,34,.22); border-color: #ef7d22; }
	.dktab.deck.on { background: rgba(199,154,78,.2); border-color: #c79a4e; }
	.dktab.upgrade.on { background: rgba(63,127,224,.22); border-color: #3f7fe0; }
	.dktab.removed.on { background: rgba(150,160,175,.18); border-color: rgba(150,160,175,.7); }
	.mob .zhint { display: none; }
	.mob .dkcard:hover { transform: none; }
	.mob .dkcard.ult, .mob .dkcard.sm { width: 100%; }
	.mob .dkgrid { grid-template-columns: repeat(3, 1fr); }
	.mob .dkzones { grid-template-columns: 1fr; }
	.mob .dkrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.mob .empty-note { grid-column: 1 / -1; padding: 16px 0; text-align: center; }
	.mob .dkbadge { font-size: .6rem; }
	.mob .dkbar { margin: auto -12px 0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); gap: 6px; }
	.mob .dkbar .dksel { flex: 1 1 100%; margin: 0; }
	.mob .dkacts { flex: 1 1 100%; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 5px; }
	/* one fixed height for every button, icons sized to the text, so nothing grows or shrinks */
	.mob .dkbar .act { min-width: 0; height: 40px; box-sizing: border-box; padding: 0 .1rem; display: inline-flex; align-items: center; justify-content: center; gap: 3px; line-height: 1; font-size: clamp(.6rem, 2.9vw, .76rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	/* phone Hand tab: shelves */
	.hshelves { flex: 1 0 auto; display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }
	.hshelf { padding: 10px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); }
	.hs-h { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: #cbd5e1; }
	.hs-h em { font-style: normal; font-size: .6rem; letter-spacing: .04em; text-transform: none; color: #7c8aa0; }
	.hs-card { position: relative; display: block; width: 100%; padding: 0; background: none; border: none; cursor: pointer; border-radius: 6px; }
	.hs-card :global(.cardface) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.55); }
	.hs-pair { display: flex; justify-content: center; gap: 14px; }
	.hs-pair .hs-card { width: min(112px, 29vw); cursor: zoom-in; }
	.hs-card.basic.g :global(.cardface) { box-shadow: 0 0 0 2px #e8b64a, 0 4px 12px rgba(0,0,0,.55); }
	.hs-card.basic.s :global(.cardface) { box-shadow: 0 0 0 2px #c6d0db, 0 4px 12px rgba(0,0,0,.55); }
	.hs-tri { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
	.hs-col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
	.hs-pill { font-size: .62rem; padding: 2px 8px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 25%, transparent); border: 1px solid var(--c); color: #fff; }
	.hs-card.col :global(.cardface) { box-shadow: 0 0 0 2px var(--c), 0 4px 12px rgba(0,0,0,.55); }
	.hs-card.sel :global(.cardface) { box-shadow: 0 0 0 3px #efb46a, 0 0 14px rgba(239,180,106,.6); }
	.hs-empty { width: 100%; aspect-ratio: 1192 / 1664; display: grid; place-items: center; border-radius: 6px; border: 1px dashed color-mix(in srgb, var(--c) 50%, transparent); color: #55637a; }
	.hs-extra { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
	.hs-ult { margin-top: auto; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
		background: linear-gradient(90deg, rgba(120,60,190,.28), rgba(40,20,70,.4)); border: 1px solid rgba(165,110,230,.45); }
	.hs-ult.on { border-color: rgba(200,160,255,.8); box-shadow: 0 0 18px rgba(165,110,230,.4); }
	.hs-ultthumb { width: 58px; flex: none; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 5px; }
	.hs-ultthumb :global(.cardface) { display: block; width: 100%; border-radius: 5px; filter: grayscale(.8) brightness(.55); }
	.hs-ult.on .hs-ultthumb :global(.cardface) { filter: none; box-shadow: 0 0 0 2px #b482f0, 0 0 12px rgba(165,110,230,.7); }
	.hs-ultinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; font-size: .62rem; color: #b9a7d6; }
	.hs-ultinfo b { font-weight: normal; font-size: .82rem; color: #efe0ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hs-lv { display: flex; gap: 3px; }
	.hs-lv i { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); }
	.hs-lv i.on { background: #b482f0; box-shadow: 0 0 5px rgba(180,130,240,.7); }
	.hs-lv i.rdy { box-shadow: 0 0 8px rgba(212,168,255,.9); animation: hsrdy 1.2s ease-in-out infinite; }
	@keyframes hsrdy { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
	.hs-seal { font-size: 1.1rem; }
	/* level-up phase */
	.dklv { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; padding: 6px 10px; border-radius: 9px; font-size: .74rem; color: #93a3b8; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
	.dklv .coin { flex: none; margin-right: 4px; }
	.dklv.hot { color: #1a1206; background: linear-gradient(180deg, #f0c060, #c98a26); border-color: #fbe7b0; }
	.dklv.hot .coin { border-color: #6b4a10; }
	.dkcard.zpick { box-shadow: 0 0 0 2px #f0c060, 0 0 14px rgba(240,192,96,.7); }
	.lvtake { flex: 2 1 auto; white-space: nowrap; }
	.lvtake img { height: 1.1em; width: auto; max-width: 1.5em; flex: none; object-fit: contain; }
	.lvwrap { position: fixed; inset: 0; z-index: 45; }
	/* upgrades lie upside down, like on the table (item symbol upright) */
	.dkcard :global(.cardface) { transition: transform .5s cubic-bezier(.3,.7,.2,1); }
	.dkcard.zupg :global(.cardface), .dkzone.upg .dkcard :global(.cardface) { transform: rotate(180deg); }
	.mdeck.lvup { box-shadow: 0 0 0 2px #f0c060, 0 0 14px rgba(240,192,96,.75); animation: deckpulse 1.4s ease-in-out infinite; border-radius: 6px; }
	@keyframes deckpulse { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
	/* keep the bottom of the last row reachable above the sticky bar */
	.mob .dkzones, .mob .dkgrid { margin-bottom: 12px; }

	/* synced pre-reveal countdown — big number, doesn't block the hand/take-back */
	.countdown { position: fixed; inset: 0; z-index: 57; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; pointer-events: none; }
	.cd-num { font-family: 'Modesto Poster', serif; font-size: 9rem; line-height: .9; color: #f6ead2;
		text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 46px rgba(239,180,106,.55); animation: cdpop .9s ease forwards; }
	@keyframes cdpop { 0% { opacity: 0; transform: scale(1.5); } 22% { opacity: 1; transform: scale(1); } 100% { opacity: .5; transform: scale(.9); } }
	.countdown::before { content: ''; position: absolute; left: 50%; top: 50%; width: 560px; height: 420px; transform: translate(-50%, -50%); z-index: -1;
		background: radial-gradient(closest-side, rgba(4,6,12,.62), rgba(4,6,12,0)); pointer-events: none; }
	.cd-num.go { font-size: 5.5rem; color: #ffe2a8; text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 50px rgba(255,190,90,.7); }
	.cd-sub { font-size: .85rem; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; color: #f0dcae; padding: 4px 14px; border-radius: 999px; background: rgba(6,9,16,.72); text-shadow: 0 2px 8px rgba(0,0,0,.8); }

	/* dramatic reveal curtain */
	/* round-start banner */

	.curtain { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; cursor: pointer;
		background: radial-gradient(120% 90% at 50% 40%, rgba(20,14,6,.86), rgba(3,5,10,.96)); animation: curtainIn .35s ease; }
	@keyframes curtainIn { from { opacity: 0; } to { opacity: 1; } }
	.curtain-inner { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 16px; max-width: 100vw; }
	/* one line at any width */
	.curtain-title { font-family: 'Modesto Poster', serif; font-size: clamp(1.1rem, 5.2vw, 2.4rem); white-space: nowrap; letter-spacing: .06em; color: #f6ead2; text-shadow: 0 2px 12px rgba(0,0,0,.7), 0 0 22px rgba(199,154,78,.4); }
	/* cards as large as both the width (widest row) and the height (all rows) allow */
	.curtain-cards { --gap: clamp(16px, 2.4vw, 26px); display: flex; flex-direction: column; align-items: center; gap: calc(var(--gap) * 1.2);
		--cw: min(320px, calc((100vw - 32px - (var(--cols) - 1) * var(--gap)) / var(--cols)), calc(((100vh - 120px) / var(--rows) - 44px) * 1192 / 1664)); }
	.cc-row { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--gap) * 1.2) var(--gap); max-width: calc(var(--cols) * var(--cw) + (var(--cols) - 1) * var(--gap) + 1px); }
	.cc { display: flex; flex-direction: column; align-items: center; gap: 6px; perspective: 1300px; width: var(--cw); }
	.cc-flip { width: var(--cw); aspect-ratio: 1192 / 1664; position: relative; transform-style: preserve-3d; transition: transform .7s cubic-bezier(.34,.08,.2,1); }
	.cc-face { box-shadow: 0 12px 30px rgba(0,0,0,.6); }
	.cc-flip.up { transform: rotateY(180deg) scale(1.04); }
	.cc-flip.skip { display: grid; place-items: center; border: 1.5px dashed rgba(255,255,255,.2); border-radius: 5%; color: #6b7a8d; font-size: 2rem; }
	.cc-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 5%; overflow: hidden; }
	.cc-face.cc-front { transform: rotateY(180deg); box-shadow: 0 0 0 2px var(--tint); }
	.cc-face.cc-front :global(.cardface) { display: block; width: 100%; border-radius: 5%; }
	.cc-back { display: flex; flex-direction: column; box-shadow: 0 0 0 2px var(--tint);
		background: repeating-linear-gradient(135deg, rgba(90,70,40,.04) 0 1px, transparent 1px 5px), radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); }
	.cc-back .cb-band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.cc-back .cb-band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.cc-back .cb-band.top::after { bottom: 0; } .cc-back .cb-band.bot::after { top: 0; }
	.cc-back .emblem { flex: 1; display: grid; place-items: center; padding: 12%; }
	.cc-back .emblem img { width: 76%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,.4)); }
	.cc-name { display: flex; align-items: center; justify-content: center; gap: .4em; max-width: 100%; font-family: 'Modesto Poster', serif; font-size: clamp(.62rem, calc(var(--cw) / 14), 1.15rem); color: #eef2f8; }
	.cc-name span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cc-name img { width: 1.9rem; height: 1.9rem; border-radius: 50%; object-fit: cover; border: 2px solid var(--tint); }
	.curtain-hint { font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; color: #8b7a52; }

	/* examine */
	.scrim2 { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(2,4,9,.8); }
	.bigcard { width: min(360px, 62vw); filter: drop-shadow(0 20px 50px rgba(0,0,0,.7)); }
	.exrow { display: flex; align-items: center; justify-content: center; }
	.exrow.multi .bigcard { touch-action: pan-y; }
	.exdots { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
	.exdots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.25); }
	.exdots i.on { background: #f0dcae; box-shadow: 0 0 6px rgba(240,220,174,.8); }
	.bigwrap { display: flex; flex-direction: column; align-items: center; gap: 12px; zoom: var(--uis, 1); }
	.bigcard.fxon { filter: drop-shadow(0 0 3px var(--fxc)) drop-shadow(0 0 16px var(--fxc)) drop-shadow(0 20px 50px rgba(0,0,0,.7)); }
	/* lingering-effect controls under a played card */
	.fxctl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; padding: 8px 10px; border-radius: 12px;
		background: rgba(11,16,26,.94); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 12px 30px rgba(0,0,0,.5); max-width: min(560px, 92vw); }
	.fxstate { font-size: .78rem; color: #f0dcae; letter-spacing: .03em; }
	.fxstate b { color: #fff; }
	.fxdurs { display: flex; gap: 4px; }
	.fxdur { position: relative; padding: 5px 10px; border-radius: 8px; cursor: pointer; font-size: .72rem; color: #e5e7eb; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); }
	.fxdur i { font-style: normal; margin-left: 4px; color: #e8c173; }
	.fxdur.on { background: rgba(199,154,78,.32); border-color: rgba(230,190,110,.85); color: #fff; }
	.fxgo { padding: 5px 14px; border-radius: 8px; cursor: pointer; font-size: .78rem; color: #1a0f06; background: linear-gradient(180deg, #f3d08a, #d4a64a); border: 1px solid #fbe7b0; }
	.fxdisc { padding: 5px 16px; border-radius: 8px; cursor: pointer; font-size: .78rem; color: #fff; background: linear-gradient(180deg, #e0463c, #a82620); border: 1px solid rgba(255,170,160,.7); }
	/* the very first step of the game: impossible to miss */
	.act.spawnglow { box-shadow: 0 3px 0 rgb(var(--tcr, 239 125 34) / .55), 0 0 16px 5px rgb(var(--tcr, 239 125 34) / .7); animation: spawnglow 1.4s ease-in-out infinite; position: relative; }
	@keyframes spawnglow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: .82; } }
	.act.discard { color: #fff; background: linear-gradient(180deg, #e0463c, #a82620); border-color: rgba(255,170,160,.7); box-shadow: 0 3px 0 #6e1812; }
	.fxend { padding: 5px 12px; border-radius: 8px; cursor: pointer; font-size: .74rem; color: #ffc9c2; background: rgba(220,60,60,.2); border: 1px solid rgba(239,68,68,.5); }
	/* a played card with a live effect: glows in its player's colour + duration badge */
	.fxwrap { position: relative; display: block; }
	/* live effect: the card glows in its player's colour */
	/* drop-shadow on the wrapper follows the card's shape and isn't clipped by the flip face's overflow */
	.fxwrap.fx { filter: drop-shadow(0 0 1.5px var(--fxc)) drop-shadow(0 0 4px var(--fxc)) drop-shadow(0 0 9px color-mix(in srgb, var(--fxc) 70%, transparent)); animation: fxglow 2.6s ease-in-out infinite; }
	@keyframes fxglow { 0%, 100% { opacity: 1; } 50% { opacity: .78; } }
	/* activate-effect prompt in the dash action slot */
	.fxq { font-size: .7rem; color: #f0dcae; letter-spacing: .03em; white-space: nowrap; }
	.fxrow2 { display: flex; gap: 3px; }
	.fxb { height: 24px; padding: 0 8px; border-radius: 7px; cursor: pointer; font-size: .7rem; color: #e5e7eb; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.2); white-space: nowrap; }
	.fxb.yes { color: #1a0f06; background: linear-gradient(180deg, #f3d08a, #d4a64a); border-color: #fbe7b0; }
	.fxb.dur { padding: 0 4px; font-size: .62rem; }
	.fxb.dur.on { background: rgba(199,154,78,.34); border-color: rgba(230,190,110,.9); color: #fff; }
	.fxb.x { padding: 0 6px; }
	.bigcard :global(.cardface) { border-radius: 4%; }

	/* centered preview of a picked hand card */
	.pvscrim { position: fixed; inset: 0; z-index: 30; background: rgba(3,6,12,.55); }
	.pvwrap { position: fixed; inset: 0 0 calc(var(--db, 12px) + var(--dh, 70px) + 14px * var(--uis, 1)) 0; z-index: 31; display: flex; align-items: center; justify-content: center; pointer-events: none; }
	.pvcard { width: min(320px * var(--uis, 1), 56vw); border-radius: 5%; pointer-events: auto; perspective: 1400px; }
	.pvflip { position: relative; width: 100%; aspect-ratio: 1192 / 1664; transform-style: preserve-3d; transition: transform .46s cubic-bezier(.4,.15,.2,1); }
	.pvflip.up { transform: rotateY(180deg); }
	.pvface { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 3%; overflow: hidden; }
	.pvface.front :global(.cardface) { display: block; width: 100%; border-radius: 3%; }
	.pvcard { box-shadow: 0 0 0 3px var(--glow), 0 0 44px var(--glow), 0 24px 60px rgba(0,0,0,.7); }
	.pvface.back { transform: rotateY(180deg); display: flex; flex-direction: column; background: radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); box-shadow: inset 0 0 0 1px rgba(120,95,55,.4); }
	.pvface.back .cb-band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.pvface.back .cb-band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.pvface.back .cb-band.top::after { bottom: 0; } .pvface.back .cb-band.bot::after { top: 0; }
	.pvface.back .emblem { flex: 1; display: grid; place-items: center; padding: 12%; }
	.pvface.back .emblem img { width: 60%; border-radius: 50%; opacity: .85; }
	.pvface.back .emblem.sym img { width: 74%; border-radius: 0; opacity: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }
	.pvbar { position: fixed; left: 224px; right: 260px; bottom: calc((var(--db, 12px) + var(--dh, 70px)) / var(--uis, 1) - 8px); zoom: var(--uis, 1); z-index: 32; pointer-events: none; display: flex; gap: 8px; justify-content: center; }
	.pvbar .act { pointer-events: auto; }
	.pvcard { touch-action: pan-y; }
	.pvnav { pointer-events: auto; flex: none; width: 40px; height: 64px; margin: 0 10px; border-radius: 12px; cursor: pointer; font-size: 30px; line-height: 1; color: #f0dcae;
		background: rgba(11,16,26,.7); border: 1px solid rgba(199,154,78,.45); }
	.pvnav:hover { background: rgba(199,154,78,.25); }
	.pvdots { position: absolute; left: 0; right: 0; top: -16px; display: flex; justify-content: center; gap: 5px; pointer-events: none; }
	.pvdots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.25); }
	.pvdots i.on { background: #f0dcae; box-shadow: 0 0 6px rgba(240,220,174,.8); }

	/* the phone dash's action slot */
	.act.takeback { padding: 7px 14px; font-size: .86rem; color: #fff; background: linear-gradient(180deg, #e0463c, #a82620); border-color: rgba(255,170,160,.7); box-shadow: 0 3px 0 #6e1812, 0 0 12px rgba(239,68,68,.45); }
	.act.takeback:hover { filter: brightness(1.1); }
	/* radius (phone dash; the desktop console restyles it under .tools) */
	.radbtn { width: 46px; height: 20px; box-sizing: border-box; flex: none; }
	.radwrap { position: relative; flex: none; align-self: center; display: flex; }
	.radbtn { display: inline-flex; align-items: center; justify-content: center; gap: 2px; padding: 0 4px; border-radius: 8px; cursor: pointer;
		color: #d8bf8a; background: rgba(199,154,78,.1); border: 1px solid rgba(199,154,78,.4); }
	.radbtn svg { width: 14px; height: 14px; flex: none; }
	.radbtn b { min-width: .6em; font-size: .76rem; line-height: 1; font-variant-numeric: tabular-nums; }
	.radbtn:hover { background: rgba(199,154,78,.24); color: #f6e3b4; }
	.radbtn.on { background: rgba(199,154,78,.3); border-color: rgba(230,190,110,.8); color: #fff3d6; }
	.radpop { position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 14; width: 196px; padding: 9px; border-radius: 12px;
		background: rgba(11,16,26,.96); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 16px 40px rgba(0,0,0,.6); }
	.radgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
	.radn { padding: 5px 0; border-radius: 8px; cursor: pointer; font-size: .9rem; color: #f0dcae; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
	.radn:hover { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.5); }
	.radn.on { background: rgba(199,154,78,.36); border-color: rgba(230,190,110,.85); color: #fff; }
	.tokbtn:disabled { cursor: not-allowed; opacity: .45; }
	.tokglyph { width: 1.4rem; height: 1.4rem; display: grid; place-items: center; font-size: 1.1rem; line-height: 1; color: #d8b56a; }

	/* the phone hand (.tray.mob — see the phone section for its size and place; desktop has .tray.dk) */
	.tray.mob { --cw: calc(150px * var(--uis, 1)); position: absolute; left: calc(224px * var(--uis, 1)); right: calc(260px * var(--uis, 1)); bottom: calc(var(--db, 12px) + var(--dh, 70px) + 36px * var(--uis, 1)); z-index: 10; display: flex; align-items: flex-end; justify-content: center; pointer-events: none;
		clip-path: inset(-800px -800px -60px -800px);
		transition: transform .3s cubic-bezier(.3,.7,.2,1), clip-path .3s cubic-bezier(.3,.7,.2,1); }
	/* auto-hide: sink the hand behind the dash (z 11) so only ~30px of card tips peek
	   out; the clip keeps the sunk part from showing in the gap under the dash */
	.tray.mob.retracted { transform: translateY(calc(var(--cw) * 1.396 + 6px * var(--uis, 1))); clip-path: inset(-800px -800px calc(var(--cw) * 1.396 - 30px * var(--uis, 1) - var(--dh, 70px)) -800px); }
	.mob .hc { width: var(--cw); margin: 0 calc(var(--cw) * -0.11); padding: 0; background: none; border: none; cursor: pointer; pointer-events: auto; transform-origin: bottom center; transform: translateY(var(--y)) rotate(var(--rot)); transition: transform .16s; }
	.mob .hc :global(.cardface) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 8px 18px rgba(0,0,0,.55); }
	/* hovered / tapped card straightens and magnifies so its text is readable */
	.mob .hc:hover { transform: translateY(calc(var(--y) - 36px * var(--uis, 1))) rotate(0deg) scale(1.45); z-index: 5; }
	.mob .hc:hover :global(.cardface) { box-shadow: 0 14px 34px rgba(0,0,0,.7); }
	.tray.mob.retracted .hc:hover { transform: translateY(var(--y)) rotate(var(--rot)); } /* the whole hand rises first */
	/* spread layout: side by side, no overlap; shrink evenly if the hand is wide */
	.tray.mob.spread .hc { flex: 0 1 var(--cw); width: auto; min-width: 0; margin: 0 4px; }

	.waithost { max-width: 5.6rem; font-size: .72rem; line-height: 1.15; text-align: center; font-weight: 700; letter-spacing: .02em; color: #b8a06a; font-style: italic; }
	.ds-count { position: absolute; bottom: -5px; right: -6px; z-index: 2; min-width: 1.05rem; height: 1.05rem; padding: 0 4px; border-radius: 999px;
		display: grid; place-items: center; background: linear-gradient(#2b3444, #171d27); border: 1px solid rgba(199,154,78,.6); color: #f0dcae;
		font-size: .6rem; font-weight: 900; font-variant-numeric: tabular-nums; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.act { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; border-radius: 8px; padding: 6px 14px; font-weight: 700; cursor: pointer; font-size: .82rem; }
	.act.sm { padding: 4px 10px; font-size: .76rem; }
	.act.primary { background: #ef7d22; color: #1a0f06; border-color: transparent; box-shadow: 0 3px 0 #a8560f; }
	.act.danger { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.act.ghost { background: transparent; }

	/* token tray */
	.tokwrap { position: relative; flex: none; }
	.tokbtn { display: flex; align-items: center; gap: 5px; padding: 5px 9px; border-radius: 9px; cursor: pointer; color: #e8dcc0; font-size: .74rem; font-weight: 700;
		background: rgba(199,154,78,.14); border: 1px solid rgba(199,154,78,.4); }
	.tokbtn.on { background: rgba(199,154,78,.28); }
	.tokbtn { position: relative; }
	.tokbtn img { width: 1.4rem; height: 1.4rem; object-fit: contain; }
	.tokct { position: absolute; top: -6px; right: -6px; min-width: .95rem; height: .95rem; padding: 0 3px; border-radius: 999px; display: grid; place-items: center;
		background: #0b101a; border: 1px solid rgba(199,154,78,.7); color: #f0dcae; font-size: .55rem; font-weight: 900; }
	/* companion (Turret / Pyro): your colour, its letter, team ring — like the board piece */
	.ltrdisc { width: 1.4rem; height: 1.4rem; border-radius: 50%; display: grid; place-items: center; background: var(--pc); border: 2px solid var(--tc, #ef7d22);
		color: #0b1220; font-size: .78rem; font-weight: 900; line-height: 1; }
	.tokdrawer { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 14; width: 232px; padding: 9px; border-radius: 12px;
		background: rgba(11,16,26,.96); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 16px 40px rgba(0,0,0,.6); }
	.toklbl { font-size: .56rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 800; color: #b8a06a; margin: 2px 2px 5px; }
	.toklbl + .tokgrid { margin-bottom: 8px; }
	.tokgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
	/* supply left: a small count on each token; empty = greyed out */
	.tok { position: relative; }
	.tokleft { position: absolute; right: 2px; bottom: 1px; min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; font-size: 10px; line-height: 14px; text-align: center; color: #fff; background: rgba(0,0,0,.72); border: 1px solid rgba(255,255,255,.3); }
	.tok.out { opacity: .35; cursor: not-allowed; filter: grayscale(1); }
	.tok { padding: 4px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); display: grid; place-items: center; }
	.tok:hover { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.5); }
	.tok img { width: 100%; aspect-ratio: 1; object-fit: contain; }
	.tok.emblem { background: rgba(199,154,78,.16); border-color: rgba(199,154,78,.45); }
	.tok.comp { position: relative; grid-column: span 2; display: flex; align-items: center; gap: 6px; padding: 5px 8px; }
	.tok.comp img, .tok.comp .ltrdisc { width: 1.5rem; height: 1.5rem; aspect-ratio: auto; }
	.tok.comp .toktag { font-size: .64rem; font-weight: 800; letter-spacing: .02em; color: #f0dcae; }
	.tok.marker img { border-radius: 50%; }
	.tokfoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
	.tokclear { flex: none; padding: 2px 9px; border-radius: 6px; font-size: .62rem; letter-spacing: .04em; cursor: pointer; color: #ffc9c2;
		background: rgba(220,60,60,.18); border: 1px solid rgba(239,68,68,.45); }
	.tokclear:hover:not(:disabled) { background: rgba(220,60,60,.32); }
	.tokclear:disabled { cursor: default; opacity: .35; color: #9aa4b2; background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.12); }
	.tokhint { min-width: 0; font-size: .58rem; color: #8b9bb0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* ═══════════ desktop: THE HELM (GameView gives phones their own layout) ═══════════
	   One layer in design px — 1440 × 900, wider / taller on bigger windows — scaled by the
	   one UI scale. Navy hull (nearly opaque, no blur), brass hairlines, brass = the one action.
	   Performance: nothing here animates at rest; the only loop is the action button's ring
	   (opacity), and everything that moves is a transform. */
	.helm, .cardview, .scrim2.desk {
		/* the Tide's values (ui/tide.css), carried here: a `.tide` wrapper would let that sheet's global rules into the cards */
		--brass: #d8b36a; --brass-hi: #f4dfa8; --brass-lo: #a8853f; --brass-line: rgba(216,179,106,.38); --brass-faint: rgba(216,179,106,.14);
		--ink: #f5f1e8; --ink-2: #bccbd9; --ink-3: #8a9fb3; --ink-dark: #1b1204; --danger-hi: #ffa3a3; --foam: #cfeaf5;
		--hull: linear-gradient(180deg, rgba(17,46,75,.97), rgba(6,20,36,.98)); --brassfill: linear-gradient(180deg, #f6e2ad, #d8b36a 55%, #b98e42);
		--lit: 0 0 0 2px #f4dfa8, 0 0 14px rgba(244,223,168,.55); --shhud: 0 6px 18px rgba(0,6,14,.5); }
	.helm { position: absolute; inset: 0; zoom: var(--uis, 1); pointer-events: none; font-size: 15px; line-height: 1; letter-spacing: .02em; color: var(--ink); }
	.helm button, .cardview button, .exacts button { letter-spacing: inherit; }
	.cardview, .exacts { line-height: 1; letter-spacing: .02em; color: var(--ink); }
	.helm svg, .cvx svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

	/* ── roster chips: the enemy left of the scoreline, your team right of it (zones: layout.ts CHIPS_IN / CHIPS_W) ── */
	.roster { position: absolute; top: 8px; width: 372px; height: 56px; z-index: 7; display: flex; align-items: center; gap: 6px; }
	.roster.l { right: calc(50% + 284px); }
	.roster.r { left: calc(50% + 284px); justify-content: flex-end; }
	.rchip { position: relative; flex: 0 1 159px; min-width: 0; height: 54px; box-sizing: border-box; display: flex; align-items: center; gap: 4px; padding: 0 7px 0 2px; border-radius: 27px 12px 12px 27px;
		cursor: pointer; pointer-events: auto; background: var(--hull); border: 1px solid rgb(var(--tcr) / .65); box-shadow: var(--shhud); }
	.rchip.me { border-color: var(--brass); }
	.rchip.open { box-shadow: var(--lit); }
	.rchip:focus-visible { outline: 2px solid var(--foam); outline-offset: 2px; }
	.rchip.out :global(.picon) { filter: grayscale(1) brightness(.65); }
	.rchip .lv { position: absolute; left: 30px; bottom: 1px; width: 19px; height: 19px; border-radius: 50%; display: grid; place-items: center; font-weight: 400; font-size: 12px;
		color: var(--ink-dark); background: var(--brassfill); border: 1.5px solid #06182a; }
	.rchip .lv.ult { color: #fff; background: #8a4fd6; }
	.who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-left: 2px; }
	.who b { font-weight: 400; font-size: 16px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.who small { font-size: 12px; letter-spacing: 0; color: rgb(var(--tcl)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	/* three or more a side: the token and the card say it (the name is in the tooltip and on the board) */
	.roster.compact .who { display: none; }
	.roster.compact .rchip { flex: 0 1 88px; justify-content: space-between; }
	/* five a side (8–10 seats): everything a little smaller so five still fit the zone */
	.roster.tiny { gap: 4px; }
	.roster.tiny .rchip { padding: 0 4px 0 1px; gap: 2px; }
	.roster.tiny .rchip .lv { left: 22px; width: 17px; height: 17px; font-size: 11px; }
	/* this turn's card as a tiny card: empty · face down · face up with its initiative · defeated */
	.cst { flex: none; width: 26px; height: 37px; box-sizing: border-box; padding: 0; border-radius: 4px; display: grid; place-items: center; font-size: 16px; color: var(--ink-3); border: 1.5px dashed rgba(255,255,255,.25); background: none; }
	.cst.back { border: 0; color: var(--ink-dark); background: linear-gradient(180deg, #2c333f 0 16%, #f4efe3 16% 84%, #2c333f 84%); box-shadow: 0 0 0 1px #05101c; }
	.cst.back img { width: 18px; height: 18px; object-fit: contain; }
	.cst.up { border: 0; cursor: zoom-in; color: #fff; text-shadow: 0 1px 0 #000, 0 0 3px #000; background: var(--cc); background: linear-gradient(180deg, color-mix(in srgb, var(--cc) 92%, white), color-mix(in srgb, var(--cc) 70%, black)); box-shadow: 0 0 0 1px #05101c; }
	.cst.dead { border: 1.5px solid rgba(229,72,77,.7); color: var(--danger-hi); background: rgba(229,72,77,.14); }
	.cst.dead svg { width: 19px; height: 19px; }

	/* ── initiative rail: the revealed cards in order, under the scoreline ── */
	.rail { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); max-width: 760px; height: 48px; z-index: 9; display: flex; align-items: center; gap: 6px; }
	.ini { flex: 0 1 auto; min-width: 0; height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 12px 0 0; border-radius: 9px; overflow: hidden; white-space: nowrap; cursor: pointer; pointer-events: auto;
		font-size: 15px; color: var(--ink); background: #071a2d; border: 1px solid var(--brass-line); box-shadow: var(--shhud); }
	.ini .flag { align-self: stretch; flex: none; width: 38px; display: grid; place-items: center; padding-bottom: 4px; font-weight: 400; font-size: 23px; color: #fff; text-shadow: 0 2px 0 #000, 0 0 4px #000;
		background: var(--cc); background: linear-gradient(180deg, color-mix(in srgb, var(--cc) 92%, white), color-mix(in srgb, var(--cc) 70%, black)); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%); }
	.ini .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.ini.done { opacity: .45; box-shadow: none; }
	.ini.now { height: 46px; font-size: 18px; color: var(--brass-hi); border-color: transparent; box-shadow: var(--lit); }
	.ini.now .flag { width: 46px; font-size: 29px; }
	.rail.tight .nm { display: none; }
	.rail.tight .ini { padding-right: 6px; }

	/* ── a player's board, hanging under their chip beside the island ── */
	.dossier { position: absolute; top: 70px; width: 352px; z-index: 8; pointer-events: auto; display: flex; flex-direction: column; border-radius: 18px;
		background: var(--hull); border: 1px solid var(--brass-line); box-shadow: 0 16px 40px rgba(0,6,14,.55); animation: dosin .2s ease-out; }
	.dossier.l { left: 12px; }
	.dossier.r { right: 12px; }
	@keyframes dosin { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
	.dos-head { position: relative; flex: none; height: 88px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; padding: 0 16px 8px; border-top: 3px solid var(--tc); border-radius: 17px 17px 0 0;
		background-size: cover; background-position: 50% 26%; }
	.dos-head b { font-weight: 400; font-size: 30px; line-height: .9; color: var(--ink); text-shadow: 0 2px 6px #000; }
	.dos-head span { display: flex; align-items: center; gap: 7px; font-size: 16px; color: var(--ink); text-shadow: 0 1px 3px #000; }
	.dx, .cvx { display: grid; place-items: center; padding: 0; border-radius: 50%; color: var(--ink-2); background: rgba(3,11,21,.6); border: 1px solid rgba(255,255,255,.22); cursor: pointer; }
	.dx { position: absolute; right: 8px; top: 8px; width: 32px; height: 32px; }
	.dx svg { width: 15px; height: 15px; }
	.dos-body { display: flex; flex-direction: column; gap: 14px; padding: 12px 16px 16px; }
	.dos-row { position: relative; display: flex; align-items: center; gap: 10px; }
	.dossier .dcount.discwrap { position: static; }
	.dossier .discpop { left: 0; right: 0; bottom: auto; top: calc(100% + 8px); max-width: none; }
	.sp { flex: 1; }
	.lvbar { display: flex; gap: 3px; }
	.lvbar i { width: 22px; height: 9px; border-radius: 2px; background: rgba(255,255,255,.12); }
	.lvbar i.u { background: rgba(165,110,230,.4); }
	.lvbar i.on { background: linear-gradient(180deg, #fff3cf, #d8b36a); }
	.lvbar i.u.on { background: #b482f0; }
	.dossier .slots { display: flex; justify-content: space-between; }
	.dossier .cwell { width: 72px; height: 100px; }
	.dcount { position: relative; display: inline-flex; align-items: center; gap: 6px; font-size: 20px; color: var(--ink-3); }
	.dcount svg, .dbtn :global(svg) { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.dcount b { font-weight: 400; color: var(--ink); }
	.dbtn { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
	.dbtn:disabled { cursor: default; }
	.dmark { width: 32px; height: 32px; padding: 0; border: 0; background: none; cursor: pointer; opacity: .3; filter: grayscale(1); }
	.dmark.on { opacity: 1; filter: none; }
	.dmark img { width: 100%; height: 100%; object-fit: contain; }
	.dult { width: 36px; padding: 0; border: 0; border-radius: 4px; background: none; cursor: zoom-in; opacity: .45; filter: grayscale(.8); }
	.dult.on { opacity: 1; filter: none; box-shadow: 0 0 0 2px #b482f0; }
	.dult :global(.cardface) { display: block; width: 100%; border-radius: 4px; }
	.dos-row.removed { flex-wrap: wrap; gap: 6px; padding-top: 12px; border-top: 1px solid var(--brass-faint); }
	.dos-row.removed .rmini { width: 36px; opacity: .6; filter: grayscale(.7); }

	/* ── shared small parts ── */
	.gauges { display: flex; gap: 5px; }
	.dossier .gauges { justify-content: space-between; padding-bottom: 6px; }
	.gauge { position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(2,9,18,.6); box-shadow: inset 0 2px 5px rgba(0,0,0,.6); }
	.gauge img { width: 23px; height: 23px; object-fit: contain; opacity: .38; }
	.gauge.on { box-shadow: inset 0 2px 5px rgba(0,0,0,.6), 0 0 0 1px var(--brass); }
	.gauge.on img { opacity: 1; }
	.gauge b { position: absolute; left: 50%; top: 100%; margin-top: -6px; transform: translateX(-50%); padding: 1px 5px 0; border-radius: 8px; font-weight: 400; font-size: 12px; line-height: 14px; white-space: nowrap;
		color: var(--ink-dark); background: var(--brassfill); border: 1px solid #05101c; }
	.purse { display: inline-flex; align-items: center; gap: 3px; height: 28px; box-sizing: border-box; padding: 0 3px; border-radius: 14px; background: #06182a; border: 1px solid var(--brass-line); pointer-events: auto; }
	.pm { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; font-size: 16px; line-height: 1; color: var(--ink-2); background: rgba(255,255,255,.08); cursor: pointer; }
	.pm:hover { background: rgba(255,255,255,.18); color: var(--ink); }
	.gcoin { display: inline-grid; place-items: center; flex: none; min-width: 22px; height: 22px; box-sizing: border-box; padding: 0 4px; border-radius: 11px; font-size: 14px; color: #4a3206;
		background: radial-gradient(circle at 35% 30%, #fff1b8, #e8b64a 55%, #a87716); box-shadow: inset 0 0 0 1.5px rgba(120,80,10,.7); font-variant-numeric: tabular-nums; }
	/* a card well: turn slots, discard, deck */
	.cwell { position: relative; flex: none; display: grid; place-items: center; width: 60px; height: 84px; box-sizing: border-box; padding: 2px; border-radius: 6px; background: rgba(2,9,18,.66);
		box-shadow: inset 0 2px 6px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.13); }
	.cwell.now, .wslot.now .cwell { box-shadow: inset 0 2px 6px rgba(0,0,0,.8), var(--lit); }
	.cwell :global(.cardface) { display: block; width: 100%; border-radius: 5%; }
	/* a live effect: the card glows in its player's colour (still — no pulse) */
	.cwell.fxlit { filter: drop-shadow(0 0 2px var(--fxc)) drop-shadow(0 0 7px var(--fxc)); }

	/* ── the hand: rising from the console's top edge; the well behind it clips what is tucked ── */
	.tray.dk { --cw: 150px; position: absolute; left: 50%; bottom: 110px; width: 900px; height: 320px; margin-left: -450px; z-index: 6; overflow: hidden; display: flex; align-items: flex-end; justify-content: center; }
	.dk .hc { flex: none; width: var(--cw); margin: 0 -13px; padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; transform-origin: bottom center;
		transform: translateY(var(--y)) rotate(var(--rot)); transition: transform .18s ease-out; }
	.dk .hc :global(.cardface) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 0 0 1px #05101c; }
	.dk.spread .hc { flex: 0 1 var(--cw); min-width: 0; margin: 0 4px; }
	/* at rest only the tops show: initiative and name */
	.dk.retracted .hc, .dk.retracted .hc:hover { transform: translateY(calc(var(--cw) * 1.396 - 42px + var(--y))) rotate(var(--rot)); }
	/* raised: the card under the pointer straightens and grows to reading size */
	.dk .hc:hover { transform: translateY(-6px) scale(1.42); z-index: 5; }
	/* armed (one click): it stands clear with a brass edge, and the action button says Commit */
	.dk .hc.armed { transform: translateY(-16px); z-index: 4; }
	.dk .hc.armed:hover { transform: translateY(-6px) scale(1.42); z-index: 5; }
	.dk.retracted .hc.armed, .dk.retracted .hc.armed:hover { transform: translateY(calc(var(--cw) * 1.396 - 150px)); }
	.dk .hc.armed :global(.cardface) { box-shadow: var(--lit); }

	/* ── the console ── */
	.console { position: absolute; left: 50%; bottom: 12px; width: 1180px; height: 112px; margin-left: -590px; z-index: 7; }
	.hull { position: absolute; left: 0; right: 0; bottom: 0; height: 100px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 132px 0 136px; border-radius: 50px;
		pointer-events: auto; background: var(--hull); border: 1px solid var(--brass); box-shadow: 0 10px 28px rgba(0,6,14,.55), inset 0 1px 0 rgba(255,255,255,.1); }
	.hull .div { flex: none; width: 1px; height: 60px; background: var(--brass-faint); }
	.hull .slots { display: flex; align-items: center; gap: 8px; }
	.wslot { position: relative; flex: none; padding: 0; border: 0; background: none; cursor: pointer; }
	.wslot.pile { margin-left: 10px; }
	.wslot.pile button.well { border: 0; cursor: pointer; }
	.cwell.empty { color: var(--ink-3); }
	.cwell.empty :global(svg) { width: 24px; height: 24px; }
	.cwell .num, .tools .radbtn b, .tools .tokct { position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; box-sizing: border-box; padding: 0 4px; border-radius: 9px; display: grid; place-items: center;
		font-weight: 400; font-size: 12px; line-height: 1; color: var(--ink-dark); background: var(--brass); border: 1px solid #06182a; }
	.tools .radbtn b.nil { display: none; }
	.cwell.cback { overflow: hidden; background: linear-gradient(180deg, #2c333f 0 13%, #f4efe3 13% 87%, #2c333f 87%); box-shadow: 0 0 0 1px #05101c, 3px 3px 0 -1px #b9b09c, 3px 3px 0 0 #05101c; }
	.cwell.cback img { width: 78%; object-fit: contain; }
	/* a level-up is waiting: the deck is lit (the action button carries the pulse) */
	.wslot.deck.lvup .cwell { box-shadow: var(--lit); }
	/* your revealed card names a lingering effect: open the card to switch it on */
	.fxstar { position: absolute; right: -7px; top: -7px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 12px; line-height: 1; pointer-events: none;
		color: var(--ink-dark); background: var(--brassfill); border: 1.5px solid #06182a; }
	.dockhand { flex: none; width: 150px; height: 58px; display: flex; align-items: flex-end; justify-content: center; }
	/* tools: radius · ping · tokens · hand */
	.tools { flex: none; display: grid; grid-template-columns: repeat(2, 36px); gap: 6px; }
	.hbtn, .tools .radbtn, .tools .tokbtn { position: relative; width: 36px; height: 36px; box-sizing: border-box; padding: 0; border-radius: 50%; display: grid; place-items: center; gap: 0; cursor: pointer;
		color: var(--brass-hi); background: radial-gradient(circle at 50% 28%, #1c4469, #0a2038 72%); border: 1px solid var(--brass-line); }
	.hbtn svg, .tools .radbtn svg { width: 18px; height: 18px; }
	.hbtn.on, .tools .radbtn.on, .tools .tokbtn.on { color: var(--ink-dark); background: var(--brassfill); }
	.hbtn:hover, .tools .radbtn:hover, .tools .tokbtn:hover { border-color: var(--brass); }
	.tools .tokbtn:disabled { opacity: .45; cursor: not-allowed; }
	.tools .tokbtn img, .tools .tokbtn .ltrdisc { width: 22px; height: 22px; }
	.tools .tokglyph { width: auto; height: auto; font-size: 17px; color: inherit; }
	.tools .radpop, .tools .tokdrawer { left: 50%; margin-left: -116px; bottom: calc(100% + 14px); background: #071a2d; border-color: var(--brass-line); }
	.tools .radpop { margin-left: -98px; }
	.tools .tokdrawer { bottom: calc(100% + 56px); } /* the tokens tool is in the lower row */
	.tools .toklbl, .tools .tokhint { display: none; }
	.tools .tokfoot { justify-content: flex-end; }
	/* left: you */
	.medal { position: absolute; left: 0; bottom: 0; width: 112px; height: 112px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer; pointer-events: auto;
		background: radial-gradient(circle at 50% 35%, #173a5c, #06182a 70%); box-shadow: 0 0 0 1px var(--brass), 0 6px 18px rgba(0,0,0,.55); }
	.medal svg { position: absolute; inset: 0; width: 100%; height: 100%; stroke-width: 5; }
	.medal path { stroke: rgba(255,255,255,.2); }
	.medal path.u { stroke: rgba(165,110,230,.7); }
	.medal path.on { stroke: #f1d795; }
	.medal path.u.on { stroke: #c79bff; }
	.console > .purse { position: absolute; left: 56px; bottom: -9px; transform: translateX(-50%); }
	/* right: the one action. Brass = go; quiet = a way back; dim = waiting */
	.dact { position: absolute; right: 0; bottom: 0; width: 112px; height: 112px; }
	.order { position: relative; width: 112px; height: 112px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer; pointer-events: auto;
		background: #06182a; box-shadow: 0 0 0 1px var(--brass-line), 0 6px 18px rgba(0,0,0,.55); }
	.order:disabled { cursor: default; }
	.oface { width: 96px; height: 96px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; line-height: .96; letter-spacing: .04em; text-transform: uppercase;
		color: var(--brass-lo); background: radial-gradient(circle at 50% 30%, #173a5c, #06182a 72%); box-shadow: inset 0 0 0 1px var(--brass-faint); }
	.oface small { max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; letter-spacing: .02em; text-transform: none; color: var(--ink-2); }
	.order.quiet .oface { color: var(--brass-hi); box-shadow: inset 0 0 0 1px var(--brass-line); }
	.order.go { box-shadow: 0 0 0 1px var(--brass), 0 6px 18px rgba(0,0,0,.55), 0 0 24px rgba(244,223,168,.4); }
	.order.go .oface { color: var(--ink-dark); background: radial-gradient(circle at 50% 22%, #fff6da 0%, #f1d795 30%, #d8b36a 62%, #a8853f 100%); box-shadow: inset 0 2px 0 rgba(255,255,255,.65), inset 0 -5px 10px rgba(110,80,20,.5); }
	.order.go:hover .oface { background: radial-gradient(circle at 50% 22%, #fffaea 0%, #f6e2ad 34%, #e2c07a 66%, #b08c45 100%); }
	/* your move: one slow ring (a still glow whose opacity breathes) */
	.order.pulse::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 2px #f4dfa8, 0 0 16px rgba(244,223,168,.7); animation: orderpulse 2s ease-in-out infinite; }
	@keyframes orderpulse { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
	.oalt { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); height: 34px; padding: 0 16px; border-radius: 17px; font-size: 16px; white-space: nowrap; cursor: pointer; pointer-events: auto;
		color: var(--danger-hi); background: #2a0f16; border: 1px solid rgba(229,72,77,.7); }

	/* ── buttons of the card views ── */
	.hb { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 52px; padding: 0 26px; border-radius: 12px; font-size: 21px; line-height: 1; white-space: nowrap; cursor: pointer;
		color: var(--ink); background: rgba(255,255,255,.05); border: 1px solid var(--brass-line); }
	.hb:hover { border-color: var(--brass); }
	.hb.sm { height: 42px; padding: 0 16px; border-radius: 10px; font-size: 17px; }
	.hb.go { color: var(--ink-dark); background: var(--brassfill); border-color: #8a6a2c; }
	.hb.bad { color: var(--danger-hi); background: rgba(229,72,77,.1); border-color: rgba(229,72,77,.6); }
	.pvbar .hb.go { min-width: 240px; }
	.pvbar .hb { box-shadow: none; text-shadow: none; font-weight: 400; } /* (they keep the old `.act` class as a hook for scripts) */

	/* ── the card view (a hand card, or one from your discard) ── */
	.cardview { position: fixed; inset: 0; z-index: 31; zoom: var(--uis, 1); display: grid; place-items: center; background: rgba(3,11,21,.84); animation: curtainIn .15s ease; }
	.cv-col { display: flex; flex-direction: column; align-items: center; gap: 14px; }
	.cv-main { position: relative; }
	.cardview .pvcard { width: 380px; box-shadow: 0 0 0 1px #05101c, 0 18px 44px rgba(0,0,0,.6); }
	.cardview .pvbar { position: static; zoom: 1; gap: 12px; align-items: center; pointer-events: auto; min-height: 52px; }
	.dials { position: absolute; left: calc(100% + 48px); top: 56px; display: flex; flex-direction: column; gap: 24px; }
	.dial { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 14px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }
	.dface { position: relative; width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; font-size: 40px; letter-spacing: 0; color: var(--ink);
		background: radial-gradient(circle at 50% 30%, #16344f, #061423 75%); border: 1px solid var(--brass-hi); }
	.dface img { position: absolute; left: -10px; top: -8px; width: 38px; height: 38px; object-fit: contain; }
	.dface small { position: absolute; right: -8px; bottom: 2px; padding: 3px 7px 2px; border-radius: 10px; font-size: 14px; color: var(--ink-dark); background: var(--brassfill); border: 1px solid #05101c; }
	.pager { display: flex; align-items: flex-end; gap: 8px; height: 68px; }
	.pager button { width: 42px; padding: 0; border: 0; border-radius: 4px; background: none; cursor: pointer; opacity: .55; }
	.pager button.on { width: 48px; opacity: 1; box-shadow: var(--lit); }
	.pager :global(.cardface) { display: block; width: 100%; border-radius: 4px; }
	.cvx { position: absolute; right: 20px; top: 18px; width: 44px; height: 44px; }
	.cvx svg { width: 18px; height: 18px; }

	/* ── examine (any other card) on desktop: Tide scrim, the played card's effect row ── */
	.scrim2.desk { background: rgba(3,11,21,.84); }
	.scrim2.desk .bigcard { width: 380px; filter: none; }
	.scrim2.desk .bigcard :global(.cardface) { box-shadow: 0 0 0 1px #05101c, 0 18px 44px rgba(0,0,0,.6); }
	.scrim2.desk .bigcard.fxon :global(.cardface) { box-shadow: 0 0 0 2px var(--fxc), 0 0 26px var(--fxc), 0 18px 44px rgba(0,0,0,.6); }
	.exacts { display: flex; align-items: center; justify-content: center; gap: 10px; }
	.exacts .fxdurs { gap: 8px; }
	.exlbl { font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: var(--brass); }
	.scrim2.desk .pvnav { color: var(--brass-hi); background: rgba(3,11,21,.6); border-color: var(--brass-line); }

	/* ── the reveal on desktop: Tide colours ── */
	.curtain.desk { background: radial-gradient(120% 90% at 50% 40%, rgba(10,34,56,.93), rgba(3,11,21,.97)); }
	.curtain.desk .curtain-title { color: #f4dfa8; text-shadow: 0 2px 12px rgba(0,0,0,.7); }

	@media (prefers-reduced-motion: reduce) {
		.order.pulse::after, .dossier { animation: none; }
		.dk .hc { transition: none; }
	}

	/* ═══════════ phone layout (GameView sets `mobile` at ≤760px) ═══════════
	   top bar 44px (GameView) · player strip 72px · board · hand tips · dash 68px.
	   Every counter has a fixed width so 1- or 2-digit values never shift things. */
	.mstrip { position: absolute; top: 44px; left: 0; right: 0; height: 72px; z-index: 12; display: flex; gap: 6px; padding: 5px 8px;
		overflow-x: auto; overflow-y: hidden; scrollbar-width: none; background: rgba(9,13,22,.9); border-bottom: 1px solid rgba(255,255,255,.08); }
	.mstrip::-webkit-scrollbar { display: none; }
	.mpc { flex: none; width: 170px; height: 62px; display: grid; grid-template-columns: 30px 1fr 32px 40px; grid-template-rows: 32px 1fr; column-gap: 4px; row-gap: 2px;
		padding: 3px 5px 3px 7px; border-radius: 10px; cursor: pointer; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); box-shadow: inset 3px 0 0 var(--tc); }
	.mpic { grid-column: 1; grid-row: 1; align-self: center; display: grid; }
	.mpn { grid-column: 2; grid-row: 1; min-width: 0; align-self: center; display: flex; flex-direction: column; line-height: 1.08; }
	.mpn b, .mdid b { font-weight: normal; font-size: 12px; color: #f6ead2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mpn small { font-size: 9.5px; color: #93a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mlv { grid-column: 3; grid-row: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
	.mlv em { font-style: normal; font-size: 9px; color: #9aa8bc; white-space: nowrap; }
	.mini { width: 32px; height: 14px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 1px; font-style: normal; border-radius: 4px;
		font-size: 9.5px; color: #f6e3b4; background: rgba(199,154,78,.2); border: 1px solid rgba(214,170,92,.55); }
	.mini :global(svg) { width: 8px; height: 8px; flex: none; }
	.mini b { font-weight: normal; min-width: 1.2em; text-align: center; font-variant-numeric: tabular-nums; }
	.mini.off { opacity: .5; }
	.mcard { grid-column: 4; grid-row: 1 / 3; align-self: center; width: 40px; }
	/* this player has a lingering effect running (maybe from an earlier turn's card): the whole card glows in their colour */
	.mpc.fxon { border-color: var(--fxc); box-shadow: inset 3px 0 0 var(--tc), inset 0 0 0 1px var(--fxc), inset 0 0 14px color-mix(in srgb, var(--fxc) 50%, transparent); }
	@keyframes mpcfx {
		0%, 100% { box-shadow: inset 3px 0 0 var(--tc), inset 0 0 0 1px var(--fxc), inset 0 0 10px color-mix(in srgb, var(--fxc) 40%, transparent); }
		50% { box-shadow: inset 3px 0 0 var(--tc), inset 0 0 0 1px var(--fxc), inset 0 0 18px color-mix(in srgb, var(--fxc) 65%, transparent); }
	}
	/* stats with item-upgrade pips: detailed art, one same-size pip per upgrade (room for 3) */
	.msx { grid-column: 1 / 4; grid-row: 2; display: flex; gap: 2px; align-self: end; }
	.msx > span { position: relative; flex: 1; min-width: 0; height: 19px; display: grid; place-items: end center; padding-bottom: 1px; border-radius: 4px; background: rgba(255,255,255,.03); }
	.msx img { width: 12px; height: 12px; object-fit: contain; opacity: .38; filter: grayscale(.3); }
	.msx > span.up { background: rgba(199,154,78,.16); box-shadow: inset 0 0 0 1px rgba(214,170,92,.45); }
	.msx > span.up img { opacity: 1; filter: none; }
	.msx .pp { position: absolute; top: 2px; left: 0; right: 0; display: flex; justify-content: center; gap: 1.5px; }
	.msx .pp i { flex: none; width: 4px; height: 3px; border-radius: 1px; transform: skewX(-24deg); background: rgb(var(--tcl)); box-shadow: 0 0 3px rgb(var(--tcl)); }
	/* the compact dash */
	.mdash { position: absolute; left: 0; right: 0; bottom: 0; height: 72px; z-index: 11; display: flex; align-items: center; gap: 4px; padding: 4px 5px; color: #e5e7eb;
		background: linear-gradient(90deg, rgb(var(--tcr) / .22), rgba(9,13,22,.96) 30%); border-top: 1px solid rgb(var(--tcr) / .55); }
	.mdash.ultdash { border-top-color: rgba(165,110,230,.7); }
	.mdl { flex: none; width: 116px; display: flex; flex-direction: column; gap: 3px; }
	.mdl .msx { width: 116px; }
	.mdtop { display: flex; align-items: center; gap: 4px; min-width: 0; }
	.mdme, .mdid { padding: 0; background: none; border: none; color: inherit; cursor: pointer; text-align: left; font: inherit; }
	.mdme { flex: none; display: grid; }
	.mdid { min-width: 0; display: flex; flex-direction: column; line-height: 1.08; }
	.mdid b { font-size: 13px; }
	.mdid small { font-size: 9.5px; color: #93a3b8; white-space: nowrap; }
	.mdid em { font-style: normal; margin-left: 3px; padding: 0 3px; border-radius: 4px; font-size: 8.5px; color: #f0dcae; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.15); }
	.mmid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
	.mslots { width: 100%; display: flex; gap: 2px; justify-content: center; align-items: center; }
	.msl { position: relative; flex: none; width: 27px; }
	.msep { flex: none; width: 1px; height: 30px; margin: 0 1px; background: rgba(255,255,255,.14); }
	.mdisc { height: 36px; display: grid; place-items: center; border: 1px dashed rgba(255,255,255,.2); border-radius: 4px; }
	.mdstack { position: relative; width: 100%; padding: 0; background: none; border: none; cursor: pointer; }
	.mdstack :global(.cardface) { display: block; width: 100%; border-radius: 4px; }
	.mtrash { width: 14px; color: rgba(255,255,255,.25); display: grid; }
	.mtrash :global(svg) { width: 100%; }
	.mdeck { height: 36px; padding: 0; border-radius: 4px; cursor: pointer; display: grid; place-items: center; border: 1px solid rgba(120,95,55,.6);
		background: radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1); box-shadow: 2px 2px 0 #cbbf9f, 3px 3px 0 #b9ad8c; }
	.mdeck { position: relative; overflow: visible; }
	.mdeck img { width: 78%; max-height: 78%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
	.mdeck b { position: absolute; right: -5px; bottom: -5px; min-width: 15px; height: 15px; padding: 0 3px; box-sizing: border-box; border-radius: 8px; display: grid; place-items: center;
		font-weight: normal; font-size: 9px; line-height: 1; color: #fff; background: #1c140a; border: 1px solid #c79a4e; font-variant-numeric: tabular-nums; box-shadow: 0 1px 3px rgba(0,0,0,.6); }
	.mbtns { flex: none; display: grid; grid-template-columns: repeat(2, 36px); grid-template-rows: repeat(3, 18px); gap: 3px; }
	.mb, .mbtns .radbtn, .mbtns .tokbtn { width: 36px; height: 18px; box-sizing: border-box; padding: 0; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; gap: 1px;
		font-size: 9.5px; color: #f6e3b4; background: rgba(199,154,78,.16); border: 1px solid rgba(199,154,78,.45); cursor: pointer; }
	.mb b, .mbtns .radbtn b { font-weight: normal; min-width: 1.35em; font-size: 9.5px; text-align: center; font-variant-numeric: tabular-nums; }
	.mb :global(svg), .mbtns .radbtn svg { width: 12px; height: 12px; flex: none; }
	.mb .inicon { width: 9px; height: 9px; }
	.mbtns .tokbtn img, .mbtns .tokbtn .ltrdisc, .mbtns .tokbtn .tokglyph { width: 13px; height: 13px; font-size: 10px; }
	.mbtns .tokwrap, .mbtns .radwrap { position: relative; display: flex; align-self: auto; }
	.mb.on { background: rgba(199,154,78,.32); border-color: rgba(230,190,110,.85); color: #fff3d6; }
	.mb.off { opacity: .5; }
	.mb.undo { font-size: 13px; color: #ffe3de; background: linear-gradient(180deg, rgba(224,70,60,.55), rgba(168,38,32,.55)); border-color: rgba(255,150,140,.65); }
	.mb.undo:disabled { opacity: .32; cursor: not-allowed; }
	.mbtns .radpop, .mbtns .tokdrawer { left: auto; right: 0; bottom: calc(100% + 8px); }
	.mdisc .discpop.up { left: 50%; transform: translateX(-50%); }
	/* the action row under the slots: fixed height, so nothing moves when it fills */
	.mact { height: 22px; display: flex; align-items: center; justify-content: center; gap: 4px; }
	.mact .act { padding: 0 11px; height: 22px; font-size: .72rem; white-space: nowrap; box-shadow: none; }
	.mact .act.primary { box-shadow: 0 2px 0 #a8560f; }
	.mact .fxq { font-size: .66rem; }
	.mact .fxb { height: 22px; font-size: .68rem; }
	.mact .fxb.dur { padding: 0 6px; }
	.mact .waithost { max-width: none; white-space: nowrap; font-size: .68rem; }
	/* hand tips: fixed card size; hidden = just the tops peek above the dash */
	/* phone banner hand: a stack on the right above the dash; tucked = slid right, only the markers peek out */
	.bstack { --bw: clamp(230px, 72vw, 320px); position: absolute; right: 6px; bottom: 80px; z-index: 10; width: var(--bw); display: flex; flex-direction: column; gap: 3px;
		transition: transform .28s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 6px 14px rgba(0,0,0,.6)); }
	.bstack :global(.bn) { --bh: clamp(34px, 5.2vh, 44px); }
	/* only the banners themselves take touches — the stack's box would otherwise swallow board pans/pinches */
	.bstack { pointer-events: none; }
	.bwrap { pointer-events: auto; transition: transform .26s cubic-bezier(.2,.8,.2,1); }
	.bwrap.tucked { transform: translateX(calc(var(--bw) - clamp(34px, 5.2vh, 44px) * 1.4 + 4px)); }
	.bsgap { height: 4px; }
	.tray.mob { --cw: 62px; left: 0; right: 0; bottom: 72px; justify-content: center; }
	.tray.mob.retracted { transform: translateY(calc(var(--cw) * 1.396 - 30px)); clip-path: inset(-800px -800px calc(var(--cw) * 1.396 - 30px) -800px); }

	/* phone-size overlays: preview, boards, deck, reveal */
	@media (max-width: 760px) {
		.pvwrap { inset: 116px 0 150px 0 !important; }
		.pvcard { width: min(62vw, 250px); }
		.pvbar { left: 0 !important; right: 0 !important; bottom: 110px !important; zoom: 1; }
		.modal, .modal.board, .deckmodal { width: 97vw; max-height: 88vh; padding: 10px; }
		.turns { gap: 4px; }
		.tbox { padding: 5px 4px 6px; border-radius: 10px; }
		.dkgrid { grid-template-columns: repeat(3, 1fr); }
		.bigcard { width: min(78vw, 320px); }
		.exrow.multi .bigcard { width: min(68vw, 300px); }
		.exrow .pvnav { width: 30px; height: 56px; margin: 0 5px; font-size: 24px; }
	}
</style>
