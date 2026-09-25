<script lang="ts">
	// In-game card surface (manual digital tabletop).
	//
	// Reveal is DERIVED, not stored: when every seated player has committed, all
	// cards are considered revealed and flip face-up simultaneously on every client
	// — nothing to desync. Committing/advancing route through the host (single
	// writer for the card map). Advancing locks the turn's cards into their slots.
	import type { Readable } from 'svelte/store';
	import type { MatchSession, MatchState, Player } from '$lib/match';
	import { teamForSeat, colorHex } from '$lib/match';
	import Card from '$lib/cards/Card.svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroCards, heroName, heroTitle, heroStat } from '$lib/cards/deck';
	import { heroAvatar, heroLogo, heroSplash } from '$lib/heroes';
	import { PASS, statDeltas, levelOf, ultimateIndex, type PlayerCardState, type StatKey, type CardZone } from '$lib/cards/cardstate';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let onAdvanceTurn: () => void = () => {};
	export let previewId: string | null = null; // set by the board to open a player's overlay

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
	const cardGlow = (hero: string, idx: number) => GLOW[heroCards(hero)[idx]?.color] ?? '#efb46a';

	$: seated = ($players ?? []).filter((p) => p.seat >= 0 && p.seat < $ms.seats).sort((a, b) => a.seat - b.seat);
	$: cards = $ms.cards ?? {};
	$: others = seated.filter((p) => p.id !== clientId);
	$: dense = others.length > 6;
	$: teamTint = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'orange' ? ORANGE : BLUE);
	$: teamName = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'orange' ? 'Orange' : 'Blue');
	$: firstBlueId = others.find((p) => teamForSeat(p.seat, $ms.seats) === 'blue')?.id ?? '';
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
	$: statusMap = $ms.status ?? {};
	const EMPTY_STATUS = { poison: 0, bounty: 0 };
	// there is ONE poison and ONE bounty marker: applying it to a player moves it
	// off whoever had it; clicking it again removes it
	function toggleStatus(pid: string, key: 'poison' | 'bounty') {
		const cur = $ms.status ?? {};
		const on = !cur[pid]?.[key];
		const next: Record<string, { poison: number; bounty: number }> = {};
		for (const id in cur) next[id] = { ...cur[id], [key]: 0 };
		next[pid] = { ...(next[pid] ?? EMPTY_STATUS), [key]: on ? 1 : 0 };
		const who = seated.find((p) => p.id === pid)?.name ?? 'A player';
		session.act(on ? `${who} is marked with ${key}` : `${who}'s ${key} marker removed`, { status: next });
	}

	$: iAmHost = $ms.host === clientId;
	$: turnIdx = $ms.turn - 1;
	$: seatedWithCards = seated.filter((p) => cards[p.id]);
	// DERIVED reveal: everyone ready ⇒ all cards face-up (same for every client).
	// A player is ready when they've committed, or when they simply have no cards
	// left to play (there is no "pass" in GoA2 — you play a card unless you can't).
	const isReady = (cs: PlayerCardState) => cs.pending != null || cs.hand.length === 0;
	// no cards left to play this turn ⇒ automatically skipped (the one reveal exception)
	const isSkipped = (cs: PlayerCardState) => cs.pending == null && cs.hand.length === 0;
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
	let countNow = Date.now();
	let countTick: ReturnType<typeof setInterval> | null = null;
	$: manageCountTick(allCommitted && revealAt != null && countNow < revealAt);
	function manageCountTick(live: boolean) {
		if (live && !countTick) { countNow = Date.now(); countTick = setInterval(() => (countNow = Date.now()), 100); }
		else if (!live && countTick) { clearInterval(countTick); countTick = null; }
	}
	// end-of-round flow: turn 4 → Minion Battle (manual, no rules yet) → Next round
	$: isFinalTurn = $ms.turn >= 4;
	$: battlePhase = $ms.battlePhase ?? false;
	function startBattle() { session.act('the minion battle begins', { battlePhase: true }); }

	// "Round X" banner that pops for a few seconds when a new round starts
	let roundBanner = 0;
	let roundTimer: ReturnType<typeof setTimeout> | null = null;
	let lastRound: number | null = null;
	$: { const r = $ms.round; if (lastRound === null) lastRound = r; else if (r > lastRound) { lastRound = r; showRoundBanner(r); } else lastRound = r; }
	function showRoundBanner(r: number) { if (roundTimer) clearTimeout(roundTimer); roundBanner = r; roundTimer = setTimeout(() => (roundBanner = 0), 3200); }

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
	let examine: { hid: string; idx: number } | null = null;
	$: ovPlayer = seated.find((p) => p.id === overlayId) ?? null;
	// board hands us a player id to preview → open their overlay, then clear it
	$: if (previewId) { overlayId = previewId; previewId = null; }

	// local player
	$: mine = cards[clientId] ?? null;
	$: myReady = mine?.pending != null;
	$: canCommit = !!mine && !myReady && !revealed;
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
		const i = cs.turns[t] ?? (t === turnIdx && revealed ? cs.pending : null);
		if (i != null && i !== PASS) { e.stopPropagation(); examine = { hid: cs.hero, idx: i }; }
	}

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
	// grid rows (level 2 then 3); each row is 6 cells, ordered by colour then variant
	function deckGrid(hero: string) {
		return [2, 3].map((level) =>
			GRID_COLORS.flatMap((color) =>
				[1, 2].map((first) => ({ color, level, first, idx: findCard(hero, color, level, first) }))
			)
		);
	}
	$: myGrid = mine ? deckGrid(mine.hero) : [];
	// basics never leave the hand — pin them to the right with a partition
	const isBasic = (hero: string, idx: number) => ['GOLD', 'SILVER'].includes(heroCards(hero)[idx]?.color);
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
	function toggleUlt(on: boolean) { if (mine) session.cardAction({ kind: 'ult', pid: clientId, on }); }
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
	onDestroy(() => { curtainTimers.forEach(clearTimeout); if (roundTimer) clearTimeout(roundTimer); if (countTick) clearInterval(countTick); if (lowerTimer) clearTimeout(lowerTimer); if (discTimer) clearTimeout(discTimer); });

	// ── token / marker tray (heroes with the TOKENS trait) ────────────────────
	const TOKENS = ['token_barrier', 'token_blast', 'token_dud', 'token_familiar', 'token_glitch', 'token_grenade', 'token_ice', 'token_illusion', 'token_magma', 'token_rock', 'token_smoke_bomb', 'token_totem', 'token_tree', 'token_zombie'];
	// shared circular markers any hero may need (e.g. Tigerclaw poison, Bain bounty, Snorri runes)
	const MARKERS = ['marker_poison', 'marker_bounty', 'rune_anvil_marker', 'rune_axe_marker', 'rune_bird_marker', 'rune_horn_marker'];
	let tokenDrawer = false;
	$: heroEmblem = mine ? icon(`trait_tokens_${mine.hero}`) : undefined; // set ⇒ this hero has signature-token art
	// heroes that deploy a named companion figure (signature summon)
	const COMPANIONS: Record<string, string> = { widget: 'Pyro', trinkets: 'Turret' };
	$: myCompanion = mine ? COMPANIONS[mine.hero] : undefined;
	// everything placeable, in one shelf: companion / signature token first, then
	// the hero's tokens (tokens heroes), then the shared markers
	type ShelfItem = { key: string; img: string | undefined; letter?: string; title: string; cls: string; label: string; place: () => void };
	$: shelf = [
		...(myCompanion
			? [{ key: 'comp', img: undefined, letter: myCompanion[0], title: `Deploy ${myCompanion}`, cls: 'emblem comp', label: myCompanion, place: placeCompanion }]
			: heroEmblem && mine
				? [{ key: 'sig', img: heroEmblem, title: 'Signature token', cls: 'emblem', label: '', place: () => placeToken(`trait_tokens_${mine!.hero}`) }]
				: []),
		...(heroEmblem ? TOKENS.map((tk) => ({ key: tk, img: icon(tk), title: tk.replace('token_', '').replace('_', ' '), cls: '', label: '', place: () => placeToken(tk) })) : []),
		...MARKERS.map((mk) => ({ key: mk, img: icon(mk), title: mk.replace('marker_', '').replace('rune_', 'rune ').replace('_marker', '').replace('_', ' '), cls: 'marker', label: '', place: () => placeToken(mk) }))
	] as ShelfItem[];
	$: mySeat = seated.find((p) => p.id === clientId)?.seat ?? -1;
	$: myTeam = mySeat >= 0 ? teamForSeat(mySeat, $ms.seats) : 'orange';
	$: myTokenCount = Object.values($ms.pieces ?? {}).filter((p) => p.kind === 'token' && p.owner === clientId).length;
	function placeToken(name: string) {
		const myHex = $ms.pieces?.[clientId]?.hex;
		if (!myHex) return;
		const id = `tok_${clientId}_${Date.now().toString(36)}`;
		session.act(`placed a token`, { pieces: { ...$ms.pieces, [id]: { id, hex: myHex, team: myTeam ?? 'neutral', kind: 'token' as const, token: name, owner: clientId } } });
	}
	function placeCompanion() {
		const myHex = $ms.pieces?.[clientId]?.hex;
		if (!myHex || !mine || !myCompanion) return;
		const id = `comp_${clientId}_${Date.now().toString(36)}`;
		// drawn on the board as a lettered disc: your colour, its initial, team ring
		session.act(`deployed ${myCompanion}`, { pieces: { ...$ms.pieces, [id]: { id, hex: myHex, team: myTeam ?? 'neutral', kind: 'token' as const, token: 'companion', owner: clientId, label: myCompanion, color: myColor } } });
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
	function toggleSpread() { spreadHand = !spreadHand; writePref(PREF_SPREAD, spreadHand); }
	let dockHand = readPref(PREF_DOCK, false);
	function toggleDock() { dockHand = !dockHand; writePref(PREF_DOCK, dockHand); handUp = false; }
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
		if (discOpen && !t?.closest?.('.discwrap')) discOpen = null;
	}
	$: retracted = autoRetract && !handUp;
