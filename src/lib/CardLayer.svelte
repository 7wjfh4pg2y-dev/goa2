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
	import { heroCards, heroName, heroStat } from '$lib/cards/deck';
	import { heroAvatar, heroLogo } from '$lib/heroes';
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
	// what the helm is showing, for GameView's half of the screen (it binds these): the initiative rail, and how
	// far down each open player board reaches, in design px (0 = closed) — its prompts, toolbar, log and view
	// controls keep clear of them
	export let railOn = false;
	export let boardL = 0;
	export let boardR = 0;
	// the deck is open and hides the board: GameView rests the sea and the minion rims under it
	export let covered = false;

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
	// team hue as CSS vars: --tc hex, --tcr base rgb, --tcl light rgb (for highlights)
	const TEAM_VARS: Record<'orange' | 'blue', string> = {
		orange: '--tc:#ef7d22; --tcr:239 125 34; --tcl:255 196 140;',
		blue: '--tc:#2f7fe6; --tcr:47 127 230; --tcl:165 205 255;'
	};
	const teamVars = (t: string | null | undefined) => TEAM_VARS[t === 'blue' ? 'blue' : 'orange'];
	$: pTeam = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'blue' ? 'blue' : 'orange');
	// trash-can glyph for discard piles (drawn faint, like the turn numerals)
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
	function openForced() {
		if (!(levelPhase && mine && mustLevel(mine))) return;
		deckOpen = true;
		// phone: open on the first colour that has a card to take
		const first = GRID_COLORS.find((c) => colCards(mine!.hero, c).flat().some((i) => i >= 0 && canTakeNow(mine!, i)));
		if (first) deckCol = first as DeckCol;
	}
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
	$: canCommit = !!mine && !myReady && !revealed && !battlePhase && !spawnWaiting.length && !$ms.wonBy; // no playing cards between the battle and the next round, before every hero is on the board, or once the game is won
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
	// the log's effects list (desktop) / the menu's (phone) opens a card through here
	export function showCard(hid: string, idx: number, pid?: string, list?: ExCard[]) { examine = { hid, idx, pid, list }; }

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
	let deckSel: number | null = null; // card being managed (selected in the deck view)
	const GRID_COLORS = ['RED', 'BLUE', 'GREEN'];
	function findCard(hero: string, color: string, level: number, first: number): number {
		return heroCards(hero).findIndex(
			(c) => c.color === color && (c.level ?? 1) === level && (c.variant?.first ?? 1) === first
		);
	}
	// ── phone deck: one colour at a time — its five cards, Tier III on top, drawn by state (lit = in hand,
	// upside down with "+1" = your item, grey = removed, gold = a legal pick now); then Basics and the Ultimate
	type DeckCol = 'RED' | 'BLUE' | 'GREEN' | 'BASIC' | 'ULT';
	const DECK_TABS: Array<[DeckCol, string, string]> = [['RED', 'Red', '#e0524a'], ['BLUE', 'Blue', '#3f7fe0'], ['GREEN', 'Green', '#41ae59'], ['BASIC', 'Basics', '#d8b36a'], ['ULT', 'Ultimate', '#a56ee6']];
	let deckCol: DeckCol = 'RED';
	const colCards = (hero: string, color: string) => [[findCard(hero, color, 3, 1), findCard(hero, color, 3, 2)], [findCard(hero, color, 2, 1), findCard(hero, color, 2, 2)], [findCard(hero, color, 1, 1)]];
	const isBasic = (hero: string, idx: number) => ['GOLD', 'SILVER'].includes(heroCards(hero)[idx]?.color);
	$: basics = mine ? heroCards(mine.hero).map((_, i) => i).filter((i) => isBasic(mine!.hero, i)) : [];
	// which zone a card index is in for this player (null = still in the draw deck)
	function zoneOf(cs: PlayerCardState, idx: number): CardZone | null {
		if (cs.hand.includes(idx)) return 'hand';
		if (cs.upgrade.includes(idx)) return 'upgrade';
		if (cs.removed.includes(idx)) return 'removed';
		return null; // in the deck
	}
	// how a deck card is drawn: its zone, or — still in the deck — a pick you can take now, the next legal pick, or far
	const dstate = (cs: PlayerCardState, idx: number) => zoneOf(cs, idx) ?? (cs.pending === idx || cs.turns.includes(idx) || cs.discard.includes(idx) ? 'hand' : canTakeNow(cs, idx) ? 'pick' : canPick(cs, idx) ? 'next' : 'deck');
	function moveTo(idx: number, to: CardZone) {
		if (mine && idx >= 0) session.cardAction({ kind: 'cardmove', pid: clientId, idx, to });
		deckSel = null;
	}
	function statIcon(itemName: string | undefined) {
		const map: Record<string, string> = { ATTACK: 'item_attack', DEFENSE: 'item_defense', INITIATIVE: 'item_initiative', MOVEMENT: 'item_movement', RANGE: 'item_range', AREA: 'item_area' };
		return itemName ? icon(map[itemName]) : undefined;
	}
	// the ultimate (PURPLE) card — shown separately, unlocked at level 8 (ready = level 7, all three Tier III and the coins)
	$: myUlt = mine ? ultimateIndex(mine.hero) : -1;
	$: ultReady = !!mine && myUlt >= 0 && !mine.ultimate && allowedMoves(mine, myUlt).includes('hand');
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
	// phone hand tool: a tap cycles fanned cards → spread cards → banners → fanned …; a long press (or right-click) keeps the hand up
	function cycleHandStyle() {
		if (handHeld) { handHeld = false; return; } // the long press already did its thing
		if (bannerHand) { bannerHand = false; spreadHand = false; }
		else if (spreadHand) { bannerHand = true; spreadHand = false; }
		else spreadHand = true;
		writePref(PREF_BANNERS, bannerHand); writePref(PREF_SPREAD, spreadHand); handUp = false; bannerOpen = null; armed = null;
	}
	let handHold: ReturnType<typeof setTimeout> | null = null, handHeld = false;
	function handPress(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		if (handHold) clearTimeout(handHold);
		handHold = setTimeout(() => { handHold = null; handHeld = true; toggleRetract(); }, 480);
	}
	function handRelease() { if (handHold) { clearTimeout(handHold); handHold = null; } }
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
	// tapping anywhere outside the hand tucks it away again
	function onWindowDown(e: PointerEvent) {
		const t = e.target as Element | null;
		if (handUp && !t?.closest?.('.tray')) handUp = false;
		if (bannerOpen != null && !t?.closest?.('.bstack, .cardview, .scrim2')) bannerOpen = null;
		if (discOpen && !t?.closest?.('.discwrap')) discOpen = null;
		// token shelf: close on any outside click — except the click that drops a held token
		if (radiusOpen && !t?.closest?.('.radwrap')) radiusOpen = false;
		if (tokenDrawer && !t?.closest?.('.tokwrap') && !(holdingToken && t?.closest?.('.board-wrap, .prompt'))) tokenDrawer = false;
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
	// a board is a fixed design: 70 from the top, DOS_H tall, DOS_REM more once it has a row of removed cards
	const DOS_TOP = 70, DOS_H = 378, DOS_REM = 78;
	const boardEnd = (pid: string | null, cs: PlayerCardState | undefined) => (pid && cs ? DOS_TOP + DOS_H + (cs.removed.length ? DOS_REM : 0) : 0);
	$: railOn = rail.length > 0;
	$: covered = deckOpen && !!mine;
	$: boardL = mobile ? 0 : boardEnd(dosL, dosL ? viewCards[dosL] : undefined);
	$: boardR = mobile ? 0 : boardEnd(dosR, dosR ? viewCards[dosR] : undefined);
	// Escape (desktop): the card on top closes first, then the armed card and the boards (the deck has its own keys)
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || mobile || deckOpen) return;
		if (examine) examine = null;
		else if (selected != null) closePreview();
		else { armed = null; dosL = dosR = null; }
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
		if ($ms.wonBy) order = { label: 'Game over', kind: 'off' }; // nothing left to do (the prompt line names the winner)
		else if (iCanRespawn) order = { label: 'Respawn', kind: 'go', pulse: true, run: onRespawn };
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
{#if $ms.cards}
	<!-- ───────── phone: a player's board, the dossier as a bottom sheet (desktop: it drops from their chip) ───────── -->
	{#if mobile && overlayId && ovPlayer && viewCards[overlayId]}
		<div class="scrim ph" on:click={() => (overlayId = null)} on:keydown={(e) => e.key === 'Escape' && (overlayId = null)} role="presentation">
			<div class="sheetwrap" on:click|stopPropagation on:keydown|stopPropagation role="presentation">{@render dossier(overlayId, 'ph')}</div>
		</div>
	{/if}

	<!-- ───────── examine one card ───────── -->
	{#if examine}
		<div class="scrim2" class:desk={!mobile} class:ph={mobile} style={mobile ? '' : dashVars} on:click={() => (examine = null)} on:keydown={(e) => e.key === 'Escape' && (examine = null)} role="presentation">
			<div class="bigwrap" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
				<div class="exrow" class:multi={!!exList}>
					{#if exList}<button class="pvnav prev" on:click={() => stepExamine(-1)} aria-label="Previous card">‹</button>{/if}
					<div class="bigcard" class:fxon={!!examineFx} style="--fxc:{examine.pid ? colorOf(examine.pid) : '#fde047'}"
						on:pointerdown={(e) => (exSwipeX = e.clientX)} on:pointerup={exSwipeEnd} on:pointercancel={() => (exSwipeX = null)} role="presentation"><Card heroId={examine.hid} card={heroCards(examine.hid)[examine.idx]} /></div>
					{#if exList}<button class="pvnav next" on:click={() => stepExamine(1)} aria-label="Next card">›</button>{/if}
				</div>
				{#if exList}<span class="exdots">{#each exList as c, i (i)}<i class:on={i === exPos}></i>{/each}</span>{/if}
				{#if examine.pid && (canFx || examineFx)}
					<!-- a played card: switch its effect on (pick how long — ★ = named in the card text), end it, or discard the card -->
					<div class="exacts">
						{#if examineFx}
							<span class="exlbl on">{fxLabel(examineFx)}</span>
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

	<!-- ───────── phone deck: one colour at a time, its five cards drawn by state; Basics; the Ultimate ───────── -->
	{#if deckOpen && mine && mobile}
		{@const dh = mine.hero}
		<div class="p-sheet deck" style={teamVars(myTeam)} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
			<div class="p-head">
				<PlayerIcon hero={dh} team={myTeam ?? 'orange'} color={colorHex(myColor)} size="34px" ring={2.5} />
				<span class="lvbar">{#each Array(8) as _, k (k)}<i class:on={k < levelOf(mine)} class:u={k === 7}></i>{/each}</span>
				<span class="gcoin">{mine.coins}</span>
				<button class="dx" on:click={() => { deckOpen = false; deckSel = null; }} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
			</div>
			<div class="p-tabs" role="tablist">
				{#each DECK_TABS as [k, lbl, c] (k)}
					<button class="p-tab" class:is-on={deckCol === k} class:has-pick={k !== 'BASIC' && k !== 'ULT' && colCards(dh, k).flat().some((i) => i >= 0 && canTakeNow(mine!, i))} style="--cc:{c}" role="tab" aria-selected={deckCol === k} on:click={() => { deckCol = k; deckSel = null; }}>{lbl}</button>
				{/each}
			</div>
			<div class="p-col" style="--cc:{DECK_TABS.find(([k]) => k === deckCol)?.[2]}">
				{#if deckCol === 'BASIC'}
					<div class="p-tier">{#each basics as i (i)}<button class="ac" on:click={() => examineCard(dh, i)}><Card heroId={dh} card={heroCards(dh)[i]} /></button>{/each}</div>
				{:else if deckCol === 'ULT'}
					{#if myUlt >= 0}
						{@const um = allowedMoves(mine, myUlt)}
						<div class="p-tier ult" class:on={mine.ultimate}>
							<button class="ac big" on:click={() => examineCard(dh, myUlt)}><Card heroId={dh} card={heroCards(dh)[myUlt]} /></button>
							{#if mine.ultimate && um.includes('deck')}<button class="hb sm" on:click={() => moveTo(myUlt, 'deck')}>Undo</button>
							{:else if um.includes('hand')}<button class="hb go" on:click={() => (lvConfirm = { kind: 'take', idx: myUlt })}>Unlock <i class="coin"></i>{levelCost(7)}</button>{/if}
						</div>
					{/if}
				{:else}
					{#each colCards(dh, deckCol) as row, ri (ri)}
						<div class="p-tier"><i class="tn">{['III', 'II', 'I'][ri]}</i>{#each row as idx (idx)}{@render dcard(idx)}{/each}</div>
					{/each}
				{/if}
			</div>
			{#if deckSel != null}
				{@const ok = allowedMoves(mine, deckSel)}
				{@const tw = twinOf(dh, deckSel)}
				<div class="p-act">
					<span class="p-sel">{heroCards(dh)[deckSel]?.name}</span>
					<button class="hb sm" on:click={() => examineCard(dh, deckSel!)}>Read</button>
					{#if canTakeNow(mine, deckSel)}
						<button class="hb sm go" on:click={() => (lvConfirm = { kind: 'take', idx: deckSel! })}>Take{#if tw >= 0 && heroCards(dh)[tw]?.item}<img src={statIcon(heroCards(dh)[tw]?.item)} alt="" />+1{/if}</button>
					{:else if levelPhase && swapSource(mine, deckSel) != null}
						<button class="hb sm go" on:click={() => (lvConfirm = { kind: 'swap', idx: deckSel! })}>Swap</button>
					{:else}
						{#if ok.includes('hand')}<button class="hb sm go" on:click={() => moveTo(deckSel!, 'hand')}>Hand</button>{/if}
						{#if ok.includes('upgrade')}<button class="hb sm" on:click={() => moveTo(deckSel!, 'upgrade')}>Upgrade</button>{/if}
						{#if ok.includes('deck')}<button class="hb sm" on:click={() => moveTo(deckSel!, 'deck')}>Deck</button>{/if}
						{#if ok.includes('removed')}<button class="hb sm bad" on:click={() => moveTo(deckSel!, 'removed')}>Remove</button>{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#snippet dcard(idx: number)}
		{#if mine && idx >= 0}
			{@const z = dstate(mine, idx)}
			{@const it = z === 'upgrade' ? statIcon(heroCards(mine.hero)[idx]?.item) : undefined}
			<button class="ac is-{z}" class:sel={deckSel === idx} on:click={() => (deckSel = deckSel === idx ? null : idx)} on:dblclick={() => mine && examineCard(mine.hero, idx)}>
				<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
				{#if it}<span class="ib"><img src={it} alt="" />+1</span>{/if}
			</button>
		{/if}
	{/snippet}
	{#if lvConfirm && mine && mobile}
		<div class="lvwrap"><LevelConfirm cs={mine} bind:idx={lvConfirm.idx} kind={lvConfirm.kind} teamStyle={teamVars(myTeam)} onConfirm={confirmLevel} onCancel={() => (lvConfirm = null)} /></div>
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

	<!-- ───────── phone card view: the card, the values your items raise, Discard · Commit (or Recover) ───────── -->
	{#if mine && selected != null && mobile}
		{@const pc = heroCards(mine.hero)[selected]}
		<div class="cardview ph" on:click={closePreview} role="presentation">
			<div class="cv-col" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="pvcard" on:pointerdown={swipeStart} on:pointerup={swipeEnd} on:pointercancel={() => (swipeX = null)} role="presentation">
					<div class="pvflip" class:up={committing}>
						<div class="pvface front"><Card heroId={mine.hero} card={pc} /></div>
						<div class="pvface back">
							<span class="cb-band top"></span><span class="emblem sym"><img src={heroLogo(mine.hero)} alt="" /></span><span class="cb-band bot"></span>
						</div>
					</div>
				</div>
				{#if pvList.length > 1}<span class="pager dots">{#each pvList as c (c)}<i class:on={c === selected}></i>{/each}</span>{/if}
				{#if previewSrc === 'hand' && pvDials.length}
					<div class="dials">
						{#each pvDials as d}
							<span class="dial"><span class="dface"><img src={d.img} alt="" />{d.v}<small>+{d.up}</small></span>{d.label}</span>
						{/each}
					</div>
				{/if}
			</div>
			<div class="pvbar" on:click|stopPropagation on:keydown|stopPropagation role="presentation">
				{#if previewSrc === 'discard'}
					<button class="hb go act tohand" on:click={() => pullBack(selected!)}>Recover</button>
				{:else}
					{#if mine.hand.includes(selected)}<button class="hb bad act discard" on:click={() => defend(selected!)}>Discard</button>{/if}
					{#if canCommit}<button class="hb go act tohand" on:click={() => commit(selected!)}>Commit</button>{/if}
				{/if}
			</div>
			<button class="cvx" on:click={closePreview} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
		</div>
	{/if}

	<!-- ═════════ phone: the roster row under the top bar, the hand, and the two-row bottom bar ═════════
	     The same helm, laid out in real px: chips (enemy left, your team right, you last) · the hand rising from
	     the bar (fan / side by side / banners; a tap arms a card, the brass button commits) · medal + coins,
	     the six gauges, the wells · the tools and the ONE action button. -->
	{#if mobile}
	<div class="helm ph">
		<div class="p-roster">
			{@render roster('l', chipsL)}
			<i class="mid"></i>
			{@render roster('r', chipsR)}
		</div>
		{#if rail.length}
			<div class="rail ph" class:tight={rail.length > 5}>
				{#each rail as r, i (r.p.id)}
					<button class="ini" class:done={i < railPos || !!$ms.defeated?.[r.p.id]} class:now={i === railPos} style="--cc:{r.c}" aria-label="{heroCards(r.hero)[r.idx]?.name} · {r.p.name}"
						on:click={() => (i === railPos ? (examine = { hid: r.hero, idx: r.idx, pid: r.p.id }) : (railId = r.p.id))}>
						<b class="flag">{r.n}</b>
						<PlayerIcon hero={r.hero} team={pTeam(r.p)} color={colorHex(r.p.color)} size="22px" ring={2} />
					</button>
				{/each}
			</div>
		{/if}
		{#if mine}
			{#if $ms.wonBy}
				<!-- the game is over: no hand -->
			{:else if bannerHand}
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
						<button class="hc" class:armed={armed === idx} style="--rot:{spreadHand ? 0 : f.rot}deg; --y:{spreadHand ? 0 : f.y}px" on:click={() => deskCardClick(idx)}>
							<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
						</button>
					{/each}
				</div>
			{/if}
			<div class="p-bar" style={teamVars(myTeam)}>
				<div class="rowa">
					<button class="p-medal" on:click={() => openBoard(clientId)} aria-label="Your board">
						<svg viewBox="0 0 112 112" aria-hidden="true">{#each RING as d, i (i)}<path {d} class:on={i < levelOf(mine)} class:u={i === 7} class:rdy={i === 7 && ultReady} />{/each}</svg>
						<PlayerIcon hero={mine.hero} team={myTeam ?? 'orange'} color={colorHex(myColor)} size="36px" ring={3} />
						<span class="gcoin">{mine.coins}</span>
					</button>
					{@render gauges(mine)}
					{@render wells()}
				</div>
				<div class="rowb">
					<div class="tools ph">
						{@render radiusCtl()}
						<button class="hbtn pingbtn" class:on={pingArmed} on:click={onPing} aria-label="Ping">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg>
						</button>
						{@render tokenCtl()}
						<button class="hbtn" class:on={!autoRetract} on:click={cycleHandStyle} on:pointerdown={handPress} on:pointerup={handRelease} on:pointercancel={handRelease} on:pointerleave={handRelease}
							on:contextmenu|preventDefault={toggleRetract} aria-label="Hand: {bannerHand ? 'banners' : spreadHand ? 'side by side' : 'fan'}">
							<svg viewBox="0 0 24 24" aria-hidden="true">
								{#if bannerHand}
									<path d="M3 4.5h18v4H3zM3 10h18v4H3zM3 15.5h18v4H3z" />
								{:else if spreadHand}
									<rect x="2.5" y="6" width="5.6" height="12" rx="1.2" /><rect x="9.2" y="6" width="5.6" height="12" rx="1.2" /><rect x="15.9" y="6" width="5.6" height="12" rx="1.2" />
								{:else}
									<rect x="3.5" y="7" width="8" height="12" rx="1.5" transform="rotate(-12 7.5 13)" /><rect x="11.5" y="6" width="8" height="12" rx="1.5" transform="rotate(10 15.5 12)" />
								{/if}
							</svg>
						</button>
					</div>
					{#if iDefending}<button class="oalt" on:click={() => answerAttack('defeated')}>Defeated</button>{/if}
					<button class="p-go {order.kind} {order.hook ?? ''}" class:pulse={order.pulse} disabled={!order.run} on:click={() => order.run?.()}>
						{order.label}{#if order.sub}<small>{order.sub}</small>{/if}
					</button>
				</div>
			</div>
		{/if}
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
			<!-- the hand rises from the console's top edge (unless it is docked as ribbons; none once the game is won) -->
			{#if !dockHand && !$ms.wonBy}
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
					{@render wells()}
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
				<div class="rchip" class:me={p.id === clientId} class:open={dosL === p.id || dosR === p.id || overlayId === p.id} class:out={!!$ms.defeated?.[p.id]} style={teamVars(pTeam(p))} role="button" tabindex="0"
					title="{p.name}{cs ? ` · ${heroName(cs.hero)}` : ''}" on:click={() => openBoard(p.id)} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openBoard(p.id)}>
					<PlayerIcon hero={cs?.hero ?? ''} team={pTeam(p)} color={colorHex(p.color)} size={mobile ? '30px' : list.length > 4 ? '31px' : '38px'} ring={mobile ? 2 : 2.5} />
					{#if cs}<b class="lv" class:ult={cs.ultimate}>{levelOf(cs)}</b>{/if}
					<!-- phone: the level and the coins under the name (the hero is on the token; the board has the rest) -->
					<span class="who"><b>{p.name}</b>{#if mobile && cs}<small class:ult={cs.ultimate}>Lv {levelOf(cs)}<i class="gcoin">{cs.coins}</i></small>{:else}<small>{cs ? heroName(cs.hero) : ''}</small>{/if}</span>
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

	<!-- this round's four turns as card wells, then the discard and the deck (the console and the phone bar) -->
	{#snippet wells()}
		{#if mine}
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
		{/if}
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
	{#snippet dossier(pid: string, side: 'l' | 'r' | 'ph')}
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
					<button class="dx" on:click={() => (side === 'l' ? (dosL = null) : side === 'r' ? (dosR = null) : (overlayId = null))} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
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
			</div>
		</div>
	{/if}
{/if}

<style>
	/* overlay */
	.scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3,6,12,.62); }
	/* discard: the same footprint as a turn slot; a slightly fanned stack */
	.discwrap { position: relative; }
	/* fanned-out discard (hover / tap) — click a card to preview it */
	.discpop { position: absolute; z-index: 30; right: 0; bottom: calc(100% + 10px); display: flex; gap: 6px; padding: 8px; max-width: min(760px, 92vw); overflow-x: auto;
		border-radius: 12px; background: rgba(9,13,22,.95); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 14px 36px rgba(0,0,0,.6); animation: popin .16s ease; }
	.discpop.up { right: auto; left: 50%; transform: translateX(-50%); animation: popinc .16s ease; }
	@keyframes popin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes popinc { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translateX(-50%); } }
	.dpc { flex: none; width: 76px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 6%; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.55); transition: transform .12s; }
	.dpc :global(.cardface) { display: block; width: 100%; }
	.dpc:hover { transform: translateY(-4px); }
	.rmini { width: 44px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; opacity: .85; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.rmini :global(.cardface) { display: block; width: 100%; }
	.rmini:hover { opacity: 1; outline: 2px solid rgba(199,154,78,.6); }
	/* a script hook on the card view's Commit (its look comes from .hb.go) */
	.act.tohand { background: var(--tc, #ef7d22); color: #fff; border-color: transparent; box-shadow: 0 3px 0 rgb(var(--tcr, 239 125 34) / .55); text-shadow: 0 1px 1px rgba(0,0,0,.35); }

	.lvwrap { position: fixed; inset: 0; z-index: 45; }

	/* synced pre-reveal countdown — big number, doesn't block the hand/take-back */
	.countdown { position: fixed; inset: 0; z-index: 57; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; pointer-events: none; }
	.cd-num { font-family: 'Modesto Poster', serif; font-size: 9rem; line-height: .9; color: #f6ead2;
		text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 46px rgba(239,180,106,.55); animation: cdpop .9s ease forwards; }
	@keyframes cdpop { 0% { opacity: 0; transform: scale(1.5); } 22% { opacity: 1; transform: scale(1); } 100% { opacity: .5; transform: scale(.9); } }
	.countdown::before { content: ''; position: absolute; left: 50%; top: 50%; width: 560px; height: 420px; transform: translate(-50%, -50%); z-index: -1;
		background: radial-gradient(closest-side, rgba(4,6,12,.62), rgba(4,6,12,0)); pointer-events: none; }
	.cd-num.go { font-size: 5.5rem; color: #ffe2a8; text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 50px rgba(255,190,90,.7); }

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

	.act { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; border-radius: 8px; padding: 6px 14px; font-weight: 700; cursor: pointer; font-size: .82rem; }

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
	.rail { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); max-width: 696px; /* between two open player boards */ height: 48px; z-index: 9; display: flex; align-items: center; gap: 6px; }
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
	.dos-row { position: relative; display: flex; align-items: center; gap: 10px; min-height: 28px; }
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


	/* ═══════════ PHONE (GameView sets `mobile` at ≤ 760 px) ═══════════
	   The helm in real px: the roster row under the top bar (48px), the hand rising from a two-row bottom bar
	   (124px), the board between them. Same materials as the desktop helm; nothing animates at rest but the
	   action button's ring (opacity) and the deck well's lit edge. */
	.helm.ph, .p-sheet, .scrim.ph, .scrim2.ph {
		--brass: #d8b36a; --brass-hi: #f4dfa8; --brass-lo: #a8853f; --brass-line: rgba(216,179,106,.38); --brass-faint: rgba(216,179,106,.14);
		--ink: #f5f1e8; --ink-2: #bccbd9; --ink-3: #8a9fb3; --ink-dark: #1b1204; --danger-hi: #ffa3a3; --foam: #cfeaf5;
		--hull: linear-gradient(180deg, rgba(17,46,75,.97), rgba(6,20,36,.98)); --brassfill: linear-gradient(180deg, #f6e2ad, #d8b36a 55%, #b98e42);
		--lit: 0 0 0 2px #f4dfa8, 0 0 14px rgba(244,223,168,.55); --shhud: 0 6px 18px rgba(0,6,14,.5); }
	.helm.ph { zoom: 1; font-size: 14px; }
	.p-sheet, .scrim.ph, .scrim2.ph { line-height: 1; letter-spacing: .02em; color: var(--ink); }
	.p-sheet svg, .scrim.ph svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

	/* ── the roster row: every player as a chip — the enemy left, your team right, you last ── */
	.p-roster { position: absolute; left: 0; right: 0; top: 48px; z-index: 6; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 4px; padding: 0 5px;
		pointer-events: auto; background: var(--hull); border-bottom: 1px solid var(--brass-line); box-shadow: var(--shhud); }
	.p-roster .mid { flex: none; width: 1px; height: 22px; background: var(--brass-line); }
	.p-roster .roster { position: static; flex: 1; min-width: 0; width: auto; height: auto; gap: 4px; justify-content: flex-start; }
	.p-roster .rchip { flex: 1 1 0; height: 38px; padding: 0 4px 0 1px; gap: 5px; border-radius: 19px 9px 9px 19px; }
	.p-roster .rchip .lv { display: none; }
	.p-roster .rchip :global(.picon) { margin: 2px; }
	.p-roster .who { gap: 3px; padding-left: 0; }
	.p-roster .who b { font-size: 12.5px; }
	.p-roster .who small { display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--ink-2); }
	.p-roster .who small.ult { color: #c79bff; }
	.p-roster .who small .gcoin { min-width: 15px; height: 15px; padding: 0 3px; font-size: 11px; border-radius: 8px; }
	.p-roster .cst { position: absolute; left: 22px; bottom: 1px; width: 15px; height: 21px; font-size: 12px; border-radius: 3px; background: rgba(2,11,22,.85); }
	.p-roster .cst:not(.back):not(.up):not(.dead):empty { display: none; }
	.p-roster .cst.back img { width: 11px; height: 11px; }
	.p-roster .cst.dead svg { width: 13px; height: 13px; }
	/* three or more a side: the token and the card say it (the board has the name) */
	.p-roster .roster.compact .who { display: none; }
	.p-roster .roster.compact .rchip { flex: 1 1 0; justify-content: space-between; }
	.p-roster .roster.tiny .rchip { padding: 0 2px 0 1px; gap: 1px; }

	/* ── the initiative rail under the roster row: flag + token, the acting one lit ── */
	.rail.ph { top: 98px; left: 6px; right: 6px; max-width: none; transform: none; height: 42px; gap: 4px; justify-content: center; }
	.rail.ph .ini { flex: 0 1 auto; height: 34px; padding: 0 4px 0 0; gap: 3px; font-size: 14px; }
	.rail.ph .ini .flag { width: 30px; font-size: 19px; padding-bottom: 3px; }
	.rail.ph .ini.now { height: 40px; }
	.rail.ph .ini.now .flag { width: 36px; font-size: 24px; }

	/* ── the hand: fan / side by side, rising from the bar; a tap arms a card ── */
	.tray.mob { --cw: min(90px, 22vw); position: absolute; left: 0; right: 0; bottom: 124px; height: calc(var(--cw) * 1.396 + 46px); z-index: 5; overflow: hidden;
		display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
	.mob .hc { flex: none; width: var(--cw); margin: 0 calc(var(--cw) * -0.14); padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; transform-origin: bottom center;
		transform: translateY(var(--y)) rotate(var(--rot)); transition: transform .18s ease-out; }
	.mob .hc :global(.cardface) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 0 0 1px #05101c, 0 6px 16px rgba(0,0,0,.55); }
	.mob.spread .hc { flex: 0 1 var(--cw); min-width: 0; margin: 0 3px; }
	/* at rest only the tops show: initiative and name */
	.mob.retracted .hc { transform: translateY(calc(var(--cw) * 1.396 - 36px + var(--y))) rotate(var(--rot)); }
	/* armed: it stands clear with a brass edge, and the bar's button says Commit */
	.mob .hc.armed { transform: translateY(-22px); z-index: 4; }
	.mob.retracted .hc.armed { transform: translateY(calc(var(--cw) * 1.396 - 92px)); }
	.mob .hc.armed :global(.cardface) { box-shadow: var(--lit); }
	/* banners: a stack on the right above the bar; tucked = slid right, only the markers peek out */
	.bstack { --bw: clamp(230px, 72vw, 320px); position: absolute; right: 6px; bottom: 132px; z-index: 5; width: var(--bw); display: flex; flex-direction: column; gap: 3px; pointer-events: none; }
	.bstack :global(.bn) { --bh: clamp(34px, 5.2vh, 44px); }
	.bwrap { pointer-events: auto; transition: transform .26s cubic-bezier(.2,.8,.2,1); }
	.bwrap.tucked { transform: translateX(calc(var(--bw) - clamp(34px, 5.2vh, 44px) * 1.4 + 4px)); }
	.bsgap { height: 4px; }

	/* ── the bottom bar: medal + coins · gauges · wells / tools · the ONE action ── */
	.p-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 7; height: 124px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
		pointer-events: auto; background: var(--hull); border-top: 1px solid var(--brass); box-shadow: 0 -10px 26px rgba(0,6,14,.55); }
	.p-bar .rowa, .p-bar .rowb { display: flex; align-items: center; gap: 6px; }
	.p-bar .rowa { height: 56px; }
	.p-bar .rowb { height: 42px; }
	.p-medal { position: relative; flex: none; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
		background: radial-gradient(circle at 50% 35%, #173a5c, #06182a 70%); box-shadow: 0 0 0 1px var(--brass-line); }
	.p-medal svg { position: absolute; inset: 0; width: 100%; height: 100%; stroke-width: 6; }
	.p-medal path { stroke: rgba(255,255,255,.2); }
	.p-medal path.u { stroke: rgba(165,110,230,.7); }
	.p-medal path.on { stroke: #f1d795; }
	.p-medal path.u.on { stroke: #c79bff; }
	.p-medal path.rdy { stroke: #f4dfa8; }
	.p-medal .gcoin { position: absolute; right: -6px; bottom: -3px; min-width: 22px; height: 22px; font-size: 13px; box-shadow: inset 0 0 0 1.5px rgba(120,80,10,.7), 0 0 0 1.5px #05101c; }
	.p-bar .gauges { flex: none; display: grid; grid-template-columns: repeat(3, 22px); gap: 3px; }
	.p-bar .gauge { width: 22px; height: 22px; }
	.p-bar .gauge img { width: 15px; height: 15px; }
	.p-bar .gauge b { top: auto; bottom: -5px; left: auto; right: -5px; transform: none; margin: 0; padding: 0 3px; font-size: 10px; line-height: 12px; }
	.p-bar .slots { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
	.p-bar .slots .cwell { width: 34px; height: 48px; border-radius: 5px; }
	.p-bar .slots .wslot.pile { margin-left: 3px; }
	.p-bar .slots .cwell.empty :global(svg) { width: 18px; height: 18px; }
	.p-bar .slots .cwell .num { right: -5px; top: -5px; min-width: 16px; height: 16px; font-size: 11px; }
	.p-bar .fxstar { right: -6px; top: -6px; width: 17px; height: 17px; font-size: 11px; }
	.p-bar .slots .discpop.up { bottom: calc(100% + 14px); }
	/* tools: radius · ping · tokens · hand (tap = fan → side by side → banners · hold = keep it up) */
	.tools.ph { display: flex; gap: 6px; }
	.tools.ph .hbtn, .tools.ph .radbtn, .tools.ph .tokbtn { width: 42px; height: 42px; }
	.tools.ph .hbtn svg, .tools.ph .radbtn svg { width: 20px; height: 20px; }
	.tools.ph .radpop, .tools.ph .tokdrawer { left: 0; margin-left: 0; bottom: calc(100% + 74px); } /* above the whole bar */
	.tools.ph .tokdrawer { width: min(232px, calc(100vw - 16px)); }
	/* the one action: a brass pill — go / a way back (quiet) / waiting (dim) / nothing yet (off) */
	.p-go { position: relative; flex: 1; min-width: 0; height: 44px; padding: 0 10px; border: 0; border-radius: 22px; display: flex; align-items: center; justify-content: center; gap: 7px;
		font-size: 18px; line-height: 1; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; cursor: pointer;
		color: var(--brass-lo); background: rgba(216,179,106,.07); box-shadow: inset 0 0 0 1px var(--brass-line); }
	.p-go:disabled { cursor: default; }
	.p-go small { font-size: 13px; letter-spacing: .02em; text-transform: none; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; }
	.p-go.quiet { color: var(--brass-hi); box-shadow: inset 0 0 0 1px var(--brass); }
	.p-go.wait { color: var(--ink-3); }
	.p-go.go { color: var(--ink-dark); background: radial-gradient(120% 140% at 50% 0%, #fff6da 0%, #f1d795 30%, var(--brass) 62%, #a8853f 100%); box-shadow: 0 0 18px rgba(244,223,168,.35), inset 0 2px 0 rgba(255,255,255,.6); }
	.p-go.pulse::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 0 2px #f4dfa8, 0 0 14px rgba(244,223,168,.7); animation: orderpulse 2s ease-in-out infinite; }
	.p-bar .oalt { position: static; transform: none; flex: none; height: 44px; padding: 0 10px; border-radius: 22px; font-size: 14px; }
	/* while you defend there are two answers: the tools make room */
	.p-bar .rowb:has(.oalt) .tools.ph .hbtn, .p-bar .rowb:has(.oalt) .tools.ph .radbtn, .p-bar .rowb:has(.oalt) .tools.ph .tokbtn { width: 36px; }
	.p-bar .rowb:has(.oalt) .p-go { font-size: 16px; padding: 0 8px; }
	@media (max-width: 370px) {
		.p-bar .gauges { grid-template-columns: repeat(3, 20px); } .p-bar .gauge { width: 20px; height: 20px; } .p-bar .gauge img { width: 14px; height: 14px; }
		.p-bar .slots { gap: 3px; } .p-bar .slots .cwell { width: 31px; height: 44px; }
		.tools.ph { gap: 5px; } .tools.ph .hbtn, .tools.ph .radbtn, .tools.ph .tokbtn { width: 40px; height: 40px; }
		.p-go { font-size: 16px; padding: 0 8px; }
	}

	/* ── a player's board: the dossier as a bottom sheet ── */
	.scrim.ph { display: block; background: rgba(3,11,21,.55); }
	.sheetwrap { position: absolute; left: 0; right: 0; bottom: 0; }
	.dossier.ph { position: static; width: auto; max-height: 90dvh; overflow-y: auto; border-radius: 18px 18px 0 0; border-bottom: 0; animation: sheetin .22s ease-out; }
	@keyframes sheetin { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
	.dossier.ph .dos-head { height: 104px; border-radius: 17px 17px 0 0; }
	.dossier.ph .dos-head b { font-size: 34px; }
	.dossier.ph .dx { width: 40px; height: 40px; }
	.dossier.ph .dos-body { gap: 16px; padding: 14px 16px calc(18px + env(safe-area-inset-bottom)); }
	.dossier.ph .cwell { width: 21vw; max-width: 72px; height: calc(21vw * 1.39); max-height: 100px; }
	.dossier.ph .lvbar i { width: 24px; height: 10px; }
	.dossier.p-bar .gauge { width: 40px; height: 40px; } .dossier.p-bar .gauge img { width: 27px; height: 27px; }
	.dossier.ph .dmark { width: 36px; height: 36px; }
	.dossier.ph .dult { width: 40px; }
	.dossier.ph .dcount { font-size: 22px; }

	/* ── the card view (a hand card, or one from your discard) ── */
	.cardview.ph { zoom: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 52px; }
	.cardview.ph .cv-col { gap: 10px; }
	.cardview.ph .pvcard { width: min(330px, calc(100vw - 56px), calc((100dvh - 290px) * 0.716)); }
	.cardview.ph .pager.dots { height: auto; align-items: center; gap: 7px; }
	.cardview.ph .pager.dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.25); }
	.cardview.ph .pager.dots i.on { background: var(--brass-hi); }
	.cardview.ph .dials { position: static; flex-direction: row; justify-content: center; gap: 30px; margin-top: 4px; }
	.cardview.ph .dial { font-size: 12px; gap: 7px; }
	.cardview.ph .dface { width: 64px; height: 64px; font-size: 30px; }
	.cardview.ph .dface img { width: 30px; height: 30px; left: -9px; top: -7px; }
	.cardview.ph .dface small { font-size: 12px; padding: 2px 6px 1px; }
	.cardview.ph .pvbar, .p-act, .scrim2.ph .exacts { position: fixed; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; align-items: center; gap: 8px; padding: 10px 10px calc(12px + env(safe-area-inset-bottom)); pointer-events: auto;
		background: rgba(4,15,28,.96); border-top: 1px solid var(--brass-line); }
	.cardview.ph .pvbar .hb, .p-act .hb, .scrim2.ph .exacts .hb { flex: 1; min-width: 0; height: 50px; padding: 0 10px; font-size: 19px; }
	.cardview.ph .pvbar .hb.go { flex: 2; }
	.cardview.ph .cvx { right: 12px; top: 10px; }

	/* ── examine on a phone: the effect row along the bottom ── */
	.scrim2.ph { background: rgba(3,11,21,.84); }
	.scrim2.ph .bigwrap { padding-bottom: 76px; }
	.scrim2.ph .bigcard { filter: none; }
	.scrim2.ph .bigcard :global(.cardface) { box-shadow: 0 0 0 1px #05101c, 0 18px 44px rgba(0,0,0,.6); }
	.scrim2.ph .bigcard.fxon :global(.cardface) { box-shadow: 0 0 0 2px var(--fxc), 0 0 26px var(--fxc), 0 18px 44px rgba(0,0,0,.6); }
	.scrim2.ph .exacts { flex-wrap: wrap; }
	.scrim2.ph .exlbl { display: none; }
	.scrim2.ph .exlbl.on { display: inline; flex: 1 1 100%; text-align: center; font-size: 15px; }
	.scrim2.ph .exacts .fxdurs { flex: 1 1 100%; display: flex; gap: 6px; }
	.scrim2.ph .exacts .hb { font-size: 16px; padding: 0 6px; }
	.scrim2.ph .exacts .fxdisc { flex: 0 0 auto; padding: 0 22px; }
	.scrim2.ph .pvnav { color: var(--brass-hi); background: rgba(3,11,21,.6); border-color: var(--brass-line); }

	/* ── the deck: a full-screen sheet, one colour at a time ── */
	.p-sheet { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; background: radial-gradient(120% 50% at 50% 105%, rgba(47,147,196,.22), transparent 70%), linear-gradient(180deg, #04101d, #071d33); }
	.p-head { flex: none; display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 8px 0 12px; }
	.p-head .lvbar { flex: 1; }
	.p-head .lvbar i { flex: 1; max-width: 26px; height: 10px; }
	.p-head .gcoin { min-width: 30px; height: 30px; font-size: 17px; }
	.p-head .dx { position: static; width: 40px; height: 40px; }
	.p-tabs { flex: none; display: flex; gap: 4px; padding: 2px 8px 8px; }
	.p-tab { position: relative; flex: 1 1 0; min-width: 0; height: 42px; padding: 0; border-radius: 10px; font-size: 14px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		background: rgba(2,11,22,.55); border: 1px solid rgba(255,255,255,.11); }
	.p-tab.is-on { color: var(--ink); border-color: var(--cc); box-shadow: inset 0 -3px 0 var(--cc); }
	.p-tab.has-pick::after { content: ''; position: absolute; right: 6px; top: 6px; width: 7px; height: 7px; border-radius: 50%; background: #f4dfa8; box-shadow: 0 0 6px #f4dfa8; }
	.p-col { --acw: min(124px, calc((100dvh - 236px) / 3 * 0.716 - 10px), 38vw); flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 0 8px 72px; }
	.p-tier { position: relative; display: flex; justify-content: center; gap: 14px; padding-left: 34px; padding-right: 34px; }
	.p-tier .tn { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-style: normal; font-size: 22px; color: var(--ink-3); }
	.ac { position: relative; flex: none; width: var(--acw); padding: 0; border: 0; border-radius: 6px; background: none; cursor: pointer; }
	.ac :global(.cardface) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 0 0 1px #05101c, 0 4px 12px rgba(0,0,0,.55); transition: transform .4s cubic-bezier(.3,.7,.2,1); }
	.ac.is-hand :global(.cardface) { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 14px color-mix(in srgb, var(--cc) 60%, transparent), 0 4px 12px rgba(0,0,0,.55); }
	.ac.is-upgrade :global(.cardface) { transform: rotate(180deg); filter: brightness(.7) saturate(.85); }
	.ac.is-removed :global(.cardface) { filter: grayscale(1) brightness(.45); }
	.ac.is-removed::after { content: ''; position: absolute; left: 10%; right: 10%; top: 50%; height: 3px; border-radius: 2px; background: rgba(255,255,255,.55); transform: rotate(-32deg); }
	.ac.is-deck :global(.cardface) { filter: brightness(.6); }
	.ac.is-pick :global(.cardface) { box-shadow: 0 0 0 2.5px #fff3cf, 0 0 22px rgba(244,223,168,.75), 0 4px 12px rgba(0,0,0,.55); }
	.ac.sel :global(.cardface) { box-shadow: 0 0 0 3px var(--foam), 0 0 14px rgba(207,234,245,.6), 0 4px 12px rgba(0,0,0,.55); filter: none; }
	.ac .ib { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 14px; color: var(--ink-dark); background: var(--brassfill); border: 1px solid #05101c; }
	.ac .ib img { width: 14px; height: 14px; filter: brightness(0); }
	.p-tier.ult { flex-direction: column; align-items: center; gap: 18px; padding: 0; }
	.ac.big { width: min(220px, 56vw, calc((100dvh - 320px) * 0.716)); }
	.p-tier.ult:not(.on) .ac.big :global(.cardface) { filter: grayscale(.6) brightness(.6); }
	.p-tier.ult.on .ac.big :global(.cardface) { box-shadow: 0 0 0 2px #b482f0, 0 0 22px rgba(165,110,230,.7), 0 4px 12px rgba(0,0,0,.55); }
	.p-tier.ult .hb { height: 48px; padding: 0 24px; }
	.p-act { flex-wrap: wrap; }
	.p-sel { flex: 1 1 100%; font-size: 20px; padding: 0 4px; color: var(--brass-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.p-act .hb img { width: 16px; height: 16px; filter: brightness(0); }
	.p-act .hb.sm { height: 44px; font-size: 17px; }
	.p-sheet .coin, .p-act .coin { display: inline-block; flex: none; width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff1b8, #e8b64a 55%, #a87716); box-shadow: inset 0 0 0 1.5px rgba(120,80,10,.7); }

	/* phone-size overlays shared with the desktop: the reveal */
	@media (max-width: 760px) {
		.exrow .pvnav { width: 30px; height: 56px; margin: 0 5px; font-size: 24px; }
		.bigcard { width: min(78vw, 320px, calc((100dvh - 200px) * 0.716)); }
		.exrow.multi .bigcard { width: min(68vw, 300px); }
	}
</style>