</script>

<svelte:window on:pointerdown={onWindowDown} />

{#if $ms.cards}
	<!-- ───────── right side: the OTHER players ───────── -->
	<div class="ppanel" class:dense class:withdash={!!mine}>
		<div class="pptitle">
			Players
			<span class="phasetag" class:resolve={revealed} class:counting={countdownActive}>
				{revealed ? `Revealed · Turn ${$ms.turn}` : countdownActive ? `Revealing… ${countdownLabel}` : `Planning · Turn ${$ms.turn} · ${readyCount}/${seatedWithCards.length} ready`}
			</span>
		</div>
		{#each others as p (p.id)}
			{@const cs = cards[p.id]}
			{@const st = statusMap[p.id] ?? EMPTY_STATUS}
			{#if p.id === firstBlueId}<div class="ppdiv"></div>{/if}
			<!-- a row opens that player's board; a face-up card inside previews directly -->
			<div class="prow" class:ultrow={cs?.ultimate} style="--tint:{teamTint(p)}; {teamVars(pTeam(p))}" role="button" tabindex="0"
				on:click={() => (overlayId = p.id)} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (overlayId = p.id)}>
				<div class="prtop">
					<PlayerIcon hero={cs?.hero ?? ''} team={pTeam(p)} color={colorHex(p.color)} size="2rem" ring={2} ult={!!cs?.ultimate}>
						{#if cs?.ultimate}<span class="crown">♛</span>{/if}
					</PlayerIcon>
					<span class="pmid">
						<span class="pname">
							{p.name}<em>Lv {cs ? levelOf(cs) : 1}</em>
							{#if cs}<span class="coin" title="Coins">{cs.coins}</span>{/if}
							{#if cs && cs.discard.length}<span class="dchip" title="Cards in discard pile"><i class="trashi">{@html TRASH}</i>{cs.discard.length}</span>{/if}
							{#if st.poison}<span class="statmk pois" title="Poison"><img src={icon('marker_poison')} alt="" /></span>{/if}
							{#if st.bounty}<span class="statmk bnty" title="Bounty"><img src={icon('marker_bounty')} alt="" /></span>{/if}
						</span>
						<span class="phero">{cs ? heroName(cs.hero) : ''}</span>
					</span>
					{#if cs && dense}
						<span class="dslot">
							<TurnSlot heroId={cs.hero} played={cs.turns[turnIdx]} pending={cs.pending} isCurrent {revealed} examinable on:click={(e) => peekSlot(e, cs, turnIdx)} />
						</span>
					{/if}
					{#if cs && isSkipped(cs)}<span class="skiptag" title="No cards left — skipped this turn">skip</span>
					{:else if cs && !revealed}<span class="rdot" class:on={isReady(cs)} title={isReady(cs) ? 'Ready' : 'Not ready'}></span>{/if}
					<!-- this turn's initiative (card + upgrades), once revealed — sits above the radius stat -->
					{#if cs}
						{@const ini = initOf(cs, revealed)}
						<span class="initb" class:off={ini == null} title="Initiative this turn">
							<img src={icon('item_initiative')} alt="" /><b>{ini ?? '–'}</b>
						</span>
					{/if}
				</div>
				{#if cs}
					<div class="pstats">
						{#each allStats(cs) as r}
							<span class="pstat" class:up={r.delta > 0}>
								<span class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</span>
								<img src={icon(r.icon)} alt={r.label} />
								<b>{r.delta > 0 ? '+' + r.delta : '–'}</b>
							</span>
						{/each}
					</div>
					{#if !dense}
						<div class="pturns">
							{#each [0, 1, 2, 3] as t}
								<TurnSlot heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} examinable on:click={(e) => peekSlot(e, cs, t)} />
							{/each}
							<!-- discard: the most recent card, count below (like your dash) -->
							<span class="pdisc" title="Discard pile">
								<span class="trashw">{@html TRASH}</span>
								{#if cs.discard.length}
									<span class="pdcard"><Card heroId={cs.hero} card={heroCards(cs.hero)[cs.discard[cs.discard.length - 1]]} /></span>
									<span class="pdct">{cs.discard.length}</span>
								{/if}
							</span>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>

	<!-- ───────── overlay: a player's whole board ───────── -->
	{#if overlayId && ovPlayer && cards[overlayId]}
		{@const cs = cards[overlayId]}
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
						<div class="mtt" style="color:{teamTint(ovPlayer)}">{heroTitle(oh)} · {teamName(ovPlayer)} · Lv {levelOf(cs)}</div>
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
								<TurnSlot heroId={oh} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} examinable on:click={(e) => peekSlot(e, cs, t)} />
							</div>
						</div>
					{/each}
					<div class="tbox disc" style="--tint:{teamTint(ovPlayer)}">
						<div class="tlabel">Discard{#if cs.discard.length}<span class="ct">{cs.discard.length}</span>{/if}</div>
						<div class="tslot discwrap" role="group" aria-label="Discard pile" on:pointerenter={(e) => discEnter(e, oid)} on:pointerleave={discLeave}>
							<span class="tbroman trash">{@html TRASH}</span>
							{#if cs.discard.length}
								<button class="dstack" on:click={() => discTap(oid)} title="Show the discard pile">
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
		<div class="scrim2" on:click={() => (examine = null)} on:keydown={(e) => e.key === 'Escape' && (examine = null)} role="presentation">
			<div class="bigcard" role="dialog" aria-modal="true" tabindex="-1"><Card heroId={examine.hid} card={heroCards(examine.hid)[examine.idx]} /></div>
		</div>
	{/if}

	<!-- ───────── deck view: manage your cards across the four zones ───────── -->
	{#if deckOpen && mine}
		{@const dh = mine.hero}
		{@const split = handSplit(mine)}
		{@const selZone = deckSel != null ? zoneOf(mine, deckSel) : null}
		{@const selInGrid = deckSel != null && myGrid.flat().some((g) => g.idx === deckSel)}
		<div class="scrim" on:click={() => { deckOpen = false; deckSel = null; }} on:keydown={(e) => e.key === 'Escape' && (deckOpen = false)} role="presentation">
			<div class="deckmodal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="mhead">
					<span class="mav" style="--tint:{ORANGE}"><img src={heroLogo(dh)} alt="" /></span>
					<div class="mtitle">
						<div class="mnm">{heroName(dh)} · Deck<em class="lvtag">Lv {levelOf(mine)}</em></div>
						<div class="mtt">Select a card, then send it to your hand, upgrade area or removed pile</div>
					</div>
					<button class="ix" on:click={() => { deckOpen = false; deckSel = null; }}>✕</button>
				</div>

				<!-- HAND: ultimate parked far left, then basics, then colour cards -->
				<div class="dklabel">Your hand <span class="ct">{mine.hand.length}</span> <span class="zhint">double-click any card to enlarge it</span></div>
				<div class="dkhand">
					<!-- Ultimate: never in hand; previewable; unlock appears once you hit level 8 -->
					{#if myUlt >= 0}
						<div class="ultslot" class:on={mine.ultimate}>
							<button class="dkcard ult" class:locked={!mine.ultimate} on:dblclick={() => examineCard(dh, myUlt)} title="Double-click to preview your ultimate">
								<Card heroId={dh} card={heroCards(dh)[myUlt]} />
								{#if !mine.ultimate}<span class="ultlock">🔒 Lv 8</span>{/if}
							</button>
							{#if mine.ultimate}
								<button class="act ghost sm" on:click={() => toggleUlt(false)}>Re-lock</button>
							{:else if levelOf(mine) >= 7}
								<button class="act sm ultbtn" on:click={() => toggleUlt(true)}>Unlock ★</button>
							{/if}
						</div>
						<span class="dkpart tall" title="Ultimate"></span>
					{/if}

					{#each split.basics as i (i)}
						<div class="dkcard basic" title="Basic card — stays in your hand" on:dblclick={() => examineCard(dh, i)} role="presentation">
							<Card heroId={dh} card={heroCards(dh)[i]} />
							<span class="dklock">🔒</span>
						</div>
					{/each}
					{#if split.basics.length}<span class="dkpart" title="Basics stay in hand"></span>{/if}
					{#each split.rest as i (i)}
						<button class="dkcard" class:sel={deckSel === i} on:click={() => (deckSel = i)} on:dblclick={() => examineCard(dh, i)}>
							<Card heroId={dh} card={heroCards(dh)[i]} />
						</button>
					{/each}
					{#if !split.rest.length}<span class="empty-note">—</span>{/if}
				</div>

				<!-- UPGRADE DECK grid (fixed positions; status shows where each card is) -->
				<div class="dklabel">Upgrade deck — Tier II &amp; III <span class="ct">{deckCards(mine).length} in deck</span></div>
				<div class="dkgrid">
					{#each myGrid as row}
						{#each row as cell (cell.color + cell.level + cell.first)}
							{#if cell.idx >= 0}
								{@const z = zoneOf(mine, cell.idx)}
								<button class="dkcard" class:sel={deckSel === cell.idx} class:zhand={z === 'hand'} class:zupg={z === 'upgrade'} class:zrem={z === 'removed'} class:zdeck={z === null}
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

				<!-- UPGRADE + REMOVED zones -->
				<div class="dkzones">
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
				</div>

				<!-- action bar: destinations for the selected card -->
				{#if deckSel != null}
					<div class="dkbar">
						<span class="dksel">Selected · {heroCards(dh)[deckSel]?.name}</span>
						{#if selZone !== 'hand'}<button class="act primary sm" on:click={() => moveTo(deckSel!, 'hand')}>→ Hand</button>{/if}
						{#if selZone !== 'upgrade'}<button class="act sm" on:click={() => moveTo(deckSel!, 'upgrade')}>→ Upgrade</button>{/if}
						{#if selZone !== 'removed'}<button class="act danger sm" on:click={() => moveTo(deckSel!, 'removed')}>→ Removed</button>{/if}
						{#if selInGrid && selZone !== null}<button class="act ghost sm" on:click={() => moveTo(deckSel!, 'deck')}>→ Deck</button>{/if}
						<button class="act ghost sm" on:click={() => (deckSel = null)}>Cancel</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ───────── centered preview of a picked hand card ───────── -->
	{#if mine && selected != null}
		<div class="pvscrim" on:click={closePreview} on:keydown={(e) => e.key === 'Escape' && closePreview()} role="presentation"></div>
		<div class="pvwrap" role="presentation">
			<div class="pvcard" style="--glow:{cardGlow(mine.hero, selected)}">
				<div class="pvflip" class:up={committing}>
					<div class="pvface front"><Card heroId={mine.hero} card={heroCards(mine.hero)[selected]} /></div>
					<div class="pvface back">
						<span class="band top"></span><span class="emblem sym"><img src={heroLogo(mine.hero)} alt="" /></span><span class="band bot"></span>
					</div>
				</div>
			</div>
		</div>
		<!-- actions sit in the freed space below the hand -->
		<div class="pvbar">
			{#if previewSrc === 'discard'}
				<button class="act primary" on:click={() => pullBack(selected!)}>Recover to hand</button>
			{:else if canCommit}
				<button class="act primary" on:click={() => commit(selected!)}>Commit · Turn {$ms.turn}</button>
				<button class="act danger" on:click={() => defend(selected!)}>Defend (discard)</button>
			{/if}
			<button class="act" on:click={closePreview}>Close</button>
		</div>
	{/if}

	<!-- ───────── bottom: hand floats ABOVE the dashboard (unless docked) ───────── -->
	{#if mine}
		{@const mst = statusMap[clientId] ?? EMPTY_STATUS}
		{#if !dockHand}
			<div class="tray" class:retracted class:spread={spreadHand}>
				{#each handOrdered as idx, k (idx)}
					{@const f = fan(k, handOrdered.length)}
					<button class="hc" style="--rot:{spreadHand ? 0 : f.rot}deg; --y:{spreadHand ? 0 : f.y}px"
						on:click={() => handCardClick(idx)} on:pointerenter={raiseHand} on:pointerleave={lowerHandSoon}>
						<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
					</button>
				{/each}
			</div>
		{/if}

		<div class="dash" class:ultdash={mine.ultimate} class:docked={dockHand} style={teamVars(myTeam)}>
			<!-- LEFT: you · tokens · deck -->
			<div class="dleft">
				<button class="dself" on:click={() => (overlayId = clientId)} title="Open your board">
					<PlayerIcon hero={mine.hero} team={myTeam ?? 'orange'} color={colorHex(myColor)} size="2.4rem" ult={mine.ultimate}>
						{#if mine.ultimate}<span class="crown">♛</span>{/if}
						<!-- status markers ride on the portrait, so they take no room in the row -->
						{#if mst.poison}<span class="icmk pois" title="Poison"><img src={icon('marker_poison')} alt="" /></span>{/if}
						{#if mst.bounty}<span class="icmk bnty" title="Bounty"><img src={icon('marker_bounty')} alt="" /></span>{/if}
					</PlayerIcon>
					<span class="dsmid">
						<span class="dsname"><span class="dsnm">{myName}</span><em>Lv {levelOf(mine)}</em>
							<span class="initb" class:off={myInit == null} title="Your initiative this turn (card + upgrades)"><img src={icon('item_initiative')} alt="" /><b>{myInit ?? '–'}</b></span>
						</span>
						<span class="dshero">{heroName(mine.hero)}</span>
					</span>
					<span class="dstats">
						{#each allStats(mine) as r}
							<span class="pstat" class:up={r.delta > 0}>
								<span class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</span>
								<img src={icon(r.icon)} alt={r.label} /><b>{r.delta > 0 ? '+' + r.delta : '–'}</b>
							</span>
						{/each}
					</span>
				</button>

				<!-- tokens and markers: one shelf; the button shows its first item -->
				<div class="tokwrap">
					<button class="tokbtn" class:on={tokenDrawer} on:click={() => (tokenDrawer = !tokenDrawer)} title="Tokens and Markers">
						{#if shelf[0]?.letter}<span class="ltrdisc" style="--pc:{colorHex(myColor)}">{shelf[0].letter}</span>{:else}<img src={shelf[0]?.img} alt="" />{/if}
						{#if myTokenCount}<span class="tokct">{myTokenCount}</span>{/if}
					</button>
					{#if tokenDrawer}
						<div class="tokdrawer">
							<div class="toklbl">Tokens and Markers</div>
							<div class="tokgrid">
								{#each shelf as it (it.key)}
									<button class="tok {it.cls}" on:click={it.place} title={it.title}>
										{#if it.letter}<span class="ltrdisc" style="--pc:{colorHex(myColor)}">{it.letter}</span>{:else}<img src={it.img} alt="" />{/if}{#if it.label}<span class="toktag">{it.label}</span>{/if}
									</button>
								{/each}
							</div>
							<div class="tokfoot">
								<span class="tokhint">Places on your hero — drag it where you need.</span>
								{#if myTokenCount}<button class="act ghost sm" on:click={clearTokens}>Clear mine</button>{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- your deck (face-down stack) and, once unlocked, your ultimate -->
				<button class="deckstack" on:click={() => (deckOpen = true)} title="View & manage your deck">
					<span class="ds-card ds3"></span>
					<span class="ds-card ds2"></span>
					<span class="ds-card ds1"><img src={heroLogo(mine.hero)} alt="" /></span>
					<span class="ds-count">{deckCards(mine).length}</span>
				</button>
				<!-- the ultimate's slot is always reserved, so unlocking it shifts nothing -->
				{#if mine.ultimate && myUlt >= 0}
					<button class="ultmini" on:click={() => (examine = { hid: mine.hero, idx: myUlt })} title="Your ultimate — click to enlarge">
						<Card heroId={mine.hero} card={heroCards(mine.hero)[myUlt]} />
						<span class="ultmini-tag">ULT</span>
					</button>
				{:else}
					<span class="ultmini locked" title="Ultimate — unlocks at level 8">ULT</span>
				{/if}
			</div>

			<!-- CENTRE: this round's four turns + your discard (numerals / trash sit faintly behind) -->
			<div class="dmine">
				<div class="dm-turns">
					{#each [0, 1, 2, 3] as t}
						{@const has = mine.turns[t] != null || (t === turnIdx && mine.pending != null && mine.pending !== PASS)}
						<!-- click a slot to open your board; click a face-up card to preview it -->
						<div class="dm-slot" role="button" tabindex="-1" title="Open your board" on:click={() => (overlayId = clientId)} on:keydown={(e) => e.key === 'Enter' && (overlayId = clientId)}>
							<span class="roman">{['I', 'II', 'III', 'IV'][t]}</span>
							{#if has}
								<div class="dm-on"><TurnSlot heroId={mine.hero} played={mine.turns[t]} pending={mine.pending} isCurrent={t === turnIdx} {revealed}
									examinable on:click={(e) => peekSlot(e, mine, t)} /></div>
							{/if}
						</div>
					{/each}
					<div class="dm-slot disc discwrap" role="group" aria-label="Discard pile" on:pointerenter={(e) => discEnter(e, 'dash')} on:pointerleave={discLeave}>
						<span class="roman trash">{@html TRASH}</span>
						{#if mine.discard.length}
							<button class="discstack" on:click={() => discTap('dash')} title="Discard — show all">
								{#each mine.discard.slice(-3) as i, di (i)}
									<span class="disc-card" style="--i:{di}"><Card heroId={mine.hero} card={heroCards(mine.hero)[i]} /></span>
								{/each}
								<span class="ds-count">{mine.discard.length}</span>
							</button>
							{#if discOpen === 'dash'}
								<div class="discpop up">
									{#each mine.discard as i (i)}
										<button class="dpc" on:click={() => openDiscard(mine.hero, i, true)} title="Preview (you can recover it to your hand)"><Card heroId={mine.hero} card={heroCards(mine.hero)[i]} /></button>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>

			<!-- RIGHT: turn actions · coins · hand display options · docked hand -->
			<div class="dright">
				<!-- fixed-width slot for the turn buttons, so nothing shifts when one appears -->
				<div class="dact">
					{#if revealed && iAmHost}
						{#if !isFinalTurn}
							<button class="act primary" on:click={onAdvanceTurn}>Next turn →</button>
						{:else if !battlePhase}
							<button class="act primary" on:click={startBattle}>Minion Battle</button>
						{:else}
							<button class="act primary" on:click={onAdvanceTurn}>Next round →</button>
						{/if}
					{:else if revealed}
						<span class="waithost">Waiting for host…</span>
					{:else if myReady}
						<button class="act takeback" on:click={takeBack}>↩ Take back</button>
					{/if}
				</div>

				<!-- money: coins from killing minions, spent on level-ups -->
				<div class="coinctl" title="Coins — killing minions earns them, spend on level-ups">
					<button class="cbtn" on:click={() => changeCoins(-1)} aria-label="Remove coin">−</button>
					<span class="coin lg">{mine.coins}</span>
					<button class="cbtn" on:click={() => changeCoins(1)} aria-label="Add coin">+</button>
				</div>

				<!-- hand display: auto-hide · fan / spread · dock into the dash -->
				<div class="handopts">
				<button class="hopt" class:on={autoRetract} disabled={dockHand} on:click={toggleRetract} aria-pressed={autoRetract} aria-label="Auto-hide hand"
					title={autoRetract ? 'Auto-hide hand: ON — hover or tap the card tips to raise it' : 'Auto-hide hand: OFF — cards stay up'}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
						<rect x="4.5" y="2.5" width="8" height="11" rx="1.4" fill="rgba(9,13,22,.9)" transform="rotate(-9 8.5 8)" />
						<rect x="11.5" y="2.5" width="8" height="11" rx="1.4" fill="rgba(9,13,22,.9)" transform="rotate(9 15.5 8)" />
						<path d="M2.5 15.5h19" />
						{#if autoRetract}<path d="M9 18.5l3 3 3-3" />{:else}<path d="M9 21.5l3-3 3 3" />{/if}
					</svg>
				</button>
				<button class="hopt" class:on={spreadHand} disabled={dockHand} on:click={toggleSpread} aria-pressed={spreadHand} aria-label="Hand layout"
					title={spreadHand ? 'Hand layout: spread out — click to fan' : 'Hand layout: fanned — click to spread out'}>
					<svg viewBox="0 0 24 24" fill="rgba(9,13,22,.9)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
						{#if spreadHand}
							<rect x="1.5" y="6" width="6.2" height="10" rx="1.2" /><rect x="8.9" y="6" width="6.2" height="10" rx="1.2" /><rect x="16.3" y="6" width="6.2" height="10" rx="1.2" />
						{:else}
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" transform="rotate(-22 12 21)" />
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" transform="rotate(22 12 21)" />
							<rect x="8.5" y="4" width="7" height="11" rx="1.3" />
						{/if}
					</svg>
				</button>
					<button class="hopt dock" class:on={dockHand} on:click={toggleDock} aria-pressed={dockHand} aria-label="Dock hand in the dash"
						title={dockHand ? 'Hand docked in the dash — click to bring it back over the board' : 'Dock your hand inside the dash (nothing over the board)'}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
							<rect x="2.5" y="12.5" width="19" height="9" rx="2" />
							<rect x="6" y="14.5" width="3.4" height="5" rx="0.6" fill="currentColor" stroke="none" />
							<rect x="10.3" y="14.5" width="3.4" height="5" rx="0.6" fill="currentColor" stroke="none" />
							<rect x="14.6" y="14.5" width="3.4" height="5" rx="0.6" fill="currentColor" stroke="none" />
							{#if dockHand}<path d="M9 7.5l3-3 3 3M12 4.5v6" />{:else}<path d="M9 7l3 3 3-3M12 3.5v6.5" />{/if}
						</svg>
					</button>
				</div>

				{#if dockHand}
					<!-- docked hand: every card separate, in colour order; click to preview -->
					<div class="dockhand">
						{#each handOrdered as idx (idx)}
							<button class="dkh" on:click={() => preview(idx)} title={heroCards(mine.hero)[idx]?.name}><Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} /></button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ───────── synced pre-reveal countdown (take back your card to cancel) ───────── -->
	{#if countdownActive}
		<div class="countdown">
			{#key countdownLabel}<span class="cd-num" class:go={countdownLabel === 'Reveal!'}>{countdownLabel}</span>{/key}
			<span class="cd-sub">Revealing…</span>
		</div>
	{/if}

	<!-- ───────── round-start banner ───────── -->
	{#if roundBanner}
		<div class="roundbanner"><span class="rb-sub">Round</span><span class="rb-num">{roundBanner}</span></div>
	{/if}

	<!-- ───────── dramatic simultaneous reveal ───────── -->
	{#if curtain}
		<div class="curtain" on:click={skipCurtain} on:keydown={(e) => e.key === 'Escape' && skipCurtain()} role="presentation">
			<div class="curtain-inner">
				<div class="curtain-title">Reveal — Turn {$ms.turn}</div>
				<div class="curtain-cards" style="--n:{Math.max(1, seatedWithCards.length)}">
					{#each seatedWithCards as p (p.id)}
						{@const cs = cards[p.id]}
						{@const idx = cs.pending}
						<div class="cc" style="--tint:{teamTint(p)}">
							{#if idx != null && idx !== PASS}
								<div class="cc-flip" class:up={curtainFlip}>
									<div class="cc-face cc-back"><span class="band top"></span><span class="emblem"><img src={heroLogo(cs.hero)} alt="" /></span><span class="band bot"></span></div>
									<div class="cc-face cc-front"><Card heroId={cs.hero} card={heroCards(cs.hero)[idx]} /></div>
								</div>
							{:else}
								<div class="cc-flip skip">—</div>
							{/if}
							<div class="cc-name"><PlayerIcon hero={cs.hero} team={pTeam(p)} color={colorHex(p.color)} size="1.8rem" ring={2} />{p.name}</div>
						</div>
					{/each}
				</div>
				<div class="curtain-hint">Resuming…</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* right-side player panel */
	.ppanel { position: absolute; top: 12px; right: 12px; bottom: 12px; z-index: 6; width: 244px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; color: #e5e7eb; background: rgba(9,13,22,.72); backdrop-filter: blur(9px); border: 1px solid rgba(199,154,78,.4); border-radius: 14px; }
	.pptitle { font-size: .6rem; letter-spacing: .16em; text-transform: uppercase; font-weight: 800; color: #b8a06a; padding: 2px 4px 4px; display: flex; flex-direction: column; gap: 3px; }
	.phasetag { font-size: .56rem; letter-spacing: .04em; font-weight: 700; color: #7d8ba0; text-transform: none; }
	.phasetag.resolve { color: #efb46a; }
	.ppdiv { height: 1px; margin: 5px 2px; background: linear-gradient(90deg, transparent, rgba(199,154,78,.35), transparent); }
	.prow { display: flex; flex-direction: column; gap: 4px; padding: 6px 7px; border-radius: 11px; cursor: pointer; text-align: left; background: rgba(12,18,32,.44); border: 1px solid rgba(255,255,255,.1); border-left: 3px solid var(--tint); color: #e5e7eb; transition: transform .12s, background .12s; }
	.prow:hover { background: rgba(20,28,46,.6); transform: translateY(-2px); }
	.prow:focus-visible { outline: 2px solid rgba(239,180,106,.7); outline-offset: 1px; }
	/* level-8 opponent: team colour stays on the left, purple washes to the right */
	.prow.ultrow { border-color: rgba(165,110,230,.5); border-left-color: var(--tint);
		background: linear-gradient(90deg, rgba(12,18,32,.5) 0%, rgba(120,60,190,.24) 52%, rgba(155,92,232,.36) 100%);
		box-shadow: inset 0 0 0 1px rgba(165,110,230,.26), 0 0 15px rgba(165,110,230,.26); animation: ultpulse 3.4s ease-in-out infinite; }
	.prow.ultrow:hover { background: linear-gradient(90deg, rgba(20,28,46,.6) 0%, rgba(130,70,200,.3) 52%, rgba(165,100,240,.42) 100%); }
	.prow.ultrow::after { content: '★'; position: absolute; top: 5px; right: 8px; font-size: .7rem; color: #d9b6ff; text-shadow: 0 0 6px rgba(165,110,230,.9); }
	.prow { position: relative; }
	.prtop { display: flex; align-items: center; gap: 8px; }
	.pmid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; line-height: 1.05; }
	.pname { font-family: 'Modesto Poster', serif; font-size: .84rem; color: #f3f6fb; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
	.pname em { font-style: normal; font-size: .56rem; font-weight: 700; color: #8b9bb0; }
	.trashi { display: inline-flex; width: .72rem; height: .72rem; opacity: .8; }
	.trashi :global(svg) { width: 100%; height: 100%; }
	.dchip { display: inline-flex; align-items: center; gap: 2px; font-size: .54rem; font-weight: 800; font-variant-numeric: tabular-nums; color: #9fb0c4; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 5px; padding: 0 4px; }
	/* compact HUD status markers (poison / bounty) */
	.statmk { display: inline-flex; align-items: center; gap: 1px; font-size: .56rem; font-weight: 900; font-variant-numeric: tabular-nums; padding: 0 3px 0 2px; border-radius: 999px; line-height: 1; }
	.statmk img { width: .82rem; height: .82rem; object-fit: contain; border-radius: 50%; }
	.statmk.pois { color: #c8f5cf; background: rgba(65,174,89,.2); box-shadow: 0 0 0 1px rgba(65,174,89,.4); }
	.statmk.bnty { color: #ffe6a6; background: rgba(232,182,74,.2); box-shadow: 0 0 0 1px rgba(232,182,74,.45); }
	/* status controls in the board overlay */
	.statusctl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 10px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.1); }
	.sctog { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px 4px 5px; border-radius: 999px; cursor: pointer; font-size: .76rem; font-weight: 700;
		color: #94a3b8; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14); transition: background .12s, color .12s, box-shadow .12s; }
	.sctog img { width: 1.25rem; height: 1.25rem; object-fit: contain; border-radius: 50%; filter: grayscale(1) opacity(.6); }
	.sctog:hover { background: rgba(255,255,255,.1); color: #e5e7eb; }
	.sctog.on img { filter: none; }
	.sctog.pois.on { color: #c8f5cf; background: rgba(65,174,89,.24); border-color: rgba(65,174,89,.6); box-shadow: 0 0 10px rgba(65,174,89,.35); }
	.sctog.bnty.on { color: #ffe6a6; background: rgba(232,182,74,.22); border-color: rgba(232,182,74,.6); box-shadow: 0 0 10px rgba(232,182,74,.35); }
	.statusctl .sclbl { font-size: .58rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; color: #93a3b8; }
	.phero { font-family: 'Modesto Poster', serif; font-size: .64rem; letter-spacing: .02em; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dslot { width: 1.7rem; flex: none; }
	/* gold coin chip */
	.coin { display: inline-flex; align-items: center; justify-content: center; min-width: 1.05rem; height: 1.05rem; padding: 0 4px; border-radius: 999px;
		background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: .58rem; font-weight: 900; font-variant-numeric: tabular-nums;
		border: 1px solid rgba(0,0,0,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.45); }
	.coin.lg { min-width: 1.8rem; font-variant-numeric: tabular-nums; height: 1.5rem; font-size: .82rem; }
	/* ready light — red until committed, then green (right-aligned, tiny) */
	.rdot { flex: none; width: .7rem; height: .7rem; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ff8a8a, #d13a3a); box-shadow: 0 0 5px rgba(209,58,58,.7); }
	.rdot.on { background: radial-gradient(circle at 35% 30%, #a6f5b6, #35c257); box-shadow: 0 0 6px rgba(53,194,87,.8); }
	.skiptag { flex: none; font-size: .5rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #8b9bb0; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 1px 5px; }
	.pstats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }
	.pstat { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0; padding: 2px 0 1px; border-radius: 5px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); }
	.pstat img { height: .74rem; filter: brightness(0) invert(1); opacity: .55; }
	.pstat b { font-size: .64rem; font-weight: 800; color: #b9c4d2; font-variant-numeric: tabular-nums; }
	.pstat .stripes { position: absolute; top: 1px; left: 0; right: 0; display: flex; justify-content: center; gap: 1.5px; height: 3px; }
	.pstat .stripe { width: 4px; height: 2px; transform: skewX(-24deg); background: rgb(var(--tcl, 255 183 116)); border-radius: 1px; }
	.pstat.up { background: rgb(var(--tcr, 239 125 34) / .18); border-color: rgb(var(--tcr, 239 125 34) / .5); padding-top: 5px; }
	.pstat.up img { opacity: 1; } .pstat.up b { color: rgb(var(--tcl, 255 207 163)); }
	.pturns { display: grid; grid-template-columns: repeat(5, 36px); gap: 4px; justify-content: center; }
	.pdisc { position: relative; display: block; aspect-ratio: 3 / 4; border-left: 1px solid rgba(255,255,255,.1); margin-left: 2px; padding-left: 3px; }
	.trashw { position: absolute; inset: 18% 14% 18% 22%; color: rgba(255,255,255,.08); pointer-events: none; }
	.trashw :global(svg) { width: 100%; height: 100%; }
	.pdcard { position: relative; display: block; border-radius: 6%; overflow: hidden; box-shadow: 2px 2px 0 rgba(255,255,255,.18), 0 3px 8px rgba(0,0,0,.5); }
	.pdcard :global(canvas) { display: block; width: 100%; }
	.pdct { position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); min-width: 1rem; height: .95rem; padding: 0 4px; border-radius: 999px; display: grid; place-items: center;
		background: linear-gradient(#2b3444, #171d27); border: 1px solid rgba(199,154,78,.6); color: #f0dcae; font-size: .55rem; font-weight: 900; font-variant-numeric: tabular-nums; }
	/* initiative this turn (card + upgrades) */
	.initb { flex: none; margin-left: auto; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px 2px 5px; border-radius: 8px;
		background: rgb(var(--tcr, 239 125 34) / .2); border: 1px solid rgb(var(--tcl, 255 196 140) / .55); color: #fff; }
	.initb img { width: .85rem; height: .85rem; object-fit: contain; filter: brightness(0) invert(1); }
	.initb b { font-family: 'Modesto Poster', serif; font-size: .95rem; line-height: 1; font-variant-numeric: tabular-nums; }
	.initb.off { opacity: .35; background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.12); }
	/* the ♛ badge on a level-8 player's icon */
	.crown { position: absolute; z-index: 2; top: -10px; right: -8px; font-size: .9rem; color: #d9b6ff; text-shadow: 0 1px 3px #000; }
	.ppanel.dense .prow { gap: 4px; padding: 5px 6px; }
	.ppanel.dense .pname { font-size: .78rem; }
	.ppanel.dense .phero { font-size: .56rem; }
	.ppanel.dense .pstat b { font-size: .62rem; }
	.ppanel.dense .pstat img { height: .72rem; }

	/* overlay */
	.scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3,6,12,.62); backdrop-filter: blur(3px); }
	.modal.board { width: min(1040px, 96vw); background: linear-gradient(180deg, rgba(11,16,26,.8), rgba(11,16,26,.9) 55%, rgba(11,16,26,.95)), var(--bgimg) center 22% / cover no-repeat, #0b101a; }
	.modal { width: min(780px, 94vw); max-height: 90vh; overflow-y: auto; padding: 16px 18px; color: #e5e7eb; background: rgba(11,16,26,.94); border: 1px solid rgba(199,154,78,.5); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.7); }
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
	.ultchip-card :global(canvas) { display: block; width: 100%; border-radius: 4px; }
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
	.tbox.disc .tlabel .ct { margin-left: 5px; font-family: system-ui, sans-serif; font-size: .62rem; font-weight: 800; color: #f1f5f9; background: rgba(255,255,255,.1); border-radius: 5px; padding: 0 5px; }
	/* discard: the same footprint as a turn slot; a slightly fanned stack */
	.discwrap { position: relative; }
	.tbox.disc .discwrap { aspect-ratio: 3 / 4; }
	.dstack { position: absolute; inset: 0; z-index: 1; padding: 0; background: none; border: none; cursor: pointer; }
	.dsk { position: absolute; top: 0; left: 0; width: 100%; border-radius: 6%; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.55);
		transform: translateX(calc((var(--i) - var(--n) + 1) * 6%)) rotate(calc((var(--i) - var(--n) + 1) * 3deg)); transform-origin: bottom left; z-index: var(--i); }
	.dsk :global(canvas) { display: block; width: 100%; }
	.dstack:hover .dsk { filter: brightness(1.08); }
	/* fanned-out discard (hover / tap) — click a card to preview it */
	.discpop { position: absolute; z-index: 30; right: 0; bottom: calc(100% + 10px); display: flex; gap: 6px; padding: 8px; max-width: min(760px, 92vw); overflow-x: auto;
		border-radius: 12px; background: rgba(9,13,22,.95); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 14px 36px rgba(0,0,0,.6); animation: popin .16s ease; }
	.discpop.up { right: auto; left: 50%; transform: translateX(-50%); animation: popinc .16s ease; }
	@keyframes popin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes popinc { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translateX(-50%); } }
	.dpc { flex: none; width: 76px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 6%; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.55); transition: transform .12s; }
	.dpc :global(canvas) { display: block; width: 100%; }
	.dpc:hover { transform: translateY(-4px); }
	.removedrow { margin-top: 10px; padding: 7px 10px 9px; border-radius: 12px; background: rgba(12,18,32,.4); border: 1px solid rgba(255,255,255,.08); }
	.removedrow .ilabel { margin: 0 0 6px; }
	.rrow { display: flex; flex-wrap: wrap; gap: 6px; min-height: 30px; align-items: center; }
	.rmini { width: 44px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; opacity: .85; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.rmini :global(canvas) { display: block; width: 100%; }
	.rmini:hover { opacity: 1; outline: 2px solid rgba(199,154,78,.6); }
	.empty-note { color: #55637a; font-size: .8rem; padding: 4px; }

	/* deck view (manage cards across zones) */
	.deckmodal { width: min(880px, 95vw); max-height: 92vh; overflow-y: auto; scrollbar-gutter: stable; padding: 16px 18px 12px; color: #e5e7eb; background: rgba(11,16,26,.96); border: 1px solid rgba(199,154,78,.5); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.7); }
	.deckmodal .lvtag { font-style: normal; font-family: system-ui, sans-serif; font-size: .62rem; font-weight: 800; letter-spacing: .04em; color: #f0dcae; background: rgba(199,154,78,.2); border: 1px solid rgba(199,154,78,.45); border-radius: 6px; padding: 1px 7px; margin-left: 9px; vertical-align: middle; }
	.deckmodal .mav { overflow: visible; border-color: rgba(199,154,78,.6); display: grid; place-items: center; }
	.deckmodal .mav img { width: 76%; height: 76%; object-fit: contain; border-radius: 0; }
	.dklabel { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: #93a3b8; display: flex; align-items: center; gap: 6px; margin: 12px 0 7px; flex-wrap: wrap; }
	.dklabel .ct { color: #f1f5f9; background: rgba(255,255,255,.08); border-radius: 5px; padding: 0 6px; text-transform: none; letter-spacing: normal; }
	.zhint { text-transform: none; letter-spacing: normal; font-weight: 600; color: #6b7a8d; font-size: .62rem; }
	.zgrow { display: inline-flex; gap: 5px; margin-left: auto; }
	.growchip { display: inline-flex; align-items: center; gap: 2px; font-size: .64rem; font-weight: 800; color: #ffcfa3; background: rgba(239,125,34,.16); border: 1px solid rgba(239,125,34,.4); border-radius: 6px; padding: 1px 5px; text-transform: none; }
	.growchip img { height: .74rem; filter: brightness(0) invert(1); }
	.dkhand { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; border-radius: 12px; background: rgba(239,125,34,.08); border: 1px solid rgba(239,125,34,.25); min-height: 40px; align-items: center; }
	.dkgrid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
	.dkcard { position: relative; width: 100%; padding: 0; background: none; border: none; cursor: pointer; border-radius: 6px; overflow: hidden; box-shadow: 0 3px 8px rgba(0,0,0,.5); transition: transform .12s; }
	.dkhand .dkcard { width: 72px; }
	.dkcard.sm { width: 58px; }
	.dkcard:hover { transform: translateY(-4px); z-index: 2; }
	.dkcard :global(canvas) { display: block; width: 100%; border-radius: 6px; }
	.dkcard.sel { outline: 3px solid #efb46a; box-shadow: 0 0 0 3px rgba(239,180,106,.4), 0 6px 16px rgba(0,0,0,.6); }
	.dkcard.empty { cursor: default; box-shadow: none; aspect-ratio: 1192 / 1664; border: 1px dashed rgba(255,255,255,.1); background: rgba(255,255,255,.02); }
	.dkcard.empty:hover { transform: none; }
	.dkcard.basic { cursor: default; }
	.dkcard.basic:hover { transform: none; }
	.dklock { position: absolute; top: 3px; right: 4px; font-size: .7rem; filter: drop-shadow(0 1px 2px #000); }
	.dkpart { width: 1px; align-self: stretch; margin: 2px 4px; background: linear-gradient(180deg, transparent, rgba(199,154,78,.6), transparent); }
	.dkpart.tall { margin: 2px 8px; background: linear-gradient(180deg, transparent, rgba(165,110,230,.7), transparent); width: 2px; }
	/* ultimate slot in the deck view: never in hand, locked until level 8 */
	.ultslot { display: flex; flex-direction: column; align-items: center; gap: 5px; }
	.dkcard.ult { width: 72px; box-shadow: 0 0 0 2px rgba(165,110,230,.7), 0 6px 16px rgba(0,0,0,.55); cursor: zoom-in; }
	.dkcard.ult.locked { filter: grayscale(.85) brightness(.5); }
	.dkcard.ult.locked:hover { transform: none; }
	.ultlock { position: absolute; inset: 0; display: grid; place-items: center; font-size: .6rem; font-weight: 800; letter-spacing: .04em; color: #e9dcff; background: rgba(20,10,35,.5); }
	.ultslot.on .dkcard.ult { box-shadow: 0 0 0 2px #b482f0, 0 0 16px rgba(165,110,230,.75), 0 6px 16px rgba(0,0,0,.55); }
	.ultbtn { background: linear-gradient(180deg, rgba(165,110,230,.3), rgba(165,110,230,.16)); border-color: rgba(180,130,240,.6); color: #efe0ff; }
	/* grid card status: available = bright, placed elsewhere = tinted + dim */
	.dkgrid .dkcard.zdeck { filter: grayscale(.5) brightness(.66); }
	.dkgrid .dkcard.zhand { outline: 2px solid #ef7d22; }
	.dkgrid .dkcard.zupg { outline: 2px solid #3f7fe0; filter: brightness(.8); }
	.dkgrid .dkcard.zrem { outline: 2px solid rgba(150,160,175,.6); filter: grayscale(.85) brightness(.55); }
	.dkbadge { position: absolute; left: 3px; bottom: 3px; right: 3px; font-size: .54rem; font-weight: 800; letter-spacing: .02em; text-align: center; padding: 2px 0; border-radius: 5px; }
	.dkbadge.hand { background: rgba(239,125,34,.92); color: #1a0f06; }
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

	/* synced pre-reveal countdown — big number, doesn't block the hand/take-back */
	.countdown { position: fixed; inset: 0; z-index: 57; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; pointer-events: none; }
	.cd-num { font-family: 'Modesto Poster', serif; font-size: 9rem; line-height: .9; color: #f6ead2;
		text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 46px rgba(239,180,106,.55); animation: cdpop .9s ease forwards; }
	@keyframes cdpop { 0% { opacity: 0; transform: scale(1.5); } 22% { opacity: 1; transform: scale(1); } 100% { opacity: .5; transform: scale(.9); } }
	.countdown::before { content: ''; position: absolute; left: 50%; top: 50%; width: 560px; height: 420px; transform: translate(-50%, -50%); z-index: -1;
		background: radial-gradient(closest-side, rgba(4,6,12,.62), rgba(4,6,12,0)); pointer-events: none; }
	.cd-num.go { font-size: 5.5rem; color: #ffe2a8; text-shadow: 0 4px 24px rgba(0,0,0,.85), 0 0 50px rgba(255,190,90,.7); }
	.cd-sub { font-size: .85rem; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; color: #f0dcae; padding: 4px 14px; border-radius: 999px; background: rgba(6,9,16,.72); text-shadow: 0 2px 8px rgba(0,0,0,.8); }
	.phasetag.counting { color: #ffcf9b; }

	/* dramatic reveal curtain */
	/* round-start banner */
	.roundbanner { position: fixed; inset: 0; z-index: 58; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; pointer-events: none; animation: rbfade 3.2s ease forwards; }
	.roundbanner .rb-sub { font-family: 'Modesto Poster', serif; font-size: 1.6rem; letter-spacing: .3em; text-transform: uppercase; color: #cbb488; text-shadow: 0 2px 10px rgba(0,0,0,.8); }
	.roundbanner .rb-num { font-family: 'Modesto Poster', serif; font-size: 7rem; line-height: .9; color: #f6ead2; text-shadow: 0 4px 20px rgba(0,0,0,.85), 0 0 40px rgba(199,154,78,.5); }
	@keyframes rbfade { 0% { opacity: 0; transform: scale(.8); } 12% { opacity: 1; transform: scale(1); } 82% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.05); } }

	.curtain { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; cursor: pointer;
		background: radial-gradient(120% 90% at 50% 40%, rgba(20,14,6,.86), rgba(3,5,10,.96)); backdrop-filter: blur(6px); animation: curtainIn .35s ease; }
	@keyframes curtainIn { from { opacity: 0; } to { opacity: 1; } }
	.curtain-inner { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; max-width: 94vw; }
	.curtain-title { font-family: 'Modesto Poster', serif; font-size: 2.4rem; letter-spacing: .06em; color: #f6ead2; text-shadow: 0 2px 12px rgba(0,0,0,.7), 0 0 22px rgba(199,154,78,.4); }
	.curtain-cards { display: flex; flex-wrap: nowrap; justify-content: center; gap: 22px; }
	.cc { display: flex; flex-direction: column; align-items: center; gap: 8px; perspective: 1300px; }
	.cc-flip { width: min(320px, 46vh, calc((100vw - 140px) / var(--n, 4) - 22px)); aspect-ratio: 1192 / 1664; position: relative; transform-style: preserve-3d; transition: transform .7s cubic-bezier(.34,.08,.2,1); }
	.cc-face { box-shadow: 0 12px 30px rgba(0,0,0,.6); }
	.cc-flip.up { transform: rotateY(180deg) scale(1.04); }
	.cc-flip.skip { display: grid; place-items: center; border: 1.5px dashed rgba(255,255,255,.2); border-radius: 5%; color: #6b7a8d; font-size: 2rem; }
	.cc-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 5%; overflow: hidden; }
	.cc-face.cc-front { transform: rotateY(180deg); box-shadow: 0 0 0 2px var(--tint); }
	.cc-face.cc-front :global(canvas) { display: block; width: 100%; border-radius: 5%; }
	.cc-back { display: flex; flex-direction: column; box-shadow: 0 0 0 2px var(--tint);
		background: repeating-linear-gradient(135deg, rgba(90,70,40,.04) 0 1px, transparent 1px 5px), radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); }
	.cc-back .band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.cc-back .band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.cc-back .band.top::after { bottom: 0; } .cc-back .band.bot::after { top: 0; }
	.cc-back .emblem { flex: 1; display: grid; place-items: center; padding: 12%; }
	.cc-back .emblem img { width: 76%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,.4)); }
	.cc-name { display: flex; align-items: center; gap: 8px; font-family: 'Modesto Poster', serif; font-size: 1.15rem; color: #eef2f8; }
	.cc-name img { width: 1.9rem; height: 1.9rem; border-radius: 50%; object-fit: cover; border: 2px solid var(--tint); }
	.curtain-hint { font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; color: #8b7a52; }

	/* examine */
	.scrim2 { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(2,4,9,.8); backdrop-filter: blur(4px); }
	.bigcard { width: min(360px, 62vw); filter: drop-shadow(0 20px 50px rgba(0,0,0,.7)); }
	.bigcard :global(canvas) { border-radius: 4%; }

	/* centered preview of a picked hand card */
	.pvscrim { position: fixed; inset: 0; z-index: 30; background: rgba(3,6,12,.55); backdrop-filter: blur(3px); }
	.pvwrap { position: fixed; inset: 0 0 96px 0; z-index: 31; display: flex; align-items: center; justify-content: center; pointer-events: none; }
	.pvcard { width: min(320px, 56vw); border-radius: 5%; pointer-events: auto; perspective: 1400px; }
	.pvflip { position: relative; width: 100%; aspect-ratio: 1192 / 1664; transform-style: preserve-3d; transition: transform .46s cubic-bezier(.4,.15,.2,1); }
	.pvflip.up { transform: rotateY(180deg); }
	.pvface { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 3%; overflow: hidden; }
	.pvface.front :global(canvas) { display: block; width: 100%; border-radius: 3%; }
	.pvcard { box-shadow: 0 0 0 3px var(--glow), 0 0 44px var(--glow), 0 24px 60px rgba(0,0,0,.7); }
	.pvface.back { transform: rotateY(180deg); display: flex; flex-direction: column; background: radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); box-shadow: inset 0 0 0 1px rgba(120,95,55,.4); }
	.pvface.back .band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.pvface.back .band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.pvface.back .band.top::after { bottom: 0; } .pvface.back .band.bot::after { top: 0; }
	.pvface.back .emblem { flex: 1; display: grid; place-items: center; padding: 12%; }
	.pvface.back .emblem img { width: 60%; border-radius: 50%; opacity: .85; }
	.pvface.back .emblem.sym img { width: 74%; border-radius: 0; opacity: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }
	.pvbar { position: fixed; left: 224px; right: 260px; bottom: 74px; z-index: 32; pointer-events: none; display: flex; gap: 8px; justify-content: center; }
	.pvbar .act { pointer-events: auto; }

	/* bottom dashboard */
	.dash { position: absolute; left: 224px; right: 260px; bottom: 12px; z-index: 11; display: grid; grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr); align-items: center; gap: 14px; padding: 6px 14px; border-radius: 13px; color: #e5e7eb; backdrop-filter: blur(9px);
		background: linear-gradient(90deg, rgb(var(--tcr) / .2), rgba(9,13,22,.84) 26%, rgba(9,13,22,.84) 74%, rgb(var(--tcr) / .16)); border: 1px solid rgb(var(--tcr) / .55); box-shadow: 0 12px 34px rgba(0,0,0,.5), inset 0 1px 0 rgb(var(--tcl) / .14); }
	.dleft { display: flex; align-items: center; gap: 12px; }
	/* docked hand: the centre slides left once, and the hand gets all the room on the right */
	.dash.docked { grid-template-columns: max-content auto minmax(max-content, 1fr); }
	.dleft .tokwrap { margin-left: auto; }
	.dright { display: flex; align-items: center; gap: 12px; }
	.dact { flex: none; width: 132px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
	.dact .act { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding-left: 10px; padding-right: 10px; }
	.act.takeback { padding: 7px 14px; font-size: .86rem; color: #fff; background: linear-gradient(180deg, #e0463c, #a82620); border-color: rgba(255,170,160,.7); box-shadow: 0 3px 0 #6e1812, 0 0 12px rgba(239,68,68,.45); }
	.act.takeback:hover { filter: brightness(1.1); }
	/* level-8 aura on your own dash — present but not blinding */
	.dash.ultdash { border-color: rgba(165,110,230,.6); box-shadow: 0 12px 34px rgba(0,0,0,.5), 0 0 22px rgba(165,110,230,.28); animation: ultpulse 3.4s ease-in-out infinite; }
	@keyframes ultpulse { 0%, 100% { box-shadow: 0 12px 34px rgba(0,0,0,.5), 0 0 18px rgba(165,110,230,.22); } 50% { box-shadow: 0 12px 34px rgba(0,0,0,.5), 0 0 30px rgba(165,110,230,.42); } }
	/* single-row profile: avatar · name/hero · stats (to cut dashboard height) */
	.dself { display: flex; align-items: center; gap: 9px; background: none; border: none; cursor: pointer; color: inherit; text-align: left; flex: none; }
	.dself:hover .dsname { color: #fff; }
	/* your hero token: team disc + hero symbol + your colour as the ring (matches the board piece) */
	.dsmid { width: 10rem; display: flex; flex-direction: column; gap: 1px; line-height: 1.02; }
	.dsname { font-family: 'Modesto Poster', serif; font-size: .92rem; color: #f6ead2; display: flex; align-items: baseline; gap: 5px; min-width: 0; }
	.dsnm { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dsname em { flex: none; min-width: 2.3em; font-variant-numeric: tabular-nums; font-style: normal; font-size: .56rem; font-weight: 700; color: #9aa8bc; }
	/* initiative: pinned to the right edge at a fixed width ('–' and '12' take the same room) */
	.dsname .initb { align-self: center; padding: 1px 5px 1px 4px; }
	.dsname .initb b { font-size: .82rem; min-width: 1.15em; text-align: center; }
	.dshero { font-size: .58rem; color: #93a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	/* poison / bounty badges on the portrait's lower corners */
	.icmk { position: absolute; z-index: 2; bottom: -5px; width: .95rem; height: .95rem; border-radius: 50%; display: grid; place-items: center; background: #0b101a; }
	.icmk img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
	.icmk.pois { left: -5px; box-shadow: 0 0 0 1.5px rgba(65,174,89,.85); }
	.icmk.bnty { right: -5px; box-shadow: 0 0 0 1.5px rgba(232,182,74,.9); }
	.dstats { display: grid; grid-template-columns: repeat(6, 1.7rem); gap: 3px; }

	/* hand floats above the dashboard, with a clear gap */
	/* --cw = hand card width; scales with the viewport so the fan still fits on a tablet */
	.tray { --cw: clamp(104px, 10.5vw, 150px); position: absolute; left: 224px; right: 260px; bottom: 118px; z-index: 10; display: flex; align-items: flex-end; justify-content: center; pointer-events: none;
		clip-path: inset(-800px -800px -60px -800px);
		transition: transform .3s cubic-bezier(.3,.7,.2,1), clip-path .3s cubic-bezier(.3,.7,.2,1); }
	/* auto-hide: sink the hand behind the dash (z 11) so only ~30px of card tips peek
	   out; the clip keeps the sunk part from showing in the gap under the dash */
	.tray.retracted { transform: translateY(calc(var(--cw) * 1.396 + 6px)); clip-path: inset(-800px -800px calc(var(--cw) * 1.396 - 100px) -800px); }
	.hc { width: var(--cw); margin: 0 calc(var(--cw) * -0.11); padding: 0; background: none; border: none; cursor: pointer; pointer-events: auto; transform-origin: bottom center; transform: translateY(var(--y)) rotate(var(--rot)); transition: transform .16s; }
	.hc :global(canvas) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 8px 18px rgba(0,0,0,.55); }
	/* hovered / tapped card straightens and magnifies so its text is readable */
	.hc:hover { transform: translateY(calc(var(--y) - 36px)) rotate(0deg) scale(1.45); z-index: 5; }
	.hc:hover :global(canvas) { box-shadow: 0 14px 34px rgba(0,0,0,.7); }
	.tray.retracted .hc:hover { transform: translateY(var(--y)) rotate(var(--rot)); } /* the whole hand rises first */
	/* spread layout: side by side, no overlap; shrink evenly if the hand is wide */
	.tray.spread .hc { flex: 0 1 var(--cw); width: auto; min-width: 0; margin: 0 4px; }

	/* hand display toggles on the dash */
	.handopts { flex: none; display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; gap: 4px; }
	.hopt.dock { grid-column: 2; grid-row: 1 / 3; height: auto; }
	.hopt.dock svg { width: 1.3rem; height: 1.3rem; }
	.hopt:disabled { opacity: .35; cursor: not-allowed; }
	/* docked: the two float-only options step aside to give the docked hand room */
	.dash.docked .hopt:not(.dock) { display: none; }
	.dash.docked .handopts { grid-template-columns: auto; }
	.dash.docked .hopt.dock { grid-column: 1; }
	.hopt { width: 1.95rem; height: 1.6rem; display: grid; place-items: center; padding: 0; border-radius: 7px; cursor: pointer; color: #b9a67c;
		background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); transition: background .12s, color .12s; }
	.hopt svg { width: 1.15rem; height: 1.15rem; }
	.hopt:hover { background: rgba(199,154,78,.18); color: #f0dcae; }
	.hopt.on { background: rgba(199,154,78,.26); border-color: rgba(199,154,78,.6); color: #f6ead2; }
	.waithost { max-width: 5.6rem; font-size: .72rem; line-height: 1.15; text-align: center; font-weight: 700; letter-spacing: .02em; color: #b8a06a; font-style: italic; }
	/* persistent ultimate access on the dash (once unlocked) */
	.ultmini { position: relative; width: 40px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 5px; overflow: visible; flex: none;
		box-shadow: 0 0 0 2px #b482f0, 0 0 12px rgba(165,110,230,.6), 0 3px 8px rgba(0,0,0,.55); transition: transform .12s; }
	.ultmini :global(canvas) { display: block; width: 100%; border-radius: 5px; }
	.ultmini:hover { transform: translateY(-3px); }
	.ultmini.locked { aspect-ratio: 1192 / 1664; display: grid; place-items: center; cursor: default; box-shadow: none; border: 1px dashed rgba(180,130,240,.28);
		font-size: .5rem; font-weight: 900; letter-spacing: .08em; color: rgba(200,170,240,.3); }
	.ultmini.locked:hover { transform: none; }
	.ultmini-tag { position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); font-size: .5rem; font-weight: 900; letter-spacing: .08em; color: #efe0ff;
		background: linear-gradient(180deg, #7a49c4, #5a2f9c); border: 1px solid rgba(180,130,240,.7); border-radius: 5px; padding: 0 5px; }
	/* face-down deck stack on the dash (opens the deck view) */
	.deckstack { position: relative; width: 40px; height: 54px; background: none; border: none; padding: 0; cursor: pointer; flex: none; }
	.deckstack:hover .ds1 { transform: translateY(-3px); }
	.ds-card { position: absolute; inset: 0; border-radius: 5px; box-shadow: 0 3px 8px rgba(0,0,0,.55);
		background: repeating-linear-gradient(135deg, rgba(90,70,40,.05) 0 1px, transparent 1px 5px), radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%);
		border: 1px solid rgba(120,95,55,.5); }
	.ds3 { transform: translate(5px, 5px); opacity: .7; }
	.ds2 { transform: translate(2.5px, 2.5px); opacity: .85; }
	.ds1 { display: grid; place-items: center; transition: transform .14s; }
	.ds1 img { width: 68%; max-height: 74%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
	.ds-count { position: absolute; bottom: -5px; right: -6px; z-index: 2; min-width: 1.05rem; height: 1.05rem; padding: 0 4px; border-radius: 999px;
		display: grid; place-items: center; background: linear-gradient(#2b3444, #171d27); border: 1px solid rgba(199,154,78,.6); color: #f0dcae;
		font-size: .6rem; font-weight: 900; font-variant-numeric: tabular-nums; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.act { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; border-radius: 8px; padding: 6px 14px; font-weight: 700; cursor: pointer; font-size: .82rem; }
	.act.sm { padding: 4px 10px; font-size: .76rem; }
	.act.primary { background: #ef7d22; color: #1a0f06; border-color: transparent; box-shadow: 0 3px 0 #a8560f; }
	.act.danger { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.act.ghost { background: transparent; }

	/* coin control (your dash) */
	.coinctl { flex: none; display: flex; align-items: center; gap: 4px; padding: 3px 5px; border-radius: 9px; background: rgba(199,154,78,.12); border: 1px solid rgba(199,154,78,.35); }
	.cbtn { width: 1.15rem; height: 1.15rem; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; font-weight: 800; cursor: pointer; line-height: 1; padding: 0; }
	.cbtn:hover { background: rgba(255,255,255,.16); }

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
		color: #0b1220; font-family: system-ui, sans-serif; font-size: .78rem; font-weight: 900; line-height: 1; }
	.tokdrawer { position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 14; width: 232px; padding: 9px; border-radius: 12px;
		background: rgba(11,16,26,.96); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 16px 40px rgba(0,0,0,.6); }
	.toklbl { font-size: .56rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 800; color: #b8a06a; margin: 2px 2px 5px; }
	.toklbl + .tokgrid { margin-bottom: 8px; }
	.tokgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
	.tok { padding: 4px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); display: grid; place-items: center; }
	.tok:hover { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.5); }
	.tok img { width: 100%; aspect-ratio: 1; object-fit: contain; }
	.tok.emblem { background: rgba(199,154,78,.16); border-color: rgba(199,154,78,.45); }
	.tok.comp { position: relative; grid-column: span 2; display: flex; align-items: center; gap: 6px; padding: 5px 8px; }
	.tok.comp img, .tok.comp .ltrdisc { width: 1.5rem; height: 1.5rem; aspect-ratio: auto; }
	.tok.comp .toktag { font-size: .64rem; font-weight: 800; letter-spacing: .02em; color: #f0dcae; }
	.tok.marker img { border-radius: 50%; }
	.tokfoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
	.tokhint { font-size: .58rem; color: #8b9bb0; }

	.dmine { display: flex; align-items: center; justify-content: center; }
	.dm-slot { cursor: pointer; }
	.dm-slot:hover .roman { color: rgba(255,255,255,.16); }
	.dm-slot .roman.trash { padding: 9px 7px 9px 11px; }
	.dm-slot .roman.trash :global(svg) { width: 100%; height: 100%; }
	/* docked hand: small separate cards inside the dash, at the far right */
	.dockhand { flex: 1 1 0; width: 0; display: flex; justify-content: flex-end; gap: 4px; overflow: hidden; padding-top: 4px; }
	.dkh { flex: 0 1 34px; min-width: 0; padding: 0; background: none; border: none; cursor: pointer; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.55); transition: transform .12s; }
	.dkh :global(canvas) { display: block; width: 100%; }
	.dkh:hover { transform: translateY(-3px); }
	.dm-turns { display: flex; gap: 5px; align-items: center; }
	/* each slot: a faint Roman numeral behind, the card (if any) on top */
	.dm-slot { position: relative; width: 42px; height: 56px; display: grid; place-items: center; }
	.dm-slot.disc { width: 50px; margin-left: 6px; padding-left: 8px; border-left: 1px solid rgba(255,255,255,.12); }
	.dm-slot .roman { position: absolute; inset: 0; display: grid; place-items: center; font-family: 'Modesto Poster', serif; font-size: 1.6rem; color: rgba(255,255,255,.09); pointer-events: none; }
	.dm-on { position: relative; z-index: 1; width: 100%; }
	/* face-up discard stack (mirrors the deck stack, but cards show face-up) + count */
	.discstack { position: relative; z-index: 1; width: 38px; height: 50px; padding: 0; background: none; border: none; cursor: pointer; }
	.discstack:hover .disc-card { filter: brightness(1.06); }
	.disc-card { position: absolute; left: 50%; top: 0; width: 38px; margin-left: -19px; border-radius: 4px; overflow: hidden;
		box-shadow: 0 2px 5px rgba(0,0,0,.6); transform: translate(calc(var(--i) * 2.5px), calc(var(--i) * 2.5px)); z-index: var(--i); }
	.disc-card :global(canvas) { display: block; width: 100%; border-radius: 4px; }

	/* ── responsive dash ─────────────────────────────────────────────────────
	   The full dash needs ~1080px. Below a 1584px viewport (dash < 1100px) it
	   goes compact: stats tuck under your name, Tokens goes icon-only, turn slots
	   shrink. At tablet widths (≤1320px) it also runs under a shortened player
	   panel so it has room. Height stays one row (~70px) — the hand's auto-hide
	   depth assumes it. */
	@media (max-width: 1584px) {
		.dash { gap: 10px; padding: 6px 10px; }
		.dleft, .dright { gap: 8px; }
		.dself { display: grid; grid-template-columns: auto auto; column-gap: 8px; row-gap: 3px; align-items: center; }
		.dself :global(.picon) { grid-row: 1 / 3; }
		.dsmid { width: 0; min-width: 100%; }
		.dshero { display: none; }
		.dstats { grid-column: 2; grid-template-columns: repeat(6, 1.45rem); }
		.tokbtn { padding: 5px 7px; }
		.dm-turns { gap: 3px; }
		.dm-slot { width: 32px; height: 46px; }
		.dm-slot .roman { font-size: 1.2rem; }
		.dm-slot.disc { width: 40px; margin-left: 3px; padding-left: 6px; }
		.discstack { width: 30px; height: 42px; }
		.disc-card { width: 30px; margin-left: -15px; }
	}
	@media (max-width: 1320px) {
		.dash { right: 12px; }
		.ppanel.withdash { bottom: 94px; }
		.dash { padding: 6px 8px; gap: 8px; }
		.dleft, .dright { gap: 6px; }
		.dact { width: 104px; }
		.act.takeback { padding: 5px 8px; font-size: .76rem; }
		.dstats { grid-template-columns: repeat(6, 1.3rem); }
		.deckstack, .ultmini { width: 34px; }
		.deckstack { height: 47px; }
		.hopt { width: 1.75rem; }
		.dkh { flex-basis: 28px; min-width: 18px; }
		.coinctl { padding: 2px 3px; gap: 2px; }
	}
</style>
